import type { EngagementDocument, ReadinessItem, Timeline, TimelineBar } from "../shared/fcp";
import { completionPercent, validateTimeline } from "../shared/fcp";

const palette: Record<string, { bg: string; fg: string; border: string }> = {
  slate: { bg: "#334155", fg: "#ffffff", border: "#1e293b" },
  blue: { bg: "#2563eb", fg: "#ffffff", border: "#1d4ed8" },
  teal: { bg: "#0f766e", fg: "#ffffff", border: "#115e59" },
  amber: { bg: "#f59e0b", fg: "#172033", border: "#d97706" },
  red: { bg: "#c8102e", fg: "#ffffff", border: "#9f0b24" },
  green: { bg: "#15803d", fg: "#ffffff", border: "#166534" },
  gate: { bg: "#7c3aed", fg: "#ffffff", border: "#6d28d9" },
  deferred: { bg: "#e5e7eb", fg: "#475569", border: "#94a3b8" },
};

function esc(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function value(input: unknown, fallback = "Not Yet Confirmed") {
  const text = String(input ?? "").trim();
  return esc(text || fallback);
}

function number(input: number, fallback = "—") {
  return Number.isFinite(input) && input > 0 ? input.toLocaleString() : fallback;
}

function money(input: number, fallback = "Not Yet Confirmed") {
  return Number.isFinite(input) && input > 0 ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(input) : fallback;
}

function timelineMonth(timeline: Timeline, column: number, boundary = false) {
  const index = boundary ? Math.max(0, column - 2) : Math.max(0, column - 1);
  return timeline.columns[index] || "Plan End";
}

function renderBar(activity: TimelineBar, totalColumns: number) {
  const color = palette[activity.color] || palette.slate;
  const start = Math.max(1, Math.min(totalColumns, activity.startCol));
  const end = Math.max(start + 1, Math.min(totalColumns + 1, activity.endCol));
  return `<div class="timeline-bar ${activity.deferred ? "deferred" : ""}" style="grid-column:${start}/${end};background:${color.bg};color:${color.fg};border-color:${color.border}" title="${esc(activity.label)}">${activity.milestone ? "◆ " : ""}${esc(activity.label)}</div>`;
}

function renderTimeline(timeline: Timeline) {
  const minimumWidth = 180 + timeline.columns.length * 92;
  return `<div class="timeline-wrap"><div class="timeline-grid" style="min-width:${minimumWidth}px;grid-template-columns:180px repeat(${timeline.columns.length},minmax(92px,1fr))"><div class="timeline-corner">Workstream</div>${timeline.columns.map(month => `<div class="timeline-head">${esc(month)}</div>`).join("")}${timeline.lanes.map(lane => `<div class="timeline-lane">${esc(lane.name)}</div><div class="timeline-row" style="grid-column:2/${timeline.columns.length + 2};grid-template-columns:repeat(${timeline.columns.length},1fr)">${lane.bars.map(activity => renderBar(activity, timeline.columns.length)).join("")}</div>`).join("")}</div></div>`;
}

function renderSequence(timeline: Timeline) {
  const rows = timeline.lanes.flatMap(lane => lane.bars.map(activity => ({ lane: lane.name, activity })));
  return `<table><thead><tr><th>Workstream</th><th>Activity</th><th>Start Month</th><th>End Month</th><th>Type</th></tr></thead><tbody>${rows.map(({ lane, activity }) => `<tr><td>${esc(lane)}</td><td><span class="dot" style="background:${palette[activity.color]?.bg || palette.slate.bg}"></span>${esc(activity.label)}</td><td>${esc(timelineMonth(timeline, activity.startCol))}</td><td>${esc(timelineMonth(timeline, activity.endCol, true))}</td><td>${activity.milestone ? "Milestone" : activity.deferred ? "Deferred" : "Planned"}</td></tr>`).join("")}</tbody></table>`;
}

function planningClass(item: ReadinessItem) {
  return item.status === "good" ? "good" : item.status === "attention" ? "attention" : item.status === "info" ? "info" : "unknown";
}

function renderPlanningConsiderations(document: EngagementDocument) {
  return `<div class="considerations">${document.readiness.items.map(item => `<article class="${planningClass(item)}"><div><span>${esc(item.status)}</span><h3>${esc(item.title)}</h3></div><p>${esc(item.detail)}</p><small>${esc(item.evidence)}</small></article>`).join("")}</div><div class="notice"><strong>Planning Boundary:</strong> ${esc(document.readiness.disclaimer)}</div>`;
}

function renderPlanSummary(document: EngagementDocument) {
  const f = document.fields;
  const i = document.inventory;
  const items = [
    ["Inventory", `${i.sourceCount} RVTools export(s), ${i.hosts || "unconfirmed"} hosts, ${i.vmCount || "unconfirmed"} VMs, and ${i.physicalCores || "unconfirmed"} observed physical cores`],
    ["Entitlement", `${money(f.entitlementAmount)} across ${f.entitledCores ? `${f.entitledCores.toLocaleString()} cores` : "an unconfirmed core quantity"}`],
    ["Term", `${f.entitlementStart || "TBD"} through ${f.entitlementEnd || "TBD"}`],
    ["Adoption Window", `${f.targetStart || f.entitlementStart || "TBD"} through ${f.targetComplete || f.entitlementEnd || "TBD"}`],
    ["Plan", "Confirm how available entitlement funds align to customer priorities and the proposed activity sequence"],
    ["Design", "Shape the platform and selected capability designs, then adjust timing directly on the month-based plans"],
  ];
  return `<div class="plan-summary">${items.map(([heading, body], index) => `<article><span>${index + 1}</span><div><h3>${esc(heading)}</h3><p>${esc(body)}</p></div></article>`).join("")}</div>`;
}

export function renderFcpHtml(title: string, document: EngagementDocument) {
  const f = document.fields;
  const i = document.inventory;
  const errors = [...validateTimeline(document.adoptionTimeline), ...validateTimeline(document.twoYearPlan)];
  const completion = completionPercent(f, i);
  const source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
:root{--cdw:#c8102e;--navy:#10233f;--ink:#172033;--muted:#64748b;--line:#dbe2ea;--surface:#f5f7fa}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Arial,"Helvetica Neue",sans-serif;color:var(--ink);background:var(--surface);line-height:1.45}.mast{height:58px;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 30px;border-bottom:1px solid var(--line)}.logo{font-weight:900;font-size:28px;letter-spacing:-2px;color:var(--cdw)}.conf{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.hero{background:linear-gradient(125deg,#0b1f37,#173a61);color:#fff;padding:34px 30px 30px;border-bottom:5px solid var(--cdw)}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#b8cae0}.hero h1{font-size:32px;margin:8px 0 6px}.hero p{max-width:900px;margin:0;color:#d9e4f0}.meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}.pill{background:#ffffff18;border:1px solid #ffffff38;border-radius:999px;padding:7px 11px;font-size:12px}.tabs{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid var(--line);display:flex;padding:0 30px;box-shadow:0 4px 16px #0f233e0d;overflow-x:auto}.tabs button{border:0;background:none;padding:16px 18px;font-weight:700;color:#64748b;cursor:pointer;border-bottom:3px solid transparent;white-space:nowrap}.tabs button.active{color:var(--cdw);border-color:var(--cdw)}main{max-width:1500px;margin:0 auto;padding:26px 24px 60px}.panel{display:none}.panel.active{display:block}.section-title{display:flex;align-items:center;gap:10px;margin:28px 0 14px}.section-title:before{content:"";width:5px;height:28px;border-radius:3px;background:var(--cdw)}h2{font-size:21px;margin:0}h3{margin:0 0 8px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpi,.card{background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 24px #0f233e0d}.kpi{padding:18px}.kpi small{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.kpi strong{font-size:25px;display:block;margin-top:7px;color:var(--navy)}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{padding:20px}.card p{margin:8px 0;color:#3e4c5f}.notice{border-left:4px solid var(--cdw);background:#fff5f6;padding:14px 16px;border-radius:0 10px 10px 0;margin-top:14px}.progress{height:8px;background:#e7ebf0;border-radius:10px;overflow:hidden}.progress span{display:block;height:100%;background:var(--cdw)}table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;border:1px solid var(--line);font-size:12px}th{text-align:left;background:#eef2f6;color:#334155;padding:10px}td{padding:10px;border-top:1px solid #edf0f4;vertical-align:top}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px}.considerations{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.considerations article{background:#fff;border:1px solid var(--line);border-left:5px solid #94a3b8;border-radius:10px;padding:16px}.considerations article.good{border-left-color:#15803d}.considerations article.attention{border-left-color:#c8102e}.considerations article.info{border-left-color:#2563eb}.considerations article span{text-transform:uppercase;font-size:9px;font-weight:900;letter-spacing:.12em;color:var(--muted)}.considerations article h3{font-size:14px;margin-top:3px}.considerations article p{font-size:12px;margin:7px 0}.considerations article small{display:block;color:var(--muted)}.timeline-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:#fff}.timeline-grid{display:grid}.timeline-corner,.timeline-head{background:#eef2f6;font-size:11px;font-weight:700;padding:10px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.timeline-lane{padding:11px;font-size:12px;font-weight:700;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.timeline-row{display:grid;position:relative;min-height:54px;align-items:center;border-bottom:1px solid var(--line);background-image:linear-gradient(to right,transparent calc(100% - 1px),#e2e8f0 calc(100% - 1px));background-size:calc(100% / var(--months,12)) 100%}.timeline-bar{margin:5px 4px;padding:7px 9px;border:1px solid;border-radius:7px;font-size:10px;font-weight:700;line-height:1.25;min-height:30px;align-content:center;overflow:hidden}.timeline-bar.deferred{border-style:dashed}.plan-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.plan-summary article{display:flex;gap:12px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:15px}.plan-summary article>span{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--navy);color:#fff;font-weight:800}.plan-summary h3{font-size:13px}.plan-summary p{font-size:11px;color:var(--muted);margin:0}.foot{padding:20px 30px;background:#0b1f37;color:#b8cae0;font-size:10px;display:flex;justify-content:space-between}@media(max-width:800px){.kpis,.grid2,.considerations,.plan-summary{grid-template-columns:1fr}.tabs{padding:0 8px}.hero{padding:28px 18px}.mast{padding:0 18px}main{padding:18px 12px}.conf{display:none}}@media print{body{background:#fff}.tabs{display:none}.panel{display:block!important}.card,.kpi,.timeline-wrap,table,.considerations article{break-inside:avoid}main{max-width:none;padding:16px}.timeline-grid{min-width:1100px!important}@page{size:letter landscape;margin:.35in}}
</style></head><body><header class="mast"><div class="logo">CDW</div><div class="conf">Confidential · Internal Planning Document</div></header><section class="hero"><div class="eyebrow">Functional Consumption Plan</div><h1>${value(f.customerName, title)}</h1><p>A customer-specific view of available entitlement, VCF priorities, and the editable calendar-month adoption sequence.</p><div class="meta"><span class="pill">${value(f.location)}</span><span class="pill">${money(f.entitlementAmount)}</span><span class="pill">${value(f.entitlementStart)} to ${value(f.entitlementEnd)}</span><span class="pill">${i.sourceCount} RVTools Export(s)</span><span class="pill">${completion}% Complete</span></div></section><nav class="tabs"><button class="active" data-tab="summary">Executive Summary</button><button data-tab="considerations">Planning Considerations</button><button data-tab="adoption">Adoption Timeline</button><button data-tab="two-year">Two-Year Notional Adoption Plan</button></nav><main>
<section id="summary" class="panel active"><div class="section-title"><h2>Customer and Entitlement</h2></div><div class="kpis"><div class="kpi"><small>Entitlement Amount</small><strong>${money(f.entitlementAmount, "—")}</strong></div><div class="kpi"><small>Entitled Cores</small><strong>${number(f.entitledCores)}</strong></div><div class="kpi"><small>Virtual Machines</small><strong>${number(i.vmCount)}</strong></div><div class="kpi"><small>ESXi Hosts</small><strong>${number(i.hosts)}</strong></div></div><div class="section-title"><h2>Plan on a Page</h2></div><div class="grid2"><article class="card"><h3>Current Estate</h3><p><strong>${number(i.poweredOnVms)} powered-on VMs</strong> across ${number(i.clusters)} clusters and ${number(i.datacenters)} datacenters.</p><p>${number(i.datastoreCapacityTiB)} TiB datastore capacity · ${number(i.snapshotCount)} snapshots · ${number(i.vCpu)} vCPUs.</p><p>Entitlement Term: ${value(f.entitlementStart)} to ${value(f.entitlementEnd)}.</p></article><article class="card"><h3>Functional Consumption Plan</h3><p>${esc(document.rationale)}</p><div class="notice"><strong>Editable by Design:</strong> every activity can be renamed, moved, resized, added, or removed as the customer plan changes.</div></article></div><div class="section-title"><h2>Plan Summary</h2></div>${renderPlanSummary(document)}<div class="section-title"><h2>Review Completeness</h2></div><div class="card"><div class="progress"><span style="width:${completion}%"></span></div><p>${completion}% of the minimum information is present. Unconfirmed values are shown plainly.</p>${errors.length ? `<div class="notice"><strong>Timeline Review Needed:</strong> ${errors.map(esc).join(" ")}</div>` : ""}</div></section>
<section id="considerations" class="panel"><div class="section-title"><h2>${esc(document.readiness.label)}</h2></div>${renderPlanningConsiderations(document)}<div class="section-title"><h2>Observed Versions and Hardware</h2></div><div class="grid2"><article class="card"><h3>ESXi Versions</h3><table><thead><tr><th>Reported Version</th><th>Hosts</th></tr></thead><tbody>${i.esxiVersions.map(row => `<tr><td>${esc(row.version)}</td><td>${row.hosts}</td></tr>`).join("") || '<tr><td colspan="2">Not Available</td></tr>'}</tbody></table></article><article class="card"><h3>Top Host Models</h3><table><thead><tr><th>Model</th><th>Hosts</th><th>Cores</th></tr></thead><tbody>${i.hostModels.slice(0, 10).map(row => `<tr><td>${esc(`${row.vendor} ${row.model}`)}</td><td>${row.hosts}</td><td>${row.physicalCores}</td></tr>`).join("") || '<tr><td colspan="3">Not Available</td></tr>'}</tbody></table></article></div></section>
<section id="adoption" class="panel"><div class="section-title"><h2>Adoption Timeline</h2></div>${renderTimeline(document.adoptionTimeline)}<div class="section-title"><h2>Adoption Sequence</h2></div>${renderSequence(document.adoptionTimeline)}</section>
<section id="two-year" class="panel"><div class="section-title"><h2>Two-Year Notional Adoption Plan</h2></div>${renderTimeline(document.twoYearPlan)}<div class="section-title"><h2>Two-Year Activity Sequence</h2></div>${renderSequence(document.twoYearPlan)}</section>
</main><footer class="foot"><span>CDW · Functional Consumption Plan</span><span>${value(f.accountId, "Customer")}</span></footer><script>document.querySelectorAll('[data-tab]').forEach(function(button){button.addEventListener('click',function(){document.querySelectorAll('[data-tab]').forEach(function(item){item.classList.remove('active')});document.querySelectorAll('.panel').forEach(function(panel){panel.classList.remove('active')});button.classList.add('active');document.getElementById(button.dataset.tab).classList.add('active')})});</script></body></html>`;
  return source.replaceAll(/\[\[[^\]]+\]\]/g, "Not Yet Confirmed");
}
