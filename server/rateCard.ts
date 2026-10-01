import { buildScopedEffort, ROLE_LOADING, type ScopedEffort } from "../shared/effort";
import type { EngagementDocument } from "../shared/fcp";

/**
 * INTERNAL ONLY. Broadcom Work Plan rate card and staffing mix from the fcp-builder skill (fcp_hours.py).
 * Used solely to estimate the funded envelope from the entitlement value when entitled hours are not known.
 * No rate, blended rate, or derived dollar figure is ever sent to the browser or rendered in a document.
 */
const RATE = { architect: 327, srConsultant: 293, seniorArchitect: 328, projectManager: 312, offshoreProjectManager: 69 };
const WORK_PLAN_MIX = { srConsultant: 177 / 276, architect: 32 / 276, seniorArchitect: 8 / 276, projectManager: 42 / 276, offshoreProjectManager: 17 / 276 };

const BLENDED_RATE = (Object.keys(WORK_PLAN_MIX) as Array<keyof typeof WORK_PLAN_MIX>).reduce((sum, role) => sum + RATE[role] * WORK_PLAN_MIX[role], 0);

/** Loaded hours an entitlement value funds at the Work Plan mix. */
export function fundedHoursFromValue(value: number): number | null {
  return value > 0 ? value / BLENDED_RATE : null;
}

/** Scoped effort with the envelope filled from the entitlement value when entitled hours are missing. */
export function scopedEffortForDocument(document: EngagementDocument): ScopedEffort {
  const estimated = document.report.entitlement.hours === null ? fundedHoursFromValue(document.fields.entitlementAmount) : null;
  return buildScopedEffort(document, { envelopeHours: estimated, envelopeSource: "entitlement value" });
}

export { ROLE_LOADING };
