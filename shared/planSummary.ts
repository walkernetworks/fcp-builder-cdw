import type { ScopedEffort, WorkPackageEffort } from "./effort";
import type { EngagementDocument } from "./fcp";
import { fundingProblem, reconcileHours } from "./reportFormat";

/**
 * The Plan screen's answer, in one place: how the entitlement hours are used, what fits, and what moves to year two.
 * Pure; hours only.
 */
export type PlanSummary = {
  entitled: number | null;
  delivered: number;
  planned: number;
  held: number;
  /** One sentence: everything fits, or how much moves to year two. */
  headline: string;
  /** "fits" when nothing requested moved for hours; "moves" when some did; "problem" when the planner has to act. */
  status: "fits" | "moves" | "problem";
  /** Why the planner has to act, when status is "problem". */
  problem: string | null;
  /** Packages in this entitlement (CDW and customer), and those in year two with their hours. */
  inWindow: WorkPackageEffort[];
  later: WorkPackageEffort[];
};

const whole = (value: number) => Math.round(value);
const hoursText = (value: number) => `${whole(value).toLocaleString("en-US")} h`;
/** A package in year two: deferred, with follow-on hours to show. */
const isLater = (row: WorkPackageEffort) => Boolean(row.deferred) && (row.followOn?.total ?? 0) > 0;
/** Moved because the entitlement could not carry it (not because the customer wants it later). */
const movedForHours = (row: WorkPackageEffort) => isLater(row) && row.deferred !== "planned for later";

export function planSummary(document: EngagementDocument, effort: ScopedEffort, today?: string): PlanSummary {
  const reconciliation = reconcileHours(document, effort, today);
  const later = effort.workPackages.filter(isLater);
  const inWindow = effort.workPackages.filter(row => !row.deferred && (row.total > 0 || row.owner !== "cdw") && row.note !== "checkpoint" && row.note !== "not in the scoped hours");
  const moved = later.filter(movedForHours);
  const movedHours = moved.reduce((sum, row) => sum + (row.followOn?.total ?? 0), 0);
  const problem = fundingProblem(document, effort, today);
  const headline = problem
    ? "The plan needs a decision before it can issue."
    : moved.length
      ? `${moved.length} package${moved.length === 1 ? "" : "s"} (${hoursText(movedHours)}) move${moved.length === 1 ? "s" : ""} to year two; everything else fits.`
      : "Everything requested fits in this entitlement.";
  return {
    entitled: reconciliation?.entitled ?? null,
    delivered: reconciliation?.delivered ?? 0,
    planned: reconciliation?.planned ?? whole(effort.totals.total),
    held: reconciliation?.reserve ?? whole(effort.internal.fit?.reserveHours ?? 0),
    headline,
    status: problem ? "problem" : moved.length ? "moves" : "fits",
    problem,
    inWindow,
    later,
  };
}

/** Why a package is in year two, in the planner's words. */
export function laterReason(row: WorkPackageEffort): string {
  switch (row.deferred) {
    case "planned for later": return "Moved to year two";
    case "after the entitlement window": return "Scheduled after the entitlement ends";
    default: return "Did not fit the hours";
  }
}

export type BringInPreview =
  | { fits: true; movesOut: Array<{ id: string; label: string; hours: number }> }
  | { fits: false; reason: string };

/**
 * What bringing one package into this entitlement does: the plan recalculated with it placed ahead of everything after
 * the foundation. It fits, and these packages move out to make room; or it does not fit even then.
 */
export function bringInPreview(before: ScopedEffort, after: ScopedEffort, id: string): BringInPreview {
  const target = after.workPackages.find(row => row.id === id);
  const needed = before.workPackages.find(row => row.id === id)?.followOn?.total ?? 0;
  if (!target || target.deferred || target.total <= 0) {
    return { fits: false, reason: `It needs ${hoursText(needed)}, more than the entitlement has left after discovery, the design and the foundation build. It stays in year two unless the hours or the core scope change.` };
  }
  const wasFunded = new Set(before.workPackages.filter(row => !row.deferred && row.total > 0).map(row => row.id));
  const movesOut = after.workPackages
    .filter(row => wasFunded.has(row.id) && row.deferred)
    .map(row => ({ id: row.id, label: row.label, hours: whole(row.followOn?.total ?? 0) }));
  return { fits: true, movesOut };
}
