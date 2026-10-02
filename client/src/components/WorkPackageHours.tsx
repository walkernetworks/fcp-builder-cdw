import { AdoptionTimelineEditor } from "@/components/AdoptionTimelineEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { FIXED_GANTT_CATEGORIES, type EngagementDocument, type Timeline } from "@shared/fcp";
import { COST_THRESHOLDS, formatWindow, type PlanCost, type RoleHours, type ScopedEffort, type WorkPackageEffort } from "@shared/effort";
import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

const DEFERRED: Record<NonNullable<WorkPackageEffort["deferred"]>, string> = {
  "not funded": "Beyond the entitlement hours",
  "after the entitlement window": "Starts after the entitlement ends",
};

const NOTE: Record<NonNullable<WorkPackageEffort["note"]>, string> = {
  "customer-owned": "Customer-owned",
  checkpoint: "Checkpoint",
  "not in the scoped hours": "No hours scoped",
};

/** Scoped effort for the document, recalculated shortly after the plan stops changing. */
export function useScopedEffort(document: EngagementDocument): ScopedEffort | undefined {
  const effort = trpc.effort.scoped.useMutation();
  const { mutate } = effort;
  useEffect(() => {
    const timer = window.setTimeout(() => mutate({ data: document }), 400);
    return () => window.clearTimeout(timer);
  }, [document, mutate]);
  return effort.data;
}

const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const COST_STYLE: Record<PlanCost["status"], { bar: string; box: string; text: string }> = {
  within: { bar: "bg-emerald-600", box: "border-emerald-200 bg-emerald-50 text-emerald-950", text: "Within the entitlement" },
  near: { bar: "bg-amber-500", box: "border-amber-200 bg-amber-50 text-amber-950", text: `Near the limit (${Math.round(COST_THRESHOLDS.near * 100)}% or more)` },
  over: { bar: "bg-red-600", box: "border-red-200 bg-red-50 text-red-950", text: "Over the entitlement" },
  "no-value": { bar: "bg-slate-400", box: "border-slate-200 bg-slate-50 text-slate-800", text: "No entitlement value on the Engagement step" },
};

/** INTERNAL: the plan's cost at the rate card against the entitlement value. Never printed in a document. */
export function CostMeter({ cost, hours }: { cost: PlanCost; hours: number }) {
  const style = COST_STYLE[cost.status];
  const percent = cost.ratio === null ? 0 : Math.round(cost.ratio * 100);
  return (
    <div className={`rounded-xl border p-3 text-xs ${style.box}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-[.14em]">Plan cost · internal, not in the report</span>
        <span className="font-semibold">{style.text}</span>
      </div>
      <p className="mt-1 text-sm font-bold">
        {dollars(cost.planCost)} for {hours.toLocaleString("en-US")} hours
        {cost.entitlementValue > 0 && <> of {dollars(cost.entitlementValue)} ({percent}%){cost.status === "over" ? ` · over by ${dollars(cost.planCost - cost.entitlementValue)}` : ` · ${dollars(cost.entitlementValue - cost.planCost)} left`}</>}
      </p>
      {cost.entitlementValue > 0 && (
        <div className="relative mt-2 h-2 rounded-full bg-white/70">
          <div className={`h-2 rounded-full ${style.bar}`} style={{ width: `${Math.min(100, percent)}%` }} />
          <div className="absolute inset-y-[-3px] w-px bg-slate-700" style={{ left: `${COST_THRESHOLDS.near * 100}%` }} title={`${Math.round(COST_THRESHOLDS.near * 100)}% threshold`} />
        </div>
      )}
    </div>
  );
}

const ROLES: Array<[keyof RoleHours, string]> = [["architect", "Architect"], ["srConsultant", "Sr. Consultant"], ["projectManager", "Sr. Project Manager"]];

/** Hours per role for one work package: the calculated baseline, which the planner can adjust. */
export function RoleHoursEditor({ document, effort, barId, onChange }: { document: EngagementDocument; effort: ScopedEffort | undefined; barId: string; onChange: (document: EngagementDocument) => void }) {
  const row = effort?.workPackages.find(item => item.id === barId);
  if (!effort || !row) return <p className="text-xs text-slate-500">Calculating hours…</p>;
  if (row.note === "checkpoint" || row.note === "customer-owned") return <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{row.note === "checkpoint" ? "A checkpoint carries no CDW hours." : "Customer-owned work carries no CDW hours."}</p>;
  if (row.deferred === "after the entitlement window") return <p className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">This work package starts after the entitlement ends, so it carries no entitlement hours. Move it into the entitlement window to give it hours.</p>;
  const override = document.report.workPackageHours.find(item => item.id === barId) ?? { id: barId, architect: null, srConsultant: null, projectManager: null };
  const write = (next: typeof override | null) => {
    const others = document.report.workPackageHours.filter(item => item.id !== barId);
    const keep = next && (next.architect !== null || next.srConsultant !== null || next.projectManager !== null);
    onChange({ ...document, report: { ...document.report, workPackageHours: keep ? [...others, next] : others } });
  };
  const cost = effort.internal.cost;
  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">Hours by role</p>
          {row.adjusted && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => write(null)}><RotateCcw className="size-3.5" /> Back to baseline</Button>}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {ROLES.map(([role, label]) => (
            <label key={role} className="space-y-1 text-[11px] font-semibold text-slate-600">{label}
              <Input type="number" min={0} className="bg-white" value={override[role] ?? ""} placeholder={String(row.baseline[role])} onChange={event => write({ ...override, [role]: event.target.value === "" ? null : Math.max(0, Math.round(Number(event.target.value))) })} />
              <span className="block text-[10px] font-normal text-slate-500">Baseline {row.baseline[role]}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-700"><b>{row.total.toLocaleString("en-US")} hours</b>{cost ? <> · {dollars(cost.byPackage[barId] ?? 0)}</> : null}{row.deferred === "not funded" ? " · beyond the entitlement hours; set hours to bring it into the entitlement" : ""}</p>
      </div>
      {cost && <CostMeter cost={cost} hours={effort.totals.total} />}
    </div>
  );
}

/** The Entitlement Adoption Timeline with hours: click a work package to adjust its hours by role. */
export function EntitlementTimelineWithHours({ document, onTimelineChange, onChange, description }: { document: EngagementDocument; onTimelineChange: (timeline: Timeline) => void; onChange: (document: EngagementDocument) => void; description: string }) {
  const effort = useScopedEffort(document);
  return (
    <div className="space-y-4">
      <AdoptionTimelineEditor timeline={document.adoptionTimeline} onChange={onTimelineChange} title="Entitlement Adoption Timeline" description={`${description} Click a work package to adjust its hours by role.`} selectionDetail={barId => <RoleHoursEditor document={document} effort={effort} barId={barId} onChange={onChange} />} />
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[.16em] text-[#c8102e]">Hours by work package</p>
        <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-600">
          Baseline hours come from the services catalog for this plan, placed on the work packages that deliver them; adjusted rows are marked. Work the entitlement cannot carry moves to the Two-Year Notional, after the entitlement ends. The Condensed FCP and the Delivery Package show this same table.
          {effort?.source === "assignments" && <b className="text-slate-800"> Signed resource assignments are entered ({effort.totals.total.toLocaleString("en-US")} hours), so the report shows those instead.</b>}
        </p>
        {effort?.internal.cost && effort.source === "calculated" && <div className="mt-3"><CostMeter cost={effort.internal.cost} hours={effort.totals.total} /></div>}
        {effort ? <div className="mt-4"><WorkPackageTable effort={effort} /></div> : <p className="mt-4 text-xs text-slate-500">Calculating…</p>}
      </section>
    </div>
  );
}

/** The work-package hours table: the rows the Condensed FCP prints, plus work with no entitlement hours. */
export function WorkPackageTable({ effort }: { effort: ScopedEffort }) {
  const rows = effort.workPackages;
  const funded = rows.filter(row => row.total > 0);
  const totals = funded.reduce((sum, row) => ({ architect: sum.architect + row.architect, srConsultant: sum.srConsultant + row.srConsultant, projectManager: sum.projectManager + row.projectManager, total: sum.total + row.total }), { architect: 0, srConsultant: 0, projectManager: 0, total: 0 });
  const inWindow = rows.filter(row => !row.deferred);
  const groups = [
    ...[...FIXED_GANTT_CATEGORIES, null].map(category => ({ title: category ?? "Not on the timeline", rows: inWindow.filter(row => row.category === category) })),
    { title: "After the entitlement window (Two-Year Notional)", rows: rows.filter(row => row.deferred) },
  ].filter(group => group.rows.length);
  const numberCell = (value: number, muted: boolean) => <td className={`px-2 py-1.5 text-right tabular-nums ${muted ? "text-slate-400" : "text-slate-800"}`}>{muted ? "—" : value.toLocaleString("en-US")}</td>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <th className="px-2 py-1.5">Work package</th><th className="px-2 py-1.5">Window</th><th className="px-2 py-1.5">Lead delivery role</th>
            <th className="px-2 py-1.5 text-right">Architect</th><th className="px-2 py-1.5 text-right">Sr. Consultant</th><th className="px-2 py-1.5 text-right">Sr. PM</th><th className="px-2 py-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => [
            <tr key={`group-${group.title}`}><td colSpan={7} className="bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">{group.title}</td></tr>,
            ...group.rows.map(row => {
              const muted = row.total === 0;
              const tag = row.deferred ? DEFERRED[row.deferred] : row.note ? NOTE[row.note] : row.adjusted ? "Adjusted" : null;
              return (
                <tr key={row.id} className="border-b border-slate-100 align-top">
                  <td className={`px-2 py-1.5 font-semibold ${muted ? "text-slate-400" : "text-slate-900"}`}>{row.label}{tag && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">{tag}</span>}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">{row.deferred ? "After the entitlement" : row.start && row.end ? formatWindow(row.start, row.end) : "—"}</td>
                  <td className="px-2 py-1.5 text-slate-600">{row.leadRole || "—"}</td>
                  {numberCell(row.architect, muted)}{numberCell(row.srConsultant, muted)}{numberCell(row.projectManager, muted)}{numberCell(row.total, muted)}
                </tr>
              );
            }),
          ])}
          <tr className="border-t-2 border-slate-900 font-bold text-slate-950">
            <td className="px-2 py-1.5" colSpan={3}>Total CDW-delivered hours</td>
            {numberCell(totals.architect, false)}{numberCell(totals.srConsultant, false)}{numberCell(totals.projectManager, false)}{numberCell(totals.total, false)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
