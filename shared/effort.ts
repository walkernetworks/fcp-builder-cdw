import { barWindow } from "./buildingBlocks";
import { canonicalAddOn, completedReport } from "./report";
import { BUILD_STAGE_WEIGHTS, HOURS_V2 } from "./hoursConfig";
import { lineRoles, loadedOf, scopeV2, type Pass1, type V2Code } from "./hoursV2";
import { fitV2, type FitV2 } from "./hoursFit";
import type { Timeline } from "./fcp";
import { activityOwner, referenceDesignBarId, playbookPlanForFields, REFERENCE_DESIGN, calculateEntitlementEndDate, HOURS_FILL_BAR_ID, domainBuildWeight, domainHosts, domainPackages, DELIVERY_ROLE_BY_WORKSTREAM, stampActivityOwners, type ActivityOwner, effectiveDeliveryPath, effectivePlatformEdition, FIXED_GANTT_CATEGORIES, resolvePlanOutcomes, type EngagementDocument, type TimelineBar, type TimelineLane } from "./fcp";

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
  // vSphere 8 to VVF 9 upgrade with VCF Operations, vCenter and ESX hosts: single site up to 25 servers, 1-3 sites up to 40.
  U1: { base: 36, lead: "architect" }, U2: { base: 68, lead: "architect" },
  // Not in the Required Hours table; sized like the smallest architect-led design add-on (DvPG networking).
  EF: { base: 20, lead: "architect" },
} as const satisfies Record<string, { base: number; lead: Lead; support?: number; pm?: number }>;
export type CatalogCode = keyof typeof CATALOG;

/** Base hours for a wave line with no envelope to solve against, and for a proving run. */
const DEFAULT_WAVE_BASE = { migration: 60, inPlace: 40 };
const PROVING_RUN_BASE = 28;
/** Share of an add-on's base hours that is its design work: what remains when scope must be reduced to fit, and what its component design package carries. */
const ADD_ON_DESIGN_SHARE = 0.25;

export type EffortLine = {
  workstream: string;
  /** A v1 catalog code, the v1 wave line, or a v2 line code. */
  code: CatalogCode | "FILL" | V2Code;
  kind: LineKind;
  lead: Lead;
  /** Catalog (or default) base hours before any reduction. */
  fullBase: number;
  base: number;
  /** Why the line is smaller than its full size, when it is. */
  reduction?: "proving run" | "design only" | "one domain";
  /** v2: the line's hours by role, with its share of the engagement PM pool, for `base`. */
  roles?: RoleHours;
  /** v2: the add-on's design share was placed on its own, so these hours are build only. */
  skipDesignShare?: boolean;
};

export type RoleHours = { architect: number; srConsultant: number; projectManager: number };
/** Signed work plans can also carry these roles; calculated hours never do. */
export type WorkPlanRoles = { seniorArchitect?: number; offshoreProjectManager?: number };
export type EffortRow = RoleHours & WorkPlanRoles & { workstream: string; total: number; note?: string };

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
  note?: "customer-owned" | "checkpoint" | "not in the scoped hours" | "merged";
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
  /** Customer-facing notes on what the package also covers. */
  notes?: string[];
  /** The outcome and acceptance of a package that is not a bar on the timeline: a later design phase or a remaining-scope package. */
  detail?: { outcome: string; acceptance: string };
};

export type DeferralReason = "not funded" | "after the entitlement window" | "over budget" | "planned for later";

export type FitMoney = { blendedRate: number; rateSource: "rate card" | "planner override"; buckets: Record<"E1" | "E2" | "F" | "C" | "reserve", number> };

export type ScopedEffort = {
  /** Which table the report shows. */
  source: "assignments" | "calculated";
  rows: EffortRow[];
  /** The calculated hours spread over the timeline work packages that deliver them; columns foot to the calculated totals. */
  workPackages: WorkPackageEffort[];
  totals: RoleHours & WorkPlanRoles & { total: number };
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
    /** v2 only: the Pass 1 scope. */
    pass1?: Pass1;
    /** v2 only, filled in by the server: the blended rate the fit used and dollars per bucket. Planner screens only. */
    money?: FitMoney;
    /** v2 only: the entitlement fit (Pass 2), with the month-by-month burn-down. Planner screens only. */
    fit?: FitV2 & { burndown: Array<{ month: string; target: number; actual: number | null }> };
    /**
     * v2, filled in by the server: the hours the entitlement value funds at the blended rate, after the reserve. The
     * plan is never filled past it, even when the signed entitled hours are worth more than the value.
     */
    valueCapHours?: number;
  };
};

export function splitRoles(base: number, lead: Lead, supportShare = 0.15, pmShare = 0.25): RoleHours {
  const support = supportShare * base;
  const architect = lead === "architect" ? base : support;
  const srConsultant = lead === "architect" ? support : base;
  return { architect, srConsultant, projectManager: pmShare * (architect + srConsultant) };
}

/** A line's hours by role, with its catalog entry's support and PM shares; `base` defaults to the line's current size. */
function rolesOf(item: Pick<EffortLine, "code" | "base" | "lead" | "roles">, base = item.base): RoleHours {
  if (item.roles) {
    const scale = item.base ? base / item.base : 0;
    return { architect: item.roles.architect * scale, srConsultant: item.roles.srConsultant * scale, projectManager: item.roles.projectManager * scale };
  }
  const entry: { support?: number; pm?: number } = item.code === "FILL" ? {} : (CATALOG[item.code as CatalogCode] ?? {}) as { support?: number; pm?: number };
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
  // An in-place upgrade brings the upgraded estate under VCF management, priced like a convergence; a VVF
  // upgrade is priced from the vSphere 8 to VVF 9 upgrade rows.
  if (path === "in-place") {
    const code: CatalogCode = vvf
      ? (sites <= 1 && servers <= 25 ? "U1" : "U2")
      : deployBracket({ instances, workloadDomains: consolidated ? 0 : 1, nodes: servers, consolidated });
    lines.push(line(vvf ? "VVF upgrade, licensing and handover" : "VCF management of the upgraded platform", code, "core"));
    lines.push(fillLine("In-place upgrade waves", DEFAULT_WAVE_BASE.inPlace));
  }

  const designOnly = path === "design-only" || path === "undecided";
  const firstAddOn = lines.length;
  {
    if (!vvf && has("networking:vpc")) lines.push(line("NSX networking, Edge and VPC", "X16", "addon"));
    else if (!vvf && has("networking:edge-cluster-routing")) lines.push(line("NSX networking and Edge", "X6", "addon"));
    else if (!vvf && has("platform:nsx", "networking:overlay-transport", "networking:network-operations")) lines.push(line("NSX networking", "X5", "addon"));
    // Physical fabric design with distributed port groups, when no NSX networking line already covers networking design.
    if (has("networking:physical-fabric") && !lines.slice(firstAddOn).some(item => /^X(5|6|16)$/.test(item.code))) lines.push(line("VDS networking", "X7", "addon"));
    if (has("automation:vm-self-service", "automation:day-2-automation", "automation:core", "automation:infrastructure-as-code", "automation:governance", "automation:application-provisioning")) {
      lines.push(line("Automation and self-service", has("automation:infrastructure-as-code", "automation:governance", "automation:application-provisioning") ? "X3" : "X2", "addon"));
    }
    if (hasAny("operations")) lines.push(line("VCF Operations, dashboards and logs", "X4", "addon"));
    if (hasAny("kubernetes") && !hasAny("private-ai")) lines.push(line("Supervisor and VKS", "X9", "addon"));
    if (hasAny("private-ai")) lines.push(line("Private AI Services", "X8", "addon"));
    if (has("automation:data-services")) lines.push(line("Data Services Manager", "X13", "addon"));
    if (has("security:ids-ips", "security:malware-prevention", "security:security-intelligence", "security:identity-firewall")) lines.push(line("vDefend firewall and threat prevention", "X12", "addon"));
    else if (has("security:segmentation")) lines.push(line("vDefend distributed firewall", "X11", "addon"));
    // Hardening, identity and access have no catalog row; priced like vDefend teach-to-fish.
    else if (Array.from(outcomes).some(key => key.startsWith("security:") && key !== "security:waf")) lines.push(line("Security hardening, identity and access", "X11", "addon"));
    if (has("resilience:recovery-architecture", "resilience:recovery-exercises", "resilience:cyber-recovery", "resilience:core")) lines.push(line("VMware Live Recovery", "X10", "addon"));
    if (has("resilience:cloud-cyber-recovery")) lines.push(line("Live Cyber Recovery", "X14", "addon"));
    if (has("networking:load-balancing", "security:waf")) lines.push(line("Avi Load Balancer and WAF", "X15", "addon"));
    if (fields.adoptionDetails.componentDepths.efficiency !== "not-selected") lines.push(line("Efficiency, memory tiering and sizing design", "EF", "addon"));
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

function totalsOf(rows: EffortRow[]): RoleHours & WorkPlanRoles & { total: number } {
  const totals = rows.reduce((sum, row) => ({
    architect: sum.architect + row.architect,
    srConsultant: sum.srConsultant + row.srConsultant,
    projectManager: sum.projectManager + row.projectManager,
    seniorArchitect: sum.seniorArchitect + (row.seniorArchitect ?? 0),
    offshoreProjectManager: sum.offshoreProjectManager + (row.offshoreProjectManager ?? 0),
    total: sum.total + row.total,
  }), { architect: 0, srConsultant: 0, projectManager: 0, seniorArchitect: 0, offshoreProjectManager: 0, total: 0 });
  const { seniorArchitect, offshoreProjectManager, ...rest } = totals;
  return { ...rest, ...(seniorArchitect ? { seniorArchitect } : {}), ...(offshoreProjectManager ? { offshoreProjectManager } : {}) };
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

/** The entitlement end: the recorded term, or one year from the entitlement start. */
export function entitlementTermEnd(document: EngagementDocument): string | null {
  const { report, fields } = document;
  return report.entitlement.termEnd || calculateEntitlementEndDate(fields.entitlementStart) || fields.entitlementEnd || null;
}

// ---------------------------------------------------------------------------------------------
// Hours by timeline work package
// ---------------------------------------------------------------------------------------------

/** Packages whose lead is not the lane's usual delivery role. */
const LEAD_ROLE_BY_BAR: Record<string, string> = {
  "bar-hcl-review": "VCF Architect with the customer platform lead",
  "bar-design-access-mapping": "VCF Architect with the customer identity owner",
  "bar-design-edge-sites": "VCF Architect with the customer site owners",
  [HOURS_FILL_BAR_ID]: "VCF Architect with a Senior Consultant",
};

/**
 * The lane's lead role, unless the package's hours say otherwise: a package in the governance lane whose hours are
 * mostly architect or consultant work (the discovery and pathway sessions) is led by the architect, not the PM.
 */
function leadRoleFor(laneRole: string, roles: RoleHours): string {
  const pmLed = laneRole === DELIVERY_ROLE_BY_WORKSTREAM.Governance;
  const technical = Math.max(roles.architect, roles.srConsultant);
  if (!pmLed || technical <= roles.projectManager) return laneRole;
  return roles.architect >= roles.srConsultant ? "VCF Architect" : "Senior Consultant";
}

/** Program management and steering: these carry the plan's project-manager hours, not technical hours. */
const GOVERNANCE_BARS = /^bar-(platform-plan|platform-execution-decision|platform-design-authority)$/;
/** Requirements and discovery packages carry the discovery line; the other design packages carry architecture and design. */
const DISCOVERY_BARS = /^bar-playbook-design-requirements$/;
const CORE_DESIGN_BARS = /^bar-(playbook-design-|platform-operating-readiness$|hcl-review$|design-access-mapping$|design-edge-sites$)/;
const COMPONENT_DESIGN_BARS = /^bar-playbook-component-design-/;
const BUILD_BARS = /^bar-(management-domain(-\d+)?|workload-domain(-\d+)?|import-domain-\d+|converge-management-domain|vvf-|import-foundation-validation|in-place-preparation|platform-licensing|platform-handover|platform-enablement|platform-runbook-transfer|playbook-adoption-vcf-management$)/;
/**
 * Relative effort of each build package, used to split the deploy line instead of window length. Sized from the
 * VCF 9.1 Planning and Preparation Workbook: deploying and configuring the management domain with its fleet
 * services is the largest body of work, a workload domain about 0.8 of it, a cluster about 0.4. Validation and
 * preparation are lighter, handover lighter still, and licensing activation is a few hours.
 */
const BUILD_WEIGHTS: Array<[RegExp, number]> = [
  [/^bar-(management-domain(-\d+)?|converge-management-domain|vvf-foundation|playbook-adoption-vcf-management|import-workload-domain(-\d+)?|import-domain-\d+)$/, BUILD_STAGE_WEIGHTS.managementDomain.value],
  [/^bar-workload-domain(-\d+)?$/, BUILD_STAGE_WEIGHTS.workloadDomain.value],
  [/^bar-vvf-workload-clusters$/, BUILD_STAGE_WEIGHTS.vvfCluster.value],
  [/^bar-(import-foundation-validation|in-place-preparation)$/, BUILD_STAGE_WEIGHTS.preparation.value],
  [/^bar-platform-handover$/, BUILD_STAGE_WEIGHTS.handover.value],
  // Training is one handover-sized package split in two: hands-on enablement with the build, and the runbook transfer.
  [/^bar-(platform-enablement|platform-runbook-transfer)$/, BUILD_STAGE_WEIGHTS.handover.value / 2],
  [/^bar-platform-licensing$/, BUILD_STAGE_WEIGHTS.licensing.value],
];
const buildWeight = (id: string) => BUILD_WEIGHTS.find(([pattern]) => pattern.test(id))?.[1] ?? 0.4;
/** Work packages each catalog line pays for: the implementation bars, or the component design bar when the line is design only. */
const ADD_ON_BARS: Partial<Record<CatalogCode, { bars: RegExp; design: string }>> = {
  X2: { bars: /^bar-(cloud-)?automation(-(?!data-services).*)?$/, design: "automation" },
  X3: { bars: /^bar-(cloud-)?automation(-(?!data-services).*)?$/, design: "automation" },
  X4: { bars: /^bar-(cloud-)?operations(-.*)?$|^bar-playbook-adoption-vvf-operations$/, design: "operations" },
  X5: { bars: /^bar-(cloud-)?networking-(?!physical-fabric|load-balancing)|^bar-vcf-networking-nsx$/, design: "networking" },
  X6: { bars: /^bar-(cloud-)?networking-(?!physical-fabric|load-balancing)|^bar-vcf-networking-nsx$/, design: "networking" },
  X16: { bars: /^bar-(cloud-)?networking-(?!physical-fabric|load-balancing)|^bar-vcf-networking-nsx$/, design: "networking" },
  X7: { bars: /^bar-networking-physical-fabric$/, design: "networking" },
  // Private AI includes Supervisor and VKS.
  X8: { bars: /^bar-(cloud-)?(private-ai|kubernetes)/, design: "private-ai|kubernetes" },
  X9: { bars: /^bar-(cloud-)?kubernetes/, design: "kubernetes" },
  X10: { bars: /^bar-(cloud-)?resilience-(?!cloud-cyber-recovery)/, design: "resilience" },
  X11: { bars: /^bar-(cloud-)?security-(?!waf)|^bar-security-services-platform$/, design: "security" },
  X12: { bars: /^bar-(cloud-)?security-(?!waf)|^bar-security-services-platform$/, design: "security" },
  X13: { bars: /^bar-(cloud-)?automation-data-services/, design: "automation" },
  X14: { bars: /^bar-(cloud-)?resilience-cloud-cyber-recovery/, design: "resilience" },
  X15: { bars: /^bar-(cloud-)?(networking-load-balancing|security-waf)/, design: "networking|security" },
  EF: { bars: /^bar-playbook-component-design-efficiency$/, design: "efficiency" },
};
/** v2 add-on lines on the same packages as their v1 counterparts; the VCF Automation platform sits on the first automation package. */
const V2_ADD_ON_BARS: Partial<Record<V2Code, { bars: RegExp; design: string }>> = {
  ...(ADD_ON_BARS as Partial<Record<V2Code, { bars: RegExp; design: string }>>),
  X_VCFA_platform: { bars: /^bar-(cloud-)?automation(-(?!data-services).*)?$/, design: "automation" },
};
const addOnBars = (code: EffortLine["code"]) => (code === "FILL" ? undefined : (V2_ADD_ON_BARS as Record<string, { bars: RegExp; design: string } | undefined>)[code]);
/** Lines that carry discovery, architecture, and the build (spread by build weight), in both models. */
const DISCOVERY_CODES = /^(DD\d?|DX)$/;
const DESIGN_CODES = /^A\d?$/;
const BUILD_CODES = /^(D\d|DW|U\d|X1|D|D_VVF|S_storage|U_VVF|C1|R_remed|U3)$/;
/** The component design package(s) an add-on's design work sits on. */
const componentDesign = (addOn: { design: string }) => (id: string) => new RegExp(`^bar-playbook-component-design-(${addOn.design})$`).test(id);

export function barsForLine(item: Pick<EffortLine, "code" | "reduction">, discoveryInScope = true): (id: string) => boolean {
  // With a prior assessment there is no discovery line, and the architecture line covers requirements too.
  // Small-estate packages with an estimate of their own sit on their one package.
  if (item.code === "AK") return id => id === "bar-platform-plan";
  if (item.code === "AH") return id => id === "bar-hcl-review";
  if (item.code === "AR") return id => id === "bar-design-access-mapping";
  if (item.code === "AP") return id => id === "bar-playbook-design-migration-design";
  if (item.code === "DW") return id => /^bar-workload-domain$/.test(id);
  if (DESIGN_CODES.test(item.code)) return id => CORE_DESIGN_BARS.test(id) && !(discoveryInScope && DISCOVERY_BARS.test(id));
  if (DISCOVERY_CODES.test(item.code)) return id => DISCOVERY_BARS.test(id);
  if (/^(D\d|U\d|D|D_VVF|S_storage|U_VVF|C1)$/.test(item.code)) return id => BUILD_BARS.test(id);
  // v2: remediation runs before the converge or upgrade; the VCF upgrade runs on the upgrade packages.
  if (item.code === "R_remed") return id => /^bar-(in-place-preparation|converge-management-domain|vvf-foundation)$/.test(id);
  if (item.code === "U3") return id => /^bar-(in-place-preparation|playbook-execution-upgrade-waves|playbook-adoption-vcf-management)$/.test(id);
  if (item.code === "X1") return id => /^bar-(import-foundation-validation|import-workload-domain(-\d+)?|import-domain-\d+|platform-handover|platform-enablement|platform-runbook-transfer|playbook-adoption-vcf-management)$/.test(id);
  if (item.code === "FILL" || item.code === "FILL_mig" || item.code === "FILL_ip") return id => /^bar-playbook-execution-/.test(id);
  if (item.code === "NX") return id => FIRST_MANAGEMENT_DOMAIN.test(id);
  const addOn = addOnBars(item.code);
  if (!addOn) return () => false;
  if (item.reduction === "design only") return componentDesign(addOn);
  return id => addOn.bars.test(id);
}

/** A package's outcome and acceptance, split from the timeline bar's text, for the follow-on table. Null when the bar has no outcome. */
function followOnOutcome(bar: Pick<TimelineBar, "outcome">): { outcome: string; acceptance: string } | null {
  const text = bar.outcome?.trim();
  if (!text) return null;
  const at = text.indexOf("Acceptance:");
  return at < 0 ? { outcome: text, acceptance: "" } : { outcome: text.slice(0, at).trim(), acceptance: text.slice(at + "Acceptance:".length).trim() };
}

/** The first management domain package: the one the VCF Installer deploys NSX with. */
/** The runbook knowledge transfer package, which follows CDW's proving waves. */
export const RUNBOOK_TRANSFER_BAR = "bar-platform-runbook-transfer";
const FIRST_MANAGEMENT_DOMAIN = /^bar-(management-domain|converge-management-domain)$/;
/** Shown with the first management domain when it carries the NSX design because the full NSX design is not funded. */
export const NSX_VLAN_NOTE = "NSX is deployed with VLAN-backed transport zones; overlay design follows after the entitlement.";
/** The same note for a BSAS-only deal. */
export const NSX_VLAN_NOTE_BSAS = "NSX is deployed with VLAN-backed transport zones; overlay design follows after the BSAS term.";

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
 * length, so the hours sit in the windows the timeline already shows. Discovery sits on the requirements
 * package and architecture on the other design packages; an add-on's design share sits on its component
 * design package. Governance packages carry only the design phase's project management. A line whose work
 * packages were removed from the timeline keeps its hours on a row of its own.
 *
 * Work the entitlement cannot carry keeps its hours as follow-on scope in the Two-Year Notional: an
 * add-on's build when only its design fits, anything starting after the entitlement ends, and anything
 * the planner places there. The planner's hours replace the baseline wherever the work is planned.
 */
export function workPackageEffort(source: EngagementDocument, lines: EffortLine[], totals: RoleHours, options: { ignoreHourOverrides?: boolean; holdRunbook?: boolean; firstWorkloadSeparate?: boolean } = {}): WorkPackageEffort[] {
  const document = withOwnership(source);
  const timeline = document.adoptionTimeline;
  const termEnd = entitlementTermEnd(document);
  const adoptionBars = timeline.lanes.flatMap(lane => lane.bars.map(bar => ({ lane, bar, timeline })));
  // Work the generator scheduled after the entitlement ends sits only in the Two-Year Notional. It is never dropped:
  // it is a work package of its own, carried as follow-on scope with its share of the hours.
  const onAdoption = new Set(adoptionBars.map(({ bar }) => bar.id));
  const notional = document.twoYearPlan;
  const afterTerm = termEnd ? notional.lanes.filter(lane => !/^lane-(follow-on-|two-year-)/.test(lane.id)).flatMap(lane => lane.bars.map(bar => ({ lane, bar, timeline: notional })))
    .filter(({ bar }) => !onAdoption.has(bar.id) && !/^bar-two-year-/.test(bar.id) && (barWindow(notional, bar)?.start ?? "") > termEnd) : [];
  const bars = [...adoptionBars, ...afterTerm];
  // Only CDW-owned work carries CDW hours.
  const cdw = (id: string) => { const placed = bars.find(({ bar }) => bar.id === id); return !placed || activityOwner(placed.bar) === "cdw"; };
  const overrides = new Map(document.report.workPackageHours.map(item => [item.id, item]));
  const deferred = new Map<string, DeferralReason>();
  for (const item of lines) {
    const addOn = addOnBars(item.code);
    if (addOn && item.reduction === "design only") for (const { bar } of bars) if (addOn.bars.test(bar.id) && !componentDesign(addOn)(bar.id)) deferred.set(bar.id, "not funded");
  }
  for (const { bar, timeline: owner } of bars) {
    const placement = overrides.get(bar.id)?.placement ?? "auto";
    if (placement === "entitlement") deferred.delete(bar.id);
    if (placement === "notional") deferred.set(bar.id, "planned for later");
    const window = barWindow(owner, bar);
    // Hours cannot be consumed after the entitlement ends, whatever the placement.
    if (termEnd && window && window.start > termEnd) deferred.set(bar.id, "after the entitlement window");
  }

  // The runbook transfer is the proving waves' runbook: without CDW's proving waves in the entitlement there is nothing to
  // transfer, so it is a follow-on package of its own at its full estimate (its share of the build line leaves the plan).
  const held = new Set<string>();
  if (options.holdRunbook) for (const { bar } of bars) if (bar.id === RUNBOOK_TRANSFER_BAR && cdw(bar.id) && !deferred.has(bar.id)) { deferred.set(bar.id, "not funded"); held.add(bar.id); }

  type Accumulated = RoleHours & { label: string };
  // The entitlement baseline (footed to the catalog totals) and the follow-on estimate are kept apart.
  const inWindow = new Map<string, Accumulated>();
  const followOn = new Map<string, Accumulated>();
  // An add-on build the planner pinned to the entitlement, beyond the catalog fit.
  const pinned = new Map<string, Accumulated>();
  // The share of the entitlement lines that work after the entitlement takes with it: it is not handed to other packages.
  const freed: RoleHours = { architect: 0, srConsultant: 0, projectManager: 0 };
  const add = (target: Map<string, Accumulated>, key: string, label: string, roles: RoleHours, share: number) => {
    const row = target.get(key) ?? { label, architect: 0, srConsultant: 0, projectManager: 0 };
    row.architect += roles.architect * share;
    row.srConsultant += roles.srConsultant * share;
    row.projectManager += roles.projectManager * share;
    target.set(key, row);
  };
  // Weighted by length, capped so a long-running oversight package does not take most of a line's hours.
  const cap = timeline.cadence === "week" ? 8 : 2;
  const lengthWeight = (bar: TimelineBar) => Math.min(cap, Math.max(1, bar.endCol - bar.startCol));
  const spread = (matches: typeof bars, roles: RoleHours, keep: (id: string) => boolean, target: Map<string, Accumulated>, weightOf: (bar: TimelineBar) => number = lengthWeight) => {
    const weights = matches.map(({ bar }) => weightOf(bar));
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    matches.forEach(({ bar }, index) => { if (keep(bar.id)) add(target, bar.id, bar.label, roles, weights[index] / weightTotal); });
  };
  const scale = (roles: RoleHours, share: number): RoleHours => ({ architect: roles.architect * share, srConsultant: roles.srConsultant * share, projectManager: roles.projectManager * share });
  // Packages whose share of a line is counted in the entitlement baseline, including work planned for later.
  const inEntitlement = (id: string) => !deferred.has(id) || deferred.get(id) === "planned for later";
  const live = (test: (id: string) => boolean) => bars.filter(({ bar }) => test(bar.id) && activityOwner(bar) !== "checkpoint" && inEntitlement(bar.id));
  // Governance packages (mobilization, decisions, steering) carry no technical hours. The design lines' project
  // management is pooled and placed after the lines are spread.
  const governance = live(id => GOVERNANCE_BARS.test(id));
  let designPm = 0;
  const discoveryInScope = lines.some(item => DISCOVERY_CODES.test(item.code));
  // Domain packages from the brief take their build share from their pathway and host count.
  const domainWeights = new Map(domainPackages(document.fields).map(({ id, domain }) => [id, domainBuildWeight(domain, domainHosts(domain, document.inventory).hosts)]));
  for (const item of lines) {
    let roles = rolesOf(item);
    // The Reference Architecture Design states its hours all-in, so its project management stays on the package.
    if ((DESIGN_CODES.test(item.code) || DISCOVERY_CODES.test(item.code)) && governance.length && item.workstream !== REFERENCE_DESIGN.title) {
      designPm += roles.projectManager;
      roles = { ...roles, projectManager: 0 };
    }
    // Customer-owned packages keep their share of the line, which then drops out of CDW's hours.
    let matches = bars.filter(({ bar }) => barsForLine(item, discoveryInScope)(bar.id) && activityOwner(bar) !== "checkpoint");
    // Supervisor and VKS required by Private AI sit on the Private AI packages when the plan has no Kubernetes packages.
    if (item.code === "X9" && !matches.length) {
      const fallback = item.reduction === "design only" ? /^bar-playbook-component-design-(kubernetes|private-ai)$/ : /^bar-(cloud-)?private-ai/;
      matches = bars.filter(({ bar }) => fallback.test(bar.id) && activityOwner(bar) !== "checkpoint");
    }
    // The VCF Automation platform is built once, on the first automation package.
    if (item.code === "X_VCFA_platform" && matches.length > 1) {
      const first = matches.reduce((earliest, candidate) => (candidate.bar.startCol < earliest.bar.startCol ? candidate : earliest));
      matches = [first];
    }
    // The first workload domain has its own line on a small estate; the rest of the build does not draw on it.
    if (item.code !== "DW" && BUILD_CODES.test(item.code) && options.firstWorkloadSeparate) matches = matches.filter(({ bar }) => bar.id !== "bar-workload-domain");
    // The Reference Architecture Design is one package: its flat hours sit on it alone. The hardware review, the access
    // mapping and the migration plan are packages of their own, with their own estimates.
    if (item.workstream === REFERENCE_DESIGN.title) {
      const referenceId = referenceDesignBarId(playbookPlanForFields(document.fields).path);
      if (referenceId && matches.some(({ bar }) => bar.id === referenceId)) matches = matches.filter(({ bar }) => bar.id === referenceId);
    }
    // Architecture and discovery fall back to the other design packages, then to any design package, when theirs are not on the plan.
    if ((DESIGN_CODES.test(item.code) || DISCOVERY_CODES.test(item.code)) && !matches.some(({ bar }) => inEntitlement(bar.id))) {
      const core = live(id => CORE_DESIGN_BARS.test(id));
      matches = core.length ? core : live(id => COMPONENT_DESIGN_BARS.test(id));
    }
    // Work after the entitlement window keeps its own share as follow-on; the packages left in the window keep only theirs.
    const late = (id: string) => deferred.get(id) === "after the entitlement window" || held.has(id);
    const sharing = matches.filter(({ bar }) => inEntitlement(bar.id) || late(bar.id));
    // A fully scoped add-on designs its component on the component design package and builds on the rest, even when
    // the build falls after the entitlement window.
    const addOnDesign = addOnBars(item.code);
    if (addOnDesign && item.reduction !== "design only" && !item.skipDesignShare) {
      const design = live(componentDesign(addOnDesign));
      if (design.length && sharing.length) {
        spread(design, scale(roles, ADD_ON_DESIGN_SHARE), () => true, inWindow);
        roles = scale(roles, 1 - ADD_ON_DESIGN_SHARE);
      }
    }
    // Work the planner placed in the notional keeps its share of the line and takes it out of the entitlement.
    const current = matches.filter(({ bar }) => inEntitlement(bar.id));
    // The deploy line is split by how much work each build package is, not by how long its window is.
    // The hardware review and the access mapping are focused pieces of design: half a design package's share.
    const weightOf = BUILD_CODES.test(item.code) ? (bar: TimelineBar) => domainWeights.get(bar.id) ?? buildWeight(bar.id) : (bar: TimelineBar) => lengthWeight(bar) * (/^bar-(hcl-review|design-access-mapping|design-edge-sites)$/.test(bar.id) ? 0.5 : 1);
    if (current.length) spread(sharing, roles, id => !late(id), inWindow, weightOf);
    else if (!sharing.length) add(inWindow, `line:${item.workstream}`, item.reduction ? `${item.workstream} (${item.reduction})` : item.workstream, roles, 1);
    if (sharing.some(({ bar }) => late(bar.id))) {
      const moved = new Map<string, Accumulated>();
      spread(sharing, roles, late, moved, weightOf);
      for (const [key, row] of Array.from(moved.entries())) {
        add(followOn, key, row.label, row, 1);
        freed.architect += row.architect; freed.srConsultant += row.srConsultant; freed.projectManager += row.projectManager;
      }
    }
    // Other deferred packages of the line get their share as a follow-on estimate.
    spread(matches, roles, id => deferred.has(id) && deferred.get(id) !== "planned for later" && !late(id), followOn, weightOf);
    // An add-on cut to its design keeps the rest of its hours on its build packages, as follow-on scope.
    const addOn = addOnBars(item.code);
    if (addOn && item.reduction === "design only" && item.fullBase > item.base) {
      const build = bars.filter(({ bar }) => addOn.bars.test(bar.id) && cdw(bar.id));
      if (build.length) {
        spread(build, rolesOf(item, item.fullBase - item.base), id => deferred.has(id), followOn);
        spread(build, rolesOf(item, item.fullBase - item.base), id => !deferred.has(id), pinned);
      }
    }
  }

  // Governance takes the design-phase project management for its share of the design phase's windows; the
  // design packages take the rest in proportion to their technical hours.
  if (designPm) {
    const design = live(id => CORE_DESIGN_BARS.test(id) || COMPONENT_DESIGN_BARS.test(id)).filter(({ bar }) => inWindow.has(bar.id));
    const weight = ({ bar }: (typeof bars)[number]) => lengthWeight(bar);
    const governanceWeight = governance.reduce((sum, item) => sum + weight(item), 0);
    const governancePm = design.length ? designPm * governanceWeight / (governanceWeight + design.reduce((sum, item) => sum + weight(item), 0)) : designPm;
    spread(governance, { architect: 0, srConsultant: 0, projectManager: governancePm }, () => true, inWindow);
    const technical = (id: string) => { const row = inWindow.get(id)!; return row.architect + row.srConsultant; };
    const technicalTotal = design.reduce((sum, { bar }) => sum + technical(bar.id), 0);
    for (const { bar } of design) add(inWindow, bar.id, bar.label, { architect: 0, srConsultant: 0, projectManager: designPm - governancePm }, technicalTotal ? technical(bar.id) / technicalTotal : 1 / design.length);
  }

  const footed = (source: Map<string, Accumulated>, target: (key: keyof RoleHours, values: number[]) => number) => {
    const entries = Array.from(source.entries());
    const columns = (["architect", "srConsultant", "projectManager"] as const).map(key => footedColumn(entries.map(([, row]) => row[key]), target(key, entries.map(([, row]) => row[key]))));
    return entries.map(([id, row], index) => [id, { row, roles: { architect: columns[0][index], srConsultant: columns[1][index], projectManager: columns[2][index] } }] as const);
  };
  const baselines = new Map([
    // The target is a whole number of hours: what the late and held packages take with them is not.
    ...footed(inWindow, key => Math.round(totals[key] - freed[key])),
    ...footed(followOn, (_key, values) => Math.round(values.reduce((sum, value) => sum + value, 0))),
    ...footed(pinned, (_key, values) => Math.round(values.reduce((sum, value) => sum + value, 0))),
  ]);
  const entries = Array.from(baselines.entries());
  const lanes = new Map(bars.map(({ lane, bar, timeline: owner }) => [bar.id, { lane, bar, timeline: owner }]));
  const carriesNsxDesign = lines.some(item => item.code === "NX");
  // What each package delivers and how it is accepted, for the follow-on table: the playbook's wording where it has one.
  const plan = playbookPlanForFields(document.fields);
  const playbookDetail = new Map<string, { outcome: string; acceptance: string }>([
    ...plan.designPackages.map(item => [`bar-playbook-design-${item.id}`, { outcome: item.outcome, acceptance: item.acceptance }] as const),
    ...plan.implementationPackages.map(item => [`bar-playbook-execution-${item.id}`, { outcome: item.outcome, acceptance: item.acceptance }] as const),
  ]);
  const ids = [...bars.map(({ bar }) => bar.id), ...entries.map(([id]) => id).filter(id => !lanes.has(id))];

  return ids.map((id): WorkPackageEffort => {
    const placed = lanes.get(id);
    const entry = baselines.get(id);
    const baseline = entry?.roles ?? { architect: 0, srConsultant: 0, projectManager: 0 };
    const window = placed ? barWindow(placed.timeline, placed.bar) : null;
    const owner = placed ? activityOwner(placed.bar) : "cdw";
    const note: WorkPackageEffort["note"] = owner === "checkpoint" ? "checkpoint" : owner === "customer" ? "customer-owned" : undefined;
    const override = overrides.get(id);
    // Planner hours belong to the work the entitlement funds: a calculation of displaced scope ignores them.
    const editable = !note && !options.ignoreHourOverrides && override;
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
      leadRole: LEAD_ROLE_BY_BAR[id] ?? leadRoleFor(lane ? DELIVERY_ROLE_BY_WORKSTREAM[lane.workstreamType] : "", roles),
      start: window?.start ?? null,
      end: window?.end ?? null,
      ...(reason ? { architect: 0, srConsultant: 0, projectManager: 0, total: 0, deferred: reason, followOn: { ...roles, total: sum } } : { ...roles, total: sum }),
      baseline,
      adjusted: Boolean(editable && (override.architect !== null || override.srConsultant !== null || override.projectManager !== null)),
      placement: override?.placement ?? "auto",
      owner,
      ...(carriesNsxDesign && FIRST_MANAGEMENT_DOMAIN.test(id) ? { notes: [document.fields.fundingSource === "bsas" ? NSX_VLAN_NOTE_BSAS : NSX_VLAN_NOTE] } : {}),
      ...(placed && (playbookDetail.get(id) ?? followOnOutcome(placed.bar)) ? { detail: (playbookDetail.get(id) ?? followOnOutcome(placed.bar))! } : {}),
      ...(note ? { note } : !reason && sum === 0 ? { note: "not in the scoped hours" as const } : {}),
    };
  }).sort((left, right) => categoryIndex(left.category) - categoryIndex(right.category) || (left.start ?? "9999").localeCompare(right.start ?? "9999") || left.label.localeCompare(right.label));
}

/**
 * Work packages that always stay in the entitlement, whatever the hours: handover, the runbook and training, licensing
 * and the management domains, plus CDW's first delivery wave. The generator keeps them inside the window by month.
 */
export function protectedWorkPackages(timeline: Timeline): Set<string> {
  const all = timeline.lanes.flatMap(lane => lane.bars);
  const firstWave = all.filter(bar => /^bar-playbook-execution-/.test(bar.id)).sort((left, right) => left.startCol - right.startCol)[0];
  return new Set([...all.filter(bar => PROTECTED_PACKAGES.test(bar.id)).map(bar => bar.id), ...(firstWave ? [firstWave.id] : [])]);
}
const PROTECTED_PACKAGES = /^bar-(platform-(handover|runbook-transfer|enablement|licensing)|management-domain(-\d+)?|converge-management-domain)$/;

/** Design and governance work stays in the entitlement; operating readiness for a later implementation can move. */
export const isDesignWorkPackage = (id: string) => GOVERNANCE_BARS.test(id) || /^bar-playbook-(component-)?design-/.test(id) || /^bar-(hcl-review|design-access-mapping|design-edge-sites)$/.test(id);

/** Moves work packages out of the entitlement into follow-on scope and recalculates the entitlement totals. */
export function deferWorkPackages(effort: ScopedEffort, moves: Map<string, DeferralReason>): ScopedEffort {
  if (!moves.size) return effort;
  const workPackages = effort.workPackages.map(row => {
    const reason = moves.get(row.id);
    if (!reason || row.deferred) return row;
    // The package's year-one hours join whatever follow-on hours it already carried (for example the remaining waves).
    const prior = row.followOn ?? { architect: 0, srConsultant: 0, projectManager: 0, total: 0 };
    return { ...row, architect: 0, srConsultant: 0, projectManager: 0, total: 0, deferred: reason, followOn: { architect: prior.architect + row.architect, srConsultant: prior.srConsultant + row.srConsultant, projectManager: prior.projectManager + row.projectManager, total: prior.total + row.total } };
  });
  if (effort.source === "assignments") return { ...effort, workPackages };
  const totals = workPackages.reduce((sum, row) => ({ architect: sum.architect + row.architect, srConsultant: sum.srConsultant + row.srConsultant, projectManager: sum.projectManager + row.projectManager, total: sum.total + row.total }), { architect: 0, srConsultant: 0, projectManager: 0, total: 0 });
  return { ...effort, workPackages, totals, internal: { ...effort.internal, planHours: totals.total } };
}

/**
 * The timelines as the customer sees them: deferred work leaves the entitlement timeline and starts in the
 * Two-Year Notional the month after the entitlement ends, keeping its order and length.
 */
export function timelinesWithDeferrals(document: EngagementDocument, deferredIds: string[], unscopedIds: string[] = []): { adoption: Timeline; notional: Timeline } {
  const result = movedTimelines(document, deferredIds);
  if (!unscopedIds.length) return result;
  // Packages with no hours at all (neither funded nor follow-on scope) are drawn on neither timeline.
  const gone = new Set(unscopedIds);
  const clean = (timeline: Timeline): Timeline => ({ ...timeline, lanes: timeline.lanes.map(lane => ({ ...lane, bars: lane.bars.filter(bar => !gone.has(bar.id)).map(bar => (bar.prerequisites?.some(id => gone.has(id)) ? { ...bar, prerequisites: bar.prerequisites.filter(id => !gone.has(id)) } : bar)) })) });
  return { adoption: clean(result.adoption), notional: clean(result.notional) };
}

/**
 * Packages the plan carries no hours for: CDW-owned, not funded and not follow-on scope either (a migration plan the
 * reference design does not include, say). Under v2 they leave the timelines, so every CDW bar on the entitlement
 * timeline is a funded package. Discovery goes with them: hours already delivered show in the delivered row of the
 * hours table, not as a bar.
 */
export function unscopedWorkPackageIds(effort: Pick<ScopedEffort, "workPackages" | "internal">): string[] {
  if (!effort.internal.pass1) return [];
  return effort.workPackages.filter(row => row.owner === "cdw" && !row.deferred && row.total === 0 && row.note === "not in the scoped hours" && !(row.followOn && row.followOn.total > 0)).map(row => row.id);
}

/** The packages each checkpoint gates. */
const GATED_WORK: Record<string, RegExp> = { "bar-backup-gate": /^bar-playbook-execution-/ };

function movedTimelines(document: EngagementDocument, deferredIds: string[]): { adoption: Timeline; notional: Timeline } {
  const ids = new Set(deferredIds);
  // Work that stays no longer waits for work that moved out: it goes ahead without it (for example VLAN-backed
  // workload domains when the NSX build-out moves to the follow-on).
  const withoutMoved = (bar: TimelineBar) => (bar.prerequisites?.some(id => ids.has(id)) ? { ...bar, prerequisites: bar.prerequisites.filter(id => !ids.has(id)) } : bar);
  // A checkpoint gates a package: with no such package left on the entitlement timeline, the checkpoint goes too.
  const remaining = document.adoptionTimeline.lanes.flatMap(lane => lane.bars).filter(bar => !ids.has(bar.id));
  const gateless = new Set(Object.entries(GATED_WORK).filter(([, work]) => !remaining.some(bar => work.test(bar.id))).map(([gate]) => gate));
  const adoption: Timeline = { ...document.adoptionTimeline, lanes: document.adoptionTimeline.lanes.map(lane => ({ ...lane, bars: lane.bars.filter(bar => !ids.has(bar.id) && !gateless.has(bar.id)).map(withoutMoved) })) };
  const notional = document.twoYearPlan;
  const termEnd = entitlementTermEnd(document);
  const start = /^(\d{4})-(\d{2})/.exec(notional.startDate);
  const end = termEnd ? /^(\d{4})-(\d{2})/.exec(termEnd) : null;
  if (!ids.size || !start || !end) return { adoption, notional };
  // First notional month after the entitlement ends (monthly columns from the notional start).
  const firstAfter = (Number(end[1]) - Number(start[1])) * 12 + Number(end[2]) - Number(start[2]) + 2;
  const all = notional.lanes.flatMap(lane => lane.bars);
  // A checkpoint tied to moved work moves with it.
  const movedIds = new Set(all.filter(bar => ids.has(bar.id) && bar.startCol < firstAfter).map(bar => bar.id));
  for (const bar of all) if (activityOwner(bar) === "checkpoint" && ((bar.prerequisites ?? []).some(id => movedIds.has(id)) || (GATED_WORK[bar.id] && gateless.has(bar.id)))) movedIds.add(bar.id);
  const moving = all.filter(bar => movedIds.has(bar.id));
  const notionalWithoutMoved: Timeline = { ...notional, lanes: notional.lanes.map(lane => ({ ...lane, bars: lane.bars.map(bar => (ids.has(bar.id) ? bar : withoutMoved(bar))) })) };
  if (!moving.length || firstAfter > notional.columns.length) return { adoption, notional: notionalWithoutMoved };
  const earliest = Math.min(...moving.filter(bar => ids.has(bar.id)).map(bar => bar.startCol));
  const last = notional.columns.length + 1;
  const placed = new Map(all.map(bar => [bar.id, { startCol: bar.startCol, endCol: bar.endCol }]));
  for (const bar of moving) {
    const startCol = Math.min(notional.columns.length, Math.max(firstAfter, firstAfter + bar.startCol - earliest));
    placed.set(bar.id, { startCol, endCol: Math.min(last, Math.max(startCol + 1, startCol + bar.endCol - bar.startCol)) });
  }
  // Moved work starts after its prerequisites end, including work that stayed and runs past the entitlement end.
  for (let pass = 0; pass < moving.length; pass += 1) {
    let changed = false;
    for (const bar of moving) {
      const current = placed.get(bar.id)!;
      const after = Math.max(0, ...(bar.prerequisites ?? []).map(id => placed.get(id)?.endCol ?? 0));
      if (after > current.startCol && current.startCol < notional.columns.length) {
        const startCol = Math.min(notional.columns.length, after);
        placed.set(bar.id, { startCol, endCol: Math.min(last, Math.max(startCol + 1, startCol + current.endCol - current.startCol)) });
        changed = true;
      }
    }
    if (!changed) break;
  }
  return {
    adoption,
    notional: {
      ...notional,
      lanes: notional.lanes.map(lane => ({
        ...lane,
        bars: lane.bars.map(bar => (movedIds.has(bar.id) ? { ...bar, ...placed.get(bar.id)! } : withoutMoved(bar))),
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

export type ScopedEffortOptions = { envelopeHours?: number | null; envelopeSource?: ScopedEffort["internal"]["envelopeSource"]; today?: string };

/** Scoped effort from the hours model the document selects. */
export function buildScopedEffort(document: EngagementDocument, options: ScopedEffortOptions = {}): ScopedEffort {
  return document.fields.hoursModel === "v2" ? buildScopedEffortV2(document, options) : buildScopedEffortV1(document, options);
}

/** v2 Pass 1 lines as effort lines, so they spread across the same stages as v1; `bases` limits each line to part of its hours. */
export function effortLinesFromPass1(pass1: Pass1, bases?: Map<V2Code, number>): EffortLine[] {
  // The management domain's NSX design is not a scope line: it is in the plan only where the fit placed it.
  const nsx = pass1.nsxMinimalDesign && bases?.has("NX") && !pass1.lines.includes(pass1.nsxMinimalDesign) ? [pass1.nsxMinimalDesign] : [];
  return [...pass1.lines, ...nsx].flatMap(line => {
    const base = bases ? bases.get(line.code) ?? 0 : line.computedBase;
    if (base <= 0) return [];
    return [{
      workstream: line.name,
      code: line.code,
      kind: line.code.startsWith("FILL") ? "fill" as const : line.code.startsWith("X") || line.code === "EF" ? "addon" as const : "core" as const,
      lead: line.lead,
      fullBase: base,
      base,
      roles: lineRoles(pass1, line, base),
      ...(line.designOnly ? { reduction: "design only" as const } : {}),
    }];
  });
}

/** Whole months from today (or the entitlement start, if later) to the end of the entitlement term. */
function monthsLeft(document: EngagementDocument, today: string): number {
  const end = entitlementTermEnd(document);
  const start = document.fields.entitlementStart && document.fields.entitlementStart > today ? document.fields.entitlementStart : today;
  if (!end) return HOURS_V2.fit.termMonths.value;
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return Math.max(1, (ey - sy) * 12 + em - sm);
}

/** Target and actual hours used, month by month, from the entitlement start to its end. */
function fitBurndown(document: EngagementDocument, fit: FitV2): Array<{ month: string; target: number; actual: number | null }> {
  const startDate = document.fields.entitlementStart || document.fields.plannedProjectStart;
  const end = entitlementTermEnd(document);
  if (!/^\d{4}-\d{2}/.test(startDate) || !end) return [];
  const [sy, sm] = startDate.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const months = Math.max(1, (ey - sy) * 12 + em - sm);
  const consumed = document.report.entitlement.hoursConsumed;
  const consumedMonth = document.report.entitlement.consumedAsOf?.slice(0, 7) ?? null;
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(Date.UTC(sy, sm - 1 + index, 1));
    const month = date.toISOString().slice(0, 7);
    return { month, target: Math.min(fit.entitlementHours, (fit.entitlementHours / months) * (index + 1)), actual: consumed !== null && consumedMonth === month ? consumed : null };
  });
}

/** The v2 model: Pass 1 scope, fitted to the entitlement by Pass 2, spread across the plan's stages. */
function buildScopedEffortV2(document: EngagementDocument, options: ScopedEffortOptions): ScopedEffort {
  const pass1 = scopeV2(document);
  const entitled = document.report.entitlement.hours;
  const envelopeHours = entitled ?? options.envelopeHours ?? null;
  const envelopeSource: ScopedEffort["internal"]["envelopeSource"] = entitled !== null ? "entitled hours" : envelopeHours !== null ? options.envelopeSource ?? "entitlement value" : "none";
  const fullScopeHours = pass1.lines.reduce((sum, line) => sum + loadedOf(pass1, line, line.computedBase), 0);
  if (envelopeHours === null || envelopeHours <= 0) {
    // Without an entitlement to fit, everything is planned except what the brief only considers, which is follow-on.
    const later = new Set(pass1.lines.filter(line => line.followOnOnly).map(line => line.code));
    const bases = (keep: boolean) => new Map(pass1.lines.filter(line => later.has(line.code) !== keep).map(line => [line.code, line.computedBase]));
    const funded = bases(true);
    const effort = assembleScopedEffort(document, effortLinesFromPass1(pass1, funded), { envelopeHours, envelopeSource, fullScopeHours, status: "no-envelope", shortfallHours: 0, headroomHours: 0 }, { pass1 });
    return later.size ? withDisplacedLines(document, effort, effortLinesFromPass1(pass1, bases(false))) : effort;
  }
  const inputs = document.fields.estimateInputs;
  const fit = fitV2(pass1, {
    entitlementHours: envelopeHours,
    deliveredHours: document.report.entitlement.hoursConsumed ?? 0,
    monthsRemaining: inputs.monthsRemaining ?? monthsLeft(document, options.today ?? new Date().toISOString().slice(0, 10)),
    ranking: inputs.outcomeRanking,
    wantThisYear: inputs.wantThisYear,
    datedWaves: pass1.inputs.datedWaves,
    ...(inputs.reservePercent !== undefined ? { reserveShare: inputs.reservePercent / 100 } : {}),
    wavesMode: migrationWavesChoice(document),
  });
  const fundedBases = new Map<V2Code, number>();
  const displacedBases = new Map<V2Code, number>();
  const designShared = new Set<V2Code>();
  for (const placement of fit.placements) {
    const target = placement.bucket === "E1" || placement.bucket === "E2" ? fundedBases : displacedBases;
    target.set(placement.code, (target.get(placement.code) ?? 0) + placement.base);
    if (placement.designShare) designShared.add(placement.code);
  }
  // A line with only its design share in the entitlement is designed now and built later.
  const fundedLines = effortLinesFromPass1(pass1, fundedBases).map(line => (designShared.has(line.code as V2Code) ? { ...line, reduction: "design only" as const } : line));
  const displacedLines = effortLinesFromPass1(pass1, displacedBases).map(line => (designShared.has(line.code as V2Code) ? { ...line, skipDesignShare: true } : line));
  const status: FitStatus = fit.underFunded ? "short" : displacedLines.length ? "fits-reduced" : "fits";
  const assembled = assembleScopedEffort(document, fundedLines, { envelopeHours, envelopeSource, fullScopeHours, status, shortfallHours: fit.underFunded?.gapHours ?? 0, headroomHours: fit.entitlementRemaining }, { pass1, fit: { ...fit, burndown: fitBurndown(document, fit) } });
  const effort = withLateWorkReleased(assembled);
  return displacedLines.length ? withDisplacedLines(document, effort, displacedLines) : effort;
}

/**
 * Funded work the timeline places after the entitlement ends carries its hours as follow-on scope. The buckets follow
 * it, depth first, and the entitlement hours it leaves unused go to the reserve rather than to other packages.
 */
function withLateWorkReleased(effort: ScopedEffort): ScopedEffort {
  const fit = effort.internal.fit;
  const late = effort.workPackages.filter(row => (row.deferred === "after the entitlement window" || (row.id === RUNBOOK_TRANSFER_BAR && row.deferred === "not funded" && !row.id.includes(":"))) && (row.followOn?.total ?? 0) > 0);
  if (!fit || !late.length) return effort;
  const hours = late.reduce((sum, row) => sum + row.followOn!.total, 0);
  const fromDepth = Math.min(fit.buckets.E2, hours);
  return {
    ...effort,
    internal: {
      ...effort.internal,
      fit: {
        ...fit,
        buckets: { ...fit.buckets, E2: fit.buckets.E2 - fromDepth, E1: fit.buckets.E1 - (hours - fromDepth), F: fit.buckets.F + hours },
        // Hours that fall after the window go to the reserve; the runbook's hours, held for want of proving waves, stay unused for the fill.
        reserveHours: fit.reserveHours + late.filter(row => row.deferred === "after the entitlement window").reduce((sum, row) => sum + row.followOn!.total, 0),
        scopeMoves: [...(fit.scopeMoves ?? []), ...late.map(row => ({ label: row.label, hours: row.followOn!.total, reason: "after the entitlement window" as const }))],
      },
    },
  };
}

/**
 * v2: entitlement hours the plan's work packages leave unused after the reserve; planner adjustments count. The lower
 * of the entitlement hours and what the entitlement value funds is the limit. Null without a fit.
 */
export function unusedEntitlementHours(effort: ScopedEffort): number | null {
  const fit = effort.internal.fit;
  if (!fit) return null;
  const planned = effort.workPackages.reduce((sum, row) => sum + row.total, 0);
  const limit = Math.min(fit.entitlementHours - fit.deliveredHours - fit.reserveHours, effort.internal.valueCapHours ?? Infinity);
  return Math.max(0, Math.floor(limit - planned));
}

/**
 * The hours-fill work package takes up the entitlement hours the plan leaves unused, split in the plan's own role mix,
 * and the depth bucket (E2) carries them. Hours the planner set on the package stand as they are; signed resource
 * assignments, and a package customer-owned, deferred or off the timeline, take nothing.
 */
export function withHoursFill(effort: ScopedEffort): ScopedEffort {
  const fit = effort.internal.fit;
  const row = effort.workPackages.find(item => item.id === HOURS_FILL_BAR_ID);
  if (!fit || !row || row.adjusted || row.deferred || row.owner !== "cdw" || effort.source === "assignments") return effort;
  const unused = unusedEntitlementHours(effort) ?? 0;
  if (unused < 1) return effort;
  const others = effort.workPackages.filter(item => item.id !== HOURS_FILL_BAR_ID);
  const mix = others.reduce((sum, item) => ({ architect: sum.architect + item.architect, srConsultant: sum.srConsultant + item.srConsultant, projectManager: sum.projectManager + item.projectManager }), { architect: 0, srConsultant: 0, projectManager: 0 });
  const mixTotal = mix.architect + mix.srConsultant + mix.projectManager;
  const shares = mixTotal > 0 ? [mix.architect / mixTotal, mix.srConsultant / mixTotal, mix.projectManager / mixTotal] : [0.4, 0.45, 0.15];
  const [architect, srConsultant, projectManager] = footedColumn(shares.map(share => share * unused), unused);
  const roles = { architect, srConsultant, projectManager };
  const { note: _note, ...rest } = row;
  const workPackages = effort.workPackages.map((item): WorkPackageEffort => (item.id === HOURS_FILL_BAR_ID ? { ...rest, ...roles, total: unused, baseline: roles } : item));
  const totals = { ...effort.totals, architect: effort.totals.architect + architect, srConsultant: effort.totals.srConsultant + srConsultant, projectManager: effort.totals.projectManager + projectManager, total: effort.totals.total + unused };
  // The buckets come from the catalog fit and do not see planner adjustments, so they take the fill only up to the
  // plan's new total: the Scope by Bucket table never shows more in the entitlement than the work packages carry.
  const planned = workPackages.reduce((sum, item) => sum + item.total, 0);
  const toDepth = Math.min(unused, Math.max(0, planned - fit.buckets.E1 - fit.buckets.E2));
  return {
    ...effort,
    workPackages,
    totals,
    internal: {
      ...effort.internal,
      planHours: effort.internal.planHours + unused,
      headroomHours: 0,
      fit: { ...fit, buckets: { ...fit.buckets, E2: fit.buckets.E2 + toDepth }, entitlementRemaining: 0 },
    },
  };
}

/** The design the entitlement cannot carry, delivered as a phase of its own: workload domain, DR and NSX overlay design. */
export const LATER_DESIGN_PHASE = {
  id: "bar-playbook-design-phase-2",
  label: "Workload Domain, DR and NSX Overlay Design",
  outcome: "In design sessions, design each workload domain, the disaster recovery approach and the NSX overlay network, building on the accepted foundation design.",
  acceptance: "Architecture, infrastructure, network and recovery owners approve the workload domain, DR and NSX overlay design.",
} as const;

const remainingLabel = (row: Pick<WorkPackageEffort, "id" | "label">) => (/^bar-playbook-execution-/.test(row.id) ? `${row.label}, Later Waves` : `${row.label}, Remaining Scope`);

/**
 * Displaced hours become follow-on scope. A package is wholly in the entitlement or wholly follow-on, never both: a
 * stage with nothing left in the entitlement moves to the Two-Year Notional with its hours, and displaced hours that
 * land on a stage the entitlement does fund (later migration waves, say) become a package of their own, entirely follow-on.
 * Design the entitlement cannot carry is a design phase by deliverable, also its own package.
 */
function withDisplacedLines(document: EngagementDocument, effort: ScopedEffort, displacedLines: EffortLine[]): ScopedEffort {
  const designPhase = displacedLines.find(line => line.code === "A");
  const rest = displacedLines.filter(line => line.code !== "A");
  const displacedRows = workPackageEffort(document, rest, totalsOf(rowsFromLines(rest)), { ignoreHourOverrides: true });
  const later = new Map(displacedRows.map(row => [row.id, row.total > 0 ? row : row.followOn ? { ...row, ...row.followOn } : row]));
  const alongside: WorkPackageEffort[] = [];
  const merged = effort.workPackages.map((row): WorkPackageEffort => {
    const moved = later.get(row.id);
    later.delete(row.id);
    if (!moved || moved.total <= 0 || row.note === "checkpoint" || row.note === "customer-owned") return row;
    const roles = { architect: moved.architect, srConsultant: moved.srConsultant, projectManager: moved.projectManager, total: moved.total };
    if (row.total > 0 && !row.deferred) {
      const { note: _note, ...rest } = row;
      alongside.push({ ...rest, id: `${row.id}:later`, label: remainingLabel(row), start: null, end: null, architect: 0, srConsultant: 0, projectManager: 0, total: 0, deferred: "not funded", followOn: roles, placement: "auto", adjusted: false, baseline: { architect: 0, srConsultant: 0, projectManager: 0 }, notes: undefined });
      return row;
    }
    const followOn = { architect: (row.followOn?.architect ?? 0) + roles.architect, srConsultant: (row.followOn?.srConsultant ?? 0) + roles.srConsultant, projectManager: (row.followOn?.projectManager ?? 0) + roles.projectManager, total: (row.followOn?.total ?? 0) + roles.total };
    if (row.deferred) return { ...row, followOn };
    const { note: _note, ...rest } = row;
    return { ...rest, deferred: "not funded", followOn };
  });
  for (const row of Array.from(later.values())) if (row.total > 0) merged.push({ ...row, architect: 0, srConsultant: 0, projectManager: 0, total: 0, deferred: "not funded", followOn: { architect: row.architect, srConsultant: row.srConsultant, projectManager: row.projectManager, total: row.total } });
  if (designPhase) {
    const lead = merged.find(row => /^bar-playbook-design-/.test(row.id) && row.category && row.total > 0) ?? merged.find(row => row.category === "Modernize Infrastructure");
    const planned = designPhase.roles ?? rolesOf(designPhase);
    const roles = { architect: Math.round(planned.architect), srConsultant: Math.round(planned.srConsultant), projectManager: Math.round(planned.projectManager) };
    const total = roles.architect + roles.srConsultant + roles.projectManager;
    if (total > 0) merged.push({
      id: LATER_DESIGN_PHASE.id, label: LATER_DESIGN_PHASE.label, category: lead?.category ?? null, workstreamType: lead?.workstreamType ?? null, leadRole: lead?.leadRole ?? "Architect",
      start: null, end: null, architect: 0, srConsultant: 0, projectManager: 0, total: 0, deferred: "not funded", followOn: { ...roles, total },
      placement: "auto", owner: "cdw", baseline: { architect: 0, srConsultant: 0, projectManager: 0 }, adjusted: false,
      detail: { outcome: LATER_DESIGN_PHASE.outcome, acceptance: LATER_DESIGN_PHASE.acceptance },
    });
  }
  return { ...effort, workPackages: [...merged, ...alongside] };
}

/** The v1 bracket model. */
export function buildScopedEffortV1(document: EngagementDocument, options: ScopedEffortOptions = {}): ScopedEffort {
  const entitled = document.report.entitlement.hours;
  const envelopeHours = entitled ?? options.envelopeHours ?? null;
  const envelopeSource = entitled !== null ? "entitled hours" : envelopeHours !== null ? options.envelopeSource ?? "entitlement value" : "none";
  const fitted = fitToEnvelope(scopedEffortLines(document), envelopeHours);
  return assembleScopedEffort(document, fitted.lines, {
    envelopeHours,
    envelopeSource,
    fullScopeHours: fitted.fullScopeHours,
    status: fitted.status,
    shortfallHours: fitted.shortfallHours,
    headroomHours: fitted.headroomHours,
  });
}

/** Rows, stage hours and totals from a model's lines. */
function assembleScopedEffort(
  document: EngagementDocument,
  lines: EffortLine[],
  fit: { envelopeHours: number | null; envelopeSource: ScopedEffort["internal"]["envelopeSource"]; fullScopeHours: number; status: FitStatus; shortfallHours: number; headroomHours: number },
  extra: Pick<ScopedEffort["internal"], "pass1" | "fit"> = {},
): ScopedEffort {
  const calculatedRows = rowsFromLines(lines);
  const assignments: EffortRow[] = completedReport(document.report).resourceAssignments.map(item => ({
    workstream: item.workstream,
    architect: item.architect,
    srConsultant: item.srConsultant,
    projectManager: item.projectManager,
    ...(item.seniorArchitect ? { seniorArchitect: item.seniorArchitect } : {}),
    ...(item.offshoreProjectManager ? { offshoreProjectManager: item.offshoreProjectManager } : {}),
    total: item.architect + item.srConsultant + item.projectManager + (item.seniorArchitect ?? 0) + (item.offshoreProjectManager ?? 0),
  }));
  // v2: the runbook needs CDW's proving waves; a plan with waves in scope but none funded holds it back.
  const holdRunbook = Boolean(extra.pass1?.lines.some(item => item.code === "FILL_mig")) && !lines.some(item => item.code === "FILL_mig");
  const workPackages = workPackageEffort(document, lines, totalsOf(calculatedRows), { holdRunbook, firstWorkloadSeparate: Boolean(extra.pass1?.lines.some(item => item.code === "DW")) });
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
      lines,
      calculatedRows,
      envelopeHours: fit.envelopeHours,
      envelopeSource: fit.envelopeSource,
      fullScopeHours: Math.round(fit.fullScopeHours),
      planHours: calculatedTotals.total,
      status: fit.status,
      shortfallHours: Math.round(fit.shortfallHours),
      headroomHours: Math.round(fit.headroomHours),
      ...extra,
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
  /** The work packages and customer-run work the phase covers; its window is their span. */
  sources: Array<{ label: string; start: string; end: string }>;
  platformLead: number;
  operations: number;
  network: number;
  total: number;
  fte: number;
};

type PhaseKey = "design" | "build" | "migration" | "customerWaves" | "capability" | "recovery" | "handover";

/** Default customer hours per week by phase type: platform lead, operations, network. */
export const CUSTOMER_EFFORT_DEFAULTS: Record<PhaseKey, { phase: string; platformLead: number; operations: number; network: number }> = {
  design: { phase: "Design sessions and design sign-off", platformLead: 3, operations: 2, network: 2 },
  build: { phase: "Platform build", platformLead: 4, operations: 2, network: 2 },
  migration: { phase: "Migration waves", platformLead: 8, operations: 6, network: 1 },
  // The customer's team runs these waves itself, so it carries the platform and application work CDW carried in the proving waves.
  customerWaves: { phase: "Customer-run migration waves", platformLead: 16, operations: 10, network: 4 },
  capability: { phase: "Capability enablement", platformLead: 3, operations: 3, network: 1 },
  recovery: { phase: "Recovery design and build", platformLead: 3, operations: 3, network: 2 },
  handover: { phase: "Knowledge transfer and handover", platformLead: 2, operations: 3, network: 1 },
};

function phaseOf(activity: TimelineBar): PhaseKey | null {
  const id = activity.id;
  if (/^bar-(playbook-design-|playbook-component-design-|platform-plan$)/.test(id)) return "design";
  if (/^bar-(management-domain|vvf-foundation|vvf-workload-clusters|workload-domain|vcf-networking-nsx|converge-management-domain|import-foundation-validation|in-place-preparation|networking-|hcl-|soft-prerequisite-)/.test(id)) return "build";
  if (/^bar-(playbook-execution-|import-workload-domain(-\d+)?$)/.test(id)) return "migration";
  if (/^bar-import-domain-\d+$/.test(id)) return "build";
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

/** Who runs the migration and upgrade waves. CDW runs all of them unless the customer asked otherwise (a per-engagement setting). */
export function migrationWavesChoice(document: EngagementDocument): "cdw" | "customer-remaining" | "customer-all" {
  return document.fields.estimateInputs.migrationWaves ?? "cdw";
}

/**
 * The waves the customer's team runs, only when they asked to (the Migration waves setting). After CDW's first waves
 * ("customer-remaining") they start the month after CDW's waves end and take about one month per 250 VMs (3 to 12 months);
 * the label says "with the proven runbook" only when CDW's first waves and the runbook transfer are in the funded plan.
 * With "customer-all" they run every wave, from the end of CDW's design and build. Null otherwise.
 */
export function customerRemainingWaves(document: EngagementDocument): { label: string; start: string; end: string } | null {
  const choice = migrationWavesChoice(document);
  if (choice === "cdw") return null;
  const funded = (test: (id: string) => boolean) => buildScopedEffort(document).workPackages.some(row => test(row.id) && row.total > 0 && !row.deferred);
  if (choice === "customer-all") return plannedCustomerWaves(document, false);
  // They exist only behind CDW's first waves in the entitlement; waves that moved to the follow-on are CDW's whole package.
  if (!funded(id => /^bar-playbook-execution-/.test(id))) return null;
  return plannedCustomerWaves(document, funded(id => id === RUNBOOK_TRANSFER_BAR));
}

/** The customer's waves as the timeline places them, whether or not CDW's first waves are funded (the fit decides that). */
function plannedCustomerWaves(document: EngagementDocument, provenRunbook: boolean): { label: string; start: string; end: string } | null {
  const choice = migrationWavesChoice(document);
  // CDW's waves in the entitlement, or in the Two-Year Notional when they moved there; with the customer running all, the last of CDW's design and build.
  const endOf = (timeline: Timeline, pattern: RegExp) => timeline.lanes.flatMap(lane => lane.bars).filter(bar => pattern.test(bar.id))
    .map(bar => barWindow(timeline, bar)?.end).filter((end): end is string => Boolean(end)).sort().at(-1);
  const pattern = choice === "customer-all" ? /^bar-/ : /^bar-playbook-execution-/;
  const last = endOf(document.adoptionTimeline, pattern) ?? endOf(document.twoYearPlan, pattern);
  if (!last) return null;
  const upgrade = effectiveDeliveryPath(document.fields) === "in-place";
  const months = Math.min(12, Math.max(3, Math.ceil((document.inventory.vmCount || 0) / 250)));
  const month = (iso: string, add: number) => { const date = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + add); return date.toISOString().slice(0, 7); };
  const customer = document.fields.customerName || "the customer";
  const kind = upgrade ? "upgrade" : "migration";
  const label = choice === "customer-all"
    ? `${upgrade ? "Upgrade" : "Migration"} waves, run by ${customer}`
    : `Remaining ${kind} waves, run by ${customer}${provenRunbook ? " with the proven runbook" : ""}`;
  return { label, start: month(last, 1), end: month(last, months) };
}

/** Labels that name migration or upgrade waves. */
export const WAVES_LABEL = /\bwaves?\b/i;

/** True when the customer's team runs waves, because the planner chose it (a customer request). Those waves are then customer work only, never CDW follow-on scope as well. */
export function customerRunsRemainingWaves(document: EngagementDocument): boolean {
  return migrationWavesChoice(document) !== "cdw";
}

/** Customer effort per phase from the plan's windows and the default hours per week. */
export function buildCustomerEffort(document: EngagementDocument): { phases: CustomerEffortPhase[]; peak: CustomerEffortPhase | null } {
  const timeline = document.adoptionTimeline;
  const sources = new Map<PhaseKey, CustomerEffortPhase["sources"]>();
  const add = (key: PhaseKey, source: CustomerEffortPhase["sources"][number]) => sources.set(key, [...(sources.get(key) ?? []), source]);
  for (const activity of timeline.lanes.flatMap(lane => lane.bars)) {
    const key = phaseOf(activity);
    const window = key ? barWindow(timeline, activity) : null;
    if (key && window) add(key, { label: activity.label, ...window });
  }
  // Customer-run work: the waves the customer's team runs itself are their own, heavier phase; other customer work
  // (site prerequisites, hardware) prepares the build, never the migration waves.
  for (const work of completedReport(document.report).customerOwnedWork) {
    const start = work.start.length === 7 ? `${work.start}-01` : work.start;
    const end = work.end.length === 7 ? `${work.end}-28` : work.end;
    add(WAVES_LABEL.test(work.label) && customerRunsRemainingWaves(document) ? "customerWaves" : "build", { label: work.label, start, end });
  }
  const phases = Array.from(sources.entries()).map(([key, items]) => {
    const defaults = CUSTOMER_EFFORT_DEFAULTS[key];
    const total = defaults.platformLead + defaults.operations + defaults.network;
    const start = items.map(item => item.start).sort()[0];
    const end = items.map(item => item.end).sort().at(-1)!;
    return { phase: defaults.phase, window: formatWindow(start, end), startDate: start, sources: items, platformLead: defaults.platformLead, operations: defaults.operations, network: defaults.network, total, fte: Math.round((total / 40) * 100) / 100 };
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
  const termEnd = report.entitlement.termEnd || calculateEntitlementEndDate(fields.entitlementStart) || fields.entitlementEnd;
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
    gapPoints,
    band: absolute >= 24 ? "AT RISK" : absolute >= 11 ? "WATCH" : "ON TRACK",
  };
}
