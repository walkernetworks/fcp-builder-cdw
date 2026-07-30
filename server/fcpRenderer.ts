import type { EngagementDocument, HardwarePlatformAssessment, Timeline, TimelineBar, TimelineLane } from "../shared/fcp";
import { calculateEntitlementEndDate, colorForWorkstreamType, FIXED_GANTT_CATEGORIES, getHclSchedulePath, validateTimeline, WORKSTREAM_TYPES, WORKSTREAM_TYPE_COLORS } from "../shared/fcp";
import { HCL_ESTATE_LIMITATION, HCL_EVALUATION_VERSION, HCL_OFFLINE_LIMITATION, hclFindingSeverityLabel, hclStatusLabel } from "../shared/hcl";

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


function value(input: unknown, fallback = "Not Yet Confirmed") {
  const text = String(input ?? "").trim();
  return esc(text || fallback);
}

function number(input: number, fallback = "—") {
  return Number.isFinite(input) && input > 0 ? input.toLocaleString() : fallback;
}

function normalizeHostGroupText(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

function money(input: number, fallback = "Not Yet Confirmed") {
  return Number.isFinite(input) && input > 0
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(input)
    : fallback;
}

function timelineWindow(timeline: Timeline, column: number, boundary = false) {
  const index = boundary ? Math.max(0, column - 2) : Math.max(0, column - 1);
  return timeline.columns[index] || "Plan End";
}

function renderBar(activity: TimelineBar, totalColumns: number, workstreamType: TimelineLane["workstreamType"], track = 0) {
  const color = palette[colorForWorkstreamType(workstreamType)] || palette.slate;
  const start = Math.max(1, Math.min(totalColumns, activity.startCol));
  const end = Math.max(start + 1, Math.min(totalColumns + 1, activity.endCol));
  return `<div class="timeline-bar ${activity.deferred ? "deferred" : ""}" style="grid-column:${start}/${end};grid-row:${track + 1};align-self:center;background:${color.bg};color:${color.fg};border-color:${color.border}" title="${esc(workstreamType)}: ${esc(activity.label)}${activity.outcome ? `&#10;Intended outcome: ${esc(activity.outcome)}` : ""}${activity.dependsOn ? `&#10;${esc(activity.dependsOn)}` : ""}">${activity.milestone ? "◆ " : ""}${esc(activity.label)}</div>`;
}

function renderWorkstreamLegend() {
  return `<div class="timeline-legend"><span>Workstream color key</span>${WORKSTREAM_TYPES.map(type => { const color = palette[WORKSTREAM_TYPE_COLORS[type]] || palette.slate; return `<span class="timeline-legend-item" style="border-color:${color.border};background:${color.bg};color:${color.fg}"><i></i>${esc(type)}</span>`; }).join("")}</div>`;
}

function groupTimelineLanes(lanes: TimelineLane[]) {
  const groups = new Map<TimelineLane["category"], TimelineLane[]>();
  lanes.forEach(lane => {
    const existing = groups.get(lane.category);
    if (existing) existing.push(lane);
    else groups.set(lane.category, [lane]);
  });
  return FIXED_GANTT_CATEGORIES.map(category => ({ category, lanes: groups.get(category) || [] }));
}

type CategoryActivity = { lane: TimelineLane; activity: TimelineBar; track: number };

function layoutCategoryActivities(lanes: TimelineLane[]): CategoryActivity[] {
  const trackEnds: number[] = [];
  return lanes
    .flatMap(lane => lane.bars.map(activity => ({ lane, activity })))
    .sort((left, right) => left.activity.startCol - right.activity.startCol || left.activity.endCol - right.activity.endCol || left.activity.label.localeCompare(right.activity.label))
    .map(item => {
      const availableTrack = trackEnds.findIndex(endCol => endCol <= item.activity.startCol);
      const track = availableTrack === -1 ? trackEnds.length : availableTrack;
      trackEnds[track] = item.activity.endCol;
      return { ...item, track };
    });
}

function renderTimeline(timeline: Timeline, emptyMessage = "No activities have been scheduled for this portion of the plan.") {
  if (!timeline.lanes.length) return `<div class="timeline-empty">${esc(emptyMessage)}</div>`;
  const columnWidth = timeline.cadence === "week" ? 112 : 92;
  const minimumWidth = 180 + timeline.columns.length * columnWidth;
  const categoryGroups = groupTimelineLanes(timeline.lanes);
  return `${renderWorkstreamLegend()}<div class="timeline-wrap"><div class="timeline-grid" style="min-width:${minimumWidth}px;grid-template-columns:180px repeat(${timeline.columns.length},minmax(${columnWidth}px,1fr))"><div class="timeline-corner">Category</div>${timeline.columns.map(window => `<div class="timeline-head">${esc(window)}</div>`).join("")}${categoryGroups.map(group => {
    const activities = layoutCategoryActivities(group.lanes);
    const trackCount = Math.max(1, ...activities.map(item => item.track + 1));
    return `<div class="timeline-lane timeline-category-lane"><strong>${esc(group.category)}</strong></div><div class="timeline-row timeline-category-row" style="grid-column:2/${timeline.columns.length + 2};grid-template-columns:repeat(${timeline.columns.length},1fr);grid-template-rows:repeat(${trackCount},minmax(42px,1fr));min-height:${Math.max(64, trackCount * 50 + 10)}px">${activities.map(({ lane, activity, track }) => renderBar(activity, timeline.columns.length, lane.workstreamType, track)).join("")}</div>`;
  }).join("")}</div></div>`;
}

function sliceTimeline(timeline: Timeline, startColumn: number, endColumn: number): Timeline {
  return {
    ...timeline,
    columns: timeline.columns.slice(startColumn - 1, endColumn),
    lanes: timeline.lanes.map(lane => ({
      ...lane,
      bars: lane.bars.flatMap(activity => {
        const start = Math.max(activity.startCol, startColumn);
        const end = Math.min(activity.endCol, endColumn + 1);
        if (end <= start) return [];
        return [{ ...activity, startCol: start - startColumn + 1, endCol: end - startColumn + 1 }];
      }),
    })).filter(lane => lane.bars.length > 0),
  };
}

function renderTwoYearNotional(document: EngagementDocument) {
  const timeline = document.twoYearPlan;
  const plannedProjectStart = timeline.startDate || document.fields.plannedProjectStart || document.fields.targetStart || document.fields.entitlementStart || "TBD";
  const entitlementEnd = calculateEntitlementEndDate(document.fields.entitlementStart) || document.fields.entitlementEnd || timeline.columns[timeline.columns.length - 1] || "TBD";
  return `<div class="notional-year-sheet notional-year-one"><div class="section-title"><h2>Entitlement Notional</h2></div><div class="notice notional-intro"><strong>Entitlement-period delivery view:</strong> This monthly view starts with the planned delivery mobilisation date and ends at the calculated entitlement end date. It includes only service delivery, governance, lifecycle, handover, and selected expansion work that can be completed within that period; it is a planning recommendation, not a commitment of services.</div><div class="notional-year-heading"><span>Planned Delivery Start Through Entitlement End</span><h3>Entitlement-Aligned Delivery Outlook</h3><p>Delivery is scheduled from ${esc(plannedProjectStart)} through ${esc(entitlementEnd)}. The opening and closing month labels show the actual partial-month boundaries so the view can be read as an entitlement-bounded delivery sequence.</p></div>${renderTimeline(timeline, "No entitlement-period activities are currently scheduled.")}</div>`;
}

function renderSequence(timeline: Timeline) {
  const unit = timeline.cadence === "week" ? "Week" : "Month";
  const categoryGroups = groupTimelineLanes(timeline.lanes);
  return `<table><thead><tr><th>Activity</th><th>Start ${unit}</th><th>End ${unit}</th><th>Intended Outcome</th><th>Sequence Notes</th></tr></thead><tbody>${categoryGroups.map(group => `<tr class="sequence-category"><th colspan="5" style="background:#10233f;color:#fff;text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:8px 10px">${esc(group.category)}</th></tr>${group.lanes.flatMap(lane => lane.bars.map(activity => `<tr><td><span class="dot" style="background:${(palette[colorForWorkstreamType(lane.workstreamType)] || palette.slate).bg}" title="${esc(lane.workstreamType)}" aria-label="${esc(lane.workstreamType)}"></span>${esc(activity.label)}</td><td>${esc(timelineWindow(timeline, activity.startCol))}</td><td>${esc(timelineWindow(timeline, activity.endCol, true))}</td><td>${esc(activity.outcome || "—")}</td><td>${esc(activity.dependsOn || "—")}</td></tr>`)).join("")}`).join("")}</tbody></table>`;
}

function renderHclEstateEvidence(document: EngagementDocument) {
  const assessment = document.readiness.hcl;
  const path = document.readiness.hclSchedulePath || getHclSchedulePath(document.inventory);
  const pathDetail = {
    green: "No blocker or warning was identified in imported RVTools-observable evidence; explicit coverage gaps still require follow-up.",
    yellow: "Remediation or verification work must be sequenced before the platform gate.",
    red: "A blocker requires a procurement, migration, or design decision before the platform gate.",
    unresolved: "Collect RVTools evidence to establish the estate-level HCL delivery path.",
  }[path];
  const severityStyle = (severity: string) => ({
    BLOCKER: "background:#fef2f2;color:#991b1b;border-color:#fecaca",
    WARNING: "background:#fffbeb;color:#92400e;border-color:#fde68a",
    ADVISORY: "background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe",
    INFO: "background:#f8fafc;color:#475569;border-color:#cbd5e1",
  })[severity] || "background:#f8fafc;color:#475569;border-color:#cbd5e1";
  const findingRows = assessment.findings.length
    ? assessment.findings.map(finding => `<tr><td><span class="readiness-status" style="${severityStyle(finding.severity)}">${esc(hclFindingSeverityLabel(finding.severity))}</span><br><small>${esc(finding.checkId)} · ${esc(finding.scope)}</small></td><td><strong>${esc(finding.title)}</strong><br><small>${esc(finding.subject)}${finding.cluster ? ` · ${esc(finding.cluster)}` : ""}</small></td><td>${esc(finding.evidence)}${finding.source ? `<br><small>Source: ${esc(finding.source)}</small>` : ""}</td><td>${esc(finding.remediation)}</td></tr>`).join("")
    : '<tr><td colspan="4">No detailed estate evidence is available. Upload the applicable RVTools worksheets to evaluate the supported HCL 2.0 check families.</td></tr>';
  const coverageRows = assessment.coverageGaps.length
    ? assessment.coverageGaps.map(gap => `<tr><td><strong>${esc(gap.kind.replace(/-/g, " "))}</strong></td><td>${esc(gap.subject)}</td><td>${esc(gap.impact)}</td></tr>`).join("")
    : '<tr><td colspan="3">No coverage gaps were recorded from the supplied estate evidence.</td></tr>';
  const blockers = assessment.findings.filter(finding => finding.severity === "BLOCKER").length;
  const warnings = assessment.findings.filter(finding => finding.severity === "WARNING").length;
  return `<div class="hardware-table-panel hcl-estate-evidence"><div class="table-heading"><h4>HCL 2.0 Estate Evidence and Findings</h4><p>Every RVTools-observable check family is shown with its evidence, action, and explicit coverage status.</p></div><div class="hardware-snapshot" style="margin-top:12px"><div><span>Estate delivery path</span><strong>${esc(path.toUpperCase())}</strong><small>${esc(pathDetail)}</small></div><div><span>Blockers</span><strong>${number(blockers, "0")}</strong></div><div><span>Warnings</span><strong>${number(warnings, "0")}</strong></div><div><span>Coverage gaps</span><strong>${number(assessment.coverageGaps.length, "0")}</strong></div></div><table class="compact-table hardware-table" style="margin-top:12px"><thead><tr><th>Severity / check</th><th>Finding</th><th>Observed evidence</th><th>Required action</th></tr></thead><tbody>${findingRows}</tbody></table><div class="table-heading" style="margin-top:18px"><h4>Coverage Gaps and Evidence Required</h4><p>A gap is not a passing result; it identifies a check unavailable from the import or supplied offline archive.</p></div><table class="compact-table hardware-table"><thead><tr><th>Gap category</th><th>Subject</th><th>Impact / next evidence</th></tr></thead><tbody>${coverageRows}</tbody></table><p style="margin:12px 0 0;font-size:10px;line-height:1.5;color:#475569">Estate HCL limitation: ${esc(HCL_ESTATE_LIMITATION)}</p></div>`;
}

function renderObservedInventory(document: EngagementDocument) {
  const inventory = document.inventory;
  const path = getHclSchedulePath(inventory);
  const pathDetail = { green: "Green baseline alignment", yellow: "Yellow remediation and verification", red: "Red procurement or greenfield provisioning", unresolved: "Unresolved evidence collection" }[path];
  const groups = new Map<string, {
    vendor: string;
    model: string;
    hosts: number;
    physicalCores: number;
    cpuModels: Set<string>;
    esxiVersions: Map<string, number>;
    clusters: Map<string, number>;
    minimumMemoryGiB: number | null;
    maximumMemoryGiB: number | null;
    statuses: Set<string>;
    hclChecks: Map<string, { status: HardwarePlatformAssessment["hcl"]["status"]; hosts: number; cpuSeries: string; detailUrl: string; matchedPartnerName: string; matchedModel: string; detail: string }>;
  }>();

  for (const platform of document.readiness.hardwarePlatforms) {
    const vendor = normalizeHostGroupText(platform.vendor) || "Unknown vendor";
    const model = normalizeHostGroupText(platform.model) || "Unknown model";
    const key = `${vendor}::${model}`.toLowerCase();
    const group = groups.get(key) || {
      vendor,
      model,
      hosts: 0,
      physicalCores: 0,
      cpuModels: new Set<string>(),
      esxiVersions: new Map<string, number>(),
      clusters: new Map<string, number>(),
      minimumMemoryGiB: null,
      maximumMemoryGiB: null,
      statuses: new Set<string>(),
      hclChecks: new Map(),
    };
    group.hosts += platform.hosts;
    group.physicalCores += platform.physicalCores;
    if (platform.cpuModel && platform.cpuModel !== "Unknown CPU") group.cpuModels.add(platform.cpuModel);
    for (const version of platform.esxiVersions) group.esxiVersions.set(version.version, (group.esxiVersions.get(version.version) || 0) + version.hosts);
    for (const cluster of platform.clusterMembership) group.clusters.set(cluster.name, (group.clusters.get(cluster.name) || 0) + cluster.hosts);
    if (platform.minimumMemoryGiB > 0) {
      group.minimumMemoryGiB = group.minimumMemoryGiB === null ? platform.minimumMemoryGiB : Math.min(group.minimumMemoryGiB, platform.minimumMemoryGiB);
      group.maximumMemoryGiB = Math.max(group.maximumMemoryGiB || 0, platform.maximumMemoryGiB || platform.minimumMemoryGiB);
    }
    group.statuses.add(platform.status);
    const hclKey = [platform.hcl.status, platform.hcl.matchedCpuSeries, platform.hcl.matchedPartnerName, platform.hcl.matchedModel, platform.hcl.detailUrl].join("|");
    const hclCheck = group.hclChecks.get(hclKey) || { status: platform.hcl.status, hosts: 0, cpuSeries: platform.hcl.matchedCpuSeries, detailUrl: platform.hcl.detailUrl, matchedPartnerName: platform.hcl.matchedPartnerName, matchedModel: platform.hcl.matchedModel, detail: platform.hcl.detail };
    hclCheck.hosts += platform.hosts;
    group.hclChecks.set(hclKey, hclCheck);
    groups.set(key, group);
  }

  const platformRows = Array.from(groups.values())
    .sort((left, right) => right.hosts - left.hosts || left.model.localeCompare(right.model))
    .map(group => {
      const esxiEvidence = Array.from(group.esxiVersions.entries()).map(([version, hosts]) => `${version}: ${hosts}`).join("; ") || "Not reported";
      const clusterEvidence = Array.from(group.clusters.entries()).map(([name, hosts]) => `${name}: ${hosts}`).join("; ") || "Not reported";
      const memoryEvidence = group.minimumMemoryGiB !== null ? `${group.minimumMemoryGiB.toLocaleString()}–${(group.maximumMemoryGiB || group.minimumMemoryGiB).toLocaleString()} GiB per host` : "Not reported";
      const cpuEvidence = Array.from(group.cpuModels).join("; ") || "CPU model not reported";
      const deliveryContext = group.statuses.has("upgrade-required")
        ? "Plan refresh or exception work before platform services."
        : group.statuses.has("unavailable")
          ? "Capture missing server and CPU details from the source estate."
          : "Use the observed model and configuration details in delivery design.";
      const hclEvidence = Array.from(group.hclChecks.values()).map(check => {
        const matched = check.matchedPartnerName && check.matchedModel ? `${check.matchedPartnerName} ${check.matchedModel}` : "No deterministic HCL model match";
        const series = check.cpuSeries ? ` · ${check.cpuSeries}` : "";
        const link = check.detailUrl ? `<br><a href="${esc(check.detailUrl)}">Open matched HCL record</a>` : "";
        return `<strong>${esc(hclStatusLabel(check.status))}</strong><br><small>${check.hosts} host${check.hosts === 1 ? "" : "s"} · ${esc(matched + series)}</small>${link}`;
      }).join("<hr style=\"border:0;border-top:1px solid #e2e8f0;margin:7px 0\">") || "No HCL evidence";
      return `<tr><td><strong>${esc(`${group.vendor} ${group.model}`)}</strong><br><small>${esc(cpuEvidence)}</small></td><td>${group.hosts} host${group.hosts === 1 ? "" : "s"}</td><td>${esc(esxiEvidence)}</td><td>${esc(clusterEvidence)}<br><small>${esc(memoryEvidence)}</small></td><td>${hclEvidence}</td><td>${esc(deliveryContext)}</td></tr>`;
    }).join("") || '<tr><td colspan="6">No usable host vendor and model data were found in the RVTools export.</td></tr>';
  const esxiRows = inventory.esxiVersions.length
    ? inventory.esxiVersions.map(row => `<tr><td>${esc(row.version)}</td><td>${row.hosts}</td></tr>`).join("")
    : '<tr><td colspan="2">Not reported</td></tr>';
  return `<section class="hardware-evidence"><div class="hardware-heading"><div><span class="hardware-eyebrow">Current estate and offline HCL evidence</span><h3>Observed host inventory</h3></div><p>Consolidated RVTools host, software, cluster, and memory fields, with a local ESXi 9.1 server-and-CPU snapshot precheck.</p></div><div class="hardware-snapshot"><div><span>${esc(HCL_EVALUATION_VERSION)} delivery path</span><strong>${esc(path.toUpperCase())}</strong><small>${esc(pathDetail)}</small></div><div><span>Observed ESXi hosts</span><strong>${number(inventory.hosts)}</strong></div><div><span>Host groups</span><strong>${number(groups.size, "0")}</strong></div><div><span>Reported ESXi releases</span><strong>${number(inventory.esxiVersions.length, "0")}</strong></div></div><div class="hardware-tables"><div class="hardware-table-panel"><div class="table-heading"><h4>Reported ESXi Versions</h4><p>Imported from RVTools</p></div><table class="compact-table esxi-table"><thead><tr><th>Reported Version</th><th>Hosts</th></tr></thead><tbody>${esxiRows}</tbody></table></div><div class="hardware-table-panel"><div class="table-heading"><h4>VCF 9.1 Delivery Inventory</h4><p>Consolidated host groups with offline HCL server-and-CPU evidence</p></div><table class="compact-table hardware-table"><thead><tr><th>Observed Host Group</th><th>Estate</th><th>Reported ESXi</th><th>Cluster / Memory</th><th>HCL Server + CPU Evidence</th><th>Delivery Context</th></tr></thead><tbody>${platformRows}</tbody></table><p style="margin:12px 0 0;font-size:10px;line-height:1.5;color:#475569">Offline HCL limitation: ${esc(HCL_OFFLINE_LIMITATION)}</p></div></div>${renderHclEstateEvidence(document)}</section>`;
}

function selectedScopeSummary(document: EngagementDocument) {
  const { priorities, adoptionDetails } = document.fields;
  const scope: string[] = [];
  if (priorities.includes("operations") || adoptionDetails.operations.length) scope.push("operations and lifecycle management");
  if (priorities.includes("automation") || adoptionDetails.automation.length) scope.push("automation and self-service foundations");
  if (priorities.includes("networking") || adoptionDetails.networking.length) scope.push("the explicitly selected VCF networking and NSX scope");
  if (priorities.includes("security") || adoptionDetails.security.length) scope.push("security and segmentation controls");
  if (priorities.includes("resilience") || adoptionDetails.resilience.length) scope.push("resilience and recovery planning");
  if (priorities.includes("kubernetes") || adoptionDetails.kubernetes.length) scope.push("Kubernetes and workload-domain enablement");
  if (priorities.includes("private-ai") || adoptionDetails.privateAi.length) scope.push("private AI enablement");

  const deliveryPath = {
    "migration-waves": "controlled migration waves",
    "new-build": "a new platform build",
    "in-place": "an in-place modernization path",
    "design-only": "architecture and implementation-ready design work",
    undecided: "a delivery path still to be confirmed",
  }[adoptionDetails.upgradePath];

  const selected = scope.length ? scope.join(", ").replace(/, ([^,]*)$/, " and $1") : "the selected operational priorities";
  return `The plan is framed around ${selected}, with ${deliveryPath}.`;
}

function renderPlanSummary(document: EngagementDocument) {
  const f = document.fields;
  const i = document.inventory;
  const cadence = f.adoptionCadence === "week" ? "weekly execution windows" : "calendar-month execution windows";
  const plannedStart = f.plannedProjectStart || f.targetStart || f.entitlementStart || "TBD";
  const entitlementEnd = calculateEntitlementEndDate(f.entitlementStart) || f.entitlementEnd || "TBD";
  const vmFootprint = i.vmCount > 0 ? `${i.vmCount.toLocaleString()} virtual machine${i.vmCount === 1 ? "" : "s"}` : "the virtual-machine total requires refreshed estate evidence";
  const hostFootprint = i.hosts > 0 ? `${i.hosts.toLocaleString()} ESXi host${i.hosts === 1 ? "" : "s"}` : "the ESXi-host total requires refreshed estate evidence";
  const reportedEsxi = i.esxiVersions.length ? i.esxiVersions.map(row => `${row.version} (${row.hosts} host${row.hosts === 1 ? "" : "s"})`).join("; ") : "not reported in the imported RVTools vHost rows";
  const items = [
    ["Customer delivery context", `${f.customerName || "The customer"} is preparing a VCF adoption focused on delivering the confirmed platform outcomes through a sequenced implementation, operating-model transition, and service handover. Estate evidence informs delivery conditions and validation; it does not define the customer story or completion measure.`],
    ["Observed footprint", `${vmFootprint} across ${hostFootprint}, ${i.clusters || "unconfirmed"} clusters, and ${i.datacenters || "unconfirmed"} datacenters. Reported ESXi: ${reportedEsxi}.`],
    ["Selected scope", selectedScopeSummary(document)],
    ["Entitlement Notional", `${money(f.entitlementAmount)} is available through ${entitlementEnd}. This entitlement-bounded view begins at the planned project start (${plannedStart}) and retains only work scheduled within the entitlement period.`],
    ["Operational Adoption Timeline", `A two-year operational planning horizon begins ${plannedStart} and uses ${cadence}. Multiple independently typed workstreams may run concurrently within the same category.`],
  ];
  return `<div class="plan-summary">${items.map(([heading, body], index) => `<article><span class="summary-index">${String(index + 1).padStart(2, "0")}</span><div><h3>${esc(heading)}</h3><p>${esc(body)}</p></div></article>`).join("")}</div>`;
}

function renderExecutiveSummary(title: string, document: EngagementDocument, errors: string[]) {
  const f = document.fields;
  const i = document.inventory;
  const cadence = f.adoptionCadence === "week" ? "weekly execution windows" : "calendar-month execution windows";
  const plannedProjectStart = f.plannedProjectStart || f.targetStart || f.entitlementStart || "TBD";
  const entitlementEnd = calculateEntitlementEndDate(f.entitlementStart) || f.entitlementEnd || "TBD";
  const esxiSummary = i.esxiVersions.length ? i.esxiVersions.map(row => `${row.version} · ${row.hosts} host${row.hosts === 1 ? "" : "s"}`).join("; ") : "Not reported";
  const vmFootprint = i.vmCount > 0 ? `${i.vmCount.toLocaleString()} virtual machine${i.vmCount === 1 ? "" : "s"}` : "a virtual-machine total that requires refreshed estate evidence";
  const hostFootprint = i.hosts > 0 ? `${i.hosts.toLocaleString()} ESXi host${i.hosts === 1 ? "" : "s"}` : "an ESXi-host total that requires refreshed estate evidence";
  const customerSynopsis = `${f.customerName || title} is preparing a delivery-led VCF adoption that converts confirmed outcomes into an implementation sequence, operating-model transition, and service handover. ${selectedScopeSummary(document)} Delivery planning is informed by a current-state estate view used as supporting evidence and validation context, rather than as a completion measure.`;
  const validationMessage = errors.length
    ? `<div class="notice"><strong>Timeline details needed:</strong> ${errors.map(esc).join(" ")}</div>`
    : '<div class="notice"><strong>Timeline validation:</strong> The current plan is within the configured timeline bounds. Confirm sequencing and prerequisites with the customer before delivery.</div>';
  return `<section class="executive-sheet"><div class="sheet-header"><span class="sheet-kicker">Executive snapshot</span><h2>Functional Consumption Plan</h2><p>A delivery-focused view of confirmed service outcomes, entitlement-bounded execution, and the operational adoption horizon.</p></div><div class="executive-facts"><div><span>Entitlement value</span><strong>${money(f.entitlementAmount, "—")}</strong><small>${value(f.entitlementStart)} to ${value(entitlementEnd)}</small></div><div><span>Observed footprint</span><strong>${i.vmCount > 0 ? `${number(i.vmCount)} VM records` : "Needs re-import"}</strong><small>${i.hosts > 0 ? `${number(i.hosts)} ESXi hosts` : "vHost evidence required"}</small></div><div><span>Reported ESXi</span><strong>${i.esxiVersions.length ? `${i.esxiVersions.length} release${i.esxiVersions.length === 1 ? "" : "s"}` : "Not reported"}</strong><small>${esc(esxiSummary)}</small></div><div><span>Delivery posture</span><strong>Implementation-led</strong><small>Estate evidence supports validation</small></div></div><div class="executive-columns"><article class="editorial-block"><span class="block-label">Customer background</span><h3>${value(f.customerName, title)}</h3><p>${esc(customerSynopsis)}</p><dl class="estate-list"><div><dt>Location</dt><dd>${value(f.location)}</dd></div><div><dt>Delivery focus</dt><dd>Implementation sequencing, operating-model transition, lifecycle enablement, and service handover</dd></div><div><dt>Planning basis</dt><dd>Entitlement-bounded execution with a two-year operational adoption horizon</dd></div></dl></article><article class="editorial-block emphasis"><span class="block-label">Plan synopsis</span><h3>Customer-aligned delivery plan</h3><p>${esc(selectedScopeSummary(document))}</p><div class="planning-callout"><strong>Entitlement Notional:</strong> this entitlement-bounded view runs from the planned project start (${esc(plannedProjectStart)}) through ${esc(entitlementEnd)} and retains only scheduled work that fits within the entitlement period.</div><div class="planning-callout"><strong>Operational Adoption Timeline:</strong> this is the two-year operational horizon beginning ${esc(plannedProjectStart)}. It uses ${esc(cadence)} and may show concurrent, independently typed workstreams in the same category.</div></article></div><div class="sheet-footer"><span>Prepared for ${value(f.customerName, title)}</span><span>${cadence} · delivery planning view</span></div></section><section class="summary-plan"><div class="section-title"><h2>Plan on a Page</h2></div><p class="section-intro">The plan translates selected service outcomes into delivery work, using estate evidence only to inform planning conditions and validation.</p><div class="section-divider"></div><div class="section-title compact"><h2>Customer and Delivery Summary</h2></div>${renderPlanSummary(document)}<div class="section-title compact"><h2>Timeline Validation</h2></div>${validationMessage}<div class="sheet-footer"><span>Functional Consumption Plan · Plan on a Page</span><span>Internal planning document</span></div></section>`;
}

export function renderFcpHtml(title: string, document: EngagementDocument) {
  const f = document.fields;
  const i = document.inventory;
  const calculatedEntitlementEnd = calculateEntitlementEndDate(f.entitlementStart) || f.entitlementEnd;
  const errors = [...validateTimeline(document.adoptionTimeline), ...validateTimeline(document.twoYearPlan)];
  const includeVcfReadiness = document.fields.exportPreferences.includeVcfReadiness;
  const readinessNavigation = includeVcfReadiness ? '<button data-tab="considerations">VCF 9.1 Readiness</button>' : "";
  const readinessPanel = includeVcfReadiness
    ? `<section id="considerations" class="panel"><div class="certification-page"><div class="section-title"><h2>VCF 9.1 Host Inventory</h2></div><p class="section-intro">A consolidated view of the host, software, cluster, and memory details imported from RVTools for the delivery plan.</p>${renderObservedInventory(document)}</div></section>`
    : "";
  const source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
:root{--cdw:#c8102e;--cdw-dark:#a80922;--navy:#10233f;--navy-deep:#07182d;--ink:#172033;--muted:#64748b;--line:#dbe2ea;--soft-line:#e9eef3;--surface:#f5f7fa;--paper:#ffffff;--soft:#f7f9fc}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Arial,"Helvetica Neue",sans-serif;color:var(--ink);background:var(--surface);line-height:1.45}.mast{height:58px;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 30px;border-bottom:1px solid var(--line)}.logo{font-weight:900;font-size:28px;letter-spacing:-2px;color:var(--cdw)}.conf{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.cover{position:relative;overflow:hidden;background:linear-gradient(125deg,#08182c 0%,#102f50 64%,#193d63 100%);color:#fff;padding:48px 48px 40px;min-height:340px;border-bottom:5px solid var(--cdw);display:flex;flex-direction:column;justify-content:space-between}.cover:after{content:"";position:absolute;width:360px;height:360px;right:-136px;bottom:-170px;border:1px solid #ffffff2b;border-radius:50%;box-shadow:0 0 0 42px #ffffff0b,0 0 0 84px #ffffff08}.cover-brand,.cover-footer{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between}.cover-brand{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#b8cae0}.cover-content{position:relative;z-index:1;max-width:850px;margin:44px 0 28px}.cover-kicker{display:block;margin-bottom:11px;font-size:12px;letter-spacing:.17em;text-transform:uppercase;color:#c9d9e9}.cover h1{font-size:42px;line-height:1.08;letter-spacing:-.035em;margin:0 0 15px;max-width:720px}.cover-purpose{max-width:780px;margin:0;color:#d9e4f0;font-size:17px;line-height:1.5}.cover-meta{position:relative;z-index:1;display:flex;gap:9px;flex-wrap:wrap}.cover-meta span{border:1px solid #ffffff30;background:#ffffff0d;border-radius:999px;padding:7px 11px;font-size:12px}.cover-footer{font-size:11px;color:#c7d5e3;letter-spacing:.04em}.tabs{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid var(--line);display:flex;padding:0 30px;box-shadow:0 4px 16px #0f233e0d;overflow-x:auto}.tabs button{border:0;background:none;padding:16px 18px;font-weight:700;color:#64748b;cursor:pointer;border-bottom:3px solid transparent;white-space:nowrap}.tabs button.active{color:var(--cdw);border-color:var(--cdw)}main{max-width:1500px;margin:0 auto;padding:32px 30px 68px}.panel{display:none}.panel.active{display:block}.executive-sheet,.summary-plan{background:var(--paper);border:1px solid var(--line);box-shadow:0 12px 32px #0f233e0c;padding:32px}.sheet-header{max-width:760px}.sheet-kicker,.block-label{display:block;font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--cdw);margin-bottom:9px}.sheet-header h2{font-size:30px;letter-spacing:-.025em;margin:0 0 9px;color:var(--navy)}.sheet-header p{font-size:15px;color:#475569;margin:0}.executive-facts{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:29px 0 30px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.executive-facts>div{padding:17px 17px 16px;border-right:1px solid var(--line)}.executive-facts>div:last-child{border-right:0}.executive-facts span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:8px}.executive-facts strong{display:block;font-size:23px;line-height:1.05;color:var(--navy)}.executive-facts small{display:block;color:var(--muted);font-size:11px;margin-top:5px}.executive-columns{display:grid;grid-template-columns:1fr 1.08fr;gap:44px}.editorial-block{border-top:3px solid var(--navy);padding-top:15px}.editorial-block.emphasis{border-top-color:var(--cdw)}.editorial-block h3{font-size:20px;letter-spacing:-.015em;margin:0 0 11px;color:var(--navy)}.editorial-block p{margin:0;color:#405066;font-size:14px}.estate-list{margin:0;display:grid;gap:0}.estate-list div{padding:10px 0;border-top:1px solid var(--soft-line)}.estate-list div:first-child{border-top:0}.estate-list dt{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:3px}.estate-list dd{margin:0;font-size:13px;color:#334155}.planning-callout{margin-top:15px;padding:13px 15px;border-left:3px solid var(--cdw);background:#fff7f8;color:#475569;font-size:12px;line-height:1.5}.sheet-footer{display:flex;justify-content:space-between;gap:16px;margin-top:31px;padding-top:13px;border-top:1px solid var(--line);font-size:10px;color:var(--muted);letter-spacing:.04em;text-transform:uppercase}.summary-plan{margin-top:22px}.section-title{display:flex;align-items:center;gap:10px;margin:30px 0 14px}.section-title:first-child{margin-top:0}.section-title:before{content:"";width:4px;height:26px;border-radius:3px;background:var(--cdw)}.section-title h2{font-size:21px;margin:0;color:var(--navy);letter-spacing:-.01em}.section-title.compact{margin:25px 0 12px}.section-intro{max-width:730px;margin:0;color:#536274;font-size:14px}.section-divider{height:1px;background:var(--line);margin:24px 0}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpi,.card{background:#fff;border:1px solid var(--line);border-radius:6px;box-shadow:none}.kpi{padding:18px}.kpi small{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.kpi strong{font-size:25px;display:block;margin-top:7px;color:var(--navy)}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}.card{padding:20px}.card p{margin:8px 0;color:#3e4c5f}.notice{border-left:4px solid var(--cdw);background:#fff7f8;padding:14px 16px;margin-top:14px;font-size:13px}.progress{height:8px;background:#e7ebf0;overflow:hidden}.progress span{display:block;height:100%;background:var(--cdw)}.plan-inputs-strip{padding:18px 20px;border:1px solid var(--line);border-top:3px solid var(--navy);background:#fff}.plan-inputs-strip p{margin:10px 0 0;font-size:13px;color:#516074}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);font-size:12px}th{text-align:left;background:#eef2f6;color:#334155;padding:10px}td{padding:10px;border-top:1px solid #edf0f4;vertical-align:top}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px}.certification-page{max-width:1260px}.certification-page>.section-intro{max-width:900px;margin-bottom:20px}.readiness-evidence{border:1px solid var(--line);border-top:3px solid var(--navy);overflow-x:auto}.readiness-table{border:0;font-size:11px}.readiness-table th{background:#f0f3f7;font-size:10px;letter-spacing:.03em}.readiness-table td{padding:8px 10px;color:#405066}.readiness-table td:first-child{color:var(--navy);width:24%}.readiness-table td:nth-child(2){width:12%}.readiness-table td:nth-child(3){width:28%;color:var(--muted)}.readiness-status{display:inline-block;border-radius:999px;padding:3px 6px;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;background:#eef2f6;color:#475569}.readiness-status.good{background:#ecfdf3;color:#166534}.readiness-status.attention{background:#fff1f2;color:#be123c}.readiness-status.info{background:#eff6ff;color:#1d4ed8}.planning-boundary{margin-top:10px;padding:10px 12px;border-left:3px solid var(--cdw);background:#fff7f8;font-size:11px;line-height:1.4;color:#475569}.hardware-evidence{margin-top:20px;padding-top:13px;border-top:2px solid var(--navy)}.hardware-heading{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.45fr);gap:24px;align-items:end}.hardware-eyebrow{display:block;margin-bottom:4px;color:var(--cdw);font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.hardware-heading h3{margin:0;color:var(--navy);font-size:18px;letter-spacing:-.01em}.hardware-heading p{margin:0;color:var(--muted);font-size:11px;line-height:1.45}.hardware-snapshot{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:13px 0 14px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.hardware-snapshot>div{padding:9px 11px;border-right:1px solid var(--line)}.hardware-snapshot>div:last-child{border-right:0}.hardware-snapshot span{display:block;color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase}.hardware-snapshot strong{display:block;margin-top:4px;color:var(--navy);font-size:17px;line-height:1}.hardware-tables{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,2.2fr);gap:18px}.hardware-table-panel{padding-top:8px;border-top:1px solid var(--line)}.table-heading{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px}.table-heading h4{margin:0;color:var(--navy);font-size:11px}.table-heading p{margin:0;color:var(--muted);font-size:9px}.compact-table{table-layout:fixed;border:0;font-size:10px}.compact-table th{padding:6px 7px;background:#f0f3f7;font-size:9px;line-height:1.2}.compact-table td{padding:6px 7px;line-height:1.28}.compact-table small{display:block;margin-top:2px;color:var(--muted);font-size:9px;line-height:1.25}.hardware-table th:nth-child(1){width:16%}.hardware-table th:nth-child(2){width:9%}.hardware-table th:nth-child(3){width:16%}.hardware-table th:nth-child(4){width:16%}.hardware-table th:nth-child(5){width:20%}.hardware-table th:nth-child(6){width:23%}.timeline-legend{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 9px;font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}.timeline-legend-item{display:inline-flex;align-items:center;gap:4px;border:1px solid;border-radius:999px;padding:4px 6px;font-size:8px;line-height:1;font-weight:800;letter-spacing:0;text-transform:none}.timeline-legend-item i{display:inline-block;width:6px;height:6px;border-radius:999px;background:currentColor;opacity:.55}.timeline-wrap{overflow-x:auto;border:1px solid var(--line);background:#fff}.timeline-empty{border:1px solid var(--line);background:#f8fafc;color:#475569;padding:22px;font-size:13px;line-height:1.5}.timeline-grid{display:grid}.timeline-corner,.timeline-head{background:#eef2f6;font-size:11px;font-weight:700;padding:10px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.timeline-lane{padding:11px;font-size:12px;font-weight:700;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.timeline-lane strong{display:block;color:var(--navy);font-size:10px;line-height:1.25}.timeline-lane-meta{display:block;margin-top:3px;color:var(--muted);font-size:8px;font-weight:700;line-height:1.25}.timeline-row{display:grid;position:relative;min-height:54px;align-items:center;border-bottom:1px solid var(--line);background-image:linear-gradient(to right,transparent calc(100% - 1px),#e2e8f0 calc(100% - 1px));background-size:calc(100% / var(--months,12)) 100%}.timeline-bar{margin:5px 4px;padding:7px 9px;border:1px solid;border-radius:3px;font-size:10px;font-weight:700;line-height:1.25;min-height:30px;align-content:center;overflow:hidden}.timeline-bar.deferred{border-style:dashed}.notional-year-sheet{margin-top:18px}.notional-year-heading{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:12px;align-items:baseline;margin:0 0 9px;padding-bottom:9px;border-bottom:1px solid var(--line)}.notional-year-heading span{grid-row:1 / span 2;color:var(--cdw);font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.notional-year-heading h3{margin:0;color:var(--navy);font-size:15px;letter-spacing:-.01em}.notional-year-heading p{grid-column:2;margin:2px 0 0;color:var(--muted);font-size:11px;line-height:1.35}.plan-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.plan-summary article{position:relative;background:#fff;border:1px solid var(--line);border-top:3px solid var(--navy);padding:16px 16px 16px 46px;min-height:110px}.summary-index{position:absolute;left:15px;top:15px;font-size:10px;font-weight:900;letter-spacing:.08em;color:var(--cdw)}.plan-summary h3{font-size:13px;margin:0 0 7px;color:var(--navy)}.plan-summary p{font-size:11px;color:var(--muted);margin:0}.foot{padding:20px 30px;background:#0b1f37;color:#b8cae0;font-size:10px;display:flex;justify-content:space-between}@media(max-width:800px){.cover{padding:32px 24px;min-height:300px}.cover h1{font-size:32px}.executive-facts,.kpis,.grid2,.plan-summary,.executive-columns,.hardware-tables{grid-template-columns:1fr}.executive-facts>div{border-right:0;border-bottom:1px solid var(--line)}.executive-facts>div:last-child{border-bottom:0}.hardware-snapshot{grid-template-columns:1fr 1fr}.hardware-snapshot>div:nth-child(2){border-right:0}.hardware-snapshot>div:nth-child(-n+2){border-bottom:1px solid var(--line)}.hardware-heading{grid-template-columns:1fr;gap:8px}.tabs{padding:0 8px}.mast{padding:0 18px}.conf{display:none}main{padding:18px 12px}.executive-sheet,.summary-plan{padding:23px 20px}.sheet-footer{display:block}.sheet-footer span{display:block;margin-top:5px}}@media print{html,body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.executive-facts{grid-template-columns:repeat(4,minmax(0,1fr))}.executive-facts>div{border-right:1px solid var(--line);border-bottom:0}.executive-facts>div:last-child{border-right:0}.executive-columns{grid-template-columns:minmax(0,1fr) minmax(0,1.08fr)}.sheet-footer{display:flex}.sheet-footer span{display:inline;margin-top:0}main{padding:0;max-width:none;margin:0}.mast,.tabs,.foot{display:none}.cover{height:8.5in;min-height:8.5in;margin:0;padding:.68in .72in .56in;border:0;border-bottom:5px solid var(--cdw);page-break-after:always;break-after:page}.cover-content{margin:auto 0}.cover h1{font-size:42px;max-width:7.6in}.cover-purpose{font-size:16px;max-width:8.1in}.cover-meta{margin-top:.26in}.cover-footer{font-size:10px}.panel{display:block!important}.panel:not(#summary){padding:.42in .54in .5in;page-break-before:always;break-before:page}.panel#summary{display:block!important;padding:0}.executive-sheet,.summary-plan{border:0;box-shadow:none;margin:0;background:#fff;page-break-inside:avoid;break-inside:avoid}.executive-sheet{height:8.5in;min-height:8.5in;padding:.38in .60in .26in;page-break-after:always;break-after:page;display:flex;flex-direction:column;overflow:hidden}.summary-plan{height:8.5in;min-height:8.5in;margin-top:0;padding:.50in .60in .42in;page-break-after:always;break-after:page;display:flex;flex-direction:column;overflow:hidden}.summary-plan .sheet-footer{margin-top:auto}.executive-sheet .sheet-footer{margin-top:10px}.sheet-header h2{font-size:28px}.executive-sheet .sheet-header h2{font-size:26px}.executive-sheet .sheet-header p{font-size:13px}.executive-facts{margin:.28in 0 .30in}.executive-sheet .executive-facts{margin:.18in 0}.executive-sheet .executive-facts>div{padding:10px 12px}.executive-sheet .executive-facts strong{font-size:19px}.executive-sheet .executive-facts small{font-size:9px}.executive-sheet .executive-columns{gap:.28in}.executive-sheet .editorial-block{padding-top:9px}.executive-sheet .editorial-block h3{font-size:17px;margin-bottom:7px}.executive-sheet .editorial-block p{font-size:11px;line-height:1.35}.executive-sheet .estate-list div{padding:6px 0}.executive-sheet .estate-list dt{font-size:8px}.executive-sheet .estate-list dd{font-size:10px}.executive-sheet .planning-callout{margin-top:8px;padding:8px 10px;font-size:9px;line-height:1.3}.executive-facts>div{padding:15px}.executive-columns{gap:.42in}.section-title{margin:.20in 0 .12in;page-break-after:avoid;break-after:avoid}.section-title+*,.section-title+p{page-break-before:avoid;break-before:avoid}.section-intro{font-size:13px}.section-divider{margin:.20in 0}.plan-summary{gap:10px}.plan-summary article{min-height:94px;padding:14px 14px 14px 41px}.summary-index{left:13px;top:13px}.plan-inputs-strip{page-break-inside:avoid;break-inside:avoid}.card,.kpi,.timeline-wrap,.notice,.readiness-evidence,.planning-boundary,.hardware-evidence{page-break-inside:avoid;break-inside:avoid}table{page-break-inside:auto;break-inside:auto}tr{page-break-inside:avoid;break-inside:avoid}.grid2{gap:12px}.timeline-grid{min-width:1100px!important}.certification-page{max-width:none}.certification-page>.section-intro{max-width:none;margin-bottom:.14in;font-size:10px}.readiness-evidence{border-top-width:2px}.readiness-table,.compact-table{font-size:8px;table-layout:fixed}.readiness-table th,.compact-table th{padding:4px 5px;font-size:7.5px;line-height:1.2}.readiness-table td,.compact-table td{padding:4px 5px;line-height:1.22}.readiness-status{padding:2px 4px;font-size:7px}.planning-boundary{margin-top:7px;padding:7px 9px;font-size:8px;line-height:1.3}.hardware-evidence{margin-top:.13in;padding-top:.10in}.hardware-heading{gap:.28in}.hardware-heading h3{font-size:14px}.hardware-heading p{font-size:8px}.hardware-snapshot{margin:.10in 0 .11in}.hardware-snapshot>div{padding:6px 8px}.hardware-snapshot span{font-size:7px}.hardware-snapshot strong{font-size:13px}.hardware-tables{grid-template-columns:minmax(0,.8fr) minmax(0,2.2fr);gap:.18in}.hardware-table-panel{padding-top:5px}.table-heading{margin-bottom:4px}.table-heading h4{font-size:8.5px}.table-heading p{font-size:7px}.compact-table small{font-size:7px;line-height:1.18}.hardware-table th:nth-child(1){width:16%}.hardware-table th:nth-child(2){width:9%}.hardware-table th:nth-child(3){width:16%}.hardware-table th:nth-child(4){width:16%}.hardware-table th:nth-child(5){width:20%}.hardware-table th:nth-child(6){width:23%}.panel:not(#summary){padding:.30in .42in .34in}#adoption .section-title,#two-year .section-title{margin:.13in 0 .08in}#adoption .notice,#two-year .notice{margin-top:.07in;padding:8px 10px;font-size:9px;line-height:1.32}#adoption .timeline-corner,#adoption .timeline-head,#two-year .timeline-corner,#two-year .timeline-head{padding:6px 7px;font-size:8.5px}#adoption .timeline-lane,#two-year .timeline-lane{padding:7px 8px;font-size:9px}#adoption .timeline-row{min-height:40px}#two-year .timeline-row{min-height:34px}#adoption .timeline-bar{margin:3px;padding:5px 6px;min-height:23px;font-size:8px;line-height:1.15}#two-year .timeline-bar{margin:2px;padding:4px 5px;min-height:18px;font-size:7.2px;line-height:1.1}#two-year .section-intro{margin:0;font-size:9px;line-height:1.25}#two-year .notional-year-sheet{margin-top:0;page-break-inside:avoid;break-inside:avoid}#two-year .notional-year-heading{margin:0 0 .08in;padding-bottom:.07in}#two-year .notional-year-heading span{font-size:7.5px}#two-year .notional-year-heading h3{font-size:12px}#two-year .notional-year-heading p{font-size:8px}#two-year .notional-year-sheet .timeline-grid{width:100%;min-width:0!important}#two-year .notional-year-sheet .timeline-row{min-width:0!important}#two-year .two-year-sequence-sheet{page-break-before:always;break-before:page}#two-year .two-year-sequence-sheet .section-title{margin-top:0}#adoption table{font-size:7.4px}#two-year table{font-size:7px}#adoption th,#two-year th{padding:3px 4px;font-size:6.8px;line-height:1.16}#adoption td,#two-year td{padding:3px 4px;line-height:1.16}@page{size:letter landscape;margin:0}}
</style></head><body><header class="mast"><div class="logo">CDW</div><div class="conf">Confidential · Internal Planning Document</div></header><section class="cover"><div class="cover-brand"><span>CDW</span><span>Confidential · Internal Planning Document</span></div><div class="cover-content"><span class="cover-kicker">Functional Consumption Plan</span><h1>${value(f.customerName, title)}</h1><p class="cover-purpose">A service-delivery plan that translates confirmed VCF outcomes into an entitlement-bounded implementation sequence, operating-model transition, and handover roadmap.</p></div><div class="cover-meta"><span>${value(f.location)}</span><span>${money(f.entitlementAmount)}</span><span>${value(f.entitlementStart)} to ${value(calculatedEntitlementEnd)}</span><span>Service delivery &amp; handover</span><span>Selected VCF outcomes</span></div><div class="cover-footer"><span>Prepared for customer planning</span><span>Functional Consumption Plan</span></div></section><nav class="tabs"><button class="active" data-tab="summary">Executive Summary</button>${readinessNavigation}<button data-tab="two-year">Entitlement Notional</button><button data-tab="adoption">Operational Adoption Timeline</button></nav><main><section id="summary" class="panel active">${renderExecutiveSummary(title, document, errors)}</section>${readinessPanel}<section id="two-year" class="panel">${renderTwoYearNotional(document)}<div class="two-year-sequence-sheet"><div class="section-title"><h2>Entitlement-Period Service Sequence</h2></div>${renderSequence(document.twoYearPlan)}</div></section><section id="adoption" class="panel"><div class="section-title"><h2>Operational Adoption Timeline</h2></div><div class="notice"><strong>Two-year operational view:</strong> This editable delivery horizon begins on the planned project start and spans twenty-four months. It uses ${esc(document.adoptionTimeline.cadence === "week" ? "weekly windows to support mid-month starts" : "calendar-month windows for a high-level execution plan")} and may contain concurrent workstreams within one category.</div>${renderTimeline(document.adoptionTimeline)}<div class="section-title"><h2>Operational Activity Sequence</h2></div>${renderSequence(document.adoptionTimeline)}</section></main><footer class="foot"><span>CDW · Functional Consumption Plan</span><span>${value(f.accountId, "Customer")}</span></footer><script>document.querySelectorAll('[data-tab]').forEach(function(button){button.addEventListener('click',function(){document.querySelectorAll('[data-tab]').forEach(function(item){item.classList.remove('active')});document.querySelectorAll('.panel').forEach(function(panel){panel.classList.remove('active')});button.classList.add('active');document.getElementById(button.dataset.tab).classList.add('active')})});</script></body></html>`;
  return source.replaceAll(/\[\[[^\]]+\]\]/g, "Not Yet Confirmed");
}
