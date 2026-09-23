import type { EngagementDocument, MinimalFields, Timeline, TimelineBar } from "./fcp";

/**
 * Maps a generated FCP onto the Broadcom VCF 9 Building Blocks workbook ("Full Version" tab).
 * Each block is matched to plan activities by their stable bar id; activities the planner
 * added by hand are matched by label keywords instead, because their ids carry no meaning.
 */

export const CAPABILITY_RATINGS = ["Strongly Agree", "Mostly Agree", "Mostly Disagree", "Strongly Disagree", "*Out of Scope"] as const;
export type CapabilityRating = (typeof CAPABILITY_RATINGS)[number];

export const CUSTOMER_DELIVERABLE_STATUSES = ["In Progress", "Out of Scope", "Planning/TBD", "Completed"] as const;
export type CustomerDeliverableStatus = (typeof CUSTOMER_DELIVERABLE_STATUSES)[number];

/** "selected" activities come from an explicit outcome, focus, or pathway choice; "depth" activities only from an adoption-depth tier. */
type MatchKind = "selected" | "depth";

type BarRule = {
  id: RegExp;
  kind?: MatchKind;
  when?: (fields: MinimalFields) => boolean;
};

export type BuildingBlockDefinition = {
  /** Assessment Area (column C) exactly as the template names it, whitespace-normalized. */
  area: string;
  rules: BarRule[];
  /** Matches activities that were added by hand in the timeline editor. */
  keywords?: RegExp;
};

const usesVsan = (fields: MinimalFields) => fields.adoptionDetails.principalStorage === "vsan";
const hasNetworkingFocus = (focus: MinimalFields["adoptionDetails"]["networking"][number]) => (fields: MinimalFields) => fields.adoptionDetails.networking.includes(focus);

const PLATFORM_BUILD = /^bar-(management-domain|converge-management-domain|import-foundation-validation|workload-domain|playbook-execution-(upgrade|delivery)-waves)$/;

export const BUILDING_BLOCKS: BuildingBlockDefinition[] = [
  // Platform Foundation
  { area: "Assess & Review Workshop", rules: [{ id: /^bar-(platform-plan|playbook-design-(requirements|pathway-decision|target-state|decision-register))$/ }], keywords: /\b(assess|discovery|requirements) workshop\b/i },
  { area: "Site Readiness Validation", rules: [{ id: /^bar-(hcl-gate|hcl-remediation|in-place-preparation|import-foundation-validation|soft-prerequisite-.+|playbook-design-platform-design)$/ }], keywords: /\bsite readiness\b|\bHCL\b/i },
  { area: "VCF Management Domain (SDDC, Ops, NSX Manager, vCenter and Automation)", rules: [{ id: PLATFORM_BUILD }, { id: /^bar-playbook-adoption-.+$/ }, { id: /^bar-playbook-design-logical-physical-design$/ }], keywords: /\bmanagement domain\b/i },
  { area: "Identity Broker & Multi-Tenancy", rules: [{ id: /^bar-(security-identity-rbac|operations-identity-certificates|cloud-automation-governance)$/ }], keywords: /\bidentity broker\b|\bmulti-?tenan/i },
  { area: "Solution License Management", rules: [{ id: PLATFORM_BUILD }], keywords: /\blicens/i },
  // Storage / Datastore
  { area: "Assess & Review (vSAN)", rules: [{ id: /^bar-playbook-design-(platform-design|target-state|logical-physical-design)$/, when: usesVsan }], keywords: /\bvSAN\b.*\b(design|assess)/i },
  { area: "vSAN ESA Implementation", rules: [{ id: PLATFORM_BUILD, when: usesVsan }], keywords: /\bvSAN\b/i },
  { area: "NVMe Memory Tiering", rules: [{ id: /^bar-playbook-component-design-efficiency$/, kind: "depth" }], keywords: /\bmemory tiering\b/i },
  // Networking & Connectivity
  { area: "Assess & Review (NSX)", rules: [{ id: /^bar-playbook-component-design-networking$/, kind: "depth" }], keywords: /\bNSX\b.*\b(design|assess)/i },
  { area: "NSX Overlay Networking", rules: [{ id: /^bar-(vcf-networking-nsx|two-year-baseline-networking-nsx)$/ }], keywords: /\boverlay\b/i },
  { area: "VCF VPC", rules: [], keywords: /\bVPC\b|\btransit gateway\b/i },
  { area: "NSX Edge Connectivity", rules: [{ id: /^bar-vcf-networking-nsx$/, when: hasNetworkingFocus("edge-cluster-routing") }], keywords: /\bedge\b|\bBGP\b/i },
  // Operational Observability
  { area: "Assess & Review (VCF Operations)", rules: [{ id: /^bar-playbook-component-design-operations$/, kind: "depth" }], keywords: /\bVCF Operations\b.*\b(design|assess)/i },
  { area: "Dashboards & Logs", rules: [{ id: /^bar-operations-(observability|custom-dashboards)$/ }], keywords: /\bdashboard/i },
  { area: "Fleet Management", rules: [{ id: /^bar-playbook-adoption-.+$/ }], keywords: /\bfleet\b/i },
  { area: "Capacity Management (Forecast & Right-size)", rules: [{ id: /^bar-operations-capacity-cost$/ }], keywords: /\bcapacity\b|\bright-?siz/i },
  { area: "Lifecycle Management", rules: [{ id: /^bar-(operations-lifecycle|operations-core|two-year-baseline-operating-model)$/ }], keywords: /\blifecycle\b|\bpatch/i },
  { area: "Certificate & Password Mgmt", rules: [{ id: /^bar-operations-identity-certificates$/ }], keywords: /\bcertificate|\bpassword|\bcredential/i },
  { area: "Compliance Management", rules: [{ id: /^bar-security-hardening-compliance$/ }], keywords: /\bcompliance\b/i },
  { area: "Log Management & Analytics", rules: [{ id: /^bar-operations-observability$/ }], keywords: /\blog(s|ging)?\b/i },
  { area: "Proactive Support & Diagnostics", rules: [{ id: /^bar-operations-(observability|event-integration)$/ }], keywords: /\bdiagnostic|\bsupport bundle/i },
  { area: "FinOps (Chargeback & Showback)", rules: [{ id: /^bar-operations-capacity-cost$/ }], keywords: /\bfinops\b|\bchargeback\b|\bshowback\b/i },
  { area: "Hybrid Cloud Mobility (HCX)", rules: [{ id: /^bar-playbook-(design-migration-design|design-integrated-runbook|execution-migration-waves|execution-delivery-waves)$/ }], keywords: /\bHCX\b|\bmigration\b/i },
  // Apps & Cloud Consumption
  { area: "Assess & Review (Automation/Apps)", rules: [{ id: /^bar-playbook-component-design-automation$/, kind: "depth" }], keywords: /\bautomation\b.*\b(design|assess)/i },
  { area: "Infrastructure-as-Code", rules: [{ id: /^bar-cloud-automation-infrastructure-as-code$/ }], keywords: /\binfrastructure-as-code\b|\bIaC\b|\bterraform\b/i },
  { area: "Self-Service Catalog", rules: [{ id: /^bar-cloud-automation(-(vm-self-service|governance|application-provisioning|day-2-automation))?$/ }], keywords: /\bself-service\b|\bcatalog\b/i },
  { area: "VCF Kubernetes Service (VKS)", rules: [{ id: /^bar-cloud-kubernetes(-.+)?$/ }, { id: /^bar-playbook-component-design-kubernetes$/, kind: "depth" }], keywords: /\bkubernetes\b|\bVKS\b|\bsupervisor\b/i },
  { area: "Enterprise Image Registry (Harbor)", rules: [{ id: /^bar-cloud-kubernetes-(developer-experience|platform-operations)$/ }], keywords: /\bharbor\b|\bimage registry\b/i },
  { area: "Data Services Manager (DSM)", rules: [], keywords: /\bdata services\b|\bDSM\b/i },
  { area: "Private AI Services", rules: [{ id: /^bar-cloud-private-ai(-.+)?$/ }, { id: /^bar-playbook-component-design-private-ai$/, kind: "depth" }], keywords: /\bprivate AI\b|\bGPU\b/i },
  { area: "Avi Load Balancer (App Ingress)", rules: [], keywords: /\bavi\b|\bload balanc/i },
  // Resilience & Recovery
  { area: "Assess & Review (DR/Cyber)", rules: [{ id: /^bar-playbook-component-design-resilience$/, kind: "depth" }], keywords: /\b(recovery|resilience)\b.*\b(design|assess)/i },
  { area: "Site Recovery (SRM or ACC SRM)", rules: [{ id: /^bar-resilience-(recovery-architecture|recovery-exercises|core)$/ }], keywords: /\bsite recovery\b|\bSRM\b|\bdisaster recovery\b/i },
  { area: "Cyber Recovery (Cloud or On Prem)", rules: [{ id: /^bar-resilience-cyber-recovery$/ }], keywords: /\bcyber[- ]recovery\b/i },
  { area: "Cloud Recovery", rules: [], keywords: /\bcloud recovery\b/i },
  // Security & Compliance
  { area: "Assess & Review (Security)", rules: [{ id: /^bar-playbook-component-design-security$/, kind: "depth" }], keywords: /\bsecurity\b.*\b(design|assess)/i },
  { area: "Distributed Firewall (DFW)", rules: [{ id: /^bar-security-(segmentation|core)$/ }], keywords: /\bDFW\b|\bdistributed firewall\b|\bsegmentation\b/i },
  { area: "vDefend ATP (Distributed IDS/IPS)", rules: [], keywords: /\bIDS\b|\bIPS\b/i },
  { area: "vDefend ATP (Malware Prevention & Sandbox)", rules: [], keywords: /\bmalware\b|\bsandbox/i },
  { area: "vDefend ATP (Identity-Aware Firewall)", rules: [], keywords: /\bidentity[- ]aware\b|\bidentity firewall\b/i },
  { area: "vDefend ATP (Security Intelligence)", rules: [], keywords: /\bsecurity intelligence\b|\btraffic (analytics|visuali[sz]ation)\b/i },
  { area: "AVI LB (Layer-7 WAF & Ingress Security)", rules: [], keywords: /\bWAF\b/i },
  { area: "Salt (ACC)", rules: [{ id: /^bar-security-hardening-compliance$/ }], keywords: /\bsalt\b|\bconfiguration management\b/i },
];

export type BuildingBlockAssessment = {
  area: string;
  rating: CapabilityRating;
  deliverable: CustomerDeliverableStatus;
  /** ISO dates (inclusive); empty when the block is not in the plan. */
  projectedStart: string;
  projectedEnd: string;
  projectedDates: string;
  activities: string[];
};

export function normalizeBlockArea(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

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

type Match = { bar: TimelineBar; kind: MatchKind; window: { start: string; end: string } | null };

function blockMatches(block: BuildingBlockDefinition, timeline: Timeline, fields: MinimalFields, recognizedIds: Set<string>): Match[] {
  return timeline.lanes.flatMap(lane => lane.bars).flatMap(bar => {
    const rule = block.rules.find(candidate => candidate.id.test(bar.id) && (!candidate.when || candidate.when(fields)));
    if (rule) return [{ bar, kind: rule.kind ?? "selected", window: barWindow(timeline, bar) }];
    if (!recognizedIds.has(bar.id) && block.keywords?.test(bar.label)) return [{ bar, kind: "selected" as const, window: barWindow(timeline, bar) }];
    return [];
  });
}

/** Ids produced by the plan generator in shared/fcp.ts; anything else was added in the timeline editor. */
const GENERATED_BAR_ID = /^bar-(platform-|playbook-|hcl-|operations-|cloud-|security-|resilience-|two-year-baseline-|soft-prerequisite-|management-domain$|converge-management-domain$|import-|in-place-preparation$|workload-domain$|vcf-networking-nsx$)/;

function recognizedBarIds(timeline: Timeline): Set<string> {
  return new Set(timeline.lanes.flatMap(lane => lane.bars).map(bar => bar.id).filter(id => GENERATED_BAR_ID.test(id)));
}

function deliverableStatus(window: { start: string; end: string } | null, today: string): CustomerDeliverableStatus {
  if (!window) return "Planning/TBD";
  if (today < window.start) return "Planning/TBD";
  if (today > window.end) return "Completed";
  return "In Progress";
}

/**
 * Scores every building block against the plan:
 * - Strongly Agree: an explicitly selected activity is in the Entitlement Adoption Timeline
 * - Mostly Agree: only adoption-depth design activities are in the Entitlement Adoption Timeline
 * - Mostly Disagree: the block appears only in the Two-Year Notional (or is deferred)
 * - *Out of Scope: nothing in the plan covers the block
 */
export function assessBuildingBlocks(document: EngagementDocument, today: string = isoDate(new Date())): BuildingBlockAssessment[] {
  const { fields, adoptionTimeline, twoYearPlan } = document;
  const adoptionIds = recognizedBarIds(adoptionTimeline);
  const twoYearIds = recognizedBarIds(twoYearPlan);

  return BUILDING_BLOCKS.map(block => {
    const adoptionMatches = blockMatches(block, adoptionTimeline, fields, adoptionIds);
    const committed = adoptionMatches.filter(match => !match.bar.deferred);
    const directional = committed.length ? [] : [...adoptionMatches, ...blockMatches(block, twoYearPlan, fields, twoYearIds)];
    const matches = committed.length ? committed : directional;

    const rating: CapabilityRating = committed.some(match => match.kind === "selected")
      ? "Strongly Agree"
      : committed.length
        ? "Mostly Agree"
        : directional.length
          ? "Mostly Disagree"
          : "*Out of Scope";

    const windows = matches.flatMap(match => (match.window ? [match.window] : []));
    const projectedStart = windows.length ? windows.map(window => window.start).sort()[0] : "";
    const projectedEnd = windows.length ? windows.map(window => window.end).sort().at(-1)! : "";
    const window = projectedStart ? { start: projectedStart, end: projectedEnd } : null;

    return {
      area: block.area,
      rating,
      deliverable: matches.length ? deliverableStatus(window, today) : "Out of Scope",
      projectedStart,
      projectedEnd,
      projectedDates: window ? `${displayDate(window.start)} – ${displayDate(window.end)}` : "",
      activities: Array.from(new Set(matches.map(match => match.bar.label))),
    };
  });
}

export function isCommercialCustomer(fields: Pick<MinimalFields, "customerSegment">): boolean {
  return fields.customerSegment === "commercial";
}
