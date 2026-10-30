import { effectivePlatformEdition, type EngagementDocument, type MinimalFields, type Timeline, type TimelineBar } from "./fcp";

/**
 * Maps a generated FCP onto the Broadcom VCF 9 Building Blocks tool: its categories, blocks, and block statuses.
 * Each block is matched to plan activities by their stable bar id; activities the planner
 * added by hand are matched by label keywords instead, because their ids carry no meaning.
 */

/** Block statuses offered by the Building Blocks tool. "Stalled" is never derived; the planner sets it by hand. */
export const BLOCK_STATUSES = ["Planning", "In Progress", "Stalled", "Completed", "Out of Scope"] as const;
export type BlockStatus = (typeof BLOCK_STATUSES)[number];

/** Categories in the order the Building Blocks tool lists them. */
export const BLOCK_CATEGORIES = [
  "Discovery & Assessment",
  "Platform Foundation",
  "Storage / Datastore",
  "Networking & Connectivity (Network Fabric)",
  "Operational Observability",
  "Apps & Cloud Consumption",
  "Resilience & Recovery",
  "Security & Compliance",
] as const;
export type BlockCategory = (typeof BLOCK_CATEGORIES)[number];

type BarRule = {
  id: RegExp;
  when?: (fields: MinimalFields) => boolean;
};

export type BuildingBlockDefinition = {
  category: BlockCategory;
  /** Block name exactly as the Building Blocks tool shows it. */
  area: string;
  rules: BarRule[];
  /** Matches activities that were added by hand in the timeline editor. */
  keywords?: RegExp;
};

const usesVsan = (fields: MinimalFields) => fields.adoptionDetails.principalStorage === "vsan";
const isVcf = (fields: MinimalFields) => effectivePlatformEdition(fields) === "vcf";
const isVvf = (fields: MinimalFields) => effectivePlatformEdition(fields) === "vvf";
const hasNetworkingFocus = (focus: MinimalFields["adoptionDetails"]["networking"][number]) => (fields: MinimalFields) => fields.adoptionDetails.networking.includes(focus);

const PLATFORM_BUILD = /^bar-(management-domain|converge-management-domain|import-foundation-validation|workload-domain|playbook-execution-(upgrade|delivery)-waves)$/;
const MANAGEMENT_DOMAIN_BUILD = /^bar-(management-domain|converge-management-domain|import-foundation-validation|playbook-execution-(upgrade|delivery)-waves)$/;

const discovery = (area: string, rules: BarRule[], keywords?: RegExp): BuildingBlockDefinition => ({ category: "Discovery & Assessment", area, rules, keywords });
const platform = (area: string, rules: BarRule[], keywords?: RegExp): BuildingBlockDefinition => ({ category: "Platform Foundation", area, rules, keywords });
const storage = (area: string, rules: BarRule[], keywords?: RegExp): BuildingBlockDefinition => ({ category: "Storage / Datastore", area, rules, keywords });
const networking = (area: string, rules: BarRule[], keywords?: RegExp): BuildingBlockDefinition => ({ category: "Networking & Connectivity (Network Fabric)", area, rules, keywords });
const observability = (area: string, rules: BarRule[], keywords?: RegExp): BuildingBlockDefinition => ({ category: "Operational Observability", area, rules, keywords });
const apps = (area: string, rules: BarRule[], keywords?: RegExp): BuildingBlockDefinition => ({ category: "Apps & Cloud Consumption", area, rules, keywords });
const resilience = (area: string, rules: BarRule[], keywords?: RegExp): BuildingBlockDefinition => ({ category: "Resilience & Recovery", area, rules, keywords });
const security = (area: string, rules: BarRule[], keywords?: RegExp): BuildingBlockDefinition => ({ category: "Security & Compliance", area, rules, keywords });

/** Every block in the order the Building Blocks tool lists it. */
export const BUILDING_BLOCKS: BuildingBlockDefinition[] = [
  discovery("Scoping & Environment Assessment", [{ id: /^bar-(platform-plan|playbook-design-requirements)$/ }], /\b(assess(ment)?|discovery|requirements|scoping) workshop\b|\bscoping\b|\benvironment assessment\b/i),
  discovery("Deployment Posture Assessment", [{ id: /^bar-playbook-design-(pathway-decision|target-state|decision-register)$/ }], /\bposture\b|\bpathway decision\b|\bdecision register\b/i),
  discovery("Site Readiness", [{ id: /^bar-(hcl-(gate|remediation|greenfield|procurement)|in-place-preparation|import-foundation-validation|soft-prerequisite-.+|networking-physical-fabric|playbook-design-platform-design)$/ }], /\bsite readiness\b|\bHCL\b/i),
  discovery("Migration Execution Readiness", [{ id: /^bar-playbook-design-(migration-design|integrated-runbook|converge-runbook|implementation-handoff)$/ }], /\bmigration (readiness|design|plan)|\bcutover\b|\brunbook\b/i),

  platform("Platform Design & Scope", [{ id: /^bar-playbook-design-(target-state|platform-design|logical-physical-design)$/ }], /\bplatform design\b|\blogical and physical\b/i),
  platform("VVF Core", [{ id: /^bar-vvf-(foundation|workload-clusters)$/ }, { id: /^bar-(in-place-preparation|playbook-execution-upgrade-waves|playbook-adoption-vvf-operations)$/, when: isVvf }], /\bVVF\b|\bvSphere Foundation\b/i),
  platform("VCF Management Domain", [{ id: MANAGEMENT_DOMAIN_BUILD, when: isVcf }, { id: /^bar-playbook-adoption-.+$/, when: isVcf }], /\bmanagement domain\b/i),
  platform("VCF Workload Domain", [{ id: /^bar-(workload-domain|import-workload-domain)$/ }], /\bworkload domain\b/i),
  platform("Identity Broker & Multi-Tenancy", [{ id: /^bar-(security-identity-rbac|operations-identity-certificates|cloud-automation-governance)$/, when: isVcf }], /\bidentity broker\b|\bmulti-?tenan/i),
  platform("Solution License Management", [{ id: PLATFORM_BUILD }, { id: /^bar-platform-licensing$/ }], /\blicens/i),

  storage("Storage Design & Scope", [{ id: /^bar-playbook-design-(platform-design|target-state|logical-physical-design)$/, when: usesVsan }], /\b(vSAN|storage)\b.*\b(design|assess)/i),
  storage("vSAN ESA Implementation", [{ id: PLATFORM_BUILD, when: usesVsan }, { id: /^bar-vvf-foundation$/, when: usesVsan }], /\bvSAN\b/i),
  storage("NVMe Memory Tiering", [{ id: /^bar-playbook-component-design-efficiency$/ }], /\bmemory tiering\b/i),

  networking("NSX Design & Scope", [{ id: /^bar-playbook-component-design-networking$/ }], /\bNSX\b.*\b(design|assess)/i),
  networking("NSX Overlay Networking", [{ id: /^bar-(vcf-networking-nsx|two-year-baseline-networking-nsx|networking-overlay-transport)$/ }], /\boverlay\b/i),
  networking("VCF VPC", [{ id: /^bar-networking-vpc$/ }], /\bVPC\b|\btransit gateway\b/i),
  networking("NSX Edge Connectivity", [{ id: /^bar-networking-edge-cluster-routing$/ }, { id: /^bar-vcf-networking-nsx$/, when: hasNetworkingFocus("edge-cluster-routing") }], /\bedge\b|\bBGP\b/i),

  observability("Operations Design & Scope", [{ id: /^bar-playbook-component-design-operations$/ }], /\b(VCF )?Operations\b.*\b(design|assess)/i),
  observability("Dashboards & Logs", [{ id: /^bar-operations-(observability|custom-dashboards)$/ }], /\bdashboard/i),
  observability("Fleet Management", [{ id: /^bar-playbook-adoption-.+$/, when: isVcf }], /\bfleet\b/i),
  observability("Capacity Management (Forecast & Right-size)", [{ id: /^bar-operations-capacity-cost$/ }], /\bcapacity\b|\bright-?siz/i),
  observability("Lifecycle Management", [{ id: /^bar-(operations-lifecycle|operations-core|two-year-baseline-operating-model)$/ }], /\blifecycle\b|\bpatch/i),
  observability("Certificate & Password Mgmt", [{ id: /^bar-operations-identity-certificates$/ }], /\bcertificate|\bpassword|\bcredential/i),
  observability("Compliance Management", [{ id: /^bar-security-hardening-compliance$/ }], /\bcompliance\b/i),
  observability("Log Management & Analytics", [{ id: /^bar-operations-observability$/ }], /\blog(s|ging)?\b/i),
  observability("Proactive Support & Diagnostics", [{ id: /^bar-operations-(observability|event-integration)$/ }], /\bdiagnostic|\bsupport bundle/i),
  observability("FinOps (Chargeback & Showback)", [{ id: /^bar-operations-capacity-cost$/ }], /\bfinops\b|\bchargeback\b|\bshowback\b/i),
  observability("Hybrid Cloud Mobility (HCX)", [{ id: /^bar-playbook-(design-migration-design|design-integrated-runbook|execution-migration-waves|execution-delivery-waves)$/ }], /\bHCX\b|\bmigration\b/i),

  apps("Automation Design & Scope", [{ id: /^bar-playbook-component-design-automation$/ }], /\bautomation\b.*\b(design|assess)/i),
  apps("Infrastructure-as-Code", [{ id: /^bar-cloud-automation-infrastructure-as-code$/ }], /\binfrastructure-as-code\b|\bIaC\b|\bterraform\b/i),
  apps("Self-Service Catalog", [{ id: /^bar-cloud-automation(-(vm-self-service|governance|application-provisioning|day-2-automation))?$/ }], /\bself-service\b|\bcatalog\b/i),
  apps("vSphere Kubernetes Services (VKS)", [{ id: /^bar-cloud-kubernetes(-.+)?$/ }, { id: /^bar-playbook-component-design-kubernetes$/ }], /\bkubernetes\b|\bVKS\b|\bsupervisor\b/i),
  apps("Enterprise Image Registry (Harbor)", [{ id: /^bar-cloud-kubernetes-(developer-experience|platform-operations)$/ }], /\bharbor\b|\bimage registry\b/i),
  apps("Data Services Manager (DSM)", [{ id: /^bar-cloud-automation-data-services$/ }], /\bdata services\b|\bDSM\b/i),
  apps("Private AI Services", [{ id: /^bar-cloud-private-ai(-.+)?$/ }, { id: /^bar-playbook-component-design-private-ai$/ }], /\bprivate AI\b|\bGPU\b/i),
  apps("Avi Load Balancer (App Ingress)", [{ id: /^bar-networking-load-balancing$/ }], /\bavi\b|\bload balanc/i),

  resilience("Resilience Design & Scope", [{ id: /^bar-playbook-component-design-resilience$/ }], /\b(recovery|resilience)\b.*\b(design|assess)/i),
  resilience("Site Recovery (SRM or ACC SRM)", [{ id: /^bar-resilience-(recovery-architecture|recovery-exercises|core)$/ }], /\bsite recovery\b|\bSRM\b|\bdisaster recovery\b/i),
  resilience("Cyber Recovery (On Prem)", [{ id: /^bar-resilience-cyber-recovery$/ }], /^(?!.*\bcloud\b).*\bcyber[- ]recovery\b/i),
  resilience("Cyber Recovery (Cloud)", [{ id: /^bar-resilience-cloud-cyber-recovery$/ }], /\bcyber[- ]recovery\b.*\bcloud\b|\bcloud\b.*\bcyber[- ]recovery\b|\bcloud recovery\b/i),

  security("Security Design & Scope", [{ id: /^bar-playbook-component-design-security$/ }], /\bsecurity\b.*\b(design|assess)/i),
  security("Distributed Firewall (DFW)", [{ id: /^bar-security-(segmentation|core)$/ }], /\bDFW\b|\bdistributed firewall\b|\bsegmentation\b/i),
  security("vDefend ATP (Distributed IDS/IPS)", [{ id: /^bar-security-ids-ips$/ }], /\bIDS\b|\bIPS\b/i),
  security("vDefend ATP (Malware Prevention & Sandbox)", [{ id: /^bar-security-malware-prevention$/ }], /\bmalware\b|\bsandbox/i),
  security("vDefend ATP (Identity-Aware Firewall)", [{ id: /^bar-security-identity-firewall$/ }], /\bidentity[- ]aware\b|\bidentity firewall\b/i),
  security("vDefend ATP (Security Intelligence)", [{ id: /^bar-security-(security-intelligence|services-platform)$/ }], /\bsecurity intelligence\b|\btraffic (analytics|visuali[sz]ation)\b/i),
  security("AVI LB (Layer-7 WAF & Ingress Security)", [{ id: /^bar-security-waf$/ }], /\bWAF\b/i),
  security("Salt (ACC)", [{ id: /^bar-security-hardening-compliance$/ }], /\bsalt\b|\bconfiguration management\b/i),
];

/**
 * Block dependencies as the Building Blocks tool lists them. Each inner list is one requirement that any
 * of its blocks satisfies ("VCF Management Domain or VVF Core"); every requirement must be met.
 */
export const BLOCK_DEPENDENCIES: Record<string, string[][]> = {
  "Deployment Posture Assessment": [["Scoping & Environment Assessment"]],
  "Migration Execution Readiness": [["Deployment Posture Assessment"]],
  "Platform Design & Scope": [["Site Readiness"]],
  "VVF Core": [["Platform Design & Scope"]],
  "VCF Management Domain": [["Platform Design & Scope"], ["Site Readiness"]],
  "VCF Workload Domain": [["Platform Design & Scope"]],
  "Identity Broker & Multi-Tenancy": [["VCF Management Domain"]],
  "Solution License Management": [["VCF Management Domain", "VVF Core"]],
  "Storage Design & Scope": [["Platform Design & Scope"]],
  "vSAN ESA Implementation": [["Site Readiness"], ["Storage Design & Scope"]],
  "NVMe Memory Tiering": [["VCF Management Domain"]],
  "NSX Design & Scope": [["Platform Design & Scope"]],
  "NSX Overlay Networking": [["Site Readiness"], ["NSX Design & Scope"]],
  "VCF VPC": [["VCF Management Domain"], ["NSX Overlay Networking"]],
  "NSX Edge Connectivity": [["NSX Overlay Networking"]],
  "Operations Design & Scope": [["Platform Design & Scope"]],
  "Dashboards & Logs": [["VCF Management Domain"], ["Operations Design & Scope"]],
  "Fleet Management": [["VCF Management Domain"], ["Operations Design & Scope"]],
  "Capacity Management (Forecast & Right-size)": [["VCF Management Domain"], ["Operations Design & Scope"]],
  "Lifecycle Management": [["VCF Management Domain"], ["Fleet Management"]],
  "Certificate & Password Mgmt": [["VCF Management Domain"]],
  "Compliance Management": [["Dashboards & Logs"], ["Lifecycle Management"]],
  "Log Management & Analytics": [["Dashboards & Logs"]],
  "Proactive Support & Diagnostics": [["Fleet Management"], ["Dashboards & Logs"]],
  "FinOps (Chargeback & Showback)": [["Dashboards & Logs"], ["Capacity Management (Forecast & Right-size)"]],
  "Hybrid Cloud Mobility (HCX)": [["VCF Management Domain"], ["NSX Overlay Networking"], ["NSX Edge Connectivity"]],
  "Automation Design & Scope": [["Platform Design & Scope"]],
  "Infrastructure-as-Code": [["Automation Design & Scope"]],
  "Self-Service Catalog": [["VCF Management Domain"]],
  "vSphere Kubernetes Services (VKS)": [["VCF Management Domain"]],
  "Enterprise Image Registry (Harbor)": [["Self-Service Catalog"], ["vSphere Kubernetes Services (VKS)"]],
  "Data Services Manager (DSM)": [["Self-Service Catalog"], ["vSphere Kubernetes Services (VKS)"]],
  "Private AI Services": [["Automation Design & Scope"]],
  "Resilience Design & Scope": [["Platform Design & Scope"]],
  "Site Recovery (SRM or ACC SRM)": [["VCF Management Domain"], ["NSX Overlay Networking"], ["Resilience Design & Scope"]],
  "Cyber Recovery (On Prem)": [["vSAN ESA Implementation"]],
  "Cyber Recovery (Cloud)": [["Resilience Design & Scope"], ["NSX Overlay Networking"]],
  "Security Design & Scope": [["Platform Design & Scope"]],
  "Distributed Firewall (DFW)": [["NSX Overlay Networking"], ["NSX Edge Connectivity"]],
  "vDefend ATP (Distributed IDS/IPS)": [["Security Design & Scope"]],
  "vDefend ATP (Malware Prevention & Sandbox)": [["Security Design & Scope"]],
  "vDefend ATP (Identity-Aware Firewall)": [["Identity Broker & Multi-Tenancy"], ["Security Design & Scope"]],
  "vDefend ATP (Security Intelligence)": [["Security Design & Scope"]],
  "AVI LB (Layer-7 WAF & Ingress Security)": [["Security Design & Scope"]],
  "Salt (ACC)": [["Fleet Management"], ["Compliance Management"]],
};

/** "A, B" for all-of requirements; "A or B" within one requirement. */
export function dependencyLabel(area: string): string {
  return (BLOCK_DEPENDENCIES[area] ?? []).map(requirement => requirement.join(" or ")).join(", ");
}

export type BuildingBlockAssessment = {
  category: BlockCategory;
  area: string;
  status: BlockStatus;
  /** Planned blocks that need this one; set only when the plan does not cover the block itself. */
  requiredBy: string[];
  /** ISO dates (inclusive); empty when the block is not in the plan. */
  projectedStart: string;
  projectedEnd: string;
  projectedDates: string;
  activities: string[];
};

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** First day of a timeline column (1-based); endCol is exclusive, so the window ends the day before column endCol starts. */
function columnStart(timeline: Timeline, column: number): Date | null {
  const start = parseIsoDate(timeline.startDate);
  if (!start) return null;
  if (column <= 1) return start;
  if (timeline.cadence === "week") return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + (column - 1) * 7));
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + column - 1, 1));
}

export function barWindow(timeline: Timeline, bar: Pick<TimelineBar, "startCol" | "endCol">): { start: string; end: string } | null {
  const start = columnStart(timeline, bar.startCol);
  const next = columnStart(timeline, bar.endCol);
  if (!start || !next) return null;
  const end = new Date(next.getTime() - 86_400_000);
  return { start: isoDate(start), end: isoDate(end < start ? start : end) };
}

function displayDate(value: string): string {
  const date = parseIsoDate(value);
  return date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date) : value;
}

type Match = { bar: TimelineBar; window: { start: string; end: string } | null };

function blockMatches(block: BuildingBlockDefinition, timeline: Timeline, fields: MinimalFields, recognizedIds: Set<string>): Match[] {
  return timeline.lanes.flatMap(lane => lane.bars).flatMap(bar => {
    const rule = block.rules.find(candidate => candidate.id.test(bar.id) && (!candidate.when || candidate.when(fields)));
    if (rule) return [{ bar, window: barWindow(timeline, bar) }];
    if (!recognizedIds.has(bar.id) && block.keywords?.test(bar.label)) return [{ bar, window: barWindow(timeline, bar) }];
    return [];
  });
}

/** Ids produced by the plan generator in shared/fcp.ts; anything else was added in the timeline editor. */
const GENERATED_BAR_ID = /^bar-(platform-|playbook-|hcl-|operations-|cloud-|security-|resilience-|networking-|vvf-|two-year-baseline-|soft-prerequisite-|management-domain$|converge-management-domain$|import-|in-place-preparation$|workload-domain$|vcf-networking-nsx$)/;

function recognizedBarIds(timeline: Timeline): Set<string> {
  return new Set(timeline.lanes.flatMap(lane => lane.bars).map(bar => bar.id).filter(id => GENERATED_BAR_ID.test(id)));
}

function derivedStatus(window: { start: string; end: string } | null, today: string): BlockStatus {
  if (!window) return "Planning";
  if (today < window.start) return "Planning";
  if (today > window.end) return "Completed";
  return "In Progress";
}

/**
 * Assesses every building block against the plan. A block takes its activities from the Entitlement
 * Adoption Timeline when any are committed there, otherwise from deferred or Two-Year Notional activities.
 * Status follows the projected window against today (Planning, In Progress, Completed); a block that
 * nothing in the plan covers is Out of Scope.
 */
export function assessBuildingBlocks(document: EngagementDocument, today: string = isoDate(new Date())): BuildingBlockAssessment[] {
  const { fields, adoptionTimeline, twoYearPlan } = document;
  const adoptionIds = recognizedBarIds(adoptionTimeline);
  const twoYearIds = recognizedBarIds(twoYearPlan);

  const assessments: BuildingBlockAssessment[] = BUILDING_BLOCKS.map(block => {
    const adoptionMatches = blockMatches(block, adoptionTimeline, fields, adoptionIds);
    const committed = adoptionMatches.filter(match => !match.bar.deferred);
    const directional = committed.length ? [] : [...adoptionMatches, ...blockMatches(block, twoYearPlan, fields, twoYearIds)];
    const matches = committed.length ? committed : directional;

    const windows = matches.flatMap(match => (match.window ? [match.window] : []));
    const projectedStart = windows.length ? windows.map(window => window.start).sort()[0] : "";
    const projectedEnd = windows.length ? windows.map(window => window.end).sort().at(-1)! : "";
    const window = projectedStart ? { start: projectedStart, end: projectedEnd } : null;

    return {
      category: block.category,
      area: block.area,
      status: matches.length ? derivedStatus(window, today) : "Out of Scope",
      projectedStart,
      projectedEnd,
      projectedDates: window ? `${displayDate(window.start)} – ${displayDate(window.end)}` : "",
      activities: Array.from(new Set(matches.map(match => match.bar.label))),
      requiredBy: [],
    };
  });
  return withRequiredDependencies(assessments, isVvf(fields));
}

/**
 * The Building Blocks tool needs every dependency of a selected block. A dependency the plan does not cover
 * is brought in as Planning, with the blocks that need it; this repeats until every requirement is met.
 * For an "either" requirement, the first listed block is brought in.
 */
function withRequiredDependencies(assessments: BuildingBlockAssessment[], vvf: boolean): BuildingBlockAssessment[] {
  const byArea = new Map(assessments.map(item => [item.area, item]));
  // On VVF the platform foundation is VVF Core, so it stands in wherever the tool names the VCF management domain.
  const requirementsFor = (area: string) => (BLOCK_DEPENDENCIES[area] ?? []).map(requirement => vvf
    ? Array.from(new Set(requirement.map(item => (item === "VCF Management Domain" ? "VVF Core" : item))))
    : requirement);
  const included = (area: string) => byArea.get(area)?.status !== "Out of Scope";
  const pending = assessments.filter(item => included(item.area)).map(item => item.area);
  while (pending.length) {
    const area = pending.shift()!;
    for (const requirement of requirementsFor(area)) {
      const alreadyMet = requirement.find(candidate => included(candidate) && !byArea.get(candidate)!.requiredBy.length);
      if (alreadyMet) continue;
      const dependency = byArea.get(requirement.find(included) ?? requirement[0]);
      if (!dependency) continue;
      if (!dependency.requiredBy.includes(area)) dependency.requiredBy.push(area);
      if (dependency.status === "Out of Scope") {
        dependency.status = "Planning";
        pending.push(dependency.area);
      }
    }
  }
  return assessments;
}

export function isCommercialPlan(fields: Pick<MinimalFields, "commercialPlan">): boolean {
  return fields.commercialPlan;
}

/**
 * Planner warning when the platform build starts in a later month (or week) than the planned implementation start,
 * naming what holds it back. Null when the build starts on time or there is no planned implementation start.
 */
export function buildStartWarning(fields: Pick<MinimalFields, "plannedImplementationStart">, timeline: Timeline): string | null {
  if (!fields.plannedImplementationStart) return null;
  const bars = timeline.lanes.flatMap(lane => lane.bars);
  // The build packages are the ones released by the hardware compatibility sign-off.
  const builds = bars.filter(bar => (bar.prerequisites ?? []).includes("bar-hcl-gate") && !bar.milestone);
  if (!builds.length) return null;
  const build = builds.reduce((earliest, candidate) => (candidate.startCol < earliest.startCol ? candidate : earliest));
  const window = barWindow(timeline, build);
  const planned = parseIsoDate(fields.plannedImplementationStart);
  const started = window && parseIsoDate(window.start);
  if (!planned || !started) return null;
  const late = timeline.cadence === "week"
    ? started.getTime() - planned.getTime() >= 7 * 86_400_000
    : started.getUTCFullYear() * 12 + started.getUTCMonth() > planned.getUTCFullYear() * 12 + planned.getUTCMonth();
  if (!late) return null;
  // What ends just as the build starts is what holds it back.
  const gating = bars.filter(bar => bar.endCol === build.startCol && bar.id !== build.id
    && /^bar-(hcl-|playbook-design-|playbook-component-design-|soft-prerequisite-|hardware-delivery|networking-physical-fabric)/.test(bar.id));
  const causes = Array.from(new Set(gating.map(bar => bar.label)));
  const plannedText = displayDate(fields.plannedImplementationStart);
  return `The platform build (“${build.label}”) starts ${displayDate(window!.start)}, after the planned implementation start of ${plannedText}${causes.length ? `, because it waits for ${causes.map(label => `“${label}”`).join(" and ")}` : ""}. Start that work earlier or move the planned implementation start.`;
}
