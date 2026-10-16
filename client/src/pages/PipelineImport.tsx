import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/vsa/AppShell";
import { Chip, EmptyState, KpiCard, Pill, SectionBar } from "@/components/vsa/elements";
import { trpc } from "@/lib/trpc";
import type { FieldValue, ImportPlan, RowReport } from "@shared/sharepointImport";
import { MAX_IMPORT_CSV_BYTES } from "@shared/sharepointImport";
import { FileUp, Loader2, SearchX, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Filter = "all" | "changes" | "conflicts" | "flags" | "skipped";

const ACTION_LABEL: Record<RowReport["action"], string> = { create: "New", update: "Updated", unchanged: "Unchanged", skip: "Skipped" };
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "changes", label: "Changes" },
  { value: "conflicts", label: "Conflicts" },
  { value: "flags", label: "Flags" },
  { value: "skipped", label: "Skipped" },
];

const show = (value: FieldValue) => (value === null || value === "" ? "—" : String(value));

/** Daily import of the SharePoint VSA Pipeline List CSV: preview the reconciliation report, then apply it. */
export default function PipelineImport() {
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [applied, setApplied] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const utils = trpc.useUtils();

  const preview = trpc.pipelineImport.preview.useMutation({ onSuccess: result => { setPlan(result); setApplied(false); }, onError: error => toast.error(error.message) });
  const apply = trpc.pipelineImport.commit.useMutation({
    onSuccess: async result => {
      setPlan(result);
      setApplied(true);
      toast.success(`Import applied: ${result.summary.created} created, ${result.summary.updated} updated`);
      await utils.engagement.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) return void toast.error("Choose the CSV exported from the SharePoint VSA Pipeline List.");
    if (file.size > MAX_IMPORT_CSV_BYTES) return void toast.error("That file is larger than 5 MB. Export the Pipeline List view only.");
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    setPlan(null);
    setApplied(false);
    preview.mutate({ csv: text });
  }

  const rows = useMemo(() => {
    if (!plan) return [];
    switch (filter) {
      case "changes":
        return plan.rows.filter(row => row.action === "create" || row.action === "update");
      case "conflicts":
        return plan.rows.filter(row => row.conflicts.length);
      case "flags":
        return plan.rows.filter(row => row.flags.length);
      case "skipped":
        return plan.rows.filter(row => row.action === "skip");
      default:
        return plan.rows;
    }
  }, [plan, filter]);

  const blocked = Boolean(plan && !plan.rows.length);
  const busy = preview.isPending || apply.isPending;

  return (
    <AppShell>
      <main className="mx-auto max-w-7xl space-y-5 px-5 py-6">
        <SectionBar label="Import" title="SharePoint VSA Pipeline List" />
        <section className="rounded-xl border border-s100 bg-white p-5 shadow-[var(--shadow-card)]">
          <p className="max-w-3xl text-sm leading-6 text-ink-muted">
            In SharePoint, open the VSA Pipeline List, choose Export to CSV, and select the file here. You see what would change before anything is written. Changes made in SharePoint come in; changes made here are never overwritten; a field changed in both places is listed as a conflict and keeps the value from here. Records are never deleted.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="btn-pill-ghost inline-flex h-9 cursor-pointer items-center gap-2 px-4 text-sm">
              <FileUp className="size-4" /> {fileName ? "Choose a different file" : "Choose CSV"}
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={event => void chooseFile(event.target.files?.[0])} disabled={busy} />
            </label>
            {fileName && <span className="text-sm text-ink">{fileName}</span>}
            {preview.isPending && <span className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Checking the file…</span>}
          </div>
        </section>

        <div id="importReport" data-tile-mount data-state={plan ? "ready" : "empty"} className="space-y-5">
        {!plan && !preview.isPending && <EmptyState icon={FileUp} title="No file checked yet" sub="Choose the Pipeline List CSV export to see the reconciliation report. Nothing is written until you apply it." />}
        {plan && (
          <>
            {plan.fileProblems.length > 0 && (
              <section className="space-y-1">
                {plan.fileProblems.map(problem => <p key={problem} className="callout-red">{problem}</p>)}
              </section>
            )}

            <section className="kpi-grid">
              {([
                ["Rows", plan.summary.rows],
                ["New", plan.summary.created],
                ["Updated", plan.summary.updated],
                ["Unchanged", plan.summary.unchanged],
                ["Skipped", plan.summary.skipped],
                ["Conflicts", plan.summary.conflicts],
                ["Flagged rows", plan.summary.flagged],
                ["Not in file", plan.summary.missing],
              ] as const).map(([label, value]) => (
                <KpiCard key={label} label={label} value={value} sub={IMPORT_KPI_BASIS[label]} />
              ))}
            </section>

            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-s100 bg-white p-4">
              {applied ? (
                <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Pill verdict="go">Applied</Pill> The report below shows what was written.</p>
              ) : (
                <p className="text-sm text-ink-muted">Preview only. Nothing has been written yet.</p>
              )}
              {!applied && (
                <Button disabled={busy || blocked} onClick={() => apply.mutate({ csv })}>
                  {apply.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Apply import
                </Button>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter rows">
                {FILTERS.map(option => <Chip key={option.value} pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label} ({countFor(plan, option.value)})</Chip>)}
              </div>
              {rows.length === 0 ? (
                <EmptyState icon={SearchX} title="No rows in this filter" sub="Choose another filter to see the rest of the report." />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-s100 bg-white">
                  <table className="tbl">
                    <thead><tr><th className="num w-14">Row</th><th>Customer</th><th className="w-28">Result</th><th>Details</th></tr></thead>
                    <tbody>
                      {rows.map(row => (
                        <tr key={row.rowNumber}>
                          <td className="num text-ink-muted">{row.rowNumber}</td>
                          <td>
                            <p className="font-semibold text-ink">{row.customerName || "—"}</p>
                            <p className="text-xs text-ink-muted">{row.opportunityNumber ?? "No opportunity number"}{row.recordId ? ` · record #${row.recordId}` : ""}</p>
                          </td>
                          <td><Chip>{ACTION_LABEL[row.action]}</Chip></td>
                          <td className="space-y-1 text-xs leading-5">
                            {row.skipReason && <p><Pill verdict="warn">Skipped</Pill> {row.skipReason}</p>}
                            {row.action === "update" && row.changes.map(change => <p key={change.field}><span className="font-semibold">{change.field}</span>: {show(change.from)} → {show(change.to)}</p>)}
                            {row.action === "create" && <p className="text-ink-muted">{row.changes.length} fields from SharePoint</p>}
                            {row.conflicts.map(conflict => <p key={conflict.field}><Pill verdict="remediate">Conflict</Pill> <span className="font-semibold">{conflict.field}</span> changed in both places: kept {show(conflict.app)}, SharePoint has {show(conflict.sharepoint)}</p>)}
                            {row.flags.map(flag => <p key={flag} className="text-ink-muted">{flag}</p>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {plan.missing.length > 0 && (
              <section className="rounded-xl border border-s100 bg-white p-4">
                <h3 className="text-sm font-bold text-ink">Not in this file ({plan.missing.length})</h3>
                <p className="mt-1 text-xs text-ink-muted">Imported before but missing from this export. They are kept as they are.</p>
                <ul className="mt-2 space-y-1 text-sm text-ink">{plan.missing.map(record => <li key={record.id}>#{record.id} {record.customerName} {record.opportunityNumber ? `· ${record.opportunityNumber}` : ""}</li>)}</ul>
              </section>
            )}
          </>
        )}
        </div>
      </main>
    </AppShell>
  );
}

const IMPORT_KPI_BASIS: Record<string, string> = {
  Rows: "Data rows in the file",
  New: "Rows that become new engagements",
  Updated: "Rows that change an existing engagement",
  Unchanged: "Rows that match and change nothing",
  Skipped: "Duplicates, ambiguous matches, and non-VSA rows",
  Conflicts: "Fields changed in both SharePoint and the app",
  "Flagged rows": "Rows with a data-quality note",
  "Not in file": "Imported before, missing from this export",
};

function countFor(plan: ImportPlan, filter: Filter) {
  switch (filter) {
    case "changes":
      return plan.summary.created + plan.summary.updated;
    case "conflicts":
      return plan.rows.filter(row => row.conflicts.length).length;
    case "flags":
      return plan.summary.flagged;
    case "skipped":
      return plan.summary.skipped;
    default:
      return plan.rows.length;
  }
}
