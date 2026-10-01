import { barWindow } from "../shared/buildingBlocks";
import { buildBurndown, buildCustomerEffort, formatWindow, type Burndown, type ScopedEffort } from "../shared/effort";
import { calculateEntitlementEndDate, effectivePlatformEdition, FIXED_GANTT_CATEGORIES, planOutcomeLabel, playbookPlanForFields, resolvePlanOutcomes, type EngagementDocument, type TimelineBar, type TimelineCategory, type WorkstreamType } from "../shared/fcp";
import { completedReport } from "../shared/report";
import { cdwLogoSvg } from "./brand/cdwLogo";

/**
 * Condensed FCP (FCP 2.0, "Make Amazing Happen"). Customer-facing: carries exactly one dollar figure
 * (the entitlement value), hours only, and never the internal fit check, rates, gap, or risk band.
 * Self-contained HTML (no external fonts, scripts, or images); the PDF is printed from it.
 */

const esc = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const placeholder = (text: string) => `<span class="ph">${esc(text)}</span>`;
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
function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}
const monthIndex = (origin: Date, date: Date) => (date.getUTCFullYear() - origin.getUTCFullYear()) * 12 + date.getUTCMonth() - origin.getUTCMonth();
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
const SWATCH_LABEL: Record<Swatch, string> = {
  governance: "Governance", operating: "Operating Model / Platform", infrastructure: "Infrastructure Build",
  migration: "Migration Waves", consume: "Consume / Handover", security: "Security & Resiliency", muted: "Customer-owned work, gate, or deadline",
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
  const site = span(all.filter(({ bar }) => SITE_ID.test(bar.id)));
  if (site) items.push({ category: "Modernize Infrastructure", label: "Site prerequisites and hardware evidence", ...site, swatch: "muted", milestone: false, outcome: "Hardware, network and core services confirmed for the build.", dependsOn: [], customerOwned: true });

  for (const { lane, bar, window } of all) {
    if (!window || DESIGN_ID.test(bar.id) || SITE_ID.test(bar.id) || bar.id === "bar-platform-plan") continue;
    const gate = bar.id === "bar-hcl-gate";
    items.push({
      category: lane.category,
      label: gate ? "Hardware compatibility confirmed" : bar.label,
      start: window.start,
      end: window.end,
      swatch: gate ? "muted" : SWATCH_BY_WORKSTREAM[lane.workstreamType],
      milestone: bar.milestone && !gate,
      outcome: gate ? "Gate: platform build starts only once hardware compatibility is confirmed." : firstSentence(bar.outcome),
      dependsOn: (bar.prerequisites ?? []).flatMap(id => (labelOf.has(id) && !DESIGN_ID.test(id) ? [labelOf.get(id)!] : DESIGN_ID.test(id) ? ["design sign-off"] : [])),
    });
  }

  // Joint steering runs across the delivery window.
  const delivered = items.filter(item => !item.customerOwned);
  if (delivered.length) {
    items.push({ category: "Program Management & Governance", label: "Joint steering, working sessions and consumption review", start: delivered.map(item => item.start).sort()[0], end: delivered.map(item => item.end).sort().at(-1)!, swatch: "governance", milestone: false, outcome: "Steering, fortnightly working sessions and a monthly consumption review.", dependsOn: [] });
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
  const onVsphere8 = document.inventory.esxiVersions.some(item => /\b8\.\d/.test(item.version));
  if (onVsphere8) out.push({ category: "Program Management & Governance", label: "vSphere 8 end of support", start: "2027-10-11", end: "2027-10-11", swatch: "muted", milestone: true, outcome: "vSphere 8 reaches end of general support on 11 October 2027.", dependsOn: [] });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Generated content
// ---------------------------------------------------------------------------------------------

function platformName(document: EngagementDocument): string {
  const release = document.fields.compatibilityTargetRelease.replace(/^ESXi\s*/, "");
  return `${effectivePlatformEdition(document.fields) === "vvf" ? "VVF" : "VCF"} ${release}`;
}

function situationBullets(document: EngagementDocument): string[] {
  const { inventory } = document;
  const bullets: string[] = [];
  if (inventory.hosts) {
    const vcenters = document.report.discovery.vcenters;
    bullets.push(`<b>${inventory.hosts} ESXi hosts · ${inventory.vmCount.toLocaleString("en-US")} VMs (${inventory.poweredOnVms.toLocaleString("en-US")} powered on)</b>${vcenters ? ` across ${vcenters} vCenter${vcenters === 1 ? "" : "s"}` : ""}${inventory.clusters ? ` and ${inventory.clusters} cluster${inventory.clusters === 1 ? "" : "s"}` : ""}`);
    const models = inventory.hostModels.slice(0, 3).map(model => `<b>${model.hosts} ${esc(`${model.vendor} ${model.model}`.trim())}</b>`);
    if (models.length) bullets.push(`Host platforms: ${models.join("; ")}`);
    const versions = inventory.esxiVersions.slice(0, 3).map(item => `${esc(item.version)} (${item.hosts})`);
    if (versions.length) bullets.push(`ESXi versions in use: ${versions.join(", ")}`);
    if (inventory.datastoreCount) bullets.push(`${inventory.datastoreCount} datastores, ${inventory.datastoreCapacityTiB.toLocaleString("en-US")} TiB capacity`);
    const oldHardware = inventory.hclEvidence.vmInfo.filter(vm => { const version = Number(/(\d+)/.exec(vm.hardwareVersion)?.[1]); return version > 0 && version < 19; }).length;
    if (oldHardware) bullets.push(`<b>${oldHardware.toLocaleString("en-US")} VMs</b> below VM hardware version 19`);
    if (inventory.esxiVersions.some(item => /\b8\.\d/.test(item.version))) bullets.push("vSphere 8 reaches end of general support on <b>11 October 2027</b>");
  }
  return [...bullets, ...document.report.situation.map(esc)];
}

function requiredCores(document: EngagementDocument): number | null {
  const hosts = document.inventory.hclEvidence.hosts.filter(host => host.socketCount > 0 && host.coresPerSocket > 0);
  if (!hosts.length) return null;
  // VCF and VVF license at least 16 cores per CPU.
  return hosts.reduce((total, host) => total + host.socketCount * Math.max(16, host.coresPerSocket), 0);
}

type Row = { component: string; requirement: string; recommendation: string; gate: string | null };

function designElements(document: EngagementDocument): Row[] {
  const { fields, report, inventory } = document;
  const generated: Row[] = [];
  if (!inventory.hosts) generated.push({ component: "Inventory", requirement: "Sizing needs the current estate.", recommendation: "Provide an RVTools export of every in-scope vCenter.", gate: "a current RVTools export" });
  const storage = fields.adoptionDetails.principalStorage;
  if (storage !== "undecided") {
    const text: Record<string, [string, string]> = {
      vsan: ["vSAN is the principal storage for the management domain and new clusters.", "Size vSAN ESA from the estate and validate ReadyNode configurations."],
      "nfs-v3": ["NFS v3 is a supported principal storage type; the datastore must exist and be mounted on all hosts first.", "Keep the existing NFS storage; confirm the export and host access before the build."],
      "vmfs-fc": ["VMFS on Fibre Channel is a supported management-domain storage type; the datastore must be created and mounted on all hosts first.", "Keep the existing array over Fibre Channel; no vSAN needed."],
      "other-existing": ["Existing storage must be validated against the supported principal storage types.", "Confirm the storage workflow in design."],
    };
    generated.push({ component: "Principal storage", requirement: text[storage][0], recommendation: text[storage][1], gate: null });
  }
  const outcomes = new Set(resolvePlanOutcomes(fields).outcomes.map(item => item.key));
  if (effectivePlatformEdition(fields) === "vcf") {
    generated.push(outcomes.has("networking:overlay-transport") || outcomes.has("networking:vpc")
      ? { component: "Networking", requirement: "Workload traffic on distributed switches; the overlay needs an MTU of 1,600 or more.", recommendation: "Confirm MTU end to end and the transport VLANs before the overlay is enabled.", gate: "MTU confirmed" }
      : { component: "Networking", requirement: "NSX is deployed with VCF; workloads can stay VLAN-backed.", recommendation: "Start VLAN-backed; consider overlay networking in a later phase.", gate: null });
  }
  const required = requiredCores(document);
  const licensed = report.discovery.licensedCores ?? report.discovery.coreCount;
  if (required) {
    generated.push({ component: "Licensing", requirement: "16-core-per-CPU minimum per licensed core.", recommendation: licensed ? `${licensed.toLocaleString("en-US")} licensed cores on record against ${required.toLocaleString("en-US")} required for the ${inventory.hosts} hosts (${licensed >= required ? `${(licensed - required).toLocaleString("en-US")} spare` : `${(required - licensed).toLocaleString("en-US")} short`}).` : `${required.toLocaleString("en-US")} cores required for the ${inventory.hosts} hosts; licensed core count to be confirmed.`, gate: licensed ? null : "licensed core count confirmed" });
  }
  const oldHardware = inventory.hclEvidence.vmInfo.filter(vm => { const version = Number(/(\d+)/.exec(vm.hardwareVersion)?.[1]); return version > 0 && version < 19; }).length;
  if (oldHardware) generated.push({ component: "Workloads", requirement: "Supported guest operating systems and VM hardware.", recommendation: `Remediate ${oldHardware.toLocaleString("en-US")} VMs below hardware version 19 ahead of their migration waves.`, gate: null });
  const fromBrief = report.designElements.map(item => ({ component: item.component, requirement: item.requirement, recommendation: item.recommendation, gate: item.gate }));
  const named = new Set(fromBrief.map(item => item.component.toLowerCase()));
  return [...fromBrief, ...generated.filter(item => !named.has(item.component.toLowerCase()))];
}

const PROFILE_CATEGORIES: Array<[keyof EngagementDocument["report"]["designProfile"], string]> = [
  ["consumption", "Consumption"], ["physicalSite", "Physical Site Configuration"], ["availability", "Availability"],
  ["isolation", "Isolation"], ["recoverability", "Recoverability"], ["expansion", "Expansion"],
];

function designProfileDefault(document: EngagementDocument, key: string): string {
  const { fields, inventory, report } = document;
  const outcomes = new Set(resolvePlanOutcomes(fields).outcomes.map(item => item.key));
  const vvf = effectivePlatformEdition(fields) === "vvf";
  const sites = inventory.datacenters || report.discovery.datacenters || 0;
  switch (key) {
    case "consumption": return `${platformName(document)} with VCF Operations as the daily operations console${Array.from(outcomes).some(item => item.startsWith("automation:")) ? "; self-service through VCF Automation" : "; automation evaluated later"}.`;
    case "physicalSite": return sites ? `${sites} site${sites === 1 ? "" : "s"}${inventory.hosts ? `, ${inventory.hosts} hosts in the current estate` : ""}.` : "Sites to be confirmed in design.";
    case "availability": return fields.adoptionDetails.domainTopology === "consolidated" ? "Consolidated management domain: management components and workloads share the cluster; HA and fully automated DRS retained." : fields.adoptionDetails.domainTopology === "standard" ? "Standard architecture: a dedicated management domain and separate workload domains." : "Management domain topology to be decided in design.";
    case "isolation": return vvf ? "vSphere Distributed Switch networking; no NSX overlay in VVF." : outcomes.has("networking:overlay-transport") || outcomes.has("networking:vpc") ? "NSX deployed with VCF, with overlay networking in scope." : "NSX deployed with VCF, VLAN-backed at first; no network redesign on day one.";
    case "recoverability": return Array.from(outcomes).some(item => item.startsWith("resilience:")) ? "Recovery design with VMware Live Recovery; recovery objectives set in design." : "Recovery approach to be confirmed in design.";
    default: return "Capacity added wave by wave as hosts are evacuated and rebuilt into the platform.";
  }
}

function platformConstraints(document: EngagementDocument, termEnd: string | null, handoverMonth: string | null, customer: string) {
  const rows: Array<{ constraint: string; imposedBy: string; effect: string }> = [
    { constraint: "Design and a current inventory before the build", imposedBy: "Sizing", effect: "Build starts after design sign-off" },
  ];
  const path = playbookPlanForFields(document.fields).path;
  if (path === "greenfield" || path === "hybrid") rows.push({ constraint: "Management domain before any workload moves", imposedBy: "Platform", effect: "Proving wave follows the build" });
  if (document.inventory.hclEvidence.vmInfo.length) rows.push({ constraint: "Guest OS and VM hardware remediation before each wave", imposedBy: "Platform", effect: `${customer} remediates ahead of its waves` });
  for (const outcome of resolvePlanOutcomes(document.fields).outcomes.filter(item => item.requiredBy.length).slice(0, 3)) {
    rows.push({ constraint: `${planOutcomeLabel(outcome.key)} before ${outcome.requiredBy.map(key => planOutcomeLabel(key)).join(" and ")}`, imposedBy: "Platform", effect: "Sequenced as a prerequisite" });
  }
  const capitalized = (value: string) => value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  for (const item of document.report.constraints) rows.push({ constraint: item.constraint, imposedBy: capitalized(item.imposedBy) || "Calendar", effect: item.effect });
  if (termEnd) rows.push({ constraint: `Entitlement expiry ${shortDate(termEnd)}`, imposedBy: "Entitlement term", effect: handoverMonth ? `Handover completes in ${handoverMonth}` : "All hours consumed before expiry" });
  return rows;
}

// ---------------------------------------------------------------------------------------------
// HTML building blocks
// ---------------------------------------------------------------------------------------------

function table(headers: string[], rows: string[][], options: { total?: string[]; numeric?: number[]; foot?: boolean } = {}): string {
  const numeric = new Set(options.numeric ?? []);
  const cell = (value: string, index: number, tag: "td" | "th") => `<${tag}${numeric.has(index) ? ' class="num"' : ""}>${value}</${tag}>`;
  return `<table${options.foot ? ' data-foot="sum"' : ""}><thead><tr>${headers.map((header, index) => cell(esc(header), index, "th")).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((value, index) => cell(value, index, "td")).join("")}</tr>`).join("")}${options.total ? `<tr class="total">${options.total.map((value, index) => cell(value, index, "td")).join("")}</tr>` : ""}</tbody></table>`;
}

function swimlane(items: PlanItem[], document: EngagementDocument, steering: string): string {
  const dated = items.map(item => ({ ...item, startDate: parseIso(item.start)!, endDate: parseIso(item.end)! })).filter(item => item.startDate && item.endDate);
  const projectStart = parseIso(document.adoptionTimeline.startDate) ?? dated[0]?.startDate;
  if (!projectStart) return "";
  const origin = new Date(Date.UTC(projectStart.getUTCFullYear(), projectStart.getUTCMonth(), 1));
  const lastMonth = Math.min(23, Math.max(...dated.map(item => monthIndex(origin, item.endDate))));
  const months = Array.from({ length: lastMonth + 1 }, (_, index) => new Date(Date.UTC(origin.getUTCFullYear(), origin.getUTCMonth() + index, 1)));
  const columns = `repeat(${months.length},minmax(0,1fr))`;
  const declined = document.report.declined;
  const lanes = FIXED_GANTT_CATEGORIES.map(category => {
    const bars = dated.filter(item => item.category === category && monthIndex(origin, item.startDate) <= lastMonth);
    const content = bars.length
      ? bars.map(item => {
        const start = Math.max(0, monthIndex(origin, item.startDate)) + 1;
        const end = Math.min(lastMonth, monthIndex(origin, item.endDate)) + 2;
        return `<div class="gbar ${item.swatch}" style="grid-column:${start}/${end}" title="${esc(item.label)}">${esc(item.label)}${item.milestone ? " ◆" : ""}</div>`;
      }).join("")
      : `<div class="gempty" style="grid-column:1/-1">No work in scope${declined.length ? ` — ${esc(declined.join(", "))} not requested` : ""}.</div>`;
    return `<div class="glane"><div class="lname">${esc(category)}</div><div class="gtrack" style="grid-template-columns:${columns}">${content}</div></div>`;
  }).join("");
  const axis = `<div class="gaxis"><span class="lname">Month</span><div class="gtrack" style="grid-template-columns:${columns}">${months.map(month => `<span>${esc(monthLabel(month))}</span>`).join("")}</div></div>`;
  const legend = `<div class="glegend">${(Object.keys(SWATCH_LABEL) as Swatch[]).map(swatch => `<span><i class="${swatch}"></i>${esc(SWATCH_LABEL[swatch])}</span>`).join("")}</div>`;
  return `<div class="gantt"><div class="gsteer"><span class="lname">Steering</span><span class="band">${esc(steering)}</span></div>${axis}${lanes}${legend}</div>`;
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
.gantt{border:1px solid var(--hair);margin:8px 0;break-inside:avoid;font-size:9px}
.gsteer,.gaxis,.glane{display:grid;grid-template-columns:1.55in 1fr;align-items:stretch;border-bottom:1px solid var(--hair)}
.gsteer{background:#1f2633;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.gsteer .band{background:none;padding:5px 8px;font-size:9px}
.gaxis{background:#1f2633;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.gaxis .gtrack span{text-align:center;font-weight:800;padding:4px 0;font-size:8.5px}
.gaxis .lname,.gsteer .lname{color:#fff}
.lname{font-weight:800;padding:6px 8px;font-size:9.5px;display:flex;align-items:center}
.gtrack{display:grid;grid-auto-flow:row dense;gap:3px 2px;padding:5px 3px}
.gbar{color:#fff;font-weight:700;font-size:8px;line-height:1.15;padding:3px 5px;border-radius:3px;overflow:hidden;max-height:calc(2.3em + 6px);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.governance{background:#7c3aed}.operating{background:#0d9488}.infrastructure{background:#2563eb}.migration{background:#1f9d55}.consume{background:#d97706}.security{background:#CC0000}.muted{background:#9aa3ae}
.gempty{font-style:italic;color:var(--muted);padding:3px 4px}
.glegend{display:flex;flex-wrap:wrap;gap:12px;padding:6px 8px;font-size:8.5px;color:var(--slate)}
.glegend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ms{display:grid;grid-template-columns:1.4in 1fr;gap:6px;margin:4px 0;font-size:11.5px}
.ms b{color:var(--ink)}
.ph{background:#FFF2CC;border-bottom:1px dashed #B58900;padding:0 3px;font-weight:700;color:#7A5C00}
.revision{background:#FFF7E6;border-left:4px solid #d97706;padding:9px 13px;margin:12px 0;font-size:10.5px}
.sources{font-size:9px;color:var(--muted);margin-top:10px}
.printbtn{position:fixed;right:18px;bottom:18px;background:var(--red);color:#fff;border:0;border-radius:999px;padding:10px 18px;font-weight:800;cursor:pointer}
@media print{.printbtn{display:none}}
@media screen{body{max-width:11in;margin:0 auto}.cover{width:100%}}
`;

export type CondensedFcpOptions = { today?: string; effort: ScopedEffort };

export function renderCondensedFcpHtml(title: string, source: EngagementDocument, options: CondensedFcpOptions): string {
  // Rows the planner has not finished are left out of the document.
  const document: EngagementDocument = { ...source, report: completedReport(source.report) };
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
  const customerEffort = buildCustomerEffort(document);
  const items = [...planItems(document, customer), ...deadlines(document, termEnd)].sort((left, right) => left.start.localeCompare(right.start));
  const handover = items.find(item => /handover/i.test(item.label) && !item.customerOwned);
  const handoverMonth = handover ? monthLabel(parseIso(handover.end)!) : null;
  const platform = platformName(document);
  const deliveryModel = report.deliveryModel || "CDW";
  const outcomes = resolvePlanOutcomes(fields).outcomes;
  const strip = `<div class="strip"><span>${cdwLogoSvg("logo")}Consulting Solution Architecture</span><span>Functional Consumption Plan — Condensed | Prepared for ${esc(customer)} | ${esc(stamp)}</span></div>`;

  // ---- KPI tiles (exactly one dollar figure: the entitlement value)
  const valueTile = fields.entitlementAmount
    ? `<div class="kpi"><div class="v">${esc(money(fields.entitlementAmount))}</div><div class="l">${esc(platform.split(" ")[0])} Services Entitlement</div><div class="sub">${burndown ? `${hours(burndown.entitledHours)} hours · ` : ""}${termStart && termEnd ? `${esc(shortDate(termStart))} – ${esc(shortDate(termEnd))}` : ""}</div></div>`
    : `<div class="kpi"><div class="v">${hours(effort.totals.total)} hrs</div><div class="l">Scoped Effort</div><div class="sub">No entitlement booked yet</div></div>`;
  const kpis = burndown
    ? `${valueTile}<div class="kpi"><div class="v">${hours(burndown.remainingHours)} hrs</div><div class="l">Hours Remaining</div><div class="sub">${hours(burndown.consumedHours)} of ${hours(burndown.entitledHours)} hours delivered${report.entitlement.consumedAsOf ? ` (as of ${esc(shortDate(report.entitlement.consumedAsOf))})` : ""}</div></div><div class="kpi"><div class="v">${burndown.daysToExpiry} days</div><div class="l">Days to Expiry</div><div class="sub">Expires ${esc(shortDate(burndown.termEnd))}${burndown.extended ? " · extension approved" : " · no extension recorded"}</div></div><div class="kpi"><div class="v">${burndown.expiryPace} hrs/wk</div><div class="l">Required Weekly Pace</div><div class="sub">To consume by expiry · ~${burndown.expiryPaceFte} FTE from ${esc(shortDate(burndown.asOf))}</div></div>`
    : `${valueTile}<div class="kpi"><div class="v">${hours(effort.totals.total)} hrs</div><div class="l">Scoped Effort</div><div class="sub">${effort.source === "assignments" ? "Signed resource assignments" : "Estimated from the plan"}</div></div><div class="kpi"><div class="v">${termEnd ? esc(shortDate(termEnd)) : "To be confirmed"}</div><div class="l">Delivery Window Ends</div><div class="sub">No consumption data yet</div></div><div class="kpi"><div class="v">${esc(platform)}</div><div class="l">Target Platform</div><div class="sub">${esc(plan.label)}</div></div>`;

  // ---- Executive summary
  const situation = situationBullets(document);
  const planOnPage = FIXED_GANTT_CATEGORIES.map(category => {
    const work = items.filter(item => item.category === category && !item.customerOwned && item.swatch !== "muted").map(item => item.label);
    const text = work.length ? esc(Array.from(new Set(work)).slice(0, 4).join("; ")) : `no work in scope${report.declined.length ? ` (${esc(report.declined.join(", "))} not requested)` : ""}`;
    return `<li><b>${esc(category)}</b> — ${text}</li>`;
  }).join("");
  const lead = `A design-led plan to move ${esc(customer)} onto ${esc(platform)} — ${esc(plan.label.toLowerCase())}${termEnd ? ` — consuming the services entitlement before it lapses on ${esc(longDate(termEnd))}` : ""}.`;

  // ---- Burndown
  const burndownSection = burndown
    ? `<div class="keep"><h2>Entitlement Burndown</h2><p>${(burndown.pctConsumed * 100).toFixed(1)}% of the entitlement is consumed; ${(burndown.pctElapsed * 100).toFixed(1)}% of the term has elapsed. The red fill is hours delivered; the dark tick marks elapsed term.</p><p class="lead">${hours(burndown.consumedHours)} of ${hours(burndown.entitledHours)} hours delivered · ${hours(burndown.remainingHours)} hours remaining · ${esc(shortDate(burndown.termEnd))} expiry.</p><div class="bd"><div class="bd-bar"><div class="bd-fill" style="width:${(burndown.pctConsumed * 100).toFixed(1)}%"></div><div class="bd-tick" style="left:${(burndown.pctElapsed * 100).toFixed(1)}%"></div></div></div><div class="note"><b>Time-sensitive:</b> ${hours(burndown.remainingHours)} hours remain with ${burndown.daysToExpiry} days to the ${esc(longDate(burndown.termEnd))} expiry, which requires an average of <b>${burndown.expiryPace} hours per week (about ${burndown.expiryPaceFte} FTE)</b> from today. Unconsumed hours are not refunded.</div></div>`
    : `<div class="note">No consumption data exists yet for this engagement; the burndown appears once entitled and consumed hours are recorded.</div>`;

  // ---- Scoped effort (hours only)
  const effortRows = effort.rows.map(row => [esc(row.note ? `${row.workstream} (${row.note})` : row.workstream), hours(row.architect), hours(row.srConsultant), hours(row.projectManager), hours(row.total)]);
  const scopedEffort = `<h2>Scoped Effort</h2><p class="lead">CDW-delivered hours by workstream and role${effort.source === "assignments" ? ", from the signed resource assignments for this entitlement" : ", estimated from this plan; the signed resource assignments replace these figures"}.</p>${table(["Workstream", "Architect", "Sr. Consultant", "Sr. Project Manager", "Total Hours"], effortRows, { numeric: [1, 2, 3, 4], foot: true, total: ["Total CDW-delivered hours", hours(effort.totals.architect), hours(effort.totals.srConsultant), hours(effort.totals.projectManager), hours(effort.totals.total)] })}`;

  // ---- Customer effort
  const peak = customerEffort.peak;
  const customerEffortSection = customerEffort.phases.length
    ? `<h2>Customer Effort by Week &amp; Work Stream</h2><p class="lead">CDW planning estimate of ${esc(customer)} team time, by phase.${peak ? ` Peak demand is <b>${peak.total} hours per week (${peak.fte} FTE)</b> during ${esc(peak.phase.toLowerCase())} (${esc(peak.window)}).` : ""}</p>${table(["Phase", "Window", "Platform Lead hrs/wk", "Operations hrs/wk", "Network hrs/wk", "Total hrs/wk", "FTE"], customerEffort.phases.map(phase => [esc(phase.phase), esc(phase.window), String(phase.platformLead), String(phase.operations), String(phase.network), String(phase.total), phase.fte.toFixed(2)]), { numeric: [2, 3, 4, 5, 6] })}`
    : "";

  // ---- Personnel
  const personnelRows = report.personnel.length
    ? report.personnel.map(row => [esc(row.workstream), row.cdw.length ? esc(row.cdw.join(" · ")) : placeholder("to be named"), row.broadcom.length ? esc(row.broadcom.join(" · ")) : "—", row.customer.length ? esc(row.customer.join(" · ")) : placeholder("to be named")])
    : [[esc("All work streams"), placeholder("to be named"), "—", placeholder("to be named")]];
  const personnel = `<h3>Target Personnel by Work Stream</h3>${table(["Work Stream", "CDW", "Broadcom", customer], personnelRows)}`;

  // ---- Design
  const profileRows = PROFILE_CATEGORIES.map(([key, label]) => [esc(label), esc(report.designProfile[key] || designProfileDefault(document, key))]);
  const elementRows = designElements(document).map(item => [esc(item.component), esc(item.requirement), `${esc(item.recommendation)}${item.gate ? ` <b>Gate:</b> ${esc(item.gate)}.` : ""}`]);

  // ---- Sequence, timeline, milestones, forward plan
  const sequenceRows = FIXED_GANTT_CATEGORIES.flatMap(category => {
    const rows = items.filter(item => item.category === category);
    if (!rows.length) return [[`<b>${esc(category)}</b>`, "—", `No work in scope${report.declined.length ? ` — ${esc(report.declined.join(", "))} not requested` : ""}.`]];
    return rows.map((item, index) => [index === 0 ? `<b>${esc(category)}</b>` : "", esc(item.start === item.end ? shortDate(item.start) : formatWindow(item.start, item.end)), `${esc(item.label)}.${item.dependsOn.length ? ` Depends on ${esc(Array.from(new Set(item.dependsOn)).slice(0, 2).join(" and "))}.` : ""}${item.customerOwned ? ` Run by ${esc(customer)}.` : ""}`]);
  });
  const steering = `Joint ${deliveryModel.replace(/\s*\+\s*/g, " <> ")} <> ${customer} · fortnightly working sessions · monthly consumption review`;
  const milestones = report.milestonesToDate.length
    ? report.milestonesToDate.map(item => `<div class="ms"><b>${esc(shortDate(item.date))}</b><span><b>${esc(item.event)}</b>${item.detail ? ` — ${esc(item.detail)}` : ""}</span></div>`).join("")
    : `<p class="lead">${placeholder("Milestones to date to be recorded")}</p>`;
  const forward = items.filter(item => !item.customerOwned && item.swatch !== "muted" && item.category !== "Program Management & Governance")
    .map(item => `<div class="ms"><b>${esc(formatWindow(item.start, item.end))}</b><span>${esc(item.label)}${item.outcome ? ` — ${esc(item.outcome)}` : ""}</span></div>`).join("")
    + (termEnd ? `<div class="ms"><b>By ${esc(shortDate(termEnd))}</b><span>Full entitlement consumption — all hours consumed ahead of expiry.</span></div>` : "");

  // ---- Adoption plan & recommendation
  const shortVersion = burndown
    ? `${hours(burndown.remainingHours)} hours remain and the entitlement expires on <b>${esc(longDate(burndown.termEnd))}</b>. Unconsumed hours are not refunded. The entitlement funds the one-time work: CDW designs and builds the ${esc(platform)} foundation, proves the runbook and hands over, and ${esc(customer)}'s team repeats it. That requires about ${burndown.expiryPace} hours of delivery per week from today.`
    : `CDW designs and builds the ${esc(platform)} foundation, proves the runbook and hands over; ${esc(customer)}'s team repeats it. Unconsumed entitlement hours are not refunded once an entitlement is booked.`;
  const heardRows = report.whatWeHeard.length ? report.whatWeHeard.map(item => [esc(item.component), esc(item.customerPosition), esc(item.whereItLands)]) : [[placeholder("to be confirmed"), placeholder("customer position to be recorded"), "—"]];
  const problems = report.problems.length ? `<ul>${report.problems.map(item => `<li><b>${esc(item.problem)}</b>${item.addressedBy ? ` — ${esc(item.addressedBy)}` : ""}</li>`).join("")}</ul>` : `<p>${placeholder("Problems to be recorded")}</p>`;
  const questions = report.openQuestions.length ? table(["Question", "Why we are asking now"], report.openQuestions.map(item => [esc(item.question), esc(item.whyNow)])) : `<p>${placeholder("Open questions to be recorded")}</p>`;
  const technical = [
    ...report.technicalItems.map(item => `<li>${esc(item.item)}${item.reference ? ` — ${esc(item.reference)}` : ""}</li>`),
    ...(document.inventory.esxiVersions.some(item => /\b8\.\d/.test(item.version)) && !report.technicalItems.some(item => /vSphere 8/i.test(item.item)) ? ["<li>vSphere 8 end of general support 11 October 2027 — Broadcom Product Lifecycle</li>"] : []),
  ];
  const constraints = platformConstraints(document, termEnd, handoverMonth, customer);
  const minEffort = customerEffort.phases.length ? Math.min(...customerEffort.phases.map(phase => phase.total)) : 0;
  const asks = [
    ...(peak ? [`<b>Effort:</b> ${minEffort}–${peak.total} hours per week, peaking at ${peak.fte} FTE during ${esc(peak.phase.toLowerCase())}`] : []),
    ...report.customerAsks.map(esc),
    ...(!document.inventory.hosts ? ["<b>Inventory:</b> a current RVTools export"] : []),
  ];
  const namedItems = new Set(report.openItems.map(item => item.item.trim().toLowerCase()));
  const openItems = [
    ...report.openItems.map(item => [esc(item.item), esc(item.gates), item.owner ? esc(item.owner) : placeholder("to be named")]),
    ...(!report.personnel.length && !namedItems.has("named personnel by work stream") ? [["Named personnel by work stream", "Target personnel", placeholder("to be named")]] : []),
    ...(!document.inventory.hosts && !namedItems.has("current rvtools export") ? [["Current RVTools export", "Design sign-off and sizing", placeholder("to be named")]] : []),
  ];
  const pulledIn = outcomes.filter(item => item.requiredBy.length);

  const sources = report.sources.length ? report.sources.map(item => `${esc(item.title)}${item.date ? ` (${esc(shortDate(item.date))})` : ""}`).join("; ") : "Engagement plan and RVTools estate data";

  const body = `
<div class="band"><h1>${esc(platform.startsWith("VVF") ? "VMware vSphere Foundation" : "VMware Cloud Foundation")} Adoption — ${esc(customer)}</h1><p>Prepared for ${esc(customer)} | ${esc(stamp)}<br>${lead}</p></div>
<div class="pills">Customer: <b>${esc(customer)}${fields.location ? ` — ${esc(fields.location)}` : ""}</b> • Platform: <b>${esc(platform)}</b>${termStart && termEnd ? ` • Entitlement: <b>${esc(shortDate(termStart))} – ${esc(shortDate(termEnd))}</b>` : ""} • Path: <b>${esc(plan.label)}</b> • Delivery: <b>${esc(deliveryModel)}</b></div>
<div class="kpis">${kpis}</div>

<h2>Executive Summary</h2>
<p class="lead">Where ${esc(customer)} stands today, what the entitlement funds, and the plan to turn it into a platform the team can run.</p>
<h3>Situation</h3>
${situation.length ? `<ul>${situation.map(item => `<li>${item}</li>`).join("")}</ul>` : `<p>${placeholder("Situation to be recorded")}</p>`}
<h3>Plan on a Page</h3>
<ul>${planOnPage}</ul>

${burndownSection}
${scopedEffort}
${customerEffortSection}
${personnel}

<div class="closer">Make a clean ${esc(platform.split(" ")[0])} foundation happen.</div>
<h2>${esc(platform.split(" ")[0])} Design Profile</h2>
<p class="lead">Architecture summarized across the standard design profile categories. Decisions marked for design are set in the design sessions.</p>
${table(["Profile Category", `${customer} Design Decision`], profileRows)}
<h3>Design Elements — Requirements &amp; Recommendations</h3>
<p class="lead">Per-component requirements with the recommendation for ${esc(customer)}. Gates are called out.</p>
${table(["Component", "Requirement", "Recommendation"], elementRows)}

<h2>Adoption Timeline</h2>
<p class="lead">The delivery sequence by calendar month, grouped under the five standard categories.</p>
<h3>Adoption Sequence &amp; Dependencies</h3>
${table(["Category", "Stage", "Activity and Dependency"], sequenceRows)}
<div class="keep"><h3>Private Cloud Adoption Timeline</h3>
<p class="lead">Grey lanes are ${esc(customer)}-owned work, gates and governing deadlines. ◆ marks key delivered functionality.</p>
${swimlane(items, document, steering)}</div>
<h3>Engagement Milestones to Date</h3>
${milestones}
<h3>Forward Delivery Plan</h3>
${forward}

<div class="closer">Make a proven, repeatable move happen.</div>
<h2>Adoption Plan &amp; Recommendation</h2>
<p class="lead">What we recommend ${esc(customer)} does with the remaining entitlement, and why the sequence is what it is.</p>
<h3>The short version</h3>
<p>${shortVersion}</p>
<h3>What we heard, and what we have built to</h3>
${table(["Component", `${customer} Position`, "Where It Lands in This Plan"], heardRows)}
<h3>The problems worth solving first</h3>
${problems}
<h3>The open questions</h3>
${questions}
<h3>The technical items to confirm early</h3>
${technical.length ? `<ul>${technical.join("")}</ul>` : `<p>${placeholder("Technical items to be recorded")}</p>`}
${pulledIn.length ? `<p class="lead">Prerequisites included so selected outcomes can be delivered: ${esc(pulledIn.map(item => `${planOutcomeLabel(item.key)} (for ${item.requiredBy.map(key => planOutcomeLabel(key)).join(", ")})`).join("; "))}.</p>` : ""}
<h3>Why the order is not negotiable</h3>
${table(["Constraint", "Imposed By", "Effect on the Sequence"], constraints.map(item => [esc(item.constraint), esc(item.imposedBy), esc(item.effect)]))}
<h3>What this asks of ${esc(customer)}'s team</h3>
${asks.length ? `<ul>${asks.map(item => `<li>${item}</li>`).join("")}</ul>` : `<p>${placeholder("Team asks to be recorded")}</p>`}
<h3>Open Items</h3>
${openItems.length ? table(["Item", "What It Gates", "Owner"], openItems) : "<p>No open items.</p>"}

<div class="closer">Make full use of the entitlement happen.</div>
<div class="closer red">Make Amazing Happen.</div>
${report.revision ? `<div class="revision">Revision: ${esc(report.revision)}</div>` : ""}
<p class="sources">Prepared by CDW Consulting Solution Architecture for ${esc(customer)} — Functional Consumption Plan (Condensed) · ${esc(stamp)}. Sources: ${sources}.</p>`;

  const cover = `<section class="cover">${cdwLogoSvg("logo")}${cdwLogoSvg("orbit", "")}<div class="eyebrow">Functional Consumption Plan · ${esc(customer)}</div><h1>${esc(report.headline || "Amazing happens when the platform runs itself.")}</h1><div class="sign">Make Amazing Happen.</div><div class="meta"><div><b>Prepared for</b>${esc(customer)}</div><div><b>Date</b>${esc(longDate(asOf))}</div><div><b>Prepared by</b>CDW Consulting Solution Architecture</div></div><div class="legend">${esc(LEGEND)}</div></section>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} - FCP</title><style>${CSS}</style></head><body>${cover}<table class="page"><thead><tr><td>${strip}</td></tr></thead><tfoot><tr><td><div class="legendrow">${esc(LEGEND)}</div></td></tr></tfoot><tbody><tr><td>${body}</td></tr></tbody></table><button class="printbtn" type="button" onclick="window.print()">Print / Save as PDF</button></body></html>`;
}
