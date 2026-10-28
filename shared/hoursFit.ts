import { HOURS_V2 as H } from "./hoursConfig";
import { ESTATE_SIZE_UNKNOWN_FLAG } from "./estateSize";
import { loadedOf, type Pass1, type V2Code, type V2Line, type V2Unit } from "./hoursV2";
import type { Capability } from "./fcp";

/**
 * v2 hours model, Pass 2 (fit): partitions the Pass 1 scope into four buckets against the entitlement, in
 * the priority order of spec 7.4, splitting lines only at the unit boundaries of spec 7.5. Pass 1 is read,
 * never changed: every unit lands whole in one bucket, and a displaced add-on's design share is carved out of
 * that same line, so the buckets always add up to the Pass 1 total.
 */

export type Bucket = "E1" | "E2" | "F" | "C";
export type DisplacedReason = "ran out" | "no owner" | "customer deferred" | "cannot cover" | "considered only" | "design phased";

export type Placement = {
  code: V2Code;
  line: string;
  unitId: string;
  label: string;
  /** Lead-role hours placed. */
  base: number;
  /** Lead + secondary + the line's share of PM. */
  loaded: number;
  bucket: Bucket;
  /** Fill step from spec 7.4 (1 to 9). */
  step: number;
  /** A displaced add-on's 25% design share, placed in E2. */
  designShare?: boolean;
  reason?: DisplacedReason;
};

export type FitV2 = {
  entitlementHours: number;
  /** Hours already delivered against the entitlement; the plan schedules only what is left. */
  deliveredHours: number;
  /** The reserve share of the hours left after delivery. */
  reserveHours: number;
  /** entitlement_hours minus the hours delivered and the reserve: delivered + fillable + reserve = entitlement. */
  fillableHours: number;
  placements: Placement[];
  buckets: Record<Bucket, number>;
  /** Fillable hours left after the fill; separate from the reserve and can be zero. */
  entitlementRemaining: number;
  /** Loaded hours of fill steps 1 to 5. */
  coreRequiredHours: number;
  /** The core (steps 1 to 5) by line, largest first: what to look at when the core does not fit. */
  coreByLine: Array<{ code: V2Code; line: string; loaded: number; step: number }>;
  /**
   * The minimum the entitlement must carry (discovery, the design, the foundation build and the Operations design) does not
   * fit. `gapHours` is that minimum less the fillable hours, with the design phased by deliverable if it could be;
   * `fullScopeGapHours` is how many more hours the same work needs with the full design in year one. Nothing is split
   * further: this is for the planner and the internal Delivery Handoff, and never prints for the customer.
   */
  underFunded: { gapHours: number; fullScopeGapHours: number } | null;
  /** The design is delivered in phases by deliverable: the foundation now, workload domain, DR and NSX overlay design in the follow-on. */
  designPhased: boolean;
  /** Set by the server when the core did not fit: the hours and work packages moved to the Two-Year Notional. */
  movedToFollowOn?: { hours: number; packages: string[] };
  /** Work packages moved out of the entitlement after the fill, in the order they moved, with why; shown under Scope by Bucket. */
  scopeMoves?: ScopeMove[];
  monthsRemaining: number;
  requiredMonthlyBurn: number;
  /** Displaced lines whose design share did not fit in E2 and moved with the line. */
  designShareFlags: string[];
  notFunded: Array<{ code: V2Code; line: string; label: string; loaded: number; bucket: "F" | "C"; reason: DisplacedReason }>;
  /** Waves the customer's team runs after CDW's: estimated as CDW would run them, in no bucket and no CDW hours. */
  customerRun: { hours: number; waves: number };
  warnings: string[];
  notes: string[];
};

export type ScopeMove = { label: string; hours: number; reason: "after the entitlement window" | "over budget" | "merged" };

export type FitOptions = {
  entitlementHours: number;
  /** Hours already delivered against the entitlement, none when unset. */
  deliveredHours?: number;
  monthsRemaining: number;
  /** The customer's outcome ranking; the default order of spec 7.4 step 6 fills in the rest. */
  ranking?: Capability[];
  /** Outcomes the customer wants this year: when displaced they go to C (customer-funded) instead of F. */
  wantThisYear?: Capability[];
  /** Migration waves with a date behind them, filled in E1 (step 4); the rest wait for step 7. */
  datedWaves: number;
  /** Share of the hours left after delivery held back, 0 to 0.5; the 8% default when unset. */
  reserveShare?: number;
  /** The customer's team runs the waves CDW's entitlement does not carry, so they are not CDW follow-on scope. */
  wavesMode?: "cdw" | "customer-remaining" | "customer-all";
};

/** Spec 7.4 step 6 default order when the customer has not ranked outcomes. Operations modules beyond Tier 1 come last. */
export const DEFAULT_OUTCOME_ORDER: Capability[] = ["networking", "security", "resilience", "automation", "kubernetes", "private-ai", "operations"];
const SPINE: V2Code[] = ["D", "D_VVF", "S_storage", "NX", "C1", "R_remed", "X1", "U3", "U_VVF", "FILL_ip"];

type Item = { line: V2Line; unit: V2Unit; step: number; order: number };

/** Orders lines so each comes after the lines it requires, keeping the given order otherwise. */
function afterRequirements(lines: V2Line[]): V2Line[] {
  const placed: V2Line[] = [];
  const pending = [...lines];
  const present = new Set(lines.map(line => line.code));
  while (pending.length) {
    const index = pending.findIndex(line => line.requires.every(code => !present.has(code) || placed.some(item => item.code === code)));
    placed.push(...pending.splice(index < 0 ? 0 : index, 1));
  }
  return placed;
}

/** The units of the plan in fill order, each with its spec 7.4 step. */
function fillOrder(pass1: Pass1, options: FitOptions): Item[] {
  const ranking = [...(options.ranking ?? []), ...DEFAULT_OUTCOME_ORDER.filter(capability => !options.ranking?.includes(capability))];
  const rank = (line: V2Line) => (line.capability ? ranking.indexOf(line.capability) : ranking.length);
  const items: Item[] = [];
  let order = 0;
  const push = (line: V2Line, unit: V2Unit, step: number) => items.push({ line, unit, step, order: order++ });
  const byCode = (code: V2Code) => pass1.lines.filter(line => line.code === code);

  // 1. Discovery. 2. Design. 3. The pathway spine.
  for (const line of [...byCode("DD"), ...byCode("DX")]) for (const unit of line.units.filter(item => item.tier === 1)) push(line, unit, 1);
  // On a small estate the hardware review comes first, then the design; the access mapping follows the foundation build.
  for (const line of byCode("AK")) for (const unit of line.units) push(line, unit, 2);
  for (const line of byCode("AH")) for (const unit of line.units) push(line, unit, 2);
  for (const line of byCode("A")) for (const unit of line.units) push(line, unit, 2);
  for (const code of SPINE) for (const line of byCode(code)) for (const unit of line.units.filter(item => item.tier === 1)) push(line, unit, 3);
  // Fill order c: the role and access mapping rides with the foundation, after the build.
  for (const line of byCode("AR")) for (const unit of line.units) push(line, unit, 3);
  // Fill order d: the migration plan, the proving waves, then e: the first workload domain (before the rest of the operations build).
  for (const line of byCode("AP")) for (const unit of line.units) push(line, unit, 4);
  // 4. Migration waves with a date behind them (the first wave carries the HCX setup and pilot). 7. The rest.
  // CDW runs every wave by default, so the whole waves package sits at step 4 and is funded whole or moves whole to the follow-on.
  // Only when the customer asks to run the remaining waves do the waves past the dated ones drop to step 7; when they ask to run all, none is CDW's.
  const wavesMode = options.wavesMode ?? "cdw";
  for (const line of byCode("FILL_mig")) {
    line.units.filter(item => item.tier === 1).forEach((unit, index) => push(line, unit, wavesMode === "cdw" || index < Math.max(1, options.datedWaves) ? 4 : 7));
  }
  for (const line of byCode("DW")) for (const unit of line.units) push(line, unit, 4.5);
  // 5. The Operations design is reserved by the fit itself (the design share of the X4 line), not a unit.
  // 6. VCF Operations at Tier 1 (the platform term, health and logs, lifecycle), then the selected outcomes at Tier 1, in the customer's ranking, each after the lines it needs.
  const outcomeLines = afterRequirements(pass1.lines.filter(line => line.capability && line.code !== "EF").sort((left, right) => rank(left) - rank(right)));
  for (const line of byCode("X4")) for (const unit of line.units.filter(item => item.tag === "ops-core")) push(line, unit, 6);
  for (const line of outcomeLines) for (const unit of line.units.filter(item => item.tier === 1 && item.tag !== "ops-core")) push(line, unit, 6);
  // 8. Depth: Tier 2 uplifts, then Tier 3, in the customer's ranking.
  for (const tier of [2, 3] as const) for (const line of outcomeLines) for (const unit of line.units.filter(item => item.tier === tier)) push(line, unit, 8);
  // 9. Efficiency.
  for (const line of byCode("EF")) for (const unit of line.units) push(line, unit, 9);
  // Anything a step did not claim (the EF uplift) fills last.
  const claimed = new Set(items.map(item => item.unit.id));
  for (const line of pass1.lines) for (const unit of line.units) if (!claimed.has(unit.id)) push(line, unit, 9);
  // When the customer runs every wave, none of the waves line is CDW's, at any depth.
  return items.filter(item => !(wavesMode === "customer-all" && item.line.code === "FILL_mig")).sort((left, right) => left.step - right.step || left.order - right.order);
}

const ADD_ON = /^(X|EF$)/;

/** Pass 2: the buckets. Reads Pass 1 and never writes to it. */
export function fitV2(pass1: Pass1, options: FitOptions): FitV2 {
  const entitlementHours = options.entitlementHours;
  // Delivered hours are spent: the reserve and the plan share only what is left, so delivered + planned + reserve
  // adds up to the entitlement.
  const deliveredHours = Math.min(entitlementHours, Math.max(0, options.deliveredHours ?? 0));
  const reserveHours = (entitlementHours - deliveredHours) * (options.reserveShare ?? H.fit.reserveShare.value);
  const fillableHours = entitlementHours - deliveredHours - reserveHours;
  const eps = 1e-9;
  const loaded = (line: V2Line, base: number) => loadedOf(pass1, line, base);
  // Lines the brief only considers never draw on the entitlement; they are placed in the follow-on after the fill.
  const items = fillOrder({ ...pass1, lines: pass1.lines.filter(line => !line.followOnOnly) }, options);
  const stepItems = (step: number) => items.filter(item => item.step === step);
  const hoursOf = (list: Item[]) => list.reduce((sum, item) => sum + loaded(item.line, item.unit.base), 0);
  const discovery = stepItems(1);
  const design = stepItems(2);
  const spine = stepItems(3);
  const laterDesign = (item: Item) => item.unit.tag === "design-workload" || item.unit.tag === "design-dr-nsx";
  const share = H.designOnlyShare.value;
  // The new management domain's VLAN-backed NSX design is core until an NSX design is funded. It is carved out of the
  // networking line, held first, and released at the end if the networking design made it into the entitlement.
  const NETWORKING: V2Code[] = ["X5", "X7", "X6", "X16"];
  const nsx = pass1.nsxMinimalDesign;
  const carvedFrom = nsx && !pass1.lines.includes(nsx) ? NETWORKING.map(code => pass1.lines.find(line => line.code === code && !line.followOnOnly)).find(Boolean) ?? null : null;
  const carveBase = nsx && carvedFrom ? Math.min(nsx.computedBase, carvedFrom.units.filter(unit => unit.tier === 1).reduce((sum, unit) => sum + unit.base, 0)) : 0;
  const nsxCost = carvedFrom ? loaded(carvedFrom, carveBase) : 0;
  const wantThisYear = new Set(options.wantThisYear ?? []);
  const displacedBucket = (line: V2Line): "F" | "C" => (line.capability && wantThisYear.has(line.capability) ? "C" : "F");

  // The Operations design is a package of its own (the component design package, the design share of the X4 line) and
  // part of the minimum the entitlement carries. The build behind it is optional and fills later.
  const opsLine = pass1.lines.find(line => line.code === "X4" && !line.followOnOnly && !line.designOnly) ?? null;
  const opsDesignBase = opsLine ? share * opsLine.units.filter(unit => unit.tier === 1).reduce((sum, unit) => sum + unit.base, 0) : 0;
  const opsDesignCost = opsLine && opsDesignBase > 0 ? loaded(opsLine, opsDesignBase) : 0;

  // The minimum: discovery, the design, the foundation build and the Operations design. Whole packages, in that order.
  // If it does not fit, the design is phased by deliverable (never by hours); if it still does not fit, the plan is
  // under-funded and nothing is split further.
  const buildHours = hoursOf(spine) + nsxCost;
  const needWith = (designItems: Item[]) => hoursOf(discovery) + hoursOf(designItems) + buildHours + opsDesignCost;
  const fullNeed = needWith(design);
  let coreDesign = design;
  let designPhased = false;
  if (fullNeed > fillableHours + eps && design.some(laterDesign)) {
    coreDesign = design.filter(item => !laterDesign(item));
    designPhased = true;
  }
  const coreNeed = needWith(coreDesign);
  const underFunded: FitV2["underFunded"] = coreNeed > fillableHours + eps ? { gapHours: coreNeed - fillableHours, fullScopeGapHours: fullNeed - fillableHours } : null;
  const coreItems = [...discovery, ...coreDesign, ...spine];
  const coreRequiredHours = hoursOf(coreItems) + opsDesignCost;
  const coreByLine = [
    ...Array.from(coreItems.reduce((map, item) => {
      const row = map.get(item.line.code) ?? { code: item.line.code, line: item.line.name, loaded: 0, step: item.step };
      row.loaded += loaded(item.line, item.unit.base);
      return map.set(item.line.code, row);
    }, new Map<V2Code, { code: V2Code; line: string; loaded: number; step: number }>()).values()),
    ...(opsDesignCost ? [{ code: "X4" as V2Code, line: "Operations design", loaded: opsDesignCost, step: 5 }] : []),
  ].sort((left, right) => right.loaded - left.loaded);

  const placements: Placement[] = [];
  const place = (item: Item, bucket: Bucket, base = item.unit.base, extra: Partial<Placement> = {}) => placements.push({
    code: item.line.code, line: item.line.name, unitId: item.unit.id, label: item.unit.label, base, loaded: loaded(item.line, base), bucket, step: item.step, ...extra,
  });
  const displaced: Item[] = [];
  const customerRun: Item[] = [];
  const wavesMode = options.wavesMode ?? "cdw";
  if (wavesMode === "customer-all") for (const line of pass1.lines.filter(entry => entry.code === "FILL_mig")) for (const unit of line.units.filter(entry => entry.tier === 1)) customerRun.push({ line, unit, step: 7, order: -1 });
  const wavesCost = items.filter(entry => entry.line.code === "FILL_mig" && entry.step === 4).reduce((sum, entry) => sum + loaded(entry.line, entry.unit.base), 0);
  let wavesWhole: boolean | undefined;
  const groupFits = new Map<string, boolean>();
  const reasonOf = new Map<string, DisplacedReason>();
  const sharedLines = new Set<V2Code>();

  for (const item of coreItems) place(item, "E1");
  for (const item of design.filter(item => !coreDesign.includes(item))) { displaced.push(item); reasonOf.set(item.unit.id, "design phased"); }
  let used = hoursOf(coreItems) + nsxCost;
  if (opsLine && opsDesignCost) {
    placements.push({ code: "X4", line: opsLine.name, unitId: "X4:design-share", label: "Design share", base: opsDesignBase, loaded: opsDesignCost, bucket: "E1", step: 5, designShare: true });
    sharedLines.add("X4");
    used += opsDesignCost;
  }

  // Everything after the minimum fills in order, whole units, until the first that does not fit; the rest is follow-on.
  // The migration waves after CDW's proving waves are the customer's with the runbook only when the proving waves are in.
  let stopped = Boolean(underFunded);
  let provingFunded = false;
  let opsReleased = false;
  for (const item of items.filter(entry => entry.step > 3)) {
    const cost = loaded(item.line, item.unit.base);
    const isOps = Boolean(opsLine) && item.line === opsLine && item.unit.tier === 1;
    // Funding the Operations build covers the design reserved for it.
    const credit = isOps && !opsReleased ? opsDesignCost : 0;
    const wholeWaves = wavesMode === "cdw" && item.line.code === "FILL_mig";
    if (wholeWaves && wavesWhole === undefined) wavesWhole = !stopped && used + wavesCost <= fillableHours + eps;
    // The outcomes at Tier 1, and the Operations build (configuration, lifecycle, health and logs), are one package a line:
    // funded whole, or all of it is follow-on. A package is never part funded, so no row carries a remainder.
    const groupKey = item.step === 6 ? `${item.line.code}:${item.unit.tag === "ops-core"}` : null;
    if (groupKey && !groupFits.has(groupKey)) {
      const group = items.filter(entry => entry.step === 6 && entry.line === item.line && (entry.unit.tag === "ops-core") === (item.unit.tag === "ops-core"));
      groupFits.set(groupKey, !stopped && used - credit + hoursOf(group) <= fillableHours + eps);
    }
    const fits = wholeWaves ? Boolean(wavesWhole) : groupKey ? Boolean(groupFits.get(groupKey)) : !stopped && used - credit + cost <= fillableHours + eps;
    if (fits) {
      place(item, item.step <= 4.5 || (item.step === 6 && item.unit.tag === "ops-core") ? "E1" : "E2");
      used += cost - credit;
      if (isOps && !opsReleased) {
        opsReleased = true;
        const reserved = placements.findIndex(entry => entry.unitId === "X4:design-share");
        if (reserved >= 0) placements.splice(reserved, 1);
        sharedLines.delete("X4");
      }
      if (item.line.code === "FILL_mig" && item.step === 4) provingFunded = true;
    } else if (wavesMode === "customer-remaining" && provingFunded && item.line.code === "FILL_mig" && item.step === 7) {
      customerRun.push(item);
    } else if (pass1.estate.small && item.step <= 4.5 && !stopped) {
      // Packages d and e are whole or follow-on: one that does not fit does not hold back the next package that does.
      displaced.push(item);
    } else {
      stopped = true;
      displaced.push(item);
    }
  }
    const stopFill = Boolean(underFunded);
  const designShareFlags: string[] = [];

  // Design share: an add-on with none of its Tier 1 work in the entitlement keeps 25% of its Tier 1 value in E2
  // as design, when it fits; otherwise the share moves with the line and is flagged.
  const funded = new Set(placements.filter(item => item.bucket === "E1" || item.bucket === "E2").map(item => item.unitId));
  const displacedLines = Array.from(new Map(displaced.map(item => [item.line.code, item.line])).values());
  for (const line of displacedLines) {
    if (!ADD_ON.test(line.code) || line.designOnly || sharedLines.has(line.code)) continue;
    const tier1 = line.units.filter(unit => unit.tier === 1);
    if (tier1.some(unit => funded.has(unit.id))) continue;
    const designBase = share * tier1.reduce((sum, unit) => sum + unit.base, 0);
    const cost = loaded(line, designBase);
    if (!stopFill && used + cost <= fillableHours + 1e-9) {
      placements.push({ code: line.code, line: line.name, unitId: `${line.code}:design-share`, label: "Design share", base: designBase, loaded: cost, bucket: "E2", step: 6, designShare: true });
      used += cost;
      sharedLines.add(line.code);
    } else {
      designShareFlags.push(`${line.name}: the 25% design share does not fit in this entitlement and moves with the line.`);
    }
  }
  for (const item of displaced) {
    // A line that kept its design share in E2 carries the remaining 75% of each Tier 1 unit into the later bucket.
    const base = sharedLines.has(item.line.code) && item.unit.tier === 1 ? item.unit.base * (1 - share) : item.unit.base;
    place(item, displacedBucket(item.line), base, { reason: reasonOf.get(item.unit.id) ?? "ran out" });
  }
  for (const line of pass1.lines.filter(item => item.followOnOnly)) {
    for (const unit of line.units) place({ line, unit, step: 9, order: 0 }, "F", unit.base, { reason: "considered only" });
  }

  // An NSX design in the entitlement (the networking component design, in full or as its design share) covers the
  // management domain; otherwise the VLAN-backed NSX design goes into the core with the first management domain,
  // and the networking line's follow-on keeps the rest.
  const nsxDesignFunded = placements.some(item => NETWORKING.includes(item.code) && (item.bucket === "E1" || item.bucket === "E2"));
  const nsxCarved = Boolean(nsx && carvedFrom && carveBase > 0 && !nsxDesignFunded);
  if (nsxCarved) {
    const later = placements.filter(item => item.code === carvedFrom!.code && item.bucket !== "E1" && item.bucket !== "E2" && !item.unitId.includes(":tier-"));
    const laterBase = later.reduce((sum, item) => sum + item.base, 0);
    for (const item of later) { item.base -= carveBase * (item.base / laterBase); item.loaded = loaded(carvedFrom!, item.base); }
    placements.push({ code: "NX", line: nsx!.name, unitId: nsx!.units[0].id, label: nsx!.units[0].label, base: carveBase, loaded: nsxCost, bucket: "E1", step: 3 });
  } else {
    used -= nsxCost;
  }

  const buckets: Record<Bucket, number> = { E1: 0, E2: 0, F: 0, C: 0 };
  for (const item of placements) buckets[item.bucket] += item.loaded;
  const notFunded = Array.from(placements.filter(item => item.bucket === "F" || item.bucket === "C").reduce((map, item) => {
    const key = `${item.code}|${item.bucket}`;
    const row = map.get(key) ?? { code: item.code, line: item.line, label: "", loaded: 0, bucket: item.bucket as "F" | "C", reason: item.reason ?? "ran out" as DisplacedReason, units: [] as string[] };
    row.loaded += item.loaded;
    row.units.push(item.label);
    map.set(key, row);
    return map;
  }, new Map<string, { code: V2Code; line: string; label: string; loaded: number; bucket: "F" | "C"; reason: DisplacedReason; units: string[] }>()).values())
    .map(({ units, ...row }) => ({ ...row, label: units.join("; ") }));

  const customerRunHours = customerRun.reduce((sum, item) => sum + loaded(item.line, item.unit.base), 0);
  const total = pass1.lines.reduce((sum, line) => sum + loaded(line, line.computedBase), 0) - customerRunHours;
  const placedTotal = buckets.E1 + buckets.E2 + buckets.F + buckets.C;
  const warnings: string[] = [];
  if (underFunded) {
    warnings.push(`Under-funded: discovery, the ${designPhased ? "foundation " : ""}design, the foundation build and the Operations design need ${Math.round(coreNeed)} hours, ${Math.round(underFunded.gapHours)} more than the ${Math.round(fillableHours)} fillable hours; the full scope needs ${Math.round(underFunded.fullScopeGapHours)} more. Nothing is split further: record the decision before issuing.`);
  }
  if (designPhased) warnings.push("The design is phased by deliverable: the foundation design is in the entitlement, and the workload domain, DR and NSX overlay design are a follow-on package.");
  if (!pass1.estate.known && pass1.estate.choice === "auto") warnings.push(ESTATE_SIZE_UNKNOWN_FLAG);
  // No bucket is empty by accident: every hour of scope must land somewhere, or something was compressed.
  if (Math.abs(total - placedTotal) > 1e-6) warnings.push(`The buckets hold ${placedTotal.toFixed(1)} hours but the scope is ${total.toFixed(1)}; something was compressed.`);
  if (!buckets.F && !buckets.C && fillableHours - used < 1) warnings.push("The entitlement is fully used and nothing was displaced. Confirm the customer had no outcomes left out.");
  warnings.push(...designShareFlags);

  const monthsRemaining = Math.max(1, options.monthsRemaining);
  const reviewMonth = H.fit.reviewMonth.value;
  const notes = [
    `Hold the ${Math.round(reserveHours)}-hour reserve until month ${reviewMonth}; release it to follow-on items then if it is unused.`,
    `Review burn at month 3 and month ${reviewMonth}. If less than ${Math.round(H.fit.burnCheckpointShare.value * 100)}% of the entitlement is used by month ${reviewMonth}, re-scope: pull work forward from F or request a scope change.`,
    "The entitlement expires at the end of its term; no rollover is assumed unless the account team confirms it in writing.",
    "Follow-on (F) work depends on a future purchase of VCF or a renewal with entitlement attached. It is a forecast, not a commitment.",
  ];
  return {
    entitlementHours, deliveredHours, reserveHours, fillableHours, placements, buckets,
    entitlementRemaining: Math.max(0, fillableHours - used),
    coreRequiredHours: coreRequiredHours + (nsxCarved ? nsxCost : 0), coreByLine, underFunded, designPhased, monthsRemaining,
    requiredMonthlyBurn: (entitlementHours - deliveredHours) / monthsRemaining,
    designShareFlags, notFunded, customerRun: { hours: customerRunHours, waves: customerRun.length }, warnings, notes,
  };
}
