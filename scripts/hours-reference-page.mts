/**
 * Builds "FCP Hours Reference v2.html" from the sweep data and the v2 coefficients.
 *
 *   pnpm exec tsx scripts/hours-sweep.mts && pnpm exec tsx scripts/hours-reference-page.mts
 *
 * Reads docs/hours-reference/hours-sweep.json and writes docs/hours-reference/FCP Hours Reference v2.html.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HOURS_V2, type Coefficient } from "../shared/hoursConfig";

const DIR = path.resolve("docs/hours-reference");
const data = JSON.parse(readFileSync(path.join(DIR, "hours-sweep.json"), "utf8"));
const esc = (value: unknown) => String(value).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
const round = (value: number) => Math.round(value * 10) / 10;

const PATH_NAMES: Record<string, string> = {
  undecided: "Pathway decision required", "design-only": "Design only", "in-place": "In-place upgrade", converge: "Converge existing vCenter",
  "import-workload-domain": "Import as workload domain", greenfield: "Greenfield with staging hardware", hybrid: "Hybrid / multiple pathways",
};

const FORMULAS: Array<[string, string, string, Coefficient | null]> = [
  ["DD", "Design discovery", "min(120, 24 + 0.15 x hosts + 6 x vCenters + 12 x (sites - 1)); 0 with a prior assessment; 12 when Broadcom baselining was delivered", HOURS_V2.discovery.base],
  ["DX", "Discovery by area", "Ops/Automation 8 (once), Kubernetes 8, NSX networking 12, security 12, DR 12, HCX 12, cyber recovery 12, Private AI 16; + 4 x (sites - 1) on networking, DR and HCX", HOURS_V2.discoveryAreas.networking],
  ["A", "Architecture and design", "64 + 16 x WLDs + 24 x (instances - 1) + 32 x (sites - 1) + 24 x stretched clusters + 8 x (storage types - 1) + min(40, 0.25 x max(0, hosts - 32))", HOURS_V2.design.base],
  ["D", "VCF deploy", "64 + 16 handover + 4 Management Services + 40 x (instances - 1) + per WLD (24 + 8 if dedicated NSX) + 8 x max(0, clusters - 1 - WLDs) + 24 x stretched + 0.75 x min(hosts, 64) + 0.5 x max(0, hosts - 64)", HOURS_V2.deploy.managementDomain],
  ["D_VVF", "VVF build", "40 + 16 + 8 x (clusters - 1) + 0.75 x hosts", HOURS_V2.deployVvf.base],
  ["S_storage", "Storage adder", "8 x clusters on FC or NFS + 8 if mixed principal storage", HOURS_V2.storage.perFcOrNfsCluster],
  ["R_remed", "Prerequisite remediation", "4 x clusters on VUM + 4 x vCenters with IWA + 6 x clusters on VSS + 8 if Ops for Logs is redeployed", HOURS_V2.remediation.perClusterOnVum],
  ["C1", "Converge (first vCenter)", "40 + 4 x clusters + 0.25 x hosts + 8 if no existing NSX", HOURS_V2.converge.base],
  ["X1", "Workload domain import (per vCenter)", "24 + 4 x clusters + 0.1 x hosts + (12 + 0.25 x hosts if source is 8.x); first vCenter + 8 NSX if absent + 16 ELM break-up", HOURS_V2.import.perVcenter],
  ["U_VVF", "VVF 8 to 9 upgrade", "16 + 8 x vCenters + 4 x clusters (+ remediation)", HOURS_V2.upgradeVvf.base],
  ["U3", "VCF 5.x or 9.0 to 9.1 upgrade", "24 + 16 + 8 + 12 x domains + 6 x clusters + VCFA 12 + logs 12 + VIDM to Identity Broker 12 + HCX 6 + Avi 6 + SRM 12 + 8 x Supervisors + NSX Federation 16", HOURS_V2.upgradeVcf.planning],
  ["FILL_mig", "Migration waves", "16 x site pairs + 0.1 x VMs + 10 x waves + 0.15 x VMs + 2 x extended VLANs + 16 pilot; waves = ceil(VMs / 150)", HOURS_V2.waves.vmsPerWave],
  ["FILL_ip", "In-place host windows", "4 x windows + 0.25 x hosts + 8 first-cluster proving; windows = ceil(hosts / 16)", HOURS_V2.inPlaceWaves.hostsPerWindow],
  ["X_VCFA_platform", "VCF Automation platform", "32, once for any automation outcome", HOURS_V2.automation.platform],
  ["X2", "VM self-service", "24 + 8 x orgs + 4 x max(0, catalog items - 3)", HOURS_V2.automation.vmSelfService],
  ["X3", "IaC and governance", "32 + 4 x max(0, templates - 3)", HOURS_V2.automation.iacGovernance],
  ["X4", "VCF Operations", "16 + 4 x vCenter sources + 4 x management packs + modules (lifecycle 8, health and logs 12, capacity and cost 12, 4 per dashboard, identity 8, 16 per event target)", HOURS_V2.operations.base],
  ["X5", "NSX overlay", "16 + 4 x clusters + 2 x max(0, segments - 5); never added by a security outcome", HOURS_V2.overlay.base],
  ["X6", "NSX Edge and routing", "40 x Edge clusters + 8 x extra uplink pairs", HOURS_V2.edge.perEdgeCluster],
  ["X16", "VPC and transit gateway", "Distributed: 16 + 4 x external VLANs + 12 VNA; centralized: 16 and X6", HOURS_V2.vpc.base],
  ["X7", "VDS networking", "12 + 2 x clusters", HOURS_V2.vds.base],
  ["X11", "vDefend distributed firewall", "Stage 1 8 + stage 2 16 + stage 3 (8 + 4 x zones) + stage 4 (6 x apps) + 16 SSP for Security Intelligence", HOURS_V2.segmentation.perZone],
  ["X12", "vDefend threat prevention", "24 SSP if new + 12 x features + 8 x tuning cycles", HOURS_V2.threatPrevention.sspDeploy],
  ["X10", "VMware Live Recovery", "24 x site pairs + 2 x plans + 0.1 x protected VMs + 12 x exercises + 32 on-premises clean room", HOURS_V2.recovery.perSitePair],
  ["X14", "Live Cyber Recovery (cloud)", "16 + 0.05 x protected VMs + 12 x IRE tests", HOURS_V2.cloudCyberRecovery.base],
  ["X9", "Supervisor and VKS", "16 x Supervisors + 8 x VKS clusters + 8 registry; allowed on VVF", HOURS_V2.kubernetes.perSupervisor],
  ["X8", "Private AI Services", "24 + 8 + 2 x GPU hosts + 8 x models + 8; requires X9", HOURS_V2.privateAi.platform],
  ["X13", "Data Services Manager", "16 + 8 x engines + 4 x templates; requires VCFA and X9", HOURS_V2.dataServices.base],
  ["X15", "Avi and WAF", "16 + 8 x clouds + 4 x max(0, virtual services - 3) + 8 x WAF policies", HOURS_V2.avi.controllerCluster],
  ["EF", "Efficiency and memory tiering", "12 + 0.25 x tiered hosts", HOURS_V2.efficiency.base],
];

const coefficientRows = Object.entries(HOURS_V2).flatMap(([group, entries]) => ("value" in (entries as object) ? [[group, "", entries as Coefficient]] : Object.entries(entries as Record<string, Coefficient>).map(([key, item]) => [group, key, item] as const)))
  .map(([group, key, item]) => `<tr><td><code>${esc(group)}${key ? `.${esc(key)}` : ""}</code></td><td class="n">${esc((item as Coefficient).value)}</td><td>${esc((item as Coefficient).confidence)}</td><td>${esc((item as Coefficient).source)}</td></tr>`).join("");
const formulaRows = FORMULAS.map(([code, name, formula, coefficient]) => `<tr><td><code>${esc(code)}</code></td><td>${esc(name)}</td><td>${esc(formula)}</td><td>${esc(coefficient?.confidence ?? "")}</td></tr>`).join("");
const checkRows = (data.checks as Array<{ claim: string; expected: string; result: string; hit: boolean }>).map(row => `<tr><td>${esc(row.claim)}</td><td>${esc(row.expected)}</td><td>${esc(row.result)}</td><td>${row.hit ? "Hit" : "<b>Flag</b>"}</td></tr>`).join("");
const outcomeRows = (data.outcomes as Array<{ area: string; focus: string; path: string; added: Array<{ code: string; name: string; base: number }>; total: number; v1Total: number }>)
  .map(row => `<tr><td>${esc(row.path)}</td><td>${esc(row.area)}</td><td><code>${esc(row.focus)}</code></td><td>${esc(row.added.map(line => `${line.code} ${line.name} (${round(line.base)})`).join("; ") || "none")}</td><td class="n">${Math.round(row.v1Total)}</td><td class="n">${Math.round(row.total)}</td></tr>`).join("");
const comboRows = (data.combinations as Array<{ depth: string; total: number; v1Total: number }>).map(row => `<tr><td>${esc(row.depth)}</td><td class="n">${Math.round(row.v1Total)}</td><td class="n">${Math.round(row.total)}</td></tr>`).join("");
const defaultRows = Object.entries(HOURS_V2.defaults).map(([key, item]) => `<tr><td><code>${esc(key)}</code></td><td class="n">${esc(item.value)}</td><td>${esc(item.source)}</td></tr>`).join("");
const slim = (data.grid as Array<Record<string, unknown>>).map(row => ({ e: row.edition, p: row.path, s: row.sites, h: row.hosts, a: row.assessment, k1: row.v1Stages, k2: row.v2Stages, l1: (row.v1Lines as Array<{ code: string; base: number }>).map(line => [line.code, round(line.base)]), l2: (row.v2Lines as Array<{ code: string; base: number }>).map(line => [line.code, round(line.base)]) }));

const page = `<title>FCP Hours Reference v2</title>
<style>
/* Layout: a single reference column with a sticky section index; wide tables scroll in their own frames. */
:root{--bg:#f6f6f4;--surface:#ffffff;--fg:#1d2228;--muted:#5d6670;--line:#dcdfe2;--accent:#c8102e;--accent-soft:#fbe9ec;--warn:#8a5a00;--warn-soft:#fff4dc;--zebra:#fafaf9;
--sans:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#14171a;--surface:#1c2024;--fg:#e6e8ea;--muted:#9aa3ad;--line:#30363c;--accent:#ff5a6e;--accent-soft:#3a1d22;--warn:#f0c26a;--warn-soft:#33290f;--zebra:#202428;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#14171a;--surface:#1c2024;--fg:#e6e8ea;--muted:#9aa3ad;--line:#30363c;--accent:#ff5a6e;--accent-soft:#3a1d22;--warn:#f0c26a;--warn-soft:#33290f;--zebra:#202428;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:15px/1.55 var(--sans)}
.wrap{max-width:1180px;margin:0 auto;padding-inline:20px;padding-block:28px 64px;display:grid;gap:36px}
header h1{font-size:clamp(26px,4vw,36px);line-height:1.15;margin:4px 0 8px;text-wrap:balance;letter-spacing:-.01em}
.eyebrow{font:600 12px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
header p{max-width:72ch;color:var(--muted);margin:0}
nav{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding-block:10px;display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px}
nav a{color:var(--fg);text-decoration:none;border-bottom:2px solid transparent} nav a:hover,nav a:focus-visible{border-color:var(--accent);outline:none}
section{display:grid;gap:14px;min-width:0}
h2{font-size:22px;margin:0;text-wrap:balance} h3{font-size:16px;margin:8px 0 0}
p,li{max-width:78ch} ul{margin:0;padding-left:20px;display:grid;gap:6px}
code{font:13px var(--mono);background:var(--zebra);border:1px solid var(--line);padding:0 4px;border-radius:3px}
.muted{color:var(--muted);font-size:13px}
.frame{overflow-x:auto;border:1px solid var(--line);background:var(--surface);border-radius:6px}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px solid var(--line)}
th{font-weight:600;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);background:var(--surface);position:sticky;top:0}
tbody tr:nth-child(even){background:var(--zebra)}
.num,td.n{text-align:right;font-variant-numeric:tabular-nums;font-family:var(--mono);font-size:13px;white-space:nowrap}
.formula{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:14px 16px;display:grid;gap:8px}
.formula div{font-family:var(--mono);font-size:13.5px}
.controls{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:end}
.controls label{display:grid;gap:4px;font-size:12px;font-weight:600;color:var(--muted);letter-spacing:.03em;text-transform:uppercase}
select{font:14px var(--sans);padding:6px 8px;border:1px solid var(--line);border-radius:4px;background:var(--surface);color:var(--fg);min-width:150px}
select:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
tr.total td{font-weight:600;border-top:2px solid var(--fg)}
tr.codes td{color:var(--muted);font-size:12px}
.jump{background:var(--accent-soft)}
@media (max-width:600px){.wrap{padding-inline:16px} select{min-width:0;width:100%} .controls label{flex:1 1 140px}}
</style>
<div class="wrap">
<header>
<div class="eyebrow">FCP Builder · hours model v2</div>
<h1>Every phase, option and hour under the v2 model</h1>
<p>Generated from the app's code by running every pathway, edition, outcome and host count through the v2 hours model, with v1 alongside. Hours are the full scope (Pass 1) with no entitlement, so nothing is fitted to a budget. Spec: <code>docs/FCP_Hours_Model_Rebuild.md</code>.</p>
</header>
<nav aria-label="Sections"><a href="#model">How v2 builds hours</a><a href="#checks">Spec deltas</a><a href="#explorer">Hours by host count</a><a href="#lines">Lines and formulas</a><a href="#outcomes">Outcomes</a><a href="#fit">Entitlement fit</a><a href="#defaults">Defaults</a><a href="#coefficients">Coefficients</a></nav>

<section id="model">
<h2>How v2 builds hours</h2>
<p>Pass 1 prices every line from topology and per-unit counts. Pass 2 fits that scope to the entitlement by placing it in buckets; it never changes a Pass 1 value.</p>
<div class="formula">
<div>lead role = base hours from the line's formula</div>
<div>secondary technical role = 10% of base (20% on X11, X12, X16; 0 on DX)</div>
<div>project manager = 15% of all lead + secondary hours, at least 24 on a build, 8 on design only</div>
<div>add-ons (X2 to X16, EF) x depth: Tier 1 1.0, Tier 2 1.25, Tier 3 1.6</div>
<div>design-only and undecided pathways keep 25% of each add-on</div>
</div>
</section>

<section id="checks">
<h2>Spec deltas</h2>
<p>The deltas the spec states, checked against the implementation. Greenfield deltas are base hours without migration waves. Flagged rows are reported, not tuned.</p>
<div class="frame"><table><thead><tr><th>Claim</th><th>Spec expects</th><th>v2 result</th><th></th></tr></thead><tbody>${checkRows}</tbody></table></div>
</section>

<section id="explorer">
<h2>Hours by host count</h2>
<p>Choose a model, pathway, edition, sites and assessment. Rows are the stages the plan creates and cells are total hours (architect + consultant + PM). Highlighted cells changed from the host count to their left. Base plans, no outcomes. Compare shows the v1 and v2 totals side by side.</p>
<div class="controls">
<label for="f-model">Model<select id="f-model"><option value="2">v2</option><option value="1">v1</option><option value="c">Compare totals</option></select></label>
<label for="f-edition">Edition<select id="f-edition"><option value="vcf">VCF</option><option value="vvf">VVF</option></select></label>
<label for="f-path">Pathway<select id="f-path"></select></label>
<label for="f-sites">Sites<select id="f-sites"><option value="1">1 site</option><option value="2">2 sites</option><option value="4">4 sites</option></select></label>
<label for="f-assess">Prior assessment<select id="f-assess"><option value="false">No</option><option value="true">Yes</option></select></label>
<label for="f-role">Show<select id="f-role"><option value="4">Total hours</option><option value="1">Architect</option><option value="2">Sr. Consultant</option><option value="3">Project manager</option></select></label>
</div>
<div class="frame"><table id="explorer-table"></table></div>
<p class="muted">Inventory assumed: 20 VMs per host, one cluster per 16 hosts, one vCenter, one VCF instance, existing hardware, topology undecided (10 hosts or fewer counts as consolidated).</p>
</section>

<section id="lines">
<h2>Lines and formulas</h2>
<div class="frame"><table><thead><tr><th>Code</th><th>Line</th><th>Base hours</th><th>Confidence</th></tr></thead><tbody>${formulaRows}</tbody></table></div>
</section>

<section id="outcomes">
<h2>Outcomes</h2>
<p>Lines and base hours each outcome adds to a 40-host plan (greenfield, then design only), with the whole-plan totals under v1 and v2.</p>
<div class="frame"><table><thead><tr><th>Pathway</th><th>Area</th><th>Outcome</th><th>v2 lines added (base)</th><th class="num">v1 total</th><th class="num">v2 total</th></tr></thead><tbody>${outcomeRows}</tbody></table></div>
<h3>Spec 7.8 outcome set by depth (converge, 40 hosts)</h3>
<div class="frame"><table><thead><tr><th>Depth</th><th class="num">v1 total</th><th class="num">v2 total</th></tr></thead><tbody>${comboRows}</tbody></table></div>
</section>

<section id="fit">
<h2>Entitlement fit</h2>
<ul>
<li>Entitlement hours = entitlement value / blended rate (the rate card unless the planner overrides it), or the signed entitled hours when recorded.</li>
<li>8% is held in reserve before filling. The fillable budget is the rest; hours left after the fill are reported as entitlement remaining.</li>
<li>E1 (core): discovery, design, the pathway spine, dated migration waves, Operations Tier 1. E2 (depth): outcomes at Tier 1 in the customer's ranking, remaining waves, depth uplifts, efficiency. The fill stops at the first whole unit that does not fit.</li>
<li>Lines split only at their units: per wave (HCX setup and pilot stay with the first), per change window, per vCenter (ELM and NSX adders with the first), per site pair and exercise, vDefend by stage, zone and application, modules and per-unit terms, depth by tier.</li>
<li>A fully displaced add-on keeps 25% of its Tier 1 value in E2 as design when it fits, and is flagged when it does not.</li>
<li>Displaced work goes to F (follow-on entitlement, depends on a future purchase), or to C (customer-funded) when the customer wants it this year.</li>
<li>Guardrails: under-funded when the core does not fit (the plan keeps the whole core and shows the gap), every hour of scope lands in exactly one bucket, required monthly burn, reserve release at month 6.</li>
</ul>
</section>

<section id="defaults">
<h2>Defaults</h2>
<p>Used when the brief, RVTools and the planner are silent. Each one a plan uses is listed on it as an assumption.</p>
<div class="frame"><table><thead><tr><th>Input</th><th class="num">Default</th><th>Source</th></tr></thead><tbody>${defaultRows}</tbody></table></div>
</section>

<section id="coefficients">
<h2>Coefficients</h2>
<p>Every number the model uses, from <code>shared/hoursConfig.ts</code>, with the spec's confidence rating and source.</p>
<div class="frame"><table><thead><tr><th>Coefficient</th><th class="num">Value</th><th>Confidence</th><th>Source</th></tr></thead><tbody>${coefficientRows}</tbody></table></div>
</section>
</div>
<script id="sweep-data" type="application/json">${JSON.stringify(slim).replace(/</g, "\\u003c")}</script>
<script>
(function(){
  const data = JSON.parse(document.getElementById("sweep-data").textContent);
  const names = ${JSON.stringify(PATH_NAMES)};
  const vvfPaths = ["undecided","design-only","in-place","converge","greenfield"];
  const $ = id => document.getElementById(id);
  const hosts = [...new Set(data.map(r => r.h))].sort((a,b) => a-b);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
  function fillPaths(){
    const ed = $("f-edition").value, keep = $("f-path").value;
    $("f-path").innerHTML = Object.keys(names).filter(p => ed === "vcf" || vvfPaths.includes(p)).map(p => '<option value="' + p + '">' + names[p] + '</option>').join("");
    $("f-path").value = [...$("f-path").options].some(o => o.value === keep) ? keep : "greenfield";
  }
  function render(){
    const model = $("f-model").value, ed = $("f-edition").value, p = $("f-path").value, s = +$("f-sites").value, a = $("f-assess").value === "true", col = +$("f-role").value;
    const rows = hosts.map(h => data.find(r => r.e === ed && r.p === p && r.s === s && r.h === h && r.a === a));
    const head = '<thead><tr><th>Stage</th>' + hosts.map(h => '<th class="num">' + h + ' hosts</th>').join("") + '</tr></thead><tbody>';
    if (model === "c") {
      const sum = (r, key) => r ? r[key].reduce((t, k) => t + k[col], 0) : 0;
      const line = (label, key) => '<tr><td>' + label + '</td>' + rows.map(r => '<td class="n">' + sum(r, key) + '</td>').join("") + '</tr>';
      const delta = '<tr class="total"><td>Change</td>' + rows.map(r => { const v1 = sum(r, "k1"), v2 = sum(r, "k2"); return '<td class="n">' + (v1 ? (v2 >= v1 ? "+" : "") + Math.round((v2 - v1) / v1 * 100) + "%" : "") + '</td>'; }).join("") + '</tr>';
      $("explorer-table").innerHTML = head + line("v1 total", "k1") + line("v2 total", "k2") + delta + '</tbody>';
      return;
    }
    const key = model === "1" ? "k1" : "k2", lineKey = model === "1" ? "l1" : "l2";
    const order = [];
    rows.forEach(r => r && r[key].forEach(k => { if (!order.includes(k[0])) order.push(k[0]); }));
    const cell = (r, label) => { const k = r && r[key].find(x => x[0] === label); return k ? k[col] : 0; };
    let html = head;
    for (const label of order) html += '<tr><td>' + esc(label) + '</td>' + rows.map((r, i) => { const v = cell(r, label), prev = i ? cell(rows[i-1], label) : v; return '<td class="n' + (v !== prev ? " jump" : "") + '">' + (v || "–") + '</td>'; }).join("") + '</tr>';
    const totals = rows.map(r => r ? r[key].reduce((t, k) => t + k[col], 0) : 0);
    html += '<tr class="total"><td>Total</td>' + totals.map((v, i) => '<td class="n' + (i && v !== totals[i-1] ? " jump" : "") + '">' + v + '</td>').join("") + '</tr>';
    html += '<tr class="codes"><td>Lines (base)</td>' + rows.map(r => '<td class="n">' + (r ? r[lineKey].map(l => l[0] + " " + l[1]).join("<br>") : "") + '</td>').join("") + '</tr></tbody>';
    $("explorer-table").innerHTML = html;
  }
  $("f-edition").addEventListener("change", () => { fillPaths(); render(); });
  ["f-model","f-path","f-sites","f-assess","f-role"].forEach(id => $(id).addEventListener("change", render));
  fillPaths(); render();
})();
</script>
`;
writeFileSync(path.join(DIR, "FCP Hours Reference v2.html"), page);
console.log(`Wrote ${path.join(DIR, "FCP Hours Reference v2.html")} (${Math.round(page.length / 1024)} KB)`);
