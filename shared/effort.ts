import { barWindow } from "./buildingBlocks";
import { canonicalAddOn, completedReport } from "./report";
import type { Timeline } from "./fcp";
import { activityOwner, calculateEntitlementEndDate, DELIVERY_ROLE_BY_WORKSTREAM, stampActivityOwners, type ActivityOwner, effectiveDeliveryPath, effectivePlatformEdition, FIXED_GANTT_CATEGORIES, resolvePlanOutcomes, type EngagementDocument, type TimelineBar, type TimelineLane } from "./fcp";

/**
 * Hours model for the Condensed FCP, after the fcp-builder skill's fcp_hours.py.
 *
 * Scoped effort is priced from the services catalog (the ROM estimator's Required Hours table): the smallest
 * bracket that fits the estate, never per-host constants. Each line's base hours are split by role (lead 100%,
 * support 15%, project manager 25% of the two) unless the catalog entry sets its own support or PM share. Migration and in-place waves have no bracket and are solved to the envelope.
 * Signed Resource Assignments replace the calculated table on the page when they are entered.
 *
 * This module holds no rates. The envelope is the entitled hours when known; the server may supply an
 * envelope estimated from the entitlement value. The fit result is internal and never rendered.
 */

export const ROLE_LOADING = 1.4375;

type Lead = "architect" | "srConsultant";
type LineKind = "core" | "repeatable" | "addon" | "fill";

/** Catalog brackets: base hours, lead role, and any support or PM share that differs from the default. Codes stay internal. */
const CATALOG = {
  A1: { base: 75, lead: "architect" }, A2: { base: 100, lead: "architect" }, A3: { base: 165, lead: "architect" }, A4: { base: 230, lead: "architect" },
  // Design discovery, sized like the former discovery brackets; consultant-led.
  DD1: { base: 34, lead: "srConsultant" }, DD2: { base: 85, lead: "srConsultant" }, DD3: { base: 200, lead: "srConsultant" },
  D1: { base: 90, lead: "srConsultant" }, D2: { base: 135, lead: "srConsultant" }, D3: { base: 195, lead: "srConsultant" }, D4: { base: 210, lead: "srConsultant" },
  D5: { base: 210, lead: "srConsultant" }, D6: { base: 225, lead: "srConsultant" }, D7: { base: 300, lead: "srConsultant" }, D8: { base: 410, lead: "srConsultant" },
  // Discovery: 8 architect hours for each capability area the customer is interested in, with no support or PM.
  DX: { base: 8, lead: "architect", support: 0, pm: 0 },
  X1: { base: 70, lead: "srConsultant" }, X2: { base: 70, lead: "srConsultant" }, X3: { base: 70, lead: "srConsultant" }, X4: { base: 35, lead: "srConsultant" },
  // X5 (VCF Network) is not in the Required Hours table; it keeps the earlier catalog size.
  X5: { base: 80, lead: "srConsultant" }, X6: { base: 100, lead: "architect" }, X7: { base: 20, lead: "architect" },
  // Private AI includes Supervisor and VKS.
  X8: { base: 95, lead: "srConsultant" },
  X9: { base: 40, lead: "srConsultant" }, X10: { base: 70, lead: "srConsultant" }, X11: { base: 36, lead: "architect" }, X12: { base: 68, lead: "architect" },
  X13: { base: 40, lead: "srConsultant" }, X14: { base: 40, lead: "srConsultant" }, X15: { base: 40, lead: "srConsultant" },
  // VCF Networking with VPCs (1 domain): 100 architect, 20 consultant.
  X16: { base: 100, lead: "architect", support: 0.2 },
} as const satisfies Record<string, { base: number; lead: Lead; support?: number; pm?: number }>;
export type CatalogCode = keyof typeof CATALOG;

/** Base hours for a wave line with no envelope to solve against, and for a proving run. */
const DEFAULT_WAVE_BASE = { migration: 60, inPlace: 40 };
const PROVING_RUN_BASE = 28;
/** Share of an add-on's base hours that is its design work, when scope must be reduced to fit. */
const ADD_ON_DESIGN_SHARE = 0.25;

export type EffortLine = {
  workstream: string;
  code: CatalogCode | "FILL";
  kind: LineKind;
  lead: Lead;
  /** Catalog (or default) base hours before any reduction. */
  fullBase: number;
  base: number;
  /** Why the line is smaller than its full size, when it is. */
  reduction?: "proving run" | "design only" | "one domain";
};

export type RoleHours = { architect: number; srConsultant: number; projectManager: number };
export type EffortRow = RoleHours & { workstream: string; total: number; note?: string };

/** Plan cost against the entitlement value: within up to 90%, near up to 100%, over beyond it. */
export const COST_THRESHOLDS = { near: 0.9, over: 1 } as const;
export type CostStatus = "within" | "near" | "over" | "no-value";
export type PlanCost = { planCost: number; followOnCost: number; entitlementValue: number; ratio: number | null; status: CostStatus; byPackage: Record<string, number> };

export function costStatus(ratio: number | null): CostStatus {
  if (ratio === null) return "no-value";
  return ratio > COST_THRESHOLDS.over ? "over" : ratio >= COST_THRESHOLDS.near ? "near" : "within";
}

export type FitStatus = "no-envelope" | "fits" | "fits-reduced" | "short";
/** Calculated hours on one timeline work package, with its window and lead delivery role. */
export type WorkPackageEffort = RoleHours & {
  id: string;
  label: string;
  category: TimelineLane["category"] | null;
  workstreamType: TimelineLane["workstreamType"] | null;
  leadRole: string;
  /** ISO dates of the work package's window; null when the work is no longer on the timeline. */
  start: string | null;
  end: string | null;
  total: number;
  /** Why a work package on the timeline carries no CDW hours. */
  note?: "customer-owned" | "checkpoint" | "not in the scoped hours";
  /** Why the work package moves after the entitlement window; it carries no entitlement hours. */
  deferred?: DeferralReason;
  /** Hours of deferred work, planned as follow-on scope in the Two-Year Notional; not counted in the entitlement. */
  followOn?: RoleHours & { total: number };
  /** Where the planner placed the work package; automatic follows the entitlement hours and budget. */
  placement: "auto" | "entitlement" | "notional";
  /** Who carries the work package (the planner's choice or the default). */
  owner: ActivityOwner;
  /** The calculated hours before any planner adjustment. */
  baseline: RoleHours;
  /** True when the planner set hours for at least one role. */
  adjusted: boolean;
};

export type DeferralReason = "not funded" | "after the entitlement window" | "over budget" | "planned for later";

export type ScopedEffort = {
  /** Which table the report shows. */
  source: "assignments" | "calculated";
  rows: EffortRow[];
  /** The calculated hours spread over the timeline work packages that deliver them; columns foot to the calculated totals. */
  workPackages: WorkPackageEffort[];
  totals: RoleHours & { total: number };
  /** INTERNAL: the calculated lines and the fit against the envelope. Never rendered in the report. */
  internal: {
    lines: EffortLine[];
    calculatedRows: EffortRow[];
    envelopeHours: number | null;
    envelopeSource: "entitled hours" | "entitlement value" | "none";
    fullScopeHours: number;
    planHours: number;
    /** Dollar view of the plan against the entitlement value, filled in by the server; planner screens only. */
    cost?: PlanCost;
    status: FitStatus;
    shortfallHours: number;
    headroomHours: number;
  };
};

export function splitRoles(base: number, lead: Lead, supportShare = 0.15, pmShare = 0.25): RoleHours {
  const support = supportShare * base;
  const architect = lead === "architect" ? base : support;
  const srConsultant = lead === "architect" ? support : base;
  return { architect, srConsultant, projectManager: pmShare * (architect + srConsultant) };
}

/** A line's hours by role, with its catalog entry's support and PM shares; `base` defaults to the line's current size. */
function rolesOf(item: Pick<EffortLine, "code" | "base" | "lead">, base = item.base): RoleHours {
  const entry: { support?: number; pm?: number } = item.code === "FILL" ? {} : CATALOG[item.code] as { support?: number; pm?: number };
  return splitRoles(base, item.lead, entry.support, entry.pm);
}

const loaded = (item: Pick<EffortLine, "code" | "base" | "lead">) => {
  const roles = rolesOf(item);
  return roles.architect + roles.srConsultant + roles.projectManager;
};

function line(workstream: string, code: CatalogCode, kind: LineKind): EffortLine {
  const entry = CATALOG[code];
  return { workstream, code, kind, lead: entry.lead, fullBase: entry.base, base: entry.base };
}

function fillLine(workstream: string, base: number): EffortLine {
  return { workstream, code: "FILL", kind: "fill", lead: "srConsultant", fullBase: base, base };
}

function designBracket(sites: number, servers: number): CatalogCode {
  if (sites <= 1 && servers <= 25) return "A1";
  if (sites <= 1 && servers <= 65) return "A2";
  if (sites <= 3 && servers <= 100) return "A3";
  return "A4";
}

function discoveryBracket(sites: number, servers: number): CatalogCode {
  if (sites <= 1 && servers <= 50) return "DD1";
  if (sites <= 3 && servers <= 100) return "DD2";
  return "DD3";
}

/** Smallest deploy bracket covering instances, workload domains, nodes and edges. */
function deployBracket(input: { instances: number; workloadDomains: number; nodes: number; consolidated: boolean }): CatalogCode {
  const { instances, workloadDomains, nodes, consolidated } = input;
  const options: Array<{ code: CatalogCode; instances: number; wld: number; nodes: number; consolidatedOnly?: boolean }> = [
    { code: "D1", instances: 1, wld: 0, nodes: 15, consolidatedOnly: true },
    { code: "D2", instances: 1, wld: 1, nodes: 24 },
    { code: "D3", instances: 2, wld: 0, nodes: 24 },
    { code: "D4", instances: 1, wld: 4, nodes: 64 },
    { code: "D5", instances: 1, wld: 2, nodes: 100 },
    { code: "D6", instances: 2, wld: 2, nodes: 45 },
    { code: "D7", instances: 2, wld: 5, nodes: 75 },
    { code: "D8", instances: 4, wld: 6, nodes: 125 },
  ];
  const fit = options.find(option => instances <= option.instances
    && workloadDomains <= option.wld
    && nodes <= option.nodes
    && (!option.consolidatedOnly || consolidated));
  return fit?.code ?? "D8";
}

/** Catalog lines for the engagement's plan and estate. */
export function scopedEffortLines(document: EngagementDocument): EffortLine[] {
  const { fields, inventory, report } = document;
  const path = effectiveDeliveryPath(fields);
  const vvf = effectivePlatformEdition(fields) === "vvf";
  const outcomes = new Set(resolvePlanOutcomes(fields).outcomes.map(outcome => outcome.key));
  const has = (...keys: string[]) => keys.some(key => outcomes.has(key));
  const hasAny = (capability: string) => Array.from(outcomes).some(key => key.startsWith(`${capability}:`));

  const servers = inventory.hosts || report.discovery.esxHosts || 0;
  const sites = Math.max(1, inventory.datacenters || report.discovery.datacenters || 1);
  const instances = Math.max(1, report.discovery.vcfInstances || 1);
  const topology = fields.adoptionDetails.domainTopology;
  const consolidated = topology === "consolidated" || (topology === "undecided" && servers > 0 && servers <= 10);
  const lines: EffortLine[] = [];

  // Design is always in scope; discovery is added only when no prior assessment exists.
  const design = "Design discovery, architecture and design";
  lines.push(line(design, designBracket(sites, servers), "core"));
  if (report.discovery.assessmentCompleted !== true) {
    lines.push(line(design, discoveryBracket(sites, servers), "core"));
    const addOns = new Set(report.discovery.addOnsPurchased.map(canonicalAddOn));
    const areas = [
      hasAny("operations") || hasAny("automation"),
      Array.from(outcomes).some(key => key.startsWith("networking:") && key !== "networking:physical-fabric"),
      hasAny("security"),
      has("resilience:core", "resilience:recovery-architecture", "resilience:recovery-exercises"),
      addOns.has("hcx"),
      hasAny("kubernetes"),
      has("resilience:cyber-recovery", "resilience:cloud-cyber-recovery") || addOns.has("acc"),
      hasAny("private-ai"),
    ].filter(Boolean).length;
    if (areas) lines.push({ ...line(design, "DX", "core"), fullBase: 8 * areas, base: 8 * areas });
  }

  // Platform build by pathway.
  if (path === "greenfield" || path === "hybrid" || path === "converge") {
    const workstream = vvf ? "VVF foundation build" : path === "converge" ? "Converged management domain build" : path === "hybrid" ? "Shared foundation build" : "Management domain build";
    const code: CatalogCode = vvf
      ? (consolidated ? "D1" : "D2")
      : deployBracket({ instances, workloadDomains: consolidated ? 0 : 1, nodes: servers, consolidated });
    lines.push(line(workstream, code, "core"));
  }
  if (path === "import-workload-domain") {
    const domains = Math.max(1, report.discovery.vcenters || 1);
    for (let index = 0; index < domains; index += 1) lines.push(line("Workload domain import", "X1", index === 0 ? "core" : "repeatable"));
  }
  if (path === "greenfield" || path === "hybrid") lines.push(fillLine("Workload migration waves", DEFAULT_WAVE_BASE.migration));
  if (path === "in-place") lines.push(fillLine("In-place upgrade waves", DEFAULT_WAVE_BASE.inPlace));

  const designOnly = path === "design-only" || path === "undecided";
  const firstAddOn = lines.length;
  {
    if (!vvf && has("networking:vpc")) lines.push(line("NSX networking, Edge and VPC", "X16", "addon"));
    else if (!vvf && has("networking:edge-cluster-routing")) lines.push(line("NSX networking and Edge", "X6", "addon"));
    else if (!vvf && has("networking:overlay-transport", "networking:network-operations")) lines.push(line("NSX networking", "X5", "addon"));
    if (vvf && has("networking:physical-fabric")) lines.push(line("VDS networking", "X7", "addon"));
    if (has("automation:vm-self-service", "automation:day-2-automation", "automation:core", "automation:infrastructure-as-code", "automation:governance", "automation:application-provisioning")) {
      lines.push(line("Automation and self-service", has("automation:infrastructure-as-code", "automation:governance", "automation:application-provisioning") ? "X3" : "X2", "addon"));
    }
    if (has("operations:observability", "operations:custom-dashboards", "operations:capacity-cost", "operations:event-integration", "operations:core")) lines.push(line("VCF Operations, dashboards and logs", "X4", "addon"));
    if (hasAny("kubernetes") && !hasAny("private-ai")) lines.push(line("Supervisor and VKS", "X9", "addon"));
    if (hasAny("private-ai")) lines.push(line("Private AI Services", "X8", "addon"));
    if (has("automation:data-services")) lines.push(line("Data Services Manager", "X13", "addon"));
    if (has("security:ids-ips", "security:malware-prevention", "security:security-intelligence", "security:identity-firewall")) lines.push(line("vDefend firewall and threat prevention", "X12", "addon"));
    else if (has("security:segmentation")) lines.push(line("vDefend distributed firewall", "X11", "addon"));
    if (has("resilience:recovery-architecture", "resilience:recovery-exercises", "resilience:cyber-recovery", "resilience:core")) lines.push(line("VMware Live Recovery", "X10", "addon"));
    if (has("resilience:cloud-cyber-recovery")) lines.push(line("Live Cyber Recovery", "X14", "addon"));
    if (has("networking:load-balancing", "security:waf")) lines.push(line("Avi Load Balancer and WAF", "X15", "addon"));
  }
  // With no build in scope, each selected component is designed but not implemented.
  if (designOnly) for (const item of lines.slice(firstAddOn)) { item.base = item.fullBase * ADD_ON_DESIGN_SHARE; item.reduction = "design only"; }
  return lines;
}

function rowsFromLines(lines: EffortLine[]): EffortRow[] {
  const byWorkstream = new Map<string, RoleHours & { notes: Set<string> }>();
  for (const item of lines) {
    const roles = rolesOf(item);
    const row = byWorkstream.get(item.workstream) ?? { architect: 0, srConsultant: 0, projectManager: 0, notes: new Set<string>() };
    row.architect += roles.architect;
    row.srConsultant += roles.srConsultant;
    row.projectManager += roles.projectManager;
    if (item.reduction) row.notes.add(item.reduction);
    byWorkstream.set(item.workstream, row);
  }
  // Round each cell, then total the rounded cells so every row and column foots.
  return Array.from(byWorkstream.entries()).map(([workstream, row]) => {
    const architect = Math.round(row.architect);
    const srConsultant = Math.round(row.srConsultant);
    const projectManager = Math.round(row.projectManager);
    return { workstream, architect, srConsultant, projectManager, total: architect + srConsultant + projectManager, ...(row.notes.size ? { note: Array.from(row.notes).join(", ") } : {}) };
  });
}

function totalsOf(rows: EffortRow[]): RoleHours & { total: number } {
  return rows.reduce((sum, row) => ({
    architect: sum.architect + row.architect,
    srConsultant: sum.srConsultant + row.srConsultant,
    projectManager: sum.projectManager + row.projectManager,
    total: sum.total + row.total,
  }), { architect: 0, srConsultant: 0, projectManager: 0, total: 0 });
}

/**
 * Fits the catalog scope to the envelope. When it fits, the wave line grows to use the envelope exactly.
 * When it does not: one-time work keeps its catalog size, repeatable work drops to a proving run (one wave,
 * one domain), add-ons drop to their design work, and any remaining gap is reported as a shortfall.
 */
export function fitToEnvelope(lines: EffortLine[], envelopeHours: number | null) {
  const working = lines.map(item => ({ ...item }));
  const sum = () => working.reduce((total, item) => total + loaded(item), 0);
  const fullScopeHours = sum();
  const fills = working.filter(item => item.kind === "fill");
  if (envelopeHours === null) return { lines: working, fullScopeHours, status: "no-envelope" as FitStatus, shortfallHours: 0, headroomHours: 0 };

  /** Shares what is left of the envelope across the wave lines, optionally capped at their full size. */
  const growFills = (target: number, capAtFullSize: boolean) => {
    if (!fills.length) return;
    const room = (target - sum()) / ROLE_LOADING / fills.length;
    for (const fill of fills) {
      const next = fill.base + room;
      fill.base = Math.max(Math.min(fill.base, PROVING_RUN_BASE), capAtFullSize ? Math.min(fill.fullBase, next) : next);
    }
  };

  if (fullScopeHours <= envelopeHours) {
    growFills(envelopeHours, false);
    const headroom = Math.max(0, envelopeHours - sum());
    return { lines: working, fullScopeHours, status: "fits" as FitStatus, shortfallHours: 0, headroomHours: headroom };
  }

  for (const item of working) {
    if (item.kind === "fill") { item.base = PROVING_RUN_BASE; item.reduction = "proving run"; }
    if (item.kind === "addon") { item.base = item.fullBase * ADD_ON_DESIGN_SHARE; item.reduction = "design only"; }
  }
  const reduced = working.filter(item => !(item.kind === "repeatable"));
  const dropped = working.length - reduced.length;
  if (dropped) reduced.filter(item => item.code === "X1").forEach(item => { item.reduction = "one domain"; });
  working.splice(0, working.length, ...reduced);

  const afterReduction = sum();
  if (afterReduction <= envelopeHours) {
    // Spend what is left on the proving run, up to its full wave size.
    growFills(envelopeHours, true);
    for (const fill of fills) if (fill.base >= fill.fullBase) delete fill.reduction;
    return { lines: working, fullScopeHours, status: "fits-reduced" as FitStatus, shortfallHours: 0, headroomHours: Math.max(0, envelopeHours - sum()) };
  }
  return { lines: working, fullScopeHours, status: "short" as FitStatus, shortfallHours: afterReduction - envelopeHours, headroomHours: 0 };
}

/** The entitlement end: an approved extension, the recorded term, or one year from the entitlement start. */
export function entitlementTermEnd(document: EngagementDocument): string | null {
  const { report, fields } = document;
  if (report.entitlement.extensionTo && report.entitlement.extensionApprovedBy) return report.entitlement.extensionTo;
  return report.entitlement.termEnd || calculateEntitlementEndDate(fields.entitlementStart) || fields.entitlementEnd || null;
}

// ---------------------------------------------------------------------------------------------
// Hours by timeline work package
// ---------------------------------------------------------------------------------------------

const DESIGN_BARS = /^bar-(platform-plan|playbook-design-|playbook-component-design-|platform-execution-decision|platform-design-authority|platform-operating-readiness)/;
const BUILD_BARS = /^bar-(management-domain|workload-domain|converge-management-domain|vvf-|import-foundation-validation|in-place-preparation|platform-licensing|platform-handover)/;
/** Work packages each catalog line pays for: the implementation bars, or the component design bar when the line is design only. */
const ADD_ON_BARS: Partial<Record<CatalogCode, { bars: RegExp; design: string }>> = {
  X2: { bars: /^bar-(cloud-)?automation(-(?!data-services).*)?$/, design: "automation" },
  X3: { bars: /^bar-(cloud-)?automation(-(?!data-services).*)?$/, design: "automation" },
  X4: { bars: /^bar-(cloud-)?operations(-.*)?$|^bar-playbook-adoption-/, design: "operations" },
  X5: { bars: /^bar-(cloud-)?networking-(?!physical-fabric|load-balancing)|^bar-vcf-networking-nsx$/, design: "networking" },
  X6: { bars: /^bar-(cloud-)?networking-(?!physical-fabric|load-balancing)|^bar-vcf-networking-nsx$/, design: "networking" },
  X16: { bars: /^bar-(cloud-)?networking-(?!physical-fabric|load-balancing)|^bar-vcf-networking-nsx$/, design: "networking" },
  X7: { bars: /^bar-networking-physical-fabric$/, design: "networking" },
  X8: { bars: /^bar-(cloud-)?private-ai/, design: "private-ai" },
  X9: { bars: /^bar-(cloud-)?kubernetes/, design: "kubernetes" },
  X10: { bars: /^bar-(cloud-)?resilience-(?!cloud-cyber-recovery)/, design: "resilience" },
  X11: { bars: /^bar-(cloud-)?security-(?!waf)|^bar-security-services-platform$/, design: "security" },
  X12: { bars: /^bar-(cloud-)?security-(?!waf)|^bar-security-services-platform$/, design: "security" },
  X13: { bars: /^bar-(cloud-)?automation-data-services/, design: "automation" },
  X14: { bars: /^bar-(cloud-)?resilience-cloud-cyber-recovery/, design: "resilience" },
  X15: { bars: /^bar-(cloud-)?(networking-load-balancing|security-waf)/, design: "networking" },
};

function barsForLine(item: EffortLine): (id: string) => boolean {
  if (/^(A\d|DD\d|DX)$/.test(item.code)) return id => DESIGN_BARS.test(id);
  if (/^D\d/.test(item.code)) return id => BUILD_BARS.test(id);
  if (item.code === "X1") return id => /^bar-(import-foundation-validation|import-workload-domain)$/.test(id);
  if (item.code === "FILL") return id => /^bar-playbook-execution-/.test(id);
  const addOn = ADD_ON_BARS[item.code];
  if (!addOn) return () => false;
  if (item.reduction === "design only") return id => id === `bar-playbook-component-design-${addOn.design}`;
  return id => addOn.bars.test(id);
}

/** Rounds each column so it foots to its target: floors, then hands the remainder to the largest fractions. */
function footedColumn(values: number[], target: number): number[] {
  const floors = values.map(Math.floor);
  let remainder = target - floors.reduce((sum, value) => sum + value, 0);
  const order = values.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((left, right) => right.fraction - left.fraction);
  for (let step = 0; remainder !== 0 && step < order.length * 2; step += 1) {
    const { index } = order[step % order.length];
    if (remainder > 0) { floors[index] += 1; remainder -= 1; } else if (floors[index] > 0) { floors[index] -= 1; remainder += 1; }
  }
  return floors;
}

/**
 * Spreads each catalog line over the timeline work packages that deliver it, weighted by each package's
 * length, so the hours sit in the windows and under the lead roles the timeline already shows. A line
 * whose work packages were removed from the timeline keeps its hours on a row of its own.
 *
 * Work the entitlement cannot carry keeps its hours as follow-on scope in the Two-Year Notional: an
 * add-on's build when only its design fits, anything starting after the entitlement ends, and anything
 * the planner places there. The planner's hours replace the baseline wherever the work is planned.
 */
export function workPackageEffort(source: EngagementDocument, lines: EffortLine[], totals: RoleHours): WorkPackageEffort[] {
  const document = withOwnership(source);
  const timeline = document.adoptionTimeline;
  const bars = timeline.lanes.flatMap(lane => lane.bars.map(bar => ({ lane, bar })));
  // Only CDW-owned work carries CDW hours.
  const cdw = (id: string) => { const placed = bars.find(({ bar }) => bar.id === id); return !placed || activityOwner(placed.bar) === "cdw"; };
  const termEnd = entitlementTermEnd(document);
  const overrides = new Map(document.report.workPackageHours.map(item => [item.id, item]));
  const deferred = new Map<string, DeferralReason>();
  for (const item of lines) {
    const addOn = item.code === "FILL" ? undefined : ADD_ON_BARS[item.code];
    if (addOn && item.reduction === "design only") for (const { bar } of bars) if (addOn.bars.test(bar.id)) deferred.set(bar.id, "not funded");
  }
  for (const { bar } of bars) {
    const placement = overrides.get(bar.id)?.placement ?? "auto";
    if (placement === "entitlement") deferred.delete(bar.id);
    if (placement === "notional") deferred.set(bar.id, "planned for later");
    const window = barWindow(timeline, bar);
    // Hours cannot be consumed after the entitlement ends, whatever the placement.
    if (termEnd && window && window.start > termEnd) deferred.set(bar.id, "after the entitlement window");
  }

  type Accumulated = RoleHours & { label: string };
  // The entitlement baseline (footed to the catalog totals) and the follow-on estimate are kept apart.
  const inWindow = new Map<string, Accumulated>();
  const followOn = new Map<string, Accumulated>();
  // An add-on build the planner pinned to the entitlement, beyond the catalog fit.
  const pinned = new Map<string, Accumulated>();
  const add = (target: Map<string, Accumulated>, key: string, label: string, roles: RoleHours, share: number) => {
    const row = target.get(key) ?? { label, architect: 0, srConsultant: 0, projectManager: 0 };
    row.architect += roles.architect * share;
    row.srConsultant += roles.srConsultant * share;
    row.projectManager += roles.projectManager * share;
    target.set(key, row);
  };
  // Weighted by length, capped so a long-running oversight package does not take most of a line's hours.
  const cap = timeline.cadence === "week" ? 8 : 2;
  const spread = (matches: typeof bars, roles: RoleHours, keep: (id: string) => boolean, target: Map<string, Accumulated>) => {
    const weights = matches.map(({ bar }) => Math.min(cap, Math.max(1, bar.endCol - bar.startCol)));
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    matches.forEach(({ bar }, index) => { if (keep(bar.id)) add(target, bar.id, bar.label, roles, weights[index] / weightTotal); });
  };
  for (const item of lines) {
    const roles = rolesOf(item);
    // Customer-owned packages keep their share of the line, which then drops out of CDW's hours.
    const matches = bars.filter(({ bar }) => barsForLine(item)(bar.id) && activityOwner(bar) !== "checkpoint");
    // Work the planner placed in the notional keeps its share of the line and takes it out of the entitlement.
    const current = matches.filter(({ bar }) => !deferred.has(bar.id) || deferred.get(bar.id) === "planned for later");
    if (current.length) spread(current, roles, () => true, inWindow);
    else add(inWindow, `line:${item.workstream}`, item.reduction ? `${item.workstream} (${item.reduction})` : item.workstream, roles, 1);
    // Deferred packages of the line get their share as a follow-on estimate.
    spread(matches, roles, id => deferred.has(id) && deferred.get(id) !== "planned for later", followOn);
    // An add-on cut to its design keeps the rest of its hours on its build packages, as follow-on scope.
    const addOn = item.code === "FILL" ? undefined : ADD_ON_BARS[item.code];
    if (addOn && item.reduction === "design only" && item.fullBase > item.base) {
      const build = bars.filter(({ bar }) => addOn.bars.test(bar.id) && cdw(bar.id));
      if (build.length) {
        spread(build, rolesOf(item, item.fullBase - item.base), id => deferred.has(id), followOn);
        spread(build, rolesOf(item, item.fullBase - item.base), id => !deferred.has(id), pinned);
      }
    }
  }

  const footed = (source: Map<string, Accumulated>, target: (key: keyof RoleHours, values: number[]) => number) => {
    const entries = Array.from(source.entries());
    const columns = (["architect", "srConsultant", "projectManager"] as const).map(key => footedColumn(entries.map(([, row]) => row[key]), target(key, entries.map(([, row]) => row[key]))));
    return entries.map(([id, row], index) => [id, { row, roles: { architect: columns[0][index], srConsultant: columns[1][index], projectManager: columns[2][index] } }] as const);
  };
  const baselines = new Map([
    ...footed(inWindow, key => totals[key]),
    ...footed(followOn, (_key, values) => Math.round(values.reduce((sum, value) => sum + value, 0))),
    ...footed(pinned, (_key, values) => Math.round(values.reduce((sum, value) => sum + value, 0))),
  ]);
  const entries = Array.from(baselines.entries());
  const lanes = new Map(bars.map(({ lane, bar }) => [bar.id, { lane, bar }]));
  const ids = [...bars.map(({ bar }) => bar.id), ...entries.map(([id]) => id).filter(id => !lanes.has(id))];

  return ids.map((id): WorkPackageEffort => {
    const placed = lanes.get(id);
    const entry = baselines.get(id);
    const baseline = entry?.roles ?? { architect: 0, srConsultant: 0, projectManager: 0 };
    const window = placed ? barWindow(timeline, placed.bar) : null;
    const owner = placed ? activityOwner(placed.bar) : "cdw";
    const note: WorkPackageEffort["note"] = owner === "checkpoint" ? "checkpoint" : owner === "customer" ? "customer-owned" : undefined;
    const override = overrides.get(id);
    const editable = !note && override;
    const roles = editable
      ? { architect: override.architect ?? baseline.architect, srConsultant: override.srConsultant ?? baseline.srConsultant, projectManager: override.projectManager ?? baseline.projectManager }
      : note ? { architect: 0, srConsultant: 0, projectManager: 0 } : baseline;
    const sum = roles.architect + roles.srConsultant + roles.projectManager;
    const reason = deferred.get(id);
    const lane = placed?.lane ?? null;
    return {
      id,
      label: placed?.bar.label ?? entry?.row.label ?? id,
      category: lane?.category ?? null,
      workstreamType: lane?.workstreamType ?? null,
      leadRole: lane ? DELIVERY_ROLE_BY_WORKSTREAM[lane.workstreamType] : "",
      start: window?.start ?? null,
      end: window?.end ?? null,
      ...(reason ? { architect: 0, srConsultant: 0, projectManager: 0, total: 0, deferred: reason, followOn: { ...roles, total: sum } } : { ...roles, total: sum }),
      baseline,
      adjusted: Boolean(editable && (override.architect !== null || override.srConsultant !== null || override.projectManager !== null)),
      placement: override?.placement ?? "auto",
      owner,
      ...(note ? { note } : !reason && sum === 0 ? { note: "not in the scoped hours" as const } : {}),
    };
  }).sort((left, right) => categoryIndex(left.category) - categoryIndex(right.category) || (left.start ?? "9999").localeCompare(right.start ?? "9999") || left.label.localeCompare(right.label));
}

/** Work packages that are design work; the budget limit never moves them out of the entitlement. */
export const isDesignWorkPackage = (id: string) => DESIGN_BARS.test(id);

/** Moves work packages out of the entitlement into follow-on scope and recalculates the entitlement totals. */
export function deferWorkPackages(effort: ScopedEffort, moves: Map<string, DeferralReason>): ScopedEffort {
  if (!moves.size) return effort;
  const workPackages = effort.workPackages.map(row => {
    const reason = moves.get(row.id);
    if (!reason || row.deferred) return row;
    return { ...row, architect: 0, srConsultant: 0, projectManager: 0, total: 0, deferred: reason, followOn: { architect: row.architect, srConsultant: row.srConsultant, projectManager: row.projectManager, total: row.total } };
  });
  if (effort.source === "assignments") return { ...effort, workPackages };
  const totals = workPackages.reduce((sum, row) => ({ architect: sum.architect + row.architect, srConsultant: sum.srConsultant + row.srConsultant, projectManager: sum.projectManager + row.projectManager, total: sum.total + row.total }), { architect: 0, srConsultant: 0, projectManager: 0, total: 0 });
  return { ...effort, workPackages, totals, internal: { ...effort.internal, planHours: totals.total } };
}

/**
 * The timelines as the customer sees them: deferred work leaves the entitlement timeline and starts in the
 * Two-Year Notional the month after the entitlement ends, keeping its order and length.
 */
export function timelinesWithDeferrals(document: EngagementDocument, deferredIds: string[]): { adoption: Timeline; notional: Timeline } {
  const ids = new Set(deferredIds);
  const adoption: Timeline = { ...document.adoptionTimeline, lanes: document.adoptionTimeline.lanes.map(lane => ({ ...lane, bars: lane.bars.filter(bar => !ids.has(bar.id)) })) };
  const notional = document.twoYearPlan;
  const termEnd = entitlementTermEnd(document);
  const start = /^(\d{4})-(\d{2})/.exec(notional.startDate);
  const end = termEnd ? /^(\d{4})-(\d{2})/.exec(termEnd) : null;
  if (!ids.size || !start || !end) return { adoption, notional };
  // First notional month after the entitlement ends (monthly columns from the notional start).
  const firstAfter = (Number(end[1]) - Number(start[1])) * 12 + Number(end[2]) - Number(start[2]) + 2;
  const moving = notional.lanes.flatMap(lane => lane.bars).filter(bar => ids.has(bar.id) && bar.startCol < firstAfter);
  if (!moving.length || firstAfter > notional.columns.length) return { adoption, notional };
  const earliest = Math.min(...moving.map(bar => bar.startCol));
  const last = notional.columns.length + 1;
  return {
    adoption,
    notional: {
      ...notional,
      lanes: notional.lanes.map(lane => ({
        ...lane,
        bars: lane.bars.map(bar => {
          if (!moving.includes(bar)) return bar;
          const startCol = Math.min(notional.columns.length, firstAfter + bar.startCol - earliest);
          return { ...bar, startCol, endCol: Math.min(last, Math.max(startCol + 1, startCol + bar.endCol - bar.startCol)) };
        }),
      })),
    },
  };
}

/** The timeline without the given work packages, for display. */
export function withoutBars(timeline: Timeline, ids: Set<string>): Timeline {
  return ids.size ? { ...timeline, lanes: timeline.lanes.map(lane => ({ ...lane, bars: lane.bars.filter(bar => !ids.has(bar.id)) })) } : timeline;
}

/** Puts the hidden work packages back into an edited view, so editing the entitlement view never drops them. */
export function withHiddenBars(edited: Timeline, original: Timeline, ids: Set<string>): Timeline {
  if (!ids.size) return edited;
  const hidden = new Map(original.lanes.map(lane => [lane.id, lane.bars.filter(bar => ids.has(bar.id))]));
  return { ...edited, lanes: edited.lanes.map(lane => ({ ...lane, bars: [...lane.bars, ...(hidden.get(lane.id) ?? [])] })) };
}

/** The document with every timeline bar stamped with who carries it: the planner's choice, or the defaults. */
export function withOwnership(document: EngagementDocument): EngagementDocument {
  const owners = new Map<string, ActivityOwner>();
  // On VVF the physical fabric is the VDS networking work CDW is scoped for; on VCF it is a customer site prerequisite.
  if (effectivePlatformEdition(document.fields) === "vvf") owners.set("bar-networking-physical-fabric", "cdw");
  for (const item of document.report.workPackageHours) if (item.owner !== "auto") owners.set(item.id, item.owner);
  return { ...document, adoptionTimeline: stampActivityOwners(document.adoptionTimeline, owners), twoYearPlan: stampActivityOwners(document.twoYearPlan, owners) };
}
const categoryIndex = (category: TimelineLane["category"] | null) => (category ? FIXED_GANTT_CATEGORIES.indexOf(category) : FIXED_GANTT_CATEGORIES.length);

export function buildScopedEffort(document: EngagementDocument, options: { envelopeHours?: number | null; envelopeSource?: ScopedEffort["internal"]["envelopeSource"] } = {}): ScopedEffort {
  const entitled = document.report.entitlement.hours;
  const envelopeHours = entitled ?? options.envelopeHours ?? null;
  const envelopeSource = entitled !== null ? "entitled hours" : envelopeHours !== null ? options.envelopeSource ?? "entitlement value" : "none";
  const fitted = fitToEnvelope(scopedEffortLines(document), envelopeHours);
  const calculatedRows = rowsFromLines(fitted.lines);
  const assignments = completedReport(document.report).resourceAssignments.map(item => ({
    workstream: item.workstream,
    architect: item.architect,
    srConsultant: item.srConsultant,
    projectManager: item.projectManager,
    total: item.architect + item.srConsultant + item.projectManager,
  }));
  const workPackages = workPackageEffort(document, fitted.lines, totalsOf(calculatedRows));
  const planned = workPackages.filter(row => row.total > 0);
  const rows = assignments.length ? assignments : calculatedRows;
  // The calculated plan is the work packages as adjusted by the planner; it falls back to the catalog lines with no timeline.
  const calculatedTotals = planned.length ? planned.reduce((sum, row) => ({ architect: sum.architect + row.architect, srConsultant: sum.srConsultant + row.srConsultant, projectManager: sum.projectManager + row.projectManager, total: sum.total + row.total }), { architect: 0, srConsultant: 0, projectManager: 0, total: 0 }) : totalsOf(calculatedRows);
  return {
    source: assignments.length ? "assignments" : "calculated",
    rows,
    workPackages,
    totals: assignments.length ? totalsOf(assignments) : calculatedTotals,
    internal: {
      lines: fitted.lines,
      calculatedRows,
      envelopeHours,
      envelopeSource,
      fullScopeHours: Math.round(fitted.fullScopeHours),
      planHours: calculatedTotals.total,
      status: fitted.status,
      shortfallHours: Math.round(fitted.shortfallHours),
      headroomHours: Math.round(fitted.headroomHours),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Customer effort by phase
// ---------------------------------------------------------------------------------------------

export type CustomerEffortPhase = {
  phase: string;
  window: string;
  startDate: string;
  platformLead: number;
  operations: number;
  network: number;
  total: number;
  fte: number;
};

type PhaseKey = "design" | "build" | "migration" | "capability" | "recovery" | "handover";

/** Default customer hours per week by phase type: platform lead, operations, network. */
export const CUSTOMER_EFFORT_DEFAULTS: Record<PhaseKey, { phase: string; platformLead: number; operations: number; network: number }> = {
  design: { phase: "Design sessions and design sign-off", platformLead: 3, operations: 2, network: 2 },
  build: { phase: "Platform build", platformLead: 4, operations: 2, network: 2 },
  migration: { phase: "Migration waves", platformLead: 8, operations: 6, network: 1 },
  capability: { phase: "Capability enablement", platformLead: 3, operations: 3, network: 1 },
  recovery: { phase: "Recovery design and build", platformLead: 3, operations: 3, network: 2 },
  handover: { phase: "Knowledge transfer and handover", platformLead: 2, operations: 3, network: 1 },
};

function phaseOf(activity: TimelineBar): PhaseKey | null {
  const id = activity.id;
  if (/^bar-(playbook-design-|playbook-component-design-|platform-plan$)/.test(id)) return "design";
  if (/^bar-(management-domain|vvf-foundation|vvf-workload-clusters|workload-domain|vcf-networking-nsx|converge-management-domain|import-foundation-validation|in-place-preparation|networking-|hcl-|soft-prerequisite-)/.test(id)) return "build";
  if (/^bar-(playbook-execution-|import-workload-domain$)/.test(id)) return "migration";
  if (/^bar-resilience-/.test(id)) return "recovery";
  if (/^bar-(operations-|cloud-|security-|platform-licensing$|playbook-adoption-)/.test(id)) return "capability";
  if (id === "bar-platform-handover") return "handover";
  return null;
}

const monthYear = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const monthOnly = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

export function formatWindow(start: string, end: string): string {
  if (start.slice(0, 7) === end.slice(0, 7)) return monthYear(start);
  return start.slice(0, 4) === end.slice(0, 4) ? `${monthOnly(start)} – ${monthYear(end)}` : `${monthYear(start)} – ${monthYear(end)}`;
}

/** Customer effort per phase from the plan's windows and the default hours per week. */
export function buildCustomerEffort(document: EngagementDocument): { phases: CustomerEffortPhase[]; peak: CustomerEffortPhase | null } {
  const timeline = document.adoptionTimeline;
  const windows = new Map<PhaseKey, { start: string; end: string }>();
  for (const activity of timeline.lanes.flatMap(lane => lane.bars)) {
    const key = phaseOf(activity);
    const window = key ? barWindow(timeline, activity) : null;
    if (!key || !window) continue;
    const current = windows.get(key);
    windows.set(key, current ? { start: window.start < current.start ? window.start : current.start, end: window.end > current.end ? window.end : current.end } : window);
  }
  // Customer-run waves extend the migration phase.
  for (const work of completedReport(document.report).customerOwnedWork) {
    const start = work.start.length === 7 ? `${work.start}-01` : work.start;
    const end = work.end.length === 7 ? `${work.end}-28` : work.end;
    const current = windows.get("migration");
    windows.set("migration", current ? { start: start < current.start ? start : current.start, end: end > current.end ? end : current.end } : { start, end });
  }
  const phases = Array.from(windows.entries()).map(([key, window]) => {
    const defaults = CUSTOMER_EFFORT_DEFAULTS[key];
    const total = defaults.platformLead + defaults.operations + defaults.network;
    return { phase: defaults.phase, window: formatWindow(window.start, window.end), startDate: window.start, platformLead: defaults.platformLead, operations: defaults.operations, network: defaults.network, total, fte: Math.round((total / 40) * 100) / 100 };
  }).sort((left, right) => left.startDate.localeCompare(right.startDate));
  const peak = phases.reduce<CustomerEffortPhase | null>((best, phase) => (!best || phase.total > best.total ? phase : best), null);
  return { phases, peak };
}

// ---------------------------------------------------------------------------------------------
// Burndown (Services Status Report method, after burndown.py)
// ---------------------------------------------------------------------------------------------

export type Burndown = {
  entitledHours: number;
  consumedHours: number;
  remainingHours: number;
  pctConsumed: number;
  pctElapsed: number;
  termStart: string;
  termEnd: string;
  asOf: string;
  daysToExpiry: number;
  /** Customer-facing: hours per week to consume the entitlement before it lapses. */
  expiryPace: number;
  expiryPaceFte: number;
  extended: boolean;
  /** INTERNAL: PMBOK sign, negative is behind. Never rendered. */
  gapPoints: number;
  /** INTERNAL: never rendered. */
  band: "AT RISK" | "WATCH" | "ON TRACK";
};

const DAY = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export function buildBurndown(document: EngagementDocument, today = new Date().toISOString().slice(0, 10)): Burndown | null {
  const { report, fields } = document;
  const entitled = report.entitlement.hours;
  if (!entitled) return null;
  const consumed = report.entitlement.hoursConsumed ?? 0;
  const termStart = report.entitlement.termStart || fields.entitlementStart;
  const extended = Boolean(report.entitlement.extensionTo && report.entitlement.extensionApprovedBy);
  const termEnd = (extended ? report.entitlement.extensionTo : null) || report.entitlement.termEnd || calculateEntitlementEndDate(fields.entitlementStart) || fields.entitlementEnd;
  if (!termStart || !termEnd || toTime(termEnd) <= toTime(termStart)) return null;
  const asOf = report.asOf || today;
  const elapsed = Math.min(1, Math.max(0, (toTime(asOf) - toTime(termStart)) / (toTime(termEnd) - toTime(termStart))));
  const remaining = Math.max(0, entitled - consumed);
  const daysToExpiry = Math.max(0, Math.round((toTime(termEnd) - toTime(asOf)) / DAY));
  const weeks = daysToExpiry / 7;
  const expiryPace = weeks > 0 ? remaining / weeks : remaining;
  const pctConsumed = consumed / entitled;
  const gapPoints = Math.round((pctConsumed - elapsed) * 1000) / 10;
  const absolute = Math.abs(gapPoints);
  return {
    entitledHours: entitled,
    consumedHours: consumed,
    remainingHours: remaining,
    pctConsumed,
    pctElapsed: elapsed,
    termStart,
    termEnd,
    asOf,
    daysToExpiry,
    expiryPace: Math.round(expiryPace * 10) / 10,
    expiryPaceFte: Math.round((expiryPace / 40) * 100) / 100,
    extended,
    gapPoints,
    band: absolute >= 24 ? "AT RISK" : absolute >= 11 ? "WATCH" : "ON TRACK",
  };
}
