import { buildScopedEffort, costStatus, deferWorkPackages, isDesignWorkPackage, ROLE_LOADING, type DeferralReason, type RoleHours, type ScopedEffort } from "../shared/effort";
import type { EngagementDocument } from "../shared/fcp";

/**
 * INTERNAL ONLY. Broadcom Work Plan rate card and staffing mix from the fcp-builder skill (fcp_hours.py).
 * Used solely to estimate the funded envelope from the entitlement value when entitled hours are not known.
 * Rates never leave the server and no dollar figure is rendered in a document. The planner screens
 * receive only derived totals (plan cost, cost per work package, the entitlement value) so the hours can be
 * kept inside the entitlement.
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
 * Keeps the entitlement window within the entitlement value: while the plan costs more, the latest
 * automatically placed work moves to the Two-Year Notional, with everything that depends on it. Design work
 * and work the planner pinned to the entitlement never move; if they alone exceed the value the plan stays over.
 */
function withinBudget(document: EngagementDocument, effort: ScopedEffort, value: number): ScopedEffort {
  if (!value || effort.source === "assignments") return effort;
  const dependents = new Map<string, string[]>();
  for (const bar of document.adoptionTimeline.lanes.flatMap(lane => lane.bars)) for (const prerequisite of bar.prerequisites ?? []) dependents.set(prerequisite, [...(dependents.get(prerequisite) ?? []), bar.id]);
  const rows = new Map(effort.workPackages.map(row => [row.id, row]));
  const movable = (id: string) => { const row = rows.get(id); return Boolean(row && row.total > 0 && !row.deferred && row.placement === "auto" && row.category && !isDesignWorkPackage(id)); };
  const candidates = effort.workPackages.filter(row => movable(row.id)).sort((left, right) => (right.start ?? "").localeCompare(left.start ?? "") || right.total - left.total);
  const moves = new Map<string, DeferralReason>();
  let cost = costOf(effort.totals);
  const move = (id: string) => {
    if (moves.has(id) || !movable(id)) return;
    moves.set(id, "over budget");
    cost -= costOf(rows.get(id)!);
    for (const dependent of dependents.get(id) ?? []) move(dependent);
  };
  for (const candidate of candidates) {
    if (cost <= value) break;
    move(candidate.id);
  }
  return deferWorkPackages(effort, moves);
}

/** Scoped effort with the envelope filled from the entitlement value when entitled hours are missing, kept within the value, and its cost. */
export function scopedEffortForDocument(document: EngagementDocument): ScopedEffort {
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
