import { AdoptionTimelineEditor } from "@/components/AdoptionTimelineEditor";
import { EntitlementFitPanel } from "@/components/EntitlementFitPanel";
import { HoursFillPanel } from "@/components/HoursFillPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { buildStartWarning } from "@shared/buildingBlocks";
import { FIXED_GANTT_CATEGORIES, unstampActivityOwners, type EngagementDocument, type Timeline } from "@shared/fcp";
import { COST_THRESHOLDS, formatWindow, timelinesWithDeferrals, withHiddenBars, withoutBars, withOwnership, type PlanCost, type RoleHours, type ScopedEffort, type WorkPackageEffort } from "@shared/effort";
import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

const DEFERRED: Record<NonNullable<WorkPackageEffort["deferred"]>, string> = {
  "not funded": "Beyond the entitlement hours",
  "after the entitlement window": "Starts after the entitlement ends",
  "over budget": "Over the entitlement value",
  "planned for later": "Planned for later",
};

const NOTE: Record<NonNullable<WorkPackageEffort["note"]>, string> = {
  "customer-owned": "Customer-owned",
  checkpoint: "Checkpoint",
  "not in the scoped hours": "No hours scoped",
  merged: "Merged into the pathway package",
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

// CDW written style: money carries double zeros.
const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const COST_STYLE: Record<PlanCost["status"], { bar: string; box: string; text: string }> = {
  within: { bar: "bg-state-pass", box: "border-state-pass/30 bg-state-pass-soft text-state-pass-text", text: "Within the entitlement" },
  near: { bar: "bg-state-warn", box: "border-state-warn/30 bg-state-warn-soft text-state-warn-text", text: `Near the limit (${Math.round(COST_THRESHOLDS.near * 100)}% or more)` },
  over: { bar: "bg-state-blocked", box: "border-state-blocked/30 bg-state-blocked-soft text-state-blocked-text", text: "Over the entitlement" },
  "no-value": { bar: "bg-s300", box: "border-s100 bg-s50 text-ink", text: "No entitlement value on the Engagement step" },
};

/** INTERNAL: the plan's cost at the rate card against the entitlement value. Never printed in a document. */
export function CostMeter({ cost, hours, fit }: { cost: PlanCost; hours: number; fit?: ScopedEffort["internal"]["fit"] }) {
  // Under-funded only because of the reserve: the plan costs less than the entitlement value but more than what is left after it.
  const reserveOnly = cost.status === "over" && Boolean(fit?.underFunded) && cost.planCost <= cost.entitlementValue;
  const style = reserveOnly ? { ...COST_STYLE.over, text: "Over the hours left after the reserve" } : COST_STYLE[cost.status];
  const percent = cost.ratio === null ? 0 : Math.round(cost.ratio * 100);
  return (
    <div className={`rounded-lg border p-3 text-xs ${style.box}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide">Plan cost · internal, not in the report</span>
        <span className="font-semibold">{style.text}</span>
      </div>
      <p className="mt-1 text-sm font-semibold">
        {dollars(cost.planCost)} for {hours.toLocaleString("en-US")} hours
        {cost.entitlementValue > 0 && <> of {dollars(cost.entitlementValue)} ({percent}%){cost.status === "over" && !reserveOnly ? ` · over by ${dollars(cost.planCost - cost.entitlementValue)}` : ` · ${dollars(cost.entitlementValue - cost.planCost)} left`}</>}
      </p>
      {fit?.movedToFollowOn && fit.movedToFollowOn.hours > 0 && <p className="mt-1 font-semibold">The core work needed {Math.round(fit.coreRequiredHours).toLocaleString("en-US")} hours against {Math.round(fit.fillableHours).toLocaleString("en-US")} left after the reserve, so the latest work moved to the Two-Year Notional as follow-on: {fit.movedToFollowOn.packages.join(", ")} ({Math.round(fit.movedToFollowOn.hours).toLocaleString("en-US")} h).</p>}
      {cost.status === "over" && fit?.underFunded && <div className="mt-1 space-y-1">
        <p className="font-semibold">Under-funded: the entitlement funds {Math.round(fit.fillableHours).toLocaleString("en-US")} hours after the reserve, and the protected work (handover, licensing, the management domains, the first wave) with the design it builds on is {Math.round(fit.underFunded.gapHours).toLocaleString("en-US")} hours over it. Everything else, design included, has moved to the Two-Year Notional. The full scope needs {Math.round(fit.underFunded.fullScopeGapHours).toLocaleString("en-US")} more hours than the entitlement funds. The Condensed FCP still exports, but issuing it needs a logged reason until the protected work fits.</p>
        <p>The core is discovery, design, the pathway build or upgrade, the dated migration waves and VCF Operations Tier 1. Largest parts: {fit.coreByLine.slice(0, 4).map(row => `${row.line} ${Math.round(row.loaded).toLocaleString("en-US")} h`).join("; ")}.</p>
        <p>To close the gap, change the scope rather than the estimate: correct the estate facts the hours are built from (see Assumptions below), mark a prior assessment if one was delivered, lower the dated migration waves, choose a smaller pathway, or raise the entitlement or the rate used.</p>
      </div>}
      {cost.status === "over" && !fit?.underFunded && <p className="mt-1 font-semibold">The entitlement window cannot go over the entitlement value, and the Condensed FCP will not export. Only design and work pinned to the entitlement are left to cut: reduce their hours or move work to the Two-Year Notional.</p>}
      {cost.followOnCost > 0 && <p className="mt-1">Follow-on scope in the Two-Year Notional: {dollars(cost.followOnCost)} (no limit; not drawn from the entitlement).</p>}
      {cost.entitlementValue > 0 && (
        <div className="relative mt-2 h-2 rounded-full bg-white/70">
          <div className={`h-2 rounded-full ${style.bar}`} style={{ width: `${Math.min(100, percent)}%` }} />
          <div className="absolute inset-y-[-3px] w-px bg-s500" style={{ left: `${COST_THRESHOLDS.near * 100}%` }} title={`${Math.round(COST_THRESHOLDS.near * 100)}% threshold`} />
        </div>
      )}
    </div>
  );
}

const ROLES: Array<[keyof RoleHours, string]> = [["architect", "Architect"], ["srConsultant", "Sr. Consultant"], ["projectManager", "Sr. Project Manager"]];

const PLACEMENT: Array<[WorkPackageEffort["placement"], string]> = [["auto", "Automatic"], ["entitlement", "Entitlement window"], ["notional", "Two-Year Notional"]];
const OWNERS: Array<[WorkPackageEffort["owner"], string]> = [["cdw", "CDW"], ["customer", "Customer"], ["checkpoint", "Checkpoint"]];
type Settings = EngagementDocument["report"]["workPackageHours"][number];

/** Hours per role for one work package: the calculated baseline, which the planner can adjust, and where it is planned. */
export function RoleHoursEditor({ document, effort, barId, onChange }: { document: EngagementDocument; effort: ScopedEffort | undefined; barId: string; onChange: (document: EngagementDocument) => void }) {
  const row = effort?.workPackages.find(item => item.id === barId);
  if (!effort || !row) return <p className="text-xs text-s400">Calculating hours…</p>;
  const override: Settings = document.report.workPackageHours.find(item => item.id === barId) ?? { id: barId, architect: null, srConsultant: null, projectManager: null, placement: "auto", owner: "auto" };
  const write = (next: Settings | null) => {
    const others = document.report.workPackageHours.filter(item => item.id !== barId);
    const keep = next && (next.architect !== null || next.srConsultant !== null || next.projectManager !== null || next.placement !== "auto" || next.owner !== "auto");
    onChange({ ...document, report: { ...document.report, workPackageHours: keep ? [...others, next] : others } });
  };
  const cost = effort.internal.cost;
  const hoursNow = row.followOn ?? row;
  const placementNote: Record<NonNullable<WorkPackageEffort["deferred"]>, string> = {
    "not funded": "Only this add-on's design fits the entitlement hours, so its build is follow-on scope. Choose Entitlement window to bring it in.",
    "after the entitlement window": "Starts after the entitlement ends, so its hours are follow-on scope. Move it into the window to use entitlement hours.",
    "over budget": "Moved out of the entitlement to keep the plan within the entitlement value. Choose Entitlement window to keep it in; later work moves out instead.",
    "planned for later": "Placed in the Two-Year Notional as follow-on scope.",
  };
  // Choosing the default owner clears the choice, so a later change to the defaults still applies.
  const ownedBy = (
    <div className="flex flex-wrap items-center gap-1 text-xs text-s600">
      <span className="mr-1 font-semibold">Owned by</span>
      {OWNERS.map(([value, label]) => <Button key={value} type="button" size="sm" variant={row.owner === value ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => write({ ...override, owner: value })}>{label}</Button>)}
      {override.owner !== "auto" && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => write({ ...override, owner: "auto" })}><RotateCcw className="size-3.5" /> Default</Button>}
    </div>
  );
  if (row.owner !== "cdw") return (
    <div className="space-y-2 rounded-lg border border-s100 bg-surface p-3">
      {ownedBy}
      <p className="text-xs text-s500">{row.owner === "checkpoint" ? "A checkpoint marks a confirmation point; it takes no time and carries no CDW hours." : "Customer-owned work is run by the customer's team; it carries no CDW hours and is listed as customer-owned work in the report."} Choose CDW to give it hours.</p>
    </div>
  );
  return (
    <div className="grid gap-3 rounded-lg border border-s100 bg-surface p-3 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <div className="mb-2">{ownedBy}</div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-s400">{row.deferred ? "Follow-on hours by role · Two-Year Notional" : "Hours by role · entitlement"}</p>
          {row.adjusted && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => write({ ...override, architect: null, srConsultant: null, projectManager: null })}><RotateCcw className="size-3.5" /> Back to baseline</Button>}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {ROLES.map(([role, label]) => (
            <label key={role} className="space-y-1 text-[11px] font-semibold text-s500">{label}
              <Input type="number" min={0} className="bg-surface" value={override[role] ?? ""} placeholder={String(row.baseline[role])} onChange={event => write({ ...override, [role]: event.target.value === "" ? null : Math.max(0, Math.round(Number(event.target.value))) })} />
              <span className="block text-[11px] font-normal text-s400">Baseline {row.baseline[role]}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-s600">
          <span><b>{hoursNow.total.toLocaleString("en-US")} hours</b>{cost ? <> · {dollars(cost.byPackage[barId] ?? 0)}</> : null}</span>
          <span className="ml-auto flex items-center gap-1">Planned in
            {PLACEMENT.map(([value, label]) => <Button key={value} type="button" size="sm" variant={override.placement === value ? "default" : "outline"} className="h-7 px-2 text-[11px]" onClick={() => write({ ...override, placement: value })}>{label}</Button>)}
          </span>
        </div>
        {row.deferred && <p className="mt-2 rounded-lg bg-s50 px-2 py-1.5 text-[11px] leading-4 text-s500">{placementNote[row.deferred]}</p>}
      </div>
      <div className="space-y-2">
        {cost && <CostMeter cost={cost} hours={effort.totals.total} fit={effort.internal.fit} />}
      </div>
    </div>
  );
}

const deferredIds = (effort: ScopedEffort | undefined) => new Set((effort?.workPackages ?? []).filter(row => row.deferred).map(row => row.id));

/**
 * The Entitlement Adoption Timeline with hours: click a work package to adjust its hours by role or where it
 * is planned. Work in the Two-Year Notional (placed there, or moved to keep the plan within the entitlement
 * value) is not drawn here; it appears on the Two-Year Notional tab.
 */
export function EntitlementTimelineWithHours({ document, onTimelineChange, onChange, description }: { document: EngagementDocument; onTimelineChange: (timeline: Timeline) => void; onChange: (document: EngagementDocument) => void; description: string }) {
  const effort = useScopedEffort(document);
  const hidden = deferredIds(effort);
  const moved = (effort?.workPackages ?? []).filter(row => row.deferred);
  return (
    <div className="space-y-4">
      {moved.length > 0 && (
        <div className="rounded-lg border border-s100 bg-s50 px-4 py-3 text-xs leading-5 text-s600">
          <b>{moved.length} work package{moved.length === 1 ? " is" : "s are"} in the Two-Year Notional</b>, after the entitlement ends: {moved.map(row => row.label).join("; ")}. Open the Two-Year Notional tab to see them or bring one back.
        </div>
      )}
      <AdoptionTimelineEditor timeline={withoutBars(withOwnership(document).adoptionTimeline, hidden)} onChange={edited => onTimelineChange(withHiddenBars(unstampActivityOwners(edited), document.adoptionTimeline, hidden))} title="Entitlement Adoption Timeline" planWarnings={[buildStartWarning(document.fields, document.adoptionTimeline)].filter((warning): warning is string => Boolean(warning))} description={`${description} Click a work package to adjust its hours by role or plan it in the Two-Year Notional.`} selectionDetail={barId => <RoleHoursEditor document={document} effort={effort} barId={barId} onChange={onChange} />} />
      <section className="rounded-lg border border-s100 bg-surface p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Hours by work package</p>
        <p className="mt-2 max-w-4xl text-xs leading-5 text-s500">
          Baseline hours come from the services catalog for this plan, placed on the work packages that deliver them; adjusted rows are marked. The entitlement window is held to the entitlement value; work beyond it moves to the Two-Year Notional as follow-on scope. The Condensed FCP and the Delivery Package show this same table.
        </p>
        {effort?.internal.cost && <div className="mt-3"><CostMeter cost={effort.internal.cost} hours={effort.totals.total} fit={effort.internal.fit} /></div>}
        <div className="mt-3"><HoursFillPanel document={document} effort={effort} onChange={onChange} /></div>
        <div className="mt-3"><EntitlementFitPanel document={document} effort={effort} onChange={onChange} /></div>
        {effort ? <div className="mt-4"><WorkPackageTable effort={effort} /></div> : <p className="mt-4 text-xs text-s400">Calculating…</p>}
      </section>
    </div>
  );
}

/** The Two-Year Notional with work moved out of the entitlement drawn after it; click a moved package to change its hours or bring it back. */
export function NotionalTimelineWithHours({ document, onChange, description }: { document: EngagementDocument; onChange: (document: EngagementDocument) => void; description: string }) {
  const effort = useScopedEffort(document);
  const hidden = deferredIds(effort);
  const owned = withOwnership(document);
  const notional = hidden.size ? timelinesWithDeferrals(owned, Array.from(hidden)).notional : owned.twoYearPlan;
  const known = new Set((effort?.workPackages ?? []).map(row => row.id));
  return (
    <AdoptionTimelineEditor
      timeline={notional}
      onChange={twoYearPlan => onChange({ ...document, planAuthority: "manual", twoYearPlan: unstampActivityOwners(twoYearPlan) })}
      title="Two-Year Notional"
      description={`${description} Work moved out of the entitlement starts the month after it ends; click it to change its follow-on hours or bring it back into the entitlement.`}
      selectionDetail={barId => known.has(barId) ? <RoleHoursEditor document={document} effort={effort} barId={barId} onChange={onChange} /> : <p className="rounded-lg border border-s100 bg-surface px-3 py-2 text-xs text-s500">Notional roadmap activity; it carries no entitlement hours.</p>}
    />
  );
}

/** The work-package hours table: the rows the Condensed FCP prints, plus work with no entitlement hours. */
export function WorkPackageTable({ effort }: { effort: ScopedEffort }) {
  const rows = effort.workPackages;
  const funded = rows.filter(row => row.total > 0);
  const totals = funded.reduce((sum, row) => ({ architect: sum.architect + row.architect, srConsultant: sum.srConsultant + row.srConsultant, projectManager: sum.projectManager + row.projectManager, total: sum.total + row.total }), { architect: 0, srConsultant: 0, projectManager: 0, total: 0 });
  const followOn = rows.reduce((sum, row) => row.followOn ? { architect: sum.architect + row.followOn.architect, srConsultant: sum.srConsultant + row.followOn.srConsultant, projectManager: sum.projectManager + row.followOn.projectManager, total: sum.total + row.followOn.total } : sum, { architect: 0, srConsultant: 0, projectManager: 0, total: 0 });
  const inWindow = rows.filter(row => !row.deferred);
  const groups = [
    ...[...FIXED_GANTT_CATEGORIES, null].map(category => ({ title: category ?? "Not on the timeline", rows: inWindow.filter(row => row.category === category) })),
    { title: "After the entitlement window (Two-Year Notional)", rows: rows.filter(row => row.deferred) },
  ].filter(group => group.rows.length);
  const numberCell = (value: number, muted: boolean) => <td className={`px-2 py-1.5 text-right tabular-nums ${muted ? "text-s300" : "text-ink"}`}>{muted ? "—" : value.toLocaleString("en-US")}</td>;

  return (
    <div className="overflow-x-auto">
      <table className="tbl w-full">
        <thead>
          <tr className="text-left text-[11px]">
            <th className="px-2 py-1.5">Work package</th><th className="px-2 py-1.5">Window</th><th className="px-2 py-1.5">Lead delivery role</th>
            <th className="px-2 py-1.5 text-right">Architect</th><th className="px-2 py-1.5 text-right">Sr. Consultant</th><th className="px-2 py-1.5 text-right">Sr. PM</th><th className="px-2 py-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => [
            <tr key={`group-${group.title}`}><td colSpan={7} className="bg-s100 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-s500">{group.title}</td></tr>,
            ...group.rows.map(row => {
              const shown = row.followOn ?? row;
              const muted = shown.total === 0;
              const tag = row.deferred ? DEFERRED[row.deferred] : row.note ? NOTE[row.note] : row.adjusted ? "Adjusted" : null;
              return (
                <tr key={row.id} className="border-b border-s100 align-top">
                  <td className={`px-2 py-1.5 font-semibold ${muted ? "text-s300" : "text-ink"}`}>{row.label}{tag && <span className="ml-2 rounded bg-s100 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-s400">{tag}</span>}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-s500">{row.deferred ? "After the entitlement" : row.start && row.end ? formatWindow(row.start, row.end) : "—"}</td>
                  <td className="px-2 py-1.5 text-s500">{row.leadRole || "—"}</td>
                  {numberCell(shown.architect, muted)}{numberCell(shown.srConsultant, muted)}{numberCell(shown.projectManager, muted)}{numberCell(shown.total, muted)}
                </tr>
              );
            }),
          ])}
          <tr className="border-t-2 border-s600 font-semibold text-ink">
            <td className="px-2 py-1.5" colSpan={3}>Total entitlement hours</td>
            {numberCell(totals.architect, false)}{numberCell(totals.srConsultant, false)}{numberCell(totals.projectManager, false)}{numberCell(totals.total, false)}
          </tr>
          {followOn.total > 0 && <tr className="font-semibold text-s600">
            <td className="px-2 py-1.5" colSpan={3}>Follow-on hours (Two-Year Notional, not in the entitlement)</td>
            {numberCell(followOn.architect, false)}{numberCell(followOn.srConsultant, false)}{numberCell(followOn.projectManager, false)}{numberCell(followOn.total, false)}
          </tr>}
        </tbody>
      </table>
    </div>
  );
}
