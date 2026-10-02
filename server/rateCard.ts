import { buildScopedEffort, costStatus, ROLE_LOADING, type RoleHours, type ScopedEffort } from "../shared/effort";
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

/** Scoped effort with the envelope filled from the entitlement value when entitled hours are missing, and its cost. */
export function scopedEffortForDocument(document: EngagementDocument): ScopedEffort {
  const estimated = document.report.entitlement.hours === null ? fundedHoursFromValue(document.fields.entitlementAmount) : null;
  const effort = buildScopedEffort(document, { envelopeHours: estimated, envelopeSource: "entitlement value" });
  const entitlementValue = document.fields.entitlementAmount > 0 ? document.fields.entitlementAmount : 0;
  const planCost = Math.round(costOf(effort.totals));
  const ratio = entitlementValue ? planCost / entitlementValue : null;
  const byPackage = Object.fromEntries(effort.workPackages.map(row => [row.id, Math.round(costOf(row))]));
  return { ...effort, internal: { ...effort.internal, cost: { planCost, entitlementValue, ratio, status: costStatus(ratio), byPackage } } };
}

export { ROLE_LOADING };
