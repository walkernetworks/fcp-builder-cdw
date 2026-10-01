import { barWindow } from "./buildingBlocks";
import { calculateEntitlementEndDate, effectiveDeliveryPath, effectivePlatformEdition, resolvePlanOutcomes, type EngagementDocument, type TimelineBar } from "./fcp";

/**
 * Hours model for the Condensed FCP, after the fcp-builder skill's fcp_hours.py.
 *
 * Scoped effort is priced from the services catalog: the smallest bracket that fits the estate, never
 * per-host constants. Each line's base hours are split by role (lead 100%, support 15%, project manager
 * 25% of the two). Migration and in-place waves have no bracket and are solved to the envelope.
 * Signed Resource Assignments replace the calculated table on the page when they are entered.
 *
 * This module holds no rates. The envelope is the entitled hours when known; the server may supply an
 * envelope estimated from the entitlement value. The fit result is internal and never rendered.
 */

export const ROLE_LOADING = 1.4375;

type Lead = "architect" | "srConsultant";
type LineKind = "core" | "repeatable" | "addon" | "fill";

/** Catalog brackets: base hours and lead role. Codes stay internal. */
const CATALOG = {
  A1: { base: 75, lead: "architect" }, A2: { base: 100, lead: "architect" }, A3: { base: 165, lead: "architect" }, A4: { base: 230, lead: "architect" },
  // Design discovery, sized like the former discovery brackets; consultant-led.
  DD1: { base: 34, lead: "srConsultant" }, DD2: { base: 85, lead: "srConsultant" }, DD3: { base: 200, lead: "srConsultant" },
  D1: { base: 90, lead: "srConsultant" }, D2: { base: 135, lead: "srConsultant" }, D3: { base: 195, lead: "srConsultant" }, D4: { base: 210, lead: "srConsultant" },
  D5: { base: 210, lead: "srConsultant" }, D6: { base: 225, lead: "srConsultant" }, D7: { base: 300, lead: "srConsultant" }, D8: { base: 410, lead: "srConsultant" },
  X1: { base: 75, lead: "srConsultant" }, X2: { base: 80, lead: "srConsultant" }, X3: { base: 80, lead: "srConsultant" }, X4: { base: 80, lead: "srConsultant" },
  X5: { base: 80, lead: "srConsultant" }, X6: { base: 100, lead: "architect" }, X7: { base: 20, lead: "architect" }, X8: { base: 80, lead: "srConsultant" },
  X9: { base: 40, lead: "srConsultant" }, X10: { base: 70, lead: "srConsultant" }, X11: { base: 36, lead: "architect" }, X12: { base: 68, lead: "architect" },
  X13: { base: 40, lead: "srConsultant" }, X14: { base: 40, lead: "srConsultant" }, X15: { base: 40, lead: "srConsultant" },
} as const satisfies Record<string, { base: number; lead: Lead }>;
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

export type FitStatus = "no-envelope" | "fits" | "fits-reduced" | "short";
export type ScopedEffort = {
  /** Which table the report shows. */
  source: "assignments" | "calculated";
  rows: EffortRow[];
  totals: RoleHours & { total: number };
  /** INTERNAL: the calculated lines and the fit against the envelope. Never rendered in the report. */
  internal: {
    lines: EffortLine[];
    calculatedRows: EffortRow[];
    envelopeHours: number | null;
    envelopeSource: "entitled hours" | "entitlement value" | "none";
    fullScopeHours: number;
    planHours: number;
    status: FitStatus;
    shortfallHours: number;
    headroomHours: number;
  };
};

export function splitRoles(base: number, lead: Lead): RoleHours {
  const support = 0.15 * base;
  const architect = lead === "architect" ? base : support;
  const srConsultant = lead === "architect" ? support : base;
  return { architect, srConsultant, projectManager: 0.25 * (architect + srConsultant) };
}

const loaded = (line: Pick<EffortLine, "base">) => line.base * ROLE_LOADING;

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
  if (report.discovery.assessmentCompleted !== true) lines.push(line(design, discoveryBracket(sites, servers), "core"));

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
  if (!designOnly) {
    if (!vvf && has("networking:edge-cluster-routing", "networking:vpc")) lines.push(line("NSX networking, Edge and VPC", "X6", "addon"));
    else if (!vvf && has("networking:overlay-transport", "networking:network-operations")) lines.push(line("NSX networking", "X5", "addon"));
    if (vvf && has("networking:physical-fabric")) lines.push(line("VDS networking", "X7", "addon"));
    if (has("automation:vm-self-service", "automation:day-2-automation", "automation:core", "automation:infrastructure-as-code", "automation:governance", "automation:application-provisioning")) {
      lines.push(line("Automation and self-service", has("automation:infrastructure-as-code", "automation:governance", "automation:application-provisioning") ? "X3" : "X2", "addon"));
    }
    if (has("operations:observability", "operations:custom-dashboards", "operations:capacity-cost", "operations:event-integration", "operations:core")) lines.push(line("VCF Operations, dashboards and logs", "X4", "addon"));
    if (hasAny("kubernetes")) lines.push(line("Supervisor and VKS", "X9", "addon"));
    if (hasAny("private-ai")) lines.push(line("Private AI Services", "X8", "addon"));
    if (has("automation:data-services")) lines.push(line("Data Services Manager", "X13", "addon"));
    if (has("security:ids-ips", "security:malware-prevention", "security:security-intelligence", "security:identity-firewall")) lines.push(line("vDefend firewall and threat prevention", "X12", "addon"));
    else if (has("security:segmentation")) lines.push(line("vDefend distributed firewall", "X11", "addon"));
    if (has("resilience:recovery-architecture", "resilience:recovery-exercises", "resilience:cyber-recovery", "resilience:core")) lines.push(line("VMware Live Recovery", "X10", "addon"));
    if (has("resilience:cloud-cyber-recovery")) lines.push(line("Live Cyber Recovery", "X14", "addon"));
    if (has("networking:load-balancing", "security:waf")) lines.push(line("Avi Load Balancer and WAF", "X15", "addon"));
  }
  return lines;
}

function rowsFromLines(lines: EffortLine[]): EffortRow[] {
  const byWorkstream = new Map<string, RoleHours & { notes: Set<string> }>();
  for (const item of lines) {
    const roles = splitRoles(item.base, item.lead);
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

export function buildScopedEffort(document: EngagementDocument, options: { envelopeHours?: number | null; envelopeSource?: ScopedEffort["internal"]["envelopeSource"] } = {}): ScopedEffort {
  const entitled = document.report.entitlement.hours;
  const envelopeHours = entitled ?? options.envelopeHours ?? null;
  const envelopeSource = entitled !== null ? "entitled hours" : envelopeHours !== null ? options.envelopeSource ?? "entitlement value" : "none";
  const fitted = fitToEnvelope(scopedEffortLines(document), envelopeHours);
  const calculatedRows = rowsFromLines(fitted.lines);
  const assignments = document.report.resourceAssignments.map(item => ({
    workstream: item.workstream,
    architect: item.architect,
    srConsultant: item.srConsultant,
    projectManager: item.projectManager,
    total: item.architect + item.srConsultant + item.projectManager,
  }));
  const rows = assignments.length ? assignments : calculatedRows;
  return {
    source: assignments.length ? "assignments" : "calculated",
    rows,
    totals: totalsOf(rows),
    internal: {
      lines: fitted.lines,
      calculatedRows,
      envelopeHours,
      envelopeSource,
      fullScopeHours: Math.round(fitted.fullScopeHours),
      planHours: totalsOf(calculatedRows).total,
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
  for (const work of document.report.customerOwnedWork) {
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
