import { buildCustomerEffort, customerRemainingWaves, formatWindow, migrationWavesChoice, type ScopedEffort, type WorkPackageEffort } from "../shared/effort";
import { domainHosts, domainPackages, playbookPlanForFields, summarizeCompatibilityHandoff, type EngagementDocument } from "../shared/fcp";
import { resolveInputs } from "../shared/hoursV2";
import { deliveryBriefing } from "../shared/deliveryBriefing";
import { HCL_ESTATE_LIMITATION, summarizeHclFindings } from "../shared/hcl";
import { lateWorkProblem, reconcileHours, REPORT_FORMAT_LABELS, type ReportFormatChoice } from "../shared/reportFormat";
import { planKeyDates, platformName, minimumTargetRelease } from "../shared/reportView";
import { cdwLogoSvg } from "./brand/cdwLogo";
import { esc, hours, prepareReport, shortDate, RESERVE_LINE } from "./fcpReportParts";

/**
 * Delivery Handoff (docs/fcp-formats/FCP-REPORT-FORMATS.md section 5): the internal document that lets delivery pick up
 * the engagement without a re-discovery call. It renders from the same document and effort as the customer formats, asks
 * for no new data, and replaces the Compatibility Delivery Handoff download. Never sent to the customer: every page says
 * so. Sections with nothing to say do not print. Self-contained HTML (no external fonts, scripts or images).
 */

export const INTERNAL_MARK = "Internal, not for customer distribution";

/** What the tracker record and the issued version add to the document. Everything is optional: a draft with no record still renders. */
export type HandoffRecord = {
  opportunityNumber?: string | null;
  segment?: string | null;
  stage?: string | null;
  /** The latest issued version of the FCP, if any. */
  issued?: { issueNumber: number; issuedOn: string | null; format: ReportFormatChoice | null; broadcomApprovedOn: string | null; customerApprovedOn: string | null } | null;
  /** The consumption entries' notes behind the delivered hours. */
  deliveredNotes?: string[];
};

export type HandoffOptions = { effort: ScopedEffort; today?: string; record?: HandoffRecord };

/** Estimating inputs that move the hours most when they change; flagged when assumed. */
const HIGH_IMPACT = new Set(["hosts", "vms", "workloadDomains", "sites", "extendedVlans", "datedWaves", "protectedVms"]);

const INPUT_GROUPS: Array<[string, string[]]> = [
  ["Estate", ["hosts", "clusters", "vms", "vcenters", "sites"]],
  ["Platform", ["instances", "workloadDomains", "platformClusters", "stretchedClusters", "storageTypes", "clustersOnFcOrNfs", "mixedStorage", "dedicatedNsxWorkloadDomains", "noExistingNsx", "enhancedLinkedMode", "segments", "edgeClusters", "extraUplinkPairs", "externalVlans", "virtualNetworkAppliance", "transitGateway", "zones", "apps", "sspAlreadyDeployed", "tuningCycles"]],
  ["Upgrade and migration", ["sourceIsVcf", "source8x", "clustersOnVum", "vcentersWithIwa", "clustersOnVss", "legacyLogs", "upgradeVcfAutomation", "upgradeLogs", "upgradeVidmToIdentityBroker", "upgradeHcx", "upgradeAvi", "upgradeSrm", "upgradeSupervisors", "upgradeNsxFederation", "migrationSitePairs", "extendedVlans", "datedWaves", "broadcomBaselineDelivered"]],
  ["Operations and consumption", ["vcenterSources", "managementPacks", "dashboards", "eventTargets", "orgs", "catalogItems", "templates", "supervisors", "vksClusters", "gpuHosts", "models", "engines", "dsmTemplates", "clouds", "virtualServices", "wafPolicies", "tieredHosts"]],
  ["Recovery", ["drSitePairs", "recoveryPlans", "protectedVms", "exercises", "ireTests"]],
];

const CSS = `
:root{--ink:#1d1d1f;--slate:#3c4250;--muted:#6b7280;--line:#e3e6ea;--red:#CC0000;--int:#263042;--hair:#E4E7EC;--amber:#a15c00;--amberbg:#FFF4DC;--green:#1f6b45;--greenbg:#E6F3EC}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:var(--ink);font:10px/1.45 Helvetica,'Helvetica Neue',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{padding:0 .45in}
@page{size:letter landscape;margin:.5in 0 .55in}
.band{margin:0 -.45in;background:var(--int);color:#fff;padding:.28in .45in .22in;display:flex;justify-content:space-between;align-items:flex-end}
.band .logo{width:.95in;color:#fff;display:block;margin-bottom:10px}
.band .eyebrow{font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#ffb3b3}
.band h1{margin:3px 0 0;font-size:23px;line-height:1.1;font-weight:900}
.band .meta{text-align:right;font-size:10px;line-height:1.5}
.band .meta b{display:block;font-size:12px;font-weight:900}
.intflag{display:inline-block;background:var(--red);color:#fff;font-size:8.5px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;padding:3px 8px;border-radius:3px;margin-bottom:6px}
section.pg{break-before:page}
section.pg:first-of-type{break-before:auto}
h2{font-size:16px;font-weight:900;margin:14px 0 3px}
.lead{color:var(--muted);font-size:9.5px;margin:0 0 8px}
h3{font-size:8.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--int);margin:12px 0 5px;border-left:3px solid var(--red);padding-left:6px;break-after:avoid}
p{margin:0 0 6px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:.3in}
table{width:100%;border-collapse:collapse;font-size:9px;margin-bottom:4px}
thead{display:table-header-group}
tr{break-inside:avoid}
th{background:#eef0f3;color:var(--slate);font-size:7.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;text-align:left;padding:4px 6px;vertical-align:bottom}
td{padding:3.5px 6px;border-bottom:1px solid var(--hair);color:var(--slate);vertical-align:top}
td:first-child{color:var(--ink);font-weight:700}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tr.cat td{background:#f4f5f7;font-size:7.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink);padding:3px 6px}
tr.total td{border-top:2px solid #1a1d21;border-bottom:0;font-weight:900;color:var(--ink)}
tr.sub td{font-weight:800;color:var(--ink);border-top:1px solid var(--line)}
td small{display:block;font-weight:400;color:var(--muted);font-size:8.5px;line-height:1.35;margin-top:1px}
.kv td:first-child{width:1.5in}
.chip{display:inline-block;font-size:7.5px;font-weight:800;border-radius:99px;padding:1px 6px;white-space:nowrap;margin-left:3px}
.chip.a{background:var(--amberbg);color:var(--amber)}
.chip.c{background:var(--greenbg);color:var(--green)}
.chip.r{background:#FDE7E7;color:var(--red)}
.start{counter-reset:s;margin:0;padding:0;list-style:none}
.start li{counter-increment:s;position:relative;padding:7px 0 7px 30px;border-bottom:1px solid var(--hair);color:var(--slate)}
.start li::before{content:counter(s);position:absolute;left:0;top:7px;width:20px;height:20px;border-radius:99px;background:var(--int);color:#fff;font-weight:900;font-size:10px;display:flex;align-items:center;justify-content:center}
.start li b{color:var(--ink)}
.facts{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid var(--line);margin:4px 0 8px}
.facts div{padding:7px 10px;border-right:1px solid var(--line)}
.facts div:last-child{border-right:0}
.facts .v{font-size:16px;font-weight:900;color:var(--int)}
.facts .l{font-size:9px;font-weight:800}
.facts .s{font-size:8px;color:var(--muted)}
.note{background:var(--amberbg);border-left:4px solid #d97706;padding:6px 10px;margin:6px 0;font-size:9.5px;color:#4b3410}
.note.r{background:#FDECEC;border-left-color:var(--red);color:#5a1414}
.printbtn{position:fixed;right:18px;bottom:18px;background:var(--red);color:#fff;border:0;border-radius:999px;padding:10px 18px;font-weight:800;cursor:pointer}
@media print{.printbtn{display:none}}
@media screen{body{max-width:11in;margin:0 auto}}
`;

const cssString = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;

/** The marking and the page number on every printed page, in @page margin boxes so the number is the printed page. */
function footerCss(customer: string, versionLabel: string): string {
  const box = "font:8px Helvetica,'Helvetica Neue',Arial,sans-serif;color:#898b8e;vertical-align:top;padding-top:7px";
  const left = `${INTERNAL_MARK} · Delivery Handoff · ${customer}`;
  const top = "font:800 8.5px Helvetica,'Helvetica Neue',Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#CC0000;vertical-align:bottom;padding-bottom:6px";
  return `@page{@top-left{content:${cssString(INTERNAL_MARK)};${top};padding-left:.45in}@top-right{content:${cssString(versionLabel)};${top};color:#898b8e;padding-right:.45in}@bottom-left{content:${cssString(left)};${box};padding-left:.45in}@bottom-right{content:"Page " counter(page) " of " counter(pages);text-align:right;${box};padding-right:.45in}}`;
}

type Cell = string;
function table(headers: string[], rows: Cell[][], options: { numeric?: number[]; className?: string } = {}): string {
  const numeric = new Set(options.numeric ?? []);
  const cell = (value: Cell, index: number, tag: "td" | "th") => `<${tag}${numeric.has(index) ? ' class="num"' : ""}>${value}</${tag}>`;
  // A row with one cell is a category band; a first cell prefixed "\u0001total:" or "\u0001sub:" styles the row.
  const body = rows.map(row => {
    if (row.length === 1) return `<tr class="cat"><td colspan="${headers.length}">${row[0]}</td></tr>`;
    const marked = /^\u0001(total|sub):/.exec(row[0]);
    const cells = marked ? [row[0].slice(marked[0].length), ...row.slice(1)] : row;
    return `<tr${marked ? ` class="${marked[1]}"` : ""}>${cells.map((value, index) => cell(value, index, "td")).join("")}</tr>`;
  }).join("");
  return `<table class="${options.className ?? ""}"><thead><tr>${headers.map((header, index) => cell(esc(header), index, "th")).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const nextMonth = (key: string) => { const year = Number(key.slice(0, 4)); const month = Number(key.slice(5, 7)); return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`; };
const monthsBetween = (start: string, end: string) => { const out: string[] = []; for (let key = monthKey(start); key <= monthKey(end) && out.length < 48; key = nextMonth(key)) out.push(key); return out; };

/** The months a role's hours peak in: months within a quarter of the busiest one, grouped into runs ("Jan 2027; Mar to Apr 2027"). */
function busiestWindow(rows: WorkPackageEffort[], role: "architect" | "srConsultant" | "projectManager"): string {
  const perMonth = new Map<string, number>();
  for (const row of rows) {
    if (!row.start || !row.end || row[role] <= 0) continue;
    const months = monthsBetween(row.start, row.end);
    for (const month of months) perMonth.set(month, (perMonth.get(month) ?? 0) + row[role] / months.length);
  }
  const peak = Math.max(0, ...Array.from(perMonth.values()));
  if (!peak) return "";
  const hot = Array.from(perMonth.entries()).filter(([, value]) => value >= peak * 0.75).map(([month]) => month).sort();
  // A role busy in nearly every month of the plan is busy throughout.
  if (perMonth.size >= 4 && hot.length >= perMonth.size - 1) return "Throughout";
  const runs: string[][] = [];
  for (const month of hot) {
    const run = runs.at(-1);
    if (run && nextMonth(run.at(-1)!) === month) run.push(month); else runs.push([month]);
  }
  return runs.map(run => run.length === 1 ? monthLabel(run[0]) : `${run[0].slice(0, 4) === run.at(-1)!.slice(0, 4) ? MONTHS[Number(run[0].slice(5, 7)) - 1] : monthLabel(run[0])} to ${monthLabel(run.at(-1)!)}`).join("; ");
}

const ROLE_LABELS = { architect: "Architect", srConsultant: "Sr. Consultant", projectManager: "Project Manager" } as const;
const REASON_TEXT: Record<string, string> = {
  "after the entitlement window": "Scheduled after the entitlement ends",
  "over budget": "Keeps the protected work inside the entitlement",
  "not funded": "Not funded in this entitlement",
  "planned for later": "Planned for later",
  merged: "Merged into another package",
};
const yesNo = (value: boolean) => (value ? "Yes" : "No");
const valueText = (value: unknown) => typeof value === "boolean" ? yesNo(value) : typeof value === "number" ? value.toLocaleString("en-US") : String(value);
const titleCase = (value: string) => value.replace(/[-_]/g, " ").replace(/^./, letter => letter.toUpperCase());

export function renderDeliveryHandoffHtml(title: string, input: EngagementDocument, options: HandoffOptions): string {
  const prepared = prepareReport(input, { effort: options.effort, ...(options.today ? { today: options.today } : {}) });
  const { document, today, deferredWork, termEnd, assumedEnd, termStart, bsas, bsasOnly } = prepared;
  const { fields, report, inventory } = document;
  const customer = fields.customerName.trim() || title;
  const effort = options.effort;
  const record = options.record ?? {};
  const fit = effort.internal.fit;
  const plan = playbookPlanForFields(fields);
  const platform = platformName(document);
  const reconciliation = reconcileHours(input, effort, today);
  const issued = record.issued ?? null;
  const unit = bsasOnly ? "BSAS hours" : "entitlement";

  // ---- Compatibility, estimating basis and the pieces the Start here box reads
  const handoff = summarizeCompatibilityHandoff(document.readiness.hardwarePlatforms, inventory.hosts);
  const noHostEvidence = handoff.assessedHosts === 0;
  const { values, assumptions } = effort.internal.pass1 ? { values: effort.internal.pass1.inputs as Record<string, unknown>, assumptions: effort.internal.pass1.assumptions } : { values: {} as Record<string, unknown>, assumptions: [] };
  const labels = new Map(resolveInputs({ ...document, fields: { ...fields, estimateInputs: {} } }).assumptions.map(item => [item.key, item.label]));
  const CORE_LABELS: Record<string, string> = { hosts: "ESX hosts", clusters: "Clusters", vms: "VMs", vcenters: "vCenters", sites: "Sites", instances: "VCF instances", workloadDomains: "Workload domains" };
  for (const [key, label] of Object.entries(CORE_LABELS)) labels.set(key, label);

  type BasisRow = { key: string; label: string; value: string; source: string; assumed: boolean };
  const basisRows: BasisRow[] = [];
  const seen = new Set<string>();
  const entered = fields.estimateInputs as Record<string, unknown>;
  const cleanSource = (source: string) => /\bspec\b|worked example|section \d/i.test(source) ? "Planning default; confirm in design" : source;
  for (const key of ["hosts", "clusters", "vms", "vcenters", "sites", "instances", "workloadDomains"]) {
    if (!(key in values)) continue;
    const assumption = assumptions.find(item => item.key === key);
    const fromPlanner = entered[key] !== undefined;
    const assumed = Boolean(assumption && !assumption.derived) && !fromPlanner;
    basisRows.push({ key, label: labels.get(key) ?? titleCase(key), value: valueText(values[key]), source: assumed ? cleanSource(assumption!.source) : fromPlanner ? "Entered in the Plan section" : assumption?.source ?? (key === "hosts" && !inventory.hosts ? "Brief (no RVTools host rows)" : "RVTools or the brief"), assumed });
    seen.add(key);
  }
  for (const item of assumptions) {
    if (seen.has(item.key) || item.key === "smallEstate") continue;
    seen.add(item.key);
    const fromPlanner = entered[item.key] !== undefined;
    basisRows.push({ key: item.key, label: item.label, value: valueText(item.display ?? item.value), source: fromPlanner ? "Entered in the Plan section" : item.derived ? item.source : cleanSource(item.source), assumed: !item.derived && !fromPlanner });
  }
  // Inputs the planner entered that the estimate did not need to default are confirmed.
  for (const [key, given] of Object.entries(entered)) {
    if (seen.has(key) || key === "migrationWaves" || given === undefined || Array.isArray(given) || !(key in values)) continue;
    seen.add(key);
    basisRows.push({ key, label: labels.get(key) ?? titleCase(key), value: valueText(values[key]), source: "Entered in the Plan section", assumed: false });
  }
  for (const { domain } of domainPackages(fields)) {
    const known = domainHosts(domain, inventory);
    basisRows.push({ key: `domain:${domain.name}`, label: `Hosts in ${domain.name}`, value: known.hosts === null ? "Set in design" : valueText(known.hosts), source: known.source, assumed: known.hosts === null });
  }
  const assumedCount = basisRows.filter(row => row.assumed).length;
  const highImpactAssumed = basisRows.filter(row => row.assumed && HIGH_IMPACT.has(row.key));

  const customerEffort = buildCustomerEffort(document);
  const customerRuns = customerRemainingWaves(document);
  const planned = Math.round(effort.totals.total);
  const reserve = Math.round(fit?.reserveHours ?? 0);
  const deliveredHours = reconciliation?.delivered ?? 0;
  const entitled = reconciliation?.entitled ?? 0;
  const moves = (fit?.scopeMoves ?? []);
  const followOnRows = deferredWork.filter(row => (row.followOn?.total ?? 0) > 0);
  const followOnHours = Math.round(followOnRows.reduce((sum, row) => sum + (row.followOn?.total ?? 0), 0));
  const late = lateWorkProblem(input, effort);

  // ---- Start here: the few things delivery must know first, most pressing first, at most five
  const start: Array<{ rank: number; lead: string; text: string }> = [];
  if (reconciliation && !reconciliation.balanced) {
    start.push({ rank: 0, lead: reconciliation.difference > 0 ? "The plan is over the hours." : "Funded hours are not planned.", text: reconciliation.difference > 0 ? `${hours(reconciliation.delivered)} delivered, ${hours(reconciliation.planned)} planned and ${hours(reconciliation.reserve)} held come to ${hours(reconciliation.difference)} hours more than the ${hours(entitled)}-hour ${unit}.` : `${hours(-reconciliation.difference)} hours of the ${hours(entitled)}-hour ${unit} are not planned and will be forfeited at term end.` });
  } else if (reconciliation && reserve < 1) {
    start.push({ rank: 1, lead: "The plan uses every remaining hour.", text: `${hours(deliveredHours)} hours are delivered and the plan schedules the other ${hours(planned)}. There is no reserve, so a change request needs a scope trade or more entitlement.` });
  } else if (reconciliation) {
    start.push({ rank: 6, lead: `${hours(reserve)} hours are held for change requests.`, text: `${hours(deliveredHours)} delivered, ${hours(planned)} planned and ${hours(reserve)} held add up to the ${hours(entitled)}-hour ${unit}. The reserve is reviewed at month 6 and released to follow-on work if unused.` });
  }
  const choice = migrationWavesChoice(document);
  if (choice !== "cdw") {
    const peak = customerEffort.peak;
    start.push({ rank: 2, lead: choice === "customer-all" ? `${customer} runs every migration wave.` : "CDW runs only the proving waves.", text: `${customerRuns ? `${customer} runs ${choice === "customer-all" ? "the waves" : "the remaining waves with the runbook"} (${formatWindow(customerRuns.start.length === 7 ? `${customerRuns.start}-01` : customerRuns.start, customerRuns.end.length === 7 ? `${customerRuns.end}-01` : customerRuns.end)})` : `${customer} runs the waves`}${peak ? `, at a peak of ${peak.total} hours a week (${peak.fte} FTE)` : ""}. Confirm they can staff it.` });
  }
  if (noHostEvidence) {
    start.push({ rank: 3, lead: "Compatibility is not established.", text: `${inventory.hosts ? `${hours(inventory.hosts)} hosts are on record but no host models were` : "No RVTools host rows were"} imported, so every host model is unverified. Get a current RVTools export before design sign-off.` });
  } else if (handoff.blockedHosts || handoff.unresolvedHosts) {
    start.push({ rank: 3, lead: `${hours(handoff.blockedHosts + handoff.unresolvedHosts)} of ${hours(handoff.estateHosts)} hosts need compatibility action.`, text: `${handoff.blockedHosts ? `${hours(handoff.blockedHosts)} are blocked or not listed for ${handoff.targetRelease}. ` : ""}${handoff.unresolvedHosts ? `${hours(handoff.unresolvedHosts)} need evidence. ` : ""}See the Compatibility section for the owned actions.` });
  }
  if (assumedCount) {
    start.push({ rank: 4, lead: `${assumedCount} of ${basisRows.length} estimating inputs are assumed.`, text: highImpactAssumed.length ? `Confirm the high-impact ones in the first design session: ${highImpactAssumed.map(row => `${row.label} (${row.value})`).join(", ")}.` : "None is high impact, but confirm them in design." });
  }
  if (followOnHours >= 1) {
    start.push({ rank: 5, lead: `${hours(followOnHours)} hours of work moved to year two.`, text: `${followOnRows.slice(0, 3).map(row => row.label).join(", ")}${followOnRows.length > 3 ? ` and ${followOnRows.length - 3} more` : ""} is not funded in this ${unit}. Keep it out of the entitlement.` });
  }
  if (late) start.push({ rank: 1, lead: "Funded work is scheduled after the term.", text: late });
  const startHere = start.sort((left, right) => left.rank - right.rank).slice(0, 5);

  // ---- People: CDW, Broadcom and customer contacts
  const primary = fields.primaryContact.trim();
  const primaryName = primary.split(",")[0].trim();
  const people: Array<{ name: string; role: string; org: string; email: string; phone: string }> = [
    ...report.contacts.cdw.filter(item => item.name.trim()).map(item => ({ ...item, org: "CDW" })),
    ...report.contacts.broadcom.filter(item => item.name.trim()).map(item => ({ ...item, org: "Broadcom" })),
    ...(primaryName ? [{ name: primaryName, role: primary.split(",").slice(1).join(",").trim() || "Primary contact", org: customer, email: "", phone: "" }] : []),
    ...report.contacts.customer.filter(item => item.name.trim() && item.name.trim() !== primaryName).map(item => ({ ...item, org: customer })),
  ];

  // ---- Engagement facts
  const versionLabel = issued ? `FCP Version ${issued.issueNumber}${issued.format ? `, ${REPORT_FORMAT_LABELS[issued.format]}` : ""}` : "Working draft";
  const approval = (date: string | null | undefined) => (date ? `Approved ${shortDate(date)}` : "Pending");
  const factRows: Cell[][] = [
    ["Customer", esc(customer)],
    ...(record.opportunityNumber ? [["Opportunity", esc(record.opportunityNumber)]] : []),
    ...(record.segment ? [["Segment", esc(titleCase(record.segment))]] : []),
    ...(record.stage ? [["Stage", esc(titleCase(record.stage))]] : []),
    ["Platform and path", esc(`${platform}, ${plan.label.replace(/^./, letter => letter.toLowerCase())}`)],
    ...(report.deliveryModel ? [["Delivery model", esc(report.deliveryModel)]] : []),
    ...(issued ? [["Customer received", esc(`FCP Version ${issued.issueNumber}${issued.format ? `, ${REPORT_FORMAT_LABELS[issued.format]}` : ""}${issued.issuedOn ? `, ${shortDate(issued.issuedOn)}` : ""}`)], ["Approvals", `Broadcom ${esc(approval(issued.broadcomApprovedOn))} · Customer ${esc(approval(issued.customerApprovedOn))}`]] : [["Customer received", "Not yet issued"]]),
    ...(termStart && termEnd ? [[bsasOnly ? "BSAS term" : "Entitlement term", esc(`${shortDate(termStart)} to ${shortDate(termEnd)}${assumedEnd ? " (end date assumed)" : ""}`)]] : []),
  ];
  const page1 = `<section class="pg"><div class="two"><div><h3>Engagement</h3>${table(["", ""], factRows, { className: "kv" }).replace(/<thead>.*?<\/thead>/, "")}</div><div>${people.length ? `<h3>People</h3>${table(["Name", "Role", "Organization"], people.map(item => [esc(item.name), esc(item.role), esc(item.org)]))}` : ""}</div></div>${startHere.length ? `<h3>Start here: what delivery needs to know first</h3><ol class="start">${startHere.map(item => `<li><b>${esc(item.lead)}</b> ${esc(item.text)}</li>`).join("")}</ol>` : ""}</section>`;

  // ---- Hours and funding
  const shownRows = effort.workPackages.filter(row => !row.deferred && row.total > 0);
  const roleRows = (["architect", "srConsultant", "projectManager"] as const).filter(role => shownRows.some(row => row[role] > 0)).map(role => {
    const main = [...shownRows].filter(row => row[role] > 0).sort((a, b) => b[role] - a[role]).slice(0, 3).map(row => `${row.label.replace(/ — depth to be confirmed$/, "")} (${hours(row[role])})`).join(", ");
    return [esc(ROLE_LABELS[role]), hours(effort.totals[role]), esc(busiestWindow(shownRows, role)), esc(main)];
  });
  const moveRows: Cell[][] = (moves.length ? moves.map(item => {
    const label = item.label.replace(/ — depth to be confirmed$/, "");
    return item.reason === "merged"
      ? [esc(label), hours(item.hours), "Removed", "Merged into another package, saving these hours"]
      : [esc(label), hours(item.hours), "Year two", esc(REASON_TEXT[item.reason])];
  }) : followOnRows.map(row => [esc(row.label.replace(/ — depth to be confirmed$/, "")), hours(row.followOn!.total), "Year two", esc(REASON_TEXT[row.deferred ?? "planned for later"])]));
  if (choice !== "cdw" && fit && fit.customerRun.hours >= 1) moveRows.push([esc(choice === "customer-all" ? "Migration waves" : "Remaining migration waves"), hours(fit.customerRun.hours), esc(customer), esc(choice === "customer-all" ? "The customer asked to run every wave" : "CDW keeps the proving waves; the customer runs the rest with the runbook")]);
  // Delivery risks read from the plan: each prints only when the plan has it.
  const risks: Array<[string, string]> = [];
  if (reconciliation && reserve < 1) risks.push(["No reserve", "Any added work, estimate overrun or re-design needs a scope trade or a change to the entitlement."]);
  if (reconciliation && !reconciliation.balanced && reconciliation.difference < 0) risks.push(["Hours not planned", `${hours(-reconciliation.difference)} funded hours have no work against them and are forfeited at term end.`]);
  if (late) risks.push(["Work scheduled after the term", late]);
  if (choice !== "cdw" && customerEffort.peak) risks.push(["Customer-run waves", `If ${customer} cannot staff ${customerEffort.peak.fte} FTE in ${customerEffort.peak.window}, waves slip past the end of the term.`]);
  const keyDates = planKeyDates(document);
  if (keyDates.buildStart && noHostEvidence) risks.push(["Build start depends on hardware", `The ${shortDate(keyDates.buildStart)} build needs hardware sign-off, which needs a current RVTools export.`]);
  if (assumedEnd) risks.push(["Entitlement end date is assumed", "The end date is 12 months from the start. Confirm it with the entitlement record before relying on the window."]);
  if (fit && fit.monthsRemaining > 0 && fit.requiredMonthlyBurn > 0) risks.push(["Pace", `${(fit.requiredMonthlyBurn * 12 / 52).toFixed(1)} hours a week are needed to deliver the planned hours in the ${fit.monthsRemaining} months left.`]);
  if (bsas && !bsasOnly) risks.push(["BSAS hours expire", `${hours(bsas.hours)} BSAS hours run ${shortDate(bsas.termStart)} to ${shortDate(bsas.termEnd)} and are not refunded if unused.`]);
  const factTile = (value: string, label: string, sub: string) => `<div><div class="v">${value}</div><div class="l">${esc(label)}</div><div class="s">${esc(sub)}</div></div>`;
  const tiles = reconciliation ? [
    factTile(hours(entitled), bsasOnly ? "BSAS hours" : "Entitled hours", termEnd ? `Ends ${shortDate(termEnd)}${assumedEnd ? " (assumed)" : ""}` : ""),
    factTile(hours(deliveredHours), "Delivered", record.deliveredNotes?.length ? record.deliveredNotes.join("; ") : reconciliation.deliveredAsOf ? `As of ${shortDate(reconciliation.deliveredAsOf)}` : ""),
    factTile(hours(planned), "Planned", "Scheduled in this plan"),
    factTile(hours(reserve), "Held", reserve >= 1 ? RESERVE_LINE : "No room for change requests"),
    factTile(hours(followOnHours), "Year two", followOnHours >= 1 ? "Needs new funding" : "Nothing moved"),
  ] : [
    factTile(hours(planned), "Planned", "No entitled hours on record"),
    factTile(hours(followOnHours), "Year two", followOnHours >= 1 ? "Needs new funding" : "Nothing moved"),
  ];
  const fundingBody = [
    `<div class="facts" style="grid-template-columns:repeat(${tiles.length},1fr)">${tiles.join("")}</div>`,
    roleRows.length ? `<h3>Remaining hours by role</h3>${table(["Role", "Remaining", "Busiest window", "Main packages (hours)"], [...roleRows, [`\u0001total:Total planned`, hours(planned), "", ""]], { numeric: [1] })}` : "",
    moveRows.length ? `<h3>What moved, and why</h3>${table(["Package", "Hours", "Moved to", "Why"], moveRows, { numeric: [1] })}` : "",
    risks.length ? `<h3>Delivery risks from the plan</h3>${table(["Risk", "Watch for"], risks.map(([risk, watch]) => [esc(risk), esc(watch)]))}` : "",
  ].filter(Boolean).join("");
  const fundingPage = fundingBody ? `<section class="pg"><h2>Hours and Funding</h2><p class="lead">How the plan fits the ${unit}. Internal: the customer documents print only the value, the hours and the follow-on.</p>${fundingBody}</section>` : "";

  // ---- Estimating basis
  const chips = (row: BasisRow) => row.assumed ? `<span class="chip a">Assumed</span>${HIGH_IMPACT.has(row.key) ? '<span class="chip r">High impact</span>' : ""}` : '<span class="chip c">Confirmed</span>';
  const grouped = [...INPUT_GROUPS.map(([name, keys]) => [name, basisRows.filter(row => keys.includes(row.key))] as const), ["Other", basisRows.filter(row => !INPUT_GROUPS.some(([, keys]) => keys.includes(row.key)))] as const].filter(([, rows]) => rows.length);
  const basisPage = basisRows.length ? `<section class="pg"><h2>Estimating Basis</h2><p class="lead">Every input the hours were built from, and where it came from. Confirmed came from RVTools, the brief or the planner. Assumed is a planning default to confirm in design. High impact moves the hours most if it changes.</p>${table(["Driver", "Value", "Basis"], grouped.flatMap(([name, rows]) => [[esc(name)], ...rows.map(row => [esc(row.label), esc(row.value), `${chips(row)} ${esc(row.source)}`])]), { numeric: [1] })}</section>` : "";

  // ---- Estate and compatibility
  const briefing = deliveryBriefing(document);
  const estate = briefing.length ? `<h3>What we know about the estate</h3>${table(["Topic", "Answer", "Why it matters"], briefing.map(item => [esc(item.topic), esc(item.detail), esc(item.why)]))}` : "";
  const findings = summarizeHclFindings(document.readiness.hcl.findings);
  const blocking = findings.filter(item => item.severity === "BLOCKER" || item.severity === "WARNING");
  const advisories = findings.length - blocking.length;
  const gaps = document.readiness.hcl.coverageGaps;
  const minimum = minimumTargetRelease(document);
  const posture = noHostEvidence
    ? `<div class="note r"><b>Not established.</b> ${inventory.hosts ? `${hours(inventory.hosts)} hosts are on record from the brief, but no host models were imported` : "No RVTools host rows are imported"}, so no host model, CPU, adapter or build has been checked. Treat every host as unverified until a current export is imported.</div>`
    : `${table(["Decision", "Hosts"], [["Target release listed", hours(handoff.supportedHosts)], ["Evidence still required", hours(handoff.unresolvedHosts)], ["Blocked or not listed", hours(handoff.blockedHosts)]], { numeric: [1] })}<p>${handoff.allHostsAccountedFor ? `All ${hours(handoff.estateHosts)} imported hosts are matched to a server model.` : `${hours(handoff.unaccountedHosts)} of ${hours(handoff.estateHosts)} imported hosts are not matched to a server model yet and block completion.`}</p>`;
  const compatibility = [
    `<h3>${esc(handoff.targetRelease)} compatibility</h3>${posture}`,
    minimum ? `<div class="note">${hours(minimum.hosts)} host${minimum.hosts === 1 ? " runs" : "s run"} ${esc(minimum.sources.slice(0, 2).join(", "))}${minimum.sources.length > 2 ? " and later builds" : ""}. An upgrade or converge must target ${esc(minimum.minimum)} or later; an import works on either.</div>` : "",
    handoff.cohorts.length ? `<h3>Server models</h3>${table(["Decision", "Server model", "Hosts", "Release posture"], handoff.cohorts.map(cohort => [esc(cohort.decisionLabel), `${esc(`${cohort.vendor} ${cohort.model}`)}<small>${esc(cohort.cpuModel)}</small>`, hours(cohort.hosts), esc(cohort.futureReleaseSupport.status === "unsupported-from-release" ? `Through ${cohort.futureReleaseSupport.verifiedThroughRelease}; unsupported from ${cohort.futureReleaseSupport.unsupportedFromRelease}` : cohort.releaseEvidence.map(release => `${release.release}: ${release.status.replace(/-/g, " ")}`).join("; "))]), { numeric: [2] })}` : "",
    handoff.actions.length ? `<h3>Owned actions</h3>${table(["Priority", "Hosts", "Owner", "Action", "Evidence required", "Done when"], handoff.actions.map(action => [esc(titleCase(action.priority)), hours(action.affectedHosts), esc(action.owner), esc(action.title), esc(action.evidenceRequired.join("; ")), esc(action.gateCondition)]), { numeric: [1] })}` : "",
    blocking.length ? `<h3>Blockers and warnings</h3>${table(["Finding", "Affected", "Observed", "Required action"], blocking.map(item => [`${esc(item.title)}${item.severity === "BLOCKER" ? '<span class="chip r">Blocker</span>' : ""}`, esc(`${hours(item.affectedCount)} ${item.scope}${item.affectedCount === 1 ? "" : "s"}`), esc(item.findings.slice(0, 2).map(entry => `${entry.subject}: ${entry.evidence}`).join(" · ")), esc(item.remediation)]))}${advisories ? `<p class="lead">${advisories} advisory finding${advisories === 1 ? " is" : "s are"} not listed; they do not block the build.</p>` : ""}` : "",
    gaps.length ? `<h3>Evidence gaps</h3>${table(["Gap", "Evidence area", "Delivery impact"], gaps.map(gap => [esc(gap.kind.replace(/-/g, " ")), esc(gap.subject), esc(gap.impact)]))}` : "",
    noHostEvidence && !gaps.length ? "" : `<div class="note"><b>Handoff boundary:</b> ${esc(HCL_ESTATE_LIMITATION)} Delivery must still confirm NICs, HBAs and controllers, firmware, drivers, the OEM image or add-on, boot devices, storage, cluster topology and the customer-approved change path.</div>`,
  ].filter(Boolean).join("");
  const estatePage = `<section class="pg"><h2>Estate and Compatibility</h2><p class="lead">What discovery established about the current environment, and where the ${esc(handoff.targetRelease)} compatibility posture stands.</p>${estate}${compatibility}</section>`;

  // ---- Design and technical detail
  const gates = report.designElements.length ? `<h3>Design elements and gates</h3>${table(["Component", "Requirement", "Recommendation", "Gate"], report.designElements.map(item => [esc(item.component), esc(item.requirement), esc(item.recommendation), esc(item.gate ?? "")]))}` : "";
  const technical = report.technicalItems.length ? `<h3>Technical items to confirm early</h3>${table(["Item", "Reference"], report.technicalItems.map(item => [esc(item.item), esc(item.reference)]))}` : "";
  const constraints = report.constraints.length ? `<h3>Sequencing constraints</h3>${table(["Constraint", "Imposed by", "Effect"], report.constraints.map(item => [esc(item.constraint), esc(item.imposedBy), esc(item.effect)]))}` : "";
  const designPage = gates || technical || constraints ? `<section class="pg"><h2>Design and Technical Detail</h2><p class="lead">The decisions already made, the gates that hold the build, and the technical items to confirm early.</p>${gates}${technical}${constraints}</section>` : "";

  // ---- Work package detail: what was committed, with acceptance and what each package starts after
  const bars = new Map(document.adoptionTimeline.lanes.flatMap(lane => lane.bars).map(bar => [bar.id, bar]));
  const playbook = new Map<string, (typeof plan.designPackages)[number]>([...plan.designPackages.map(item => [`bar-playbook-design-${item.id}`, item] as [string, typeof item]), ...plan.implementationPackages.map(item => [`bar-playbook-execution-${item.id}`, item] as [string, typeof item])]);
  const startsAfter = (id: string) => {
    const bar = bars.get(id);
    const ids = [...(bar?.prerequisites ?? []), ...(bar?.dependsOn ? [bar.dependsOn] : [])];
    return Array.from(new Set(ids.map(other => bars.get(other)?.label).filter((label): label is string => Boolean(label)))).join("; ");
  };
  const byCategory = new Map<string, WorkPackageEffort[]>();
  for (const row of shownRows) byCategory.set(row.category ?? "Other", [...(byCategory.get(row.category ?? "Other") ?? []), row]);
  const packageRows: Cell[][] = Array.from(byCategory.entries()).flatMap(([category, rows]) => [[esc(category)], ...rows.map(row => {
    const book = playbook.get(row.id);
    const text = [book?.outcome ?? bars.get(row.id)?.outcome ?? row.detail?.outcome ?? "", book?.acceptance ? `Accepted when: ${book.acceptance}` : row.detail?.acceptance ? `Accepted when: ${row.detail.acceptance}` : ""].filter(Boolean).join(" ");
    return [`${esc(row.label)}${text ? `<small>${esc(text)}</small>` : ""}`, esc(row.start && row.end ? formatWindow(row.start, row.end) : ""), esc(row.leadRole), esc(startsAfter(row.id)), hours(row.total)];
  })]);
  const packagesPage = packageRows.length ? `<section class="pg"><h2>Work Package Detail</h2><p class="lead">Scope, acceptance and dependencies for each package in the plan.</p>${table(["Work package", "Window", "Lead role", "Starts after", "Hours"], [...packageRows, [`\u0001total:Total planned`, "", "", "", hours(planned)]], { numeric: [4] })}</section>` : "";

  // ---- Customer commitments, customer-run work, open items and questions
  const effortTable = customerEffort.phases.length ? `<h3>${esc(customer)} team effort</h3>${table(["Phase", "Window", "Platform", "Ops", "Network", "Total / wk", "FTE"], customerEffort.phases.map(phase => [esc(phase.phase), esc(phase.window), String(phase.platformLead), String(phase.operations), String(phase.network), String(phase.total), phase.fte.toFixed(2)]), { numeric: [2, 3, 4, 5, 6] })}` : "";
  const customerRun = report.customerOwnedWork.length ? `<h3>Work run by ${esc(customer)}</h3>${table(["Work", "Window"], report.customerOwnedWork.map(row => [esc(row.label), esc(formatWindow(row.start.length === 7 ? `${row.start}-01` : row.start, row.end.length === 7 ? `${row.end}-01` : row.end))]))}` : "";
  const asks = report.customerAsks.length ? `<h3>Commitments in the FCP</h3><ul>${report.customerAsks.map(item => `<li>${esc(item)}</li>`).join("")}</ul>` : "";
  const openItems = report.openItems.length ? `<h3>Open items</h3>${table(["Item", "What it gates", "Owner"], report.openItems.map(item => [esc(item.item), esc(item.gates), esc(item.owner)]))}` : "";
  const questions = report.openQuestions.length ? `<h3>Open questions</h3>${table(["Question", "Why we are asking now"], report.openQuestions.map(item => [esc(item.question), esc(item.whyNow)]))}` : "";
  const contactRows = people.filter(item => item.email || item.phone);
  const contacts = contactRows.length ? `<h3>Contacts</h3>${table(["Name", "Role", "Organization", "Email", "Phone"], contactRows.map(item => [esc(item.name), esc(item.role), esc(item.org), esc(item.email), esc(item.phone)]))}` : "";
  const personnel = report.personnel.filter(row => row.cdw.length || row.broadcom.length || row.customer.length);
  const personnelTable = personnel.length ? `<h3>Target personnel by work stream</h3>${table(["Work stream", "CDW", "Broadcom", customer], personnel.map(row => [esc(row.workstream), esc(row.cdw.join(" · ")), esc(row.broadcom.join(" · ")), esc(row.customer.join(" · "))]))}` : "";
  const togetherBody = effortTable + customerRun + asks + openItems + questions + personnelTable + contacts;
  const togetherPage = togetherBody ? `<section class="pg"><h2>Customer Commitments and Open Items</h2><p class="lead">What ${esc(customer)} owes the plan, what is still undecided, and who to call.</p>${togetherBody}</section>` : "";

  const band = `<div class="band"><div>${cdwLogoSvg("logo")}<span class="intflag">${INTERNAL_MARK}</span><div class="eyebrow">Delivery Handoff</div><h1>${esc(customer)}: ${esc(platform)} ${esc(plan.label)}</h1></div><div class="meta"><b>${esc(versionLabel)}</b>Prepared by CDW Consulting Solution Architecture<br>As of ${esc(shortDate(today))}</div></div>`;
  // Plan labels from the generator carry spaced em-dashes ("VCF Operations Design \u2014 Tier 1"); the handoff prints a colon.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} - Delivery Handoff (Internal)</title><style>${CSS}${footerCss(customer, versionLabel)}</style></head><body>${band}${page1}${fundingPage}${basisPage}${estatePage}${designPage}${packagesPage}${togetherPage}<button class="printbtn" type="button" onclick="window.print()">Print / Save as PDF</button></body></html>`.replaceAll(" \u2014 ", ": ");
}
