import { buildCustomerEffort, formatWindow } from "../shared/effort";
import { FIXED_GANTT_CATEGORIES } from "../shared/fcp";
import { barWindow } from "../shared/buildingBlocks";
import { customerFacing, DRAFT_MARK, esc, firstSentence, hours, longDate, RESERVE_LINE, sentence, shortDate, UNDECIDED_DEPTH } from "./fcpReportParts";
import { cdwLogoSvg } from "./brand/cdwLogo";
import { CSS, FIT_SCRIPT, fitAttribute, footerCss, listJoin, packageLabel, PAGE_FIT, summaryParts, summaryTimeline, type SummaryOptions } from "./fcpSummaryRenderer";
import { renderTimeline, sliceTimeline } from "./timelineHtml";
import type { EngagementDocument } from "../shared/fcp";

/**
 * Standard FCP (docs/fcp-formats/FCP-REPORT-FORMATS.md section 4): the Summary's spine with the depth a Broadcom
 * approver and a larger customer team expect. Cover, Summary, Scope and Architecture, Work Packages, Adoption
 * Timeline, Roadmap and Working Together. It draws the same tiles, timeline and key dates as the Summary (the
 * Summary's parts), uncapped, and leaves out any page or section with nothing to show. Customer-facing: the
 * entitlement value is the one dollar figure; buckets, the gap and the fit stay internal.
 */

const EXTRA_CSS = `
.cover{width:11in;height:7.95in;background:var(--red);color:#fff;padding:.7in .8in;display:flex;flex-direction:column;justify-content:space-between}
.cover .logo{width:1.5in;color:#fff;display:block}
.cover .eyebrow{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;opacity:.92}
.cover h1{margin:10px 0 0;font-size:40px;line-height:1.08;font-weight:900;letter-spacing:-.02em;max-width:8in}
.cover .tag{font-size:17px;font-weight:700;margin-top:16px;max-width:7.5in}
.cover .who{font-size:12px;line-height:1.7}
.cover .who b{font-size:15px}
.pg{break-before:page;width:10.1in}
.paged .wp.std td{padding:2px 7px}
.paged{width:100%;border-collapse:collapse}.paged>thead>tr>td,.paged>tbody>tr>td{padding:0;border:0;background:none}.paged>thead{display:table-header-group}
@media screen{.pg{margin:0 auto}}
.ctrl{display:grid;grid-template-columns:repeat(4,1fr);gap:0;border:1px solid var(--line);margin-top:10px;font-size:10px}
.ctrl div{padding:6px 10px;border-right:1px solid var(--line);color:var(--slate)}
.ctrl div:last-child{border-right:0}
.ctrl b{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:2px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:.3in;margin-top:10px}
.two>div>h3:first-child{margin-top:0}
.std{font-size:9.5px}
.std th{background:#eef0f3;color:var(--slate);font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;text-align:left;padding:5px 7px}
.std td{padding:4px 7px;border-bottom:1px solid var(--hair);color:var(--slate);vertical-align:top}
.std td:first-child{color:var(--ink);font-weight:600}
.std .num{text-align:right;font-variant-numeric:tabular-nums}
.std tr.total td{border-top:2px solid #1a1d21;border-bottom:0;font-weight:900;color:var(--ink)}
.std tr.cat td{background:#f4f5f7;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink);padding:4px 7px}
.std tr.done td{color:var(--muted);font-weight:400;font-style:italic}
.std tr.hold td{color:var(--muted)}
.std tr.sub td{font-weight:800;color:var(--ink);border-top:1px solid var(--line)}
.wp-detail{font-weight:400;font-size:8.5px;color:var(--muted);margin-top:2px;line-height:1.35}
.milestones div{display:grid;grid-template-columns:.85in 1fr;gap:6px;padding:4px 0;border-bottom:1px solid var(--hair);font-size:10.5px;color:var(--slate)}
.milestones b{color:var(--ink)}
.closer{font-weight:900;color:var(--red);font-size:14px;margin-top:12px}
`;

type Cell = string;
const table = (headers: string[], rows: Cell[][], options: { numeric?: number[]; foot?: boolean; total?: Cell[]; className?: string } = {}) => {
  const numeric = new Set(options.numeric ?? []);
  const cell = (value: Cell, index: number, tag: "td" | "th") => `<${tag}${numeric.has(index) ? ' class="num"' : ""}>${value}</${tag}>`;
  // A row's first cell can carry a style marker ("\u0001done", "\u0001hold" or "\u0001sub") that becomes the row's class.
  const body = rows.map(row => {
    if (row.length === 1) return `<tr class="cat"><td colspan="${headers.length}">${row[0]}</td></tr>`;
    const marked = /^\u0001(done|hold|sub):/.exec(row[0]);
    const cells = marked ? [row[0].slice(marked[0].length), ...row.slice(1)] : row;
    return `<tr${marked ? ` class="${marked[1]}"` : ""}>${cells.map((value, index) => cell(value, index, "td")).join("")}</tr>`;
  }).join("");
  const total = options.total ? `<tr class="total">${options.total.map((value, index) => cell(value, index, "td")).join("")}</tr>` : "";
  return `<table class="std ${options.className ?? ""}"${options.foot ? ' data-foot="sum"' : ""}><thead><tr>${headers.map((header, index) => cell(esc(header), index, "th")).join("")}</tr></thead><tbody>${body}${total}</tbody></table>`;
};

export function renderStandardFcpHtml(title: string, input: EngagementDocument, options: SummaryOptions): string {
  const parts = summaryParts(title, input, options, { keyDates: 99, commitments: 99, openItems: 99 }, true);
  const { prepared, plan, platform, vvf, issued, kpis, pills, synopsis, scope, strip, timeline, datesSection, delivered, reserve, balanced, totalLabel, total, reconcileNote, followOnRows, bsasPlan, after, customerItems } = parts;
  const { document, customer, today, termEnd, assumedEnd, bsasOnly, w, customerTimelines } = prepared;
  const booked = parts.booked;
  const { fields, report } = document;
  const effort = options.effort;
  const version = options.version;
  const rest = fitAttribute(PAGE_FIT.rest);
  const page = (body: string) => `<section class="pg" ${rest}>${strip}${body}</section>`;
  const bold = (text: string) => esc(text).replace(/^([A-Z][^:]{0,40}):\s/, "<b>$1:</b> ");

  // ---- Cover
  const cover = `<section class="cover" ${fitAttribute(PAGE_FIT.first)}><div>${cdwLogoSvg("logo")}</div><div><div class="eyebrow">Functional Consumption Plan · Standard</div><h1>${vvf ? "VMware vSphere Foundation" : "VMware Cloud Foundation"} Adoption: ${esc(customer)}</h1><div class="tag">Amazing happens when ${esc(customer)} runs a modern ${esc(platform)} private cloud with confidence.</div></div><div class="who"><b>Prepared for ${esc(customer)}</b><br>${esc(issued)}<br>Prepared by CDW Consulting Solution Architecture<br><b>Make Amazing Happen.</b></div></section>`;

  // ---- Summary page: tiles, document control, the plan on a page
  // The previous issue's approvals are history, so they print; a status for this issue would go stale once it is approved.
  const supersededText = (() => {
    if (!version || version.issueNumber <= 1) return "None";
    const prior = options.supersedes;
    const approvals = [prior?.broadcomApprovedOn ? `by Broadcom ${shortDate(prior.broadcomApprovedOn)}` : "", prior?.customerApprovedOn ? `by ${customer} ${shortDate(prior.customerApprovedOn)}` : ""].filter(Boolean);
    return `Version ${version.issueNumber - 1}${approvals.length ? `, approved ${approvals.join(" and ")}` : ""}`;
  })();
  const control = `<div class="ctrl"><div><b>Version</b>${version ? (options.draft ? `${version.issueNumber}, draft` : `${version.issueNumber}, issued ${esc(shortDate(version.issuedOn))}`) : "Working draft"}</div><div style="grid-column:span 2"><b>Supersedes</b>${esc(supersededText)}</div><div><b>Revision</b>${esc(report.revision || (version && version.issueNumber === 1 ? "Initial plan" : "Working draft"))}</div><div style="grid-column:1/-1"><b>Approval</b>To approve this plan, reply to the email it was sent with.</div></div>`;
  const situation = report.situation.length ? `<h3>Situation</h3><ul class="asks">${report.situation.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : "";
  const summaryPage = page(`<h2>${vvf ? "VMware vSphere Foundation" : "VMware Cloud Foundation"} Adoption: ${esc(customer)}</h2>${pills}${kpis}${control}<div class="two"><div><h3>Summary</h3><p class="synopsis">${esc(synopsis)}</p>${situation}</div><div><h3>Plan on a Page</h3>${scope}</div></div>`);
  void plan;

  // ---- Scope and architecture
  const heard = report.whatWeHeard.length ? `<h3>What We Heard, and Where It Lands</h3>${table(["Topic", `${customer} position`, "Where it lands"], report.whatWeHeard.map(item => [esc(item.component), esc(item.customerPosition), esc(item.whereItLands)]))}` : "";
  const profileLabels: Array<[keyof typeof report.designProfile, string]> = [["consumption", "Consumption"], ["physicalSite", "Physical site"], ["availability", "Availability"], ["isolation", "Isolation"], ["recoverability", "Recoverability"], ["expansion", "Expansion"]];
  const profileRows = profileLabels.filter(([key]) => report.designProfile[key]?.trim()).map(([key, label]) => [esc(label), esc(report.designProfile[key])]);
  const profile = profileRows.length ? `<h3>${esc(platform.split(" ")[0])} Design Profile</h3>${table(["Area", "Design"], profileRows)}` : "";
  const scopePage = page(`<h2>Scope and Architecture</h2><p class="lead">What this plan delivers, what it doesn't, and the platform it builds.</p>${scope}<div class="two"><div>${heard}</div><div>${profile}</div></div>`);

  // ---- Work packages: window, lead role, hours by role, one-line outcome, accepted when
  const bars = new Map(document.adoptionTimeline.lanes.flatMap(lane => lane.bars).map(bar => [bar.id, bar]));
  const acceptance = new Map<string, (typeof plan.designPackages)[number]>([...plan.designPackages.map(item => [`bar-playbook-design-${item.id}`, item] as [string, typeof item]), ...plan.implementationPackages.map(item => [`bar-playbook-execution-${item.id}`, item] as [string, typeof item])]);
  const detail = (row: (typeof effort.workPackages)[number]) => {
    const playbook = acceptance.get(row.id);
    const text = [sentence(playbook?.outcome ?? firstSentence(bars.get(row.id)?.outcome, 220) ?? "").replace(/^\.$/, ""), playbook?.acceptance ? sentence(`Accepted when: ${playbook.acceptance}`) : ""].filter(Boolean);
    return text.length ? `<div class="wp-detail">${text.map(item => esc(item)).join(" ")}</div>` : "";
  };
  const shown = effort.workPackages.filter(row => !row.deferred && row.total > 0);
  const num = (value: number) => hours(value);
  const deliveredRow = delivered ? [[`Delivered to date`], [`\u0001done:${esc(options.deliveredNotes?.length ? options.deliveredNotes.join("; ") : "Hours delivered to date")}`, esc(prepared.termStart && delivered.deliveredAsOf ? formatWindow(prepared.termStart, delivered.deliveredAsOf) : delivered.deliveredAsOf ? `To ${shortDate(delivered.deliveredAsOf)}` : ""), "", "", "", "", num(delivered.delivered)]] : [];
  const packageRows = FIXED_GANTT_CATEGORIES.flatMap(category => {
    const rows = shown.filter(row => row.category === category);
    return rows.length ? [[esc(category)], ...rows.map(row => [`${esc(packageLabel(row.label))}${detail(row)}`, row.start && row.end ? esc(formatWindow(row.start, row.end)) : "", esc(row.leadRole), num(row.architect), num(row.srConsultant), num(row.projectManager), num(row.total)])] : [];
  });
  const uncategorised = shown.filter(row => !row.category).map(row => [esc(packageLabel(row.label)), "", esc(row.leadRole), num(row.architect), num(row.srConsultant), num(row.projectManager), num(row.total)]);
  const reserveRow = reserve >= 1 ? [[`\u0001hold:${esc(RESERVE_LINE)}`, "", "", "", "", "", num(reserve)]] : [];
  const workRows = !shown.length
    ? effort.rows.filter(row => row.total > 0).map(row => [esc(row.note ? `${row.workstream} (${row.note})` : row.workstream), "", "", num(row.architect), num(row.srConsultant), num(row.projectManager), num(row.total)])
    : [...packageRows, ...uncategorised];
  // The planned packages, then their subtotal, then what the entitlement also holds: hours already delivered and the
  // reserve have no role split, so the entitlement total shows hours only and every role column adds up where it shows.
  const plannedRoles = (!shown.length ? effort.rows.filter(row => row.total > 0) : shown).reduce((sum, row) => ({ architect: sum.architect + row.architect, srConsultant: sum.srConsultant + row.srConsultant, projectManager: sum.projectManager + row.projectManager, total: sum.total + row.total }), { architect: 0, srConsultant: 0, projectManager: 0, total: 0 });
  const heldRows = [...(deliveredRow as Cell[][]), ...reserveRow];
  const plannedRow = heldRows.length ? [[`\u0001sub:Total planned`, "", "", num(plannedRoles.architect), num(plannedRoles.srConsultant), num(plannedRoles.projectManager), num(plannedRoles.total)]] : [];
  const entitlementTotal = heldRows.length
    ? [esc(totalLabel), "", "", "", "", "", num(total)]
    : [esc(totalLabel), "", "", num(effort.totals.architect), num(effort.totals.srConsultant), num(effort.totals.projectManager), num(total)];
  const workTable = table(["Work package", "Window", "Lead role", "Architect", "Sr. Consultant", "PM", "Total"], [...workRows, ...plannedRow, ...heldRows], { numeric: [3, 4, 5, 6], foot: true, className: "wp-table", total: entitlementTotal });
  const workPage = page(`<h2>Work Packages and Scoped Effort</h2><p class="lead">Each package with its window, lead role, CDW hours and how it is accepted. ${esc(reconcileNote)}${balanced ? "" : ""}</p>${workTable}`);

  // ---- Adoption timeline, milestones to date, key dates
  const past = report.milestonesToDate.filter(item => item.date <= today);
  const milestones = past.length ? `<h3>Milestones to Date</h3><div class="milestones">${past.map(item => `<div><b>${esc(shortDate(item.date))}</b><span>${esc(item.event)}</span></div>`).join("")}</div>` : "";
  const timelinePage = page(`${timeline.replace("<h2>Timeline</h2>", "<h2>Adoption Timeline</h2>")}<div class="two">${milestones ? `<div>${milestones}</div>` : ""}<div>${datesSection}</div></div>`);

  // ---- Roadmap: the second year of the two-year view, shared with the Summary's page 3, with hours by role
  // The roadmap is not scaled to one page: when it runs long it continues onto a second page at full size.
  // The header strip is the table head of a wrapper table, so it repeats on every printed page the roadmap runs onto.
  const roadmapPage = parts.twoYear.hasContent ? `<section class="pg"><table class="paged"><thead><tr><td>${strip}</td></tr></thead><tbody><tr><td>${parts.twoYear.stackedHtml}</td></tr></tbody></table></section>` : "";

  // ---- Working together
  const effortPlan = buildCustomerEffort(document);
  const customerEffort = effortPlan.phases.length ? `<h3>${esc(customer)} Team Effort</h3>${table(["Phase", "Window", "Hrs / week", "FTE"], effortPlan.phases.map(phase => [esc(phase.phase), esc(phase.window), String(phase.total), String(phase.fte)]), { numeric: [2, 3] })}` : "";
  const commitments = parts.asks.length ? `<h3>Commitments</h3><ul class="asks">${report.customerAsks.map(item => `<li>${bold(item)}</li>`).join("")}</ul>` : "";
  const constraints = report.constraints.length ? `<h3>Sequencing Constraints</h3>${table(["Constraint", "Effect on the sequence"], report.constraints.map(item => [esc(item.constraint), esc(item.effect)]))}` : "";
  const withOwner = customerItems.some(item => item.owner.trim());
  const openItems = customerItems.length ? `<h3>Open Items</h3>${table(["Item", "What it gates", ...(withOwner ? ["Owner"] : [])], customerItems.map(item => [esc(item.item), esc(item.gates), ...(withOwner ? [esc(item.owner)] : [])]))}` : "";
  const contactRows = [
    ...(fields.primaryContact.trim() ? [[esc(fields.primaryContact.split(",")[0].trim()), esc(fields.primaryContact.split(",").slice(1).join(",").trim() || "Primary contact"), esc(customer)]] : []),
    ...report.contacts.customer.filter(item => item.name.trim() && item.name.trim() !== fields.primaryContact.split(",")[0].trim()).map(item => [esc(item.name), esc(item.role), esc(customer)]),
    ...report.contacts.cdw.filter(item => item.name.trim()).map(item => [esc(item.name), esc(item.role), "CDW"]),
    ...report.contacts.broadcom.filter(item => item.name.trim()).map(item => [esc(item.name), esc(item.role), "Broadcom"]),
  ];
  const people = contactRows.length ? `<h3>Who Is Involved</h3>${table(["Name", "Role", "Organization"], contactRows)}` : "";
  const customerRun = report.customerOwnedWork.length ? `<h3>Work Run by ${esc(customer)}</h3>${table(["Work", "Window"], report.customerOwnedWork.map(row => [esc(row.label), esc(formatWindow(row.start.length === 7 ? `${row.start}-01` : row.start, row.end.length === 7 ? `${row.end}-01` : row.end))]))}` : "";
  const left = customerEffort + commitments + customerRun;
  const right = constraints + openItems + people;
  const togetherPage = left || right ? page(`<h2>Working Together</h2><p class="lead">What ${esc(customer)}'s team commits to, what shapes the sequence, and who is involved.</p><div class="two"><div>${left}</div><div>${right}</div></div><div class="closer">Make Amazing Happen.</div>`) : "";

  void listJoin; void longDate; void UNDECIDED_DEPTH; void bsasOnly;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} - FCP</title><style>${CSS}${EXTRA_CSS}${footerCss(customer, version)}</style></head><body>${options.draft ? DRAFT_MARK : ""}${cover}${summaryPage}${scopePage}${workPage}${timelinePage}${roadmapPage}${togetherPage}<button class="printbtn" type="button" onclick="window.print()">Print / Save as PDF</button>${FIT_SCRIPT}</body></html>`;
}
