import { formatWindow, type ScopedEffort } from "../shared/effort";
import { FIXED_GANTT_CATEGORIES, playbookPlanForFields, type EngagementDocument } from "../shared/fcp";
import { reconcileHours } from "../shared/reportFormat";
import { planKeyDates, platformName, selectedScopeSummary } from "../shared/reportView";
import { cdwLogoSvg } from "./brand/cdwLogo";
import { DRAFT_MARK, entitlementWindowTimeline, esc, firstSentence, hours, longDate, money, prepareReport, RESERVE_LINE, sentence, shortDate, UNDECIDED_DEPTH } from "./fcpReportParts";
import { renderTimeline } from "./timelineHtml";

/**
 * Summary FCP (docs/fcp-formats/FCP-REPORT-FORMATS.md section 3): two pages for a Commercial customer. Page 1 is the
 * plan (synopsis, scope, architecture, work packages with hours); page 2 the timeline, key dates and what the customer
 * owes. Customer-facing: the entitlement value is the one dollar figure, the customer sees funded scope only, and the
 * buckets, reserve and any under-funded gap stay internal.
 */

/** The issue a render is for: its number and the day it was issued. */
export type IssueStamp = { issueNumber: number; issuedOn: string };

/** Hard caps that keep the Summary at two pages. */
export const SUMMARY_CAPS = { keyDates: 5, commitments: 3, openItems: 3 } as const;

const LEGEND = "CDW · Proprietary and confidential. Copying restricted.";
const MORE = "See the full list in the Standard FCP.";

/** A CSS string literal: the footer text lives in @page margin boxes, which take only CSS content. */
const cssString = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/</g, "\\3C ").replace(/[\r\n]+/g, " ")}"`;
/** Bar labels without the planner's prefixes ("Month 1: ", "Weeks 1-2: "). */
const packageLabel = (value: string) => value.replace(UNDECIDED_DEPTH, "").replace(/^(Month \d+|Weeks? [\d–-]+): /, "");
const listJoin = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0] ?? "");
const monthAfter = (iso: string) => {
  const [year, month] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(next);
};

/**
 * Each page is laid out at its printed width, so the browser measures it as it will print. A page taller than its sheet
 * is scaled down to fit (never below FIT_MIN_ZOOM), and the Summary keeps to two pages however much the plan holds.
 * Inline, with no network: exported HTML stays self-contained. `data-fit` is "width height" in inches.
 */
export const FIT_MIN_ZOOM = 0.72;
const PAGE_FIT = { first: { width: 11, height: 7.95 }, rest: { width: 10.1, height: 7.65 } } as const;
const fitAttribute = (page: { width: number; height: number }) => `data-fit="${page.width} ${page.height}"`;
const FIT_SCRIPT = `<script>(function(){document.querySelectorAll("[data-fit]").forEach(function(page){var size=page.getAttribute("data-fit").split(" "),width=size[0]*96,height=size[1]*96,zoom=1;for(var step=0;step<4;step++){var tall=page.getBoundingClientRect().height;if(tall<=height||zoom<=${FIT_MIN_ZOOM})break;zoom=Math.max(${FIT_MIN_ZOOM},zoom*height/tall*0.995);page.style.zoom=String(zoom);page.style.width=width/zoom+"px";}});})();</script>`;

const CSS = `
:root{--ink:#1d1d1f;--slate:#3c4250;--muted:#6b7280;--line:#e3e6ea;--red:#CC0000;--dark:#242a38;--hair:#E4E7EC;--gray:#898B8E}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:var(--ink);font:11px/1.45 Helvetica,'Helvetica Neue',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:letter landscape;margin:.3in .45in .5in}
@page :first{margin:0 0 .5in}
.band{background:var(--red);color:#fff;padding:.32in .45in .24in;display:flex;justify-content:space-between;align-items:flex-end;gap:.4in}
.band .logo{width:1.05in;color:#fff;display:block;margin-bottom:12px}
.band .eyebrow{font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.92}
.band h1{margin:3px 0 0;font-size:24px;line-height:1.12;font-weight:900;letter-spacing:-.01em}
.band .meta{text-align:right;font-size:10px;line-height:1.5;white-space:nowrap}
.band .meta b{display:block;font-size:13px;font-weight:900}
.p1{padding:0 .45in}
.strip{display:flex;justify-content:space-between;align-items:center;border-top:4px solid var(--red);padding:6px 0 7px;border-bottom:1px solid var(--line);font-size:8.5px;color:var(--muted)}
.strip .logo{width:.45in;color:var(--red);vertical-align:middle;margin-right:8px}
.p1sheet{width:11in}
.p2{break-before:page;width:10.1in}
@media screen{.p2{margin:0 auto}}
.pills{font-size:10px;color:var(--slate);padding:9px 0;border-bottom:2px solid var(--red)}
.pills b{color:var(--ink)}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--line);border-top:0}
.kpi{padding:8px 13px;border-right:1px solid var(--line)}
.kpi:last-child{border-right:0}
.kpi .v{font-size:19px;font-weight:900;color:var(--red);line-height:1.15}
.kpi .l{font-size:10.5px;font-weight:800;margin-top:2px}
.kpi .s{font-size:9px;color:var(--muted);margin-top:1px}
.cols{display:grid;grid-template-columns:1.2fr 1fr;gap:.32in;margin-top:12px}
h2{font-size:17px;font-weight:900;margin:12px 0 3px;letter-spacing:-.01em}
h3{font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--red);margin:12px 0 5px;break-after:avoid}
.cols>div>h3:first-child,.bottom>div>h3:first-child{margin-top:0}
p{margin:0 0 6px}
.lead{color:var(--muted);font-size:10px}
.synopsis{font-size:12px;line-height:1.5;color:var(--ink)}
.scope{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.scope ul{margin:0;padding-left:15px}
.scope li{margin:0 0 4px;color:var(--slate)}
.scope li b{color:var(--ink)}
.scope .out li{color:var(--muted)}
table{width:100%;border-collapse:collapse}
.arch td{padding:5px 0;border-bottom:1px solid var(--hair);vertical-align:top;color:var(--slate)}
.arch td:first-child{width:1.15in;padding-right:10px;font-weight:800;color:var(--ink)}
.wp{font-size:10px}
.wp th{background:#eef0f3;color:var(--slate);font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;text-align:left;padding:5px 7px}
.wp td{padding:3px 7px;border-bottom:1px solid var(--hair);color:var(--slate)}
.wp td:first-child{color:var(--ink);font-weight:600}
.wp .num{text-align:right;font-variant-numeric:tabular-nums}
.wp tr.cat td{background:#f4f5f7;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink);padding:4px 7px}
.wp tr.total td{border-top:2px solid #1a1d21;border-bottom:0;font-weight:900;color:var(--ink)}
.wp tr.done td{color:var(--muted);font-weight:400;font-style:italic}
.wp tr.hold td{color:var(--muted)}
tr{break-inside:avoid}
.note{font-size:9px;color:var(--muted);margin-top:6px}
.bottom{display:grid;grid-template-columns:1fr 1.15fr .9fr;gap:.3in;margin-top:14px;break-inside:avoid}
.dates div{display:grid;grid-template-columns:.85in 1fr;gap:6px;padding:4px 0;border-bottom:1px solid var(--hair);font-size:10.5px;color:var(--slate)}
.dates b{color:var(--ink)}
.asks{margin:0;padding-left:15px}
.asks li{margin:0 0 5px;color:var(--slate);font-size:10.5px}
.asks b{color:var(--ink)}
.open{font-size:10px}
.open td{padding:4px 0;border-bottom:1px solid var(--hair);color:var(--slate);vertical-align:top}
.open td:first-child{font-weight:700;color:var(--ink);padding-right:8px}
.open td:last-child{text-align:right;padding-left:8px}
.after{background:#f6f7f9;border-left:3px solid var(--dark);padding:9px 12px;font-size:10.5px;color:var(--slate)}
.after b{color:var(--ink)}
.closer{font-weight:900;color:var(--red);font-size:14px;margin-top:12px}
.timeline-legend{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:0 0 6px;font-size:7.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}
.timeline-legend-item{display:inline-flex;align-items:center;gap:4px;border:1px solid;border-radius:999px;padding:2px 5px;font-size:7px;line-height:1;font-weight:800;letter-spacing:0;text-transform:none}
.timeline-legend-item i{display:inline-block;width:6px;height:6px;border-radius:999px;background:currentColor;opacity:.55}
.timeline-wrap{border:1px solid var(--line);background:#fff}
.timeline-empty{border:1px solid var(--line);background:#f8fafc;color:#475569;padding:16px;font-size:11px}
.timeline-grid{display:grid;width:100%;min-width:0!important;grid-template-columns:1.25in repeat(var(--timeline-slots,12),minmax(0,1fr))!important}
.timeline-corner,.timeline-head{background:#eef2f6;font-size:7px;font-weight:700;padding:4px 3px;line-height:1.1;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.timeline-lane{padding:5px 6px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.timeline-category-lane{grid-column:1}
.timeline-lane strong{display:block;color:var(--dark);font-size:8px;line-height:1.2}
.timeline-row{display:grid;position:relative;align-items:center;border-bottom:1px solid var(--line);background-image:linear-gradient(to right,transparent calc(100% - 1px),#e2e8f0 calc(100% - 1px));background-size:calc(100% / var(--months,12)) 100%}
.timeline-category-row{min-width:0!important;min-height:30px!important;grid-template-rows:none!important;grid-auto-rows:minmax(18px,auto)}
.timeline-bar{margin:2px;padding:3px 4px;border:1px solid;border-radius:3px;font-size:6.8px;font-weight:700;line-height:1.1;min-height:16px;overflow:hidden}
.timeline-bar.deferred{border-style:dashed}
.printbtn{position:fixed;right:18px;bottom:18px;background:var(--red);color:#fff;border:0;border-radius:999px;padding:10px 18px;font-weight:800;cursor:pointer}
@media print{.printbtn{display:none}}
@media screen{body{max-width:11in;margin:0 auto}}
`;

/** The footer on every page, in @page margin boxes so the page number is the printed page. */
function footerCss(customer: string, version: IssueStamp | undefined): string {
  const right = `Functional Consumption Plan · ${customer} · ${version ? `Version ${version.issueNumber}` : "Working draft"} · Page `;
  const box = "font:8px Helvetica,'Helvetica Neue',Arial,sans-serif;color:#898b8e;border-top:1px solid #e3e6ea;vertical-align:top;padding-top:7px";
  return `@page{@bottom-left{content:${cssString(LEGEND)};${box}}@bottom-right{content:${cssString(right)} counter(page) " of " counter(pages);text-align:right;${box}}}@page :first{@bottom-left{padding-left:.45in}@bottom-right{padding-right:.45in}}`;
}

export function renderSummaryFcpHtml(title: string, input: EngagementDocument, options: { today?: string; effort: ScopedEffort; draft?: boolean; version?: IssueStamp; deliveredNotes?: string[] }): string {
  const { bsasOnly, w, deferredWork, document, today, asOf, customer, burndown, termEnd, assumedEnd, termStart, bsas } = prepareReport(input, options);
  const { fields, report } = document;
  const effort = options.effort;
  const plan = playbookPlanForFields(fields);
  const platform = platformName(document);
  const vvf = platform.startsWith("VVF");
  const deliveryModel = report.deliveryModel || "CDW";
  const version = options.version;
  const issued = version ? `Version ${version.issueNumber} · Issued ${shortDate(version.issuedOn)}` : `Working draft · ${shortDate(asOf)}`;

  // ---- Header band and fact strip
  const band = `<header class="band"><div>${cdwLogoSvg("logo")}<div class="eyebrow">Functional Consumption Plan · Summary</div><h1>${vvf ? "VMware vSphere Foundation" : "VMware Cloud Foundation"} Adoption: ${esc(customer)}</h1></div><div class="meta">${version ? `<b>Version ${version.issueNumber}</b>Issued ${esc(shortDate(version.issuedOn))}` : `<b>Working draft</b>Prepared ${esc(shortDate(asOf))}`}<br>Prepared by CDW Consulting Solution Architecture</div></header>`;
  const pills = `<div class="pills">Platform: <b>${esc(platform)}</b> · Path: <b>${esc(plan.label)}</b> · Delivery: <b>${esc(deliveryModel)}</b>${fields.location ? ` · Location: <b>${esc(fields.location)}</b>` : ""}</div>`;

  const kpi = (value: string, label: string, sub: string) => `<div class="kpi"><div class="v">${value}</div><div class="l">${label}</div><div class="s">${sub}</div></div>`;
  const term = termStart && termEnd ? `${esc(shortDate(termStart))} to ${esc(shortDate(termEnd))}` : "";
  const valueTile = bsasOnly
    ? kpi(`${hours(fields.bsasHours)} hrs`, "Broadcom Software Adoption Services", `BSAS hours${term ? ` · ${term}` : ""}`)
    : fields.entitlementAmount
      ? kpi(esc(money(fields.entitlementAmount)), `${esc(platform.split(" ")[0])} Services Entitlement`, [burndown ? `${hours(burndown.entitledHours)} hours` : "", term].filter(Boolean).join(" · "))
      : kpi(`${hours(effort.totals.total)} hrs`, "Planned CDW Hours", "No entitlement booked yet");
  const consumedAsOf = report.entitlement.consumedAsOf;
  const remainingTile = burndown
    ? kpi(`${hours(burndown.remainingHours)} hrs`, "Hours Remaining", `${hours(burndown.consumedHours)} of ${hours(burndown.entitledHours)} delivered${consumedAsOf ? ` as of ${esc(shortDate(consumedAsOf))}` : ""}`)
    : kpi(`${hours(effort.totals.total)} hrs`, "Planned CDW Hours", effort.source === "assignments" ? "Signed resource assignments" : "Estimated from this plan");
  const { implementationStart, buildStart, buildLater } = planKeyDates(document);
  const startTile = implementationStart ? kpi(esc(shortDate(implementationStart)), "Plan Starts", buildLater && buildStart ? `Design and planning first; build from ${esc(shortDate(buildStart))}` : "Build, upgrade and migration work begins") : "";
  const endTile = termEnd ? kpi(esc(shortDate(termEnd)), w("Entitlement Ends", "BSAS Term Ends"), `${w("Unused hours are not refunded", "Unused BSAS hours are forfeited")}${assumedEnd ? "; date to be confirmed" : ""}`) : "";
  const tiles = [valueTile, remainingTile, startTile, endTile].filter(Boolean);
  const kpis = `<div class="kpis" style="grid-template-columns:repeat(${tiles.length},1fr)">${tiles.join("")}</div>`;

  // ---- What we're doing: the plan in a few sentences; what follows the entitlement is in After This Plan
  const builds = plan.implementationPackages.length > 0;
  const synopsis = [
    builds ? `CDW designs and builds the ${platform} foundation for ${customer}, proves the runbook and hands the platform over, and ${customer}'s team repeats it.` : `CDW delivers the ${platform} architecture and an implementation-ready design that ${customer}'s team builds from.`,
    selectedScopeSummary(document),
  ].join(" ");

  // ---- In this plan / Not in this plan, one line per category: the packages with CDW hours, and what is not funded
  const funded = effort.workPackages.filter(row => !row.deferred && row.total > 0);
  const inPlan: string[] = [];
  const notInPlan: string[] = [];
  for (const category of FIXED_GANTT_CATEGORIES) {
    const labels = Array.from(new Set(funded.filter(row => row.category === category).map(row => packageLabel(row.label))));
    const later = deferredWork.filter(row => row.category === category).map(row => packageLabel(row.label));
    if (labels.length) inPlan.push(`<li><b>${esc(category)}:</b> ${esc(labels.join(", "))}</li>`);
    if (later.length) notInPlan.push(`<li><b>${esc(category)}:</b> ${esc(later.join(", "))}, after the ${w("entitlement", "BSAS term")}</li>`);
    else if (!labels.length) notInPlan.push(`<li><b>${esc(category)}:</b> ${report.declined.length ? `not requested (${esc(listJoin(report.declined))})` : "not in this plan"}</li>`);
  }
  if (report.customerOwnedWork.length) notInPlan.push(`<li><b>Run by ${esc(customer)}:</b> ${esc(report.customerOwnedWork.map(work => work.label).join("; "))}</li>`);
  const scope = inPlan.length || notInPlan.length
    ? `<div class="scope">${inPlan.length ? `<div><h3>In This Plan</h3><ul>${inPlan.join("")}</ul></div>` : ""}${notInPlan.length ? `<div class="out"><h3>Not in This Plan</h3><ul>${notInPlan.join("")}</ul></div>` : ""}</div>`
    : "";

  // ---- Architecture at a glance: three lines from the design profile and discovery
  const profile = report.designProfile;
  const discovery = report.discovery;
  // The first clause of each, so the three lines stay three lines.
  const clause = (text: string) => firstSentence(text.split(/;\s/)[0], 160).replace(/[.;,\s]+$/, "");
  const joined = (...parts: Array<string | null | undefined>) => parts.filter((part): part is string => Boolean(part && part.trim())).map(part => sentence(clause(part))).join(" ");
  const archRows: Array<[string, string]> = [
    ["Platform", profile.availability || profile.physicalSite ? joined(`${platform}${discovery.serverVendor ? ` on ${discovery.serverVendor} hosts` : ""}`, profile.availability, profile.physicalSite) : ""],
    ["Storage, network", joined(discovery.storage, profile.isolation)],
    ["Recovery", joined(profile.recoverability)],
  ].filter((row): row is [string, string] => Boolean(row[1])) as Array<[string, string]>;
  const architecture = archRows.length ? `<h3>Architecture at a Glance</h3><table class="arch"><tbody>${archRows.map(([label, text]) => `<tr><td>${esc(label)}</td><td>${esc(text)}</td></tr>`).join("")}</tbody></table>` : "";

  // ---- Work packages: package, month, hours. Delivered hours are their own row; the plan schedules what remains.
  const reconciliation = reconcileHours(input, effort, today);
  const delivered = reconciliation && reconciliation.delivered > 0 ? reconciliation : null;
  const deliveredRows = delivered ? [`<tr class="cat"><td colspan="3">Delivered to Date</td></tr>`, `<tr class="done"><td>${esc(options.deliveredNotes?.length ? options.deliveredNotes.join("; ") : "Hours delivered to date")}</td><td>${esc(termStart && delivered.deliveredAsOf ? formatWindow(termStart, delivered.deliveredAsOf) : delivered.deliveredAsOf ? `To ${shortDate(delivered.deliveredAsOf)}` : "")}</td><td class="num">${hours(delivered.delivered)}</td></tr>`] : [];
  let packageRows: string[];
  if (effort.source === "assignments" || !effort.workPackages.some(row => row.total > 0)) {
    packageRows = effort.rows.filter(row => row.total > 0).map(row => `<tr><td>${esc(row.note ? `${row.workstream} (${row.note})` : row.workstream)}</td><td></td><td class="num">${hours(row.total)}</td></tr>`);
  } else {
    const shown = effort.workPackages.filter(row => !row.deferred && row.total > 0);
    packageRows = FIXED_GANTT_CATEGORIES.flatMap(category => {
      const rows = shown.filter(row => row.category === category);
      return rows.length ? [`<tr class="cat"><td colspan="3">${esc(category)}</td></tr>`, ...rows.map(row => `<tr><td>${esc(packageLabel(row.label))}</td><td>${row.start && row.end ? esc(formatWindow(row.start, row.end)) : ""}</td><td class="num">${hours(row.total)}</td></tr>`)] : [];
    });
    packageRows.push(...shown.filter(row => !row.category).map(row => `<tr><td>${esc(packageLabel(row.label))}</td><td></td><td class="num">${hours(row.total)}</td></tr>`));
  }
  // The reserve is one line, so the column visibly adds up to the entitlement; the buckets behind it stay internal.
  const reserve = Math.round(effort.internal.fit?.reserveHours ?? 0);
  const reserveRows = reserve >= 1 ? [`<tr class="hold"><td>${esc(RESERVE_LINE)}</td><td></td><td class="num">${hours(reserve)}</td></tr>`] : [];
  const balanced = Boolean(reconciliation?.balanced);
  const total = (delivered?.delivered ?? 0) + Math.round(effort.totals.total) + (reserve >= 1 ? reserve : 0);
  const totalLabel = balanced ? w("Total, funded by the entitlement", "Total, funded by the BSAS hours") : "Total CDW hours";
  const basis = effort.source === "assignments" ? "From the signed resource assignments." : "The signed resource assignments replace these estimates.";
  // The sentence states only what the printed figures show: "equals" when they add up to the hour.
  const reconcileNote = reconciliation && balanced
    ? `CDW-delivered hours: ${hours(reconciliation.delivered)} delivered, ${hours(reconciliation.planned)} planned and ${hours(reconciliation.reserve)} held for change requests ${reconciliation.exact ? "add up to" : "use"} the ${hours(reconciliation.entitled)}-hour ${w("entitlement", "BSAS allocation")}${reconciliation.exact ? "" : ", to within an hour of rounding"}. ${basis}`
    : delivered ? `CDW-delivered hours: ${hours(delivered.delivered)} delivered, ${hours(delivered.planned)} planned and ${hours(delivered.reserve)} held for change requests. ${basis}` : `CDW-delivered hours. ${basis}`;
  const workPackages = `<h3>Work Packages</h3><table class="wp" data-foot="sum"><thead><tr><th>Package</th><th>Month</th><th class="num">Hours</th></tr></thead><tbody>${[...deliveredRows, ...packageRows, ...reserveRows].join("")}<tr class="total"><td>${esc(totalLabel)}</td><td></td><td class="num">${hours(total)}</td></tr></tbody></table><p class="note">${esc(reconcileNote)}</p>`;

  // ---- Page 2: the entitlement window, key dates, what we need, after this plan
  const windowStart = fields.plannedProjectStart || fields.targetStart || document.adoptionTimeline.startDate;
  const windowEnd = termEnd ? longDate(termEnd) : document.adoptionTimeline.columns.at(-1) || "plan end";
  const timeline = `<h2>Timeline</h2><p class="lead">${esc(windowStart ? longDate(windowStart) : "Plan start")} through ${esc(windowEnd)}, the ${w("entitlement window", "BSAS term")}. Dashed bars are run by ${esc(customer)}. ◆ marks key delivered functionality.</p>${renderTimeline(entitlementWindowTimeline(document, termEnd), w("No activities are scheduled in the entitlement window.", "No activities are scheduled in the BSAS term."), undefined, { skipEmptyCategories: true })}`;

  const upcoming = report.milestonesToDate.filter(item => item.date > today);
  const candidates: Array<{ date: string; text: string; end?: boolean }> = [
    ...upcoming.map(item => ({ date: item.date, text: item.event })),
    ...(implementationStart ? [{ date: implementationStart, text: buildLater ? "Design and planning start" : "Implementation services start" }] : []),
    ...(buildLater && buildStart ? [{ date: buildStart, text: "Platform build begins" }] : []),
    ...(fields.targetComplete ? [{ date: fields.targetComplete, text: `${customer}'s target completion` }] : []),
    ...(bsas && !bsasOnly ? [{ date: bsas.termStart, text: "BSAS term starts for follow-on work" }, { date: bsas.termEnd, text: "BSAS term ends; unused BSAS hours are forfeited" }] : []),
    ...(termEnd ? [{ date: termEnd, text: w("Entitlement ends; unused hours are not refunded", "BSAS term ends; unused BSAS hours are forfeited"), end: true }] : []),
  ].sort((left, right) => left.date.localeCompare(right.date));
  // The end of the entitlement always shows; the cap drops the latest of the others.
  const ending = candidates.filter(item => item.end);
  const others = candidates.filter(item => !item.end).slice(0, SUMMARY_CAPS.keyDates - ending.length);
  const keyDates = [...others, ...ending].sort((left, right) => left.date.localeCompare(right.date));
  const datesMore = candidates.length > keyDates.length;
  const datesSection = keyDates.length ? `<h3>Key Dates</h3><div class="dates">${keyDates.map(item => `<div><b>${esc(shortDate(item.date))}</b><span>${esc(item.text)}</span></div>`).join("")}</div>${datesMore ? `<p class="note">${MORE}</p>` : ""}` : "";

  const asks = report.customerAsks.slice(0, SUMMARY_CAPS.commitments).map(item => `<li>${esc(item).replace(/^([A-Z][^:]{0,40}):\s/, "<b>$1:</b> ")}</li>`);
  const needs = asks.length ? `<h3>What We Need from ${esc(customer)}</h3><ul class="asks">${asks.join("")}</ul>${report.customerAsks.length > SUMMARY_CAPS.commitments ? `<p class="note">${MORE}</p>` : ""}` : "";
  const withOwner = report.openItems.some(item => item.owner.trim());
  const openItems = report.openItems.length ? `<h3>Open Items</h3><table class="open"><tbody>${report.openItems.slice(0, SUMMARY_CAPS.openItems).map(item => `<tr><td>${esc(item.item)}</td><td>${esc(item.gates)}</td>${withOwner ? `<td>${esc(item.owner)}</td>` : ""}</tr>`).join("")}</tbody></table>${report.openItems.length > SUMMARY_CAPS.openItems ? `<p class="note">${MORE}</p>` : ""}` : "";

  // Work after the entitlement: packages moved there whole, and the rest of packages this plan only starts.
  const followOnRows = effort.workPackages.filter(row => row.followOn && row.followOn.total > 0);
  const moved = followOnRows.filter(row => row.deferred || row.total <= 0).map(row => packageLabel(row.label));
  const remainder = followOnRows.filter(row => !row.deferred && row.total > 0).map(row => packageLabel(row.label).toLowerCase());
  const followOnHours = followOnRows.reduce((sum, row) => sum + row.followOn!.total, 0);
  const when = termEnd ? `from ${monthAfter(termEnd)}` : `after the ${w("entitlement", "BSAS term")}`;
  const whatFollows = moved.length
    ? `${listJoin(moved)}${remainder.length ? `, with the rest of the ${listJoin(remainder)},` : ""} follow${moved.length === 1 && !remainder.length ? "s" : ""} ${when}`
    : `The rest of the ${listJoin(remainder)} follows ${when}`;
  const bsasFunds = bsas && !bsasOnly ? ` Broadcom Software Adoption Services (BSAS) fund up to ${hours(bsas.hours)} hours of it from ${shortDate(bsas.termStart)} to ${shortDate(bsas.termEnd)}.` : "";
  const after = followOnRows.length
    ? `<h3>After This Plan</h3><div class="after">${esc(whatFollows)}, about <b>${hours(followOnHours)} hours</b>.${esc(bsasFunds)} It needs follow-on funding: ${w("a renewal with entitlement attached or a services purchase", "additional BSAS hours or a services purchase")}.</div>`
    : "";

  const strip = `<div class="strip"><span>${cdwLogoSvg("logo")}Consulting Solution Architecture</span><span>Functional Consumption Plan · Prepared for ${esc(customer)} · ${esc(issued)}</span></div>`;
  const page1 = `<section class="p1sheet" ${fitAttribute(PAGE_FIT.first)}>${band}<div class="p1">${pills}${kpis}<div class="cols"><div><h3>What We're Doing</h3><p class="synopsis">${esc(synopsis)}</p>${scope}${architecture}</div><div>${workPackages}</div></div></div></section>`;
  const page2 = `<section class="p2" ${fitAttribute(PAGE_FIT.rest)}>${strip}${timeline}<div class="bottom"><div>${datesSection}</div><div>${needs}${openItems}</div><div>${after}<div class="closer">Make Amazing Happen.</div></div></div></section>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} - FCP</title><style>${CSS}${footerCss(customer, version)}</style></head><body>${options.draft ? DRAFT_MARK : ""}${page1}${page2}<button class="printbtn" type="button" onclick="window.print()">Print / Save as PDF</button>${FIT_SCRIPT}</body></html>`;
}
