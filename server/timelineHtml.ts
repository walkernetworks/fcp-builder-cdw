import type { Timeline, TimelineBar, TimelineLane } from "../shared/fcp";
import { colorForWorkstreamType, isGateActivity, DELIVERY_ROLE_BY_WORKSTREAM, FIXED_GANTT_CATEGORIES, WORKSTREAM_TYPES, WORKSTREAM_TYPE_COLORS } from "../shared/fcp";

/** The category Gantt shared by the FCP and the Condensed FCP: workstream-coloured bars stacked under the five fixed categories. */

export const palette: Record<string, { bg: string; fg: string; border: string }> = {
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

export function renderBar(activity: TimelineBar, totalColumns: number, workstreamType: TimelineLane["workstreamType"], track = 0) {
  const color = palette[colorForWorkstreamType(workstreamType)] || palette.slate;
  // A gate is a checkpoint, not a duration: it is drawn as a marker at the end of its last window.
  const gate = isGateActivity(activity);
  const lastEnd = Math.max(2, Math.min(totalColumns + 1, activity.endCol));
  const start = gate ? lastEnd - 1 : Math.max(1, Math.min(totalColumns, activity.startCol));
  const end = gate ? lastEnd : Math.max(start + 1, Math.min(totalColumns + 1, activity.endCol));
  return `<div class="timeline-bar ${activity.deferred ? "deferred" : ""}" style="grid-column:${start}/${end};grid-row:${track + 1};align-self:center;${gate ? "justify-self:end;border-radius:999px;" : ""}background:${color.bg};color:${color.fg};border-color:${color.border}" title="${esc(workstreamType)}: ${esc(activity.label)}&#10;Lead role: ${esc(DELIVERY_ROLE_BY_WORKSTREAM[workstreamType])}${activity.outcome ? `&#10;Intended outcome: ${esc(activity.outcome)}` : ""}${activity.dependsOn ? `&#10;${esc(activity.dependsOn)}` : ""}">${activity.milestone ? "◆ " : ""}${esc(activity.label)}</div>`;
}

export function renderWorkstreamLegend() {
  return `<div class="timeline-legend"><span>Delivery workstream key</span>${WORKSTREAM_TYPES.map(type => { const color = palette[WORKSTREAM_TYPE_COLORS[type]] || palette.slate; return `<span class="timeline-legend-item" title="Lead role: ${esc(DELIVERY_ROLE_BY_WORKSTREAM[type])}" style="border-color:${color.border};background:${color.bg};color:${color.fg}"><i></i>${esc(type)}</span>`; }).join("")}</div>`;
}

export function groupTimelineLanes(lanes: TimelineLane[]) {
  const groups = new Map<TimelineLane["category"], TimelineLane[]>();
  lanes.forEach(lane => {
    const existing = groups.get(lane.category);
    if (existing) existing.push(lane);
    else groups.set(lane.category, [lane]);
  });
  return FIXED_GANTT_CATEGORIES.map(category => ({ category, lanes: groups.get(category) || [] }));
}

export type CategoryActivity = { lane: TimelineLane; activity: TimelineBar; track: number };

export function layoutCategoryActivities(lanes: TimelineLane[]): CategoryActivity[] {
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

export function renderTimeline(timeline: Timeline, emptyMessage = "No activities have been scheduled for this portion of the plan.", compactColumnWidth?: number) {
  if (!timeline.lanes.length) return `<div class="timeline-empty">${esc(emptyMessage)}</div>`;
  const columnWidth = compactColumnWidth || (timeline.cadence === "week" ? 112 : 92);
  const minimumWidth = 180 + timeline.columns.length * columnWidth;
  const categoryGroups = groupTimelineLanes(timeline.lanes);
  return `${renderWorkstreamLegend()}<div class="timeline-wrap"><div class="timeline-grid" style="--timeline-slots:${timeline.columns.length};min-width:${minimumWidth}px;grid-template-columns:180px repeat(${timeline.columns.length},minmax(${columnWidth}px,1fr))"><div class="timeline-corner">Delivery Category</div>${timeline.columns.map(window => `<div class="timeline-head">${esc(window)}</div>`).join("")}${categoryGroups.map(group => {
    const activities = layoutCategoryActivities(group.lanes);
    const trackCount = Math.max(1, ...activities.map(item => item.track + 1));
    return `<div class="timeline-lane timeline-category-lane"><strong>${esc(group.category)}</strong></div><div class="timeline-row timeline-category-row" style="--months:${timeline.columns.length};grid-column:2/${timeline.columns.length + 2};grid-template-columns:repeat(${timeline.columns.length},1fr);grid-template-rows:repeat(${trackCount},minmax(42px,1fr));min-height:${Math.max(64, trackCount * 50 + 10)}px">${activities.map(({ lane, activity, track }) => renderBar(activity, timeline.columns.length, lane.workstreamType, track)).join("")}</div>`;
  }).join("")}</div></div>`;
}

export function sliceTimeline(timeline: Timeline, startColumn: number, endColumn: number): Timeline {
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

export function projectOperationalTimelineToMonths(timeline: Timeline): Timeline {
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
