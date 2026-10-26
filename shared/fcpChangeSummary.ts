import { bsasTerm } from "./bsas";
import { consumedBetween } from "./consumption";
import type { ScopedEffort } from "./effort";
import { effectivePlatformEdition, planOutcomeLabel, resolvePlanOutcomes, type EngagementDocument } from "./fcp";
import { reportTermEnd } from "./reportView";

/**
 * What changed between two issued FCP versions, in customer-safe terms: hours and dates only, never rates or
 * dollars. Computed at issue and stored on the version; the revision note is the architect's wording, the facts here
 * are not editable. docs/FCP-WORKSPACE.md section 13.5.
 */

export type DateWindow = { start: string; end: string };

export type PackageChange = {
  id: string;
  label: string;
  change: "added" | "removed" | "to-follow-on" | "from-follow-on" | "hours";
  /** CDW hours in the entitlement before and after (follow-on hours are reported apart). */
  hoursBefore: number;
  hoursAfter: number;
};

export type ChangeSummary = {
  /** The issue number this version is compared against; null for the first issue. */
  basedOnIssue: number | null;
  packages: PackageChange[];
  entitlementHours: { before: number; after: number };
  followOnHours: { before: number; after: number };
  windows: Array<{ id: string; label: string; before: DateWindow | null; after: DateWindow | null }>;
  dates: Array<{ key: "plannedStart" | "implementationStart" | "targetComplete" | "termEnd" | "bsasStart" | "bsasEnd"; label: string; before: string | null; after: string | null }>;
  outcomesOn: string[];
  outcomesOff: string[];
  depths: Array<{ area: string; before: string; after: string }>;
  /** Hours delivered since the version compared against, from the consumption entries. */
  consumption: { hours: number; asOf: string } | null;
};


/** One side of a comparison: the document and the effort as they were (or are) issued. */
export type IssueSnapshot = { document: EngagementDocument; effort: ScopedEffort; issueNumber: number | null };

const UNDECIDED_DEPTH = / — depth to be confirmed$/;
const customerLabel = (label: string) => label.replace(UNDECIDED_DEPTH, "");
const whole = (value: number) => Math.round(value);
const DEPTH_AREAS: Array<[keyof EngagementDocument["fields"]["adoptionDetails"]["componentDepths"], string]> = [
  ["operations", "Operations"], ["automation", "Automation"], ["networkingSecurity", "Networking and security"], ["kubernetesAi", "Kubernetes and Private AI"], ["efficiency", "Efficiency features"],
];
const DEPTH_WORD: Record<string, string> = { "not-selected": "Not selected", "tier-1": "Tier 1", "tier-2": "Tier 2", "tier-3": "Tier 3" };

function packagesOf(effort: ScopedEffort) {
  return new Map(effort.workPackages.map(row => [row.id, { label: customerLabel(row.label), inWindow: row.deferred ? 0 : whole(row.total), followOn: whole(row.followOn?.total ?? 0), deferred: Boolean(row.deferred), window: !row.deferred && row.start && row.end ? { start: row.start, end: row.end } : null }]));
}

function keyDates(document: EngagementDocument) {
  const { fields } = document;
  const termEnd = reportTermEnd(document);
  const bsas = bsasTerm(fields, termEnd);
  return {
    plannedStart: ["Planned project start", fields.plannedProjectStart || null],
    implementationStart: ["Implementation services start", fields.plannedImplementationStart || null],
    targetComplete: ["Target completion", fields.targetComplete || null],
    termEnd: ["Entitlement term end", termEnd],
    bsasStart: ["BSAS term start", bsas?.termStart ?? null],
    bsasEnd: ["BSAS term end", bsas?.termEnd ?? null],
  } as const;
}

const consumptionOf = (document: EngagementDocument) => {
  const { hoursConsumed, consumedAsOf } = document.report.entitlement;
  return hoursConsumed !== null && consumedAsOf ? { asOf: consumedAsOf, consumedHours: hoursConsumed } : null;
};

/**
 * What changed from `before` (the issued version this one revises, or null for a first issue) to `after`. Hours and
 * dates only. Customer-safe: labels drop the planner's "depth to be confirmed" prompt, and nothing reads rates or money.
 */
export function computeChangeSummary(before: IssueSnapshot | null, after: Omit<IssueSnapshot, "issueNumber">): ChangeSummary {
  const was = before ? packagesOf(before.effort) : new Map<string, ReturnType<typeof packagesOf> extends Map<string, infer V> ? V : never>();
  const now = packagesOf(after.effort);
  const packages: PackageChange[] = [];
  const windows: ChangeSummary["windows"] = [];
  if (before) {
    for (const [id, next] of Array.from(now)) {
      const prior = was.get(id);
      if (!prior) { if (next.inWindow || next.followOn) packages.push({ id, label: next.label, change: "added", hoursBefore: 0, hoursAfter: next.inWindow }); continue; }
      if (!prior.deferred && next.deferred) packages.push({ id, label: next.label, change: "to-follow-on", hoursBefore: prior.inWindow, hoursAfter: 0 });
      else if (prior.deferred && !next.deferred) packages.push({ id, label: next.label, change: "from-follow-on", hoursBefore: 0, hoursAfter: next.inWindow });
      else if (prior.inWindow !== next.inWindow) packages.push({ id, label: next.label, change: "hours", hoursBefore: prior.inWindow, hoursAfter: next.inWindow });
      if (prior.window && next.window && (prior.window.start !== next.window.start || prior.window.end !== next.window.end)) windows.push({ id, label: next.label, before: prior.window, after: next.window });
    }
    for (const [id, prior] of Array.from(was)) if (!now.has(id) && (prior.inWindow || prior.followOn)) packages.push({ id, label: prior.label, change: "removed", hoursBefore: prior.inWindow, hoursAfter: 0 });
  }
  const followOn = (effort: ScopedEffort) => whole(effort.workPackages.reduce((sum, row) => sum + (row.followOn?.total ?? 0), 0));

  const dates: ChangeSummary["dates"] = [];
  if (before) {
    const prior = keyDates(before.document);
    const next = keyDates(after.document);
    for (const key of Object.keys(next) as Array<keyof typeof next>) if (prior[key][1] !== next[key][1]) dates.push({ key, label: next[key][0], before: prior[key][1], after: next[key][1] });
  }

  const outcomes = (document: EngagementDocument) => {
    const edition = effectivePlatformEdition(document.fields);
    return new Map(resolvePlanOutcomes(document.fields).outcomes.map(outcome => [outcome.key, planOutcomeLabel(outcome.key, edition)]));
  };
  const priorOutcomes = before ? outcomes(before.document) : new Map<string, string>();
  const nextOutcomes = outcomes(after.document);
  const depths: ChangeSummary["depths"] = before
    ? DEPTH_AREAS.flatMap(([key, area]) => {
        const prior = before.document.fields.adoptionDetails.componentDepths[key];
        const next = after.document.fields.adoptionDetails.componentDepths[key];
        return prior === next ? [] : [{ area, before: DEPTH_WORD[prior] ?? prior, after: DEPTH_WORD[next] ?? next }];
      })
    : [];

  const consumedBefore = before ? consumptionOf(before.document) : null;
  const consumedAfter = consumptionOf(after.document);
  const consumption = consumedAfter && (!consumedBefore || consumedAfter.asOf !== consumedBefore.asOf || consumedAfter.consumedHours !== consumedBefore.consumedHours) ? consumedBetween(consumedBefore, consumedAfter) : null;

  return {
    basedOnIssue: before?.issueNumber ?? null,
    packages,
    entitlementHours: { before: before ? whole(before.effort.totals.total) : 0, after: whole(after.effort.totals.total) },
    followOnHours: { before: before ? followOn(before.effort) : 0, after: followOn(after.effort) },
    windows,
    dates,
    outcomesOn: before ? Array.from(nextOutcomes).filter(([key]) => !priorOutcomes.has(key)).map(([, label]) => label) : [],
    outcomesOff: before ? Array.from(priorOutcomes).filter(([key]) => !nextOutcomes.has(key)).map(([, label]) => label) : [],
    depths,
    consumption,
  };
}

/** True when nothing a customer would notice changed (a first issue always counts as a change). */
export function isEmptyChange(summary: ChangeSummary): boolean {
  return summary.basedOnIssue !== null && !summary.packages.length && !summary.windows.length && !summary.dates.length && !summary.outcomesOn.length && !summary.outcomesOff.length && !summary.depths.length && !summary.consumption
    && summary.entitlementHours.before === summary.entitlementHours.after && summary.followOnHours.before === summary.followOnHours.after;
}
