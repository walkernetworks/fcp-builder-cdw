import { fundedDocument } from "./bsas";
import { planBsasAllocation } from "./planView";
import { buildBurndown, type ScopedEffort } from "./effort";
import type { EngagementDocument } from "./fcp";
import type { Segment } from "./vsaStage";

/**
 * The customer FCP formats (docs/fcp-formats/FCP-REPORT-FORMATS.md). One plan, rendered for its reader: the two-page
 * Summary for Commercial customers, the Standard FCP for Corporate and Strategic. A render option, never a document
 * field; the issued version records which one the customer received.
 */
export const REPORT_FORMATS = ["summary"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];
/** What an issued version can record; null on a version issued as the long report. */
export const STORED_REPORT_FORMATS = ["summary", "standard"] as const;

/**
 * What an export or an issue renders: a format, or "full", the long report as it was before the formats. Corporate
 * and Strategic keep the long report until the Standard format is built.
 */
export const REPORT_FORMAT_CHOICES = ["summary", "full"] as const;
export type ReportFormatChoice = (typeof REPORT_FORMAT_CHOICES)[number];

export const REPORT_FORMAT_LABELS: Record<ReportFormatChoice, string> = { summary: "Summary", full: "Full report" };

/**
 * The format follows the tracker segment (engagements.segment), not the FCP's Commercial plan setting, which controls
 * plan generation rather than document length. A record with no segment gets the longer document.
 */
export function defaultReportFormat(segment: Segment | null | undefined): ReportFormatChoice {
  return segment === "commercial" ? "summary" : "full";
}

/** The renderer option for a choice: undefined renders the long report. */
export function reportFormatOption(choice: ReportFormatChoice): ReportFormat | undefined {
  return choice === "full" ? undefined : choice;
}

/** Hours either way that still count as reconciled: each figure is rounded to the hour on the page. */
export const RECONCILE_TOLERANCE_HOURS = 1;

/**
 * The hours as the customer documents print them: hours already delivered, the hours the plan schedules, and the
 * reserve held for change requests, against the entitlement (or the BSAS hours on a BSAS-only deal). Null when no
 * entitled hours are on record. `exact` is true when the printed figures add up to the hour; `balanced` allows the
 * rounding tolerance. `difference` is positive when the plan asks for more than the entitlement holds.
 */
export type HoursReconciliation = { delivered: number; planned: number; reserve: number; entitled: number; deliveredAsOf: string | null; balanced: boolean; exact: boolean; difference: number };

export function reconcileHours(document: EngagementDocument, effort: ScopedEffort, today?: string): HoursReconciliation | null {
  const funded = fundedDocument(document);
  const burndown = buildBurndown(funded, today);
  if (!burndown) return null;
  const delivered = Math.round(burndown.consumedHours);
  const planned = Math.round(effort.totals.total);
  const reserve = Math.round(effort.internal.fit?.reserveHours ?? 0);
  const entitled = Math.round(burndown.entitledHours);
  const difference = delivered + planned + reserve - entitled;
  return { delivered, planned, reserve, entitled, deliveredAsOf: funded.report.entitlement.consumedAsOf, balanced: Math.abs(difference) <= RECONCILE_TOLERANCE_HOURS, exact: difference === 0, difference };
}

/**
 * Why the plan does not fit the entitlement (or the BSAS hours on a BSAS-only deal); null when it fits.
 */
function entitlementProblem(document: EngagementDocument, effort: ScopedEffort, today?: string): string | null {
  const hours = (value: number) => Math.round(value).toLocaleString("en-US");
  const reconciliation = reconcileHours(document, effort, today);
  const unit = document.fields.fundingSource === "bsas" ? "BSAS hours" : "entitlement";
  if (reconciliation) {
    const { delivered, planned, reserve, entitled, difference, balanced } = reconciliation;
    if (balanced) return null;
    const parts = `${hours(delivered)} delivered, ${hours(planned)} planned and ${hours(reserve)} held in reserve`;
    if (difference > 0) return `Under-funded: ${parts} come to ${hours(difference)} hours more than the ${hours(entitled)}-hour ${unit}. Move work to the follow-on or reduce hours in the Plan section.`;
    return `${hours(-difference)} hours are not planned and will be forfeited at term end (${parts}, against the ${hours(entitled)}-hour ${unit}). Plan them in the Plan section.`;
  }
  const gap = effort.internal.fit?.underFunded?.gapHours;
  return gap ? `Under-funded: the plan needs ${hours(gap)} hours more than the ${unit} funds. Move work to the follow-on or reduce hours in the Plan section.` : null;
}

/**
 * The fit could not place its minimum (discovery and the foundation design, or the core) in the funded hours. Nothing is split
 * further and nothing prints for the customer: the planner sees how many more hours the full scope needs and records the
 * decision. Carried to the internal Delivery Handoff through `fit.underFunded`.
 */
export function underFundedScope(document: EngagementDocument, effort: ScopedEffort): string | null {
  const gap = effort.internal.fit?.underFunded;
  if (!gap) return null;
  const hours = (value: number) => Math.round(value).toLocaleString("en-US");
  const unit = document.fields.fundingSource === "bsas" ? "BSAS hours" : "entitlement";
  return `The full scope needs ${hours(gap.fullScopeGapHours)} more hours than the ${unit} funds after the reserve (${hours(gap.gapHours)} more for the minimum that can be delivered). Record the decision to proceed, with the funding or scope change it rests on.`;
}

/**
 * The BSAS pool of an entitlement-plus-BSAS deal, checked against its own term: BSAS hours that no planned follow-on
 * work draws on before the term ends are forfeited. BSAS never goes over (work past what it covers is just follow-on
 * that still needs a purchase), so only the forfeited direction is a problem. Within the rounding tolerance it fits.
 */
function bsasPoolProblem(document: EngagementDocument, effort: ScopedEffort): string | null {
  if (document.fields.fundingSource !== "entitlement-bsas") return null;
  const allocation = planBsasAllocation(document, effort);
  if (!allocation || allocation.forfeitedHours <= RECONCILE_TOLERANCE_HOURS) return null;
  const hours = (value: number) => Math.round(value).toLocaleString("en-US");
  return `${hours(allocation.forfeitedHours)} hours are not planned and will be forfeited at term end (${hours(allocation.plannedHours)} planned against the ${hours(allocation.term.hours)}-hour BSAS allocation, ${allocation.term.termStart} to ${allocation.term.termEnd}). Plan follow-on work inside the BSAS term.`;
}

/**
 * Why the plan does not fit its funding, for the planner; null when it fits. Each funding pool is checked on its own:
 * the entitlement against its plan, and BSAS against its own allocation and term. An issue with a problem needs a
 * logged reason to go ahead. Never printed in a customer document.
 */
export function fundingProblem(document: EngagementDocument, effort: ScopedEffort, today?: string): string | null {
  const problems = [entitlementProblem(document, effort, today), underFundedScope(document, effort), bsasPoolProblem(document, effort)].filter((problem): problem is string => Boolean(problem));
  return problems.length ? problems.join(" ") : null;
}
