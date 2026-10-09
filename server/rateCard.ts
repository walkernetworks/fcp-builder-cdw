import { buildScopedEffort, costStatus, deferWorkPackages, isDesignWorkPackage, ROLE_LOADING, type DeferralReason, type RoleHours, type ScopedEffort } from "../shared/effort";
import type { EngagementDocument } from "../shared/fcp";

/**
 * INTERNAL ONLY. Broadcom Work Plan rate card and staffing mix from the fcp-builder skill (fcp_hours.py).
 * Used to estimate the funded envelope from the entitlement value when entitled hours are not known.
 * Per-role rates never leave the server and no rate or dollar figure is rendered in a customer document.
 * The planner screens receive derived totals (plan cost, cost per work package, the entitlement value) and,
 * under the v2 hours model, the blended rate the fit used and the dollars per bucket.
 */
const RATE = { architect: 327, srConsultant: 293, seniorArchitect: 328, projectManager: 312, offshoreProjectManager: 69 };
const WORK_PLAN_MIX = { srConsultant: 177 / 276, architect: 32 / 276, seniorArchitect: 8 / 276, projectManager: 42 / 276, offshoreProjectManager: 17 / 276 };

const BLENDED_RATE = (Object.keys(WORK_PLAN_MIX) as Array<keyof typeof WORK_PLAN_MIX>).reduce((sum, role) => sum + RATE[role] * WORK_PLAN_MIX[role], 0);

/** Loaded hours an entitlement value funds at the Work Plan mix. */
export function fundedHoursFromValue(value: number): number | null {
  return value > 0 ? value / BLENDED_RATE : null;
}

const costOf = (roles: RoleHours) => roles.architect * RATE.architect + roles.srConsultant * RATE.srConsultant + roles.projectManager * RATE.projectManager;

/**
 * Squeezes as much of the plan into the entitlement as it can carry: while the plan costs more than the
 * entitlement value, or needs more than the entitled hours, the latest automatically placed work moves to the
 * Two-Year Notional, with everything that depends on it. Moved work then comes back, earliest first, wherever it
 * still fits and its prerequisites stayed. Design and governance work and work the planner pinned to the
 * entitlement never move; if they alone exceed the entitlement the plan stays over.
 */
function withinBudget(document: EngagementDocument, effort: ScopedEffort, value: number): ScopedEffort {
  const hours = document.report.entitlement.hours;
  if ((!value && !hours) || effort.source === "assignments") return effort;
  const bars = document.adoptionTimeline.lanes.flatMap(lane => lane.bars);
  const dependents = new Map<string, string[]>();
  for (const bar of bars) for (const prerequisite of bar.prerequisites ?? []) dependents.set(prerequisite, [...(dependents.get(prerequisite) ?? []), bar.id]);
  const prerequisites = new Map(bars.map(bar => [bar.id, bar.prerequisites ?? []]));
  const rows = new Map(effort.workPackages.map(row => [row.id, row]));
  const movable = (id: string) => { const row = rows.get(id); return Boolean(row && row.total > 0 && !row.deferred && row.placement === "auto" && row.category && !isDesignWorkPackage(id)); };
  const candidates = effort.workPackages.filter(row => movable(row.id)).sort((left, right) => (right.start ?? "").localeCompare(left.start ?? "") || right.total - left.total);
  const moves = new Map<string, DeferralReason>();
  let cost = costOf(effort.totals);
  let planned = effort.totals.total;
  const fits = () => (!value || cost <= value) && (!hours || planned <= hours);
  const move = (id: string) => {
    if (moves.has(id) || !movable(id)) return;
    moves.set(id, "over budget");
    cost -= costOf(rows.get(id)!);
    planned -= rows.get(id)!.total;
    for (const dependent of dependents.get(id) ?? []) move(dependent);
  };
  for (const candidate of candidates) {
    if (fits()) break;
    move(candidate.id);
  }
  // Fill what is left of the entitlement: bring moved work back, earliest first, where it fits.
  for (const row of effort.workPackages.filter(item => moves.has(item.id)).sort((left, right) => (left.start ?? "").localeCompare(right.start ?? ""))) {
    if ((prerequisites.get(row.id) ?? []).some(id => moves.has(id))) continue;
    cost += costOf(row);
    planned += row.total;
    if (fits()) moves.delete(row.id);
    else { cost -= costOf(row); planned -= row.total; }
  }
  return deferWorkPackages(effort, moves);
}

export type FitMoney = { blendedRate: number; rateSource: "rate card" | "planner override"; buckets: Record<"E1" | "E2" | "F" | "C" | "reserve", number> };

/** v2: the entitlement value turned into hours at the blended rate, fitted by Pass 2 (no squeeze), with dollars per bucket for the planner. */
function scopedEffortV2(document: EngagementDocument, today?: string): ScopedEffort & { internal: ScopedEffort["internal"] & { money?: FitMoney } } {
  const override = document.fields.estimateInputs.blendedRate;
  const blendedRate = override ?? BLENDED_RATE;
  const value = document.fields.entitlementAmount > 0 ? document.fields.entitlementAmount : 0;
  const envelope = document.report.entitlement.hours === null && value ? value / blendedRate : null;
  const effort = buildScopedEffort(document, { envelopeHours: envelope, envelopeSource: "entitlement value", today });
  const fit = effort.internal.fit;
  const dollars = (hours: number) => Math.round(hours * blendedRate);
  const money: FitMoney | undefined = fit ? {
    blendedRate,
    rateSource: override ? "planner override" : "rate card",
    buckets: { E1: dollars(fit.buckets.E1), E2: dollars(fit.buckets.E2), F: dollars(fit.buckets.F), C: dollars(fit.buckets.C), reserve: dollars(fit.reserveHours) },
  } : undefined;
  const planCost = dollars(effort.totals.total);
  const followOnCost = dollars(effort.workPackages.reduce((sum, row) => sum + (row.followOn?.total ?? 0), 0));
  const ratio = value ? planCost / value : null;
  const byPackage = Object.fromEntries(effort.workPackages.map(row => [row.id, dollars((row.followOn ?? row).total)]));
  // Under v2 the fit decides what is in the entitlement; only an under-funded core makes the plan cost more than the value.
  const status = fit?.underFunded ? "over" : costStatus(ratio && ratio > 1 ? 1 : ratio);
  return { ...effort, internal: { ...effort.internal, cost: { planCost, followOnCost, entitlementValue: value, ratio, status, byPackage }, ...(money ? { money } : {}) } };
}

/** Scoped effort with the envelope filled from the entitlement value when entitled hours are missing, kept within the value, and its cost. */
export function scopedEffortForDocument(document: EngagementDocument, today?: string): ScopedEffort {
  if (document.fields.hoursModel === "v2") return scopedEffortV2(document, today);
  const estimated = document.report.entitlement.hours === null ? fundedHoursFromValue(document.fields.entitlementAmount) : null;
  const entitlementValue = document.fields.entitlementAmount > 0 ? document.fields.entitlementAmount : 0;
  const effort = withinBudget(document, buildScopedEffort(document, { envelopeHours: estimated, envelopeSource: "entitlement value" }), entitlementValue);
  const planCost = Math.round(costOf(effort.totals));
  const followOnCost = Math.round(effort.workPackages.reduce((sum, row) => sum + (row.followOn ? costOf(row.followOn) : 0), 0));
  const ratio = entitlementValue ? planCost / entitlementValue : null;
  const byPackage = Object.fromEntries(effort.workPackages.map(row => [row.id, Math.round(costOf(row.followOn ?? row))]));
  return { ...effort, internal: { ...effort.internal, cost: { planCost, followOnCost, entitlementValue, ratio, status: costStatus(ratio), byPackage } } };
}

export { ROLE_LOADING };
