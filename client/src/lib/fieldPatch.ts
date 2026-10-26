import { applyScheduleFieldPatch, assessReadiness, refreshDerivedDocument, type EngagementDocument } from "@shared/fcp";

/** Plan inputs: a change to any of them regenerates the plan (a hand-edited plan keeps its edits). */
export const derivedPlanInputFields = new Set<keyof EngagementDocument["fields"]>([
  "entitlementAmount",
  "entitlementStart",
  "entitlementEnd",
  // A BSAS-only deal plans on the BSAS term.
  "fundingSource",
  "bsasHours",
  "bsasStart",
  "bsasEnd",
  "plannedProjectStart",
  "plannedImplementationStart",
  "targetStart",
  "targetComplete",
  "adoptionCadence",
  "hardwareAvailability",
  "hardwareLeadWeeks",
  "priorities",
  "timelineNotes",
  "adoptionDetails",
  "compatibilityTargetRelease",
  // A Commercial plan decides whether a VVF edition choice applies.
  "commercialPlan",
]);

/** A field edit as every FCP editor applies it: schedule rules first, then the plan rebuilt once when a plan input changed. */
export function withFieldPatch(document: EngagementDocument, patch: Partial<EngagementDocument["fields"]>): EngagementDocument {
  const nextFields = applyScheduleFieldPatch(document.fields, patch);
  const changesDerivedPlan = Object.keys(patch).some(field => derivedPlanInputFields.has(field as keyof EngagementDocument["fields"]));
  // Rebuild once: refreshDerivedDocument calculates readiness and the full plan together.
  if (changesDerivedPlan) return refreshDerivedDocument({ ...document, fields: nextFields });
  return { ...document, fields: nextFields, readiness: assessReadiness(nextFields, document.inventory, document.inventorySources.flatMap(source => source.warnings)) };
}
