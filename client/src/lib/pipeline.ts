import { dataQualityFlags, staleness } from "@shared/vsaDashboard";
import { isTerminal, STAGE_LABELS, STAGES, stageWarnings, type Segment, type Stage } from "@shared/vsaStage";
import { daysBetween } from "@shared/vsaViews";
import type { TrackerRow } from "./vsa";

/** Everything that makes a record need attention: data-quality flags, a stale stage, and stage warnings. */
export function attentionFor(row: TrackerRow, today: string) {
  const flags = dataQualityFlags(row);
  const stale = staleness(row, today);
  // "Segment not set" is already a data-quality flag.
  const warnings = stageWarnings(row, today).filter(warning => warning !== "Segment not set");
  return { flags, stale, warnings, count: flags.length + (stale.stale ? 1 : 0) + warnings.length };
}

export type Health = NonNullable<TrackerRow["health"]>;
export type PipelineFilters = {
  search: string;
  stages: Stage[];
  segments: (Segment | "none")[];
  health: (Health | "none")[];
  architects: string[];
  flaggedOnly: boolean;
};
export const EMPTY_FILTERS: PipelineFilters = { search: "", stages: [], segments: [], health: [], architects: [], flaggedOnly: false };

export type SortKey = "customer" | "stage" | "segment" | "architect" | "days" | "expiry" | "amount" | "health" | "flags";
export type Sort = { key: SortKey; dir: "asc" | "desc" };

export const architectOf = (row: TrackerRow) => row.assignments.find(assignment => assignment.role === "architect")?.displayName ?? null;

export function activeFilterCount(filters: PipelineFilters) {
  return filters.stages.length + filters.segments.length + filters.health.length + filters.architects.length + (filters.flaggedOnly ? 1 : 0) + (filters.search.trim() ? 1 : 0);
}

export function applyFilters(rows: TrackerRow[], filters: PipelineFilters, today: string) {
  const term = filters.search.trim().toLowerCase();
  return rows.filter(row =>
    (!term || [row.customerName, row.opportunityNumber, row.serNumber, row.salesforceCustomerId, architectOf(row)].some(value => value?.toLowerCase().includes(term))) &&
    (!filters.stages.length || filters.stages.includes(row.stage)) &&
    (!filters.segments.length || filters.segments.includes(row.segment ?? "none")) &&
    (!filters.health.length || filters.health.includes(row.health ?? "none")) &&
    (!filters.architects.length || filters.architects.includes(architectOf(row) ?? "Unassigned")) &&
    (!filters.flaggedOnly || attentionFor(row, today).count > 0),
  );
}

const HEALTH_RANK: Record<string, number> = { red: 0, yellow: 1, green: 2 };
const stageRank = (stage: Stage) => STAGES.indexOf(stage);

export function sortRows(rows: TrackerRow[], sort: Sort, today: string) {
  const value = (row: TrackerRow): string | number | null => {
    switch (sort.key) {
      case "customer": return row.customerName.toLowerCase();
      case "stage": return stageRank(row.stage);
      case "segment": return row.segment;
      case "architect": return architectOf(row)?.toLowerCase() ?? null;
      case "days": return daysBetween(row.stageEnteredOn, today);
      case "expiry": return row.deliveryWindowEnd;
      case "amount": return row.entitlementValue === null ? null : Number(row.entitlementValue);
      case "health": return row.health ? HEALTH_RANK[row.health] : null;
      case "flags": return attentionFor(row, today).count;
    }
  };
  const sign = sort.dir === "asc" ? 1 : -1;
  // Empty values always sort last, whichever the direction.
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null && right === null) return a.customerName.localeCompare(b.customerName);
    if (left === null) return 1;
    if (right === null) return -1;
    const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return order * sign || a.customerName.localeCompare(b.customerName);
  });
}

export const openRows = (rows: TrackerRow[]) => rows.filter(row => !isTerminal(row.stage));
export const stageLabel = (stage: Stage) => STAGE_LABELS[stage];

/** Saved views are a per-browser convenience (localStorage); the role queues are the shared, built-in saved filters. */
export type SavedView = { name: string; filters: PipelineFilters; sort: Sort };
const viewsKey = (scope: string) => `vsa.savedViews.${scope}`;

export function loadSavedViews(scope: string): SavedView[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(viewsKey(scope)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(view => view && typeof view.name === "string" && view.filters && view.sort).map(view => ({ ...view, filters: { ...EMPTY_FILTERS, ...view.filters } })) : [];
  } catch {
    return [];
  }
}

export function storeSavedViews(scope: string, views: SavedView[]) {
  try {
    window.localStorage.setItem(viewsKey(scope), JSON.stringify(views));
    return true;
  } catch {
    return false;
  }
}
