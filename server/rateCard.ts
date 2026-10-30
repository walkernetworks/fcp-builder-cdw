import { barsForLine, buildScopedEffort, costStatus, deferWorkPackages, isDesignWorkPackage, protectedWorkPackages, ROLE_LOADING, withHoursFill, type DeferralReason, type FitMoney, type RoleHours, type ScopedEffort, type WorkPackageEffort, type WorkPlanRoles } from "../shared/effort";
import { HOURS_V2 } from "../shared/hoursConfig";
import type { ScopeMove } from "../shared/hoursFit";
import type { EngagementDocument } from "../shared/fcp";
import { fundedDocument } from "../shared/bsas";

/**
 * INTERNAL ONLY. Broadcom Work Plan rate card and staffing mix from the fcp-builder skill (fcp_hours.py).
 * Used to estimate the funded envelope from the entitlement value when entitled hours are not known.
 * Per-role rates never leave the server and no rate or dollar figure is rendered in a customer document.
 * The planner screens receive derived totals (plan cost, cost per work package, the entitlement value) and,
 * under the v2 hours model, the blended rate the fit used and the dollars per bucket.
 */
const RATE = { architect: 327, srConsultant: 293, seniorArchitect: 328, projectManager: 312, offshoreProjectManager: 69 };
const WORK_PLAN_MIX = { srConsultant: 177 / 276, architect: 32 / 276, seniorArchitect: 8 / 276, projectManager: 42 / 276, offshoreProjectManager: 17 / 276 };

const BLENDED_RATE = (Object.keys(WORK_PLAN_MIX) as Array<keyof typeof WORK_PLAN_MIX>).reduce((sum, role) => sum + RATE[role] * WORK_PLAN_MIX[role], 0);

/** Loaded hours an entitlement value funds at the Work Plan mix. */
export function fundedHoursFromValue(value: number): number | null {
  return value > 0 ? value / BLENDED_RATE : null;
}

const costOf = (roles: RoleHours & WorkPlanRoles) => roles.architect * RATE.architect + roles.srConsultant * RATE.srConsultant + roles.projectManager * RATE.projectManager
  + (roles.seniorArchitect ?? 0) * RATE.seniorArchitect + (roles.offshoreProjectManager ?? 0) * RATE.offshoreProjectManager;

/** Lowest priority first: what moves to the follow-on before anything else when the plan does not fit. */
const EDGE_EVALUATION = "bar-design-edge-sites";
const CAPACITY_AND_COST = "bar-operations-capacity-cost";
const SECURITY_DESIGN = "bar-playbook-component-design-security";
const ESTATE_DISCOVERY = "bar-playbook-design-requirements";
const PATHWAY = "bar-playbook-design-pathway-decision";

/** Work packages that carry only depth (bucket E2) hours: lines the fit placed in E2 and nowhere in E1. */
function depthWorkPackages(effort: ScopedEffort): (id: string) => boolean {
  const placements = effort.internal.fit?.placements ?? [];
  const core = new Set(placements.filter(item => item.bucket === "E1").map(item => item.code));
  const depth = new Set(placements.filter(item => item.bucket === "E2" && !core.has(item.code)).map(item => item.code));
  const lines = effort.internal.lines.filter(line => line.code !== "FILL");
  const tests = (codes: Set<string>) => lines.filter(line => codes.has(line.code)).map(line => barsForLine(line));
  const depthTests = tests(depth);
  const coreTests = tests(core);
  return id => depthTests.some(test => test(id)) && !coreTests.some(test => test(id));
}

type Squeezed = { effort: ScopedEffort; moves: ScopeMove[] };

/**
 * Squeezes as much of the plan into the entitlement as it can carry. While the plan costs more than the entitlement
 * value, or needs more than the entitled hours, unprotected work moves to the Two-Year Notional in a fixed order, lowest
 * priority first: VCF Edge Evaluation, Capacity and Cost Visibility, the depth bucket, Security Design; then Estate
 * Discovery Sessions merge into the pathway package; then the latest remaining work. Work that depends on a moved package
 * moves with it. Protected packages (handover, the runbook and training, licensing, the management domains, the first
 * wave) and work the planner pinned never move. Design and governance move last, latest first, and only when no protected
 * package builds on them; if the protected work alone exceeds the entitlement the plan stays over. Moved work then comes back, earliest first, wherever it still fits.
 */
function withinBudget(document: EngagementDocument, effort: ScopedEffort, value: number, hoursCap: number | null = document.report.entitlement.hours): Squeezed {
  const hours = hoursCap;
  if (!value && !hours) return { effort, moves: [] };
  const bars = document.adoptionTimeline.lanes.flatMap(lane => lane.bars);
  const dependents = new Map<string, string[]>();
  for (const bar of bars) for (const prerequisite of bar.prerequisites ?? []) dependents.set(prerequisite, [...(dependents.get(prerequisite) ?? []), bar.id]);
  const prerequisites = new Map(bars.map(bar => [bar.id, bar.prerequisites ?? []]));
  const rows = new Map(effort.workPackages.map(row => [row.id, row]));
  const kept = protectedWorkPackages(document.adoptionTimeline);
  const depth = depthWorkPackages(effort);
  const named = (id: string) => id === EDGE_EVALUATION || id === CAPACITY_AND_COST || id === SECURITY_DESIGN || depth(id);
  // Last resort, once nothing else is left to move: design and governance work that no protected package builds on.
  let designOpen = false;
  const feedsProtected = (id: string, seen = new Set<string>()): boolean => (dependents.get(id) ?? []).some(next => kept.has(next) || (!seen.has(next) && seen.add(next) && feedsProtected(next, seen)));
  const movable = (id: string) => { const row = rows.get(id); return Boolean(row && row.total > 0 && !row.deferred && row.placement === "auto" && row.category && !kept.has(id) && (named(id) || !isDesignWorkPackage(id) || (designOpen && !feedsProtected(id)))); };
  const byPriority = (test: (id: string) => boolean) => effort.workPackages.filter(row => test(row.id) && movable(row.id)).sort((left, right) => (right.start ?? "").localeCompare(left.start ?? "") || right.total - left.total);
  const moves = new Map<string, DeferralReason>();
  // The plan's own hours: the work packages, which a signed work plan's totals do not replace.
  let cost = costOf(effort.totals);
  let planned = planHours(effort);
  const fits = () => (!value || cost <= value) && (!hours || planned <= hours);
  const move = (id: string) => {
    if (moves.has(id) || !movable(id)) return;
    moves.set(id, "over budget");
    cost -= costOf(rows.get(id)!);
    planned -= rows.get(id)!.total;
    for (const dependent of dependents.get(id) ?? []) move(dependent);
  };
  const steps = [(id: string) => id === EDGE_EVALUATION, (id: string) => id === CAPACITY_AND_COST, depth, (id: string) => id === SECURITY_DESIGN];
  for (const step of steps) for (const row of byPriority(step)) { if (fits()) break; move(row.id); }
  // Then Estate Discovery Sessions run within the pathway sessions: one package, carrying the larger of the two.
  const discovery = rows.get(ESTATE_DISCOVERY);
  const pathway = rows.get(PATHWAY);
  let merged: { saved: WorkPackageEffort; kept: WorkPackageEffort } | null = null;
  if (!fits() && discovery && pathway && discovery.total > 0 && pathway.total > 0 && !discovery.deferred && !pathway.deferred && discovery.placement === "auto" && pathway.placement === "auto") {
    merged = discovery.total <= pathway.total ? { saved: discovery, kept: pathway } : { saved: pathway, kept: discovery };
    cost -= costOf(merged.saved);
    planned -= merged.saved.total;
  }
  // Then the waves after CDW's first one, last first: the first wave always stays, the rest are follow-on.
  const firstWave = effort.workPackages.find(row => kept.has(row.id) && /^bar-playbook-execution-/.test(row.id) && row.total > 0 && !row.deferred && row.placement === "auto");
  // The v1 waves package is the fill line, with no wave units: it gives up what is needed, keeping at least a tenth.
  const v1Fill = (): number[] => {
    const over = Math.max(value && cost > value ? (cost - value) / costOf(firstWave!) : 0, hours && planned > hours ? (planned - hours) / firstWave!.total : 0);
    return over > 0 ? [Math.min(V1_FILL_TRIM_LIMIT, over)] : [];
  };
  let trimmed = 0;
  // Under v2 a package is never cut by hours: the waves stay whole, and other whole packages move instead. Only the v1 fill line is trimmed.
  const waveShares = firstWave && !fits() && !effort.internal.fit ? v1Fill() : [];
  for (const share of waveShares) {
    if (fits()) break;
    const part = scaleRoles(firstWave!, share);
    trimmed += share;
    cost -= costOf(part);
    planned -= part.total;
  }
  for (const row of byPriority(() => true)) { if (fits()) break; move(row.id); }
  // Design that cannot fit does not stay on the entitlement timeline: it moves too, latest first.
  designOpen = true;
  for (const row of byPriority(() => true)) { if (fits()) break; move(row.id); }
  // Fill what is left of the entitlement: bring moved work back, earliest first, where it fits.
  for (const row of effort.workPackages.filter(item => moves.has(item.id)).sort((left, right) => (left.start ?? "").localeCompare(right.start ?? ""))) {
    if ((prerequisites.get(row.id) ?? []).some(id => moves.has(id))) continue;
    cost += costOf(row);
    planned += row.total;
    if (fits()) moves.delete(row.id);
    else { cost -= costOf(row); planned -= row.total; }
  }
  const order = effort.workPackages.filter(row => moves.has(row.id)).map(row => row.id);
  const ranked = [...steps.flatMap(step => order.filter(id => step(id))), ...order];
  const scopeMoves: ScopeMove[] = Array.from(new Set(ranked)).map(id => ({ label: rows.get(id)!.label, hours: rows.get(id)!.total, reason: "over budget" }));
  if (trimmed) scopeMoves.push({ label: `${firstWave!.label}: later waves`, hours: scaleRoles(firstWave!, trimmed).total, reason: "over budget" });
  let result = deferWorkPackages(effort, moves);
  if (trimmed) result = splitToFollowOn(result, firstWave!.id, trimmed);
  if (!merged) return { effort: result, moves: scopeMoves };
  return { effort: mergeDiscoveryIntoPathway(result, discovery!, pathway!), moves: [...scopeMoves, { label: `${discovery!.label} merged into ${pathway!.label}`, hours: merged.saved.total, reason: "merged" }] };
}

const V1_FILL_TRIM_LIMIT = 0.9;

const scaleRoles = (row: RoleHours, share: number) => {
  const roles = { architect: row.architect * share, srConsultant: row.srConsultant * share, projectManager: row.projectManager * share };
  return { ...roles, total: roles.architect + roles.srConsultant + roles.projectManager };
};

/** Moves a share of a work package's hours to the follow-on; the package itself stays in the entitlement. */
function splitToFollowOn(effort: ScopedEffort, id: string, share: number): ScopedEffort {
  const workPackages = effort.workPackages.map((row): WorkPackageEffort => {
    if (row.id !== id) return row;
    const later = scaleRoles(row, share);
    const prior = row.followOn ?? { architect: 0, srConsultant: 0, projectManager: 0, total: 0 };
    return {
      ...row,
      architect: row.architect - later.architect, srConsultant: row.srConsultant - later.srConsultant, projectManager: row.projectManager - later.projectManager, total: row.total - later.total,
      followOn: { architect: prior.architect + later.architect, srConsultant: prior.srConsultant + later.srConsultant, projectManager: prior.projectManager + later.projectManager, total: prior.total + later.total },
    };
  });
  const totals = workPackages.reduce((sum, row) => ({ architect: sum.architect + row.architect, srConsultant: sum.srConsultant + row.srConsultant, projectManager: sum.projectManager + row.projectManager, total: sum.total + row.total }), { architect: 0, srConsultant: 0, projectManager: 0, total: 0 });
  return { ...effort, workPackages, totals, internal: { ...effort.internal, planHours: totals.total } };
}

/** One design package for discovery and the pathway decision: the pathway package carries the larger of the two, discovery none. */
function mergeDiscoveryIntoPathway(effort: ScopedEffort, discovery: WorkPackageEffort, pathway: WorkPackageEffort): ScopedEffort {
  const larger = discovery.total > pathway.total ? discovery : pathway;
  const zero = { architect: 0, srConsultant: 0, projectManager: 0, total: 0 };
  const workPackages = effort.workPackages.map((row): WorkPackageEffort => {
    if (row.id === discovery.id) return { ...row, ...zero, note: "merged" };
    if (row.id === pathway.id) return { ...row, architect: larger.architect, srConsultant: larger.srConsultant, projectManager: larger.projectManager, total: larger.total, label: `${pathway.label}, with ${discovery.label}` };
    return row;
  });
  const totals = workPackages.reduce((sum, row) => ({ architect: sum.architect + row.architect, srConsultant: sum.srConsultant + row.srConsultant, projectManager: sum.projectManager + row.projectManager, total: sum.total + row.total }), { ...zero });
  return { ...effort, workPackages, totals, internal: { ...effort.internal, planHours: totals.total } };
}

/**
 * v2: the entitlement value turned into hours at the blended rate and fitted by Pass 2, with dollars per bucket for
 * the planner. The plan never exceeds the hours left after the reserve: when the core alone needs more, the latest
 * work packages move to the Two-Year Notional as follow-on scope, as the v1 squeeze does, until it fits.
 */
function scopedEffortV2(document: EngagementDocument, today?: string): ScopedEffort {
  const override = document.fields.estimateInputs.blendedRate;
  const blendedRate = override ?? BLENDED_RATE;
  const value = document.fields.entitlementAmount > 0 ? document.fields.entitlementAmount : 0;
  const envelope = document.report.entitlement.hours === null && value ? value / blendedRate : null;
  const built = buildScopedEffort(document, { envelopeHours: envelope, envelopeSource: "entitlement value", today });
  // Under a signed work plan too: the plan's work packages never exceed the hours left after the reserve.
  // v2 never squeezes: the fit places whole packages in the owner's order, phases the design by deliverable and leaves
  // whatever still does not fit under-funded, for a decision. No package is moved or trimmed to make the hours fit.
  const fitted = built;
  // Signed entitled hours can be worth more than the entitlement value; the fill stops at whichever is lower.
  const reserveShare = document.fields.estimateInputs.reservePercent !== undefined ? document.fields.estimateInputs.reservePercent / 100 : HOURS_V2.fit.reserveShare.value;
  // Delivered hours were paid from the same value, and the reserve is a share of what is left after them.
  const delivered = document.report.entitlement.hoursConsumed ?? 0;
  const valueCapHours = value ? Math.max(0, value / blendedRate - delivered) * (1 - reserveShare) : undefined;
  const effort = withHoursFill(valueCapHours === undefined ? fitted : { ...fitted, internal: { ...fitted.internal, valueCapHours } });
  const fit = effort.internal.fit;
  const dollars = (hours: number) => Math.round(hours * blendedRate);
  const money: FitMoney | undefined = fit ? {
    blendedRate,
    rateSource: override ? "planner override" : "rate card",
    buckets: { E1: dollars(fit.buckets.E1), E2: dollars(fit.buckets.E2), F: dollars(fit.buckets.F), C: dollars(fit.buckets.C), reserve: dollars(fit.reserveHours) },
  } : undefined;
  const planCost = dollars(effort.totals.total);
  const followOnCost = dollars(effort.workPackages.reduce((sum, row) => sum + (row.followOn?.total ?? 0), 0));
  const ratio = value ? planCost / value : null;
  const byPackage = Object.fromEntries(effort.workPackages.map(row => [row.id, dollars((row.followOn ?? row).total)]));
  // Under v2 the fit decides what is in the entitlement; only an under-funded core makes the plan cost more than the value.
  const status = fit?.underFunded ? "over" : costStatus(ratio && ratio > 1 ? 1 : ratio);
  return { ...effort, internal: { ...effort.internal, cost: { planCost, followOnCost, entitlementValue: value, ratio, status, byPackage }, ...(money ? { money } : {}) } };
}

/** The plan's hours in the entitlement: its work packages, whatever the totals are taken from. */
const planHours = (effort: ScopedEffort) => effort.workPackages.reduce((sum, row) => sum + row.total, 0);

/** Scoped effort with the envelope filled from the entitlement value when entitled hours are missing, kept within the value, and its cost. */
export function scopedEffortForDocument(source: EngagementDocument, today?: string): ScopedEffort {
  // A BSAS-only deal is planned on the BSAS hours, as entitled hours, over the BSAS term.
  const document = fundedDocument(source);
  if (document.fields.hoursModel === "v2") return scopedEffortV2(document, today);
  const estimated = document.report.entitlement.hours === null ? fundedHoursFromValue(document.fields.entitlementAmount) : null;
  const entitlementValue = document.fields.entitlementAmount > 0 ? document.fields.entitlementAmount : 0;
  const { effort } = withinBudget(document, buildScopedEffort(document, { envelopeHours: estimated, envelopeSource: "entitlement value" }), entitlementValue);
  const planCost = Math.round(costOf(effort.totals));
  const followOnCost = Math.round(effort.workPackages.reduce((sum, row) => sum + (row.followOn ? costOf(row.followOn) : 0), 0));
  const ratio = entitlementValue ? planCost / entitlementValue : null;
  const byPackage = Object.fromEntries(effort.workPackages.map(row => [row.id, Math.round(costOf(row.followOn ?? row))]));
  return { ...effort, internal: { ...effort.internal, cost: { planCost, followOnCost, entitlementValue, ratio, status: costStatus(ratio), byPackage } } };
}

export { ROLE_LOADING };
