import { allocateBsas, bsasTerm, fundedDocument, isBsasOnly, type BsasAllocation, type BsasTerm } from "./bsas";
import { barWindow } from "./buildingBlocks";
import { unscopedWorkPackageIds, timelinesWithDeferrals, withOwnership, type ScopedEffort, type WorkPackageEffort } from "./effort";
import type { EngagementDocument } from "./fcp";
import type { Provenance } from "./provenance";
import { reportTermEnd } from "./reportView";

/**
 * What the Plan section shows above the work packages, worked out the way the Condensed FCP prints it: the buckets
 * in hours and the BSAS allocation. Pure. Hours and dates only; the fit check itself stays internal.
 */

export type PlanBucket = { key: "E1" | "E2" | "F" | "C" | "reserve"; name: string; covers: string; hours: number };

const whole = (value: number) => Math.round(value);

/** Follow-on work: packages with hours after the entitlement, with their notional window when it falls after the term. */
function followOnWork(document: EngagementDocument, effort: ScopedEffort, termEnd: string | null) {
  const source = fundedDocument(document);
  const notional = timelinesWithDeferrals(withOwnership(source), effort.workPackages.filter(row => row.deferred).map(row => row.id), unscopedWorkPackageIds(effort)).notional;
  const bars = new Map(notional.lanes.flatMap(lane => lane.bars).map(bar => [bar.id, bar]));
  return effort.workPackages.filter(row => row.followOn && row.followOn.total > 0).map(row => {
    const bar = bars.get(row.id);
    const window = bar ? barWindow(notional, bar) : null;
    const after = window && (!termEnd || window.start > termEnd) ? window : null;
    return { id: row.id, label: row.label, hours: row.followOn!.total, start: after?.start ?? null, end: after?.end ?? null };
  });
}

/** The BSAS term that funds follow-on work, and what it funds; null without one. */
export function planBsasAllocation(document: EngagementDocument, effort: ScopedEffort): BsasAllocation | null {
  const termEnd = reportTermEnd(document);
  const term: BsasTerm | null = bsasTerm(document.fields, termEnd);
  return term ? allocateBsas(term, followOnWork(document, effort, termEnd)) : null;
}

/** The Scope by Bucket rows, rounded as the printed table rounds them so they foot to the work package tables. */
export function planBuckets(document: EngagementDocument, effort: ScopedEffort): PlanBucket[] {
  const fit = effort.internal.fit;
  if (!fit) return [];
  const bsasOnly = isBsasOnly(document.fields);
  const label = (entitlement: string, bsas: string) => (bsasOnly ? bsas : entitlement);
  const followOnTotal = effort.workPackages.reduce((sum, row) => sum + (row.followOn && row.followOn.total > 0 ? row.followOn.total : 0), 0);
  const hasFollowOn = effort.workPackages.some(row => row.followOn && row.followOn.total > 0);
  const inEntitlement = whole(effort.totals.total);
  const depth = whole(fit.buckets.E2);
  const core = Math.abs(fit.buckets.E1 + fit.buckets.E2 - inEntitlement) < 2 ? inEntitlement - depth : whole(fit.buckets.E1);
  const followOn = hasFollowOn && Math.abs(fit.buckets.F - followOnTotal) < 2 ? whole(followOnTotal) : whole(fit.buckets.F);
  return [
    { key: "E1", name: label("This entitlement: core", "BSAS: core"), covers: "Discovery, design, the pathway build, dated migration waves and VCF Operations at Tier 1", hours: core },
    { key: "E2", name: label("This entitlement: depth", "BSAS: depth"), covers: "Selected outcomes, remaining waves and depth tiers, in priority order", hours: depth },
    { key: "F", name: label("Follow-on entitlement", "Follow-on scope"), covers: "Year two, with design already complete", hours: followOn },
    { key: "C", name: "Customer-funded", covers: label("Work wanted this year beyond the entitlement, through CDW", "Work wanted this year beyond the BSAS hours, through CDW"), hours: whole(fit.buckets.C) },
    ...(fit.reserveHours >= 1 ? [{ key: "reserve" as const, name: label("This entitlement: reserve", "BSAS: reserve"), covers: "Held back for change requests and estimate variance; reviewed at month 6", hours: whole(fit.reserveHours) }] : []),
  ];
}

/** Where a work package's hours come from. */
export function packageHoursProvenance(row: Pick<WorkPackageEffort, "adjusted" | "owner">, source: ScopedEffort["source"]): Provenance {
  if (source === "assignments") return { state: "confirmed", source: "Signed resource assignments print instead" };
  if (row.owner !== "cdw") return { state: "confirmed", source: row.owner === "customer" ? "Customer-owned: no CDW hours" : "Checkpoint: no hours" };
  return row.adjusted ? { state: "confirmed", source: "Set by the planner" } : { state: "assumed", source: "Services catalog baseline" };
}

/** Where the plan's windows come from: the generator, or a person on the timeline. */
export function windowProvenance(document: Pick<EngagementDocument, "planAuthority">): Provenance {
  return document.planAuthority === "manual" ? { state: "confirmed", source: "Hand-edited plan" } : { state: "assumed", source: "Generated from the pathway" };
}
