import { AssignmentsInForce, CostMeter, WorkPackageTable } from "@/components/WorkPackageHours";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import type { EngagementDocument } from "@shared/fcp";
import { reportSchema } from "@shared/report";
import { Calculator, FilePenLine, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Props = {
  document: EngagementDocument;
  onChange: (document: EngagementDocument) => void;
  /** The raw JSON editor for the report content; the FCP workspace keeps it in Review and Issue instead. */
  showJsonEditor?: boolean;
};

const STATUS_TEXT = {
  "no-envelope": "No entitled hours or entitlement value yet, so the scope is shown at catalog size.",
  fits: "The full scope fits; the migration or upgrade waves use the remaining hours.",
  "fits-reduced": "Fits after reducing scope: waves cut to a proving run and add-ons to their design work.",
  short: "Does not fit even after reducing scope. Trim lines before committing the hours.",
} as const;

/**
 * Scoped effort with the internal fit check, and an editor for the report content. The fit figures
 * (envelope, shortfall, headroom) are internal and never appear in the Condensed FCP.
 */
export function CondensedReportPanel({ document, onChange, showJsonEditor = true }: Props) {
  const effort = trpc.effort.scoped.useMutation();
  const data = effort.data;
  const { mutate } = effort;
  // Recalculate shortly after the plan stops changing.
  useEffect(() => {
    const timer = window.setTimeout(() => mutate({ data: document }), 400);
    return () => window.clearTimeout(timer);
  }, [document, mutate]);
  const assignments = document.report.resourceAssignments;

  return (
    <section className="rounded-lg border border-s100 bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Condensed FCP</p>
          <h3 className="mt-1 text-lg font-semibold text-ink">Scoped effort and report content</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-s400">Hours are priced from the services catalog for this plan and placed on the adoption timeline's work packages. Signed resource assignments replace them in the report. The fit figures below are internal and never appear in the document.</p>
        </div>
        {showJsonEditor && <div className="flex flex-wrap gap-2">
          <ReportJsonButton document={document} onChange={onChange} />
        </div>}
      </div>
      {!data ? <p className="mt-4 flex items-center gap-2 text-sm text-s400"><Loader2 className="size-4 animate-spin" /> Calculating hours…</p> : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div className="overflow-x-auto">
            {data.source === "assignments" ? <>
              <div className="mb-3 space-y-2"><AssignmentsInForce document={document} effort={data} onChange={onChange} />{data.internal.cost && <CostMeter fit={data.internal.fit} cost={data.internal.cost} hours={data.totals.total} assignments />}</div>
              <p className="mb-1 text-xs font-semibold text-s500">Signed resource assignments (shown in the report)</p>
              <table className="tbl w-full">
                <thead><tr className="text-left text-[11px]"><th className="p-2">Workstream</th><th className="p-2 text-right">Architect</th><th className="p-2 text-right">Sr. Consultant</th><th className="p-2 text-right">PM</th><th className="p-2 text-right">Total</th></tr></thead>
                <tbody>
                  {data.rows.map(row => <tr key={row.workstream} className="border-b border-s100"><td className="p-2 font-semibold text-ink">{row.workstream}</td><td className="p-2 text-right">{row.architect}</td><td className="p-2 text-right">{row.srConsultant}</td><td className="p-2 text-right">{row.projectManager}</td><td className="p-2 text-right font-semibold">{row.total}</td></tr>)}
                  <tr className="font-semibold text-ink"><td className="p-2">Total</td><td className="p-2 text-right">{data.totals.architect}</td><td className="p-2 text-right">{data.totals.srConsultant}</td><td className="p-2 text-right">{data.totals.projectManager}</td><td className="p-2 text-right">{data.totals.total}</td></tr>
                </tbody>
              </table>
            </> : <>
              <p className="mb-1 text-xs font-semibold text-s500">Calculated from the plan, by work package: the same table as stage 03 and the report, until assignments are entered</p>
              {data.internal.cost && <div className="mb-3"><CostMeter fit={data.internal.fit} cost={data.internal.cost} hours={data.totals.total} /></div>}
              <WorkPackageTable effort={data} />
            </>}
          </div>
          <div className="rounded-lg border border-state-warn/30 bg-state-warn-soft p-4 text-xs leading-5 text-state-warn-text">
            <p className="text-[11px] font-medium uppercase tracking-wide">Internal fit check · not in the report</p>
            <p className="mt-2 font-semibold">{STATUS_TEXT[data.internal.status]}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              <dt>Envelope</dt><dd className="text-right">{data.internal.envelopeHours === null ? "—" : `${Math.round(data.internal.envelopeHours)} hrs`} <span className="text-state-warn-text">({data.internal.envelopeSource})</span></dd>
              <dt>Full catalog scope</dt><dd className="text-right">{data.internal.fullScopeHours} hrs</dd>
              <dt>Plan after fitting</dt><dd className="text-right">{data.internal.planHours} hrs</dd>
              {data.internal.shortfallHours > 0 && <><dt>Unfunded hours</dt><dd className="text-right font-semibold">{data.internal.shortfallHours} hrs</dd></>}
              {data.internal.headroomHours > 0 && <><dt>Hours to spare</dt><dd className="text-right">{data.internal.headroomHours} hrs</dd></>}
            </dl>
            {data.internal.status === "short" && <p className="mt-2">Options: stage the scope; the customer runs the remaining waves, if they ask to (Migration waves setting); or redirect the entitlement. Express any gap to the customer as hours, never dollars.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

/** Everything the report takes from the customer brief, as JSON: checked against the report schema before it is stored. */
export function ReportJsonButton({ document, onChange, label = "Edit report content" }: { document: EngagementDocument; onChange: (document: EngagementDocument) => void; label?: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const saveReport = () => {
    if (editing === null) return;
    let parsed: unknown;
    try { parsed = JSON.parse(editing); } catch { setErrors(["The text is not valid JSON."]); return; }
    const result = reportSchema.safeParse(parsed);
    if (!result.success) { setErrors(result.error.issues.map(issue => `${issue.path.join(".") || "report"}: ${issue.message}`)); return; }
    onChange({ ...document, report: result.data });
    setEditing(null);
    setErrors([]);
    toast.success("Report content saved");
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setEditing(JSON.stringify(document.report, null, 2)); setErrors([]); }}><FilePenLine className="size-4" /> {label}</Button>
      <Dialog open={editing !== null} onOpenChange={open => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Report content</DialogTitle>
            <DialogDescription>Everything the Condensed FCP takes from the customer brief. Edit and save; the content is checked before it is stored.</DialogDescription>
          </DialogHeader>
          <Textarea className="h-[55vh] font-mono text-xs" value={editing ?? ""} onChange={event => setEditing(event.target.value)} spellCheck={false} />
          {errors.length > 0 && <ul className="max-h-28 list-disc overflow-y-auto rounded-lg border border-state-blocked/30 bg-state-blocked-soft p-3 pl-6 text-xs text-state-blocked-text">{errors.map(error => <li key={error}>{error}</li>)}</ul>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveReport}>Save report content</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
