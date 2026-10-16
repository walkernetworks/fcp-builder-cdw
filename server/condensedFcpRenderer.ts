import { barWindow } from "../shared/buildingBlocks";
import { buildBurndown, buildCustomerEffort, formatWindow, timelinesWithDeferrals, withOwnership, type Burndown, type ScopedEffort } from "../shared/effort";
import { activityOwner, calculateEntitlementEndDate, domainHosts, domainPackages, effectivePlatformEdition, FIXED_GANTT_CATEGORIES, summarizeCompatibilityHandoff, planOutcomeLabel, playbookPlanForFields, resolvePlanOutcomes, type EngagementDocument, type Timeline, type TimelineBar, type TimelineCategory, type WorkstreamType } from "../shared/fcp";
import { effectiveReport, minimumTargetRelease, planKeyDates, platformName, selectedScopeSummary, termEndAssumed } from "../shared/reportView";
import { VCF_CORPUS } from "../shared/vcfCorpus";
import { DOMAIN_BUILD_WEIGHTS } from "../shared/hoursConfig";
import { summarizeHclFindings } from "../shared/hcl";
import { deliveryBriefing, renewalStartsCurrentTerm } from "../shared/deliveryBriefing";
import { getIndustryDiscoveryTemplate } from "../shared/industryDiscovery";
import { cdwLogoSvg } from "./brand/cdwLogo";
import { projectOperationalTimelineToMonths, renderTimeline, sliceTimeline } from "./timelineHtml";

/**
 * Condensed FCP (FCP 2.0, "Make Amazing Happen"). Customer-facing: carries exactly one dollar figure
 * (the entitlement value), hours only, and never the internal fit check, rates, gap, or risk band.
 * Self-contained HTML (no external fonts, scripts, or images); the PDF is printed from it.
 */

const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LEGEND = "CDW — Proprietary and confidential. Copying restricted.";

function parseIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3] ?? 1))) : null;
}
function longDate(value: string): string {
  const date = parseIso(value);
  return date ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date) : value;
}
function shortDate(value: string): string {
  const date = parseIso(value);
  if (!date) return value;
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date);
  return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}
const firstSentence = (text = "", maximum = 150) => {
  const sentence = (text.split(/(?<=\.)\s/)[0] || "").trim();
  return sentence.length > maximum ? `${sentence.slice(0, maximum - 1).trim()}…` : sentence;
};
const hours = (value: number) => `${Math.round(value).toLocaleString("en-US")}`;
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

// ---------------------------------------------------------------------------------------------
// Plan items: the generated timeline condensed for the customer view
// ---------------------------------------------------------------------------------------------

type Swatch = "governance" | "operating" | "infrastructure" | "migration" | "consume" | "security" | "muted";
type PlanItem = { category: TimelineCategory; label: string; start: string; end: string; swatch: Swatch; milestone: boolean; outcome: string; dependsOn: string[]; customerOwned?: boolean };

const SWATCH_BY_WORKSTREAM: Record<WorkstreamType, Swatch> = {
  Governance: "governance",
  "Operating Model / Platform": "operating",
  "Infrastructure Build": "infrastructure",
  "Migration Waves": "migration",
  "Consume / Handover": "consume",
  "Security & Resiliency": "security",
};

const DESIGN_ID = /^bar-(playbook-design-|playbook-component-design-)/;

function planItems(document: EngagementDocument, customer: string): PlanItem[] {
  const timeline = document.adoptionTimeline;
  const all = timeline.lanes.flatMap(lane => lane.bars.map(bar => ({ lane, bar, window: barWindow(timeline, bar) })));
  const labelOf = new Map(all.map(({ bar }) => [bar.id, bar.label]));
  const items: PlanItem[] = [];
  const span = (entries: typeof all) => {
    const windows = entries.flatMap(entry => (entry.window ? [entry.window] : []));
    return windows.length ? { start: windows.map(window => window.start).sort()[0], end: windows.map(window => window.end).sort().at(-1)! } : null;
  };

  const design = span(all.filter(({ bar }) => DESIGN_ID.test(bar.id) && activityOwner(bar) === "cdw"));
  if (design) items.push({ category: "Modernize Infrastructure", label: "Design discovery, architecture and design", ...design, swatch: "infrastructure", milestone: true, outcome: "Design signed off; hosts, storage, network and change windows agreed.", dependsOn: [] });

  for (const { lane, bar, window } of all) {
    // Customer-owned work comes through the customer-owned work rows; design is drawn as one span above.
    const owner = activityOwner(bar);
    if (!window || owner === "customer" || (DESIGN_ID.test(bar.id) && owner === "cdw") || bar.id === "bar-platform-plan") continue;
    const gate = owner === "checkpoint";
    const hardware = bar.id === "bar-hcl-gate";
    items.push({
      category: lane.category,
      label: hardware ? "Hardware compatibility confirmed" : bar.label.replace(UNDECIDED_DEPTH, ""),
      start: window.start,
      end: window.end,
      swatch: gate ? "muted" : SWATCH_BY_WORKSTREAM[lane.workstreamType],
      milestone: bar.milestone && !gate,
      outcome: hardware ? "Gate: platform build starts only once hardware compatibility is confirmed." : gate ? `Checkpoint: ${firstSentence(bar.outcome) || "confirmed before the next stage starts."}` : firstSentence(bar.outcome),
      dependsOn: (bar.prerequisites ?? []).flatMap(id => (labelOf.has(id) && !DESIGN_ID.test(id) ? [labelOf.get(id)!] : DESIGN_ID.test(id) ? ["design sign-off"] : [])),
    });
  }

  for (const work of document.report.customerOwnedWork) {
    const start = work.start.length === 7 ? `${work.start}-01` : work.start;
    const end = work.end.length === 7 ? `${work.end}-28` : work.end;
    items.push({ category: "Modernize Infrastructure", label: work.label, start, end, swatch: "muted", milestone: false, outcome: `${customer} runs this work.`, dependsOn: [], customerOwned: true });
  }
  return items.sort((left, right) => left.start.localeCompare(right.start) || left.label.localeCompare(right.label));
}

/** Text that ends in exactly one full stop, whatever the source text ended with. */
function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function deadlines(document: EngagementDocument, termEnd: string | null): PlanItem[] {
  const out: PlanItem[] = [];
  if (termEnd) out.push({ category: "Program Management & Governance", label: `Expiry ${shortDate(termEnd).replace(/ \d{4}$/, "")}${termEndAssumed(document) ? " (to confirm)" : ""}`, start: termEnd, end: termEnd, swatch: "muted", milestone: true, outcome: "Unconsumed hours are not refunded.", dependsOn: [] });
  const renewal = document.report.discovery.renewalDate;
  if (renewal && !renewalStartsCurrentTerm(document)) out.push({ category: "Program Management & Governance", label: `Subscription renewal ${shortDate(renewal).replace(/ \d{4}$/, "")}`, start: renewal, end: renewal, swatch: "muted", milestone: true, outcome: "Licensing activated and the renewal sized before this date.", dependsOn: [] });
  const onVsphere8 = document.inventory.esxiVersions.some(item => /\b8\.\d/.test(item.version));
  if (onVsphere8) out.push({ category: "Program Management & Governance", label: "vSphere 8 end of support", start: "2027-10-11", end: "2027-10-11", swatch: "muted", milestone: true, outcome: "vSphere 8 reaches end of general support on 11 October 2027.", dependsOn: [] });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Generated content
// ---------------------------------------------------------------------------------------------

const PROFILE_CATEGORIES: Array<[keyof EngagementDocument["report"]["designProfile"], string]> = [
  ["consumption", "Consumption"], ["physicalSite", "Physical Site Configuration"], ["availability", "Availability"],
  ["isolation", "Isolation"], ["recoverability", "Recoverability"], ["expansion", "Expansion"],
];

// ---------------------------------------------------------------------------------------------
// HTML building blocks
// ---------------------------------------------------------------------------------------------

function table(headers: string[], rows: string[][], options: { total?: string[]; numeric?: number[]; foot?: boolean } = {}): string {
  const numeric = new Set(options.numeric ?? []);
  const cell = (value: string, index: number, tag: "td" | "th") => `<${tag}${numeric.has(index) ? ' class="num"' : ""}>${value}</${tag}>`;
  return `<table${options.foot ? ' data-foot="sum"' : ""}><thead><tr>${headers.map((header, index) => cell(esc(header), index, "th")).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((value, index) => cell(value, index, "td")).join("")}</tr>`).join("")}${options.total ? `<tr class="total">${options.total.map((value, index) => cell(value, index, "td")).join("")}</tr>` : ""}</tbody></table>`;
}

/** Bar labels without the planner's "depth to be confirmed" prompt, which is not for the customer. */
const UNDECIDED_DEPTH = / — depth to be confirmed$/;
const customerFacing = (timeline: Timeline): Timeline => ({ ...timeline, lanes: timeline.lanes.map(lane => ({ ...lane, bars: lane.bars.map(bar => ({ ...bar, label: bar.label.replace(UNDECIDED_DEPTH, "") })) })) });

/** The entitlement window and the two-year notional, drawn with the same category Gantt as the full FCP. */
function timelineSheets(document: EngagementDocument, windowStart: string, windowEnd: string, termEnd: string | null, includeEntitlement = true): { entitlement: string; notional: string } {
  const sheet = (eyebrow: string, heading: string, intro: string, timeline: Timeline, empty: string) =>
    `<section class="tl-sheet"><div class="tl-head"><span>${esc(eyebrow)}</span><h2>${esc(heading)}</h2><p>${intro}</p></div>${renderTimeline(timeline, empty)}</section>`;
  const operational = projectOperationalTimelineToMonths(customerFacing(document.adoptionTimeline));
  // The entitlement window spans up to 13 calendar months when it starts and ends mid-month, and stops at the end of
  // the term when less than a year is left.
  const opStart = /^(\d{4})-(\d{2})/.exec(operational.startDate);
  const opEnd = termEnd ? /^(\d{4})-(\d{2})/.exec(termEnd) : null;
  const termColumns = opStart && opEnd ? (Number(opEnd[1]) - Number(opStart[1])) * 12 + Number(opEnd[2]) - Number(opStart[2]) + 1 : 13;
  const entitlementWindow = sliceTimeline(operational, 1, Math.max(1, Math.min(13, termColumns, operational.columns.length)));
  const entitlement = includeEntitlement && document.adoptionTimeline.lanes.length
    ? sheet("Adoption Timeline · entitlement window", "Private Cloud Adoption Timeline", `${esc(windowStart)} through ${esc(windowEnd)}. The entitlement-funded delivery sequence by month, under the five standard categories; work after the entitlement ends is carried in the Two-Year Notional. ◆ marks key delivered functionality.`, entitlementWindow, "No activities are scheduled in the entitlement window.")
    : "";
  const plan = customerFacing(document.twoYearPlan);
  // The notional picks up the month after the entitlement ends, so the entitlement year is not drawn twice.
  // An entitlement that started mid-year or ends early leaves more than 12 notional months; they run over more sheets.
  const start = /^(\d{4})-(\d{2})/.exec(plan.startDate);
  const end = termEnd ? /^(\d{4})-(\d{2})/.exec(termEnd) : null;
  // Without the entitlement sheet (the delivery adoption timeline checkbox is off), the notional covers the whole horizon.
  const firstAfter = !includeEntitlement ? 1 : start && end ? Math.max(1, (Number(end[1]) - Number(start[1])) * 12 + Number(end[2]) - Number(start[2]) + 2) : 13;
  const sheets: Timeline[] = [];
  for (let from = firstAfter; from <= plan.columns.length; from += 12) sheets.push(sliceTimeline(plan, from, Math.min(from + 11, plan.columns.length)));
  const notional = plan.lanes.length && sheets.length
    ? sheets.map((part, index) => {
      const first = part.columns[0] || "";
      const last = part.columns[part.columns.length - 1] || "";
      return sheet(
        `Two-Year Notional · ${first} to ${last}`,
        !includeEntitlement ? (index ? "Two-Year Notional, Continued" : "Two-Year Notional") : index ? "After the Entitlement, Continued" : "After the Entitlement",
        index
          ? `${esc(first)} through ${esc(last)}. Lifecycle, adoption and expansion direction that may need future scope or funding.`
          : !includeEntitlement
            ? `A directional roadmap from ${esc(first)} through ${esc(last)}. Work after the entitlement ends${termEnd ? ` on ${esc(longDate(termEnd))}` : ""} is not funded by the current entitlement.`
            : `${esc(first)} through ${esc(last)}, after the entitlement ends${termEnd ? ` on ${esc(longDate(termEnd))}` : ""}. Directional work that is not funded by the current entitlement and may need future scope or funding.`,
        part,
        `No notional activities are scheduled from ${esc(first)} to ${esc(last)}.`,
      );
    }).join("")
    : "";
  return { entitlement, notional };
}

const CSS = `
:root{--ink:#1d1d1f;--slate:#3c4250;--muted:#6b7280;--line:#e3e6ea;--red:#CC0000;--char:#54565B;--gray:#898B8E;--zebra:#F7F8FA;--hair:#E4E7EC;--dark:#242a38}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:var(--ink);font:12.5px/1.5 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
@page{size:letter landscape;margin:.35in .45in .3in}
@page :first{margin:0}
.cover{width:11in;height:8.5in;background:var(--red);color:#fff;padding:.7in .8in;position:relative;overflow:hidden;break-after:page;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cover .logo{width:1.15in;color:#fff}
.cover .orbit{position:absolute;right:-1.3in;top:-1.6in;width:7.5in;color:#fff;opacity:.12}
.cover .eyebrow{margin-top:1.55in;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.cover h1{font-size:40px;line-height:1.08;font-weight:900;letter-spacing:-.02em;max-width:7.2in;margin:.12in 0 0}
.cover .sign{font-size:19px;font-weight:900;margin-top:.22in}
.cover .meta{position:absolute;left:.8in;bottom:.95in;display:flex;gap:.7in;font-size:11px}
.cover .meta b{display:block;font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:3px}
.cover .legend{position:absolute;left:.8in;bottom:.4in;font-size:8.5px;opacity:.9}
.page{width:100%;border-collapse:collapse}
.page>thead td,.page>tfoot td{padding:0}
.strip{display:flex;justify-content:space-between;align-items:center;border-top:4px solid var(--red);padding:6px 0 8px;border-bottom:1px solid var(--line);margin-bottom:12px;font-size:8.5px;color:var(--muted);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.strip .logo{width:.45in;color:var(--red);vertical-align:middle;margin-right:8px}
.legendrow{font-size:8px;color:var(--gray);padding-top:8px;border-top:1px solid var(--line);margin-top:12px}
.title{margin:6px 0 4px;font-size:22px;font-weight:900;letter-spacing:-.01em;color:var(--ink)}
.lead-in{margin:0 0 4px;font-size:12.5px;color:var(--slate)}
.pills{font-size:10.5px;color:var(--slate);padding:9px 2px;border-bottom:2px solid var(--red)}
.pills b{color:var(--ink)}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);border-top:0;margin-bottom:6px}
.kpi{padding:10px 14px;border-right:1px solid var(--line)}
.kpi:last-child{border-right:0}
.kpi .v{font-size:19px;font-weight:900;color:var(--red)}
.kpi .l{font-size:11px;font-weight:800;margin-top:2px}
.kpi .sub{font-size:9.5px;color:var(--muted);margin-top:2px}
.wp-detail{font-size:9px;line-height:1.35;color:var(--muted);margin-top:2px;font-weight:400}
h2{font-size:19px;font-weight:800;margin:20px 0 4px;break-after:avoid}
h3{font-size:14px;font-weight:800;margin:14px 0 4px;break-after:avoid}
p.lead{color:var(--muted);margin:0 0 8px}
ul{margin:6px 0;padding-left:18px}
li{margin:3px 0}
table{width:100%;border-collapse:collapse;margin:8px 0;font-size:10.5px}
th{background:#eef0f3;color:var(--slate);font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;text-align:left;padding:6px 8px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
td{padding:6px 8px;border-bottom:1px solid var(--hair);vertical-align:top;color:var(--slate)}
td:first-child{font-weight:700;color:var(--ink)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
tr.cat td{background:#f3f4f6;color:var(--ink);font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:5px 8px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
tr.total td{font-weight:800;color:var(--ink);border-top:2px solid #1A1D21}
tr{break-inside:avoid}
.note{background:#FFF7E6;border-left:4px solid #d97706;padding:9px 13px;margin:10px 0;font-size:11.5px;color:#4b3410;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bd{margin:8px 0 4px}
.bd-bar{position:relative;height:18px;background:#EEF0F3;border-radius:4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bd-fill{height:100%;background:var(--red);border-radius:4px 0 0 4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bd-tick{position:absolute;top:-4px;bottom:-4px;width:3px;background:#1A1D21;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.keep{break-inside:avoid}
.closer{font-size:18px;font-weight:900;border-top:3px solid var(--red);padding-top:8px;margin:22px 0 6px;break-after:avoid}
.closer.red{color:var(--red)}
.tl-sheet{break-before:page;break-inside:avoid}
.tl-head{margin:0 0 8px;padding:0 0 7px;border-bottom:2px solid var(--dark)}
.tl-head span{display:block;color:var(--red);font-size:8px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.tl-head h2{margin:2px 0 3px}
.tl-head p{margin:0;color:var(--muted);font-size:9.5px;line-height:1.35}
.timeline-legend{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:0 0 6px;font-size:7.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}
.timeline-legend-item{display:inline-flex;align-items:center;gap:4px;border:1px solid;border-radius:999px;padding:2px 5px;font-size:7px;line-height:1;font-weight:800;letter-spacing:0;text-transform:none;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.timeline-legend-item i{display:inline-block;width:6px;height:6px;border-radius:999px;background:currentColor;opacity:.55}
.timeline-wrap{border:1px solid var(--line);background:#fff}
.timeline-empty{border:1px solid var(--line);background:#f8fafc;color:#475569;padding:16px;font-size:11px}
.timeline-grid{display:grid;width:100%;min-width:0!important;grid-template-columns:1.25in repeat(var(--timeline-slots,12),minmax(0,1fr))!important}
.timeline-corner,.timeline-head{background:#eef2f6;font-size:7px;font-weight:700;padding:4px 3px;line-height:1.1;border-right:1px solid var(--line);border-bottom:1px solid var(--line);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.timeline-lane{padding:5px 6px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.timeline-category-lane{grid-column:1}
.timeline-lane strong{display:block;color:var(--dark);font-size:8px;line-height:1.2}
.timeline-row{display:grid;position:relative;align-items:center;border-bottom:1px solid var(--line);background-image:linear-gradient(to right,transparent calc(100% - 1px),#e2e8f0 calc(100% - 1px));background-size:calc(100% / var(--months,12)) 100%}
.timeline-category-row{min-width:0!important;min-height:30px!important;grid-template-rows:none!important;grid-auto-rows:minmax(18px,auto)}
.timeline-bar{margin:2px;padding:3px 4px;border:1px solid;border-radius:3px;font-size:6.8px;font-weight:700;line-height:1.1;min-height:16px;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.timeline-bar.deferred{border-style:dashed}
.ms{display:grid;grid-template-columns:1.4in 1fr;gap:6px;margin:4px 0;font-size:11.5px}
.ms b{color:var(--ink)}
.revision{background:#FFF7E6;border-left:4px solid #d97706;padding:9px 13px;margin:12px 0;font-size:10.5px}
.sources{font-size:9px;color:var(--muted);margin-top:10px}
.printbtn{position:fixed;right:18px;bottom:18px;background:var(--red);color:#fff;border:0;border-radius:999px;padding:10px 18px;font-weight:800;cursor:pointer}
@media print{.printbtn{display:none}}
@media screen{body{max-width:11in;margin:0 auto}.cover{width:100%}}
`;

export type CondensedFcpOptions = { today?: string; effort: ScopedEffort };

export function renderCondensedFcpHtml(title: string, source: EngagementDocument, options: CondensedFcpOptions): string {
  // The report as it prints: generated rows the planner kept plus the planner's completed rows.
  // Work the entitlement cannot carry is drawn after it, in the Two-Year Notional.
  const deferredWork = options.effort.workPackages.filter(row => row.deferred);
  // Every bar carries who owns it (the planner's choice or the default) for drawing and sequencing.
  const customerTimelines = timelinesWithDeferrals(withOwnership(source), deferredWork.map(row => row.id));
  const planned: EngagementDocument = { ...source, adoptionTimeline: customerTimelines.adoption, twoYearPlan: customerTimelines.notional };
  const document: EngagementDocument = { ...planned, report: effectiveReport(planned) };
  const { fields, report } = document;
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const asOf = report.asOf || today;
  const customer = fields.customerName || "the customer";
  const stamp = `For customer review · ${shortDate(asOf)}`;
  const plan = playbookPlanForFields(fields);
  const burndown: Burndown | null = buildBurndown(document, today);
  const termEnd = burndown?.termEnd || report.entitlement.termEnd || calculateEntitlementEndDate(fields.entitlementStart) || null;
  const assumedEnd = termEndAssumed(document);
  const termStart = burndown?.termStart || report.entitlement.termStart || fields.entitlementStart || null;
  const effort = options.effort;
  // The report as it prints, so customer-run waves the plan generated count toward the customer's effort.
  const customerEffort = buildCustomerEffort(document);
  const items = [...planItems(document, customer), ...deadlines(document, termEnd)].sort((left, right) => left.start.localeCompare(right.start));
  const platform = platformName(document);
  const timelines = timelineSheets(document, longDate(fields.plannedProjectStart || fields.targetStart || document.adoptionTimeline.startDate) || "Plan start", termEnd ? longDate(termEnd) : document.adoptionTimeline.columns.at(-1) || "plan end", termEnd, fields.exportPreferences.includeOperationalTimeline);
  const deliveryModel = report.deliveryModel || "CDW";
  const outcomes = resolvePlanOutcomes(fields).outcomes;
  const strip = `<div class="strip"><span>${cdwLogoSvg("logo")}Consulting Solution Architecture</span><span>Functional Consumption Plan — Condensed | Prepared for ${esc(customer)} | ${esc(stamp)}</span></div>`;

  // ---- KPI tiles (exactly one dollar figure: the entitlement value)
  const valueTile = fields.entitlementAmount
    ? `<div class="kpi"><div class="v">${esc(money(fields.entitlementAmount))}</div><div class="l">${esc(platform.split(" ")[0])} Services Entitlement</div><div class="sub">${burndown ? `${hours(burndown.entitledHours)} hours · ` : ""}${termStart && termEnd ? `${esc(shortDate(termStart))} – ${esc(shortDate(termEnd))}` : ""}</div></div>`
    : `<div class="kpi"><div class="v">${hours(effort.totals.total)} hrs</div><div class="l">Scoped Effort</div><div class="sub">No entitlement booked yet</div></div>`;
  const kpis = burndown
    ? `${valueTile}<div class="kpi"><div class="v">${hours(burndown.remainingHours)} hrs</div><div class="l">Hours Remaining</div><div class="sub">${hours(burndown.consumedHours)} of ${hours(burndown.entitledHours)} hours delivered${report.entitlement.consumedAsOf ? ` (as of ${esc(shortDate(report.entitlement.consumedAsOf))})` : ""}</div></div><div class="kpi"><div class="v">${burndown.daysToExpiry} days</div><div class="l">Days to Expiry</div><div class="sub">Expires ${esc(shortDate(burndown.termEnd))}</div></div><div class="kpi"><div class="v">${burndown.expiryPace} hrs/wk</div><div class="l">Required Weekly Pace</div><div class="sub">To consume by expiry · ~${burndown.expiryPaceFte} FTE from ${esc(shortDate(burndown.asOf))}</div></div>`
    : `${valueTile}<div class="kpi"><div class="v">${hours(effort.totals.total)} hrs</div><div class="l">Scoped Effort</div><div class="sub">${effort.source === "assignments" ? "Signed resource assignments" : "Estimated from the plan"}</div></div><div class="kpi"><div class="v">${esc(termEnd ? shortDate(termEnd) : shortDate(items.at(-1)?.end ?? asOf))}</div><div class="l">${termEnd ? "Delivery Window Ends" : "Planned Completion"}</div><div class="sub">${termEnd && assumedEnd ? "12 months from the start; to be confirmed" : "No consumption data yet"}</div></div><div class="kpi"><div class="v">${esc(platform)}</div><div class="l">Target Platform</div><div class="sub">${esc(plan.label)}</div></div>`;

  // ---- Executive summary
  const situation = report.situation.map(esc);
  // Every in-entitlement package is listed; the domain packages are grouped under one count so the line stays readable.
  const domainKinds = new Map(domainPackages(fields).map(({ id, domain }) => [id, domain.kind]));
  const planOnPage = FIXED_GANTT_CATEGORIES.map(category => {
    // CDW work on the entitlement timeline in this category, governance and design stages included.
    const bars = document.adoptionTimeline.lanes.filter(lane => lane.category === category).flatMap(lane => lane.bars).filter(bar => activityOwner(bar) === "cdw");
    const label = (value: string) => value.replace(UNDECIDED_DEPTH, "").replace(/^(Month \d+|Weeks? [\d–-]+): /, "");
    const domains = bars.filter(bar => domainKinds.has(bar.id));
    const management = domains.filter(bar => domainKinds.get(bar.id) === "management").length;
    const domainGroup = domains.length > 1
      ? `${domains.length} domains (${[management ? `${management} management` : "", domains.length - management ? `${domains.length - management} workload` : ""].filter(Boolean).join(", ")}): ${domains.map(bar => label(bar.label)).join(", ")}`
      : "";
    const items: string[] = [];
    for (const bar of bars) {
      if (domainGroup && domainKinds.has(bar.id)) { if (!items.includes(domainGroup)) items.push(domainGroup); continue; }
      if (!items.includes(label(bar.label))) items.push(label(bar.label));
    }
    const later = deferredWork.filter(row => row.category === category).map(row => row.label.replace(UNDECIDED_DEPTH, ""));
    const text = `${items.length ? esc(items.join("; ")) : later.length ? "nothing in the entitlement window" : `no work in scope${report.declined.length ? ` (${esc(report.declined.join(", "))} not requested)` : ""}`}${later.length ? `; after the entitlement: ${esc(later.join("; "))}` : ""}`;
    return `<li><b>${esc(category)}</b> — ${text}</li>`;
  }).join("");
  const lead = `A design-led plan to move ${esc(customer)} onto ${esc(platform)} — ${esc(plan.label.toLowerCase())}${termEnd ? ` — consuming the services entitlement before it ends on ${esc(longDate(termEnd))}${assumedEnd ? " (12 months from the start; to be confirmed)" : ""}` : ""}.`;

  // ---- Burndown
  const burndownSection = burndown
    ? `<div class="keep"><h2>Entitlement Burndown</h2><p>${(burndown.pctConsumed * 100).toFixed(1)}% of the entitlement is consumed; ${(burndown.pctElapsed * 100).toFixed(1)}% of the term has elapsed. The red fill is hours delivered; the dark tick marks elapsed term.</p><p class="lead">${hours(burndown.consumedHours)} of ${hours(burndown.entitledHours)} hours delivered · ${hours(burndown.remainingHours)} hours remaining · ${esc(shortDate(burndown.termEnd))} expiry.</p><div class="bd"><div class="bd-bar"><div class="bd-fill" style="width:${(burndown.pctConsumed * 100).toFixed(1)}%"></div><div class="bd-tick" style="left:${(burndown.pctElapsed * 100).toFixed(1)}%"></div></div></div><div class="note"><b>Time-sensitive:</b> ${hours(burndown.remainingHours)} hours remain with ${burndown.daysToExpiry} days to the ${esc(longDate(burndown.termEnd))} expiry, which requires an average of <b>${burndown.expiryPace} hours per week (about ${burndown.expiryPaceFte} FTE)</b> from today. Unconsumed hours are not refunded.</div></div>`
    : `<div class="note">No consumption data exists yet for this engagement; the burndown appears once entitled and consumed hours are recorded.</div>`;

  // ---- Scoped effort (hours only)
  const effortTotal = ["Total CDW-delivered hours", hours(effort.totals.architect), hours(effort.totals.srConsultant), hours(effort.totals.projectManager), hours(effort.totals.total)];
  const fundedPackages = effort.workPackages.filter(row => row.total > 0);
  let scopedEffort: string;
  if (effort.source === "assignments" || !fundedPackages.length) {
    // A signed work plan can also carry Senior Architect and Offshore PM hours; their columns appear only when used.
    const senior = effort.rows.some(row => row.seniorArchitect);
    const offshore = effort.rows.some(row => row.offshoreProjectManager);
    const headers = ["Workstream", "Architect", ...(senior ? ["Sr. Architect"] : []), "Sr. Consultant", "Sr. Project Manager", ...(offshore ? ["Offshore PM"] : []), "Total Hours"];
    const cells = (values: { architect: number; srConsultant: number; projectManager: number; seniorArchitect?: number; offshoreProjectManager?: number; total: number }) => [hours(values.architect), ...(senior ? [hours(values.seniorArchitect ?? 0)] : []), hours(values.srConsultant), hours(values.projectManager), ...(offshore ? [hours(values.offshoreProjectManager ?? 0)] : []), hours(values.total)];
    const effortRows = effort.rows.map(row => [esc(row.note ? `${row.workstream} (${row.note})` : row.workstream), ...cells(row)]);
    scopedEffort = `<h2>Scoped Effort</h2><p class="lead">CDW-delivered hours by workstream and role${effort.source === "assignments" ? ", from the signed resource assignments for this entitlement" : ", estimated from this plan; the signed resource assignments replace these figures"}.</p>${table(headers, effortRows, { numeric: headers.slice(1).map((_, index) => index + 1), foot: true, total: ["Total CDW-delivered hours", ...cells(effort.totals)] })}`;
  } else {
    // One table per work package: window, lead role and hours, with what it delivers, how it is accepted, and what it starts after.
    const numeric = (value: number) => `<td class="num">${hours(value)}</td>`;
    const bars = new Map(document.adoptionTimeline.lanes.flatMap(lane => lane.bars).map(bar => [bar.id, bar]));
    const acceptance = new Map<string, (typeof plan.designPackages)[number]>([...plan.designPackages.map(item => [`bar-playbook-design-${item.id}`, item] as [string, typeof item]), ...plan.implementationPackages.map(item => [`bar-playbook-execution-${item.id}`, item] as [string, typeof item])]);
    const detail = (row: (typeof effort.workPackages)[number]) => {
      const bar = bars.get(row.id);
      const playbook = acceptance.get(row.id);
      const after = Array.from(new Set((bar?.prerequisites ?? []).flatMap(id => (bars.has(id) ? [bars.get(id)!.label.replace(UNDECIDED_DEPTH, "")] : []))));
      const parts = [
        sentence(playbook?.outcome ?? firstSentence(bar?.outcome, 400) ?? "").replace(/^\.$/, ""),
        ...(row.notes ?? []).map(sentence),
        playbook?.acceptance ? sentence(`Accepted when: ${playbook.acceptance}`) : "",
        after.length ? sentence(`Starts after: ${after.slice(0, 3).map(item => item.replace(/[.\s]+$/, "")).join("; ")}`) : "",
      ].filter(Boolean);
      return parts.length ? `<div class="wp-detail">${parts.map(part => esc(part)).join(" ")}</div>` : "";
    };
    // CDW packages with hours, and customer-owned packages the plan depends on.
    const shown = effort.workPackages.filter(row => !row.deferred && (row.total > 0 || row.note === "customer-owned"));
    const label = (row: (typeof effort.workPackages)[number]) => `${esc(row.label.replace(UNDECIDED_DEPTH, ""))}${row.note === "customer-owned" ? " <b>(customer)</b>" : ""}`;
    const body = FIXED_GANTT_CATEGORIES.flatMap(category => {
      const rows = shown.filter(row => row.category === category);
      return rows.length ? [`<tr class="cat"><td colspan="7">${esc(category)}</td></tr>`, ...rows.map(row => `<tr><td>${label(row)}${detail(row)}</td><td>${row.start && row.end ? esc(formatWindow(row.start, row.end)) : ""}</td><td>${esc(row.note === "customer-owned" ? `${customer} team` : row.leadRole)}</td>${numeric(row.architect)}${numeric(row.srConsultant)}${numeric(row.projectManager)}${numeric(row.total)}</tr>`)] : [];
    });
    const other = shown.filter(row => !row.category).map(row => `<tr><td>${label(row)}</td><td></td><td></td>${numeric(row.architect)}${numeric(row.srConsultant)}${numeric(row.projectManager)}${numeric(row.total)}</tr>`);
    scopedEffort = `<h2>Work Packages and Scoped Effort</h2><p class="lead">${esc(plan.label)}: ${esc(plan.description)} Each work package with its window, lead role and CDW hours, what it delivers and how it is accepted. Design decisions are made with ${esc(customer)} in design sessions. Estimated from this plan; the signed resource assignments replace these figures.</p><table data-foot="sum"><thead><tr><th>Work Package</th><th>Window</th><th>Lead Delivery Role</th><th class="num">Architect</th><th class="num">Sr. Consultant</th><th class="num">Sr. Project Manager</th><th class="num">Total Hours</th></tr></thead><tbody>${body.join("")}${other.join("")}<tr class="total"><td>${effortTotal[0]}</td><td></td><td></td>${effortTotal.slice(1).map(value => `<td class="num">${value}</td>`).join("")}</tr></tbody></table>`;
  }

  // ---- Follow-on scope: work planned after the entitlement, in hours (no limit; a follow-on services scope)
  const followOnRows = effort.workPackages.filter(row => row.followOn && row.followOn.total > 0);
  const notionalBars = new Map(customerTimelines.notional.lanes.flatMap(lane => lane.bars).map(bar => [bar.id, bar]));
  const followOnTotals = followOnRows.reduce((sum, row) => ({ architect: sum.architect + row.followOn!.architect, srConsultant: sum.srConsultant + row.followOn!.srConsultant, projectManager: sum.projectManager + row.followOn!.projectManager, total: sum.total + row.followOn!.total }), { architect: 0, srConsultant: 0, projectManager: 0, total: 0 });
  const followOnSection = followOnRows.length
    ? `<h3>Follow-on Scope — Two-Year Notional</h3><p class="lead">Work planned after the entitlement, estimated in hours for a follow-on services scope. It is not drawn from the current entitlement.</p>${table(["Work Package", "Planned Window", "Lead Delivery Role", "Architect", "Sr. Consultant", "Sr. Project Manager", "Total Hours"], followOnRows.map(row => {
      const bar = notionalBars.get(row.id);
      const window = bar ? barWindow(customerTimelines.notional, bar) : null;
      // Follow-on work runs after the entitlement; a window inside the term would read as funded work.
      const afterTerm = window && (!termEnd || window.start > termEnd) ? formatWindow(window.start, window.end) : termEnd ? `After ${shortDate(termEnd)}` : "After the entitlement";
      const split = row.total > 0 && !row.deferred;
      return [`${esc(row.label.replace(UNDECIDED_DEPTH, ""))}${split ? " <i>(remaining hours)</i>" : ""}`, esc(afterTerm), esc(row.leadRole), hours(row.followOn!.architect), hours(row.followOn!.srConsultant), hours(row.followOn!.projectManager), hours(row.followOn!.total)];
    }), { numeric: [3, 4, 5, 6], foot: true, total: ["Total follow-on hours", "", "", hours(followOnTotals.architect), hours(followOnTotals.srConsultant), hours(followOnTotals.projectManager), hours(followOnTotals.total)] })}`
    : "";

  // ---- Scope by bucket (v2 hours model): hours only, never rates or dollars
  const fit = effort.internal.fit;
  const bucketRows: Array<[string, string, number]> = fit ? [
    ["This entitlement: core", "Discovery, design, the pathway build, dated migration waves and VCF Operations at Tier 1", fit.buckets.E1],
    ["This entitlement: depth", "Selected outcomes, remaining waves and depth tiers, in priority order", fit.buckets.E2],
    ["Follow-on entitlement", "Year two, with design already complete; depends on a future purchase", fit.buckets.F],
    ["Customer-funded", "Work wanted this year beyond the entitlement, through CDW", fit.buckets.C],
    ...(fit.reserveHours >= 1 ? [["This entitlement: reserve", "Held back for change requests and estimate variance; reviewed at month 6 and released to follow-on work if unused", fit.reserveHours] as [string, string, number]] : []),
  ] : [];
  // Rounded to agree with the work package tables: the two entitlement buckets foot to the entitlement total, and
  // follow-on to the follow-on table, whenever they differ from them only by rounding.
  const inEntitlementTotal = Math.round(effort.totals.total);
  const depthShown = fit ? Math.round(fit.buckets.E2) : 0;
  const coreShown = fit && Math.abs(fit.buckets.E1 + fit.buckets.E2 - inEntitlementTotal) < 2 ? inEntitlementTotal - depthShown : Math.round(fit?.buckets.E1 ?? 0);
  const followOnShown = fit && followOnRows.length && Math.abs(fit.buckets.F - followOnTotals.total) < 2 ? Math.round(followOnTotals.total) : Math.round(fit?.buckets.F ?? 0);
  const roundedBuckets = fit ? [coreShown, depthShown, followOnShown, Math.round(fit.buckets.C), ...(fit.reserveHours >= 1 ? [Math.round(fit.reserveHours)] : [])] : [];
  const bucketSection = fit
    ? `<h3>Scope by Bucket</h3><p class="lead">The full scope of this plan in hours, placed in order of priority.</p>${table(["Bucket", "What it covers", "Hours"], bucketRows.map(([name, detail], index) => [esc(name), esc(detail), hours(roundedBuckets[index])]), { numeric: [2], foot: true, total: ["Total scope", "", hours(roundedBuckets.reduce((sum, value) => sum + value, 0))] })}<p class="lead">Follow-on entitlement work depends on a future VCF purchase or a renewal with entitlement attached.</p>`
    : "";

  // ---- Customer effort
  const peak = customerEffort.peak;
  const customerEffortSection = customerEffort.phases.length
    ? `<h2>Customer Effort by Week &amp; Work Stream</h2><p class="lead">CDW planning estimate of ${esc(customer)} team time, by phase.${peak ? ` Peak demand is <b>${peak.total} hours per week (${peak.fte} FTE)</b> during ${esc(peak.phase.toLowerCase())} (${esc(peak.window)}).` : ""}</p>${table(["Phase", "Window", "Platform Lead hrs/wk", "Operations hrs/wk", "Network hrs/wk", "Total hrs/wk", "FTE"], customerEffort.phases.map(phase => [esc(phase.phase), esc(phase.window), String(phase.platformLead), String(phase.operations), String(phase.network), String(phase.total), phase.fte.toFixed(2)]), { numeric: [2, 3, 4, 5, 6] })}`
    : "";
  // Work the customer's team runs itself, with its months; it carries no CDW hours.
  const customerWork = report.customerOwnedWork.length
    ? `<h3>Work Run by ${esc(customer)}</h3>${table(["Work", "Window"], report.customerOwnedWork.map(row => [esc(row.label), esc(formatWindow(row.start.length === 7 ? `${row.start}-01` : row.start, row.end.length === 7 ? `${row.end}-01` : row.end))]))}`
    : "";

  // ---- Personnel
  const named = report.personnel.filter(row => row.cdw.length || row.broadcom.length || row.customer.length);
  const withBroadcom = named.some(row => row.broadcom.length);
  const people = (names: string[]) => esc(names.join(" · "));
  const personnel = named.length
    ? `<h3>Target Personnel by Work Stream</h3>${table(["Work Stream", "CDW", ...(withBroadcom ? ["Broadcom"] : []), customer], named.map(row => [esc(row.workstream), people(row.cdw), ...(withBroadcom ? [people(row.broadcom)] : []), people(row.customer)]))}`
    : "";

  // ---- Who is involved: the primary contact and the contacts from the brief
  const industry = fields.adoptionDetails.industryTemplate !== "general-enterprise" ? getIndustryDiscoveryTemplate(fields.adoptionDetails.industryTemplate).label : "";
  const contactRows = [
    ...(fields.primaryContact.trim() ? [[esc(fields.primaryContact.split(",")[0].trim()), esc(fields.primaryContact.split(",").slice(1).join(",").trim() || "Primary contact"), esc(customer)]] : []),
    ...report.contacts.customer.filter(item => item.name.trim() && item.name.trim() !== fields.primaryContact.split(",")[0].trim()).map(item => [esc(item.name), esc(item.role), esc(customer)]),
    ...report.contacts.cdw.filter(item => item.name.trim()).map(item => [esc(item.name), esc(item.role), "CDW"]),
    ...report.contacts.broadcom.filter(item => item.name.trim()).map(item => [esc(item.name), esc(item.role), "Broadcom"]),
  ];
  const contacts = contactRows.length ? `<h3>Who Is Involved</h3>${table(["Name", "Role", "Organization"], contactRows)}` : "";

  // ---- What we know about the estate: every discovery answer on record, and why it matters
  const briefing = deliveryBriefing(document);
  const discoveryAnswers = briefing.length ? `<h3>What We Know About the Estate</h3><p class="lead">Answers from discovery, with what each one means for this plan.</p>${table(["Topic", "Answer", "Why It Matters"], briefing.map(item => [esc(item.topic), esc(item.detail), esc(item.why)]))}` : "";

  // ---- Compatibility (the "Compatibility summary in the FCP" checkbox): hosts by decision, the top actions,
  // and the planning considerations. The detailed evidence stays in the Compatibility Delivery Handoff.
  const handoff = summarizeCompatibilityHandoff(document.readiness.hardwarePlatforms, document.inventory.hosts);
  const minimumRelease = minimumTargetRelease(document);
  // Server and CPU results are in the decision table; these are the other blockers and warnings, grouped by check.
  const hostFindings = summarizeHclFindings(document.readiness.hcl.findings.filter(item => (item.severity === "BLOCKER" || item.severity === "WARNING") && !item.checkId.startsWith("HW.SERVER_CPU_")));
  const considerations = document.readiness.items.filter(item => item.status === "attention" || item.status === "unknown");
  const compatibility = fields.exportPreferences.includeVcfReadiness
    ? `<h2>${esc(handoff.targetRelease)} Compatibility</h2><p class="lead">Server and CPU evidence from RVTools against the Broadcom server list (captured ${esc(shortDate(handoff.catalog.capturedAt.slice(0, 10)))}), with CPU support, ESX builds and Broadcom KB guidance as of ${esc(shortDate(VCF_CORPUS.refreshed))}. This is planning evidence, not a certification; the Compatibility Delivery Handoff carries the full evidence.</p>`
      + (minimumRelease ? `<div class="note">${hours(minimumRelease.hosts)} host${minimumRelease.hosts === 1 ? " runs" : "s run"} ${esc(minimumRelease.sources.slice(0, 2).join(", "))}${minimumRelease.sources.length > 2 ? " and later builds" : ""}, released after ${esc(handoff.targetRelease.replace(/^ESXi/, "ESX"))}.0. An upgrade or converge must target ${esc(minimumRelease.minimum)} or later (KB 450972, KB 454369); an import works on either.</div>` : "")
      + (handoff.estateHosts
        ? `${table(["Decision", "Hosts"], [["Target release listed", hours(handoff.supportedHosts)], ["Evidence still required", hours(handoff.unresolvedHosts)], ["Blocked or not listed", hours(handoff.blockedHosts)]], { numeric: [1] })}<p>${handoff.allHostsAccountedFor ? `All ${hours(handoff.estateHosts)} imported hosts are matched to a server model.` : `${hours(handoff.unaccountedHosts)} of ${hours(handoff.estateHosts)} imported hosts are not matched to a server model yet.`} ESXi versions in use: ${esc(document.inventory.esxiVersions.map(item => `${item.version} (${item.hosts})`).join(", ") || "not reported")}.</p>`
          + (handoff.actions.length ? `<h3>Compatibility Actions</h3><ol>${handoff.actions.filter((action, index) => action.priority !== "validation" || index < 5).map(action => `<li><b>${hours(action.affectedHosts)} host${action.affectedHosts === 1 ? "" : "s"} · ${esc(action.owner)}:</b> ${esc(action.title)}</li>`).join("")}</ol>` : "")
        : `<div class="note">No host evidence yet. Import an RVTools export to establish the compatibility posture.</div>`)
      + (hostFindings.length ? `<h3>Host Findings</h3><p class="lead">Blockers and warnings beyond the server and CPU listing: adapters, builds and versions that change the upgrade.</p>${table(["Finding", "Affected", "Where", "What To Do"], hostFindings.map(item => [`${esc(item.title)}${item.severity === "BLOCKER" ? " <b>(blocker)</b>" : ""}`, esc(`${hours(item.affectedCount)} ${item.scope === "host" ? (item.affectedCount === 1 ? "host" : "hosts") : item.scope}`), esc(item.clusters.slice(0, 3).join(", ") + (item.clusters.length > 3 ? ` and ${item.clusters.length - 3} more` : "")), esc(item.remediation)]))}` : "")
      + (considerations.length ? `<h3>Planning Considerations</h3>${table(["Consideration", "What It Means"], considerations.map(item => [esc(item.title), esc(item.detail)]))}` : "")
    : "";

  // ---- Estimating basis (v2): the estate facts and the defaults the hours were built on, in hours only
  const pass1 = effort.internal.pass1;
  // Each domain's build hours: its share of the build line, from its pathway and host count.
  const domainList = domainPackages(fields);
  const w = DOMAIN_BUILD_WEIGHTS;
  const domainRows = domainList.length ? [
    ...domainList.map(({ domain }) => { const known = domainHosts(domain, document.inventory); return [esc(`Hosts in ${domain.name}`), known.hosts === null ? "Set in design" : esc(known.hosts), esc(known.source)]; }),
    ["Domain build hours", "Share of the build", esc(`Each domain takes a share of the build hours: a base by pathway (management domain ${w.managementBase.value}, new workload domain ${w.greenfieldBase.value}, converge ${w.convergeBase.value}, import ${w.importBase.value}) plus ${w.perHostGreenfield.value} per host built new (${w.perHostConverge.value} converged, ${w.perHostImport.value} imported), so more hosts never mean fewer hours`)],
  ] : [];
  const basis = (source: string) => /\bspec\b|worked example|section \d/i.test(source) ? "Assumed: planning default; confirm in design" : `Assumed: ${source}`;
  const estimatingBasis = pass1
    ? `<h3>Estimating Basis</h3><p class="lead">The hours are built from the estate and scope below. Values marked as assumed were not stated and use the planning default; a confirmed value replaces it.</p>${table(["Driver", "Value", "Basis"], [
      ...[["ESX hosts", pass1.inputs.hosts], ["Clusters", pass1.inputs.clusters], ["VMs", pass1.inputs.vms], ["vCenters", pass1.inputs.vcenters], ["Sites", pass1.inputs.sites], ["VCF instances", pass1.inputs.instances], ["Workload domains", pass1.inputs.workloadDomains]]
        .map(([label, value]) => { const assumed = pass1.assumptions.find(item => item.label.toLowerCase() === String(label).toLowerCase()); return [esc(label), esc(value), esc(assumed ? basis(assumed.source) : "From RVTools or the brief")]; }),
      ...pass1.assumptions.filter(item => !["hosts", "clusters", "vms", "vcenters", "sites", "instances", "workloadDomains"].includes(item.key)).map(item => [esc(item.label), esc(item.display ?? (typeof item.value === "boolean" ? (item.value ? "Yes" : "No") : item.value)), esc(item.derived ? item.source : basis(item.source))]),
      ...domainRows,
    ])}`
    : "";

  // ---- Design
  const profileRows = PROFILE_CATEGORIES.filter(([key]) => report.designProfile[key]?.trim()).map(([key, label]) => [esc(label), esc(report.designProfile[key] ?? "")]);
  const elementRows = report.designElements.map(item => [esc(item.component), esc(item.requirement), `${esc(sentence(item.recommendation))}${item.gate ? ` <b>Gate:</b> ${esc(sentence(item.gate))}` : ""}`]);

  // ---- Deliverables: the playbook work packages for the selected path
  const packages = [...plan.designPackages, ...plan.implementationPackages];
  const deliverables = packages.length && (effort.source === "assignments" || !fundedPackages.length)
    ? `<h3>What CDW Delivers</h3><p class="lead">${esc(plan.label)}: ${esc(plan.description)}</p>${table(["Work Package", "Outcome", "Acceptance"], packages.map(item => [esc(item.title), esc(item.outcome), esc(item.acceptance)]))}`
    : "";

  // ---- Sequence, timeline, milestones, forward plan
  const milestones = report.milestonesToDate.length
    ? `<h3>Engagement Milestones to Date</h3>${report.milestonesToDate.map(item => `<div class="ms"><b>${esc(shortDate(item.date))}</b><span><b>${esc(item.event)}</b>${item.detail ? ` — ${esc(item.detail)}` : ""}</span></div>`).join("")}`
    : "";
  // The build starts with the foundation build or the first execution stage, which can be months after services start.
  // The same dates the sequencing constraint states.
  const { implementationStart, buildStart, buildLater } = planKeyDates(document);
  // What the first build package also carries, such as the NSX design when the full NSX design is not funded.
  const buildNotes = effort.workPackages.filter(row => !row.deferred && row.total > 0).flatMap(row => row.notes ?? []);
  const forward = (implementationStart ? `<div class="ms"><b>${esc(shortDate(implementationStart))}</b><span>${buildLater ? "Implementation services start with design and planning." : "Implementation services start: build, upgrade and migration work begins."}</span></div>` : "")
    + (buildLater ? `<div class="ms"><b>${esc(shortDate(buildStart!))}</b><span>Platform build begins.${buildNotes.length ? ` ${esc(buildNotes.join(" "))}` : ""}</span></div>` : "")
    + (fields.targetComplete ? `<div class="ms"><b>${esc(shortDate(fields.targetComplete))}</b><span>${esc(customer)}'s target completion.</span></div>` : "")
    + (termEnd ? `<div class="ms"><b>By ${esc(shortDate(termEnd))}</b><span>Full entitlement consumption: all hours consumed ahead of expiry.${assumedEnd ? " The end date is 12 months from the start and is still to be confirmed." : ""}</span></div>` : "")
    + (deferredWork.length ? `<div class="ms"><b>After ${esc(termEnd ? shortDate(termEnd) : "the entitlement")}</b><span>${esc(deferredWork.map(row => row.label.replace(UNDECIDED_DEPTH, "")).join("; "))} — shown in the Two-Year Notional as follow-on scope.</span></div>` : "");

  // ---- Adoption plan & recommendation
  const builds = plan.implementationPackages.length > 0;
  const funds = builds
    ? `CDW designs and builds the ${esc(platform)} foundation, proves the runbook and hands over, and ${esc(customer)}'s team repeats it`
    : `CDW delivers the ${esc(platform)} architecture and an implementation-ready design that ${esc(customer)}'s team builds from`;
  const shortVersion = burndown
    ? `${hours(burndown.remainingHours)} hours remain and the entitlement expires on <b>${esc(longDate(burndown.termEnd))}</b>. Unconsumed hours are not refunded. The entitlement funds the one-time work: ${funds}. That requires about ${burndown.expiryPace} hours of delivery per week from today.`
    : `${funds.charAt(0).toUpperCase()}${funds.slice(1)}. Unconsumed entitlement hours are not refunded once an entitlement is booked.`;
  const heard = report.whatWeHeard.length ? `<h3>What we heard, and what we have built to</h3>${table(["Component", `${customer} Position`, "Where It Lands in This Plan"], report.whatWeHeard.map(item => [esc(item.component), esc(item.customerPosition), esc(item.whereItLands)]))}` : "";
  const problems = report.problems.length ? `<h3>Customer Problems</h3><ul>${report.problems.map(item => `<li><b>${esc(item.problem)}</b>${item.addressedBy ? ` — ${esc(item.addressedBy)}` : ""}</li>`).join("")}</ul>` : "";
  const questions = report.openQuestions.length ? `<h3>Open Questions</h3>${table(["Question", "Why we are asking now"], report.openQuestions.map(item => [esc(item.question), esc(item.whyNow)]))}` : "";
  const technical = report.technicalItems.map(item => `<li>${esc(item.item)}${item.reference ? ` — ${esc(item.reference)}` : ""}</li>`);
  const capitalized = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);
  const constraints = report.constraints.map(item => ({ ...item, imposedBy: capitalized(item.imposedBy) || "Calendar" }));
  // A leading "Label:" is set in bold, as in the template.
  const asks = report.customerAsks.map(item => esc(item).replace(/^([A-Z][^:]{0,40}):\s/, "<b>$1:</b> "));
  const withOwner = report.openItems.some(item => item.owner.trim());
  const openItems = report.openItems.length ? `<h3>Open Items</h3>${table(["Item", "What It Gates", ...(withOwner ? ["Owner"] : [])], report.openItems.map(item => [esc(item.item), esc(item.gates), ...(withOwner ? [esc(item.owner)] : [])]))}` : "";
  const pulledIn = outcomes.filter(item => item.requiredBy.length);

  const body = `
<h1 class="title">${esc(platform.startsWith("VVF") ? "VMware vSphere Foundation" : "VMware Cloud Foundation")} Adoption — ${esc(customer)}</h1>
<p class="lead-in">${lead}</p>
<div class="pills">Platform: <b>${esc(platform)}</b> • Path: <b>${esc(plan.label)}</b> • Delivery: <b>${esc(deliveryModel)}</b>${industry ? ` • Industry: <b>${esc(industry)}</b>` : ""}${fields.location ? ` • Location: <b>${esc(fields.location)}</b>` : ""}</div>
<div class="kpis">${kpis}</div>

<h2>Executive Summary</h2>
<p class="lead">Where ${esc(customer)} stands today, what the entitlement funds, and the plan to turn it into a platform the team can run.</p>
${situation.length ? `<h3>Situation</h3><ul>${situation.map(item => `<li>${item}</li>`).join("")}</ul>` : ""}
<h3>Plan on a Page</h3>
<p>${esc(selectedScopeSummary(document))}</p>
<ul>${planOnPage}</ul>

${burndownSection}
${scopedEffort}
${bucketSection}
${followOnSection}
${estimatingBasis}
${customerEffortSection}
${customerWork}
${personnel}
${contacts}

${discoveryAnswers}
${profileRows.length ? `<h2>${esc(platform.split(" ")[0])} Design Profile</h2>
<p class="lead">Architecture summarized across the standard design profile categories. Decisions marked for design are set in the design sessions${plan.decisions.length ? `; for this pathway they include ${esc(plan.decisions.join(", ").toLowerCase())}` : ""}.</p>
${table(["Profile Category", `${customer} Design Decision`], profileRows)}` : ""}
${elementRows.length ? `<h3>Design Elements — Requirements &amp; Recommendations</h3>
<p class="lead">Per-component requirements with the recommendation for ${esc(customer)}. Gates are called out.</p>
${table(["Component", "Requirement", "Recommendation"], elementRows)}` : ""}
${deliverables}
${compatibility}

<h2>Adoption Timeline</h2>
<p class="lead">The delivery sequence by calendar month, grouped under the five standard categories. Each work package is described in Work Packages and Scoped Effort.</p>
${timelines.entitlement}
${milestones}
${forward ? `<h3>Key Dates</h3>${forward}` : ""}
${timelines.notional}

<h2>Adoption Plan &amp; Recommendation</h2>
<p class="lead">What we recommend ${esc(customer)} does with the remaining entitlement, and why the sequence is what it is.</p>
<h3>Summary</h3>
<p>${shortVersion}</p>
${heard}
${problems}
${questions}
${technical.length ? `<h3>The technical items to confirm early</h3><ul>${technical.join("")}</ul>` : ""}
${pulledIn.length ? `<p class="lead">Prerequisites included so selected outcomes can be delivered: ${esc(pulledIn.map(item => `${planOutcomeLabel(item.key)} (for ${item.requiredBy.map(key => planOutcomeLabel(key)).join(", ")})`).join("; "))}.</p>` : ""}
${constraints.length ? `<h3>Sequencing Constraints</h3>
${table(["Constraint", "Imposed By", "Effect on the Sequence"], constraints.map(item => [esc(item.constraint), esc(item.imposedBy), esc(item.effect)]))}` : ""}
${asks.length ? `<h3>Customer Team Commitments</h3><ul>${asks.map(item => `<li>${item}</li>`).join("")}</ul>` : ""}
${openItems}

<div class="closer red">Make Amazing Happen.</div>
${report.revision ? `<div class="revision">Revision: ${esc(report.revision)}</div>` : ""}
<p class="sources">Prepared by CDW Consulting Solution Architecture for ${esc(customer)} — Functional Consumption Plan (Condensed) · ${esc(stamp)}.</p>`;

  const cover = `<section class="cover">${cdwLogoSvg("logo")}${cdwLogoSvg("orbit", "")}<div class="eyebrow">Functional Consumption Plan · ${esc(customer)}</div><h1>${esc(report.headline ?? "")}</h1><div class="sign">Make Amazing Happen.</div><div class="meta"><div><b>Prepared for</b>${esc(customer)}</div><div><b>Date</b>${esc(longDate(asOf))}</div><div><b>Prepared by</b>CDW Consulting Solution Architecture</div></div><div class="legend">${esc(LEGEND)}</div></section>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} - FCP</title><style>${CSS}</style></head><body>${cover}<table class="page"><thead><tr><td>${strip}</td></tr></thead><tfoot><tr><td><div class="legendrow">${esc(LEGEND)}</div></td></tr></tfoot><tbody><tr><td>${body}</td></tr></tbody></table><button class="printbtn" type="button" onclick="window.print()">Print / Save as PDF</button></body></html>`;
}
