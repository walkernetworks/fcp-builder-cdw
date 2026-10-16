import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import type { FieldValue, ImportPlan, RowReport } from "@shared/sharepointImport";
import { MAX_IMPORT_CSV_BYTES } from "@shared/sharepointImport";
import { ArrowLeft, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type Filter = "all" | "changes" | "conflicts" | "flags" | "skipped";

const ACTION_STYLE: Record<RowReport["action"], string> = {
  create: "border-emerald-300 bg-emerald-50 text-emerald-800",
  update: "border-sky-300 bg-sky-50 text-sky-800",
  unchanged: "border-slate-200 bg-slate-50 text-slate-500",
  skip: "border-amber-300 bg-amber-50 text-amber-800",
};

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
    <main className="min-h-screen bg-slate-50">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-[#c8102e] px-2.5 py-1 text-sm font-black tracking-[-0.08em] text-white">CDW</div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">VSA tracker</p>
            <h1 className="text-base font-semibold text-slate-950">Import SharePoint Pipeline List</h1>
          </div>
        </div>
        <Button asChild variant="outline" size="sm"><Link href="/"><ArrowLeft className="size-4" /> Back to engagements</Link></Button>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-5 py-6">
        <section className="border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Daily import</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            In SharePoint, open the VSA Pipeline List, choose Export to CSV, and select the file here. You see what would change before anything is written. Changes made in SharePoint come in; changes made here are never overwritten; a field changed in both places is listed as a conflict and keeps the value from here. Records are never deleted.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
              <FileUp className="size-4" /> {fileName ? "Choose a different file" : "Choose CSV"}
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={event => void chooseFile(event.target.files?.[0])} disabled={busy} />
            </label>
            {fileName && <span className="text-sm text-slate-600">{fileName}</span>}
            {preview.isPending && <span className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Checking the file…</span>}
          </div>
        </section>

        {plan && (
          <>
            {plan.fileProblems.length > 0 && (
              <section className="border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                {plan.fileProblems.map(problem => <p key={problem}>{problem}</p>)}
              </section>
            )}

            <section className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
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
                <div key={label} className="border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
                </div>
              ))}
            </section>

            <section className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white p-4">
              {applied ? (
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-800"><CheckCircle2 className="size-4" /> Applied. The report below shows what was written.</p>
              ) : (
                <p className="text-sm text-slate-600">Preview only. Nothing has been written yet.</p>
              )}
              {!applied && (
                <Button className="bg-[#c8102e] hover:bg-[#a80d27]" disabled={busy || blocked} onClick={() => apply.mutate({ csv })}>
                  {apply.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Apply import
                </Button>
              )}
            </section>

            <section className="border border-slate-200 bg-white">
              <Tabs value={filter} onValueChange={value => setFilter(value as Filter)} className="border-b border-slate-200 p-2">
                <TabsList>
                  <TabsTrigger value="all">All ({plan.rows.length})</TabsTrigger>
                  <TabsTrigger value="changes">Changes ({plan.summary.created + plan.summary.updated})</TabsTrigger>
                  <TabsTrigger value="conflicts">Conflicts ({plan.rows.filter(row => row.conflicts.length).length})</TabsTrigger>
                  <TabsTrigger value="flags">Flags ({plan.summary.flagged})</TabsTrigger>
                  <TabsTrigger value="skipped">Skipped ({plan.summary.skipped})</TabsTrigger>
                </TabsList>
              </Tabs>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Row</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="w-28">Result</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(row => (
                    <TableRow key={row.rowNumber} className="align-top">
                      <TableCell className="tabular-nums text-slate-500">{row.rowNumber}</TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-950">{row.customerName || "—"}</p>
                        <p className="text-xs text-slate-500">{row.opportunityNumber ?? "No opportunity number"}{row.recordId ? ` · record #${row.recordId}` : ""}</p>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={ACTION_STYLE[row.action]}>{row.action}</Badge></TableCell>
                      <TableCell className="space-y-1 whitespace-normal text-xs leading-5">
                        {row.skipReason && <p className="text-amber-800">{row.skipReason}</p>}
                        {row.action === "update" && row.changes.map(change => <p key={change.field}><span className="font-medium">{change.field}</span>: {show(change.from)} → {show(change.to)}</p>)}
                        {row.action === "create" && <p className="text-slate-600">{row.changes.length} fields from SharePoint</p>}
                        {row.conflicts.map(conflict => <p key={conflict.field} className="text-red-700"><span className="font-medium">{conflict.field}</span> changed in both places: kept {show(conflict.app)}, SharePoint has {show(conflict.sharepoint)}</p>)}
                        {row.flags.map(flag => <p key={flag} className="text-slate-500">{flag}</p>)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>

            {plan.missing.length > 0 && (
              <section className="border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-950">Not in this file ({plan.missing.length})</h3>
                <p className="mt-1 text-xs text-slate-500">Imported before but missing from this export. They are kept as they are.</p>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">{plan.missing.map(record => <li key={record.id}>#{record.id} {record.customerName} {record.opportunityNumber ? `· ${record.opportunityNumber}` : ""}</li>)}</ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
