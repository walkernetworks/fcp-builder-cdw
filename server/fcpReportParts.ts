import { bsasTerm, fundedDocument, isBsasOnly } from "../shared/bsas";
import { buildBurndown, unscopedWorkPackageIds, timelinesWithDeferrals, withOwnership, type Burndown, type ScopedEffort } from "../shared/effort";
import { calculateEntitlementEndDate, type EngagementDocument, type Timeline } from "../shared/fcp";
import { effectiveReport, termEndAssumed } from "../shared/reportView";
import { projectOperationalTimelineToMonths, sliceTimeline } from "./timelineHtml";

/** Pieces shared by the customer FCP formats: escaping, dates and numbers, and the plan as it prints. */

export const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Picks the entitlement wording, or the BSAS wording for a BSAS-only deal. */
export type Wording = (entitlement: string, bsas: string) => string;
export const ENTITLEMENT_WORDING: Wording = entitlement => entitlement;

function parseIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3] ?? 1))) : null;
}
export function longDate(value: string): string {
  const date = parseIso(value);
  return date ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date) : value;
}
export function shortDate(value: string): string {
  const date = parseIso(value);
  if (!date) return value;
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date);
  return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}
export const firstSentence = (text = "", maximum = 150) => {
  const sentence = (text.split(/(?<=\.)\s/)[0] || "").trim();
  return sentence.length > maximum ? `${sentence.slice(0, maximum - 1).trim()}…` : sentence;
};
export const hours = (value: number) => `${Math.round(value).toLocaleString("en-US")}`;
export const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

/** Text that ends in exactly one full stop, whatever the source text ended with. */
export function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Bar labels without the planner's "depth to be confirmed" prompt, which is not for the customer. */
export const UNDECIDED_DEPTH = / — depth to be confirmed$/;
export const customerFacing = (timeline: Timeline): Timeline => ({ ...timeline, lanes: timeline.lanes.map(lane => ({ ...lane, bars: lane.bars.map(bar => ({ ...bar, label: bar.label.replace(UNDECIDED_DEPTH, "") })) })) });

/**
 * The entitlement window by month: up to 13 calendar months when it starts and ends mid-month, stopping at the end of
 * the term when less than a year is left.
 */
export function entitlementWindowTimeline(document: EngagementDocument, termEnd: string | null): Timeline {
  const operational = projectOperationalTimelineToMonths(customerFacing(document.adoptionTimeline));
  const opStart = /^(\d{4})-(\d{2})/.exec(operational.startDate);
  const opEnd = termEnd ? /^(\d{4})-(\d{2})/.exec(termEnd) : null;
  const termColumns = opStart && opEnd ? (Number(opEnd[1]) - Number(opStart[1])) * 12 + Number(opEnd[2]) - Number(opStart[2]) + 1 : 13;
  return sliceTimeline(operational, 1, Math.max(1, Math.min(13, termColumns, operational.columns.length)));
}

/** The plan as every customer format prints it: funded, with deferred work moved after the entitlement. */
export type PreparedReport = {
  bsasOnly: boolean;
  w: Wording;
  deferredWork: ScopedEffort["workPackages"];
  customerTimelines: { adoption: Timeline; notional: Timeline };
  document: EngagementDocument;
  today: string;
  asOf: string;
  customer: string;
  burndown: Burndown | null;
  termEnd: string | null;
  assumedEnd: boolean;
  termStart: string | null;
  bsas: ReturnType<typeof bsasTerm>;
};

export function prepareReport(input: EngagementDocument, options: { today?: string; effort: ScopedEffort }): PreparedReport {
  // A BSAS-only deal is drawn with BSAS in the entitlement's place: BSAS hours, the BSAS term, and no dollar figure.
  const source = fundedDocument(input);
  const bsasOnly = isBsasOnly(source.fields);
  const w: Wording = (entitlement, bsasText) => (bsasOnly ? bsasText : entitlement);
  // The report as it prints: generated rows the planner kept plus the planner's completed rows.
  // Work the entitlement cannot carry is drawn after it, in the Two-Year Notional.
  const deferredWork = options.effort.workPackages.filter(row => row.deferred);
  // Every bar carries who owns it (the planner's choice or the default) for drawing and sequencing.
  const customerTimelines = timelinesWithDeferrals(withOwnership(source), deferredWork.map(row => row.id), unscopedWorkPackageIds(options.effort));
  const planned: EngagementDocument = { ...source, adoptionTimeline: customerTimelines.adoption, twoYearPlan: customerTimelines.notional };
  const document: EngagementDocument = { ...planned, report: effectiveReport(planned) };
  const { fields, report } = document;
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const asOf = report.asOf || today;
  const customer = fields.customerName || "the customer";
  const burndown = buildBurndown(document, today);
  const termEnd = burndown?.termEnd || report.entitlement.termEnd || calculateEntitlementEndDate(fields.entitlementStart) || null;
  const assumedEnd = termEndAssumed(document);
  const termStart = burndown?.termStart || report.entitlement.termStart || fields.entitlementStart || null;
  const bsas = bsasTerm(fields, termEnd);
  return { bsasOnly, w, deferredWork, customerTimelines, document, today, asOf, customer, burndown, termEnd, assumedEnd, termStart, bsas };
}

/** Fixed position, so print repeats it on every page. Text and CSS only, no fonts or images. */
export const DRAFT_MARK = `<style>.draft-mark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font:800 60px/1 Arial,"Helvetica Neue",sans-serif;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;color:rgba(110,110,110,.24);pointer-events:none;z-index:9999}@media print{.draft-mark{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style><div class="draft-mark" aria-hidden="true">Draft, not for distribution</div>`;

/** The reserve, as every customer format prints it: one line, so delivered + planned + reserve = entitlement. */
export const RESERVE_LINE = "Held for change requests, released to follow-on work if unused";
