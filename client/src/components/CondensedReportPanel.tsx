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
export function CondensedReportPanel({ document, onChange }: Props) {
  const effort = trpc.effort.scoped.useMutation();
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const data = effort.data;
  const { mutate } = effort;
  // Recalculate shortly after the plan stops changing.
  useEffect(() => {
    const timer = window.setTimeout(() => mutate({ data: document }), 400);
    return () => window.clearTimeout(timer);
  }, [document, mutate]);
  const assignments = document.report.resourceAssignments;


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
    <section className="border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-cdw-red">Condensed FCP</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Scoped effort and report content</h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Hours are priced from the services catalog for this plan and placed on the adoption timeline's work packages. Signed resource assignments replace them in the report. The fit figures below are internal and never appear in the document.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => { setEditing(JSON.stringify(document.report, null, 2)); setErrors([]); }}><FilePenLine className="size-4" /> Edit report content</Button>
        </div>
      </div>

      {!data ? <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Calculating hours…</p> : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div className="overflow-x-auto">
            {data.source === "assignments" ? <>
              <div className="mb-3 space-y-2"><AssignmentsInForce document={document} effort={data} onChange={onChange} />{data.internal.cost && <CostMeter fit={data.internal.fit} cost={data.internal.cost} hours={data.totals.total} assignments />}</div>
              <p className="mb-1 text-xs font-semibold text-slate-600">Signed resource assignments (shown in the report)</p>
              <table className="w-full text-xs">
                <thead><tr className="bg-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-500"><th className="p-2">Workstream</th><th className="p-2 text-right">Architect</th><th className="p-2 text-right">Sr. Consultant</th><th className="p-2 text-right">PM</th><th className="p-2 text-right">Total</th></tr></thead>
                <tbody>
                  {data.rows.map(row => <tr key={row.workstream} className="border-b border-slate-100"><td className="p-2 font-semibold text-slate-800">{row.workstream}</td><td className="p-2 text-right">{row.architect}</td><td className="p-2 text-right">{row.srConsultant}</td><td className="p-2 text-right">{row.projectManager}</td><td className="p-2 text-right font-semibold">{row.total}</td></tr>)}
                  <tr className="font-bold text-slate-950"><td className="p-2">Total</td><td className="p-2 text-right">{data.totals.architect}</td><td className="p-2 text-right">{data.totals.srConsultant}</td><td className="p-2 text-right">{data.totals.projectManager}</td><td className="p-2 text-right">{data.totals.total}</td></tr>
                </tbody>
              </table>
            </> : <>
              <p className="mb-1 text-xs font-semibold text-slate-600">Calculated from the plan, by work package: the same table as stage 03 and the report, until assignments are entered</p>
              {data.internal.cost && <div className="mb-3"><CostMeter fit={data.internal.fit} cost={data.internal.cost} hours={data.totals.total} /></div>}
              <WorkPackageTable effort={data} />
            </>}
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
            <p className="text-[10px] font-black uppercase tracking-[.14em]">Internal fit check · not in the report</p>
            <p className="mt-2 font-semibold">{STATUS_TEXT[data.internal.status]}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              <dt>Envelope</dt><dd className="text-right">{data.internal.envelopeHours === null ? "—" : `${Math.round(data.internal.envelopeHours)} hrs`} <span className="text-amber-800">({data.internal.envelopeSource})</span></dd>
              <dt>Full catalog scope</dt><dd className="text-right">{data.internal.fullScopeHours} hrs</dd>
              <dt>Plan after fitting</dt><dd className="text-right">{data.internal.planHours} hrs</dd>
              {data.internal.shortfallHours > 0 && <><dt>Unfunded hours</dt><dd className="text-right font-bold">{data.internal.shortfallHours} hrs</dd></>}
              {data.internal.headroomHours > 0 && <><dt>Hours to spare</dt><dd className="text-right">{data.internal.headroomHours} hrs</dd></>}
            </dl>
            {data.internal.status === "short" && <p className="mt-2">Options: CDW does the one-time work and the customer repeats it; stage the scope; or redirect the entitlement. Express any gap to the customer as hours, never dollars.</p>}
          </div>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={open => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Report content</DialogTitle>
            <DialogDescription>Everything the Condensed FCP takes from the customer brief. Edit and save; the content is checked before it is stored.</DialogDescription>
          </DialogHeader>
          <Textarea className="h-[55vh] font-mono text-xs" value={editing ?? ""} onChange={event => setEditing(event.target.value)} spellCheck={false} />
          {errors.length > 0 && <ul className="max-h-28 list-disc overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 pl-6 text-xs text-red-900">{errors.map(error => <li key={error}>{error}</li>)}</ul>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveReport}>Save report content</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
