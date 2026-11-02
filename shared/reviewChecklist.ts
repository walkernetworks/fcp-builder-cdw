import { estateSizeFlag } from "./estateSize";
import { fundedFields, type EngagementDocument } from "./fcp";
import { internalOpenItems, termEndAssumed } from "./reportView";

/** The workspace sections a checklist item can send the user to. */
export type FixSection = "engagement" | "funding" | "estate" | "scope" | "plan";

export type ChecklistItem = {
  id: string;
  label: string;
  /** Set when the item has been checked and is fine. */
  ready: boolean;
  /** Not checked yet (the funding check runs with "Check and show the changes"). */
  pending?: boolean;
  /** Why it is not ready, in the planner's words. */
  detail?: string;
  fixIn: FixSection;
};

/**
 * Everything that has to be true before the FCP goes to the customer, in one list: the delivery package readiness,
 * the two decisions the workspace raises (the deal segment and who runs the migration waves), and the funding check.
 * Each item names the section where it is fixed. Pure.
 *
 * `fundingProblem` is undefined until the issue check has run, null when the hours reconcile, else the internal wording.
 */
export function reviewChecklist(document: EngagementDocument, decisions: { segmentWarning: string | null; wavesWarning: string | null; fundingProblem?: string | null }): ChecklistItem[] {
  const { fields, report } = document;
  const bsas = fields.fundingSource === "bsas";
  const sizeFlag = estateSizeFlag(document);
  const items: ChecklistItem[] = [
    { id: "segment", label: "Deal segment matches the plan type", ready: !decisions.segmentWarning, ...(decisions.segmentWarning ? { detail: decisions.segmentWarning } : {}), fixIn: "engagement" },
    { id: "waves", label: "Migration waves setting matches the customer's work", ready: !decisions.wavesWarning, ...(decisions.wavesWarning ? { detail: decisions.wavesWarning } : {}), fixIn: "plan" },
    { id: "funding-check", label: "Hours reconcile with the funding", ready: decisions.fundingProblem === null, ...(decisions.fundingProblem === undefined ? { pending: true, detail: "Not checked yet. Press Check and show the changes." } : decisions.fundingProblem ? { detail: decisions.fundingProblem } : {}), fixIn: "plan" },
    { id: "customer", label: bsas ? "Customer and BSAS" : "Customer and entitlement", ready: Boolean(fields.customerName && fundedFields(fields).entitlementStart), fixIn: "funding" },
    { id: "hours", label: "Entitled hours", ready: Boolean(report.entitlement.hours || (bsas && fields.bsasHours)), detail: "The account team's item: the hours come from Broadcom's record.", fixIn: "funding" },
    { id: "end-date", label: bsas ? "BSAS end date confirmed" : "Entitlement end date confirmed", ready: !termEndAssumed(document), detail: "The customer documents mark the date to be confirmed until it is.", fixIn: "funding" },
    { id: "scope", label: "Service scope", ready: fields.priorities.length > 0, fixIn: "scope" },
    { id: "timeline", label: "Entitlement adoption timeline", ready: document.adoptionTimeline.lanes.some(lane => lane.bars.length), fixIn: "plan" },
    { id: "evidence", label: "Technical evidence", ready: Boolean(document.inventory.hosts && document.readiness.hardwarePlatforms.length), fixIn: "estate" },
    { id: "estate-size", label: "Estate size stated", ready: !sizeFlag, ...(sizeFlag ? { detail: `${sizeFlag} Set Small estate in the planner inputs, or import RVTools.` } : {}), fixIn: "estate" },
  ];
  // A detail explains what is wrong, so a ready item carries none.
  return items.map(({ detail, ...rest }) => (rest.ready || !detail ? rest : { ...rest, detail }));
}

/** Open items owned only by CDW or Broadcom: about our own records, so the customer documents leave them out. */
export const internalChecklistItems = (document: EngagementDocument) => internalOpenItems(document.report.openItems, document);
