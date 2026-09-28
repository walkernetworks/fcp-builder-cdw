import type { EngagementDocument, HardwarePlatformAssessment, Timeline, TimelineBar, TimelineLane } from "../shared/fcp";
import { calculateEntitlementEndDate, colorForWorkstreamType, DELIVERY_ROLE_BY_WORKSTREAM, FIXED_GANTT_CATEGORIES, getHclSchedulePath, effectiveDeliveryPath, getVcfPlaybookWorkPackageOwnership, planOutcomeLabel, playbookPlanForFields, resolvePlanOutcomes, summarizeCompatibilityHandoff, summarizeDeliveryStaffing, summarizeVcfCompatibility, validateTimeline, WORKSTREAM_TYPES, WORKSTREAM_TYPE_COLORS } from "../shared/fcp";
import { HCL_ESTATE_LIMITATION, HCL_EVALUATION_VERSION, HCL_OFFLINE_LIMITATION, hclFindingSeverityLabel, hclStatusLabel, summarizeHclFindings } from "../shared/hcl";
import { renderCompatibilityHandoffHtml } from "./compatibilityHandoffRenderer";

const palette: Record<string, { bg: string; fg: string; border: string }> = {
  slate: { bg: "#334155", fg: "#ffffff", border: "#1e293b" },
  blue: { bg: "#315b8a", fg: "#ffffff", border: "#25476d" },
  teal: { bg: "#2f736e", fg: "#ffffff", border: "#235752" },
  amber: { bg: "#d99a1f", fg: "#172033", border: "#b87912" },
  red: { bg: "#b42339", fg: "#ffffff", border: "#8f1b2c" },
  green: { bg: "#2d6a4f", fg: "#ffffff", border: "#21503b" },
  gate: { bg: "#6b4f8a", fg: "#ffffff", border: "#513a6c" },
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
  return `<div class="timeline-bar ${activity.deferred ? "deferred" : ""}" style="grid-column:${start}/${end};grid-row:${track + 1};align-self:center;background:${color.bg};color:${color.fg};border-color:${color.border}" title="${esc(workstreamType)}: ${esc(activity.label)}&#10;Lead role: ${esc(DELIVERY_ROLE_BY_WORKSTREAM[workstreamType])}${activity.outcome ? `&#10;Intended outcome: ${esc(activity.outcome)}` : ""}${activity.dependsOn ? `&#10;${esc(activity.dependsOn)}` : ""}">${activity.milestone ? "◆ " : ""}${esc(activity.label)}</div>`;
}

function renderWorkstreamLegend() {
  return `<div class="timeline-legend"><span>Delivery workstream key</span>${WORKSTREAM_TYPES.map(type => { const color = palette[WORKSTREAM_TYPE_COLORS[type]] || palette.slate; return `<span class="timeline-legend-item" title="Lead role: ${esc(DELIVERY_ROLE_BY_WORKSTREAM[type])}" style="border-color:${color.border};background:${color.bg};color:${color.fg}"><i></i>${esc(type)}</span>`; }).join("")}</div>`;
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

function renderTimeline(timeline: Timeline, emptyMessage = "No activities have been scheduled for this portion of the plan.", compactColumnWidth?: number) {
  if (!timeline.lanes.length) return `<div class="timeline-empty">${esc(emptyMessage)}</div>`;
  const columnWidth = compactColumnWidth || (timeline.cadence === "week" ? 112 : 92);
  const minimumWidth = 180 + timeline.columns.length * columnWidth;
  const categoryGroups = groupTimelineLanes(timeline.lanes);
  return `${renderWorkstreamLegend()}<div class="timeline-wrap"><div class="timeline-grid" style="--timeline-slots:${Math.max(12, timeline.columns.length)};min-width:${minimumWidth}px;grid-template-columns:180px repeat(${timeline.columns.length},minmax(${columnWidth}px,1fr))"><div class="timeline-corner">Delivery Category</div>${timeline.columns.map(window => `<div class="timeline-head">${esc(window)}</div>`).join("")}${categoryGroups.map(group => {
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
        const label = `${activity.startCol < startColumn ? "← " : ""}${activity.label}${activity.endCol > endColumn + 1 ? " →" : ""}`;
        return [{ ...activity, label, startCol: start - startColumn + 1, endCol: end - startColumn + 1 }];
      }),
    })).filter(lane => lane.bars.length > 0),
  };
}

function operationalMonthLabel(window: string) {
  const month = window.match(/^([A-Za-z]{3,9})\s+\d+/)?.[1];
  const year = window.match(/,\s*(\d{2,4})$/)?.[1];
  return month && year ? `${month} ${year}` : window;
}

function projectOperationalTimelineToMonths(timeline: Timeline): Timeline {
  if (timeline.cadence !== "week") return timeline;
  const windows: Array<{ label: string; start: number; end: number; key: string }> = [];
  timeline.columns.forEach((window, index) => {
    const key = operationalMonthLabel(window);
    const previous = windows[windows.length - 1];
    if (previous && previous.key === key) previous.end = index + 1;
    else windows.push({ label: key, start: index + 1, end: index + 1, key });
  });
  return {
    ...timeline,
    cadence: "month",
    columns: windows.map(window => window.label),
    lanes: timeline.lanes.map(lane => ({
      ...lane,
      bars: lane.bars.flatMap(activity => {
        const covered = windows.filter(window => activity.startCol <= window.end && activity.endCol > window.start);
        if (!covered.length) return [];
        const start = windows.indexOf(covered[0]) + 1;
        const end = windows.indexOf(covered[covered.length - 1]) + 2;
        return [{ ...activity, startCol: start, endCol: Math.max(start + 1, end) }];
      }),
    })).filter(lane => lane.bars.length > 0),
  };
}

function renderTwoYearNotional(document: EngagementDocument) {
  const timeline = document.twoYearPlan;
  const plannedProjectStart = timeline.startDate || document.fields.plannedProjectStart || document.fields.targetStart || document.fields.entitlementStart || "TBD";
  const horizonEnd = timeline.columns[timeline.columns.length - 1] || "TBD";
  const relationship = document.fields.exportPreferences.includeOperationalTimeline
    ? "and shows continued adoption, lifecycle, governance, and handover beyond the immediate Entitlement Adoption Timeline where appropriate"
    : "and shows the directional adoption, lifecycle, governance, and handover roadmap across the full planning horizon";
  const firstYear = sliceTimeline(timeline, 1, Math.min(12, timeline.columns.length));
  const secondYear = timeline.columns.length > 12 ? sliceTimeline(timeline, 13, Math.min(24, timeline.columns.length)) : null;
  const renderNotionalSheet = (sheet: Timeline, year: 1 | 2) => {
    const windowStart = sheet.columns[0] || "TBD";
    const windowEnd = sheet.columns[sheet.columns.length - 1] || "TBD";
    const months = year === 1 ? "Months 1–12" : "Months 13–24";
    const explanation = year === 1
      ? `The first-year roadmap runs from ${windowStart} through ${windowEnd}. It provides directional context around the executable entitlement schedule without changing the approved entitlement drawdown.`
      : `The second-year roadmap continues from ${windowStart} through ${windowEnd}. It shows lifecycle, adoption, and expansion direction that may require future scope or funding.`;
    const overview = year === 1 ? `<div class="notional-overview"><div class="section-title"><h2>Two-Year Notional</h2></div><div class="notice notional-intro"><strong>Directional 24-month roadmap:</strong> This view begins at the planned project start (${esc(plannedProjectStart)}), extends through ${esc(horizonEnd)}, ${relationship}. It is not a commitment that all work is funded by the current entitlement.</div></div>` : "";
    return `<section class="notional-year-sheet notional-year-${year === 1 ? "one" : "two"}">${overview}<div class="document-section-header"><span>Two-Year Notional · ${months}</span><h2>${year === 1 ? "Year 1 Adoption Outlook" : "Year 2 Continuation"}</h2><p>${esc(explanation)}</p></div>${renderTimeline(sheet, `No two-year notional activities are scheduled in ${months.toLowerCase()}.`)}</section>`;
  };
  return `${renderNotionalSheet(firstYear, 1)}${secondYear ? renderNotionalSheet(secondYear, 2) : ""}`;
}

function renderOperationalTimeline(timeline: Timeline) {
  if (!timeline.lanes.length) return renderTimeline(timeline, "No operational-adoption activities are currently scheduled.");
  const printTimeline = projectOperationalTimelineToMonths(timeline);
  // The entitlement window spans up to 13 calendar months when it starts and ends mid-month.
  const entitlementTimeline = sliceTimeline(printTimeline, 1, Math.min(13, printTimeline.columns.length));
  const windowStart = entitlementTimeline.columns[0] || "Plan start";
  const windowEnd = entitlementTimeline.columns[entitlementTimeline.columns.length - 1] || "Plan end";
  const entitlementSheet = `<section class="operational-print-sheet entitlement-one-sheet cadence-month"><div class="operational-window-heading"><span>Entitlement Adoption Timeline · entitlement window</span><h3>${esc(windowStart)} through ${esc(windowEnd)}</h3><p>The entitlement drawdown schedule covers the entitlement window, from the planned project start to entitlement end, on one landscape sheet; work after entitlement end is carried in the Two-Year Notional. Package labels are concise here; the SOW register carries detailed outcomes, dependencies, and acceptance direction.</p></div>${renderTimeline(entitlementTimeline, "No operational-adoption activities are scheduled in the entitlement year.", 42)}</section>`;
  return `<div class="operational-screen-timeline">${renderTimeline(timeline, "No operational-adoption activities are currently scheduled.")}</div><div class="operational-print-layout">${entitlementSheet}</div>`;
}

function renderSequence(timeline: Timeline) {
  const unit = timeline.cadence === "week" ? "Week" : "Month";
  const categoryGroups = groupTimelineLanes(timeline.lanes);
  return `<table><thead><tr><th>Work Package</th><th>Lead Delivery Role</th><th>Start ${unit}</th><th>End ${unit}</th><th>Outcome / Acceptance Direction</th><th>Dependencies and Assumptions</th></tr></thead><tbody>${categoryGroups.map(group => `<tr class="sequence-category"><th colspan="6" style="background:#10233f;color:#fff;text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:8px 10px">${esc(group.category)}</th></tr>${group.lanes.flatMap(lane => lane.bars.map(activity => `<tr><td><span class="dot" style="background:${(palette[colorForWorkstreamType(lane.workstreamType)] || palette.slate).bg}" title="${esc(lane.workstreamType)}" aria-label="${esc(lane.workstreamType)}"></span>${esc(activity.label)}<br><small>${esc(lane.workstreamType)}</small></td><td>${esc(DELIVERY_ROLE_BY_WORKSTREAM[lane.workstreamType])}</td><td>${esc(timelineWindow(timeline, activity.startCol))}</td><td>${esc(timelineWindow(timeline, activity.endCol, true))}</td><td>${esc(activity.outcome || "Confirm completion evidence and customer acceptance direction during delivery planning.")}</td><td>${esc(activity.dependsOn || "Sequence against customer availability, approved change windows, and preceding platform gates.")}</td></tr>`)).join("")}`).join("")}</tbody></table>`;
}

function renderPlaybookScope(document: EngagementDocument) {
  const plan = playbookPlanForFields(document.fields);
  const renderRows = (items: typeof plan.designPackages) => items.length
    ? items.map((item, index) => { const ownership = getVcfPlaybookWorkPackageOwnership(plan.path, item); return `<tr><td><strong>${index + 1}. ${esc(item.title)}</strong><br><small>${esc(item.phase)}</small></td><td><strong>${esc(ownership.category)}</strong><br><small>${esc(ownership.workstreamType)}</small></td><td>${esc(item.outcome)}</td><td>${esc(item.dependsOn)}</td><td>${esc(item.acceptance)}</td></tr>`; }).join("")
    : '<tr><td colspan="5">No implementation work is generated until the pathway is selected or execution is explicitly included.</td></tr>';
  return `<section class="playbook-scope"><div class="section-title"><h2>VCF 9.1 Pathway and Design Deliverables</h2></div><div class="notice"><strong>${esc(plan.label)}:</strong> ${esc(plan.description)}</div><div class="planning-callout"><strong>Decision inputs:</strong> ${esc(plan.decisions.join(" · "))}</div><h3>Required Design Package</h3><table><thead><tr><th>Design Work Package</th><th>Category / Workstream</th><th>Issued Outcome</th><th>Dependencies</th><th>Acceptance Direction</th></tr></thead><tbody>${renderRows(plan.designPackages)}</tbody></table><h3>Implementation and Adoption Package</h3><table><thead><tr><th>Work Package</th><th>Category / Workstream</th><th>Delivery Outcome</th><th>Entry Gate</th><th>Acceptance Direction</th></tr></thead><tbody>${renderRows(plan.implementationPackages)}</tbody></table></section>`;
}

function renderDeliveryStaffingSummary(timeline: Timeline) {
  const staffing = summarizeDeliveryStaffing(timeline);
  const rows = staffing.assignments.length ? staffing.assignments.map(assignment => `<tr><td><strong>${esc(assignment.role)}</strong></td><td>${esc(assignment.workstreamType)}</td><td>${esc(assignment.startLabel)} – ${esc(assignment.endLabel)}</td><td>${number(assignment.workPackages.length)}</td><td>${esc(assignment.workPackages.join(" · "))}</td></tr>`).join("") : '<tr><td colspan="5">No staffable work packages are currently scheduled.</td></tr>';
  return `<div class="staffing-summary"><div class="staffing-facts"><div><span>Lead delivery roles</span><strong>${number(staffing.assignments.length, "0")}</strong></div><div><span>Work packages</span><strong>${number(staffing.workPackageCount, "0")}</strong></div><div><span>Peak concurrent packages</span><strong>${number(staffing.peakConcurrentPackages, "0")}</strong></div></div><table class="staffing-table"><thead><tr><th>Lead Delivery Role</th><th>Workstream</th><th>Delivery Window</th><th>Packages</th><th>Planned Work</th></tr></thead><tbody>${rows}</tbody></table><p class="staffing-boundary">Resource guidance supports delivery planning. Delivery leadership must confirm named resources, effort, utilization, regional availability, customer responsibilities, commercial rates, and formal acceptance criteria before work begins.</p></div>`;
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

function renderReadinessExecutiveSnapshot(document: EngagementDocument) {
  const inventory = document.inventory;
  const handoff = summarizeCompatibilityHandoff(document.readiness.hardwarePlatforms, inventory.hosts);
  const actionContent = handoff.actions.length
    ? `<ol style="margin:10px 0 0;padding-left:18px;color:#405066;font-size:11px;line-height:1.5">${handoff.actions.slice(0, 5).map(action => `<li><strong>${number(action.affectedHosts)} host${action.affectedHosts === 1 ? "" : "s"} · ${esc(action.owner)}</strong><br>${esc(action.title)}</li>`).join("")}</ol>`
    : `<p>No cohort action was derived because no host evidence is available.</p>`;
  const esxiSummary = inventory.esxiVersions.length
    ? inventory.esxiVersions.map(row => `${row.version} · ${row.hosts} host${row.hosts === 1 ? "" : "s"}`).join("; ")
    : "Not reported";
  const reconciliation = handoff.allHostsAccountedFor
    ? `${number(handoff.assessedHosts)} of ${number(handoff.estateHosts)} imported hosts are reconciled to a compatibility cohort.`
    : `${number(handoff.unaccountedHosts)} imported hosts are not represented in the compatibility cohorts and must be resolved before handoff.`;
  return `<section class="hardware-evidence"><div class="hardware-heading"><div><span class="hardware-eyebrow">Presales-to-delivery handoff</span><h3>${esc(handoff.targetRelease)} compatibility posture</h3></div><p>Catalog-versioned server and CPU evidence, current-estate context, release disposition, and owned delivery actions.</p></div><div class="hardware-snapshot"><div><span>Target release listed</span><strong>${number(handoff.supportedHosts)}</strong><small>hosts</small></div><div><span>Blocked / not listed</span><strong>${number(handoff.blockedHosts)}</strong><small>hosts</small></div><div><span>Evidence required</span><strong>${number(handoff.unresolvedHosts)}</strong><small>hosts</small></div><div><span>Estate reconciliation</span><strong>${handoff.allHostsAccountedFor ? "Complete" : "Gap"}</strong><small>${esc(reconciliation)}</small></div></div><div class="grid2" style="margin-top:16px"><div class="card"><h4 style="margin:0;color:#10233f">Maintained evidence baseline</h4><p><strong>${esc(handoff.catalog.id)}</strong><br>${number(handoff.catalog.reportedCount)} server records across ${number(handoff.catalog.vendorCount)} manufacturers; release scope ${esc(handoff.catalog.releaseScope.join(" and "))}; captured ${esc(handoff.catalog.capturedAt)}.</p><p><strong>Observed ESXi:</strong> ${esc(esxiSummary)}</p></div><div class="card"><h4 style="margin:0;color:#10233f">Priority delivery actions</h4>${actionContent}</div></div><p style="margin:14px 0 0;font-size:10px;line-height:1.5;color:#64748b">Server-and-CPU support is one gate. Delivery must also validate NICs, HBAs/controllers, firmware, drivers, OEM image or add-on, boot, storage, vSAN/ReadyNode where applicable, and cluster topology. The standalone compatibility deliverable contains the complete cohort evidence and action register.</p></section>`;
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
  const resolved = resolvePlanOutcomes(document.fields);
  const vvf = resolved.edition === "vvf";
  const scope: string[] = [];
  if (priorities.includes("operations") || adoptionDetails.operations.length) scope.push("operations and lifecycle management");
  if (priorities.includes("automation") || adoptionDetails.automation.length) scope.push("automation and self-service foundations");
  if (priorities.includes("networking") || adoptionDetails.networking.length) scope.push(vvf ? "the explicitly selected networking and load-balancing scope" : "the explicitly selected VCF networking and NSX scope");
  if (priorities.includes("security") || adoptionDetails.security.length) scope.push("security and segmentation controls");
  if (priorities.includes("resilience") || adoptionDetails.resilience.length) scope.push("resilience and recovery planning");
  if (priorities.includes("kubernetes") || adoptionDetails.kubernetes.length) scope.push("Kubernetes and workload-domain enablement");
  if (priorities.includes("private-ai") || adoptionDetails.privateAi.length) scope.push("private AI enablement");

  const deliveryPath = {
    "migration-waves": "controlled migration waves",
    "new-build": "a new platform build",
    "in-place": "an in-place modernization path",
    converge: "convergence of an existing vCenter into the VCF management domain",
    "import-workload-domain": "import of an existing vCenter as a VCF workload domain",
    greenfield: "a separately funded greenfield VCF foundation and workload migration path",
    hybrid: "a cohort-based combination of approved VCF adoption pathways",
    "design-only": "architecture and implementation-ready design work",
    undecided: "a delivery path still to be confirmed",
  }[vvf ? effectiveDeliveryPath(document.fields) : adoptionDetails.upgradePath];

  const selected = scope.length ? scope.join(", ").replace(/, ([^,]*)$/, " and $1") : "the selected operational priorities";
  const edition = vvf ? " on VMware vSphere Foundation (VVF)" : "";
  const excluded = resolved.excluded.length ? ` Outcomes that require VCF are not included: ${resolved.excluded.map(key => planOutcomeLabel(key)).join("; ")}.` : "";
  return `The plan is framed around ${selected}, with ${vvf ? deliveryPath.replace(/VCF/g, "VVF") : deliveryPath}${edition}.${excluded}`;
}

function renderPlanSummary(document: EngagementDocument, includeOperationalTimeline = document.fields.exportPreferences.includeOperationalTimeline) {
  const f = document.fields;
  const i = document.inventory;
  const cadence = f.adoptionCadence === "week" ? "weekly execution windows" : "calendar-month execution windows";
  const plannedStart = f.plannedProjectStart || f.targetStart || f.entitlementStart || "TBD";
  const entitlementEnd = calculateEntitlementEndDate(f.entitlementStart) || f.entitlementEnd || "TBD";
  const vmFootprint = i.vmCount > 0 ? `${i.vmCount.toLocaleString()} virtual machine${i.vmCount === 1 ? "" : "s"}` : "the virtual-machine total requires refreshed estate evidence";
  const hostFootprint = i.hosts > 0 ? `${i.hosts.toLocaleString()} ESXi host${i.hosts === 1 ? "" : "s"}` : "the ESXi-host total requires refreshed estate evidence";
  const reportedEsxi = i.esxiVersions.length ? i.esxiVersions.map(row => `${row.version} (${row.hosts} host${row.hosts === 1 ? "" : "s"})`).join("; ") : "not reported in the imported RVTools vHost rows";
  const items: Array<[string, string]> = [
    ["Customer delivery context", `${f.customerName || "The customer"} is preparing a VCF adoption focused on delivering the confirmed platform outcomes through a sequenced implementation, operating-model transition, and service handover. Estate evidence informs delivery conditions and validation; it does not define the customer story or completion measure.`],
    ["Observed footprint", `${vmFootprint} across ${hostFootprint}, ${i.clusters || "unconfirmed"} clusters, and ${i.datacenters || "unconfirmed"} datacenters. Reported ESXi: ${reportedEsxi}.`],
    ["Selected scope", selectedScopeSummary(document)],
    ["Entitlement details", includeOperationalTimeline
      ? `${money(f.entitlementAmount)} is available through ${entitlementEnd}. The Entitlement Adoption Timeline shows the planned drawdown sequence; the separate Two-Year Notional extends the directional adoption roadmap to 24 months.`
      : `${money(f.entitlementAmount)} is available through ${entitlementEnd}. The Two-Year Notional provides the directional 24-month adoption roadmap; the detailed delivery schedule is omitted from this export.`],
  ];
  if (includeOperationalTimeline) {
    items.push(["Entitlement Adoption Timeline", `The entitlement drawdown schedule begins ${plannedStart} and uses ${cadence}. Lead delivery roles, scoped work packages, and concurrent workstreams are derived from the authoritative plan.`]);
  }
  return `<div class="plan-summary">${items.map(([heading, body], index) => `<article><span class="summary-index">${String(index + 1).padStart(2, "0")}</span><div><h3>${esc(heading)}</h3><p>${esc(body)}</p></div></article>`).join("")}</div>`;
}

function renderExecutiveSummary(title: string, document: EngagementDocument, errors: string[], includeOperationalTimeline: boolean) {
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
  const planningBasis = includeOperationalTimeline
    ? "Entitlement Adoption Timeline with a separate 24-month notional view"
    : "Entitlement-aligned execution scope with a separate 24-month notional view";
  const operationalCallout = includeOperationalTimeline
    ? `<div class="planning-callout"><strong>Entitlement Adoption Timeline:</strong> this is the two-year delivery horizon beginning ${esc(plannedProjectStart)}. It uses ${esc(cadence)} and connects each work package to lead resource guidance, dependencies, gates, and concurrent workstreams.</div>`
    : "";
  const executiveSubtitle = includeOperationalTimeline
    ? "A delivery-focused view of confirmed outcomes, the Entitlement Adoption Timeline, and the separate Two-Year Notional."
    : "A delivery-focused view of confirmed service outcomes and entitlement-aligned execution.";
  return `<section class="executive-sheet"><div class="sheet-header"><span class="sheet-kicker">Executive snapshot</span><h2>Functional Consumption Plan</h2><p>${executiveSubtitle}</p></div><div class="executive-facts"><div><span>Entitlement value</span><strong>${money(f.entitlementAmount, "—")}</strong><small>${value(f.entitlementStart)} to ${value(entitlementEnd)}</small></div><div><span>Observed footprint</span><strong>${i.vmCount > 0 ? `${number(i.vmCount)} VM records` : "Needs re-import"}</strong><small>${i.hosts > 0 ? `${number(i.hosts)} ESXi hosts` : "vHost evidence required"}</small></div><div><span>Reported ESXi</span><strong>${i.esxiVersions.length ? `${i.esxiVersions.length} release${i.esxiVersions.length === 1 ? "" : "s"}` : "Not reported"}</strong><small>${esc(esxiSummary)}</small></div><div><span>Delivery posture</span><strong>Design to adoption</strong><small>Estate evidence supports validation</small></div></div><div class="executive-columns"><article class="editorial-block"><span class="block-label">Customer background</span><h3>${value(f.customerName, title)}</h3><p>${esc(customerSynopsis)}</p><dl class="estate-list"><div><dt>Location</dt><dd>${value(f.location)}</dd></div><div><dt>Delivery focus</dt><dd>Design artifacts, implementation sequencing, adoption outcomes, lifecycle enablement, and service handover</dd></div><div><dt>Planning basis</dt><dd>${esc(planningBasis)}</dd></div></dl></article><article class="editorial-block emphasis"><span class="block-label">Plan synopsis</span><h3>Customer-aligned delivery plan</h3><p>${esc(selectedScopeSummary(document))}</p><div class="planning-callout"><strong>Two-Year Notional:</strong> this directional 24-month view begins at the planned project start (${esc(plannedProjectStart)}) and extends continued adoption beyond the immediate entitlement drawdown where appropriate.</div>${operationalCallout}</article></div><div class="sheet-footer"><span>Prepared for ${value(f.customerName, title)}</span><span>${includeOperationalTimeline ? `${cadence} · delivery planning view` : "entitlement delivery planning view"}</span></div></section><section class="summary-plan"><div class="section-title"><h2>Plan on a Page</h2></div><p class="section-intro">The plan translates selected service outcomes into delivery work, using estate evidence only to inform planning conditions and validation.</p><div class="section-divider"></div><div class="section-title compact"><h2>Customer and Delivery Summary</h2></div>${renderPlanSummary(document, includeOperationalTimeline)}<div class="section-title compact"><h2>Timeline Validation</h2></div>${validationMessage}<div class="sheet-footer"><span>Functional Consumption Plan · Plan on a Page</span><span>Internal planning document</span></div></section>`;
}

export function renderFcpHtml(title: string, document: EngagementDocument) {
  const f = document.fields;
  const i = document.inventory;
  const calculatedEntitlementEnd = calculateEntitlementEndDate(f.entitlementStart) || f.entitlementEnd;
  const includeVcfReadiness = document.fields.exportPreferences.includeVcfReadiness;
  const includeOperationalTimeline = document.fields.exportPreferences.includeOperationalTimeline;
  const errors = [
    ...validateTimeline(document.twoYearPlan),
    ...(includeOperationalTimeline ? validateTimeline(document.adoptionTimeline) : []),
  ];
  const readinessNavigation = includeVcfReadiness ? '<button data-tab="considerations">VCF 9.1 Readiness</button>' : "";
  const readinessPanel = includeVcfReadiness
    ? `<section id="considerations" class="panel"><div class="certification-page"><div class="section-title"><h2>VCF 9.1 Readiness</h2></div><p class="section-intro">A concise readiness summary for delivery decisions, validation priorities, and mobilisation sequencing.</p>${renderReadinessExecutiveSnapshot(document)}</div></section>`
    : "";
  const operationalNavigation = includeOperationalTimeline ? '<button data-tab="adoption">Entitlement Adoption Timeline</button>' : "";
  const operationalPanel = includeOperationalTimeline
? `<section id="adoption" class="panel"><div class="section-title"><h2>Entitlement Adoption Timeline</h2></div><div class="notice"><strong>Delivery resource view:</strong> This schedule turns the approved adoption plan into scoped delivery work packages. Resource roles and calendar windows are planning guidance; delivery leadership validates effort, availability, named resources, and commercials before mobilization.</div>${renderPlaybookScope(document)}${renderDeliveryStaffingSummary(document.adoptionTimeline)}${renderOperationalTimeline(document.adoptionTimeline)}<section class="operational-sequence-sheet"><div class="section-title"><h2>High-Level SOW Work Package Register</h2></div><p class="section-intro">The register carries the same authoritative timeline into delivery scope, role ownership, outcomes, dependencies, and assumptions.</p>${renderSequence(document.adoptionTimeline)}</section></section>`
    : "";
  const source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
:root{--cdw:#c8102e;--cdw-dark:#a80922;--navy:#10233f;--navy-deep:#07182d;--ink:#172033;--muted:#64748b;--line:#dbe2ea;--soft-line:#e9eef3;--surface:#f5f7fa;--paper:#ffffff;--soft:#f7f9fc}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Arial,"Helvetica Neue",sans-serif;color:var(--ink);background:var(--surface);line-height:1.45}.mast{height:58px;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 30px;border-bottom:1px solid var(--line)}.logo{font-weight:900;font-size:28px;letter-spacing:-2px;color:var(--cdw)}.conf{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.cover{position:relative;overflow:hidden;background:linear-gradient(125deg,#08182c 0%,#102f50 64%,#193d63 100%);color:#fff;padding:48px 48px 40px;min-height:340px;border-bottom:5px solid var(--cdw);display:flex;flex-direction:column;justify-content:space-between}.cover:after{content:"";position:absolute;width:360px;height:360px;right:-136px;bottom:-170px;border:1px solid #ffffff2b;border-radius:50%;box-shadow:0 0 0 42px #ffffff0b,0 0 0 84px #ffffff08}.cover-brand,.cover-footer{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between}.cover-brand{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#b8cae0}.cover-content{position:relative;z-index:1;max-width:850px;margin:44px 0 28px}.cover-kicker{display:block;margin-bottom:11px;font-size:12px;letter-spacing:.17em;text-transform:uppercase;color:#c9d9e9}.cover h1{font-size:42px;line-height:1.08;letter-spacing:-.035em;margin:0 0 15px;max-width:720px}.cover-purpose{max-width:780px;margin:0;color:#d9e4f0;font-size:17px;line-height:1.5}.cover-meta{position:relative;z-index:1;display:flex;gap:9px;flex-wrap:wrap}.cover-meta span{border:1px solid #ffffff30;background:#ffffff0d;border-radius:999px;padding:7px 11px;font-size:12px}.cover-footer{font-size:11px;color:#c7d5e3;letter-spacing:.04em}.tabs{position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid var(--line);display:flex;padding:0 30px;box-shadow:0 4px 16px #0f233e0d;overflow-x:auto}.tabs button{border:0;background:none;padding:16px 18px;font-weight:700;color:#64748b;cursor:pointer;border-bottom:3px solid transparent;white-space:nowrap}.tabs button.active{color:var(--cdw);border-color:var(--cdw)}main{max-width:1500px;margin:0 auto;padding:32px 30px 68px}.panel{display:none}.panel.active{display:block}.executive-sheet,.summary-plan{background:var(--paper);border:1px solid var(--line);box-shadow:0 12px 32px #0f233e0c;padding:32px}.sheet-header{max-width:760px}.sheet-kicker,.block-label{display:block;font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--cdw);margin-bottom:9px}.sheet-header h2{font-size:30px;letter-spacing:-.025em;margin:0 0 9px;color:var(--navy)}.sheet-header p{font-size:15px;color:#475569;margin:0}.executive-facts{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:29px 0 30px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.executive-facts>div{padding:17px 17px 16px;border-right:1px solid var(--line)}.executive-facts>div:last-child{border-right:0}.executive-facts span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:8px}.executive-facts strong{display:block;font-size:23px;line-height:1.05;color:var(--navy)}.executive-facts small{display:block;color:var(--muted);font-size:11px;margin-top:5px}.executive-columns{display:grid;grid-template-columns:1fr 1.08fr;gap:44px}.editorial-block{border-top:3px solid var(--navy);padding-top:15px}.editorial-block.emphasis{border-top-color:var(--cdw)}.editorial-block h3{font-size:20px;letter-spacing:-.015em;margin:0 0 11px;color:var(--navy)}.editorial-block p{margin:0;color:#405066;font-size:14px}.estate-list{margin:0;display:grid;gap:0}.estate-list div{padding:10px 0;border-top:1px solid var(--soft-line)}.estate-list div:first-child{border-top:0}.estate-list dt{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:3px}.estate-list dd{margin:0;font-size:13px;color:#334155}.planning-callout{margin-top:15px;padding:13px 15px;border-left:3px solid var(--cdw);background:#fff7f8;color:#475569;font-size:12px;line-height:1.5}.sheet-footer{display:flex;justify-content:space-between;gap:16px;margin-top:31px;padding-top:13px;border-top:1px solid var(--line);font-size:10px;color:var(--muted);letter-spacing:.04em;text-transform:uppercase}.summary-plan{margin-top:22px}.section-title{display:flex;align-items:center;gap:10px;margin:30px 0 14px}.section-title:first-child{margin-top:0}.section-title:before{content:"";width:4px;height:26px;border-radius:3px;background:var(--cdw)}.section-title h2{font-size:21px;margin:0;color:var(--navy);letter-spacing:-.01em}.section-title.compact{margin:25px 0 12px}.section-intro{max-width:730px;margin:0;color:#536274;font-size:14px}.section-divider{height:1px;background:var(--line);margin:24px 0}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpi,.card{background:#fff;border:1px solid var(--line);border-radius:6px;box-shadow:none}.kpi{padding:18px}.kpi small{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}.kpi strong{font-size:25px;display:block;margin-top:7px;color:var(--navy)}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}.card{padding:20px}.card p{margin:8px 0;color:#3e4c5f}.notice{border-left:4px solid var(--cdw);background:#fff7f8;padding:14px 16px;margin-top:14px;font-size:13px}.progress{height:8px;background:#e7ebf0;overflow:hidden}.progress span{display:block;height:100%;background:var(--cdw)}.plan-inputs-strip{padding:18px 20px;border:1px solid var(--line);border-top:3px solid var(--navy);background:#fff}.plan-inputs-strip p{margin:10px 0 0;font-size:13px;color:#516074}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);font-size:12px}th{text-align:left;background:#eef2f6;color:#334155;padding:10px}td{padding:10px;border-top:1px solid #edf0f4;vertical-align:top}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px}.certification-page{max-width:1260px}.certification-page>.section-intro{max-width:900px;margin-bottom:20px}.readiness-evidence{border:1px solid var(--line);border-top:3px solid var(--navy);overflow-x:auto}.readiness-table{border:0;font-size:11px}.readiness-table th{background:#f0f3f7;font-size:10px;letter-spacing:.03em}.readiness-table td{padding:8px 10px;color:#405066}.readiness-table td:first-child{color:var(--navy);width:24%}.readiness-table td:nth-child(2){width:12%}.readiness-table td:nth-child(3){width:28%;color:var(--muted)}.readiness-status{display:inline-block;border-radius:999px;padding:3px 6px;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;background:#eef2f6;color:#475569}.readiness-status.good{background:#ecfdf3;color:#166534}.readiness-status.attention{background:#fff1f2;color:#be123c}.readiness-status.info{background:#eff6ff;color:#1d4ed8}.planning-boundary{margin-top:10px;padding:10px 12px;border-left:3px solid var(--cdw);background:#fff7f8;font-size:11px;line-height:1.4;color:#475569}.hardware-evidence{margin-top:20px;padding-top:13px;border-top:2px solid var(--navy)}.hardware-heading{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.45fr);gap:24px;align-items:end}.hardware-eyebrow{display:block;margin-bottom:4px;color:var(--cdw);font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.hardware-heading h3{margin:0;color:var(--navy);font-size:18px;letter-spacing:-.01em}.hardware-heading p{margin:0;color:var(--muted);font-size:11px;line-height:1.45}.hardware-snapshot{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:13px 0 14px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.hardware-snapshot>div{padding:9px 11px;border-right:1px solid var(--line)}.hardware-snapshot>div:last-child{border-right:0}.hardware-snapshot span{display:block;color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase}.hardware-snapshot strong{display:block;margin-top:4px;color:var(--navy);font-size:17px;line-height:1}.hardware-tables{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,2.2fr);gap:18px}.hardware-table-panel{padding-top:8px;border-top:1px solid var(--line)}.table-heading{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px}.table-heading h4{margin:0;color:var(--navy);font-size:11px}.table-heading p{margin:0;color:var(--muted);font-size:9px}.compact-table{table-layout:fixed;border:0;font-size:10px}.compact-table th{padding:6px 7px;background:#f0f3f7;font-size:9px;line-height:1.2}.compact-table td{padding:6px 7px;line-height:1.28}.compact-table small{display:block;margin-top:2px;color:var(--muted);font-size:9px;line-height:1.25}.hardware-table th:nth-child(1){width:16%}.hardware-table th:nth-child(2){width:9%}.hardware-table th:nth-child(3){width:16%}.hardware-table th:nth-child(4){width:16%}.hardware-table th:nth-child(5){width:20%}.hardware-table th:nth-child(6){width:23%}.timeline-legend{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 9px;font-size:9px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}.timeline-legend-item{display:inline-flex;align-items:center;gap:4px;border:1px solid;border-radius:999px;padding:4px 6px;font-size:8px;line-height:1;font-weight:800;letter-spacing:0;text-transform:none}.timeline-legend-item i{display:inline-block;width:6px;height:6px;border-radius:999px;background:currentColor;opacity:.55}.timeline-wrap{overflow-x:auto;border:1px solid var(--line);background:#fff}.timeline-empty{border:1px solid var(--line);background:#f8fafc;color:#475569;padding:22px;font-size:13px;line-height:1.5}.operational-print-layout{display:none}.operational-window-heading{margin:0 0 14px;padding:0 0 10px;border-bottom:1px solid var(--line)}.operational-window-heading span{display:block;color:var(--cdw);font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.operational-window-heading h3{margin:3px 0 4px;color:var(--navy);font-size:18px;letter-spacing:-.015em}.operational-window-heading p{max-width:820px;margin:0;color:var(--muted);font-size:10px;line-height:1.35}.timeline-grid{display:grid}.timeline-corner,.timeline-head{background:#eef2f6;font-size:11px;font-weight:700;padding:10px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.timeline-lane{padding:11px;font-size:12px;font-weight:700;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.timeline-category-lane{grid-column:1}.timeline-lane strong{display:block;color:var(--navy);font-size:10px;line-height:1.25}.timeline-lane-meta{display:block;margin-top:3px;color:var(--muted);font-size:8px;font-weight:700;line-height:1.25}.timeline-row{display:grid;position:relative;min-height:54px;align-items:center;border-bottom:1px solid var(--line);background-image:linear-gradient(to right,transparent calc(100% - 1px),#e2e8f0 calc(100% - 1px));background-size:calc(100% / var(--months,12)) 100%}.timeline-bar{margin:5px 4px;padding:7px 9px;border:1px solid;border-radius:3px;font-size:10px;font-weight:700;line-height:1.25;min-height:30px;align-content:center;overflow:hidden}.timeline-bar.deferred{border-style:dashed}.notional-year-sheet{margin-top:18px}.notional-year-heading{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:12px;align-items:baseline;margin:0 0 9px;padding-bottom:9px;border-bottom:1px solid var(--line)}.notional-year-heading span{grid-row:1 / span 2;color:var(--cdw);font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.notional-year-heading h3{margin:0;color:var(--navy);font-size:15px;letter-spacing:-.01em}.notional-year-heading p{grid-column:2;margin:2px 0 0;color:var(--muted);font-size:11px;line-height:1.35}.plan-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.plan-summary article{position:relative;background:#fff;border:1px solid var(--line);border-top:3px solid var(--navy);padding:16px 16px 16px 46px;min-height:110px}.summary-index{position:absolute;left:15px;top:15px;font-size:10px;font-weight:900;letter-spacing:.08em;color:var(--cdw)}.plan-summary h3{font-size:13px;margin:0 0 7px;color:var(--navy)}.plan-summary p{font-size:11px;color:var(--muted);margin:0}.foot{padding:20px 30px;background:#0b1f37;color:#b8cae0;font-size:10px;display:flex;justify-content:space-between}@media(max-width:800px){.cover{padding:32px 24px;min-height:300px}.cover h1{font-size:32px}.executive-facts,.kpis,.grid2,.plan-summary,.executive-columns,.hardware-tables{grid-template-columns:1fr}.executive-facts>div{border-right:0;border-bottom:1px solid var(--line)}.executive-facts>div:last-child{border-bottom:0}.hardware-snapshot{grid-template-columns:1fr 1fr}.hardware-snapshot>div:nth-child(2){border-right:0}.hardware-snapshot>div:nth-child(-n+2){border-bottom:1px solid var(--line)}.hardware-heading{grid-template-columns:1fr;gap:8px}.tabs{padding:0 8px}.mast{padding:0 18px}.conf{display:none}main{padding:18px 12px}.executive-sheet,.summary-plan{padding:23px 20px}.sheet-footer{display:block}.sheet-footer span{display:block;margin-top:5px}}@media print{html,body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.executive-facts{grid-template-columns:repeat(4,minmax(0,1fr))}.executive-facts>div{border-right:1px solid var(--line);border-bottom:0}.executive-facts>div:last-child{border-right:0}.executive-columns{grid-template-columns:minmax(0,1fr) minmax(0,1.08fr)}.sheet-footer{display:flex}.sheet-footer span{display:inline;margin-top:0}main{padding:0;max-width:none;margin:0}.mast,.tabs,.foot{display:none}.cover{height:8.5in;min-height:8.5in;margin:0;padding:.68in .72in .56in;border:0;border-bottom:5px solid var(--cdw);page-break-after:always;break-after:page}.cover-content{margin:auto 0}.cover h1{font-size:42px;max-width:7.6in}.cover-purpose{font-size:16px;max-width:8.1in}.cover-meta{margin-top:.26in}.cover-footer{font-size:10px}.panel{display:block!important}.panel:not(#summary){padding:.42in .54in .5in;page-break-before:always;break-before:page}.panel#summary{display:block!important;padding:0}.executive-sheet,.summary-plan{border:0;box-shadow:none;margin:0;background:#fff;page-break-inside:avoid;break-inside:avoid}.executive-sheet{height:8.5in;min-height:8.5in;padding:.38in .60in .26in;page-break-after:always;break-after:page;display:flex;flex-direction:column;overflow:hidden}.summary-plan{height:8.5in;min-height:8.5in;margin-top:0;padding:.50in .60in .42in;page-break-after:always;break-after:page;display:flex;flex-direction:column;overflow:hidden}.summary-plan .sheet-footer{margin-top:auto}.executive-sheet .sheet-footer{margin-top:10px}.sheet-header h2{font-size:28px}.executive-sheet .sheet-header h2{font-size:26px}.executive-sheet .sheet-header p{font-size:13px}.executive-facts{margin:.28in 0 .30in}.executive-sheet .executive-facts{margin:.18in 0}.executive-sheet .executive-facts>div{padding:10px 12px}.executive-sheet .executive-facts strong{font-size:19px}.executive-sheet .executive-facts small{font-size:9px}.executive-sheet .executive-columns{gap:.28in}.executive-sheet .editorial-block{padding-top:9px}.executive-sheet .editorial-block h3{font-size:17px;margin-bottom:7px}.executive-sheet .editorial-block p{font-size:11px;line-height:1.35}.executive-sheet .estate-list div{padding:6px 0}.executive-sheet .estate-list dt{font-size:8px}.executive-sheet .estate-list dd{font-size:10px}.executive-sheet .planning-callout{margin-top:8px;padding:8px 10px;font-size:9px;line-height:1.3}.executive-facts>div{padding:15px}.executive-columns{gap:.42in}.section-title{margin:.20in 0 .12in;page-break-after:avoid;break-after:avoid}.section-title+*,.section-title+p{page-break-before:avoid;break-before:avoid}.section-intro{font-size:13px}.section-divider{margin:.20in 0}.plan-summary{gap:10px}.plan-summary article{min-height:94px;padding:14px 14px 14px 41px}.summary-index{left:13px;top:13px}.plan-inputs-strip{page-break-inside:avoid;break-inside:avoid}.card,.kpi,.timeline-wrap,.notice,.readiness-evidence,.planning-boundary,.hardware-evidence{page-break-inside:avoid;break-inside:avoid}table{page-break-inside:auto;break-inside:auto}tr{page-break-inside:avoid;break-inside:avoid}.grid2{gap:12px}.timeline-grid{min-width:1100px!important}.certification-page{max-width:none}.certification-page>.section-intro{max-width:none;margin-bottom:.14in;font-size:10px}.readiness-evidence{border-top-width:2px}.readiness-table,.compact-table{font-size:8px;table-layout:fixed}.readiness-table th,.compact-table th{padding:4px 5px;font-size:7.5px;line-height:1.2}.readiness-table td,.compact-table td{padding:4px 5px;line-height:1.22}.readiness-status{padding:2px 4px;font-size:7px}.planning-boundary{margin-top:7px;padding:7px 9px;font-size:8px;line-height:1.3}.hardware-evidence{margin-top:.13in;padding-top:.10in}.hardware-heading{gap:.28in}.hardware-heading h3{font-size:14px}.hardware-heading p{font-size:8px}.hardware-snapshot{margin:.10in 0 .11in}.hardware-snapshot>div{padding:6px 8px}.hardware-snapshot span{font-size:7px}.hardware-snapshot strong{font-size:13px}.hardware-tables{grid-template-columns:minmax(0,.8fr) minmax(0,2.2fr);gap:.18in}.hardware-table-panel{padding-top:5px}.table-heading{margin-bottom:4px}.table-heading h4{font-size:8.5px}.table-heading p{font-size:7px}.compact-table small{font-size:7px;line-height:1.18}.hardware-table th:nth-child(1){width:16%}.hardware-table th:nth-child(2){width:9%}.hardware-table th:nth-child(3){width:16%}.hardware-table th:nth-child(4){width:16%}.hardware-table th:nth-child(5){width:20%}.hardware-table th:nth-child(6){width:23%}.panel:not(#summary){padding:.30in .42in .34in}#adoption .section-title,#two-year .section-title{margin:.13in 0 .08in}#adoption .notice,#two-year .notice{margin-top:.07in;padding:8px 10px;font-size:9px;line-height:1.32}#adoption .timeline-corner,#adoption .timeline-head,#two-year .timeline-corner,#two-year .timeline-head{padding:6px 7px;font-size:8.5px}#adoption .timeline-lane,#two-year .timeline-lane{padding:7px 8px;font-size:9px}#adoption .timeline-row{min-height:40px}#adoption .operational-screen-timeline{display:none}#adoption .operational-print-layout{display:block}#adoption .operational-print-sheet{page-break-before:always;break-before:page;page-break-inside:avoid;break-inside:avoid}.operational-print-sheet.entitlement-one-sheet{page-break-after:always;break-after:page}.operational-print-sheet.entitlement-one-sheet .timeline-row{min-height:24px}.operational-print-sheet.entitlement-one-sheet .timeline-corner,.operational-print-sheet.entitlement-one-sheet .timeline-head{padding:2px 2px;font-size:5.7px;line-height:1.05}.operational-print-sheet.entitlement-one-sheet .timeline-lane{padding:3px 4px;font-size:6px;line-height:1.05}.operational-print-sheet.entitlement-one-sheet .timeline-lane strong{font-size:6px}.operational-print-sheet.entitlement-one-sheet .timeline-bar{margin:1px;padding:2px 3px;min-height:12px;font-size:5.7px;line-height:1.02}.operational-print-sheet.entitlement-one-sheet .timeline-legend{margin-bottom:4px;font-size:6px}.operational-print-sheet.entitlement-one-sheet .timeline-legend-item{padding:2px 4px;font-size:5.7px}#adoption .operational-print-sheet:first-child{page-break-before:auto;break-before:auto}#adoption .operational-print-sheet .timeline-grid{width:100%;min-width:0!important}#adoption .operational-print-sheet.cadence-month .timeline-grid{grid-template-columns:120px repeat(var(--timeline-slots,12),minmax(0,1fr))!important}#adoption .operational-print-sheet .timeline-row{min-width:0!important;min-height:32px}#adoption .operational-print-sheet .timeline-corner,#adoption .operational-print-sheet .timeline-head{padding:4px 3px;font-size:6.8px;line-height:1.1}#adoption .operational-print-sheet .timeline-lane{padding:5px 6px;font-size:7px;line-height:1.12}#adoption .operational-print-sheet .timeline-lane strong{font-size:7px}#adoption .operational-print-sheet .timeline-bar{margin:2px;padding:3px 4px;min-height:17px;font-size:6.8px;line-height:1.1}#adoption .operational-print-sheet .timeline-legend{margin-bottom:6px;font-size:7px}#adoption .operational-print-sheet .timeline-legend-item{padding:3px 5px;font-size:6.5px}#adoption .operational-print-sheet.entitlement-one-sheet .timeline-row{min-height:22px!important}#adoption .operational-print-sheet.entitlement-one-sheet .timeline-corner,#adoption .operational-print-sheet.entitlement-one-sheet .timeline-head{padding:2px!important;font-size:5.5px!important;line-height:1.02!important}#adoption .operational-print-sheet.entitlement-one-sheet .timeline-lane{padding:2px 3px!important;font-size:5.8px!important;line-height:1.02!important}#adoption .operational-print-sheet.entitlement-one-sheet .timeline-lane strong{font-size:5.8px!important}#adoption .operational-print-sheet.entitlement-one-sheet .timeline-bar{margin:1px!important;padding:1px 2px!important;min-height:11px!important;font-size:5.4px!important;line-height:1!important}#adoption .operational-print-sheet.entitlement-one-sheet .timeline-legend{margin-bottom:3px!important;font-size:5.8px!important}#adoption .operational-print-sheet.entitlement-one-sheet .timeline-legend-item{padding:1px 3px!important;font-size:5.4px!important}#adoption .operational-window-heading{margin:0 0 .08in;padding-bottom:.07in}#adoption .operational-window-heading span{font-size:7.5px}#adoption .operational-window-heading h3{font-size:12px}#adoption .operational-window-heading p{font-size:8px;line-height:1.25}#adoption .operational-sequence-sheet .section-title{margin-top:0}#two-year .timeline-row{min-height:34px}#adoption .timeline-bar{margin:3px;padding:5px 6px;min-height:23px;font-size:8px;line-height:1.15}#two-year .timeline-bar{margin:2px;padding:4px 5px;min-height:18px;font-size:7.2px;line-height:1.1}#two-year .section-intro{margin:0;font-size:9px;line-height:1.25}#two-year .notional-year-sheet{margin-top:0;page-break-inside:avoid;break-inside:avoid}#two-year .notional-year-heading{margin:0 0 .08in;padding-bottom:.07in}#two-year .notional-year-heading span{font-size:7.5px}#two-year .notional-year-heading h3{font-size:12px}#two-year .notional-year-heading p{font-size:8px}#two-year .notional-year-sheet .timeline-grid{width:100%;min-width:0!important}#two-year .notional-year-sheet .timeline-row{min-width:0!important}#two-year .two-year-sequence-sheet{page-break-before:always;break-before:page}#two-year .two-year-sequence-sheet .section-title{margin-top:0}#adoption table{font-size:7.4px}#two-year table{font-size:7px}#adoption th,#two-year th{padding:3px 4px;font-size:6.8px;line-height:1.16}#adoption td,#two-year td{padding:3px 4px;line-height:1.16}@page{size:letter landscape;margin:0}}
</style></head><body><header class="mast"><div class="logo">CDW</div><div class="conf">Confidential · Internal Planning Document</div></header><section class="cover"><div class="cover-brand"><span>CDW</span><span>Confidential · Internal Planning Document</span></div><div class="cover-content"><span class="cover-kicker">Functional Consumption Plan</span><h1>${value(f.customerName, title)}</h1><p class="cover-purpose">A delivery-ready services-entitlement work plan that translates confirmed VCF outcomes into design artifacts, high-level SOW work packages, technical gates, implementation sequencing, and delivery handoff.</p></div><div class="cover-meta"><span>${value(f.location)}</span><span>${money(f.entitlementAmount)}</span><span>${value(f.entitlementStart)} to ${value(calculatedEntitlementEnd)}</span><span>Service delivery &amp; adoption</span><span>Technical handoff</span></div><div class="cover-footer"><span>Prepared for customer and delivery planning</span><span>Functional Consumption Plan</span></div></section><nav class="tabs"><button class="active" data-tab="summary">Executive Summary</button>${readinessNavigation}${operationalNavigation}<button data-tab="two-year">Two-Year Notional</button></nav><main><section id="summary" class="panel active">${renderExecutiveSummary(title, document, errors, includeOperationalTimeline)}</section>${readinessPanel}${operationalPanel}<section id="two-year" class="panel">${renderTwoYearNotional(document)}</section></main><footer class="foot"><span>CDW · Functional Consumption Plan</span><span>${value(f.accountId, "Customer")}</span></footer><script>document.querySelectorAll('[data-tab]').forEach(function(button){button.addEventListener('click',function(){document.querySelectorAll('[data-tab]').forEach(function(item){item.classList.remove('active')});document.querySelectorAll('.panel').forEach(function(panel){panel.classList.remove('active')});button.classList.add('active');document.getElementById(button.dataset.tab).classList.add('active')})});</script></body></html>`;
  const staffingStyles = `.staffing-summary{margin:18px 0 22px;border:1px solid var(--line);background:#fff}.staffing-facts{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid var(--line)}.staffing-facts>div{padding:14px 16px;border-right:1px solid var(--line)}.staffing-facts>div:last-child{border-right:0}.staffing-facts span{display:block;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}.staffing-facts strong{display:block;margin-top:5px;font-size:22px;color:var(--navy)}.staffing-table{border:0}.staffing-boundary{margin:0;padding:11px 13px;border-top:1px solid var(--line);background:#f8fafc;color:var(--muted);font-size:10px;line-height:1.45}@media(max-width:800px){.staffing-facts{grid-template-columns:1fr}.staffing-facts>div{border-right:0;border-bottom:1px solid var(--line)}}@media print{.staffing-summary{page-break-inside:avoid;break-inside:avoid}.staffing-facts strong{font-size:15px}.staffing-facts>div{padding:7px 9px}.staffing-table{font-size:7px}.staffing-table th,.staffing-table td{padding:4px 5px;line-height:1.2}.staffing-boundary{font-size:7px;padding:6px 8px}}`;
  const coverGuideStyles = `.cover-guide{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;margin-top:28px;border:1px solid #ffffff2b;background:#ffffff1c}.cover-guide>div{padding:12px;background:#0b2139cc}.cover-guide span,.cover-guide strong,.cover-guide small{display:block}.cover-guide span{color:#ff9aab;font-size:9px;font-weight:900;letter-spacing:.12em}.cover-guide strong{margin-top:4px;color:#fff;font-size:11px}.cover-guide small{margin-top:3px;color:#bfcfe0;font-size:9px;line-height:1.3}@media(max-width:800px){.cover-guide{grid-template-columns:1fr 1fr}}@media print{.cover-guide{margin-top:.26in}.cover-guide>div{padding:9px 10px}}`;
  const printRedesignStyles = `.document-section-header{margin:0 0 12px;padding:0 0 10px;border-bottom:2px solid var(--navy)}.document-section-header span{display:block;margin-bottom:3px;color:var(--cdw);font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.document-section-header h2{margin:0;color:var(--navy);font-size:19px;letter-spacing:-.015em}.document-section-header p{max-width:900px;margin:4px 0 0;color:var(--muted);font-size:10px;line-height:1.35}@media print{#two-year.panel{padding:0!important;page-break-before:always;break-before:page}#two-year .notional-year-sheet{height:8.5in;min-height:8.5in;margin:0;padding:.34in .42in .34in;overflow:hidden;page-break-before:always;break-before:page;page-break-inside:avoid;break-inside:avoid}#two-year .notional-year-sheet:first-child{page-break-before:auto;break-before:auto}#two-year .notional-overview{margin:0 0 .11in}#two-year .notional-overview .section-title{margin:0 0 .07in}#two-year .notional-overview .notice{margin:0;padding:7px 9px;font-size:8px;line-height:1.25}#two-year .document-section-header{margin:0 0 .08in;padding:0 0 .07in}#two-year .document-section-header span{font-size:7px}#two-year .document-section-header h2{font-size:13px}#two-year .document-section-header p{font-size:7.5px;line-height:1.24}#two-year .timeline-grid{width:100%!important;min-width:0!important;grid-template-columns:116px repeat(12,minmax(0,1fr))!important}#two-year .timeline-category-row{min-width:0!important;min-height:30px!important;grid-template-rows:repeat(var(--tracks,1),minmax(20px,1fr))}#two-year .timeline-corner,#two-year .timeline-head{padding:4px 2px;font-size:6.4px;line-height:1.05}#two-year .timeline-lane{padding:5px 6px}#two-year .timeline-lane strong{font-size:7px;line-height:1.1}#two-year .timeline-bar{margin:2px;padding:3px 4px;min-height:16px;font-size:6.4px;line-height:1.08}#two-year .timeline-legend{margin-bottom:5px;gap:3px}#two-year .timeline-legend-item{padding:2px 4px;font-size:6px}}`;
  const coverGuide = `<div class="cover-guide"><div><span>01</span><strong>Executive plan</strong><small>Entitlement, pathway, and posture</small></div><div><span>02</span><strong>Entitlement timeline</strong><small>Executable drawdown sequence</small></div><div><span>03</span><strong>SOW register</strong><small>Packages, owners, gates, and outcomes</small></div><div><span>04</span><strong>Two-year notional</strong><small>Directional Months 1–24 outlook</small></div></div>`;
  return source
    .replace("</style>", `${staffingStyles}${coverGuideStyles}${printRedesignStyles}</style>`)
    .replace("</p></div><div class=\"cover-meta\">", `</p>${coverGuide}</div><div class="cover-meta">`)
    .replaceAll(/\[\[[^\]]+\]\]/g, "Not Yet Confirmed");
}

function renderPlanOutputSequence(document: EngagementDocument) {
  const timeline = document.twoYearPlan;
  const activities = timeline.lanes
    .flatMap(lane => lane.bars.map(activity => ({ lane, activity })))
    .sort((left, right) => left.activity.startCol - right.activity.startCol || left.activity.endCol - right.activity.endCol || left.activity.label.localeCompare(right.activity.label));
  if (!activities.length) return '<p class="empty">No entitlement-period delivery activities are currently scheduled.</p>';
  return `<table class="sequence-table"><thead><tr><th>Category</th><th>Service activity</th><th>Delivery window</th><th>Outcome</th></tr></thead><tbody>${activities.map(({ lane, activity }) => `<tr><td><span class="workstream">${esc(lane.workstreamType)}</span><br><small>${esc(lane.category)}</small></td><td><strong>${esc(activity.label)}</strong></td><td>${esc(timelineWindow(timeline, activity.startCol))} – ${esc(timelineWindow(timeline, activity.endCol, true))}</td><td>${esc(activity.outcome || "Delivery activity sequenced in the entitlement plan.")}</td></tr>`).join("")}</tbody></table>`;
}

/** A separate delivery brief, intentionally narrower than the complete FCP export. */
export function renderPlanOutputHtml(title: string, document: EngagementDocument) {
  const f = document.fields;
  const path = document.readiness.hclSchedulePath || getHclSchedulePath(document.inventory);
  const cohorts = summarizeVcfCompatibility(document.readiness.hardwarePlatforms);
  const totalHosts = cohorts.reduce((total, cohort) => total + cohort.hosts, 0);
  const eligible = cohorts.filter(cohort => cohort.decision === "eligible");
  const validationRequired = cohorts.filter(cohort => cohort.decision === "validation-required");
  const actionRequired = cohorts.filter(cohort => cohort.decision === "action-required");
  const countHosts = (items: typeof cohorts) => items.reduce((total, cohort) => total + cohort.hosts, 0);
  const decisionStyle = (decision: string) => decision === "eligible" ? "eligible" : decision === "action-required" ? "action" : "validate";
  const pathCopy = {
    green: "The imported evidence does not show a blocker or warning. Eligible cohorts may proceed to the next platform-gate validation activities.",
    yellow: "One or more cohorts need validation or remediation before the relevant platform gate. Continue delivery preparation in parallel where the plan allows.",
    red: "One or more cohorts require an alternate path, remediation, or procurement decision before those hosts move through the VCF 9.1 platform gate.",
    unresolved: "Imported evidence is not sufficient to release the platform gate. Collect the required host identity and configuration evidence first.",
  }[path];
  const plannedStart = f.plannedProjectStart || f.targetStart || f.entitlementStart || "TBD";
  const entitlementEnd = calculateEntitlementEndDate(f.entitlementStart) || f.entitlementEnd || "TBD";
  const cohortRows = cohorts.length
    ? cohorts.map(cohort => `<tr><td><span class="decision ${decisionStyle(cohort.decision)}">${esc(cohort.decisionLabel)}</span></td><td><strong>${esc(`${cohort.vendor} ${cohort.model}`)}</strong><br><small>${esc(cohort.cpuModel)}</small></td><td>${cohort.hosts} host${cohort.hosts === 1 ? "" : "s"}</td><td>${esc(cohort.reason)}${cohort.matchedModel ? `<br><small>Snapshot model: ${esc(cohort.matchedModel)}${cohort.matchedCpuSeries ? ` · ${esc(cohort.matchedCpuSeries)}` : ""}</small>` : ""}</td><td>${esc(cohort.nextAction)}</td></tr>`).join("")
    : '<tr><td colspan="5">No host cohorts are available. Upload RVTools vHost data to establish VCF 9.1 planning evidence.</td></tr>';
  const actions = [...actionRequired, ...validationRequired].slice(0, 6);
  const actionList = actions.length
    ? `<ul>${actions.map(cohort => `<li><strong>${esc(`${cohort.vendor} ${cohort.model}`)} · ${cohort.hosts} host${cohort.hosts === 1 ? "" : "s"}</strong> — ${esc(cohort.nextAction)}</li>`).join("")}</ul>`
    : "<p>All observed cohorts have a pairing in the supplied snapshot. Continue with the planned validation and configuration-gate activities.</p>";
  const source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} Plan Output</title><style>
:root{--cdw:#c8102e;--navy:#10233f;--ink:#172033;--muted:#64748b;--line:#dbe2ea;--surface:#f5f7fa}*{box-sizing:border-box}body{margin:0;background:var(--surface);color:var(--ink);font-family:Arial,"Helvetica Neue",sans-serif;line-height:1.45}.mast{height:58px;padding:0 30px;border-bottom:1px solid var(--line);background:#fff;display:flex;align-items:center;justify-content:space-between}.brand{font-size:27px;font-weight:900;letter-spacing:-2px;color:var(--cdw)}.conf{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.hero{background:linear-gradient(125deg,#08182c 0%,#102f50 68%,#193d63 100%);color:#fff;padding:52px max(30px,calc((100vw - 1180px)/2 + 30px));border-bottom:5px solid var(--cdw)}.hero .eyebrow{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#d7e5f3}.hero h1{max-width:850px;margin:12px 0;font-size:39px;line-height:1.08;letter-spacing:-.03em}.hero p{max-width:830px;margin:0;color:#dce7f2;font-size:16px;line-height:1.5}.meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}.meta span{border:1px solid #ffffff35;border-radius:999px;background:#ffffff0d;padding:6px 10px;font-size:11px}main{max-width:1180px;margin:0 auto;padding:30px}.panel{margin:0 0 22px;padding:26px 28px;border:1px solid var(--line);background:#fff;box-shadow:0 10px 28px #0f233e0b}.eyebrow{display:block;margin-bottom:7px;color:var(--cdw);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}h2{margin:0;color:var(--navy);font-size:23px;letter-spacing:-.02em}h3{margin:0;color:var(--navy);font-size:15px}p{color:#405066}.intro{max-width:880px;margin:10px 0 0;font-size:13px}.facts{display:grid;grid-template-columns:repeat(4,1fr);margin:23px 0 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.facts>div{padding:14px;border-right:1px solid var(--line)}.facts>div:last-child{border-right:0}.facts span,.facts small{display:block;color:var(--muted);font-size:10px}.facts span{font-weight:800;letter-spacing:.08em;text-transform:uppercase}.facts strong{display:block;margin-top:5px;color:var(--navy);font-size:20px;line-height:1.1}.decision-note{margin-top:20px;padding:14px 16px;border-left:4px solid var(--cdw);background:#fff7f8;color:#405066;font-size:13px}.summary-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:18px;margin-top:20px}.card{padding:18px;border:1px solid var(--line);background:#fff}.card p{margin:8px 0 0;font-size:13px}.card ul{margin:10px 0 0;padding-left:18px;color:#405066;font-size:12px;line-height:1.55}.card li+li{margin-top:6px}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:11px}th{padding:9px;text-align:left;background:#eef2f6;color:#334155;font-size:9px;letter-spacing:.05em;text-transform:uppercase}td{padding:10px 9px;border-top:1px solid #e9eef3;vertical-align:top;color:#405066}small{color:var(--muted);font-size:10px;line-height:1.3}.decision{display:inline-block;border-radius:999px;padding:4px 6px;font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.decision.eligible{background:#ecfdf3;color:#166534}.decision.validate{background:#fffbeb;color:#92400e}.decision.action{background:#fff1f2;color:#be123c}.workstream{font-size:10px;font-weight:800;color:var(--cdw)}.sequence-table td:nth-child(1){width:22%}.sequence-table td:nth-child(2){width:26%}.sequence-table td:nth-child(3){width:19%}.empty{padding:18px;border:1px dashed var(--line);background:#f8fafc;font-size:13px}.note{margin-top:18px;color:var(--muted);font-size:10px;line-height:1.5}.foot{padding:20px 30px;background:#0b1f37;color:#cad7e6;font-size:10px;display:flex;justify-content:space-between}@media(max-width:760px){.hero{padding:34px 24px}.hero h1{font-size:30px}main{padding:18px 12px}.panel{padding:20px}.facts,.summary-grid{grid-template-columns:1fr}.facts>div{border-right:0;border-bottom:1px solid var(--line)}.facts>div:last-child{border-bottom:0}.mast{padding:0 18px}.conf{display:none}table{display:block;overflow-x:auto;white-space:normal}}@media print{html,body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.mast,.foot{display:none}.hero{height:8.5in;min-height:8.5in;padding:.72in .72in;border:0;border-bottom:5px solid var(--cdw);page-break-after:always;break-after:page;display:flex;flex-direction:column;justify-content:center}.hero h1{font-size:40px}.hero p{font-size:16px}.hero .meta{margin-top:.3in}main{max-width:none;margin:0;padding:0}.panel{margin:0;border:0;box-shadow:none;padding:.44in .55in .5in;page-break-before:always;break-before:page}.panel:first-child{page-break-before:auto;break-before:auto}.panel,.card,tr{page-break-inside:avoid;break-inside:avoid}.facts{grid-template-columns:repeat(4,minmax(0,1fr))}.facts>div{border-right:1px solid var(--line);border-bottom:0}.facts>div:last-child{border-right:0}table{font-size:8px}th{padding:5px;font-size:7px}td{padding:5px;line-height:1.22}.summary-grid{gap:12px}.card{padding:12px}.decision{padding:3px 4px;font-size:7px}@page{size:letter landscape;margin:0}}
</style></head><body><header class="mast"><span class="brand">CDW</span><span class="conf">Confidential · Delivery Planning Output</span></header><section class="hero"><span class="eyebrow">VCF 9.1 Delivery Planning Output</span><h1>${value(f.customerName, title)}</h1><p>A focused delivery brief that links the selected entitlement plan to cohort-level evidence for progressing host platforms through the VCF 9.1 platform gate.</p><div class="meta"><span>Planned start: ${value(plannedStart)}</span><span>Entitlement through: ${value(entitlementEnd)}</span><span>Delivery path: ${esc(path.toUpperCase())}</span><span>${number(document.inventory.hosts)} ESXi hosts observed</span></div></section><main><section class="panel"><span class="eyebrow">Delivery decision</span><h2>Plan basis and platform-gate posture</h2><p class="intro">${esc(selectedScopeSummary(document))} The entitlement sequence below remains the delivery recommendation; the compatibility cohort view identifies which observed hosts can advance to the next validation step and which require action first.</p><div class="facts"><div><span>Eligible to progress</span><strong>${countHosts(eligible)}</strong><small>${eligible.length} observed cohort${eligible.length === 1 ? "" : "s"}</small></div><div><span>Validate before gate</span><strong>${countHosts(validationRequired)}</strong><small>${validationRequired.length} observed cohort${validationRequired.length === 1 ? "" : "s"}</small></div><div><span>Action required</span><strong>${countHosts(actionRequired)}</strong><small>${actionRequired.length} observed cohort${actionRequired.length === 1 ? "" : "s"}</small></div><div><span>Observed host evidence</span><strong>${totalHosts}</strong><small>${cohorts.length} server / CPU pairing${cohorts.length === 1 ? "" : "s"}</small></div></div><div class="decision-note"><strong>${esc(path.toUpperCase())} delivery path:</strong> ${esc(pathCopy)}</div><div class="summary-grid"><article class="card"><span class="eyebrow">Selected delivery scope</span><h3>What this plan delivers</h3><p>${esc(selectedScopeSummary(document))}</p></article><article class="card"><span class="eyebrow">Priority follow-up</span><h3>Actions before the platform gate</h3>${actionList}</article></div></section><section class="panel"><span class="eyebrow">Cohort eligibility</span><h2>Observed host groups for VCF 9.1 planning</h2><p class="intro">“Eligible” means the observed server-and-CPU pairing appears in the supplied offline ESXi 9.1 snapshot and may proceed to the next delivery validation step. It is not an official VMware or Broadcom compatibility certification.</p><table><thead><tr><th>Planning decision</th><th>Observed platform and CPU</th><th>Hosts</th><th>Why</th><th>Required next step</th></tr></thead><tbody>${cohortRows}</tbody></table><p class="note">Offline snapshot evidence is used for delivery planning only. Validate final configuration, firmware, driver, and software compatibility in the authoritative configuration reference before production implementation.</p></section><section class="panel"><span class="eyebrow">Entitlement delivery sequence</span><h2>Scheduled delivery activities</h2><p class="intro">The following activities are taken directly from the editable entitlement-aligned plan. Dates and sequencing remain subject to confirmed scope, prerequisites, and customer approvals.</p>${renderPlanOutputSequence(document)}</section></main><footer class="foot"><span>CDW · VCF 9.1 Delivery Planning Output</span><span>${value(f.accountId, "Customer")}</span></footer></body></html>`;
  return source.replaceAll(/\[\[[^\]]+\]\]/g, "Not Yet Confirmed");
}

/**
 * A detailed technical companion to the FCP.  It deliberately excludes adoption
 * timelines and service sequencing, and instead concentrates on the HCL evidence
 * delivery teams need to establish a VCF 9.1 platform-gate decision.
 */
export function renderHclCompatibilityPlanOutputHtml(title: string, document: EngagementDocument) {
  return renderCompatibilityHandoffHtml(title, document);
}

function renderLegacyHclCompatibilityPlanOutputHtml(title: string, document: EngagementDocument) {
  const f = document.fields;
  const path = document.readiness.hclSchedulePath || getHclSchedulePath(document.inventory);
  const cohorts = summarizeVcfCompatibility(document.readiness.hardwarePlatforms);
  const findings = summarizeHclFindings(document.readiness.hcl.findings);
  const coverageGaps = document.readiness.hcl.coverageGaps;
  const totalHosts = cohorts.reduce((total, cohort) => total + cohort.hosts, 0);
  const eligible = cohorts.filter(cohort => cohort.decision === "eligible");
  const validationRequired = cohorts.filter(cohort => cohort.decision === "validation-required");
  const actionRequired = cohorts.filter(cohort => cohort.decision === "action-required");
  const countHosts = (items: typeof cohorts) => items.reduce((total, cohort) => total + cohort.hosts, 0);
  const findingCount = (severity: "BLOCKER" | "WARNING" | "ADVISORY" | "INFO") => findings.filter(finding => finding.severity === severity).length;
  const decisionStyle = (decision: string) => decision === "eligible" ? "eligible" : decision === "action-required" ? "action" : "validate";
  const findingStyle = (severity: string) => severity === "BLOCKER" ? "blocker" : severity === "WARNING" ? "warning" : severity === "ADVISORY" ? "advisory" : "info";
  const pathCopy = {
    green: "No blocker or warning was derived from the imported RVTools-observable evidence. Complete configuration, firmware, and driver confirmation before implementation.",
    yellow: "At least one compatibility cohort or HCL finding requires validation before the relevant VCF 9.1 platform gate is released.",
    red: "At least one compatibility cohort or HCL finding requires remediation, an alternate technical path, or a procurement decision before affected hosts can proceed.",
    unresolved: "The available RVTools evidence is not sufficient to establish a platform-gate decision. Collect the missing host identity and configuration evidence first.",
  }[path];
  const cohortRows = cohorts.length
    ? cohorts.map(cohort => {
      const lifecycle = cohort.futureReleaseSupport;
      const lifecycleFlag = lifecycle.status === "unsupported-from-release"
        ? `<small><strong>VMware support boundary:</strong> supported through ${esc(lifecycle.verifiedThroughRelease)}; not officially supported from ${esc(lifecycle.unsupportedFromRelease)}.${lifecycle.vendorHardwareSupportEnd ? ` Separate Cisco hardware support ends ${esc(lifecycle.vendorHardwareSupportEnd)}.` : ""}</small>`
        : lifecycle.status === "revalidation-required"
          ? `<small><strong>Future-release boundary:</strong> verified through ${esc(lifecycle.verifiedThroughRelease)}; revalidate before a later ESXi or VCF release.</small>`
          : "";
      return `<tr><td><span class="decision ${decisionStyle(cohort.decision)}">${esc(cohort.decisionLabel)}</span><small>${esc(hclStatusLabel(cohort.hclStatus))}</small>${lifecycleFlag}</td><td><strong>${esc(`${cohort.vendor} ${cohort.model}`)}</strong><small>${esc(cohort.cpuModel)}</small></td><td>${cohort.hosts} host${cohort.hosts === 1 ? "" : "s"}</td><td>${esc(cohort.reason)}${cohort.matchedModel ? `<small>Offline snapshot pairing: ${esc(cohort.matchedModel)}${cohort.matchedCpuSeries ? ` · ${esc(cohort.matchedCpuSeries)}` : ""}</small>` : ""}</td><td>${esc(cohort.nextAction)}</td></tr>`;
    }).join("")
    : '<tr><td colspan="5">No host cohorts are available. Upload RVTools vHost data to establish VCF 9.1 compatibility evidence.</td></tr>';
  const findingRows = findings.length
    ? findings.map(summary => {
      const sampleSubjects = summary.subjects.slice(0, 5).join(", ");
      const remainingSubjects = summary.subjects.length > 5 ? ` (+${summary.subjects.length - 5} more)` : "";
      const examples = summary.findings.slice(0, 2).map(finding => `<div><strong>${esc(finding.subject)}${finding.cluster ? ` · ${finding.cluster}` : ""}:</strong> ${esc(finding.evidence)}</div>`).join("");
      const remainingEvidence = summary.findings.length > 2 ? `<small>${summary.findings.length - 2} additional evidence entr${summary.findings.length - 2 === 1 ? "y" : "ies"} are grouped under this finding.</small>` : "";
      return `<article class="finding"><div class="finding-head"><div><span class="severity ${findingStyle(summary.severity)}">${esc(hclFindingSeverityLabel(summary.severity))}</span><span class="check">${esc(summary.checkId)}</span><h3>${esc(summary.title)}</h3></div><strong class="affected">${summary.affectedCount}<small>affected ${esc(summary.scope)}${summary.affectedCount === 1 ? "" : "s"}</small></strong></div><div class="finding-grid"><div><span class="label">Affected subjects</span><p>${esc(sampleSubjects || "Estate-level evidence")}${esc(remainingSubjects)}</p>${summary.clusters.length ? `<small>Clusters: ${esc(summary.clusters.join(", "))}</small>` : ""}</div><div><span class="label">Evidence observed</span><div class="evidence-examples">${examples}</div>${remainingEvidence}</div><div><span class="label">Required action</span><p class="action-text">${esc(summary.remediation)}</p></div></div></article>`;
    }).join("")
    : '<p class="empty">No HCL 2.0 finding rows were derived from the imported RVTools evidence. This does not establish complete configuration compatibility; review the coverage boundary below.</p>';
  const coverageRows = coverageGaps.length
    ? coverageGaps.map(gap => `<tr><td>${esc(gap.kind.replace(/-/g, " "))}</td><td><strong>${esc(gap.subject)}</strong></td><td>${esc(gap.impact)}</td></tr>`).join("")
    : '<tr><td colspan="3">No coverage gaps were recorded from the available evidence.</td></tr>';
  const actionList = [...actionRequired, ...validationRequired].slice(0, 8);
  const nextActions = actionList.length
    ? `<ol>${actionList.map(cohort => `<li><strong>${esc(`${cohort.vendor} ${cohort.model}`)} · ${cohort.hosts} host${cohort.hosts === 1 ? "" : "s"}</strong><span>${esc(cohort.nextAction)}</span></li>`).join("")}</ol>`
    : "<p>All observed cohorts have an offline snapshot pairing. Continue with final configuration, firmware, driver, and supported-component confirmation.</p>";
  const source = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} HCL and Compatibility Plan Output</title><style>
:root{--cdw:#c8102e;--navy:#10233f;--ink:#172033;--muted:#64748b;--line:#dbe2ea;--soft:#f5f7fa;--paper:#fff}*{box-sizing:border-box}body{margin:0;background:var(--soft);color:var(--ink);font-family:Arial,"Helvetica Neue",sans-serif;line-height:1.45}.mast{height:58px;padding:0 30px;border-bottom:1px solid var(--line);background:#fff;display:flex;align-items:center;justify-content:space-between}.brand{font-size:27px;font-weight:900;letter-spacing:-2px;color:var(--cdw)}.conf{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.hero{background:linear-gradient(125deg,#08182c 0%,#102f50 68%,#193d63 100%);color:#fff;padding:52px max(30px,calc((100vw - 1180px)/2 + 30px));border-bottom:5px solid var(--cdw)}.hero .eyebrow{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#d7e5f3}.hero h1{max-width:850px;margin:12px 0;font-size:39px;line-height:1.08;letter-spacing:-.03em}.hero p{max-width:830px;margin:0;color:#dce7f2;font-size:16px;line-height:1.5}.meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}.meta span{border:1px solid #ffffff35;border-radius:999px;background:#ffffff0d;padding:6px 10px;font-size:11px}main{max-width:1180px;margin:0 auto;padding:30px}.panel{margin:0 0 22px;padding:26px 28px;border:1px solid var(--line);background:var(--paper);box-shadow:0 10px 28px #0f233e0b}.eyebrow{display:block;margin-bottom:7px;color:var(--cdw);font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}h2{margin:0;color:var(--navy);font-size:23px;letter-spacing:-.02em}h3{margin:0;color:var(--navy);font-size:15px}p{color:#405066}.intro{max-width:900px;margin:10px 0 0;font-size:13px}.facts{display:grid;grid-template-columns:repeat(4,1fr);margin:23px 0 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.facts>div{padding:14px;border-right:1px solid var(--line)}.facts>div:last-child{border-right:0}.facts span,.facts small{display:block;color:var(--muted);font-size:10px}.facts span{font-weight:800;letter-spacing:.08em;text-transform:uppercase}.facts strong{display:block;margin-top:5px;color:var(--navy);font-size:20px;line-height:1.1}.decision-note{margin-top:20px;padding:14px 16px;border-left:4px solid var(--cdw);background:#fff7f8;color:#405066;font-size:13px}.summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:20px}.card{padding:18px;border:1px solid var(--line);background:#fff}.card p{margin:8px 0 0;font-size:13px}.card ol{margin:10px 0 0;padding-left:21px;color:#405066;font-size:12px;line-height:1.55}.card li+li{margin-top:7px}.card li span{display:block;margin-top:2px}.label{display:block;color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.decision{display:inline-block;border-radius:999px;padding:4px 6px;font-size:9px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.decision.eligible{background:#ecfdf3;color:#166534}.decision.validate{background:#fffbeb;color:#92400e}.decision.action{background:#fff1f2;color:#be123c}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:11px}th{padding:9px;text-align:left;background:#eef2f6;color:#334155;font-size:9px;letter-spacing:.05em;text-transform:uppercase}td{padding:10px 9px;border-top:1px solid #e9eef3;vertical-align:top;color:#405066}td small{display:block;margin-top:4px;color:var(--muted);font-size:10px;line-height:1.35}.finding-stack{display:grid;gap:12px;margin-top:18px}.finding{border:1px solid var(--line);border-top:3px solid var(--navy);padding:16px}.finding-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.severity{display:inline-block;border-radius:999px;padding:3px 6px;font-size:8px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.severity.blocker{background:#fff1f2;color:#be123c}.severity.warning{background:#fffbeb;color:#92400e}.severity.advisory{background:#eff6ff;color:#1d4ed8}.severity.info{background:#f1f5f9;color:#475569}.check{margin-left:7px;color:var(--muted);font-size:10px;font-family:monospace;font-weight:700}.finding h3{margin-top:9px}.affected{min-width:74px;text-align:right;color:var(--navy);font-size:19px;line-height:1}.affected small{display:block;margin-top:4px;color:var(--muted);font-size:8px;font-weight:700;line-height:1.25;text-transform:uppercase}.finding-grid{display:grid;grid-template-columns:.8fr 1.45fr 1.1fr;gap:16px;margin-top:14px;padding-top:13px;border-top:1px solid var(--line)}.finding-grid p{margin:5px 0 0;font-size:11px;line-height:1.4}.finding-grid small{display:block;margin-top:5px;color:var(--muted);font-size:9px;line-height:1.35}.evidence-examples{display:grid;gap:5px;margin-top:5px;color:#405066;font-size:10px;line-height:1.35}.action-text{font-weight:700;color:#25364d!important}.boundary{margin-top:18px;padding:14px 16px;border-left:4px solid var(--cdw);background:#fff7f8;font-size:11px;line-height:1.5;color:#405066}.empty{padding:18px;border:1px dashed var(--line);background:#f8fafc;font-size:13px}.foot{padding:20px 30px;background:#0b1f37;color:#cad7e6;font-size:10px;display:flex;justify-content:space-between}@media(max-width:760px){.hero{padding:34px 24px}.hero h1{font-size:30px}main{padding:18px 12px}.panel{padding:20px}.facts,.summary-grid,.finding-grid{grid-template-columns:1fr}.facts>div{border-right:0;border-bottom:1px solid var(--line)}.facts>div:last-child{border-bottom:0}.mast{padding:0 18px}.conf{display:none}.finding-head{display:block}.affected{text-align:left;margin-top:10px}table{display:block;overflow-x:auto;white-space:normal}}@media print{html,body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.mast,.foot{display:none}.hero{height:8.5in;min-height:8.5in;padding:.72in .72in;border:0;border-bottom:5px solid var(--cdw);page-break-after:always;break-after:page;display:flex;flex-direction:column;justify-content:center}.hero h1{font-size:40px}.hero p{font-size:16px}.hero .meta{margin-top:.3in}main{max-width:none;margin:0;padding:0}.panel{margin:0;border:0;box-shadow:none;padding:.42in .55in .48in;page-break-before:always;break-before:page}.panel:first-child{page-break-before:auto;break-before:auto}.panel,.card,.finding,tr{page-break-inside:avoid;break-inside:avoid}.facts{grid-template-columns:repeat(4,minmax(0,1fr))}.facts>div{border-right:1px solid var(--line);border-bottom:0}.facts>div:last-child{border-right:0}table{font-size:8px}th{padding:5px;font-size:7px}td{padding:5px;line-height:1.22}.summary-grid{gap:12px}.card{padding:12px}.finding{padding:11px}.finding-grid{gap:10px;margin-top:10px;padding-top:9px}.finding-grid p{font-size:8px}.evidence-examples{font-size:7.5px}.finding-grid small{font-size:7px}.finding h3{font-size:10px}.affected{font-size:15px}.decision,.severity{padding:3px 4px;font-size:7px}@page{size:letter landscape;margin:0}}
</style></head><body><header class="mast"><span class="brand">CDW</span><span class="conf">Confidential · Technical Planning Evidence</span></header><section class="hero"><span class="eyebrow">VCF 9.1 HCL and Compatibility Plan Output</span><h1>${value(f.customerName, title)}</h1><p>A technical planning companion focused on imported HCL 2.0 evidence, observed host compatibility cohorts, platform-gate decisions, evidence boundaries, and required remediation actions.</p><div class="meta"><span>${HCL_EVALUATION_VERSION} evidence model</span><span>Delivery path: ${esc(path.toUpperCase())}</span><span>${number(totalHosts || document.inventory.hosts)} ESXi hosts observed</span><span>${coverageGaps.length} coverage gap${coverageGaps.length === 1 ? "" : "s"}</span></div></section><main><section class="panel"><span class="eyebrow">Platform-gate decision</span><h2>VCF 9.1 progression posture</h2><p class="intro">This document is a delivery-planning evidence pack, not an official certification. It identifies which observed server-and-CPU cohorts may proceed to final validation, which require confirmation, and which require action before an affected platform gate is released.</p><div class="facts"><div><span>Eligible to progress</span><strong>${countHosts(eligible)}</strong><small>${eligible.length} cohort${eligible.length === 1 ? "" : "s"}</small></div><div><span>Validate before gate</span><strong>${countHosts(validationRequired)}</strong><small>${validationRequired.length} cohort${validationRequired.length === 1 ? "" : "s"}</small></div><div><span>Action required</span><strong>${countHosts(actionRequired)}</strong><small>${actionRequired.length} cohort${actionRequired.length === 1 ? "" : "s"}</small></div><div><span>HCL finding types</span><strong>${findings.length}</strong><small>${findingCount("BLOCKER")} blocker · ${findingCount("WARNING")} warning</small></div></div><div class="decision-note"><strong>${esc(path.toUpperCase())} platform-gate posture:</strong> ${esc(pathCopy)}</div><div class="summary-grid"><article class="card"><span class="eyebrow">Priority compatibility actions</span><h3>What must be resolved or confirmed</h3>${nextActions}</article><article class="card"><span class="eyebrow">Evidence boundary</span><h3>What this imported evidence establishes</h3><p>${esc(HCL_ESTATE_LIMITATION)}</p><p>${esc(HCL_OFFLINE_LIMITATION)}</p></article></div></section><section class="panel"><span class="eyebrow">Compatibility cohort evidence</span><h2>Observed host groups for VCF 9.1 planning</h2><p class="intro">Each row represents an observed server-and-CPU cohort. The decision and reason are derived from the imported host data and the supplied offline ESXi 9.1 snapshot. Review the required action before releasing that cohort through its platform gate.</p><table><thead><tr><th>Decision / snapshot status</th><th>Observed platform and CPU</th><th>Hosts</th><th>Why this decision</th><th>Required next step</th></tr></thead><tbody>${cohortRows}</tbody></table></section><section class="panel"><span class="eyebrow">HCL 2.0 findings</span><h2>Consolidated technical findings and remediation</h2><p class="intro">Repeated host-level evidence is grouped by HCL check and shared remediation. Each finding retains its affected-subject count and representative imported evidence so the document remains detailed without duplicating the same action once per host.</p><div class="finding-stack">${findingRows}</div></section><section class="panel"><span class="eyebrow">Evidence coverage</span><h2>Coverage gaps and additional information required</h2><p class="intro">A coverage gap is not a passing result. It identifies a compatibility or configuration check that could not be established from the current RVTools export or offline snapshot.</p><table><thead><tr><th>Gap type</th><th>Evidence area</th><th>Planning impact</th></tr></thead><tbody>${coverageRows}</tbody></table></section></main><footer class="foot"><span>CDW · VCF 9.1 HCL and Compatibility Plan Output</span><span>${value(f.accountId, "Customer")}</span></footer></body></html>`;
  return source.replaceAll(/\[\[[^\]]+\]\]/g, "Not Yet Confirmed");
}
