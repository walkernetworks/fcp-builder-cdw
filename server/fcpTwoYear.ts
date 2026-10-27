import type { BsasAllocation } from "../shared/bsas";
import { barWindow } from "../shared/buildingBlocks";
import { formatWindow, type ScopedEffort, type WorkPackageEffort } from "../shared/effort";
import type { EngagementDocument, Timeline } from "../shared/fcp";
import { customerFacing, esc, hours, longDate, shortDate, type PreparedReport } from "./fcpReportParts";
import { renderTimeline, sliceTimeline } from "./timelineHtml";
import { packageLabel, summaryTimeline } from "./timelineLabels";

/**
 * The two-year view's second year, shared by every customer format: the Summary's page 3 and the Standard's roadmap.
 * A Gantt that starts the month after the entitlement ends (or after planned completion when no entitlement is
 * booked), the follow-on work in hours, and how it is funded. Hours and dates only. It has content only when there is
 * follow-on or notional work, so a plan with none stays a page shorter.
 */

export type TwoYearInput = {
  document: EngagementDocument;
  effort: ScopedEffort;
  prepared: Pick<PreparedReport, "customer" | "termEnd" | "assumedEnd" | "bsasOnly" | "w" | "customerTimelines">;
  /** Whether an entitlement (or BSAS term) is booked; without one the plan's own finish is the boundary. */
  booked: boolean;
  /** The plan's finish, used as the boundary when no entitlement is booked. */
  plannedEnd: string | null;
  followOnRows: WorkPackageEffort[];
  /** The BSAS pool beside an entitlement; null otherwise. */
  bsasPlan: BsasAllocation | null;
  /** `roles` adds the hours by role and the BSAS hours per package (Standard); the default is package, month, hours. */
  detail?: boolean;
};

export type TwoYearView = {
  /** True when there are follow-on packages with hours, or a BSAS pool. */
  hasContent: boolean;
  /** The page body: heading, lead, Gantt, follow-on table and the funding box. Empty without content. */
  html: string;
};

/**
 * The customer problems the follow-on work addresses: a problem counts only when what addresses it names a follow-on
 * package, by that package's label. A word the two share ("design", "platform") is not a link. There is no stored link
 * between a problem and a package yet. Nothing is written for the customer; the problem is quoted as recorded.
 */
export function problemsAddressedByFollowOn(document: EngagementDocument, followOnRows: WorkPackageEffort[]): string[] {
  const labels = followOnRows.map(row => packageLabel(row.label).trim().toLowerCase()).filter(Boolean);
  return document.report.problems.filter(item => item.problem.trim() && labels.some(label => item.addressedBy.toLowerCase().includes(label))).map(item => item.problem.trim().replace(/[.\s]+$/, ""));
}

export function twoYearView(input: TwoYearInput): TwoYearView {
  const { document, effort, prepared, booked, plannedEnd, followOnRows, bsasPlan } = input;
  const { customer, termEnd, assumedEnd, bsasOnly, w, customerTimelines } = prepared;
  const num = (value: number) => hours(value);

  // The boundary: the end of the entitlement, or of the plan when nothing is booked.
  const boundary = booked ? termEnd : plannedEnd;
  const notional = customerFacing(customerTimelines.notional);
  const start = /^(\d{4})-(\d{2})/.exec(notional.startDate);
  const end = boundary ? /^(\d{4})-(\d{2})/.exec(boundary) : null;
  const firstAfter = start && end ? Math.max(1, (Number(end[1]) - Number(start[1])) * 12 + Number(end[2]) - Number(start[2]) + 2) : booked ? 13 : 1;
  const slice: Timeline | null = notional.lanes.length && firstAfter <= notional.columns.length ? sliceTimeline(notional, firstAfter, Math.min(firstAfter + 11, notional.columns.length)) : null;
  const hasBars = Boolean(slice?.lanes.some(lane => lane.bars.length));
  // The generic notional lanes (governance reviews, operating model, service consumption) alone do not make a page.
  if (!followOnRows.length && !bsasPlan) return { hasContent: false, html: "" };

  const window = booked ? w("entitlement", "BSAS term") : "planned delivery window";
  const first = slice?.columns[0];
  const last = slice?.columns.at(-1);
  const lead = `${first && last ? `${esc(first)} through ${esc(last)}, the` : "The"} second year of the two-year view. This is where ${esc(customer)} goes next. ${booked ? `None of it is funded by the current ${esc(w("entitlement", "BSAS hours"))}.` : "None of it is in the planned delivery window."}`;
  const gantt = slice && hasBars ? renderTimeline(summaryTimeline(slice), "No activities are scheduled after the plan.", undefined, { skipEmptyCategories: true, legendFromChart: true }) : "";

  // ---- Follow-on work: package, month, hours; the Standard adds the hours by role and the BSAS hours
  const notionalBars = new Map(customerTimelines.notional.lanes.flatMap(lane => lane.bars).map(bar => [bar.id, bar]));
  const monthOf = (row: WorkPackageEffort) => {
    const bar = notionalBars.get(row.id);
    const span = bar ? barWindow(customerTimelines.notional, bar) : null;
    return span && (!boundary || span.start > boundary) ? formatWindow(span.start, span.end) : boundary ? `After ${shortDate(boundary)}` : `After the ${window}`;
  };
  const totals = followOnRows.reduce((sum, row) => ({ architect: sum.architect + row.followOn!.architect, srConsultant: sum.srConsultant + row.followOn!.srConsultant, projectManager: sum.projectManager + row.followOn!.projectManager, total: sum.total + row.followOn!.total }), { architect: 0, srConsultant: 0, projectManager: 0, total: 0 });
  const bsasById = new Map(bsasPlan?.rows.map(row => [row.id, row.bsasHours]) ?? []);
  const designInPlan = effort.workPackages.some(row => !row.deferred && row.total > 0 && row.id.startsWith("bar-playbook-design"));
  const table = (() => {
    if (!followOnRows.length) return "";
    const detail = Boolean(input.detail);
    const headers = detail ? ["Work package", "Planned window", "Lead role", "Architect", "Sr. Consultant", "PM", "Total hours", ...(bsasPlan ? ["BSAS hours"] : [])] : ["Package", "Month", "Hours", ...(bsasPlan ? ["BSAS hours"] : [])];
    const cell = (value: string, index: number, tag: "td" | "th") => `<${tag}${(detail ? index >= 3 : index >= 2) ? ' class="num"' : ""}>${value}</${tag}>`;
    const rows = followOnRows.map(row => detail
      ? [esc(packageLabel(row.label)), esc(monthOf(row)), esc(row.leadRole), num(row.followOn!.architect), num(row.followOn!.srConsultant), num(row.followOn!.projectManager), num(row.followOn!.total), ...(bsasPlan ? [num(bsasById.get(row.id) ?? 0)] : [])]
      : [esc(packageLabel(row.label)), esc(monthOf(row)), num(row.followOn!.total), ...(bsasPlan ? [num(bsasById.get(row.id) ?? 0)] : [])]);
    const total = detail
      ? ["Total follow-on hours", "", "", num(totals.architect), num(totals.srConsultant), num(totals.projectManager), num(totals.total), ...(bsasPlan ? [num(bsasPlan.plannedHours)] : [])]
      : ["Total follow-on", "", num(totals.total), ...(bsasPlan ? [num(bsasPlan.plannedHours)] : [])];
    return `<h3>Follow-on Work</h3><table class="wp std" data-foot="sum"><thead><tr>${headers.map((header, index) => cell(esc(header), index, "th")).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((value, index) => cell(value, index, "td")).join("")}</tr>`).join("")}<tr class="total">${total.map((value, index) => cell(value, index, "td")).join("")}</tr></tbody></table><p class="note">Estimated CDW hours${designInPlan ? ", planned against a design already completed in year one" : ""}.</p>`;
  })();

  // ---- How it's funded: hours and dates only, never an amount
  const ends = termEnd ? `, ${bsasOnly ? "whose term ends" : "which ends"} ${longDate(termEnd)}${assumedEnd ? " (to be confirmed)" : ""}` : "";
  const notDrawn = booked ? `This work is not drawn from the current ${esc(w("entitlement", "BSAS hours"))}${ends}.` : `This work is not part of the planned delivery window.`;
  // BSAS funding the work is stated directly; only what BSAS does not cover still needs a purchase.
  const options = bsasPlan
    ? bsasPlan.unfundedHours > 0 ? `The other ${hours(bsasPlan.unfundedHours)} hours need a renewal with a services entitlement attached or a services purchase.` : ""
    : bsasOnly ? "It needs additional BSAS hours or a services purchase." : "It needs one of: a renewal with a services entitlement attached, a services purchase, or Broadcom Software Adoption Services hours.";
  const bsasLine = bsasPlan
    ? `Broadcom Software Adoption Services (BSAS) fund this work: ${hours(bsasPlan.term.hours)} hours from ${shortDate(bsasPlan.term.termStart)} to ${shortDate(bsasPlan.term.termEnd)}${bsasPlan.term.startAssumed || bsasPlan.term.endAssumed ? " (dates to be confirmed)" : ""}. ${hours(bsasPlan.plannedHours)} hours are planned${bsasPlan.forfeitedHours > 0 ? `; ${hours(bsasPlan.forfeitedHours)} hours are not planned and will be forfeited at term end` : ""}.`
    : "";
  const problems = problemsAddressedByFollowOn(document, followOnRows);
  const why = problems.length ? `The sooner it is funded, the sooner this is addressed: ${problems.map(item => item.charAt(0).toLowerCase() + item.slice(1)).join("; ")}.` : "";
  const funding = `<h3>How It's Funded</h3><div class="after">${[notDrawn, bsasLine, options, why].filter(Boolean).map(line => `<p>${esc(line)}</p>`).join("")}</div>`;

  const body = table ? `<div class="two"><div>${table}</div><div>${funding}</div></div>` : funding;
  return { hasContent: true, html: `<h2>After the ${esc(booked ? w("Entitlement", "BSAS Term") : "Plan")}</h2><p class="lead">${lead}</p>${gantt}${body}` };
}
