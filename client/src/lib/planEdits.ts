import { synchronizeEntitlementNotionalFromOperational, type EngagementDocument } from "@shared/fcp";
import type { RoleHours, WorkPackageEffort } from "@shared/effort";

type Settings = EngagementDocument["report"]["workPackageHours"][number];

const blank = (id: string): Settings => ({ id, architect: null, srConsultant: null, projectManager: null, placement: "auto", owner: "auto" });
export const packageSettings = (document: EngagementDocument, id: string): Settings => document.report.workPackageHours.find(item => item.id === id) ?? blank(id);

/** Writes one package's planner settings; a row back at every default is dropped, so later default changes still apply. */
function write(document: EngagementDocument, next: Settings): EngagementDocument {
  const others = document.report.workPackageHours.filter(item => item.id !== next.id);
  const keep = next.architect !== null || next.srConsultant !== null || next.projectManager !== null || next.placement !== "auto" || next.owner !== "auto";
  return { ...document, report: { ...document.report, workPackageHours: keep ? [...others, next] : others } };
}

/** Hours for one role on one package; null goes back to the calculated baseline. */
export function setRoleHours(document: EngagementDocument, id: string, role: keyof RoleHours, value: number | null): EngagementDocument {
  return write(document, { ...packageSettings(document, id), [role]: value === null ? null : Math.max(0, Math.round(value)) });
}

export function resetRoleHours(document: EngagementDocument, id: string): EngagementDocument {
  return write(document, { ...packageSettings(document, id), architect: null, srConsultant: null, projectManager: null });
}

export function setOwner(document: EngagementDocument, id: string, owner: Settings["owner"]): EngagementDocument {
  return write(document, { ...packageSettings(document, id), owner });
}

/**
 * Moves a package to the follow-on, or brings it back. This is the engine's own placement: effort plans it in the
 * Two-Year Notional as "planned for later", records the scope move, and the FCP explains it. Bringing it back returns
 * it to automatic placement, so it stays in the entitlement only while it fits.
 */
export function setFollowOn(document: EngagementDocument, id: string, on: boolean): EngagementDocument {
  return write(document, { ...packageSettings(document, id), placement: on ? "notional" : "auto" });
}

export const isMovedToFollowOn = (row: Pick<WorkPackageEffort, "placement">) => row.placement === "notional";

/**
 * A package's window on the Entitlement Adoption Timeline, as first and last column (1-based, inclusive). This is the
 * timeline editor's own path: the plan becomes hand-edited and the Two-Year Notional is mirrored from it.
 */
export function setWindow(document: EngagementDocument, barId: string, firstColumn: number, lastColumn: number): EngagementDocument {
  const timeline = document.adoptionTimeline;
  const startCol = Math.max(1, Math.min(firstColumn, timeline.columns.length));
  const endCol = Math.max(startCol, Math.min(lastColumn, timeline.columns.length)) + 1;
  let found = false;
  const lanes = timeline.lanes.map(lane => ({ ...lane, bars: lane.bars.map(bar => (bar.id === barId ? ((found = true), { ...bar, startCol, endCol }) : bar)) }));
  const current = timeline.lanes.flatMap(lane => lane.bars).find(bar => bar.id === barId);
  if (!found || (current && current.startCol === startCol && current.endCol === endCol)) return document;
  return synchronizeEntitlementNotionalFromOperational(document, { ...timeline, lanes });
}

/** The bar's window as first and last column, or null when the package is not on the entitlement timeline. */
export function windowColumns(document: EngagementDocument, barId: string): { first: number; last: number } | null {
  const bar = document.adoptionTimeline.lanes.flatMap(lane => lane.bars).find(item => item.id === barId);
  return bar ? { first: bar.startCol, last: bar.endCol - 1 } : null;
}
