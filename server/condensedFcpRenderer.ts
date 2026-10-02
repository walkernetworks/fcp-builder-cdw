import { barWindow } from "../shared/buildingBlocks";
import { buildBurndown, buildCustomerEffort, formatWindow, timelinesWithDeferrals, type Burndown, type ScopedEffort } from "../shared/effort";
import { calculateEntitlementEndDate, effectivePlatformEdition, FIXED_GANTT_CATEGORIES, planOutcomeLabel, playbookPlanForFields, resolvePlanOutcomes, type EngagementDocument, type Timeline, type TimelineBar, type TimelineCategory, type WorkstreamType } from "../shared/fcp";
import { effectiveReport, platformName } from "../shared/reportView";
import { cdwLogoSvg } from "./brand/cdwLogo";
import { selectedScopeSummary } from "./fcpRenderer";
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
const SITE_ID = /^bar-(hcl-remediation|hcl-procurement|hcl-greenfield|soft-prerequisite-|networking-physical-fabric)/;

function planItems(document: EngagementDocument, customer: string): PlanItem[] {
  const timeline = document.adoptionTimeline;
  const all = timeline.lanes.flatMap(lane => lane.bars.map(bar => ({ lane, bar, window: barWindow(timeline, bar) })));
  const labelOf = new Map(all.map(({ bar }) => [bar.id, bar.label]));
  const items: PlanItem[] = [];
  const span = (entries: typeof all) => {
    const windows = entries.flatMap(entry => (entry.window ? [entry.window] : []));
    return windows.length ? { start: windows.map(window => window.start).sort()[0], end: windows.map(window => window.end).sort().at(-1)! } : null;
  };

  const design = span(all.filter(({ bar }) => DESIGN_ID.test(bar.id)));
  if (design) items.push({ category: "Modernize Infrastructure", label: "Design discovery, architecture and design", ...design, swatch: "infrastructure", milestone: true, outcome: "Design signed off; hosts, storage, network and change windows agreed.", dependsOn: [] });

  for (const { lane, bar, window } of all) {
    if (!window || DESIGN_ID.test(bar.id) || SITE_ID.test(bar.id) || bar.id === "bar-platform-plan") continue;
    const gate = bar.id === "bar-hcl-gate";
    items.push({
      category: lane.category,
      label: gate ? "Hardware compatibility confirmed" : bar.label.replace(UNDECIDED_DEPTH, ""),
      start: window.start,
      end: window.end,
      swatch: gate ? "muted" : SWATCH_BY_WORKSTREAM[lane.workstreamType],
      milestone: bar.milestone && !gate,
      outcome: gate ? "Gate: platform build starts only once hardware compatibility is confirmed." : firstSentence(bar.outcome),
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

function deadlines(document: EngagementDocument, termEnd: string | null): PlanItem[] {
  const out: PlanItem[] = [];
  if (termEnd) out.push({ category: "Program Management & Governance", label: `Expiry ${shortDate(termEnd).replace(/ \d{4}$/, "")}`, start: termEnd, end: termEnd, swatch: "muted", milestone: true, outcome: "Unconsumed hours are not refunded.", dependsOn: [] });
  const renewal = document.report.discovery.renewalDate;
  if (renewal) out.push({ category: "Program Management & Governance", label: `Subscription renewal ${shortDate(renewal).replace(/ \d{4}$/, "")}`, start: renewal, end: renewal, swatch: "muted", milestone: true, outcome: "Licensing activated and the renewal sized before this date.", dependsOn: [] });
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
function timelineSheets(document: EngagementDocument, windowStart: string, windowEnd: string): { entitlement: string; notional: string } {
  const sheet = (eyebrow: string, heading: string, intro: string, timeline: Timeline, empty: string) =>
    `<section class="tl-sheet"><div class="tl-head"><span>${esc(eyebrow)}</span><h2>${esc(heading)}</h2><p>${intro}</p></div>${renderTimeline(timeline, empty)}</section>`;
  const operational = projectOperationalTimelineToMonths(customerFacing(document.adoptionTimeline));
  // The entitlement window spans up to 13 calendar months when it starts and ends mid-month.
  const entitlementWindow = sliceTimeline(operational, 1, Math.min(13, operational.columns.length));
  const entitlement = document.adoptionTimeline.lanes.length
    ? sheet("Adoption Timeline · entitlement window", "Private Cloud Adoption Timeline", `${esc(windowStart)} through ${esc(windowEnd)}. The entitlement-funded delivery sequence by month, under the five standard categories; work after the entitlement ends is carried in the Two-Year Notional. ◆ marks key delivered functionality.`, entitlementWindow, "No activities are scheduled in the entitlement window.")
    : "";
  const plan = customerFacing(document.twoYearPlan);
  const notionalStart = plan.columns[0] || windowStart;
  const notionalEnd = plan.columns[plan.columns.length - 1] || "";
  const years = [sliceTimeline(plan, 1, Math.min(12, plan.columns.length)), plan.columns.length > 12 ? sliceTimeline(plan, 13, Math.min(24, plan.columns.length)) : null];
  const notional = plan.lanes.length
    ? years.map((year, index) => year && sheet(`Two-Year Notional · Months ${index ? "13–24" : "1–12"}`, index ? "Year 2 Continuation" : "Year 1 Adoption Outlook", index
      ? `${esc(year.columns[0] || "")} through ${esc(year.columns[year.columns.length - 1] || "")}. Lifecycle, adoption and expansion direction that may need future scope or funding.`
      : `A directional 24-month roadmap from ${esc(notionalStart)} through ${esc(notionalEnd)}. It is not a commitment that all of this work is funded by the current entitlement.`, year, `No notional activities are scheduled in months ${index ? "13–24" : "1–12"}.`)).filter(Boolean).join("")
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
.band{background:var(--dark);color:#fff;padding:16px 20px;border-radius:3px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.band h1{margin:0 0 6px;font-size:19px}
.band p{margin:0;font-size:12px;color:#d6dae2}
.pills{font-size:10.5px;color:var(--slate);padding:9px 2px;border-bottom:2px solid var(--red)}
.pills b{color:var(--ink)}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);border-top:0;margin-bottom:6px}
.kpi{padding:10px 14px;border-right:1px solid var(--line)}
.kpi:last-child{border-right:0}
.kpi .v{font-size:19px;font-weight:900;color:var(--red)}
.kpi .l{font-size:11px;font-weight:800;margin-top:2px}
.kpi .sub{font-size:9.5px;color:var(--muted);margin-top:2px}
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
  const customerTimelines = timelinesWithDeferrals(source, deferredWork.map(row => row.id));
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
  const termStart = burndown?.termStart || report.entitlement.termStart || fields.entitlementStart || null;
  const effort = options.effort;
  const customerEffort = buildCustomerEffort(planned);
  const items = [...planItems(document, customer), ...deadlines(document, termEnd)].sort((left, right) => left.start.localeCompare(right.start));
  const platform = platformName(document);
  const timelines = timelineSheets(document, longDate(fields.plannedProjectStart || fields.targetStart || document.adoptionTimeline.startDate) || "Plan start", termEnd ? longDate(termEnd) : document.adoptionTimeline.columns.at(-1) || "plan end");
  const deliveryModel = report.deliveryModel || "CDW";
  const outcomes = resolvePlanOutcomes(fields).outcomes;
  const strip = `<div class="strip"><span>${cdwLogoSvg("logo")}Consulting Solution Architecture</span><span>Functional Consumption Plan — Condensed | Prepared for ${esc(customer)} | ${esc(stamp)}</span></div>`;

  // ---- KPI tiles (exactly one dollar figure: the entitlement value)
  const valueTile = fields.entitlementAmount
    ? `<div class="kpi"><div class="v">${esc(money(fields.entitlementAmount))}</div><div class="l">${esc(platform.split(" ")[0])} Services Entitlement</div><div class="sub">${burndown ? `${hours(burndown.entitledHours)} hours · ` : ""}${termStart && termEnd ? `${esc(shortDate(termStart))} – ${esc(shortDate(termEnd))}` : ""}</div></div>`
    : `<div class="kpi"><div class="v">${hours(effort.totals.total)} hrs</div><div class="l">Scoped Effort</div><div class="sub">No entitlement booked yet</div></div>`;
  const kpis = burndown
    ? `${valueTile}<div class="kpi"><div class="v">${hours(burndown.remainingHours)} hrs</div><div class="l">Hours Remaining</div><div class="sub">${hours(burndown.consumedHours)} of ${hours(burndown.entitledHours)} hours delivered${report.entitlement.consumedAsOf ? ` (as of ${esc(shortDate(report.entitlement.consumedAsOf))})` : ""}</div></div><div class="kpi"><div class="v">${burndown.daysToExpiry} days</div><div class="l">Days to Expiry</div><div class="sub">Expires ${esc(shortDate(burndown.termEnd))}${burndown.extended ? " · extension approved" : " · no extension recorded"}</div></div><div class="kpi"><div class="v">${burndown.expiryPace} hrs/wk</div><div class="l">Required Weekly Pace</div><div class="sub">To consume by expiry · ~${burndown.expiryPaceFte} FTE from ${esc(shortDate(burndown.asOf))}</div></div>`
    : `${valueTile}<div class="kpi"><div class="v">${hours(effort.totals.total)} hrs</div><div class="l">Scoped Effort</div><div class="sub">${effort.source === "assignments" ? "Signed resource assignments" : "Estimated from the plan"}</div></div><div class="kpi"><div class="v">${esc(termEnd ? shortDate(termEnd) : shortDate(items.at(-1)?.end ?? asOf))}</div><div class="l">${termEnd ? "Delivery Window Ends" : "Planned Completion"}</div><div class="sub">No consumption data yet</div></div><div class="kpi"><div class="v">${esc(platform)}</div><div class="l">Target Platform</div><div class="sub">${esc(plan.label)}</div></div>`;

  // ---- Executive summary
  const situation = report.situation.map(esc);
  const planOnPage = FIXED_GANTT_CATEGORIES.map(category => {
    const work = items.filter(item => item.category === category && !item.customerOwned && item.swatch !== "muted").map(item => item.label);
    const later = deferredWork.filter(row => row.category === category).map(row => row.label.replace(UNDECIDED_DEPTH, ""));
    const text = `${work.length ? esc(Array.from(new Set(work)).slice(0, 4).join("; ")) : later.length ? "nothing in the entitlement window" : `no work in scope${report.declined.length ? ` (${esc(report.declined.join(", "))} not requested)` : ""}`}${later.length ? `; after the entitlement: ${esc(later.join("; "))}` : ""}`;
    return `<li><b>${esc(category)}</b> — ${text}</li>`;
  }).join("");
  const lead = `A design-led plan to move ${esc(customer)} onto ${esc(platform)} — ${esc(plan.label.toLowerCase())}${termEnd ? ` — consuming the services entitlement before it lapses on ${esc(longDate(termEnd))}` : ""}.`;

  // ---- Burndown
  const burndownSection = burndown
    ? `<div class="keep"><h2>Entitlement Burndown</h2><p>${(burndown.pctConsumed * 100).toFixed(1)}% of the entitlement is consumed; ${(burndown.pctElapsed * 100).toFixed(1)}% of the term has elapsed. The red fill is hours delivered; the dark tick marks elapsed term.</p><p class="lead">${hours(burndown.consumedHours)} of ${hours(burndown.entitledHours)} hours delivered · ${hours(burndown.remainingHours)} hours remaining · ${esc(shortDate(burndown.termEnd))} expiry.</p><div class="bd"><div class="bd-bar"><div class="bd-fill" style="width:${(burndown.pctConsumed * 100).toFixed(1)}%"></div><div class="bd-tick" style="left:${(burndown.pctElapsed * 100).toFixed(1)}%"></div></div></div><div class="note"><b>Time-sensitive:</b> ${hours(burndown.remainingHours)} hours remain with ${burndown.daysToExpiry} days to the ${esc(longDate(burndown.termEnd))} expiry, which requires an average of <b>${burndown.expiryPace} hours per week (about ${burndown.expiryPaceFte} FTE)</b> from today. Unconsumed hours are not refunded.</div></div>`
    : `<div class="note">No consumption data exists yet for this engagement; the burndown appears once entitled and consumed hours are recorded.</div>`;

  // ---- Scoped effort (hours only)
  const effortTotal = ["Total CDW-delivered hours", hours(effort.totals.architect), hours(effort.totals.srConsultant), hours(effort.totals.projectManager), hours(effort.totals.total)];
  const fundedPackages = effort.workPackages.filter(row => row.total > 0);
  let scopedEffort: string;
  if (effort.source === "assignments" || !fundedPackages.length) {
    const effortRows = effort.rows.map(row => [esc(row.note ? `${row.workstream} (${row.note})` : row.workstream), hours(row.architect), hours(row.srConsultant), hours(row.projectManager), hours(row.total)]);
    scopedEffort = `<h2>Scoped Effort</h2><p class="lead">CDW-delivered hours by workstream and role${effort.source === "assignments" ? ", from the signed resource assignments for this entitlement" : ", estimated from this plan; the signed resource assignments replace these figures"}.</p>${table(["Workstream", "Architect", "Sr. Consultant", "Sr. Project Manager", "Total Hours"], effortRows, { numeric: [1, 2, 3, 4], foot: true, total: effortTotal })}`;
  } else {
    // Hours by work package, in the windows and under the lead roles the adoption timeline shows.
    const numeric = (value: number) => `<td class="num">${hours(value)}</td>`;
    const body = FIXED_GANTT_CATEGORIES.flatMap(category => {
      const rows = fundedPackages.filter(row => row.category === category);
      return rows.length ? [`<tr class="cat"><td colspan="7">${esc(category)}</td></tr>`, ...rows.map(row => `<tr><td>${esc(row.label.replace(UNDECIDED_DEPTH, ""))}</td><td>${row.start && row.end ? esc(formatWindow(row.start, row.end)) : ""}</td><td>${esc(row.leadRole)}</td>${numeric(row.architect)}${numeric(row.srConsultant)}${numeric(row.projectManager)}${numeric(row.total)}</tr>`)] : [];
    });
    const other = fundedPackages.filter(row => !row.category).map(row => `<tr><td>${esc(row.label)}</td><td></td><td></td>${numeric(row.architect)}${numeric(row.srConsultant)}${numeric(row.projectManager)}${numeric(row.total)}</tr>`);
    scopedEffort = `<h2>Scoped Effort</h2><p class="lead">CDW-delivered hours by work package and role, in the windows of the adoption timeline. Estimated from this plan; the signed resource assignments replace these figures.</p><table data-foot="sum"><thead><tr><th>Work Package</th><th>Window</th><th>Lead Delivery Role</th><th class="num">Architect</th><th class="num">Sr. Consultant</th><th class="num">Sr. Project Manager</th><th class="num">Total Hours</th></tr></thead><tbody>${body.join("")}${other.join("")}<tr class="total"><td>${effortTotal[0]}</td><td></td><td></td>${effortTotal.slice(1).map(value => `<td class="num">${value}</td>`).join("")}</tr></tbody></table>`;
  }

  // ---- Follow-on scope: work planned after the entitlement, in hours (no limit; a follow-on services scope)
  const followOnRows = effort.workPackages.filter(row => row.followOn && row.followOn.total > 0);
  const notionalBars = new Map(customerTimelines.notional.lanes.flatMap(lane => lane.bars).map(bar => [bar.id, bar]));
  const followOnTotals = followOnRows.reduce((sum, row) => ({ architect: sum.architect + row.followOn!.architect, srConsultant: sum.srConsultant + row.followOn!.srConsultant, projectManager: sum.projectManager + row.followOn!.projectManager, total: sum.total + row.followOn!.total }), { architect: 0, srConsultant: 0, projectManager: 0, total: 0 });
  const followOnSection = followOnRows.length
    ? `<h3>Follow-on Scope — Two-Year Notional</h3><p class="lead">Work planned after the entitlement, estimated in hours for a follow-on services scope. It is not drawn from the current entitlement.</p>${table(["Work Package", "Planned Window", "Lead Delivery Role", "Architect", "Sr. Consultant", "Sr. Project Manager", "Total Hours"], followOnRows.map(row => {
      const bar = notionalBars.get(row.id);
      const window = bar ? barWindow(customerTimelines.notional, bar) : null;
      return [esc(row.label.replace(UNDECIDED_DEPTH, "")), window ? esc(formatWindow(window.start, window.end)) : "", esc(row.leadRole), hours(row.followOn!.architect), hours(row.followOn!.srConsultant), hours(row.followOn!.projectManager), hours(row.followOn!.total)];
    }), { numeric: [3, 4, 5, 6], foot: true, total: ["Total follow-on hours", "", "", hours(followOnTotals.architect), hours(followOnTotals.srConsultant), hours(followOnTotals.projectManager), hours(followOnTotals.total)] })}`
    : "";

  // ---- Customer effort
  const peak = customerEffort.peak;
  const customerEffortSection = customerEffort.phases.length
    ? `<h2>Customer Effort by Week &amp; Work Stream</h2><p class="lead">CDW planning estimate of ${esc(customer)} team time, by phase.${peak ? ` Peak demand is <b>${peak.total} hours per week (${peak.fte} FTE)</b> during ${esc(peak.phase.toLowerCase())} (${esc(peak.window)}).` : ""}</p>${table(["Phase", "Window", "Platform Lead hrs/wk", "Operations hrs/wk", "Network hrs/wk", "Total hrs/wk", "FTE"], customerEffort.phases.map(phase => [esc(phase.phase), esc(phase.window), String(phase.platformLead), String(phase.operations), String(phase.network), String(phase.total), phase.fte.toFixed(2)]), { numeric: [2, 3, 4, 5, 6] })}`
    : "";

  // ---- Personnel
  const named = report.personnel.filter(row => row.cdw.length || row.broadcom.length || row.customer.length);
  const withBroadcom = named.some(row => row.broadcom.length);
  const people = (names: string[]) => esc(names.join(" · "));
  const personnel = named.length
    ? `<h3>Target Personnel by Work Stream</h3>${table(["Work Stream", "CDW", ...(withBroadcom ? ["Broadcom"] : []), customer], named.map(row => [esc(row.workstream), people(row.cdw), ...(withBroadcom ? [people(row.broadcom)] : []), people(row.customer)]))}`
    : "";

  // ---- Design
  const profileRows = PROFILE_CATEGORIES.filter(([key]) => report.designProfile[key]?.trim()).map(([key, label]) => [esc(label), esc(report.designProfile[key] ?? "")]);
  const elementRows = report.designElements.map(item => [esc(item.component), esc(item.requirement), `${esc(item.recommendation)}${item.gate ? ` <b>Gate:</b> ${esc(item.gate)}.` : ""}`]);

  // ---- Deliverables: the playbook work packages for the selected path
  const packages = [...plan.designPackages, ...plan.implementationPackages];
  const deliverables = packages.length
    ? `<h3>What CDW Delivers</h3><p class="lead">${esc(plan.label)}: ${esc(plan.description)}</p>${table(["Work Package", "Outcome", "Acceptance"], packages.map(item => [esc(item.title), esc(item.outcome), esc(item.acceptance)]))}`
    : "";

  // ---- Sequence, timeline, milestones, forward plan
  const sequenceRows = FIXED_GANTT_CATEGORIES.flatMap(category => {
    const rows = items.filter(item => item.category === category);
    if (!rows.length) return [[`<b>${esc(category)}</b>`, "—", `No work in scope${report.declined.length ? ` — ${esc(report.declined.join(", "))} not requested` : ""}.`]];
    return rows.map((item, index) => [index === 0 ? `<b>${esc(category)}</b>` : "", esc(item.start === item.end ? shortDate(item.start) : formatWindow(item.start, item.end)), `${esc(item.label)}.${item.dependsOn.length ? ` Depends on ${esc(Array.from(new Set(item.dependsOn)).slice(0, 2).join(" and "))}.` : ""}${item.customerOwned ? ` Run by ${esc(customer)}.` : ""}`]);
  });
  const milestones = report.milestonesToDate.length
    ? `<h3>Engagement Milestones to Date</h3>${report.milestonesToDate.map(item => `<div class="ms"><b>${esc(shortDate(item.date))}</b><span><b>${esc(item.event)}</b>${item.detail ? ` — ${esc(item.detail)}` : ""}</span></div>`).join("")}`
    : "";
  const forward = items.filter(item => !item.customerOwned && item.swatch !== "muted" && item.category !== "Program Management & Governance")
    .map(item => `<div class="ms"><b>${esc(formatWindow(item.start, item.end))}</b><span>${esc(item.label)}${item.outcome ? ` — ${esc(item.outcome)}` : ""}</span></div>`).join("")
    + (termEnd ? `<div class="ms"><b>By ${esc(shortDate(termEnd))}</b><span>Full entitlement consumption — all hours consumed ahead of expiry.</span></div>` : "")
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
  const problems = report.problems.length ? `<h3>The problems worth solving first</h3><ul>${report.problems.map(item => `<li><b>${esc(item.problem)}</b>${item.addressedBy ? ` — ${esc(item.addressedBy)}` : ""}</li>`).join("")}</ul>` : "";
  const questions = report.openQuestions.length ? `<h3>The open questions</h3>${table(["Question", "Why we are asking now"], report.openQuestions.map(item => [esc(item.question), esc(item.whyNow)]))}` : "";
  const technical = report.technicalItems.map(item => `<li>${esc(item.item)}${item.reference ? ` — ${esc(item.reference)}` : ""}</li>`);
  const capitalized = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);
  const constraints = report.constraints.map(item => ({ ...item, imposedBy: capitalized(item.imposedBy) || "Calendar" }));
  // A leading "Label:" is set in bold, as in the template.
  const asks = report.customerAsks.map(item => esc(item).replace(/^([A-Z][^:]{0,40}):\s/, "<b>$1:</b> "));
  const withOwner = report.openItems.some(item => item.owner.trim());
  const openItems = report.openItems.length ? `<h3>Open Items</h3>${table(["Item", "What It Gates", ...(withOwner ? ["Owner"] : [])], report.openItems.map(item => [esc(item.item), esc(item.gates), ...(withOwner ? [esc(item.owner)] : [])]))}` : "";
  const pulledIn = outcomes.filter(item => item.requiredBy.length);

  const sources = report.sources.length ? report.sources.map(item => `${esc(item.title)}${item.date ? ` (${esc(shortDate(item.date))})` : ""}`).join("; ") : "Engagement plan and RVTools estate data";

  const body = `
<div class="band"><h1>${esc(platform.startsWith("VVF") ? "VMware vSphere Foundation" : "VMware Cloud Foundation")} Adoption — ${esc(customer)}</h1><p>Prepared for ${esc(customer)} | ${esc(stamp)}<br>${lead}</p></div>
<div class="pills">Customer: <b>${esc(customer)}${fields.location ? ` — ${esc(fields.location)}` : ""}</b> • Platform: <b>${esc(platform)}</b>${termStart && termEnd ? ` • Entitlement: <b>${esc(shortDate(termStart))} – ${esc(shortDate(termEnd))}</b>` : ""} • Path: <b>${esc(plan.label)}</b> • Delivery: <b>${esc(deliveryModel)}</b></div>
<div class="kpis">${kpis}</div>

<h2>Executive Summary</h2>
<p class="lead">Where ${esc(customer)} stands today, what the entitlement funds, and the plan to turn it into a platform the team can run.</p>
${situation.length ? `<h3>Situation</h3><ul>${situation.map(item => `<li>${item}</li>`).join("")}</ul>` : ""}
<h3>Plan on a Page</h3>
<p>${esc(selectedScopeSummary(document))}</p>
<ul>${planOnPage}</ul>

${burndownSection}
${scopedEffort}
${followOnSection}
${customerEffortSection}
${personnel}

<div class="closer">Make a clean ${esc(platform.split(" ")[0])} foundation happen.</div>
${profileRows.length ? `<h2>${esc(platform.split(" ")[0])} Design Profile</h2>
<p class="lead">Architecture summarized across the standard design profile categories. Decisions marked for design are set in the design sessions.</p>
${table(["Profile Category", `${customer} Design Decision`], profileRows)}` : ""}
${elementRows.length ? `<h3>Design Elements — Requirements &amp; Recommendations</h3>
<p class="lead">Per-component requirements with the recommendation for ${esc(customer)}. Gates are called out.</p>
${table(["Component", "Requirement", "Recommendation"], elementRows)}` : ""}
${deliverables}

<h2>Adoption Timeline</h2>
<p class="lead">The delivery sequence by calendar month, grouped under the five standard categories.</p>
<h3>Adoption Sequence &amp; Dependencies</h3>
${table(["Category", "Stage", "Activity and Dependency"], sequenceRows)}
${timelines.entitlement}
${milestones}
${forward ? `<h3>Forward Delivery Plan</h3>${forward}` : ""}
${timelines.notional}

<div class="closer">Make a proven, repeatable move happen.</div>
<h2>Adoption Plan &amp; Recommendation</h2>
<p class="lead">What we recommend ${esc(customer)} does with the remaining entitlement, and why the sequence is what it is.</p>
<h3>The short version</h3>
<p>${shortVersion}</p>
${heard}
${problems}
${questions}
${technical.length ? `<h3>The technical items to confirm early</h3><ul>${technical.join("")}</ul>` : ""}
${pulledIn.length ? `<p class="lead">Prerequisites included so selected outcomes can be delivered: ${esc(pulledIn.map(item => `${planOutcomeLabel(item.key)} (for ${item.requiredBy.map(key => planOutcomeLabel(key)).join(", ")})`).join("; "))}.</p>` : ""}
${constraints.length ? `<h3>Why the order is not negotiable</h3>
${table(["Constraint", "Imposed By", "Effect on the Sequence"], constraints.map(item => [esc(item.constraint), esc(item.imposedBy), esc(item.effect)]))}` : ""}
${asks.length ? `<h3>What this asks of ${esc(customer)}'s team</h3><ul>${asks.map(item => `<li>${item}</li>`).join("")}</ul>` : ""}
${openItems}

<div class="closer">Make full use of the entitlement happen.</div>
<div class="closer red">Make Amazing Happen.</div>
${report.revision ? `<div class="revision">Revision: ${esc(report.revision)}</div>` : ""}
<p class="sources">Prepared by CDW Consulting Solution Architecture for ${esc(customer)} — Functional Consumption Plan (Condensed) · ${esc(stamp)}. Sources: ${sources}.</p>`;

  const cover = `<section class="cover">${cdwLogoSvg("logo")}${cdwLogoSvg("orbit", "")}<div class="eyebrow">Functional Consumption Plan · ${esc(customer)}</div><h1>${esc(report.headline ?? "")}</h1><div class="sign">Make Amazing Happen.</div><div class="meta"><div><b>Prepared for</b>${esc(customer)}</div><div><b>Date</b>${esc(longDate(asOf))}</div><div><b>Prepared by</b>CDW Consulting Solution Architecture</div></div><div class="legend">${esc(LEGEND)}</div></section>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} - FCP</title><style>${CSS}</style></head><body>${cover}<table class="page"><thead><tr><td>${strip}</td></tr></thead><tfoot><tr><td><div class="legendrow">${esc(LEGEND)}</div></td></tr></tfoot><tbody><tr><td>${body}</td></tr></tbody></table><button class="printbtn" type="button" onclick="window.print()">Print / Save as PDF</button></body></html>`;
}
