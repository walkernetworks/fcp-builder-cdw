import { fundedDocument } from "./bsas";
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

/**
 * The hours as the customer documents print them: hours already delivered plus the hours the plan schedules, against
 * the entitlement (or the BSAS hours on a BSAS-only deal). Null when no entitled hours are on record.
 */
export type HoursReconciliation = { delivered: number; planned: number; entitled: number; deliveredAsOf: string | null; balanced: boolean; difference: number };

export function reconcileHours(document: EngagementDocument, effort: ScopedEffort, today?: string): HoursReconciliation | null {
  const funded = fundedDocument(document);
  const burndown = buildBurndown(funded, today);
  if (!burndown) return null;
  const delivered = Math.round(burndown.consumedHours);
  const planned = Math.round(effort.totals.total);
  const entitled = Math.round(burndown.entitledHours);
  const difference = delivered + planned - entitled;
  return { delivered, planned, entitled, deliveredAsOf: funded.report.entitlement.consumedAsOf, balanced: difference === 0, difference };
}

/**
 * Why the plan does not fit its funding, for the planner; null when it fits. An issue with a problem needs a logged
 * reason to go ahead. Never printed in a customer document.
 */
export function fundingProblem(document: EngagementDocument, effort: ScopedEffort, today?: string): string | null {
  const hours = (value: number) => Math.round(value).toLocaleString("en-US");
  const reconciliation = reconcileHours(document, effort, today);
  const unit = document.fields.fundingSource === "bsas" ? "BSAS hours" : "entitlement";
  if (reconciliation) {
    const { delivered, planned, entitled, difference } = reconciliation;
    if (difference > 0) return `Under-funded: ${hours(delivered)} hours delivered plus ${hours(planned)} planned is ${hours(difference)} more than the ${hours(entitled)}-hour ${unit}. Move work to the follow-on or reduce hours in the Plan section.`;
    if (difference < 0) return `${hours(delivered)} hours delivered plus ${hours(planned)} planned leaves ${hours(-difference)} of the ${hours(entitled)}-hour ${unit} unplanned. Plan the remaining hours in the Plan section.`;
    return null;
  }
  const gap = effort.internal.fit?.underFunded?.gapHours;
  return gap ? `Under-funded: the plan needs ${hours(gap)} hours more than the ${unit} funds. Move work to the follow-on or reduce hours in the Plan section.` : null;
}
