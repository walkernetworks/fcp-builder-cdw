import type { EngagementDocument, TimelineBar } from "../shared/fcp";
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
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function value(value: unknown, fallback = "Not yet confirmed") {
  const text = String(value ?? "").trim();
  return esc(text || fallback);
}

function money(valueText: string) {
  const text = String(valueText || "").trim();
  return text ? esc(text) : "TBD";
}

function renderBar(bar: TimelineBar, totalColumns: number) {
  const color = palette[bar.color] || palette.slate;
  const start = Math.max(1, Math.min(totalColumns, bar.startCol));
  const end = Math.max(start + 1, Math.min(totalColumns + 1, bar.endCol));
  const flags = [bar.milestone ? "milestone" : "", bar.deferred ? "deferred" : ""].filter(Boolean).join(" ");
  return `<div class="gantt-bar ${flags}" style="grid-column:${start}/${end};background:${color.bg};color:${color.fg};border-color:${color.border}" title="${esc(bar.label)}">${bar.milestone ? "◆ " : ""}${esc(bar.label)}</div>`;
}

function renderGantt(document: EngagementDocument, compact = false) {
  const { columns, lanes } = document.timeline;
  const grid = `180px repeat(${columns.length}, minmax(${compact ? "74px" : "98px"},1fr))`;
  return `<div class="gantt-wrap"><div class="gantt" style="grid-template-columns:${grid}">
    <div class="gantt-corner">Workstream</div>${columns.map(column => `<div class="gantt-head">${esc(column)}</div>`).join("")}
    ${lanes.map(lane => `<div class="gantt-lane">${esc(lane.name)}</div><div class="gantt-row" style="grid-column:2/${columns.length + 2};grid-template-columns:repeat(${columns.length},1fr)">${lane.bars.map(bar => renderBar(bar, columns.length)).join("")}</div>`).join("")}
  </div></div>`;
}

function renderSequence(document: EngagementDocument) {
  const rows = document.timeline.lanes.flatMap(lane => lane.bars.map(bar => ({ lane: lane.name, bar })));
  return `<table><thead><tr><th>Workstream</th><th>Activity</th><th>Starts</th><th>Ends before</th><th>Control</th></tr></thead><tbody>${rows.map(({ lane, bar }) => `<tr><td>${esc(lane)}</td><td><span class="legend-dot" style="background:${palette[bar.color]?.bg || palette.slate.bg}"></span>${esc(bar.label)}</td><td>${esc(document.timeline.columns[bar.startCol - 1] || `Stage ${bar.startCol}`)}</td><td>${esc(document.timeline.columns[bar.endCol - 1] || "Program end")}</td><td>${bar.milestone ? "Milestone" : bar.deferred ? "Deferred" : "Active"}</td></tr>`).join("")}</tbody></table>`;
}

function renderTwoYear(document: EngagementDocument) {
  const stages = document.timeline.columns;
  const midpoint = Math.ceil(stages.length / 2);
  const year1 = stages.slice(0, midpoint);
  const year2 = stages.slice(midpoint);
  const summarize = (from: number, to: number) => document.timeline.lanes.flatMap(lane => lane.bars.filter(bar => bar.startCol <= to && bar.endCol > from).map(bar => `${lane.name}: ${bar.label}`));
  return `<div class="two-year"><section><div class="year-tag">Year 1 · Foundation & transition</div><h3>${esc(year1.join(" · "))}</h3><ul>${summarize(1, midpoint + 1).slice(0, 9).map(item => `<li>${esc(item)}</li>`).join("")}</ul></section><section><div class="year-tag">Year 2 · Modernize & operate</div><h3>${esc(year2.join(" · "))}</h3><ul>${summarize(midpoint + 1, stages.length + 1).slice(0, 9).map(item => `<li>${esc(item)}</li>`).join("")}</ul></section></div>`;
}

function renderRoadmap(document: EngagementDocument) {
  const allBars = document.timeline.lanes.flatMap(lane => lane.bars.map(bar => ({ lane: lane.name, ...bar })));
  return `<div class="roadmap">${document.timeline.columns.map((column, index) => {
    const active = allBars.filter(bar => bar.startCol <= index + 1 && bar.endCol > index + 1);
    return `<article><span>${String(index + 1).padStart(2, "0")}</span><h3>${esc(column)}</h3><p>${active.slice(0, 4).map(bar => esc(bar.label)).join(" · ") || "Sequencing checkpoint"}</p></article>`;
  }).join("")}</div>`;
}

function renderForwardPlan(document: EngagementDocument) {
  const f = document.fields;
  const items = [
    ["Kickoff", f.kickoffDate ? `${f.kickoffDate}${f.kickoffTime ? ` at ${f.kickoffTime}` : ""}` : "Confirm kickoff window"],
    ["Commercial clock", f.clockStart || "Confirm token and labor-pool clocks"],
    ["Hardware gate", f.hardwareIsNetNew ? `${f.hardwareVendor || "Hardware"} lead: approximately ${f.hardwareLeadMonths} months` : "Existing capacity supports an accelerated start"],
    ["Migration", `${f.vmCount || "Estate"} VMs sequenced through HCX mobility groups`],
    ["Resilience", f.drInScope ? `${f.drApproach || "DR"} with RPO ${f.rpoTarget || "TBD"} and RTO ${f.rtoTarget || "TBD"}` : "DR is not currently in scope"],
    ["Consumption governance", "Monthly labor-pool, token, risk, and dependency review"],
  ];
  return `<div class="forward-plan">${items.map(([title, body], index) => `<article><span>${index + 1}</span><div><h3>${esc(title)}</h3><p>${esc(body)}</p></div></article>`).join("")}</div>`;
}

export function renderFcpHtml(title: string, document: EngagementDocument) {
  const f = document.fields;
  const errors = validateTimeline(document.timeline);
  const completion = completionPercent(f);
  const source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
  :root{--cdw:#c8102e;--navy:#10233f;--ink:#172033;--muted:#64748b;--line:#dbe2ea;--surface:#f5f7fa;--card:#fff}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Arial,"Helvetica Neue",sans-serif;color:var(--ink);background:var(--surface);line-height:1.45}.mast{height:58px;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 30px;border-bottom:1px solid var(--line)}.logo{font-weight:900;font-size:28px;letter-spacing:-2px;color:var(--cdw)}.conf{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.hero{background:linear-gradient(125deg,#0b1f37,#173a61);color:#fff;padding:34px 30px 30px;border-bottom:5px solid var(--cdw)}.hero .eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:#b8cae0}.hero h1{font-size:32px;margin:8px 0 6px;letter-spacing:-.02em}.hero p{max-width:850px;margin:0;color:#d9e4f0}.meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}.pill{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:7px 11px;font-size:12px}.tabs{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid var(--line);display:flex;padding:0 30px;box-shadow:0 4px 16px rgba(15,35,62,.05)}.tabs button{border:0;background:none;padding:16px 18px;font-weight:700;color:#64748b;cursor:pointer;border-bottom:3px solid transparent}.tabs button.active{color:var(--cdw);border-color:var(--cdw)}main{max-width:1320px;margin:0 auto;padding:26px 24px 60px}.tab-panel{display:none}.tab-panel.active{display:block}.section-title{display:flex;align-items:center;gap:10px;margin:28px 0 14px}.section-title:before{content:"";width:5px;height:28px;border-radius:3px;background:var(--cdw)}h2{font-size:21px;margin:0}h3{margin:0 0 8px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpi,.card{background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 24px rgba(15,35,62,.05)}.kpi{padding:18px}.kpi small{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.kpi strong{font-size:25px;display:block;margin-top:7px;color:var(--navy)}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{padding:20px}.card p{margin:8px 0;color:#3e4c5f}.callout{border-left:4px solid var(--cdw);background:#fff5f6;padding:14px 16px;border-radius:0 10px 10px 0}.progress{height:8px;background:#e7ebf0;border-radius:10px;overflow:hidden}.progress span{display:block;height:100%;background:var(--cdw)}table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;border:1px solid var(--line);font-size:12px}th{text-align:left;background:#eef2f6;color:#334155;padding:10px;border-bottom:1px solid var(--line)}td{padding:10px;border-bottom:1px solid #edf0f4;vertical-align:top}.legend-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px}.gantt-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:#fff}.gantt{display:grid;min-width:960px}.gantt-corner,.gantt-head{background:#eef2f6;font-size:11px;font-weight:700;padding:10px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.gantt-lane{padding:11px;font-size:12px;font-weight:700;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.gantt-row{display:grid;position:relative;min-height:54px;align-items:center;border-bottom:1px solid var(--line);background-image:linear-gradient(to right,transparent calc(100% - 1px),#e6ebf1 calc(100% - 1px));background-size:calc(100% / var(--cols,8)) 100%}.gantt-bar{margin:5px 4px;padding:7px 9px;border:1px solid;border-radius:7px;font-size:10px;font-weight:700;line-height:1.25;min-height:30px;align-content:center;overflow:hidden}.gantt-bar.deferred{border-style:dashed}.two-year{display:grid;grid-template-columns:1fr 1fr;gap:14px}.two-year section{background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px}.year-tag{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--cdw);font-weight:800}.roadmap{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.roadmap article{background:#fff;border:1px solid var(--line);border-top:4px solid var(--cdw);padding:15px;border-radius:10px}.roadmap span{color:var(--cdw);font-weight:900;font-size:11px}.roadmap h3{font-size:14px;margin-top:5px}.roadmap p{font-size:11px;color:var(--muted)}.forward-plan{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.forward-plan article{display:flex;gap:12px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:15px}.forward-plan article>span{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--navy);color:#fff;font-weight:800;font-size:11px}.forward-plan h3{font-size:13px}.forward-plan p{font-size:11px;color:var(--muted);margin:0}.foot{padding:20px 30px;background:#0b1f37;color:#b8cae0;font-size:10px;display:flex;justify-content:space-between}@media(max-width:800px){.kpis,.grid2,.two-year,.roadmap,.forward-plan{grid-template-columns:1fr}.tabs{overflow-x:auto;padding:0 8px}.hero{padding:28px 18px}.mast{padding:0 18px}main{padding:18px 12px}.conf{display:none}}@media print{body{background:#fff}.tabs{display:none}.tab-panel{display:block!important}.hero{break-after:avoid}.card,.kpi,.gantt-wrap,table,.two-year section{break-inside:avoid}main{max-width:none;padding:16px}.foot{margin-top:20px}@page{size:letter landscape;margin:.35in}}
  </style></head><body><header class="mast"><div class="logo">CDW</div><div class="conf">Confidential · Internal planning document</div></header><section class="hero"><div class="eyebrow">Functional Consumption Plan</div><h1>${value(f.customerName, title)}</h1><p>A coordinated adoption sequence for VMware Cloud Foundation, migration, operations, resilience, and consumption governance.</p><div class="meta"><span class="pill">${value(f.cityState || f.city)}</span><span class="pill">Updated ${value(f.updatedDate)}</span><span class="pill">${value(f.source, "SA-authored discovery")}</span><span class="pill">${completion}% intake complete</span></div></section><nav class="tabs"><button class="active" data-tab="summary">Executive Summary</button><button data-tab="timeline">Adoption Timeline</button></nav><main>
  <section id="summary" class="tab-panel active"><div class="section-title"><h2>Commercial posture</h2></div><div class="kpis"><div class="kpi"><small>Entitlement</small><strong>${money(f.entitlement)}</strong></div><div class="kpi"><small>Broadcom tokens</small><strong>${money(f.broadcomTokens)}</strong></div><div class="kpi"><small>Labor pool</small><strong>${money(f.laborPool)}</strong></div><div class="kpi"><small>Total program</small><strong>${money(f.totalProgram)}</strong></div></div><div class="section-title"><h2>Situation and plan on a page</h2></div><div class="grid2"><article class="card"><h3>Customer situation</h3><p><strong>${value(f.vmCount, "TBD")} VMs</strong> across ${value(f.siteCount, "TBD")} sites and ${value(f.hostCount, "TBD")} hosts.</p><p>Storage: ${value(f.existingStorage)} · Load balancer: ${value(f.loadBalancer)}.</p><p>Term: ${value(f.termStart)} to ${value(f.termEnd)} · Entitlement ends ${value(f.entitlementEndDate)}.</p></article><article class="card"><h3>Plan on a page</h3><p>${esc(document.rationale)}</p><div class="callout"><strong>Success control:</strong> No gated stage begins until its commercial, hardware, and technical prerequisites are explicitly confirmed.</div></article></div><div class="section-title"><h2>Discovery completeness</h2></div><div class="card"><div class="progress"><span style="width:${completion}%"></span></div><p>${completion}% of the core FCP intake is complete. Unconfirmed values are rendered as “Not yet confirmed” rather than unresolved template tokens.</p>${errors.length ? `<div class="callout"><strong>Timeline review needed:</strong> ${errors.map(esc).join(" ")}</div>` : ""}</div></section>
  <section id="timeline" class="tab-panel"><div class="section-title"><h2>Adoption Sequence & Dependencies</h2></div>${renderSequence(document)}<div class="section-title"><h2>Private Cloud Gantt</h2></div>${renderGantt(document)}<div class="section-title"><h2>Two-Year Gantt</h2></div>${renderTwoYear(document)}<div class="section-title"><h2>Executive Roadmap</h2></div>${renderRoadmap(document)}<div class="section-title"><h2>Forward Delivery Plan</h2></div>${renderForwardPlan(document)}</section>
  </main><footer class="foot"><span>CDW · Functional Consumption Plan</span><span>${value(f.cust, "Customer")}</span></footer><script>document.querySelectorAll('[data-tab]').forEach(function(button){button.addEventListener('click',function(){document.querySelectorAll('[data-tab]').forEach(function(item){item.classList.remove('active')});document.querySelectorAll('.tab-panel').forEach(function(panel){panel.classList.remove('active')});button.classList.add('active');document.getElementById(button.dataset.tab).classList.add('active')})});</script></body></html>`;
  return source.replaceAll(/\[\[[^\]]+\]\]/g, "Not yet confirmed");
}
