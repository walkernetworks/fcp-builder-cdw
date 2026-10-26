/**
 * Where each FCP value comes from, for the provenance chip beside it in the workspace. Pure, and derived from the
 * document alone: no value is stored twice. "confirmed": a person or an import stated it. "assumed": the plan is
 * using a default rule until someone states it (the source names the rule). "unknown": nothing yet.
 * docs/FCP-WORKSPACE.md section 9 (Phase 2 Funding).
 */
import { bsasTerm } from "./bsas";
import { calculateEntitlementEndDate, type EngagementDocument } from "./fcp";
import { signedAssignmentHours } from "./fcpRecord";

export type ProvenanceState = "confirmed" | "assumed" | "unknown";
export type Provenance = { state: ProvenanceState; source: string };

const confirmed = (source: string): Provenance => ({ state: "confirmed", source });
const assumed = (source: string): Provenance => ({ state: "assumed", source });
const unknown = (source: string): Provenance => ({ state: "unknown", source });

export type FundingValue = "entitlementAmount" | "entitlementStart" | "entitlementEnd" | "bsasHours" | "bsasStart" | "bsasEnd" | "entitledHours" | "hoursConsumed";

/** The value each funding field resolves to, and where it comes from. Dates are ISO days, "" when unknown. */
export type FundingFact = Provenance & { value: string | number | null; assumedValue?: string | number };

/**
 * The funding facts the FCP prints, each with its provenance. The rules mirror what the report already does:
 * the entitlement ends 12 months after it starts unless a term end is stated; the BSAS term starts the day after the
 * entitlement ends and runs 12 months unless stated; entitled hours are the signed resource assignment total, or
 * derived from the entitlement value when none is entered.
 */
export function fundingProvenance(document: EngagementDocument): Record<FundingValue, FundingFact> {
  const { fields, report } = document;
  const bsasOnly = fields.fundingSource === "bsas";
  const statedEnd = report.entitlement.termEnd;
  const calculatedEnd = calculateEntitlementEndDate(fields.entitlementStart) || "";
  const entitlementEnd = statedEnd || calculatedEnd;
  // The BSAS defaults are the engine's own (shared/bsas.ts): after the entitlement, the term starts the day after it
  // ends and runs 12 months; BSAS alone needs a stated start and runs 12 months unless an end is stated.
  const term = bsasOnly ? null : bsasTerm({ ...fields, bsasHours: Math.max(fields.bsasHours, 1), fundingSource: "entitlement-bsas" }, entitlementEnd || null);
  const bsasStartDefault = fields.bsasStart ? "" : term?.termStart ?? "";
  const bsasStart = fields.bsasStart || bsasStartDefault;
  const bsasEndStated = fields.bsasEnd && fields.bsasEnd >= bsasStart ? fields.bsasEnd : "";
  const bsasEndDefault = bsasEndStated ? "" : bsasOnly ? calculateEntitlementEndDate(bsasStart) || "" : term?.termEnd ?? "";
  const signed = signedAssignmentHours(document);

  return {
    entitlementAmount: fields.entitlementAmount > 0 ? { ...confirmed("Entered"), value: fields.entitlementAmount } : { ...unknown("Not entered"), value: null },
    entitlementStart: fields.entitlementStart ? { ...confirmed("Entered"), value: fields.entitlementStart } : { ...unknown("Not entered"), value: null },
    entitlementEnd: statedEnd
      ? { ...confirmed("Stated term end"), value: statedEnd }
      : calculatedEnd
        ? { ...assumed("12 months from the start"), value: calculatedEnd, assumedValue: calculatedEnd }
        : { ...unknown("Needs the start date"), value: null },
    bsasHours: fields.bsasHours > 0 ? { ...confirmed("Entered from the BSAS quote"), value: fields.bsasHours } : { ...unknown("Not entered"), value: null },
    bsasStart: fields.bsasStart
      ? { ...confirmed("Entered"), value: fields.bsasStart }
      : bsasStartDefault
        ? { ...assumed("Day after the entitlement ends"), value: bsasStartDefault, assumedValue: bsasStartDefault }
        : { ...unknown(bsasOnly ? "Not entered" : "Needs the entitlement end"), value: null },
    bsasEnd: bsasEndStated
      ? { ...confirmed("Entered"), value: bsasEndStated }
      : bsasEndDefault
        ? { ...assumed("12 months after the BSAS start"), value: bsasEndDefault, assumedValue: bsasEndDefault }
        : { ...unknown("Needs the BSAS start"), value: null },
    entitledHours: report.entitlement.hours !== null
      ? { ...confirmed(signed !== null && signed === report.entitlement.hours ? "Signed resource assignments" : "Entered"), value: report.entitlement.hours }
      : !bsasOnly && fields.entitlementAmount > 0
        ? { ...assumed("Derived from the entitlement value"), value: null }
        : { ...unknown("No signed resource assignments yet"), value: null },
    hoursConsumed: report.entitlement.hoursConsumed !== null
      ? { ...confirmed(report.entitlement.consumedAsOf ? `Consumption entry as of ${report.entitlement.consumedAsOf}` : "Consumption entry, date not entered"), value: report.entitlement.hoursConsumed }
      : { ...unknown("No consumption entry yet"), value: null },
  };
}

/**
 * Confirms an assumed date by writing the assumed value, so it reads as stated from then on. Only the three dated
 * defaults can be confirmed this way; everything else is confirmed by entering it.
 */
export function confirmAssumedFunding(document: EngagementDocument, value: "entitlementEnd" | "bsasStart" | "bsasEnd"): EngagementDocument {
  const fact = fundingProvenance(document)[value];
  if (fact.state !== "assumed" || typeof fact.assumedValue !== "string") return document;
  if (value === "entitlementEnd") return { ...document, report: { ...document.report, entitlement: { ...document.report.entitlement, termEnd: fact.assumedValue } } };
  return { ...document, fields: { ...document.fields, [value]: fact.assumedValue } };
}
