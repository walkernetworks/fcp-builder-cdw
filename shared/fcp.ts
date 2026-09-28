import { z } from "zod";
import { getIndustryDiscoveryTemplate, industryDiscoveryPromptBlock } from "./industryDiscovery";
import { assessHclEstate, assessHclPlatform, emptyHclInventoryEvidence, hclAssessmentSchema, hclFindingSchedulePath, hclInventoryEvidenceSchema, hclSchedulePath, HCL_CATALOG_METADATA, HCL_CATALOG_RELEASES, HCL_ESTATE_LIMITATION, HCL_EVALUATION_VERSION, HCL_OFFLINE_LIMITATION, HCL_SNAPSHOT, HCL_TARGET_RELEASE, type HclCatalogRelease, type HclSchedulePath } from "./hcl";

export const TIMELINE_COLORS = ["slate", "blue", "teal", "amber", "red", "green", "gate", "deferred"] as const;
export type TimelineColor = (typeof TIMELINE_COLORS)[number];

export const FIXED_GANTT_CATEGORIES = [
  "Program Management & Governance",
  "Modernize Infrastructure",
  "Operations",
  "Modernize Cloud",
  "Modernize Security & Resilience",
] as const;
/** The Gantt always renders these five categories, in this exact order. */
export const TIMELINE_CATEGORIES = FIXED_GANTT_CATEGORIES;
export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number];

const legacyTimelineCategoryAliases: Record<string, TimelineCategory> = {
  "program management & governance": "Program Management & Governance",
  "hardware refresh": "Modernize Infrastructure",
  "modernize infrastructure": "Modernize Infrastructure",
  "operations": "Operations",
  "modernize cloud": "Modernize Cloud",
  "modernize app platform & ai": "Modernize Cloud",
  "modernize security & reliance": "Modernize Security & Resilience",
  "modernize security & resilience": "Modernize Security & Resilience",
};

function normalizePersistedTimelineCategory(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return legacyTimelineCategoryAliases[value.trim().replace(/\s+/g, " ").toLowerCase()] || value;
}

const timelineCategorySchema = z.preprocess(normalizePersistedTimelineCategory, z.enum(TIMELINE_CATEGORIES));

export const WORKSTREAM_TYPES = [
  "Governance",
  "Operating Model / Platform",
  "Infrastructure Build",
  "Migration Waves",
  "Consume / Handover",
  "Security & Resiliency",
] as const;
export type WorkstreamType = (typeof WORKSTREAM_TYPES)[number];

/** Maps prior saved labels to the exact customer-facing labels without widening the visible taxonomy. */
const legacyWorkstreamTypeAliases: Record<string, WorkstreamType> = {
  "governance": "Governance",
  "operating model / platform": "Operating Model / Platform",
  "operating model/platform": "Operating Model / Platform",
  "infrastructure build": "Infrastructure Build",
  "migration waves": "Migration Waves",
  "consume / handover": "Consume / Handover",
  "consume/handover": "Consume / Handover",
  "security & resiliency": "Security & Resiliency",
  "security and resiliency": "Security & Resiliency",
};

function normalizePersistedWorkstreamType(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return legacyWorkstreamTypeAliases[value.trim().replace(/\s+/g, " ").toLowerCase()] || value;
}

const workstreamTypeSchema = z.preprocess(normalizePersistedWorkstreamType, z.enum(WORKSTREAM_TYPES));

/** Color is determined solely by the displayed workstream type. */
export const WORKSTREAM_TYPE_COLORS: Record<WorkstreamType, TimelineColor> = {
  "Governance": "green",
  "Operating Model / Platform": "blue",
  "Infrastructure Build": "amber",
  "Migration Waves": "teal",
  "Consume / Handover": "slate",
  "Security & Resiliency": "red",
};

export function colorForWorkstreamType(workstreamType: WorkstreamType): TimelineColor {
  return WORKSTREAM_TYPE_COLORS[workstreamType];
}

export const timelineCadenceSchema = z.enum(["month", "week"]);
export type TimelineCadence = z.infer<typeof timelineCadenceSchema>;

export const timelineBarSchema = z.object({
  id: z.string().min(1),
  startCol: z.number().int().min(1),
  endCol: z.number().int().min(2),
  color: z.enum(TIMELINE_COLORS),
  label: z.string().min(1),
  dependsOn: z.string().min(1).optional(),
  /** Ids of activities that must finish before this one starts; checked by validateTimelineSequence. */
  prerequisites: z.array(z.string().min(1)).optional(),
  outcome: z.string().min(1).optional(),
  milestone: z.boolean().default(false),
  deferred: z.boolean().default(false),
});

export const timelineLaneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: timelineCategorySchema.default("Program Management & Governance"),
  workstreamType: workstreamTypeSchema.default("Governance"),
  bars: z.array(timelineBarSchema),
});

const timelineV5Schema = z.object({
  columns: z.array(z.string().min(1)).min(2).max(36),
  lanes: z.array(timelineLaneSchema).min(1),
});

export const timelineSchema = z.object({
  cadence: timelineCadenceSchema,
  startDate: z.string(),
  columns: z.array(z.string().min(1)).min(2).max(208),
  lanes: z.array(timelineLaneSchema).min(1),
});

export type TimelineBar = z.infer<typeof timelineBarSchema>;
export type TimelineLane = z.infer<typeof timelineLaneSchema>;
export type Timeline = z.infer<typeof timelineSchema>;

export type DeliveryStaffingAssignment = {
  role: string;
  workstreamType: WorkstreamType;
  categories: TimelineLane["category"][];
  workPackages: string[];
  startCol: number;
  endCol: number;
  startLabel: string;
  endLabel: string;
};

export type DeliveryStaffingPlan = {
  assignments: DeliveryStaffingAssignment[];
  workPackageCount: number;
  peakConcurrentPackages: number;
};

export const DELIVERY_ROLE_BY_WORKSTREAM: Record<WorkstreamType, string> = {
  Governance: "Engagement Manager / Project Manager",
  "Operating Model / Platform": "VCF Architect + Operations Lead",
  "Infrastructure Build": "VCF Implementation Engineer",
  "Migration Waves": "Migration Lead + Application Owners",
  "Consume / Handover": "Automation / Platform Engineer",
  "Security & Resiliency": "Security / Resilience Engineer",
};

export const capabilitySchema = z.enum(["operations", "automation", "networking", "security", "resilience", "kubernetes", "private-ai"]);
export type Capability = z.infer<typeof capabilitySchema>;

export const upgradePathSchema = z.enum([
  "undecided",
  "in-place",
  "converge",
  "import-workload-domain",
  "greenfield",
  "hybrid",
  "design-only",
  /** Legacy values retained for safe parsing and normalized during migration. */
  "new-build",
  "migration-waves",
]);
export type UpgradePath = z.infer<typeof upgradePathSchema>;
export type VcfDeliveryPath = "undecided" | "in-place" | "converge" | "import-workload-domain" | "greenfield" | "hybrid" | "design-only";

export type VcfPlaybookWorkPackage = {
  id: string;
  phase: "Design" | "Implementation" | "Validation" | "Adoption" | "Handoff";
  title: string;
  outcome: string;
  dependsOn: string;
  acceptance: string;
};

export type VcfPlaybookPlan = {
  path: VcfDeliveryPath;
  label: string;
  description: string;
  decisions: string[];
  designPackages: VcfPlaybookWorkPackage[];
  implementationPackages: VcfPlaybookWorkPackage[];
};

export type VcfPlaybookOwnership = {
  category: TimelineCategory;
  workstreamType: WorkstreamType;
};

export function canonicalVcfDeliveryPath(path: UpgradePath): VcfDeliveryPath {
  if (path === "new-build") return "greenfield";
  if (path === "migration-waves") return "hybrid";
  return path;
}

const PLAYBOOK_PATHS: Record<VcfDeliveryPath, Omit<VcfPlaybookPlan, "path">> = {
  undecided: {
    label: "Pathway decision required",
    description: "Complete the decision register before committing implementation work.",
    decisions: ["Existing hardware support", "Existing VCF and vCenter state", "Capital availability", "Risk and rollback tolerance"],
    designPackages: [
      { id: "requirements", phase: "Design", title: "Confirm VCF Requirements and Constraints", outcome: "Issue the requirements and constraints register for scope, support, change windows, and customer responsibilities.", dependsOn: "Imported estate evidence and customer discovery.", acceptance: "Named owners confirm the requirements, constraints, and unresolved evidence." },
      { id: "pathway-decision", phase: "Design", title: "Select VCF Adoption Path and Record Decisions", outcome: "Issue the decision register with pathway options, selected approach, rationale, and rejected alternatives.", dependsOn: "Requirements, HCL disposition, estate health, and funding constraints.", acceptance: "Customer and delivery architecture owners approve the pathway decision." },
    ],
    implementationPackages: [],
  },
  "in-place": {
    label: "In-place upgrade",
    description: "Upgrade the supported existing vSphere estate in place, validate it, and bring the accepted platform under VCF management.",
    decisions: ["Exact vCenter and ESXi builds", "HCL-supported host cohorts", "Upgrade sequence", "Rollback method", "Change windows"],
    designPackages: [
      { id: "requirements", phase: "Design", title: "Confirm Upgrade Requirements and Constraints", outcome: "Issue the requirements and constraints register, including support boundaries, rollback limits, freeze periods, and customer acceptance conditions.", dependsOn: "RVTools estate evidence, exact product builds, HCL disposition, and customer change calendar.", acceptance: "Infrastructure, application, and change owners confirm the baseline and constraints." },
      { id: "target-state", phase: "Design", title: "Design VCF 9.1 Target State and Record Decisions", outcome: "Issue the decision register and logical target state for domains, clusters, component placement, storage, networking, and management ownership.", dependsOn: "Confirmed requirements and supported upgrade pathway.", acceptance: "Architecture owners approve the target state and decision rationale." },
      { id: "platform-design", phase: "Design", title: "Design Management Domain, Platform, and Prerequisites", outcome: "Issue the logical and physical platform design, host and cluster placement, IP/VLAN, DNS/NTP, and prerequisite closure plan.", dependsOn: "Target-state decisions and accepted HCL evidence.", acceptance: "Platform, network, storage, and operations owners accept the detailed design." },
      { id: "upgrade-runbook", phase: "Design", title: "Design Upgrade Runbook, Validation, and Change Windows", outcome: "Issue the implementation runbook with prechecks, sequencing, rollback, post-upgrade health checks, and acceptance criteria.", dependsOn: "Approved platform design, backup and recovery controls, and customer change calendar.", acceptance: "Change authority approves the runbook, rollback plan, validation evidence, and execution windows." },
    ],
    implementationPackages: [
      { id: "upgrade-waves", phase: "Implementation", title: "Execute Approved In-Place Upgrade and Validation Waves", outcome: "Upgrade the approved vCenter and ESXi cohorts to the target release and retain post-wave health evidence.", dependsOn: "Approved runbook, closed HCL prerequisites, recoverable backups, and approved change windows.", acceptance: "Each wave passes platform health, management, storage, network, and workload validation." },
      { id: "vcf-management", phase: "Adoption", title: "Bring the Upgraded Platform Under VCF Management", outcome: "Establish the accepted VCF management and lifecycle operating model for the upgraded estate.", dependsOn: "Accepted upgrade waves and supported VCF management pathway.", acceptance: "Lifecycle, monitoring, backup, ownership, and escalation controls are operational." },
    ],
  },
  converge: {
    label: "Converge existing vCenter",
    description: "Reuse a healthy existing vCenter and convert its cluster into the VCF management domain.",
    decisions: ["Management-domain candidate cluster", "Storage support", "Existing NSX condition", "Network prerequisites", "Convergence rollback"],
    designPackages: [
      { id: "requirements", phase: "Design", title: "Confirm Convergence Requirements and Constraints", outcome: "Validate source vCenter health, cluster membership, storage, HCL status, and existing NSX conditions. Confirm the convergence blockers are closed: Enhanced Linked Mode removed, clusters on vLCM images rather than baselines, no vCenter HA, DRS fully automated, static VMkernel addressing, and no custom vCenter ports.", dependsOn: "Complete estate and platform evidence.", acceptance: "The candidate cluster is accepted for convergence or exceptions are assigned." },
      { id: "target-state", phase: "Design", title: "Design the VCF Management Domain Target State", outcome: "Issue the management-domain logical and physical design, component placement, storage, network, and operations decisions.", dependsOn: "Accepted convergence candidate and pathway decision.", acceptance: "Architecture and operations owners approve the management-domain design." },
      { id: "converge-runbook", phase: "Design", title: "Design the Convergence Runbook and Validation Plan", outcome: "Issue the convergence sequence, fresh NSX prerequisites where applicable, rollback controls, and acceptance tests.", dependsOn: "Approved target-state design and network prerequisites.", acceptance: "Change authority approves the convergence window and validation plan." },
    ],
    implementationPackages: [
      { id: "converge", phase: "Implementation", title: "Converge Existing vCenter into the VCF Management Domain", outcome: "Convert the approved existing environment into an operational VCF management domain.", dependsOn: "Approved convergence runbook and closed HCL/network prerequisites.", acceptance: "Management-domain health, inventory, networking, lifecycle, and operational controls pass validation." },
    ],
  },
  "import-workload-domain": {
    label: "Import as workload domain",
    description: "Import an existing vCenter and all of its clusters into an established VCF instance as a workload domain.",
    decisions: ["Destination VCF instance", "Domain boundary", "Complete vCenter cluster scope", "Dependency and rollback plan"],
    designPackages: [
      { id: "requirements", phase: "Design", title: "Confirm Workload-Domain Import Requirements", outcome: "Validate the destination foundation, complete source-vCenter scope (the whole vCenter is imported, not individual clusters), cluster health, dependencies, and support evidence. Confirm the convergence blockers are closed: Enhanced Linked Mode removed, clusters on vLCM images rather than baselines, no vCenter HA, DRS fully automated, static VMkernel addressing, and no custom vCenter ports.", dependsOn: "An accepted VCF foundation and complete source-vCenter inventory.", acceptance: "Customer confirms that the complete vCenter and its clusters are in scope." },
      { id: "domain-design", phase: "Design", title: "Design Workload-Domain Segmentation and Import", outcome: "Issue the workload-domain boundary, placement, storage, networking, lifecycle, and ownership design.", dependsOn: "Accepted domain scope and destination capacity.", acceptance: "Architecture and operations owners approve the workload-domain design." },
      { id: "import-runbook", phase: "Design", title: "Design Import, Rollback, and Validation Runbook", outcome: "Issue the import sequence, dependency controls, rollback method, and acceptance tests.", dependsOn: "Approved workload-domain design and customer change calendar.", acceptance: "Change authority approves the import runbook and execution window." },
    ],
    implementationPackages: [
      { id: "import", phase: "Implementation", title: "Import Existing vCenter as a VCF Workload Domain", outcome: "Import the complete approved vCenter estate and validate it as an operational VCF workload domain.", dependsOn: "Approved import runbook and healthy destination foundation.", acceptance: "Inventory, cluster health, lifecycle, networking, storage, and workloads pass validation." },
    ],
  },
  greenfield: {
    label: "Greenfield with staging hardware",
    description: "Build a new VCF foundation on separately funded hardware and migrate workloads in controlled waves.",
    decisions: ["Approved capital funding", "Management-domain topology", "Principal storage", "Physical network", "Migration-wave scope"],
    designPackages: [
      { id: "requirements", phase: "Design", title: "Confirm Greenfield Requirements, Funding, and Constraints", outcome: "Confirm separately funded hardware, capacity, site constraints, workload scope, and acceptance boundaries.", dependsOn: "Approved capital path and customer estate evidence.", acceptance: "Funding owner confirms hardware and non-service dependencies." },
      { id: "target-state", phase: "Design", title: "Design Greenfield VCF Target State and Bill of Materials", outcome: "Issue logical and physical designs, host and cluster sizing, storage and network design, IP/DNS/NTP plan, and bill of materials.", dependsOn: "Confirmed topology, component scope, and adoption depth.", acceptance: "Architecture, infrastructure, network, storage, and procurement owners approve the design." },
      { id: "migration-design", phase: "Design", title: "Design Workload Migration and Cutover Waves", outcome: "Issue application cohorts, dependencies, change windows, rollback, validation, and legacy decommissioning plan.", dependsOn: "Approved target platform and complete workload inventory.", acceptance: "Application and change owners approve wave assignments and acceptance criteria." },
    ],
    implementationPackages: [
      { id: "foundation", phase: "Implementation", title: "Deploy and Validate the Greenfield VCF Foundation", outcome: "Deploy the approved management and workload-domain foundation on customer-funded hardware.", dependsOn: "Hardware, rack, network, storage, DNS, NTP, and IP prerequisites accepted.", acceptance: "The VCF foundation passes platform, lifecycle, network, storage, and operations validation." },
      { id: "migration-waves", phase: "Implementation", title: "Execute Approved Workload Migration and Cutover Waves", outcome: "Move approved workload cohorts to the accepted VCF foundation and validate service restoration.", dependsOn: "Accepted foundation, approved wave plan, backups, rollback, and change windows.", acceptance: "Each wave meets application, platform, and operational acceptance criteria." },
    ],
  },
  hybrid: {
    label: "Hybrid / multiple pathways",
    description: "Assign the appropriate VCF pathway to each estate cohort and coordinate the work through one governed program.",
    decisions: ["Cohort inventory", "Pathway per cohort", "Shared target architecture", "Wave dependencies", "Cross-path acceptance"],
    designPackages: [
      { id: "requirements", phase: "Design", title: "Classify Estate Cohorts and Delivery Constraints", outcome: "Assign each vCenter, cluster, site, or workload cohort to a candidate pathway with evidence and constraints.", dependsOn: "Complete estate inventory and HCL disposition.", acceptance: "Every in-scope cohort has an owner, pathway candidate, and unresolved-action list." },
      { id: "pathway-decision", phase: "Design", title: "Approve the Cohort Pathway Decision Register", outcome: "Record the approved in-place, convergence, import, or greenfield path and rationale for every cohort.", dependsOn: "Cohort classification, capital availability, risk tolerance, and target architecture.", acceptance: "Architecture and customer owners approve all cohort decisions." },
      { id: "integrated-runbook", phase: "Design", title: "Design Integrated Migration, Cutover, and Validation Waves", outcome: "Issue the cross-path sequence, dependencies, rollback controls, change windows, and common acceptance model.", dependsOn: "Approved cohort decision register and target-state design.", acceptance: "Delivery and change owners approve the integrated execution plan." },
    ],
    implementationPackages: [
      { id: "delivery-waves", phase: "Implementation", title: "Execute Approved Multi-Path VCF Adoption Waves", outcome: "Execute each cohort’s approved pathway while maintaining shared governance and acceptance evidence.", dependsOn: "Approved integrated runbook and pathway-specific prerequisites.", acceptance: "Every completed cohort passes its platform, workload, and operational acceptance checks." },
    ],
  },
  "design-only": {
    label: "Architecture and implementation-ready design",
    description: "Complete the design and handoff artifacts without committing implementation execution.",
    decisions: ["Requirements and constraints", "Target pathway", "Topology and components", "Physical prerequisites", "Future execution windows"],
    designPackages: [
      { id: "requirements", phase: "Design", title: "Confirm VCF Requirements and Constraints", outcome: "Issue the requirements and constraints register with customer priorities, boundaries, and unresolved evidence.", dependsOn: "Estate evidence and customer discovery.", acceptance: "Named owners approve requirements and constraints." },
      { id: "decision-register", phase: "Design", title: "Issue the VCF Decision Register", outcome: "Record pathway, topology, storage, networking, component, and adoption-depth decisions with rationale.", dependsOn: "Requirements, evidence, and stakeholder decisions.", acceptance: "Architecture owners approve the decision register." },
      { id: "logical-physical-design", phase: "Design", title: "Issue Logical and Physical VCF Design", outcome: "Deliver domain, cluster, component placement, host, network, storage, IP, DNS, NTP, and sizing designs.", dependsOn: "Approved decision register.", acceptance: "Infrastructure owners accept the logical and physical design." },
      { id: "implementation-handoff", phase: "Handoff", title: "Issue Implementation Runbook and Acceptance Plan", outcome: "Deliver the future execution sequence, rollback approach, change-window plan, validation criteria, runbooks, RACI, and escalation model.", dependsOn: "Accepted logical and physical design.", acceptance: "Delivery leadership confirms the package is implementation ready." },
    ],
    implementationPackages: [],
  },
};

/** Pathways VMware vSphere Foundation supports; workload-domain import and multi-path programs need VCF. */
export const VVF_DELIVERY_PATHS: readonly VcfDeliveryPath[] = ["undecided", "in-place", "converge", "greenfield", "design-only"];

const VVF_CONVERGE_BLOCKERS = "Confirm vCenter 8.0 U3 or later and ESX 8.0 U1 or later, no NSX Manager attached, Enhanced Linked Mode removed, clusters on vLCM images, no vCenter HA, and DRS fully automated.";

/** VVF wording for the pathways it supports. Package ids match the VCF pathway so ownership and sequencing are shared. */
const VVF_PLAYBOOK_PATHS: Partial<Record<VcfDeliveryPath, Omit<VcfPlaybookPlan, "path">>> = {
  undecided: {
    label: "Pathway decision required",
    description: "Complete the VVF decision register before committing implementation work.",
    decisions: ["Existing hardware support", "Existing vSphere and vCenter state", "Capital availability", "Risk and rollback tolerance"],
    designPackages: [
      { id: "requirements", phase: "Design", title: "Confirm VVF Requirements and Constraints", outcome: "Issue the requirements and constraints register for scope, support, change windows, and customer responsibilities.", dependsOn: "Imported estate evidence and customer discovery.", acceptance: "Named owners confirm the requirements, constraints, and unresolved evidence." },
      { id: "pathway-decision", phase: "Design", title: "Select VVF Adoption Path and Record Decisions", outcome: "Issue the decision register with the in-place, converge, or greenfield option selected, rationale, and rejected alternatives.", dependsOn: "Requirements, HCL disposition, estate health, and funding constraints.", acceptance: "Customer and delivery architecture owners approve the pathway decision." },
    ],
    implementationPackages: [],
  },
  "in-place": {
    label: "In-place upgrade to VVF 9",
    description: "Upgrade the supported vSphere 8 or earlier VVF estate in place to VVF 9 in the documented component order, then operate it through VCF Operations.",
    decisions: ["Exact vCenter and ESX builds", "HCL-supported host cohorts", "Subscription licensing in place", "Rollback method", "Change windows"],
    designPackages: [
      { id: "requirements", phase: "Design", title: "Confirm VVF Upgrade Requirements and Constraints", outcome: "Issue the requirements and constraints register, including subscription licensing (perpetual keys cannot be upgraded), support boundaries, rollback limits, freeze periods, and acceptance conditions.", dependsOn: "RVTools estate evidence, exact product builds, HCL disposition, and customer change calendar.", acceptance: "Infrastructure, application, and change owners confirm the baseline and constraints." },
      { id: "target-state", phase: "Design", title: "Design VVF 9 Target State and Record Decisions", outcome: "Issue the decision register and target state for vCenter, clusters, vLCM images, storage, VKS, and VCF Operations.", dependsOn: "Confirmed requirements and supported upgrade pathway.", acceptance: "Architecture owners approve the target state and decision rationale." },
      { id: "platform-design", phase: "Design", title: "Design vCenter, VCF Operations, Storage, and Prerequisites", outcome: "Issue the platform design for vCenter, VCF Operations and cloud proxy, license server, storage, IP, DNS, and NTP, with the prerequisite closure plan.", dependsOn: "Target-state decisions and accepted HCL evidence.", acceptance: "Platform, storage, and operations owners accept the detailed design." },
      { id: "upgrade-runbook", phase: "Design", title: "Design the VVF Upgrade Runbook, Validation, and Change Windows", outcome: "Issue the runbook in the supported order: VCF Operations and cloud proxy, vCenter and management services, Operations for logs, VKS and Supervisor, ESX, VMware Tools and VM hardware, then vSAN on-disk format, with prechecks and rollback.", dependsOn: "Approved platform design, backup posture, and change calendar.", acceptance: "Change authority approves the runbook and upgrade windows." },
    ],
    implementationPackages: [
      { id: "upgrade-waves", phase: "Implementation", title: "Execute Approved VVF Upgrade and Validation Waves", outcome: "Upgrade the approved vCenter and ESX cohorts to VVF 9 in the runbook order and retain post-wave health evidence.", dependsOn: "Approved runbook, closed HCL prerequisites, recoverable backups, and approved change windows.", acceptance: "Each wave passes platform health, management, storage, network, and workload validation." },
      { id: "vvf-operations", phase: "Adoption", title: "Operate the Upgraded Platform Through VCF Operations", outcome: "Establish VCF Operations, vLCM image lifecycle, and the operating model for the upgraded VVF estate.", dependsOn: "Accepted upgrade waves.", acceptance: "Lifecycle, monitoring, backup, ownership, and escalation controls are operational." },
    ],
  },
  converge: {
    label: "Converge existing vCenter into VVF",
    description: "Use the VCF Installer to bring a healthy existing vCenter and its clusters into VVF 9 without rebuilding them.",
    decisions: ["Source vCenter and ESX builds", "Convergence blockers", "Storage support", "Network prerequisites", "Convergence rollback"],
    designPackages: [
      { id: "requirements", phase: "Design", title: "Confirm VVF Convergence Requirements and Blockers", outcome: `Validate source vCenter health, cluster membership, storage, and HCL status. ${VVF_CONVERGE_BLOCKERS}`, dependsOn: "Complete estate and platform evidence.", acceptance: "The source vCenter is accepted for convergence or exceptions are assigned." },
      { id: "target-state", phase: "Design", title: "Design the VVF Target State", outcome: "Issue the VVF design for vCenter, VCF Operations, license server, clusters, vLCM images, storage, and operations.", dependsOn: "Accepted convergence candidate and pathway decision.", acceptance: "Architecture and operations owners approve the VVF design." },
      { id: "converge-runbook", phase: "Design", title: "Design the VVF Convergence Runbook and Validation Plan", outcome: "Issue the convergence sequence with the VCF Installer, rollback controls, and acceptance tests.", dependsOn: "Approved target-state design and closed convergence blockers.", acceptance: "Change authority approves the convergence window and validation plan." },
    ],
    implementationPackages: [
      { id: "converge", phase: "Implementation", title: "Converge Existing vCenter into VVF", outcome: "Convert the approved existing vCenter into an operational VVF 9 environment with VCF Operations and management services.", dependsOn: "Approved convergence runbook and closed HCL and convergence prerequisites.", acceptance: "Platform health, inventory, lifecycle, and operational controls pass validation." },
    ],
  },
  greenfield: {
    label: "Greenfield VVF with staging hardware",
    description: "Build a new VVF 9 foundation with the VCF Installer on separately funded hardware and migrate workloads in controlled waves.",
    decisions: ["Approved capital funding", "Cluster topology", "Principal storage", "Physical network", "Migration-wave scope"],
    designPackages: [
      { id: "requirements", phase: "Design", title: "Confirm Greenfield VVF Requirements, Funding, and Constraints", outcome: "Confirm separately funded hardware, capacity, vSAN capacity entitlement, site constraints, workload scope, and acceptance boundaries.", dependsOn: "Approved capital path and customer estate evidence.", acceptance: "Funding owner confirms hardware and non-service dependencies." },
      { id: "target-state", phase: "Design", title: "Design Greenfield VVF Target State and Bill of Materials", outcome: "Issue logical and physical designs, host and cluster sizing, storage and VDS network design, IP/DNS/NTP plan, and bill of materials.", dependsOn: "Confirmed topology, component scope, and adoption depth.", acceptance: "Architecture, infrastructure, network, storage, and procurement owners approve the design." },
      { id: "migration-design", phase: "Design", title: "Design Workload Migration and Cutover Waves", outcome: "Issue application cohorts, dependencies, change windows, rollback, validation, and legacy decommissioning plan. HCX is not included with VVF, so plan vMotion, cross-vCenter vMotion, or replication-based moves.", dependsOn: "Approved target platform and complete workload inventory.", acceptance: "Application and change owners approve wave assignments and acceptance criteria." },
    ],
    implementationPackages: [
      { id: "foundation", phase: "Implementation", title: "Deploy and Validate the Greenfield VVF Foundation", outcome: "Deploy vCenter, VCF Operations, the license server, and management services with the VCF Installer on customer-funded hardware.", dependsOn: "Hardware, rack, network, storage, DNS, NTP, and IP prerequisites accepted.", acceptance: "The VVF foundation passes platform, lifecycle, storage, and operations validation." },
      { id: "migration-waves", phase: "Implementation", title: "Execute Approved Workload Migration and Cutover Waves", outcome: "Move approved workload cohorts to the accepted VVF foundation and validate service restoration.", dependsOn: "Accepted foundation, approved wave plan, backups, rollback, and change windows.", acceptance: "Each wave meets application, platform, and operational acceptance criteria." },
    ],
  },
  "design-only": {
    label: "VVF architecture and implementation-ready design",
    description: "Complete the VVF design and handoff artifacts without committing implementation execution.",
    decisions: ["Requirements and constraints", "Target pathway", "Topology and components", "Physical prerequisites", "Future execution windows"],
    designPackages: [
      { id: "requirements", phase: "Design", title: "Confirm VVF Requirements and Constraints", outcome: "Issue the requirements and constraints register with customer priorities, boundaries, and unresolved evidence.", dependsOn: "Estate evidence and customer discovery.", acceptance: "Named owners approve requirements and constraints." },
      { id: "decision-register", phase: "Design", title: "Issue the VVF Decision Register", outcome: "Record pathway, topology, storage, networking, component, and adoption-depth decisions with rationale.", dependsOn: "Requirements, evidence, and stakeholder decisions.", acceptance: "Architecture owners approve the decision register." },
      { id: "logical-physical-design", phase: "Design", title: "Issue Logical and Physical VVF Design", outcome: "Deliver vCenter, cluster, component placement, host, network, storage, IP, DNS, NTP, and sizing designs.", dependsOn: "Approved decision register.", acceptance: "Infrastructure owners accept the logical and physical design." },
      { id: "implementation-handoff", phase: "Handoff", title: "Issue Implementation Runbook and Acceptance Plan", outcome: "Deliver the future execution sequence, rollback approach, change-window plan, validation criteria, runbooks, RACI, and escalation model.", dependsOn: "Accepted logical and physical design.", acceptance: "Delivery leadership confirms the package is implementation ready." },
    ],
    implementationPackages: [],
  },
};

type EditionFields = { customerSegment: MinimalFields["customerSegment"]; adoptionDetails: Pick<AdoptionDetails, "platformEdition" | "upgradePath"> };

/** VVF applies only to commercial customers; every other segment plans VCF. */
export function effectivePlatformEdition(fields: EditionFields): PlatformEdition {
  return fields.customerSegment === "commercial" && fields.adoptionDetails.platformEdition === "vvf" ? "vvf" : "vcf";
}

/** The pathway the plan is built on: a VCF-only pathway selected for a VVF plan falls back to a pathway decision. */
export function effectiveDeliveryPath(fields: EditionFields): VcfDeliveryPath {
  const path = canonicalVcfDeliveryPath(fields.adoptionDetails.upgradePath);
  return effectivePlatformEdition(fields) === "vvf" && !VVF_DELIVERY_PATHS.includes(path) ? "undecided" : path;
}

export function getVcfPlaybookPlan(path: UpgradePath, edition: PlatformEdition = "vcf"): VcfPlaybookPlan {
  const canonical = canonicalVcfDeliveryPath(path);
  const vvfPath = edition === "vvf" ? (VVF_DELIVERY_PATHS.includes(canonical) ? canonical : "undecided") : null;
  if (vvfPath) return { path: vvfPath, ...VVF_PLAYBOOK_PATHS[vvfPath]! };
  return { path: canonical, ...PLAYBOOK_PATHS[canonical] };
}

/** Sets the platform edition; a VCF-only pathway becomes a pathway decision when switching to VVF. */
export function withPlatformEdition(details: AdoptionDetails, platformEdition: PlatformEdition): AdoptionDetails {
  const path = canonicalVcfDeliveryPath(details.upgradePath);
  return { ...details, platformEdition, ...(platformEdition === "vvf" && !VVF_DELIVERY_PATHS.includes(path) ? { upgradePath: "undecided" as const } : {}) };
}

/** The playbook plan for an engagement's fields, honoring the platform edition. */
export function playbookPlanForFields(fields: EditionFields): VcfPlaybookPlan {
  return getVcfPlaybookPlan(fields.adoptionDetails.upgradePath, effectivePlatformEdition(fields));
}

const GOVERNANCE_OWNERSHIP: VcfPlaybookOwnership = { category: "Program Management & Governance", workstreamType: "Governance" };
const INFRASTRUCTURE_DESIGN_OWNERSHIP: VcfPlaybookOwnership = { category: "Modernize Infrastructure", workstreamType: "Infrastructure Build" };
const INFRASTRUCTURE_WAVE_OWNERSHIP: VcfPlaybookOwnership = { category: "Modernize Infrastructure", workstreamType: "Migration Waves" };
const OPERATIONS_OWNERSHIP: VcfPlaybookOwnership = { category: "Operations", workstreamType: "Operating Model / Platform" };

/** Canonical ownership for pathway-level design, execution, adoption, and handoff packages. */
export function getVcfPlaybookWorkPackageOwnership(path: UpgradePath, workPackage: VcfPlaybookWorkPackage): VcfPlaybookOwnership {
  const canonicalPath = canonicalVcfDeliveryPath(path);
  const ownershipByPath: Record<VcfDeliveryPath, Record<string, VcfPlaybookOwnership>> = {
    undecided: {
      requirements: GOVERNANCE_OWNERSHIP,
      "pathway-decision": GOVERNANCE_OWNERSHIP,
    },
    "in-place": {
      requirements: GOVERNANCE_OWNERSHIP,
      "target-state": INFRASTRUCTURE_DESIGN_OWNERSHIP,
      "platform-design": INFRASTRUCTURE_DESIGN_OWNERSHIP,
      "upgrade-runbook": INFRASTRUCTURE_WAVE_OWNERSHIP,
      "upgrade-waves": INFRASTRUCTURE_WAVE_OWNERSHIP,
      "vcf-management": OPERATIONS_OWNERSHIP,
      "vvf-operations": OPERATIONS_OWNERSHIP,
    },
    converge: {
      requirements: GOVERNANCE_OWNERSHIP,
      "target-state": INFRASTRUCTURE_DESIGN_OWNERSHIP,
      "converge-runbook": INFRASTRUCTURE_WAVE_OWNERSHIP,
      converge: INFRASTRUCTURE_DESIGN_OWNERSHIP,
    },
    "import-workload-domain": {
      requirements: GOVERNANCE_OWNERSHIP,
      "domain-design": INFRASTRUCTURE_DESIGN_OWNERSHIP,
      "import-runbook": INFRASTRUCTURE_WAVE_OWNERSHIP,
      import: INFRASTRUCTURE_WAVE_OWNERSHIP,
    },
    greenfield: {
      requirements: GOVERNANCE_OWNERSHIP,
      "target-state": INFRASTRUCTURE_DESIGN_OWNERSHIP,
      "migration-design": INFRASTRUCTURE_WAVE_OWNERSHIP,
      foundation: INFRASTRUCTURE_DESIGN_OWNERSHIP,
      "migration-waves": INFRASTRUCTURE_WAVE_OWNERSHIP,
    },
    hybrid: {
      requirements: GOVERNANCE_OWNERSHIP,
      "pathway-decision": GOVERNANCE_OWNERSHIP,
      "integrated-runbook": INFRASTRUCTURE_WAVE_OWNERSHIP,
      "delivery-waves": INFRASTRUCTURE_WAVE_OWNERSHIP,
    },
    "design-only": {
      requirements: GOVERNANCE_OWNERSHIP,
      "decision-register": GOVERNANCE_OWNERSHIP,
      "logical-physical-design": INFRASTRUCTURE_DESIGN_OWNERSHIP,
      "implementation-handoff": INFRASTRUCTURE_WAVE_OWNERSHIP,
    },
  };
  return ownershipByPath[canonicalPath][workPackage.id]
    || (workPackage.phase === "Implementation" ? INFRASTRUCTURE_WAVE_OWNERSHIP : workPackage.phase === "Adoption" ? OPERATIONS_OWNERSHIP : GOVERNANCE_OWNERSHIP);
}

export const domainTopologySchema = z.enum(["undecided", "consolidated", "standard"]);
export type DomainTopology = z.infer<typeof domainTopologySchema>;
export const principalStorageSchema = z.enum(["undecided", "vsan", "nfs-v3", "vmfs-fc", "other-existing"]);
export type PrincipalStorage = z.infer<typeof principalStorageSchema>;
export const adoptionDepthSchema = z.enum(["not-selected", "tier-1", "tier-2", "tier-3"]);
export type AdoptionDepth = z.infer<typeof adoptionDepthSchema>;

/** VMware Cloud Foundation or VMware vSphere Foundation. VVF is offered only to commercial customers. */
export const platformEditionSchema = z.enum(["vcf", "vvf"]);
export type PlatformEdition = z.infer<typeof platformEditionSchema>;

export const industryTemplateSchema = z.enum([
  "general-enterprise",
  "healthcare-life-sciences",
  "financial-services-insurance",
  "manufacturing-retail-distributed",
  "public-sector-education",
  "digital-products-technology",
]);
export type IndustryTemplateId = z.infer<typeof industryTemplateSchema>;

const operationsFocusSchema = z.enum(["lifecycle", "observability", "capacity-cost", "custom-dashboards", "identity-certificates", "event-integration"]);
const automationFocusSchema = z.enum(["vm-self-service", "infrastructure-as-code", "day-2-automation", "governance", "application-provisioning", "data-services"]);
const networkingFocusSchema = z.enum(["physical-fabric", "edge-cluster-routing", "overlay-transport", "vpc", "load-balancing", "network-operations"]);
const securityFocusSchema = z.enum(["segmentation", "identity-rbac", "hardening-compliance", "ids-ips", "malware-prevention", "identity-firewall", "security-intelligence", "waf"]);
/** "cyber-recovery" is the on-premises isolated recovery environment; "cloud-cyber-recovery" is the SaaS clean room. */
const resilienceFocusSchema = z.enum(["recovery-architecture", "recovery-exercises", "cyber-recovery", "cloud-cyber-recovery"]);
const kubernetesFocusSchema = z.enum(["workload-domains", "platform-operations", "developer-experience"]);
const privateAiFocusSchema = z.enum(["gpu-capacity", "ai-guardrails", "pilot-onboarding"]);
const softPrerequisiteSchema = z.enum(["dns-ntp", "ip-pools", "tor-switch-design"]);

const adoptionDetailsV6Schema = z.object({
  upgradePath: upgradePathSchema,
  platformEdition: platformEditionSchema.default("vcf"),
  domainTopology: domainTopologySchema.default("undecided"),
  principalStorage: principalStorageSchema.default("undecided"),
  componentDepths: z.object({
    operations: adoptionDepthSchema.default("not-selected"),
    automation: adoptionDepthSchema.default("not-selected"),
    networkingSecurity: adoptionDepthSchema.default("not-selected"),
    kubernetesAi: adoptionDepthSchema.default("not-selected"),
    efficiency: adoptionDepthSchema.default("not-selected"),
  }).default({
    operations: "not-selected",
    automation: "not-selected",
    networkingSecurity: "not-selected",
    kubernetesAi: "not-selected",
    efficiency: "not-selected",
  }),
  operations: z.array(operationsFocusSchema).max(6),
  automation: z.array(automationFocusSchema).max(6),
  networking: z.array(networkingFocusSchema).max(6).default([]),
  security: z.array(securityFocusSchema).max(8),
  resilience: z.array(resilienceFocusSchema).max(4),
  kubernetes: z.array(kubernetesFocusSchema).max(3),
  privateAi: z.array(privateAiFocusSchema).max(3),
  /** Confirmed site-readiness work that runs alongside the HCL review or Red-path procurement. */
  softPrerequisites: z.array(softPrerequisiteSchema).max(3).default([]),
  notes: z.string().max(5000),
});

export const adoptionDetailsSchema = adoptionDetailsV6Schema.extend({
  industryTemplate: industryTemplateSchema,
});
export type AdoptionDetails = z.infer<typeof adoptionDetailsSchema>;

const minimalFieldsV5Schema = z.object({
  customerName: z.string().max(240),
  accountId: z.string().max(120),
  location: z.string().max(240),
  primaryContact: z.string().max(240),
  entitlementAmount: z.number().min(0).max(1_000_000_000_000),
  entitlementStart: z.string(),
  entitlementEnd: z.string(),
  /** Independently persisted delivery date; legacy targetStart remains a compatibility fallback. */
  plannedProjectStart: z.string().default(""),
  /** Optional date when implementation, upgrade, and migration services are expected to begin. */
  plannedImplementationStart: z.string().default(""),
  targetStart: z.string(),
  targetComplete: z.string(),
  hardwareAvailability: z.enum(["existing", "new", "unknown"]),
  hardwareLeadWeeks: z.number().int().min(0).max(104),
  priorities: z.array(capabilitySchema),
  timelineNotes: z.string().max(5000),
});

const minimalFieldsV6Schema = minimalFieldsV5Schema.extend({
  adoptionCadence: timelineCadenceSchema,
  adoptionDetails: adoptionDetailsV6Schema,
});

export const exportPreferencesSchema = z.object({
  /** Keeps detailed VCF 9.1 inventory and readiness evidence in generated HTML and PDF exports. */
  includeVcfReadiness: z.boolean().default(true),
  /** Keeps the two-year operational adoption horizon in generated HTML and PDF exports. */
  includeOperationalTimeline: z.boolean().default(true),
});
export type ExportPreferences = z.infer<typeof exportPreferencesSchema>;

/** Commercial customers also receive the Broadcom Building Blocks workbook with each FCP. */
export const customerSegmentSchema = z.enum(["unspecified", "commercial", "public-sector"]);
export type CustomerSegment = z.infer<typeof customerSegmentSchema>;

export const minimalFieldsSchema = minimalFieldsV5Schema.extend({
  adoptionCadence: timelineCadenceSchema,
  adoptionDetails: adoptionDetailsSchema,
  exportPreferences: exportPreferencesSchema.default({ includeVcfReadiness: true, includeOperationalTimeline: true }),
  compatibilityTargetRelease: z.enum(HCL_CATALOG_RELEASES).default(HCL_TARGET_RELEASE),
  customerSegment: customerSegmentSchema.default("unspecified"),
});
export type MinimalFields = z.infer<typeof minimalFieldsSchema>;

export const inventorySourceSchema = z.object({
  id: z.string(),
  filename: z.string(),
  byteSize: z.number().int().nonnegative(),
  sheets: z.array(z.string()),
  importedAt: z.string(),
  warnings: z.array(z.string()),
});

export const inventoryVersionSchema = z.object({ version: z.string(), hosts: z.number().int().nonnegative() });
export const inventoryClusterProfileSchema = z.object({ name: z.string(), hosts: z.number().int().nonnegative() });

const inventoryHostModelV4Schema = z.object({
  vendor: z.string(),
  model: z.string(),
  cpuModel: z.string(),
  hosts: z.number().int().nonnegative(),
  physicalCores: z.number().int().nonnegative(),
});

export const inventoryHostModelSchema = inventoryHostModelV4Schema.extend({
  esxiVersions: z.array(inventoryVersionSchema),
  esxiCorrelation: z.enum(["per-platform", "estate-wide", "unavailable"]),
  clusterMembership: z.array(inventoryClusterProfileSchema).default([]),
  minimumMemoryGiB: z.number().nonnegative().default(0),
  maximumMemoryGiB: z.number().nonnegative().default(0),
});

const inventorySummaryBaseSchema = z.object({
  sourceCount: z.number().int().nonnegative(),
  datacenters: z.number().int().nonnegative(),
  clusters: z.number().int().nonnegative(),
  clusterProfiles: z.array(inventoryClusterProfileSchema).default([]),
  hosts: z.number().int().nonnegative(),
  physicalCores: z.number().int().nonnegative(),
  vmCount: z.number().int().nonnegative(),
  poweredOnVms: z.number().int().nonnegative(),
  poweredOffVms: z.number().int().nonnegative(),
  vCpu: z.number().int().nonnegative(),
  vmMemoryGiB: z.number().nonnegative(),
  datastoreCount: z.number().int().nonnegative(),
  datastoreCapacityTiB: z.number().nonnegative(),
  datastoreUsedTiB: z.number().nonnegative(),
  snapshotCount: z.number().int().nonnegative(),
  maintenanceHosts: z.number().int().nonnegative(),
  disconnectedHosts: z.number().int().nonnegative(),
  highCpuHosts: z.number().int().nonnegative(),
  highMemoryHosts: z.number().int().nonnegative(),
  overcommittedDatastores: z.number().int().nonnegative(),
  esxiVersions: z.array(inventoryVersionSchema),
  guestOperatingSystems: z.array(z.object({ name: z.string(), vms: z.number().int().nonnegative() })),
});

const inventorySummaryV4Schema = inventorySummaryBaseSchema.extend({
  hostModels: z.array(inventoryHostModelV4Schema),
});

export const inventorySummarySchema = inventorySummaryBaseSchema.extend({
  hostModels: z.array(inventoryHostModelSchema),
  hclEvidence: hclInventoryEvidenceSchema.default(emptyHclInventoryEvidence()),
});
export type InventorySummary = z.infer<typeof inventorySummarySchema>;

export const readinessItemSchema = z.object({
  id: z.string(),
  category: z.enum(["inventory", "software", "hardware", "capacity", "licensing", "planning"]),
  status: z.enum(["good", "attention", "unknown", "info"]),
  title: z.string(),
  detail: z.string(),
  evidence: z.string(),
});
export type ReadinessItem = z.infer<typeof readinessItemSchema>;

export const hardwarePlatformStatusSchema = z.enum(["candidate", "upgrade-required", "review-required", "unavailable"]);
export type HardwarePlatformStatus = z.infer<typeof hardwarePlatformStatusSchema>;

const hclCandidateSchema = z.object({
  partnerName: z.string(),
  model: z.string(),
  score: z.number().min(0).max(1),
  productId: z.number().int().positive(),
});

const defaultHclPlatformAssessment = {
  targetRelease: "ESXi 9.1" as const,
  snapshotCapturedAt: HCL_SNAPSHOT.capturedAt,
  snapshotSource: HCL_SNAPSHOT.source,
  status: "unknown" as const,
  modelMatchMethod: "none" as const,
  modelMatchConfidence: 0,
  vendorResolved: false,
  matchedPartnerName: "",
  matchedModel: "",
  matchedCpuSeries: "",
  productIds: [],
  detailUrl: "",
  vcfVendorConfirmation: "unknown" as const,
  supportedCpuSeries: [],
  candidateModels: [],
  detail: "HCL evidence has not yet been generated for this saved assessment.",
  nextAction: "Refresh the inventory assessment to evaluate this cohort against the supplied offline HCL snapshot.",
  futureReleaseSupport: {
    status: "not-applicable" as const,
    verifiedThroughRelease: "ESXi 9.1",
    unsupportedFromRelease: "",
    vendorHardwareSupportEnd: "",
    detail: "No model-specific future-release boundary is encoded in the current offline HCL planning snapshot.",
    nextAction: "Revalidate the server and CPU pairing whenever the target ESXi or VCF release changes.",
    source: "",
  },
  catalog: HCL_CATALOG_METADATA,
  evidenceState: "catalog-record-required" as const,
  evidenceConfidence: "low" as const,
  releaseEvidence: [
    { release: "ESXi 9.0" as const, status: "not-listed" as const, productIds: [], detailUrls: [] },
    { release: "ESXi 9.1" as const, status: "not-listed" as const, productIds: [], detailUrls: [] },
  ],
  requiredEvidence: [
    "confirmed OEM manufacturer and exact server model",
    "installed processor model and CPU series",
    "NIC and HBA/controller compatibility",
    "firmware and driver alignment",
    "OEM ESXi image or add-on selection",
    "boot, storage, and vSAN/ReadyNode compatibility where applicable",
    "cluster topology and workload-domain design validation",
  ],
};

export const hclPlatformAssessmentSchema = z.object({
  targetRelease: z.enum(HCL_CATALOG_RELEASES),
  snapshotCapturedAt: z.string(),
  snapshotSource: z.string(),
  status: z.enum(["supported", "supported-cpu-unverified", "review", "cpu-not-certified", "not-supported", "unknown"]),
  modelMatchMethod: z.enum(["exact", "core", "compact", "token", "fuzzy", "none"]),
  modelMatchConfidence: z.number().min(0).max(1),
  vendorResolved: z.boolean(),
  matchedPartnerName: z.string(),
  matchedModel: z.string(),
  matchedCpuSeries: z.string(),
  productIds: z.array(z.number().int().positive()),
  detailUrl: z.string(),
  vcfVendorConfirmation: z.enum(["reported", "not-reported", "unknown"]),
  supportedCpuSeries: z.array(z.string()),
  candidateModels: z.array(hclCandidateSchema),
  detail: z.string(),
  nextAction: z.string(),
  futureReleaseSupport: z.object({
    status: z.enum(["not-applicable", "revalidation-required", "unsupported-from-release"]),
    verifiedThroughRelease: z.string(),
    unsupportedFromRelease: z.string().default(""),
    vendorHardwareSupportEnd: z.string(),
    detail: z.string(),
    nextAction: z.string(),
    source: z.string(),
  }).default(defaultHclPlatformAssessment.futureReleaseSupport),
  catalog: z.object({
    id: z.string(),
    source: z.string(),
    capturedAt: z.string(),
    reportedCount: z.number().int().nonnegative(),
    releaseScope: z.array(z.enum(["ESXi 9.0", "ESXi 9.1"])),
    vendorCount: z.number().int().nonnegative(),
  }).default(defaultHclPlatformAssessment.catalog),
  evidenceState: z.enum([
    "verified-supported",
    "verified-not-listed",
    "explicit-exclusion",
    "cpu-evidence-required",
    "identity-confirmation-required",
    "catalog-record-required",
    "source-refresh-required",
    "conflicting-evidence",
  ]).default(defaultHclPlatformAssessment.evidenceState),
  evidenceConfidence: z.enum(["high", "medium", "low"]).default(defaultHclPlatformAssessment.evidenceConfidence),
  releaseEvidence: z.array(z.object({
    release: z.enum(["ESXi 9.0", "ESXi 9.1"]),
    status: z.enum(["listed", "not-listed", "model-listed-cpu-unverified", "unresolved"]),
    productIds: z.array(z.number().int().positive()),
    detailUrls: z.array(z.string()),
  })).default(defaultHclPlatformAssessment.releaseEvidence),
  requiredEvidence: z.array(z.string()).default(defaultHclPlatformAssessment.requiredEvidence),
});
export type HclPlatformAssessment = z.infer<typeof hclPlatformAssessmentSchema>;

export const platformEsxiCorrelationSchema = z.enum(["per-platform", "estate-wide", "unavailable"]);
export type PlatformEsxiCorrelation = z.infer<typeof platformEsxiCorrelationSchema>;

const hardwarePlatformAssessmentV4Schema = z.object({
  id: z.string(),
  vendor: z.string(),
  model: z.string(),
  cpuModel: z.string(),
  hosts: z.number().int().nonnegative(),
  physicalCores: z.number().int().nonnegative(),
  status: hardwarePlatformStatusSchema,
  detail: z.string(),
  nextAction: z.string(),
});

export const hardwarePlatformAssessmentSchema = hardwarePlatformAssessmentV4Schema.extend({
  esxiVersions: z.array(inventoryVersionSchema),
  esxiCorrelation: platformEsxiCorrelationSchema,
  clusterMembership: z.array(inventoryClusterProfileSchema).default([]),
  minimumMemoryGiB: z.number().nonnegative().default(0),
  maximumMemoryGiB: z.number().nonnegative().default(0),
  hcl: hclPlatformAssessmentSchema.default(defaultHclPlatformAssessment),
});
export type HardwarePlatformAssessment = z.infer<typeof hardwarePlatformAssessmentSchema>;

export type VcfCompatibilityDecision = "eligible" | "validation-required" | "action-required";

export type VcfCompatibilityCohort = {
  id: string;
  decision: VcfCompatibilityDecision;
  decisionLabel: string;
  vendor: string;
  model: string;
  cpuModel: string;
  hosts: number;
  hclStatus: HclPlatformAssessment["status"];
  matchedModel: string;
  matchedCpuSeries: string;
  observedEsxiVersions: InventorySummary["esxiVersions"];
  clusterMembership: InventorySummary["clusterProfiles"];
  catalog: HclPlatformAssessment["catalog"];
  evidenceState: HclPlatformAssessment["evidenceState"];
  evidenceConfidence: HclPlatformAssessment["evidenceConfidence"];
  releaseEvidence: HclPlatformAssessment["releaseEvidence"];
  requiredEvidence: string[];
  reason: string;
  nextAction: string;
  futureReleaseSupport: HclPlatformAssessment["futureReleaseSupport"];
};

function compatibilityDecision(hcl: HclPlatformAssessment): Pick<VcfCompatibilityCohort, "decision" | "decisionLabel" | "reason"> {
  if (hcl.evidenceState === "verified-supported" && hcl.status === "supported") {
    return {
      decision: "eligible",
      decisionLabel: "Target release listed",
      reason: `The observed server and CPU pairing is listed for ${hcl.targetRelease} in maintained catalog ${hcl.catalog.id}.`,
    };
  }
  if (hcl.evidenceState === "verified-not-listed" || hcl.evidenceState === "explicit-exclusion" || hcl.status === "cpu-not-certified" || hcl.status === "not-supported") {
    return {
      decision: "action-required",
      decisionLabel: "Not listed for target release",
      reason: `The observed platform identity was established, but the server and CPU pairing is not listed for ${hcl.targetRelease} in catalog ${hcl.catalog.id}.`,
    };
  }
  if (hcl.evidenceState === "cpu-evidence-required" || hcl.status === "supported-cpu-unverified") {
    return {
      decision: "validation-required",
      decisionLabel: "CPU evidence required",
      reason: "The server model matched, but the imported CPU evidence is not sufficient to confirm the recorded snapshot pairing.",
    };
  }
  if (hcl.evidenceState === "identity-confirmation-required" || hcl.status === "review") {
    return {
      decision: "validation-required",
      decisionLabel: "Identity confirmation required",
      reason: "The imported vendor or model identity has a candidate match but is not specific enough to confirm compatibility before platform build.",
    };
  }
  return {
    decision: "validation-required",
    decisionLabel: "Catalog evidence required",
    reason: `No deterministic server-and-CPU pairing was established in maintained catalog ${hcl.catalog.id}.`,
  };
}

/**
 * Produces one concise planning cohort for each observed server/CPU pairing.
 * This supports delivery planning only and must not be interpreted as an
 * official VMware or Broadcom compatibility certification.
 */
export function summarizeVcfCompatibility(platforms: HardwarePlatformAssessment[]): VcfCompatibilityCohort[] {
  const cohorts = new Map<string, VcfCompatibilityCohort>();
  for (const platform of platforms) {
    const decision = compatibilityDecision(platform.hcl);
    const vendor = platform.vendor.trim() || "Unknown vendor";
    const model = platform.model.trim() || "Unknown model";
    const cpuModel = platform.cpuModel.trim() || "CPU model not reported";
    const futureReleaseSupport = platform.hcl.futureReleaseSupport;
    const lifecycleDetail = futureReleaseSupport.status === "unsupported-from-release" ? ` ${futureReleaseSupport.detail}` : "";
    const lifecycleAction = futureReleaseSupport.status === "unsupported-from-release" ? ` ${futureReleaseSupport.nextAction}` : "";
    const key = [decision.decision, vendor, model, cpuModel, platform.hcl.status, platform.hcl.evidenceState, platform.hcl.matchedModel, platform.hcl.matchedCpuSeries, futureReleaseSupport.status, futureReleaseSupport.vendorHardwareSupportEnd].join("|").toLowerCase();
    const existing = cohorts.get(key);
    if (existing) {
      existing.hosts += platform.hosts;
      continue;
    }
    cohorts.set(key, {
      id: key,
      decision: decision.decision,
      decisionLabel: decision.decisionLabel,
      vendor,
      model,
      cpuModel,
      hosts: platform.hosts,
      hclStatus: platform.hcl.status,
      matchedModel: platform.hcl.matchedModel,
      matchedCpuSeries: platform.hcl.matchedCpuSeries,
      observedEsxiVersions: platform.esxiVersions,
      clusterMembership: platform.clusterMembership,
      catalog: platform.hcl.catalog,
      evidenceState: platform.hcl.evidenceState,
      evidenceConfidence: platform.hcl.evidenceConfidence,
      releaseEvidence: platform.hcl.releaseEvidence,
      requiredEvidence: platform.hcl.requiredEvidence,
      reason: `${decision.reason}${lifecycleDetail}`,
      nextAction: `${platform.hcl.nextAction}${lifecycleAction}`,
      futureReleaseSupport,
    });
  }
  const order: Record<VcfCompatibilityDecision, number> = { "action-required": 0, "validation-required": 1, eligible: 2 };
  return Array.from(cohorts.values()).sort((left, right) => order[left.decision] - order[right.decision] || right.hosts - left.hosts || left.model.localeCompare(right.model));
}

export type CompatibilityDeliveryAction = {
  id: string;
  priority: "blocker" | "required" | "validation";
  owner: string;
  title: string;
  affectedHosts: number;
  gateCondition: string;
  evidenceRequired: string[];
  cohortIds: string[];
};

export type CompatibilityHandoffSummary = {
  targetRelease: string;
  catalog: HclPlatformAssessment["catalog"];
  estateHosts: number;
  assessedHosts: number;
  unaccountedHosts: number;
  allHostsAccountedFor: boolean;
  supportedHosts: number;
  blockedHosts: number;
  unresolvedHosts: number;
  cohorts: VcfCompatibilityCohort[];
  actions: CompatibilityDeliveryAction[];
};

function actionOwner(state: HclPlatformAssessment["evidenceState"]): string {
  if (state === "verified-not-listed" || state === "explicit-exclusion") return "Solution architecture and customer platform owner";
  if (state === "cpu-evidence-required" || state === "identity-confirmation-required" || state === "catalog-record-required") return "Customer infrastructure owner with delivery engineering";
  return "Delivery engineering";
}

export function summarizeCompatibilityHandoff(platforms: HardwarePlatformAssessment[], estateHosts: number): CompatibilityHandoffSummary {
  const cohorts = summarizeVcfCompatibility(platforms);
  const assessedHosts = cohorts.reduce((total, cohort) => total + cohort.hosts, 0);
  const supportedHosts = cohorts.filter(cohort => cohort.decision === "eligible").reduce((total, cohort) => total + cohort.hosts, 0);
  const blockedHosts = cohorts.filter(cohort => cohort.decision === "action-required").reduce((total, cohort) => total + cohort.hosts, 0);
  const unresolvedHosts = cohorts.filter(cohort => cohort.decision === "validation-required").reduce((total, cohort) => total + cohort.hosts, 0);
  const actionsByKey = new Map<string, CompatibilityDeliveryAction>();
  for (const cohort of cohorts) {
    const key = `${cohort.decision}|${cohort.evidenceState}|${cohort.nextAction}`;
    const priority = cohort.decision === "action-required" ? "blocker" as const : cohort.decision === "validation-required" ? "required" as const : "validation" as const;
    const existing = actionsByKey.get(key);
    if (existing) {
      existing.affectedHosts += cohort.hosts;
      existing.cohortIds.push(cohort.id);
      existing.evidenceRequired = Array.from(new Set([...existing.evidenceRequired, ...cohort.requiredEvidence]));
      continue;
    }
    actionsByKey.set(key, {
      id: key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      priority,
      owner: actionOwner(cohort.evidenceState),
      title: cohort.nextAction,
      affectedHosts: cohort.hosts,
      gateCondition: cohort.decision === "eligible"
        ? `Complete configuration-level evidence before the ${cohort.catalog.releaseScope.at(-1) || cohort.catalog.id} platform build.`
        : `Resolve this evidence before the ${cohort.catalog.releaseScope.at(-1) || cohort.catalog.id} platform build.`,
      evidenceRequired: cohort.requiredEvidence,
      cohortIds: [cohort.id],
    });
  }
  const actionOrder = { blocker: 0, required: 1, validation: 2 } as const;
  const actions = Array.from(actionsByKey.values()).sort((left, right) => actionOrder[left.priority] - actionOrder[right.priority] || right.affectedHosts - left.affectedHosts);
  const catalog = cohorts[0]?.catalog || HCL_CATALOG_METADATA;
  const unaccountedHosts = Math.max(0, estateHosts - assessedHosts);
  return {
    targetRelease: cohorts[0]?.releaseEvidence.at(-1)?.release || catalog.releaseScope.at(-1) || "ESXi release not available",
    catalog,
    estateHosts,
    assessedHosts,
    unaccountedHosts,
    allHostsAccountedFor: assessedHosts === estateHosts,
    supportedHosts,
    blockedHosts,
    unresolvedHosts,
    cohorts,
    actions,
  };
}

const readinessV4Schema = z.object({
  generatedAt: z.string(),
  label: z.literal("Inventory-Informed VCF 9.1 Planning Considerations"),
  items: z.array(readinessItemSchema),
  hardwarePlatforms: z.array(hardwarePlatformAssessmentV4Schema),
  disclaimer: z.string(),
});

export const readinessSchema = readinessV4Schema.extend({
  hardwarePlatforms: z.array(hardwarePlatformAssessmentSchema),
  hcl: hclAssessmentSchema.default({ findings: [], coverageGaps: [] }),
  hclSchedulePath: z.enum(["green", "yellow", "red", "unresolved"]).default("unresolved"),
});
export type ReadinessAssessment = z.infer<typeof readinessSchema>;

const readinessV3Schema = z.object({
  generatedAt: z.string(),
  label: z.literal("Inventory-Informed VCF 9.1 Planning Considerations"),
  items: z.array(readinessItemSchema),
  disclaimer: z.string(),
});

export const engagementDocumentV3Schema = z.object({
  version: z.literal(3),
  fields: minimalFieldsV5Schema,
  inventorySources: z.array(inventorySourceSchema),
  inventory: inventorySummaryV4Schema,
  readiness: readinessV3Schema,
  adoptionTimeline: timelineV5Schema,
  twoYearPlan: timelineV5Schema,
  rationale: z.string(),
});

export const engagementDocumentV4Schema = z.object({
  version: z.literal(4),
  fields: minimalFieldsV5Schema,
  inventorySources: z.array(inventorySourceSchema),
  inventory: inventorySummaryV4Schema,
  readiness: readinessV4Schema,
  adoptionTimeline: timelineV5Schema,
  twoYearPlan: timelineV5Schema,
  rationale: z.string(),
});

export const engagementDocumentV5Schema = z.object({
  version: z.literal(5),
  fields: minimalFieldsV5Schema,
  inventorySources: z.array(inventorySourceSchema),
  inventory: inventorySummarySchema,
  readiness: readinessSchema,
  adoptionTimeline: timelineV5Schema,
  twoYearPlan: timelineV5Schema,
  rationale: z.string(),
});

export const engagementDocumentV6Schema = z.object({
  version: z.literal(6),
  fields: minimalFieldsV6Schema,
  inventorySources: z.array(inventorySourceSchema),
  inventory: inventorySummarySchema,
  readiness: readinessSchema,
  adoptionTimeline: timelineSchema,
  twoYearPlan: timelineSchema,
  rationale: z.string(),
});

export const engagementDocumentV7Schema = z.object({
  version: z.literal(7),
  fields: minimalFieldsSchema,
  inventorySources: z.array(inventorySourceSchema),
  inventory: inventorySummarySchema,
  readiness: readinessSchema,
  adoptionTimeline: timelineSchema,
  twoYearPlan: timelineSchema,
  rationale: z.string(),
});

export const engagementDocumentV8Schema = z.object({
  version: z.literal(8),
  fields: minimalFieldsSchema,
  inventorySources: z.array(inventorySourceSchema),
  inventory: inventorySummarySchema,
  readiness: readinessSchema,
  adoptionTimeline: timelineSchema,
  twoYearPlan: timelineSchema,
  rationale: z.string(),
});

export const engagementDocumentV9Schema = z.object({
  version: z.literal(9),
  fields: minimalFieldsSchema,
  inventorySources: z.array(inventorySourceSchema),
  inventory: inventorySummarySchema,
  readiness: readinessSchema,
  adoptionTimeline: timelineSchema,
  twoYearPlan: timelineSchema,
  rationale: z.string(),
});

export const engagementDocumentV10Schema = z.object({
  version: z.literal(10),
  fields: minimalFieldsSchema,
  inventorySources: z.array(inventorySourceSchema),
  inventory: inventorySummarySchema,
  readiness: readinessSchema,
  adoptionTimeline: timelineSchema,
  twoYearPlan: timelineSchema,
  rationale: z.string(),
});

/** V11 fixes the primary Gantt taxonomy to five HCL-driven category rows. */
export const planAuthoritySchema = z.enum(["generated", "manual"]).default("generated");
export type PlanAuthority = z.infer<typeof planAuthoritySchema>;

export const engagementDocumentV11Schema = z.object({
  version: z.literal(11),
  planAuthority: planAuthoritySchema,
  fields: minimalFieldsSchema,
  inventorySources: z.array(inventorySourceSchema),
  inventory: inventorySummarySchema,
  readiness: readinessSchema,
  adoptionTimeline: timelineSchema,
  twoYearPlan: timelineSchema,
  rationale: z.string(),
});
export type EngagementDocument = z.infer<typeof engagementDocumentV11Schema>;

export function emptyInventory(): InventorySummary {
  return {
    sourceCount: 0,
    datacenters: 0,
    clusters: 0,
    clusterProfiles: [],
    hosts: 0,
    physicalCores: 0,
    vmCount: 0,
    poweredOnVms: 0,
    poweredOffVms: 0,
    vCpu: 0,
    vmMemoryGiB: 0,
    datastoreCount: 0,
    datastoreCapacityTiB: 0,
    datastoreUsedTiB: 0,
    snapshotCount: 0,
    maintenanceHosts: 0,
    disconnectedHosts: 0,
    highCpuHosts: 0,
    highMemoryHosts: 0,
    overcommittedDatastores: 0,
    hostModels: [],
    esxiVersions: [],
    guestOperatingSystems: [],
    hclEvidence: emptyHclInventoryEvidence(),
  };
}

export function createDefaultAdoptionDetails(): AdoptionDetails {
  return {
    upgradePath: "undecided",
    platformEdition: "vcf",
    domainTopology: "undecided",
    principalStorage: "undecided",
    componentDepths: {
      operations: "not-selected",
      automation: "not-selected",
      networkingSecurity: "not-selected",
      kubernetesAi: "not-selected",
      efficiency: "not-selected",
    },
    operations: [],
    automation: [],
    networking: [],
    security: [],
    resilience: [],
    kubernetes: [],
    privateAi: [],
    softPrerequisites: [],
    notes: "",
    industryTemplate: "general-enterprise",
  };
}

export function createDefaultFields(): MinimalFields {
  return {
    customerName: "",
    accountId: "",
    location: "",
    primaryContact: "",
    entitlementAmount: 0,
    entitlementStart: "",
    entitlementEnd: "",
    plannedProjectStart: "",
    plannedImplementationStart: "",
    targetStart: "",
    targetComplete: "",
    hardwareAvailability: "unknown",
    hardwareLeadWeeks: 0,
    priorities: ["operations", "automation"],
    timelineNotes: "",
    adoptionCadence: "month",
    adoptionDetails: createDefaultAdoptionDetails(),
    exportPreferences: { includeVcfReadiness: true, includeOperationalTimeline: true },
    compatibilityTargetRelease: HCL_TARGET_RELEASE,
    customerSegment: "unspecified",
  };
}

function bar(id: string, startCol: number, endCol: number, color: TimelineColor, label: string, milestone = false, deferred = false, dependsOn?: string, outcome?: string): TimelineBar {
  return { id, startCol, endCol, color, label, milestone, deferred, ...(dependsOn ? { dependsOn } : {}), ...(outcome ? { outcome } : {}) };
}

function parseMonth(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (!Number.isInteger(year) || month < 0 || month > 11) return null;
  return new Date(Date.UTC(year, month, 1));
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month && parsed.getUTCDate() === day ? parsed : null;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function addUtcCalendarMonths(date: Date, months: number): Date {
  const totalMonths = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

/** The entitlement end date: twelve calendar months after the confirmed entitlement start. */
export function calculateEntitlementEndDate(startValue: string): string {
  const start = parseIsoDate(startValue);
  return start ? isoDate(addUtcCalendarMonths(start, 12)) : "";
}

function monthDifference(start: Date, end: Date): number {
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
}

function displayMonth(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date);
}

export function buildMonthColumns(startValue: string, endValue: string, fallbackCount = 12, maximum = 36): string[] {
  const start = parseMonth(startValue) || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const end = parseMonth(endValue);
  const requested = end && end >= start ? monthDifference(start, end) + 1 : fallbackCount;
  const count = Math.max(2, Math.min(maximum, requested));
  return Array.from({ length: count }, (_, index) => displayMonth(addUtcMonths(start, index)));
}

export function buildWeekColumns(startValue: string, endValue: string, fallbackCount = 12, maximum = 104): string[] {
  const start = parseIsoDate(startValue) || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const parsedEnd = parseIsoDate(endValue);
  const end = parsedEnd && parsedEnd >= start ? parsedEnd : null;
  const requested = end ? Math.ceil((end.getTime() - start.getTime() + 86_400_000) / 604_800_000) : fallbackCount;
  const count = Math.max(2, Math.min(maximum, requested));
  return Array.from({ length: count }, (_, index) => {
    const weekStart = addUtcDays(start, index * 7);
    const candidateWeekEnd = addUtcDays(weekStart, 6);
    const weekEnd = end && candidateWeekEnd > end ? end : candidateWeekEnd;
    const startLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(weekStart);
    const endLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" }).format(weekEnd);
    return `${startLabel}–${endLabel}`;
  });
}

export function buildTwoYearNotionalColumns(serviceStartValue: string, _legacyEndValue = ""): string[] {
  const start = parseIsoDate(serviceStartValue) || parseMonth(serviceStartValue) || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const startMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const count = 24;

  return Array.from({ length: count }, (_, index) => {
    const month = addUtcMonths(startMonth, index);
    const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(month);
    const year = month.getUTCFullYear();
    const lastDay = new Date(Date.UTC(year, month.getUTCMonth() + 1, 0)).getUTCDate();
    const isOpeningMonth = month.getUTCFullYear() === start.getUTCFullYear() && month.getUTCMonth() === start.getUTCMonth();
    const openingDay = isOpeningMonth ? start.getUTCDate() : 1;
    const closingDay = lastDay;

    if (openingDay === 1 && closingDay === lastDay) return `${monthLabel} ${year}`;
    if (openingDay === closingDay) return `${monthLabel} ${openingDay}, ${year}`;
    return `${monthLabel} ${openingDay}–${closingDay}, ${year}`;
  });
}

function timelineStartDate(fields: MinimalFields): string {
  const candidate = fields.plannedProjectStart || fields.targetStart || fields.entitlementStart;
  return parseIsoDate(candidate) ? candidate : isoDate(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)));
}

function timelineEndDate(fields: MinimalFields): string {
  const candidate = fields.targetComplete || fields.entitlementEnd;
  return parseIsoDate(candidate) ? candidate : "";
}

export function applyScheduleFieldPatch(fields: MinimalFields, patch: Partial<MinimalFields>): MinimalFields {
  const nextEntitlementStart = patch.entitlementStart ?? fields.entitlementStart;
  const calculatedEntitlementEnd = calculateEntitlementEndDate(nextEntitlementStart);
  const nextEntitlementEnd = calculatedEntitlementEnd || patch.entitlementEnd || fields.entitlementEnd;
  const nextProjectStart = (patch.plannedProjectStart ?? fields.plannedProjectStart) || fields.targetStart || fields.entitlementStart;
  const requestedImplementationStart = (patch.plannedImplementationStart ?? fields.plannedImplementationStart) || nextProjectStart;
  const nextImplementationStart = parseIsoDate(requestedImplementationStart) && parseIsoDate(nextProjectStart) && requestedImplementationStart < nextProjectStart
    ? nextProjectStart
    : requestedImplementationStart;
  return {
    ...fields,
    ...patch,
    // Entitlement changes affect only the calculated entitlement end. Planned delivery dates remain independent.
    entitlementEnd: nextEntitlementEnd,
    ...(nextProjectStart ? { plannedProjectStart: nextProjectStart } : {}),
    ...(nextImplementationStart ? { plannedImplementationStart: nextImplementationStart } : {}),
  };
}

function entitlementNotionalEndDate(fields: MinimalFields): string {
  return calculateEntitlementEndDate(fields.entitlementStart) || fields.entitlementEnd;
}

/** The entitlement end the adoption timeline stops at, or "" when no entitlement end is known. */
function entitlementLimitDate(fields: MinimalFields): string {
  const end = entitlementNotionalEndDate(fields);
  return parseIsoDate(end) && end >= timelineStartDate(fields) ? end : "";
}

const CONTINUES_AFTER_ENTITLEMENT = "Continues after the entitlement ends; the remainder is carried in Year 2 of the Two-Year Notional.";
const SCHEDULED_AFTER_ENTITLEMENT = "Scheduled after the entitlement ends; carried in Year 2 of the Two-Year Notional and needs a renewed or additional entitlement.";

/**
 * The Entitlement Adoption Timeline covers only the entitlement window. Activities that start after entitlement
 * end are left to the Two-Year Notional; activities that run past it are cut at entitlement end.
 */
function limitToEntitlement(fields: MinimalFields, schedule: Timeline): Timeline {
  if (!entitlementLimitDate(fields)) return schedule;
  const columns = primaryColumns(fields);
  const count = columns.length;
  if (schedule.columns.length <= count) return schedule;
  return {
    ...schedule,
    columns,
    lanes: schedule.lanes.map(lane => ({
      ...lane,
      bars: lane.bars.flatMap(activity => {
        if (activity.startCol > count) return [];
        if (activity.endCol <= count + 1) return [activity];
        return [{ ...activity, endCol: count + 1, outcome: [activity.outcome, CONTINUES_AFTER_ENTITLEMENT].filter(Boolean).join(" ") }];
      }),
    })),
  };
}

function primaryColumns(fields: MinimalFields): string[] {
  const start = timelineStartDate(fields);
  const entitlementEnd = entitlementNotionalEndDate(fields);
  const end = parseIsoDate(entitlementEnd) && entitlementEnd >= start
    ? entitlementEnd
    : timelineEndDate(fields);
  // The Entitlement Adoption Timeline is the executable drawdown schedule. The separate Two-Year Notional extends beyond it.
  return fields.adoptionCadence === "week"
    ? buildWeekColumns(start, end, 52, 104)
    : buildMonthColumns(start, end, 12, 36);
}

function boundedRange(start: number, duration: number, columnCount: number): [number, number] {
  const safeStart = Math.max(1, Math.min(columnCount, start));
  return [safeStart, Math.max(safeStart + 1, Math.min(columnCount + 1, safeStart + Math.max(1, duration)))];
}

function capabilityTitle(capability: Capability): string {
  const labels: Record<Capability, string> = {
    operations: "Operations",
    automation: "Automation and Self-Service",
    networking: "VCF Networking and NSX",
    security: "Security",
    resilience: "Resilience",
    kubernetes: "Kubernetes",
    "private-ai": "Private AI",
  };
  return labels[capability];
}

function titleCase(value: string): string {
  const minorWords = new Set(["and", "or", "of", "the", "to", "in", "for", "with"]);
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((word, index) => {
      if (index > 0 && minorWords.has(word)) return word;
      if (/^(vcf|nsx|dr|hcx|tanzu|kubernetes|ai)$/.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function normalizeActivityLabel(value: string): string {
  const cleaned = value.trim().replace(/\b(workshop|readiness|assessment|validation)\b/gi, "plan");
  const titled = titleCase(cleaned || "Custom Plan");
  return /\b(plan|design|upgrade)\b/i.test(titled) ? titled : `${titled} Plan`;
}

export function normalizeWorkstreamLabel(value: string): string {
  const cleaned = value.trim().replace(/\b(workshop|readiness|assessment|validation)\b/gi, "plan");
  return titleCase(cleaned || "Custom Workstream");
}

type TimelineLaneMetadata = Pick<TimelineLane, "category" | "workstreamType">;

const DEFAULT_TIMELINE_LANE_METADATA: TimelineLaneMetadata = {
  category: "Program Management & Governance",
  workstreamType: "Governance",
};

function capabilityLaneMetadata(capability: Capability): TimelineLaneMetadata {
  const metadata: Record<Capability, TimelineLaneMetadata> = {
    operations: { category: "Operations", workstreamType: "Operating Model / Platform" },
    automation: { category: "Modernize Cloud", workstreamType: "Consume / Handover" },
    networking: { category: "Modernize Infrastructure", workstreamType: "Infrastructure Build" },
    security: { category: "Modernize Security & Resilience", workstreamType: "Security & Resiliency" },
    resilience: { category: "Modernize Security & Resilience", workstreamType: "Security & Resiliency" },
    kubernetes: { category: "Modernize Cloud", workstreamType: "Consume / Handover" },
    "private-ai": { category: "Modernize Cloud", workstreamType: "Consume / Handover" },
  };
  return metadata[capability];
}

function inferredLaneMetadata(laneId: string): TimelineLaneMetadata | null {
  const id = laneId.replace(/^lane-two-year-year-one-/, "");
  if (id === "lane-platform-plan") return DEFAULT_TIMELINE_LANE_METADATA;
  if (id === "lane-hardware-refresh") return { category: "Modernize Infrastructure", workstreamType: "Infrastructure Build" };
  if (id === "lane-management-domain" || id === "lane-workload-domain") return { category: "Modernize Infrastructure", workstreamType: "Infrastructure Build" };
  if (id === "lane-upgrade-services") return { category: "Modernize Infrastructure", workstreamType: "Migration Waves" };
  if (id === "lane-vcf-networking-nsx") return { category: "Modernize Infrastructure", workstreamType: "Infrastructure Build" };
  if (id === "lane-platform-design") return { category: "Operations", workstreamType: "Operating Model / Platform" };
  const capabilityMatch = id.match(/^lane-(?:follow-on-)?(operations|automation|networking|security|resilience|kubernetes|private-ai)(?:-\d+)?$/);
  return capabilityMatch ? capabilityLaneMetadata(capabilityMatch[1] as Capability) : null;
}

export function applyWorkstreamPresentation(timeline: Timeline): Timeline {
  return {
    ...timeline,
    lanes: timeline.lanes.map(lane => ({
      ...lane,
      // Categories remain the fixed Gantt rows; lanes retain their own editable workstream identity.
      name: lane.workstreamType,
      bars: lane.bars.map(activity => ({
        ...activity,
        color: colorForWorkstreamType(lane.workstreamType),
        deferred: false,
      })),
    })),
  };
}

/**
 * Converts the authoritative delivery timeline into resource-role and calendar-window guidance.
 * It deliberately does not estimate commercial effort, rates, utilization, or named staffing.
 */
export function summarizeDeliveryStaffing(timeline: Timeline): DeliveryStaffingPlan {
  const populatedLanes = timeline.lanes.filter(lane => lane.bars.length);
  const assignments = WORKSTREAM_TYPES.flatMap(workstreamType => {
    const lanes = populatedLanes.filter(lane => lane.workstreamType === workstreamType);
    const bars = lanes.flatMap(lane => lane.bars);
    if (!bars.length) return [];
    const startCol = Math.min(...bars.map(activity => activity.startCol));
    const endCol = Math.max(...bars.map(activity => activity.endCol));
    return [{
      role: DELIVERY_ROLE_BY_WORKSTREAM[workstreamType],
      workstreamType,
      categories: Array.from(new Set(lanes.map(lane => lane.category))),
      workPackages: bars.map(activity => activity.label),
      startCol,
      endCol,
      startLabel: timeline.columns[startCol - 1] || `Window ${startCol}`,
      endLabel: timeline.columns[Math.max(startCol - 1, endCol - 2)] || `Window ${endCol - 1}`,
    }];
  });
  const peakConcurrentPackages = Math.max(0, ...timeline.columns.map((_, index) => populatedLanes.flatMap(lane => lane.bars).filter(activity => activity.startCol <= index + 1 && activity.endCol > index + 1).length));
  return {
    assignments,
    workPackageCount: populatedLanes.flatMap(lane => lane.bars).length,
    peakConcurrentPackages,
  };
}

export function normalizeTimelineTaxonomy(timeline: Timeline): Timeline {
  const normalized = {
    ...timeline,
    lanes: timeline.lanes.map(lane => {
      const inferred = inferredLaneMetadata(lane.id);
      const category = canonicalTimelineCategory(lane.category) || inferred?.category || DEFAULT_TIMELINE_LANE_METADATA.category;
      const workstreamType = canonicalWorkstreamType(lane.workstreamType) || inferred?.workstreamType || DEFAULT_TIMELINE_LANE_METADATA.workstreamType;
      return { ...lane, category, workstreamType };
    }),
  };
  return applyWorkstreamPresentation(normalized);
}

function upgradeServiceLabel(path: UpgradePath): string {
  const labels: Record<UpgradePath, string> = {
    undecided: "Execute Approved VCF Pathway and Controlled Delivery Waves",
    "in-place": "Execute Approved In-Place Upgrade and Validation Waves",
    converge: "Converge Existing vCenter into the VCF Management Domain",
    "import-workload-domain": "Import Existing vCenter as a VCF Workload Domain",
    greenfield: "Deploy Approved Greenfield VCF Foundation and Migrate Workloads",
    hybrid: "Execute Approved Multi-Path VCF Adoption Waves",
    "new-build": "Deploy Approved VCF Foundation and Converge Workloads",
    "migration-waves": "Execute Approved Workload Migration and Cutover Waves",
    "design-only": "Issue VCF Target-State Design and Implementation Runbook",
  };
  return labels[path];
}

function upgradePathNarrative(path: UpgradePath): string {
  const narratives: Record<UpgradePath, string> = {
    undecided: "The pathway remains open until the requirements and constraints register, decision register, rollback approach, and change windows are confirmed.",
    "in-place": "The in-place path is designed around requirements and constraints, target-state and decision design, management-domain and platform design, an approved upgrade runbook, controlled upgrade waves, and post-wave validation before operational handover.",
    converge: "The convergence path establishes the requirements and constraints register, target management-domain design, fresh NSX and network prerequisites where applicable, convergence runbook, platform validation, and operational handover.",
    "import-workload-domain": "The workload-domain import path defines domain boundaries, validates that the complete vCenter and its clusters move together, prepares dependency and rollback controls, executes the import, and validates the accepted workload domain.",
    greenfield: "The greenfield path is conditional on separately funded hardware and sequences physical design, bill of materials and prerequisite acceptance, VCF foundation deployment, migration and cutover waves, and operational handover.",
    hybrid: "The hybrid path records a cohort-level decision for each estate segment, then coordinates in-place upgrades, convergence, workload-domain imports, or greenfield migration waves through one decision register and acceptance model.",
    "new-build": "The new-build path sequences target-state and physical design, supported hardware and foundation acceptance, VCF platform deployment, workload convergence, migration validation, and operational handover.",
    "migration-waves": "The migration path sequences workload-domain and migration design, dependency and rollback planning, controlled cutover waves, post-migration validation, and operational handover.",
    "design-only": "The design-only path issues the requirements and constraints register, decision register, logical and physical design, migration and cutover plan, validation criteria, and implementation-ready handover package without executing migration.",
  };
  return narratives[path];
}

function upgradePathMigrationDuration(path: UpgradePath, cadence: TimelineCadence, baseDuration: number): number {
  const canonicalPath = canonicalVcfDeliveryPath(path);
  if (canonicalPath === "design-only" || canonicalPath === "undecided" || canonicalPath === "converge" || canonicalPath === "import-workload-domain") return 0;
  // Greenfield and multi-path waves run about a quarter; in-place upgrade waves are shorter.
  const duration: Record<"in-place" | "greenfield" | "hybrid", number> = {
    "in-place": cadence === "week" ? 3 : 1,
    greenfield: cadence === "week" ? 12 : 3,
    hybrid: cadence === "week" ? 12 : 3,
  };
  return Math.max(1, Math.min(baseDuration * 3, duration[canonicalPath]));
}

function compactPlanningText(value: string, maximum = 420): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > maximum ? `${normalized.slice(0, maximum - 1).trimEnd()}…` : normalized;
}

function planningInputContext(fields: MinimalFields) {
  const template = getIndustryDiscoveryTemplate(fields.adoptionDetails.industryTemplate);
  const generatedPromptBlock = industryDiscoveryPromptBlock(template.id);
  const customerNotes = compactPlanningText(fields.adoptionDetails.notes.replace(generatedPromptBlock, ""));
  const timelineNotes = compactPlanningText(fields.timelineNotes);
  const industryThemes = template.questions.slice(0, 2).map(question => question.theme.toLowerCase()).join(" and ");
  return { template, customerNotes, timelineNotes, industryThemes };
}

function confirmedDeliveryContext(fields: MinimalFields): string {
  const { customerNotes, timelineNotes } = planningInputContext(fields);
  return [
    customerNotes ? `Apply the customer-confirmed objectives or constraints: ${customerNotes}.` : "",
    timelineNotes ? `Sequence work around the confirmed timeline conditions: ${timelineNotes}.` : "",
  ].filter(Boolean).join(" ");
}

const focusLabels: Record<Capability, Record<string, string>> = {
  operations: {
    lifecycle: "Configure VCF Lifecycle, Certificates, and Change Controls",
    observability: "Deploy VCF Operations Health, Logs, and Diagnostics",
    "capacity-cost": "Baseline Capacity and Cost Visibility",
    "custom-dashboards": "Publish Operational Dashboards and Service Measures",
    "identity-certificates": "Implement Identity, Credential, and Certificate Operations",
    "event-integration": "Integrate Events with Incident and Escalation Workflows",
  },
  automation: {
    "vm-self-service": "Launch a Governed VM Self-Service Catalog",
    "infrastructure-as-code": "Build Infrastructure-as-Code Blueprints and Release Controls",
    "day-2-automation": "Implement Day-2 Remediation and Maintenance Automation",
    governance: "Configure Tenant, Quota, and Policy Governance",
    "application-provisioning": "Onboard the First Application Team to the Platform",
    "data-services": "Enable Data Services Manager Database Self-Service",
  },
  networking: {
    "physical-fabric": "Implement Physical Fabric, VLAN, and MTU Prerequisites",
    "edge-cluster-routing": "Deploy NSX Edge Cluster and North-South Routing",
    "overlay-transport": "Roll Out NSX Overlay Transport and Host Connectivity",
    vpc: "Enable VCF VPCs and Transit Gateway Connectivity",
    "load-balancing": "Deploy Avi Load Balancer and Application Ingress",
    "network-operations": "Handover VCF Networking and NSX Operations",
  },
  security: {
    segmentation: "Implement Segmentation and Security Policy",
    "identity-rbac": "Implement Identity and RBAC Controls",
    "hardening-compliance": "Apply Hardening and Compliance Controls",
    "ids-ips": "Enable vDefend Distributed IDS/IPS",
    "malware-prevention": "Enable vDefend Malware Prevention and Sandboxing",
    "identity-firewall": "Implement Identity-Aware Firewall Rules",
    "security-intelligence": "Enable Security Intelligence and Traffic Visualization",
    waf: "Enable Avi Web Application Firewall",
  },
  resilience: {
    "recovery-architecture": "Implement Recovery Architecture",
    "recovery-exercises": "Execute Recovery Exercise and Runbook Validation",
    "cyber-recovery": "Implement On-Premises Cyber Recovery Environment",
    "cloud-cyber-recovery": "Implement Cloud Cyber Recovery with VMware Live Recovery",
  },
  kubernetes: {
    "workload-domains": "Create Workload Domain and Enable Supervisor",
    "platform-operations": "Operationalize Kubernetes Platform Services",
    "developer-experience": "Onboard Developer Experience Guardrails",
  },
  "private-ai": {
    "gpu-capacity": "Implement AI Capacity and GPU Enablement",
    "ai-guardrails": "Apply Private AI Guardrails",
    "pilot-onboarding": "Onboard the First Private AI Pilot",
  },
};

/**
 * A plan outcome: "capability:focus", "capability:core" (a capability chosen without a specific focus),
 * or a platform service that other outcomes build on.
 */
export type PlanOutcomeKey = string;

const PLATFORM_OUTCOME_LABELS: Record<string, string> = {
  "platform:nsx": "Implement Approved VCF Networking and NSX Design",
  "platform:ssp": "Deploy the vDefend Security Services Platform",
};

/**
 * Technical prerequisites between outcomes (VCF 9.x). Each inner list is one requirement that any of its
 * outcomes satisfies; every requirement must be met before the outcome starts.
 */
const PLAN_PREREQUISITES: Record<PlanOutcomeKey, PlanOutcomeKey[][]> = {
  "networking:overlay-transport": [["platform:nsx"]],
  "networking:edge-cluster-routing": [["platform:nsx"], ["networking:physical-fabric"]],
  "networking:vpc": [["networking:overlay-transport"], ["networking:edge-cluster-routing"]],
  "networking:network-operations": [["platform:nsx"]],
  "platform:ssp": [["platform:nsx"]],
  "security:segmentation": [["platform:nsx"]],
  "security:ids-ips": [["security:segmentation"]],
  "security:security-intelligence": [["security:segmentation"], ["platform:ssp"]],
  "security:malware-prevention": [["security:segmentation"], ["platform:ssp"]],
  "security:identity-firewall": [["security:segmentation"], ["security:identity-rbac"]],
  "security:waf": [["networking:load-balancing"]],
  "operations:custom-dashboards": [["operations:observability"]],
  "automation:governance": [["automation:vm-self-service", "automation:infrastructure-as-code"]],
  "automation:application-provisioning": [["automation:vm-self-service", "automation:infrastructure-as-code"]],
  "automation:data-services": [["automation:vm-self-service", "automation:infrastructure-as-code"], ["kubernetes:workload-domains"]],
  "kubernetes:platform-operations": [["kubernetes:workload-domains"]],
  "kubernetes:developer-experience": [["kubernetes:workload-domains"]],
  "private-ai:gpu-capacity": [["kubernetes:workload-domains"]],
  "private-ai:ai-guardrails": [["private-ai:gpu-capacity"]],
  "private-ai:pilot-onboarding": [["private-ai:ai-guardrails"], ["automation:vm-self-service", "automation:infrastructure-as-code"]],
  "resilience:recovery-exercises": [["resilience:recovery-architecture"]],
  "resilience:cyber-recovery": [["resilience:recovery-architecture"]],
  "resilience:cloud-cyber-recovery": [["resilience:recovery-architecture"]],
};

/** Delivery order; every outcome appears after the outcomes it can depend on. */
const PLAN_OUTCOME_ORDER: PlanOutcomeKey[] = [
  "networking:physical-fabric",
  "platform:nsx",
  "networking:overlay-transport",
  "networking:edge-cluster-routing",
  "networking:vpc",
  "networking:load-balancing",
  "networking:network-operations",
  "operations:lifecycle",
  "operations:observability",
  "operations:capacity-cost",
  "operations:custom-dashboards",
  "operations:identity-certificates",
  "operations:event-integration",
  "operations:core",
  "automation:vm-self-service",
  "automation:infrastructure-as-code",
  "automation:day-2-automation",
  "automation:governance",
  "automation:application-provisioning",
  "automation:core",
  "kubernetes:workload-domains",
  "kubernetes:platform-operations",
  "kubernetes:developer-experience",
  "kubernetes:core",
  "automation:data-services",
  "private-ai:gpu-capacity",
  "private-ai:ai-guardrails",
  "private-ai:pilot-onboarding",
  "private-ai:core",
  "security:identity-rbac",
  "security:segmentation",
  "security:hardening-compliance",
  "security:ids-ips",
  "platform:ssp",
  "security:security-intelligence",
  "security:malware-prevention",
  "security:identity-firewall",
  "security:waf",
  "security:core",
  "resilience:recovery-architecture",
  "resilience:recovery-exercises",
  "resilience:cyber-recovery",
  "resilience:cloud-cyber-recovery",
  "resilience:core",
];

/** Outcomes VMware vSphere Foundation does not include (no NSX, vDefend, VCF Automation, Private AI, fleet certificate management, or Advanced Cyber Compliance). */
const VCF_ONLY_OUTCOMES = new Set<PlanOutcomeKey>([
  "platform:nsx",
  "platform:ssp",
  "networking:overlay-transport",
  "networking:edge-cluster-routing",
  "networking:vpc",
  "networking:network-operations",
  "security:segmentation",
  "security:ids-ips",
  "security:malware-prevention",
  "security:identity-firewall",
  "security:security-intelligence",
  "operations:identity-certificates",
  "resilience:cyber-recovery",
]);
const VCF_ONLY_CAPABILITIES = new Set<Capability>(["automation", "private-ai"]);

export function isPlanOutcomeAvailable(key: PlanOutcomeKey, edition: PlatformEdition): boolean {
  if (edition === "vcf") return true;
  const capability = key.split(":")[0] as Capability;
  return !VCF_ONLY_OUTCOMES.has(key) && !VCF_ONLY_CAPABILITIES.has(capability);
}

/** Licensing and platform facts that determine whether an outcome can start. */
const PLAN_OUTCOME_NOTES: Record<PlanOutcomeKey, string> = {
  "platform:nsx": "NSX is deployed with the VCF management domain; prepare the in-scope host clusters, transport zones, and TEP addressing.",
  "platform:ssp": "Requires the vDefend Firewall with ATP add-on. Deploy from the SSP Installer (3 controllers and at least 4 workers) within 10 ms of NSX Manager.",
  "networking:vpc": "A centralized transit gateway needs the NSX Edge cluster and an active/standby Tier-0; VCF 9.1 also supports a distributed transit gateway with the Virtual Network Appliance.",
  "networking:load-balancing": "Requires the Avi Load Balancer add-on; deploy the Avi controller cluster and register the Supervisor for VKS ingress.",
  "security:segmentation": "Requires the vDefend Firewall add-on. NSX host preparation is required; an overlay is not.",
  "security:ids-ips": "Requires the vDefend Firewall with ATP add-on.",
  "security:malware-prevention": "Requires the vDefend Firewall with ATP add-on, the Security Services Platform, and a service VM on every protected host.",
  "security:security-intelligence": "Requires the vDefend Firewall with ATP add-on and the Security Services Platform.",
  "security:identity-firewall": "Requires Active Directory (LDAPS) integration and Guest Introspection or event-log scraping.",
  "security:waf": "Requires the Avi Load Balancer add-on with WAF.",
  "automation:data-services": "Requires the Data Services Manager add-on; self-service delivery uses VCF Automation and a Supervisor.",
  "private-ai:gpu-capacity": "Private AI Services is included with VCF; NVIDIA AI Enterprise licensing for vGPU is separate.",
  "resilience:recovery-architecture": "Site Recovery (SRM) orchestration is an add-on for VCF and VVF.",
  "resilience:cyber-recovery": "Requires the Advanced Cyber Compliance add-on and a vSAN ESA clean-room cluster.",
  "resilience:cloud-cyber-recovery": "Requires a VMware Live Recovery Cloud subscription and the DRaaS connector at the protected site.",
};

export type ResolvedPlanOutcome = {
  key: PlanOutcomeKey;
  /** Outcomes that needed this one; empty when it was selected directly. */
  requiredBy: PlanOutcomeKey[];
  /** The outcomes this one waits for, one per requirement. */
  prerequisites: PlanOutcomeKey[];
};

export type ResolvedPlanOutcomes = {
  edition: PlatformEdition;
  outcomes: ResolvedPlanOutcome[];
  /** Selected outcomes the platform edition does not include; they are left out of the plan. */
  excluded: PlanOutcomeKey[];
};

function selectedPlanOutcomeKeys(fields: MinimalFields): PlanOutcomeKey[] {
  const keys: PlanOutcomeKey[] = [];
  for (const capability of capabilitySchema.options) {
    const focuses = selectedFocuses(fields, capability);
    if (focuses.length) keys.push(...focuses.map(focus => `${capability}:${focus}`));
    else if (fields.priorities.includes(capability)) keys.push(capability === "networking" ? "platform:nsx" : `${capability}:core`);
  }
  return keys;
}

/**
 * Resolves the outcomes the plan delivers: the selected outcomes the platform edition includes, plus every
 * prerequisite they need (for an either-or requirement, the first listed outcome), in delivery order.
 */
export function resolvePlanOutcomes(fields: MinimalFields): ResolvedPlanOutcomes {
  const edition = effectivePlatformEdition(fields);
  const selected = selectedPlanOutcomeKeys(fields);
  const excluded = selected.filter(key => !isPlanOutcomeAvailable(key, edition));
  const requiredBy = new Map<PlanOutcomeKey, PlanOutcomeKey[]>(selected.filter(key => isPlanOutcomeAvailable(key, edition)).map(key => [key, []]));
  const prerequisites = new Map<PlanOutcomeKey, PlanOutcomeKey[]>();
  const pending = Array.from(requiredBy.keys());
  while (pending.length) {
    const key = pending.shift()!;
    const chosen: PlanOutcomeKey[] = [];
    for (const requirement of PLAN_PREREQUISITES[key] ?? []) {
      const options = requirement.filter(option => isPlanOutcomeAvailable(option, edition));
      if (!options.length) continue;
      const dependency = options.find(option => requiredBy.has(option)) ?? options[0];
      if (!requiredBy.has(dependency)) {
        requiredBy.set(dependency, [key]);
        pending.push(dependency);
      } else if (requiredBy.get(dependency)!.length) {
        requiredBy.get(dependency)!.push(key);
      }
      chosen.push(dependency);
    }
    prerequisites.set(key, chosen);
  }
  // A specific focus replaces the generic capability activity.
  for (const key of Array.from(requiredBy.keys())) {
    const [capability, focus] = key.split(":");
    if (focus === "core" && Array.from(requiredBy.keys()).some(other => other !== key && other.startsWith(`${capability}:`))) requiredBy.delete(key);
  }
  const order = (key: PlanOutcomeKey) => {
    const index = PLAN_OUTCOME_ORDER.indexOf(key);
    return index < 0 ? PLAN_OUTCOME_ORDER.length : index;
  };
  const outcomes = Array.from(requiredBy.entries())
    .sort(([left], [right]) => order(left) - order(right))
    .map(([key, needers]) => ({ key, requiredBy: needers, prerequisites: prerequisites.get(key) ?? [] }));
  return { edition, outcomes, excluded };
}

export function planOutcomeLabel(key: PlanOutcomeKey, edition: PlatformEdition = "vcf"): string {
  if (PLATFORM_OUTCOME_LABELS[key]) return PLATFORM_OUTCOME_LABELS[key];
  const [capability, focus] = key.split(":") as [Capability, string];
  if (focus === "core") return genericCapabilityLabel(capability, edition);
  if (edition === "vvf" && key === "operations:lifecycle") return "Configure vLCM Image Lifecycle and Change Controls";
  return focusLabels[capability]?.[focus] ?? `${capabilityTitle(capability)} capability`;
}

function genericCapabilityLabel(capability: Capability, edition: PlatformEdition): string {
  if (capability === "operations") return "Operationalize Platform Lifecycle and Service Health";
  if (capability === "automation") return "Enable Automation and Self-Service";
  if (capability === "kubernetes") return "Enable Kubernetes / Supervisor Services";
  if (capability === "private-ai") return "Prepare Private AI / GPU Platform Enablement";
  if (capability === "security") return edition === "vvf" ? "Implement vSphere Hardening and Access Controls" : "Implement Security and Segmentation Controls";
  if (capability === "resilience") return "Implement Resilience, DR, and Cyber-Recovery Controls";
  return `${capabilityTitle(capability)} Implementation`;
}

/** Whether the plan needs NSX: any outcome that depends on it, or the networking capability on VCF. */
export function planRequiresNsx(fields: MinimalFields): boolean {
  return resolvePlanOutcomes(fields).outcomes.some(outcome => outcome.key === "platform:nsx");
}

const componentDesignProfiles: Record<Capability, { title: string; outcome: string; dependency: string; ownership: VcfPlaybookOwnership }> = {
  operations: { title: "Design VCF Operations Adoption", outcome: "Issue the Operations architecture, data sources, dashboard and alert scope, lifecycle ownership, and operating acceptance criteria.", dependency: "Confirm the operations depth, platform owners, telemetry sources, and support model.", ownership: OPERATIONS_OWNERSHIP },
  automation: { title: "Design VCF Automation and Self-Service", outcome: "Issue the organization, project, catalog, blueprint, policy, approval, source-control, and service-ownership design.", dependency: "Confirm the automation depth, catalog product owner, tenant model, approvals, and integration boundaries.", ownership: { category: "Modernize Cloud", workstreamType: "Consume / Handover" } },
  networking: { title: "Design VCF Networking and NSX", outcome: "Issue the physical fabric, transport zone, Edge, routing, overlay, IP, MTU, and network-operations design.", dependency: "Confirm network ownership, fabric standards, routing handoffs, NSX scope, and selected adoption depth.", ownership: INFRASTRUCTURE_DESIGN_OWNERSHIP },
  security: { title: "Design vDefend and Security Policy", outcome: "Issue the segmentation, policy, identity, hardening, evidence, rollout-wave, and security-operations design.", dependency: "Confirm the security owner, application dependency evidence, policy lifecycle, and selected adoption depth.", ownership: { category: "Modernize Security & Resilience", workstreamType: "Security & Resiliency" } },
  resilience: { title: "Design Recovery and Resilience Services", outcome: "Issue the protection tiers, RPO/RTO, recovery topology, runbooks, exercise model, and acceptance evidence.", dependency: "Confirm protected workloads, business recovery objectives, tooling, sites, and recovery ownership.", ownership: { category: "Modernize Security & Resilience", workstreamType: "Security & Resiliency" } },
  kubernetes: { title: "Design VKS Platform and Developer Consumption", outcome: "Issue the workload-domain, Supervisor, namespace, policy, lifecycle, data-protection, and developer-consumption design.", dependency: "Confirm the platform owner, sponsored workload, network and security controls, and selected adoption depth.", ownership: { category: "Modernize Cloud", workstreamType: "Consume / Handover" } },
  "private-ai": { title: "Design Private AI Platform and Governance", outcome: "Issue the GPU capacity, workload-domain, data boundary, model access, security, lifecycle, pilot, and acceptance design.", dependency: "Confirm funded GPU capacity, a named use case, data classification, security approval, and selected adoption depth.", ownership: { category: "Modernize Cloud", workstreamType: "Consume / Handover" } },
};

/** VVF has no NSX or vDefend, so its networking and security designs cover VDS, Avi, hardening, and access. */
const VVF_COMPONENT_DESIGN_TITLES: Partial<Record<Capability, string>> = {
  networking: "Design VDS Networking and Load Balancing",
  security: "Design vSphere Hardening, Access, and Application Security",
};

export function getVcfComponentDesignOwnership(capability: Capability): VcfPlaybookOwnership {
  return componentDesignProfiles[capability].ownership;
}

function componentDepthFor(fields: MinimalFields, capability: Capability): AdoptionDepth {
  if (capability === "operations") return fields.adoptionDetails.componentDepths.operations;
  if (capability === "automation") return fields.adoptionDetails.componentDepths.automation;
  if (capability === "networking" || capability === "security") return fields.adoptionDetails.componentDepths.networkingSecurity;
  if (capability === "kubernetes" || capability === "private-ai") return fields.adoptionDetails.componentDepths.kubernetesAi;
  return "not-selected";
}

function componentDepthLabel(depth: AdoptionDepth): string {
  return ({ "not-selected": "depth to be confirmed", "tier-1": "Tier 1 · Deployed", "tier-2": "Tier 2 · Operationalized", "tier-3": "Tier 3 · Business Consumption" })[depth];
}

function selectedFocuses(fields: MinimalFields, capability: Capability): string[] {
  const detailKey: Record<Capability, "operations" | "automation" | "networking" | "security" | "resilience" | "kubernetes" | "privateAi"> = {
    operations: "operations",
    automation: "automation",
    networking: "networking",
    security: "security",
    resilience: "resilience",
    kubernetes: "kubernetes",
    "private-ai": "privateAi",
  };
  return fields.adoptionDetails[detailKey[capability]];
}

function withoutUnselectedGeneratedNetworking(timeline: Timeline, fields: MinimalFields): Timeline {
  if (planRequiresNsx(fields)) return timeline;
  const generatedNetworkingIds = new Set(["bar-vcf-networking-nsx", "bar-two-year-baseline-networking-nsx"]);
  return {
    ...timeline,
    lanes: timeline.lanes.map(lane => ({ ...lane, bars: lane.bars.filter(activity => !generatedNetworkingIds.has(activity.id)) })),
  };
}

function activityLabelsForCapability(fields: MinimalFields, capability: Capability): string[] {
  const focuses = selectedFocuses(fields, capability);
  if (!focuses.length) return [`${capabilityTitle(capability)} Implementation`];
  return focuses.map(focus => focusLabels[capability][focus] || `${capabilityTitle(capability)} Implementation`);
}

const legacyHostPlatformLanePrefix = "lane-host-platform-";

type PlatformInventoryActivity = Pick<TimelineBar, "label" | "color" | "dependsOn" | "outcome">;

function buildPlatformInventoryActivity(inventory: InventorySummary, cadence: TimelineCadence = "week", fields?: MinimalFields): PlatformInventoryActivity {
  const platforms = assessHardwarePlatforms(inventory);
  const observedHosts = platforms.reduce((total, platform) => total + platform.hosts, 0);
  const observedModels = new Set(platforms.map(platform => `${platform.vendor} ${platform.model}`.trim().replace(/\s+/g, " ").toLowerCase()).filter(model => model && model !== "unknown vendor unknown model")).size;
  const hclSupportedHosts = platforms.filter(platform => platform.hcl.status === "supported").reduce((total, platform) => total + platform.hosts, 0);
  const hclBlockingHosts = platforms.filter(platform => platform.hcl.status === "cpu-not-certified" || platform.hcl.status === "not-supported").reduce((total, platform) => total + platform.hosts, 0);
  const hclReviewHosts = platforms.filter(platform => ["supported-cpu-unverified", "review", "unknown"].includes(platform.hcl.status)).reduce((total, platform) => total + platform.hosts, 0);
  const hclPath = getHclSchedulePath(inventory);
  const hclPathName = `${hclPath.slice(0, 1).toUpperCase()}${hclPath.slice(1)}`;
  const hclPathContext = `HCL schedule path ${hclPathName}: ${hclPathLabel(hclPath)}.`;
  const hclDeliveryContext = hclBlockingHosts
    ? `The supplied offline HCL snapshot identifies ${hclBlockingHosts} host(s) with a CPU or release pairing that is not listed for ESXi 9.1; resolve replacement, repurpose, or approved exception decisions before platform deployment.`
    : hclReviewHosts
      ? `The supplied offline HCL snapshot identifies ${hclReviewHosts} host(s) that need CPU, vendor, or model confirmation before their pairing can be relied upon.`
      : hclSupportedHosts
        ? `The supplied offline HCL snapshot lists the reported model and resolved CPU series for ${hclSupportedHosts} host(s); retain that evidence while completing the full configuration review.`
        : "No server-and-CPU HCL pairing evidence is yet available from the imported host inventory.";
  const openingWindow = cadence === "week" ? "Weeks 1–2" : "Month 1";
  const deliveryContext = fields ? confirmedDeliveryContext(fields) : "";
  const appendDeliveryContext = (value: string) => deliveryContext ? `${value} ${deliveryContext}` : value;

  if (!platforms.length) {
    return {
      label: `${openingWindow}: Mobilize and Establish Delivery Baseline`,
      color: "amber",
      dependsOn: appendDeliveryContext("Upload RVTools vHost data with server make, model, CPU, adapters, storage-controller, and ESXi fields; confirm the bill of materials and delivery prerequisites before platform deployment begins."),
      outcome: "Use the opening window to confirm design decisions, evidence, dependencies, and delivery ownership; implementation services begin only in the selected implementation window.",
    };
  }

  return {
    label: `${openingWindow}: Mobilize and Establish Delivery Baseline`,
    color: "teal",
      dependsOn: appendDeliveryContext(`RVTools identifies ${observedHosts} observed host${observedHosts === 1 ? "" : "s"} across ${observedModels || platforms.length} host model${(observedModels || platforms.length) === 1 ? "" : "s"}. ${hclPathContext} ${hclDeliveryContext} Confirm server configuration, CPU, NIC, storage controller, firmware, driver, vSAN/ReadyNode details, bill of materials, and implementation prerequisites before platform deployment begins.`),
      outcome: `Use the opening window to capture the offline HCL evidence, design decisions, and remaining delivery dependencies; implementation services begin only in the selected implementation window.`,
  };
}

function withConsolidatedPlatformInventory(timeline: Timeline, inventory: InventorySummary): Timeline {
  const platformInventory = buildPlatformInventoryActivity(inventory, timeline.cadence);
  return {
    ...timeline,
    lanes: timeline.lanes
      .filter(lane => !lane.id.startsWith(legacyHostPlatformLanePrefix))
      .map(lane => lane.id === "lane-platform-plan"
        ? {
          ...lane,
          bars: lane.bars.map(activity => activity.id === "bar-platform-plan"
            ? { ...activity, ...platformInventory }
            : activity),
        }
        : lane),
  };
}

function withoutLegacyHostPlatformTwoYearLanes(timeline: Timeline): Timeline {
  const legacyPrefix = `lane-two-year-year-one-${legacyHostPlatformLanePrefix}`;
  return { ...timeline, lanes: timeline.lanes.filter(lane => !lane.id.startsWith(legacyPrefix)) };
}

/** Return the most conservative delivery path across observed vHost cohorts. */
function getHostPlatformSchedulePath(inventory: InventorySummary): HclSchedulePath {
  const platforms = assessHardwarePlatforms(inventory);
  if (!platforms.length) return "unresolved";
  const paths = platforms.map(platform => hclSchedulePath(platform.hcl.status));
  if (paths.includes("red")) return "red";
  if (paths.includes("yellow")) return "yellow";
  return "green";
}

/** Return the most conservative delivery path across every RVTools-observable HCL 2.0 finding. */
function hclSchedulePathForAssessment(inventory: InventorySummary, hcl: ReadinessAssessment["hcl"]): HclSchedulePath {
  const platformPath = getHostPlatformSchedulePath(inventory);
  return hcl.findings.length ? hclFindingSchedulePath(hcl.findings, platformPath) : platformPath;
}

export function getHclSchedulePath(inventory: InventorySummary): HclSchedulePath {
  return hclSchedulePathForAssessment(inventory, assessHclEstate(inventory.hclEvidence));
}

function scheduleUnits(cadence: TimelineCadence, weeks: number, months: number): number {
  return cadence === "week" ? weeks : months;
}

function ensureScheduleColumns(columns: string[], startDate: string, cadence: TimelineCadence, minimum: number): string[] {
  if (columns.length >= minimum) return columns;
  return cadence === "week"
    ? buildWeekColumns(startDate, "", minimum, minimum)
    : buildMonthColumns(startDate, "", minimum, minimum);
}

function fixedGanttLane(id: string, category: TimelineCategory, workstreamType: WorkstreamType, bars: TimelineBar[]): TimelineLane {
  return { id, name: workstreamType, category, workstreamType, bars };
}

function hclPathLabel(path: HclSchedulePath): string {
  return { green: "Green — hosts are listed for the target release", yellow: "Yellow — some hosts need remediation or verification", red: "Red — replacement hardware or an approved exception is needed", unresolved: "Unresolved — host details are missing" }[path];
}

function softPrerequisiteLabel(key: AdoptionDetails["softPrerequisites"][number]): string {
  return {
    "dns-ntp": "Confirm DNS, NTP, and core services",
    "ip-pools": "Allocate management and workload IP pools",
    "tor-switch-design": "Finalize ToR switch design and port readiness",
  }[key];
}

function buildPrimaryTimeline(fields: MinimalFields, inventory: InventorySummary, path = getHclSchedulePath(inventory), requiredColumns = 0): Timeline {
  const cadence = fields.adoptionCadence;
  const mobilizationDuration = scheduleUnits(cadence, 2, 1);
  const remediationDuration = scheduleUnits(cadence, 3, 1);
  const procurementDuration = scheduleUnits(cadence, 8, 2);
  const greenfieldDuration = scheduleUnits(cadence, 4, 1);
  // The VCF Installer brings a validated design up in days; a month covers deployment and validation.
  const managementDuration = scheduleUnits(cadence, 3, 1);
  const edition = effectivePlatformEdition(fields);
  const resolvedOutcomes = resolvePlanOutcomes(fields);
  const outcomeKeys = new Set(resolvedOutcomes.outcomes.map(outcome => outcome.key));
  const networkingInScope = outcomeKeys.has("platform:nsx");
  const networkingDuration = networkingInScope ? scheduleUnits(cadence, 3, 1) : 0;
  const workloadDuration = scheduleUnits(cadence, 2, 1);
  const moduleDuration = scheduleUnits(cadence, 3, 1);
  const securityDuration = scheduleUnits(cadence, 3, 1);
  const handoverDuration = scheduleUnits(cadence, 3, 1);
  const migrationDuration = upgradePathMigrationDuration(effectiveDeliveryPath(fields), cadence, scheduleUnits(cadence, 4, 2));
  const selectedTaskCount = (capability: "automation" | "kubernetes" | "private-ai" | "security" | "resilience" | "networking") =>
    resolvedOutcomes.outcomes.filter(outcome => outcome.key.startsWith(`${capability}:`)).length;
  const hclBufferDuration = path === "red" ? procurementDuration + greenfieldDuration : path === "yellow" || path === "unresolved" ? remediationDuration : 0;
  const cloudDuration = (selectedTaskCount("automation") + selectedTaskCount("kubernetes") + selectedTaskCount("private-ai")) * moduleDuration;
  const securityPathDuration = (selectedTaskCount("security") + selectedTaskCount("resilience") + (outcomeKeys.has("platform:ssp") ? 1 : 0)) * securityDuration + selectedTaskCount("networking") * moduleDuration;
  const estimatedHandoverStart = 1 + mobilizationDuration + hclBufferDuration + 1 + Math.max(managementDuration + networkingDuration + workloadDuration + cloudDuration, securityPathDuration) + migrationDuration;
  const baseMinimumColumns = scheduleUnits(cadence, path === "red" ? 30 : path === "yellow" || path === "unresolved" ? 22 : 18, path === "red" ? 12 : path === "yellow" || path === "unresolved" ? 10 : 8);
  const minimumColumns = Math.max(baseMinimumColumns, estimatedHandoverStart, requiredColumns);
  const startDate = timelineStartDate(fields);
  const columns = ensureScheduleColumns(primaryColumns(fields), startDate, cadence, minimumColumns);
  const count = columns.length;
  const deliveryContext = confirmedDeliveryContext(fields);
  const appendDeliveryContext = (value: string) => deliveryContext ? `${value} ${deliveryContext}` : value;
  // Track the latest column any activity needs so the grid can grow instead of squeezing work into its last column.
  let requestedEnd = 0;
  const range = (start: number, duration: number) => {
    requestedEnd = Math.max(requestedEnd, Math.max(1, start) + Math.max(1, duration));
    return boundedRange(Math.min(count, Math.max(1, start)), duration, count);
  };
  const plannedImplementationStart = parseIsoDate(fields.plannedImplementationStart || startDate) || parseIsoDate(startDate)!;
  const projectStart = parseIsoDate(startDate)!;
  const implementationOffset = cadence === "month"
    ? Math.max(0, monthDifference(new Date(Date.UTC(projectStart.getUTCFullYear(), projectStart.getUTCMonth(), 1)), new Date(Date.UTC(plannedImplementationStart.getUTCFullYear(), plannedImplementationStart.getUTCMonth(), 1))))
    : Math.max(0, Math.ceil((plannedImplementationStart.getTime() - projectStart.getTime()) / 604800000));
  const implementationStartColumn = Math.min(count, 1 + implementationOffset);
  const platformInventory = buildPlatformInventoryActivity(inventory, cadence, fields);

  const playbookPlan = playbookPlanForFields(fields);
  type DesignLaneKey = "program" | "infrastructureBuild" | "infrastructureWaves" | "operations" | "cloud" | "security";
  const designBars: Record<DesignLaneKey, TimelineBar[]> = {
    program: [],
    infrastructureBuild: [],
    infrastructureWaves: [],
    operations: [],
    cloud: [],
    security: [],
  };
  const designLaneKey = (ownership: VcfPlaybookOwnership): DesignLaneKey => {
    if (ownership.category === "Program Management & Governance") return "program";
    if (ownership.category === "Modernize Infrastructure") return ownership.workstreamType === "Migration Waves" ? "infrastructureWaves" : "infrastructureBuild";
    if (ownership.category === "Modernize Cloud") return "cloud";
    if (ownership.category === "Modernize Security & Resilience") return "security";
    return "operations";
  };
  let pathwayDesignCursor = 1;
  let firstDesignPackageEnd: number | undefined;
  playbookPlan.designPackages.forEach((workPackage, index) => {
    const duration = index === 0 ? scheduleUnits(cadence, 2, 1) : scheduleUnits(cadence, 3, 1);
    const [taskStart, taskEnd] = range(pathwayDesignCursor, duration);
    const ownership = getVcfPlaybookWorkPackageOwnership(playbookPlan.path, workPackage);
    designBars[designLaneKey(ownership)].push(bar(
      `bar-playbook-design-${workPackage.id}`,
      taskStart,
      taskEnd,
      colorForWorkstreamType(ownership.workstreamType),
      workPackage.title,
      false,
      false,
      appendDeliveryContext(workPackage.dependsOn),
      `${workPackage.outcome} Acceptance: ${workPackage.acceptance}`,
    ));
    pathwayDesignCursor = taskEnd;
    firstDesignPackageEnd ??= taskEnd;
  });
  // Component designs start once requirements are confirmed and run alongside the rest of the pathway design.
  const requirementsEnd = firstDesignPackageEnd ?? pathwayDesignCursor;
  const componentDesignCursors: Record<DesignLaneKey, number> = {
    program: requirementsEnd,
    infrastructureBuild: requirementsEnd,
    infrastructureWaves: requirementsEnd,
    operations: requirementsEnd,
    cloud: requirementsEnd,
    security: requirementsEnd,
  };
  const designedCapabilities = capabilitySchema.options.filter(capability =>
    (fields.priorities.includes(capability) && isPlanOutcomeAvailable(`${capability}:core`, edition) && (capability !== "networking" || edition === "vcf"))
    || resolvedOutcomes.outcomes.some(outcome => outcome.key.startsWith(`${capability}:`) || (capability === "networking" && outcome.key === "platform:nsx")));
  designedCapabilities.forEach(capability => {
    const profile = componentDesignProfiles[capability];
    const depth = componentDepthFor(fields, capability);
    const laneKey = designLaneKey(profile.ownership);
    const [taskStart, taskEnd] = range(componentDesignCursors[laneKey], scheduleUnits(cadence, 2, 1));
    designBars[laneKey].push(bar(
      `bar-playbook-component-design-${capability}`,
      taskStart,
      taskEnd,
      colorForWorkstreamType(profile.ownership.workstreamType),
      `${edition === "vvf" ? VVF_COMPONENT_DESIGN_TITLES[capability] ?? profile.title : profile.title} — ${componentDepthLabel(depth)}`,
      false,
      false,
      appendDeliveryContext(profile.dependency),
      `${profile.outcome} The committed adoption depth is ${componentDepthLabel(depth)}.`,
    ));
    componentDesignCursors[laneKey] = taskEnd;
  });
  if (fields.adoptionDetails.componentDepths.efficiency !== "not-selected") {
    const [taskStart, taskEnd] = range(componentDesignCursors.infrastructureBuild, scheduleUnits(cadence, 2, 1));
    designBars.infrastructureBuild.push(bar(
      "bar-playbook-component-design-efficiency",
      taskStart,
      taskEnd,
      colorForWorkstreamType("Infrastructure Build"),
      `Design Efficiency, Memory Tiering, and Sizing — ${componentDepthLabel(fields.adoptionDetails.componentDepths.efficiency)}`,
      false,
      false,
      "Confirm hardware architecture, performance baseline, supported memory-tiering configuration, vSAN layout, and financial measurement method.",
      "Issue the hardware-efficiency sizing model, implementation boundaries, performance validation plan, and measurable acceptance direction.",
    ));
    componentDesignCursors.infrastructureBuild = taskEnd;
  }

  const [mobilizationStart, mobilizationEnd] = range(1, mobilizationDuration);
  const programBars: TimelineBar[] = [
    bar("bar-platform-plan", mobilizationStart, mobilizationEnd, colorForWorkstreamType("Governance"), platformInventory.label, false, false, platformInventory.dependsOn, platformInventory.outcome),
    ...designBars.program,
  ];
  const infrastructureBars: TimelineBar[] = [...designBars.infrastructureBuild];
  let hclBufferEnd = mobilizationEnd;
  // One milestone: platform build starts only once hardware compatibility is confirmed.
  let hclDependency = "The imported hosts are listed for the target release; confirmed at the end of mobilization.";

  if (path === "yellow" || path === "unresolved") {
    const [remediationStart, remediationEnd] = range(mobilizationEnd, remediationDuration);
    infrastructureBars.push(bar("bar-hcl-remediation", remediationStart, remediationEnd, "amber", path === "yellow" ? "Remediate and Verify HCL Exceptions" : "Collect Missing HCL Evidence and Confirm Path", false, false, appendDeliveryContext("Resolve server, CPU, firmware, or identity evidence before releasing the platform build."), path === "yellow" ? "Close the reported HCL exception path and retain verification evidence." : "Collect missing vHost identity and configuration evidence before committing the platform path."));
    hclBufferEnd = remediationEnd;
    hclDependency = path === "yellow"
      ? "Confirmed when the flagged hosts are remediated and verified."
      : "Confirmed when the missing host details are collected and each host's compatibility is checked.";
  }

  if (path === "red") {
    const [procurementStart, procurementEnd] = range(mobilizationEnd, procurementDuration);
    const [greenfieldStart, greenfieldEnd] = range(procurementEnd, greenfieldDuration);
    infrastructureBars.push(
      bar("bar-hcl-procurement", procurementStart, procurementEnd, "red", "Procure Replacement Hardware or Approve Greenfield Path", false, false, appendDeliveryContext("Proceed only after the Red HCL result has a replacement, repurpose, or approved exception decision."), "Secure the supported hardware path before downstream domain build activities begin."),
      bar("bar-hcl-greenfield", greenfieldStart, greenfieldEnd, "red", "Provision and Validate Greenfield Hardware Baseline", false, false, "Start after procurement, hardware delivery, and rack-and-stack acceptance.", "Validate the newly provisioned hardware baseline before releasing VCF deployment work."),
    );
    hclBufferEnd = greenfieldEnd;
    hclDependency = "Confirmed when replacement hardware is procured and provisioned, or an exception is approved.";
  }

  // Site-readiness prerequisites run alongside the HCL buffer and must close before platform build starts.
  const executionPathway = playbookPlan.path !== "undecided" && playbookPlan.path !== "design-only";
  const sitePrerequisiteIds: string[] = [];
  let sitePrerequisiteEnd = mobilizationEnd;
  if (path === "red" || executionPathway) {
    if (executionPathway && outcomeKeys.has("networking:physical-fabric")) {
      const [fabricStart, fabricEnd] = range(mobilizationEnd, scheduleUnits(cadence, 3, 1));
      infrastructureBars.push({
        ...bar("bar-networking-physical-fabric", fabricStart, fabricEnd, colorForWorkstreamType("Infrastructure Build"), planOutcomeLabel("networking:physical-fabric", edition), false, false, "Runs with the site-readiness work and closes before platform build begins.", "Deliver transport VLANs, MTU, and routing handoffs the platform and network services depend on."),
        prerequisites: ["bar-platform-plan"],
      });
      sitePrerequisiteIds.push("bar-networking-physical-fabric");
      sitePrerequisiteEnd = Math.max(sitePrerequisiteEnd, fabricEnd);
    }
    fields.adoptionDetails.softPrerequisites.forEach((prerequisite) => {
      const [softStart, softEnd] = range(mobilizationEnd, scheduleUnits(cadence, 3, 1));
      const id = `bar-soft-prerequisite-${prerequisite}`;
      infrastructureBars.push({
        ...bar(id, softStart, softEnd, "teal", softPrerequisiteLabel(prerequisite), false, false, path === "red" ? "This site-readiness prerequisite may run in parallel with Red-path procurement and greenfield provisioning." : "This site-readiness prerequisite runs in parallel with the HCL evidence review and closes before platform build begins.", path === "red" ? "Remove an infrastructure dependency without delaying the hardware procurement buffer." : "Remove an infrastructure dependency before the platform build window opens."),
        prerequisites: ["bar-platform-plan"],
      });
      sitePrerequisiteIds.push(id);
      sitePrerequisiteEnd = Math.max(sitePrerequisiteEnd, softEnd);
    });
  }

  const [hclGateStart, hclGateEnd] = range(hclBufferEnd, 1);
  programBars.push(bar("bar-hcl-gate", hclGateStart, hclGateEnd, "gate", "Hardware Compatibility Confirmed", true, false, hclDependency, `Platform build starts only after this milestone. Compatibility check result: ${hclPathLabel(path)}.`));

  const pathwayDesignEnd = playbookPlan.designPackages.length ? pathwayDesignCursor : hclGateEnd;
  const infrastructureDesignEnd = Math.max(pathwayDesignEnd, componentDesignCursors.infrastructureBuild, componentDesignCursors.infrastructureWaves);
  const deliveryStart = Math.max(hclGateEnd, implementationStartColumn, infrastructureDesignEnd, sitePrerequisiteEnd);
  let foundationEnd = deliveryStart;
  let workloadEnd = deliveryStart;
  let directMigrationExecutionEnd = deliveryStart;
  /** The activity whose end marks platform readiness; later capability work names it as a prerequisite. */
  let platformReadyId = "bar-hcl-gate";
  let foundationId = "bar-hcl-gate";
  const vvf = edition === "vvf";
  const migrationBars: TimelineBar[] = [...designBars.infrastructureWaves];
  const buildPrerequisites = ["bar-hcl-gate", ...sitePrerequisiteIds];
  const addInfrastructurePackage = (id: string, title: string, start: number, duration: number, dependsOn: string, outcome: string, prerequisites: string[]) => {
    const [taskStart, taskEnd] = range(start, duration);
    infrastructureBars.push({ ...bar(id, taskStart, taskEnd, colorForWorkstreamType("Infrastructure Build"), title, false, false, appendDeliveryContext(dependsOn), outcome), prerequisites });
    platformReadyId = id;
    return taskEnd;
  };
  const implementationPackage = playbookPlan.implementationPackages[0];
  const nsxScheduledWithFoundation = networkingInScope && (playbookPlan.path === "greenfield" || playbookPlan.path === "hybrid");

  if (playbookPlan.path === "in-place") {
    foundationEnd = addInfrastructurePackage("bar-in-place-preparation", vvf ? "Prepare Supported Estate for the VVF Upgrade" : "Prepare Supported Estate for In-Place Upgrade", deliveryStart, managementDuration, "Starts after hardware compatibility is confirmed and the upgrade runbook is approved; close platform, backup, firmware, driver, lifecycle, and management prerequisites.", "Release only the supported host and management cohorts into the approved upgrade waves.", buildPrerequisites);
    foundationId = "bar-in-place-preparation";
    workloadEnd = foundationEnd;
  } else if (playbookPlan.path === "converge") {
    foundationId = vvf ? "bar-vvf-foundation" : "bar-converge-management-domain";
    foundationEnd = addInfrastructurePackage(foundationId, implementationPackage?.title || "Converge Existing vCenter into the VCF Management Domain", deliveryStart, managementDuration, implementationPackage?.dependsOn || "Begin after the convergence runbook is approved.", implementationPackage?.outcome || "Establish the VCF management domain from the accepted existing environment.", buildPrerequisites);
    workloadEnd = foundationEnd;
  } else if (playbookPlan.path === "import-workload-domain") {
    foundationId = "bar-import-foundation-validation";
    foundationEnd = addInfrastructurePackage(foundationId, "Validate Destination VCF Foundation for Import", deliveryStart, managementDuration, "Begin after the destination VCF instance, capacity, networking, storage, and lifecycle health are accepted.", "Confirm the destination foundation can receive the complete source vCenter as a workload domain.", buildPrerequisites);
    workloadEnd = foundationEnd;
    const [importStart, importEnd] = range(foundationEnd, workloadDuration);
    migrationBars.push({ ...bar("bar-import-workload-domain", importStart, importEnd, colorForWorkstreamType("Migration Waves"), "Import Existing vCenter as a VCF Workload Domain", false, false, appendDeliveryContext(implementationPackage?.dependsOn || "Begin after destination-foundation acceptance."), implementationPackage?.outcome || "Import and validate the approved workload domain."), prerequisites: [foundationId] });
    platformReadyId = "bar-import-workload-domain";
    directMigrationExecutionEnd = importEnd;
  } else if (playbookPlan.path === "greenfield" || playbookPlan.path === "hybrid") {
    const foundationTitle = playbookPlan.path === "greenfield" ? implementationPackage?.title || "Deploy and Validate the Greenfield VCF Foundation" : "Establish the Shared VCF Foundation for Approved Cohorts";
    foundationId = vvf ? "bar-vvf-foundation" : "bar-management-domain";
    foundationEnd = addInfrastructurePackage(foundationId, foundationTitle, deliveryStart, managementDuration, playbookPlan.path === "greenfield" ? "Begin only after separately funded hardware, rack, network, storage, DNS, NTP, and IP prerequisites are accepted." : "Begin after the cohort decision register and shared target-state design are approved.", playbookPlan.path === "greenfield" ? (vvf ? "Deploy vCenter, VCF Operations, and management services with the VCF Installer and validate core platform health." : "Deploy the approved management-domain foundation and validate core platform health.") : "Establish the common VCF control plane required by the approved cohort pathways.", buildPrerequisites);
    let workloadPrerequisite = foundationId;
    if (nsxScheduledWithFoundation) {
      foundationEnd = addInfrastructurePackage("bar-vcf-networking-nsx", planOutcomeLabel("platform:nsx"), foundationEnd, networkingDuration, "Coordinate physical-fabric VLANs, MTU, routing handoffs, transport zones, and Edge placement from the approved network design.", "Deliver the selected networking depth without implying unselected security-policy scope.", [foundationId, ...(sitePrerequisiteIds.includes("bar-networking-physical-fabric") ? ["bar-networking-physical-fabric"] : [])]);
      workloadPrerequisite = "bar-vcf-networking-nsx";
    }
    workloadEnd = vvf
      ? addInfrastructurePackage("bar-vvf-workload-clusters", "Configure Workload Clusters, vLCM Images, and Storage", foundationEnd, workloadDuration, "Begin after the VVF foundation and the approved storage and network prerequisites are validated.", "Prepare the workload clusters used by migration waves and selected component adoption.", [workloadPrerequisite])
      : addInfrastructurePackage("bar-workload-domain", "Create and Validate the Initial VCF Workload Domain", foundationEnd, workloadDuration, "Begin after management-domain health and the approved network and storage prerequisites are validated.", "Create the workload-domain foundation used by migration waves and selected component adoption.", [workloadPrerequisite]);
  }

  const executionPackage = playbookPlan.path === "greenfield"
    ? playbookPlan.implementationPackages.at(-1)
    : playbookPlan.implementationPackages[0];
  const migrationRange = migrationDuration && executionPackage ? range(workloadEnd, migrationDuration) : null;
  const migrationEnd = Math.max(migrationRange?.[1] ?? workloadEnd, directMigrationExecutionEnd);
  if (migrationRange && executionPackage) {
    const executionId = `bar-playbook-execution-${executionPackage.id}`;
    migrationBars.push({
      ...bar(
        executionId,
        migrationRange[0],
        migrationRange[1],
        colorForWorkstreamType("Migration Waves"),
        executionPackage.title,
        false,
        false,
        appendDeliveryContext(executionPackage.dependsOn),
        `${executionPackage.outcome} Acceptance: ${executionPackage.acceptance}`,
      ),
      prerequisites: [platformReadyId],
    });
    platformReadyId = executionId;
  }

  // Capability work starts once the platform is accepted. On greenfield and multi-path plans that is the workload
  // domain, so it runs alongside the migration waves; elsewhere the pathway execution itself readies the platform.
  const migratesOntoNewPlatform = playbookPlan.path === "greenfield" || playbookPlan.path === "hybrid";
  const deliveryCompleteId = platformReadyId;
  const platformReadyEnd = migratesOntoNewPlatform ? workloadEnd : migrationEnd;
  if (migratesOntoNewPlatform) platformReadyId = vvf ? "bar-vvf-workload-clusters" : "bar-workload-domain";
  const implementationApproved = playbookPlan.path !== "undecided" && playbookPlan.path !== "design-only";
  const operationsBars: TimelineBar[] = [...designBars.operations];
  const cloudBars: TimelineBar[] = [...designBars.cloud];
  const securityBars: TimelineBar[] = [...designBars.security];
  const endById = new Map([...programBars, ...infrastructureBars, ...migrationBars].map(activity => [activity.id, activity.endCol]));
  const cursors = {
    infrastructure: nsxScheduledWithFoundation ? endById.get("bar-vcf-networking-nsx") ?? platformReadyEnd : platformReadyEnd,
    operations: Math.max(componentDesignCursors.operations, platformReadyEnd),
    cloud: Math.max(componentDesignCursors.cloud, platformReadyEnd),
    security: Math.max(componentDesignCursors.security, platformReadyEnd),
  };
  const laneBars = { infrastructure: infrastructureBars, operations: operationsBars, cloud: cloudBars, security: securityBars };
  /** Each lane runs up to two independent activities at once; an activity still waits for its prerequisites. */
  const laneSlots: Record<keyof typeof cursors, number[]> = {
    infrastructure: [cursors.infrastructure, cursors.infrastructure],
    operations: [cursors.operations, cursors.operations],
    cloud: [cursors.cloud, cursors.cloud],
    security: [cursors.security, cursors.security],
  };

  if (implementationApproved && playbookPlan.path === "in-place" && playbookPlan.implementationPackages[1]) {
    const managementPackage = playbookPlan.implementationPackages[1];
    const id = `bar-playbook-adoption-${managementPackage.id}`;
    const [taskStart, taskEnd] = range(cursors.operations, moduleDuration);
    operationsBars.push({ ...bar(id, taskStart, taskEnd, colorForWorkstreamType("Operating Model / Platform"), managementPackage.title, false, false, managementPackage.dependsOn, `${managementPackage.outcome} Acceptance: ${managementPackage.acceptance}`), prerequisites: [platformReadyId] });
    endById.set(id, taskEnd);
    cursors.operations = taskEnd;
    laneSlots.operations = [taskEnd, taskEnd];
  }
  if (implementationApproved && playbookPlan.path !== "import-workload-domain") {
    // The platform runs on a 90-day evaluation until subscription licensing is activated.
    const anchorId = playbookPlan.path === "in-place" ? platformReadyId : foundationId;
    const [licenseStart, licenseEnd] = range(playbookPlan.path === "in-place" ? platformReadyEnd : foundationEnd, scheduleUnits(cadence, 2, 1));
    operationsBars.push({
      ...bar("bar-platform-licensing", licenseStart, licenseEnd, colorForWorkstreamType("Operating Model / Platform"), "Register VCF Operations and Activate Subscription Licensing", false, false, "Complete within the 90-day evaluation period: register VCF Operations in the VCF Business Services console, allocate cores, and apply the license file in connected or disconnected mode. Disconnected sites must report usage at least every 180 days.", "Activate subscription licensing for the deployed platform and its add-ons before the evaluation period ends."),
      prerequisites: [anchorId],
    });
    endById.set("bar-platform-licensing", licenseEnd);
  }

  const outcomeLane = (key: PlanOutcomeKey): keyof typeof cursors => {
    const capability = key.split(":")[0];
    if (capability === "networking" || key === "platform:nsx") return "infrastructure";
    if (capability === "operations") return "operations";
    if (capability === "automation" || capability === "kubernetes" || capability === "private-ai") return "cloud";
    return "security";
  };
  const outcomeBarId = (key: PlanOutcomeKey): string => {
    if (key === "platform:nsx") return "bar-vcf-networking-nsx";
    if (key === "platform:ssp") return "bar-security-services-platform";
    const [capability, focus] = key.split(":");
    if (capability === "operations") return `bar-operations-${focus}`;
    if (capability === "automation" || capability === "kubernetes" || capability === "private-ai") return focus === "core" ? `bar-cloud-${capability}` : `bar-cloud-${capability}-${focus}`;
    return `bar-${capability}-${focus}`;
  };
  const platformName = vvf ? "VVF" : "VCF";
  const laneOutcome = (key: PlanOutcomeKey): string => {
    switch (outcomeLane(key)) {
      case "infrastructure": return "Deliver the selected networking capability on the accepted foundation.";
      case "operations": return "Implement the selected operating capability with accountable ownership and measurable service outcomes.";
      case "cloud": return `Enable the confirmed cloud capability on the accepted ${platformName} foundation.`;
      default: return "Implement the selected resilience and security capability with controlled evidence and ownership.";
    }
  };
  const labelById = (id: string) => [...programBars, ...infrastructureBars, ...migrationBars, ...operationsBars, ...cloudBars, ...securityBars].find(activity => activity.id === id)?.label;

  if (implementationApproved) {
    for (const outcome of resolvedOutcomes.outcomes) {
      if (outcome.key === "networking:physical-fabric") continue;
      if (outcome.key === "platform:nsx" && nsxScheduledWithFoundation) continue;
      const id = outcomeBarId(outcome.key);
      const lane = outcomeLane(outcome.key);
      const prerequisiteIds = outcome.prerequisites.map(outcomeBarId).filter(prerequisiteId => endById.has(prerequisiteId));
      const slots = laneSlots[lane];
      const slot = slots.indexOf(Math.min(...slots));
      const [taskStart, taskEnd] = range(
        Math.max(slots[slot], ...prerequisiteIds.map(prerequisiteId => endById.get(prerequisiteId)!)),
        outcome.key === "platform:nsx" ? networkingDuration : lane === "security" ? securityDuration : moduleDuration,
      );
      const anchorId = lane === "infrastructure" && nsxScheduledWithFoundation ? "bar-vcf-networking-nsx" : platformReadyId;
      const startsAfter = Array.from(new Set([labelById(anchorId), ...prerequisiteIds.map(labelById)].filter((label): label is string => Boolean(label))));
      const dependsOn = [`Starts after: ${startsAfter.join("; ")}.`, PLAN_OUTCOME_NOTES[outcome.key] ?? ""].filter(Boolean).join(" ");
      const outcomeText = outcome.requiredBy.length
        ? `${laneOutcome(outcome.key)} Included as a prerequisite for: ${outcome.requiredBy.map(key => planOutcomeLabel(key, edition)).join("; ")}.`
        : laneOutcome(outcome.key);
      laneBars[lane].push({
        ...bar(id, taskStart, taskEnd, colorForWorkstreamType(lane === "infrastructure" ? "Infrastructure Build" : lane === "operations" ? "Operating Model / Platform" : lane === "cloud" ? "Consume / Handover" : "Security & Resiliency"), planOutcomeLabel(outcome.key, edition), false, false, dependsOn, outcomeText),
        prerequisites: Array.from(new Set([anchorId, ...prerequisiteIds])),
      });
      endById.set(id, taskEnd);
      slots[slot] = taskEnd;
      cursors[lane] = Math.max(cursors[lane], taskEnd);
    }
  }
  const operationsCursor = cursors.operations;
  const hasModuleWork = (bars: TimelineBar[]) => bars.some(activity => !activity.id.startsWith("bar-playbook-component-design-"));
  const cloudEnd = hasModuleWork(cloudBars) ? cursors.cloud : platformReadyEnd;
  const securityEnd = hasModuleWork(securityBars) ? cursors.security : platformReadyEnd;
  const networkingEnd = cursors.infrastructure;

  if (!implementationApproved) {
    // Without an approved execution pathway the plan still runs to entitlement end: the design is taken to an
    // execution decision, then governed and prepared for implementation rather than leaving the window empty.
    const designEnd = Math.max(pathwayDesignEnd, hclGateEnd, ...Object.values(componentDesignCursors));
    // These run through entitlement end, not to the end of the scheduling grid.
    const windowEnd = entitlementLimitDate(fields) ? Math.min(count, primaryColumns(fields).length) : count;
    const lastDesignPackage = playbookPlan.designPackages.at(-1);
    const [decisionStart, decisionEnd] = range(designEnd, 1);
    programBars.push({
      ...bar("bar-platform-execution-decision", decisionStart, decisionEnd, colorForWorkstreamType("Governance"), playbookPlan.path === "design-only" ? "Approve Implementation Funding and Delivery Window" : "Approve the VCF Adoption Pathway and Execution Funding", true, false, "Begin after the design package is accepted by the architecture and funding owners.", "Record the approved execution pathway, funding, delivery window, and implementation partner so implementation can be planned."),
      ...(lastDesignPackage ? { prerequisites: [`bar-playbook-design-${lastDesignPackage.id}`] } : {}),
    });
    const [governanceStart, governanceEnd] = range(decisionEnd, windowEnd + 1 - decisionEnd);
    programBars.push({
      ...bar("bar-platform-design-authority", governanceStart, governanceEnd, colorForWorkstreamType("Governance"), "Maintain Design Authority and Entitlement Governance", false, false, "Continue after the execution decision through entitlement end.", "Keep the decision register, design baseline, risks, and entitlement drawdown current until implementation is contracted."),
      prerequisites: ["bar-platform-execution-decision"],
    });
    const [readinessStart, readinessEnd] = range(designEnd, windowEnd + 1 - designEnd);
    operationsBars.push({
      ...bar("bar-platform-operating-readiness", readinessStart, readinessEnd, colorForWorkstreamType("Operating Model / Platform"), "Prepare Operating Model, Skills, and Runbooks for Implementation", false, false, "Begin after the design package is accepted.", "Prepare platform ownership, skills, support model, and operational runbooks so implementation can start without delay once approved."),
      ...(lastDesignPackage ? { prerequisites: [`bar-playbook-design-${lastDesignPackage.id}`] } : {}),
    });
  }

  if (implementationApproved) {
    const [handoverStart, handoverEnd] = range(Math.max(migrationEnd, operationsCursor, cloudEnd, securityEnd, networkingEnd), handoverDuration);
    operationsBars.push({ ...bar("bar-platform-handover", handoverStart, handoverEnd, colorForWorkstreamType("Operating Model / Platform"), "Validate Handover, Service Acceptance, and Ongoing Lifecycle", false, false, "Begin after the final migration or implementation wave is accepted.", "Confirm operational readiness, evidence, ownership, and the continuing lifecycle cadence."), prerequisites: [deliveryCompleteId] });
  }

  const lanes: TimelineLane[] = [
    fixedGanttLane("lane-program-governance", "Program Management & Governance", "Governance", programBars),
    fixedGanttLane("lane-modernize-infrastructure-build", "Modernize Infrastructure", "Infrastructure Build", infrastructureBars),
    fixedGanttLane("lane-modernize-infrastructure-migration", "Modernize Infrastructure", "Migration Waves", migrationBars),
    fixedGanttLane("lane-operations", "Operations", "Operating Model / Platform", operationsBars),
    fixedGanttLane("lane-cloud", "Modernize Cloud", "Consume / Handover", cloudBars),
    fixedGanttLane("lane-security-resilience", "Modernize Security & Resilience", "Security & Resiliency", securityBars),
  ];

  const maximumColumns = cadence === "week" ? 104 : 36;
  // Squeezed activities understate what later ones need, so grow until the schedule fits or the cap is reached.
  if (requestedEnd > count + 1 && count < maximumColumns) {
    return buildPrimaryTimeline(fields, inventory, path, Math.min(maximumColumns, requestedEnd - 1));
  }
  return applyWorkstreamPresentation({ cadence, startDate, columns, lanes });
}

type FollowOnEligibility = {
  requiresAllFocuses?: string[];
  requiresAnyFocus?: string[];
  requiresObservedInventory?: boolean;
  requiresKnownHardwarePlan?: boolean;
};

type FollowOnServiceProfile = {
  label: string;
  outcome: string;
  entryCondition: string;
  eligibility?: FollowOnEligibility;
};

const followOnServiceProfiles: Record<Capability, Record<string, FollowOnServiceProfile>> = {
  operations: {
    lifecycle: { label: "VCF Lifecycle Management and Change Governance", outcome: "Set up a repeatable lifecycle calendar, change approvals, certificate ownership, and exception handling for the VCF platform.", entryCondition: "the lifecycle owner, maintenance window, and supported upgrade path are confirmed" },
    observability: { label: "Operations Telemetry and Service Health Management", outcome: "Use health and log data to define service objectives, operational patterns, and an ongoing service cadence.", entryCondition: "operational telemetry and an accountable operations team are available" },
    "capacity-cost": { label: "Capacity Forecasting and Cost Optimization", outcome: "Run rightsizing, forecasting, and cost-governance cycles against established capacity data.", entryCondition: "capacity data, cost owners, and an operating cadence are confirmed", eligibility: { requiresObservedInventory: true } },
    "custom-dashboards": { label: "Operations Dashboards With Ownership", outcome: "Publish governed dashboards with support-team ownership, service measures, and an operating cadence.", entryCondition: "the dashboards, data sources, and ownership model are accepted", eligibility: { requiresAllFocuses: ["observability"], requiresObservedInventory: true } },
    "identity-certificates": { label: "Identity, Credential, and Certificate Operations", outcome: "Operate identity, credential, and certificate hygiene with ownership, evidence, and exception procedures.", entryCondition: "privileged-access owners and approved operating procedures are confirmed" },
    "event-integration": { label: "Event-to-Incident Integration and Escalation", outcome: "Route prioritized events into incident workflows with escalation paths and service-level reporting.", entryCondition: "the ITSM or event target, severity model, and resolver groups are agreed" },
  },
  automation: {
    "vm-self-service": { label: "Launch a Governed VM Self-Service Catalog", outcome: "Launch a measured catalog for selected tenants with quotas, approvals, and support ownership.", entryCondition: "catalog blueprints, tenancy rules, and a support handoff are accepted" },
    "infrastructure-as-code": { label: "Infrastructure-as-Code Blueprint Factory and Release Controls", outcome: "Establish reusable blueprints, source control, policy controls, and release practices.", entryCondition: "a source-control workflow, security alignment, and content owners are available" },
    "day-2-automation": { label: "Operate Day-2 Remediation and Maintenance Automation", outcome: "Operationalize priority remediation and maintenance automations with runbook and rollback controls.", entryCondition: "priority workflows, approval paths, and rollback owners are confirmed" },
    governance: { label: "Tenant, Quota, and Policy Governance", outcome: "Run tenant, quota, policy, and exception governance as an ongoing operating practice.", entryCondition: "the tenant model, quota policy, and exception authority are confirmed", eligibility: { requiresAnyFocus: ["vm-self-service", "infrastructure-as-code"] } },
    "application-provisioning": { label: "Onboard the First Application Team to the Platform", outcome: "Onboard a first application team through governed blueprints and a supported delivery path.", entryCondition: "a sponsored workload, application team, and service support model are confirmed", eligibility: { requiresAnyFocus: ["vm-self-service", "infrastructure-as-code"] } },
  },
  networking: {
    "physical-fabric": { label: "VCF Network Foundation and Physical Fabric Alignment", outcome: "Align transport VLANs, MTU, routing handoffs, and physical-fabric dependencies for the VCF platform.", entryCondition: "network owners, VLAN and MTU standards, and routing handoffs are confirmed" },
    "edge-cluster-routing": { label: "NSX Edge Cluster and North-South Routing", outcome: "Implement the agreed Edge Cluster topology, north-south connectivity, and routing model for the target workload domains.", entryCondition: "edge placement, external connectivity, and routing ownership are confirmed", eligibility: { requiresAllFocuses: ["physical-fabric"] } },
    "overlay-transport": { label: "NSX Overlay Transport and Host Connectivity", outcome: "Roll out NSX transport, host connectivity, and overlay network services through a controlled delivery sequence.", entryCondition: "transport zones, host preparation sequencing, and workload-domain dependencies are confirmed", eligibility: { requiresAllFocuses: ["physical-fabric"] } },
    "network-operations": { label: "Networking and NSX Operating Model", outcome: "Establish shared networking and platform ownership, lifecycle practices, troubleshooting paths, and service handover.", entryCondition: "network and platform operating ownership, lifecycle roles, and support escalation paths are agreed" },
  },
  security: {
    segmentation: { label: "Segment Workloads in Prioritized Rollout Waves", outcome: "Apply and tune segmentation in prioritized workload waves with defined outcomes.", entryCondition: "wave scope, application dependencies, and change authority are confirmed", eligibility: { requiresObservedInventory: true } },
    "identity-rbac": { label: "Operate Access Governance and Role Recertification", outcome: "Operate access governance, role recertification, and privilege-exception handling.", entryCondition: "role owners, an operating cadence, and evidence requirements are confirmed" },
    "hardening-compliance": { label: "Continuous Compliance Evidence and Remediation", outcome: "Establish a drift and remediation workflow with usable compliance evidence for control owners.", entryCondition: "the control baseline, evidence consumer, and remediation authority are confirmed" },
  },
  resilience: {
    "recovery-architecture": { label: "Onboard Priority Workloads to Recovery Services", outcome: "Implement the recovery operating model for a selected protected-workload set.", entryCondition: "recovery targets, a secondary-site or tooling decision, and RTO/RPO are confirmed", eligibility: { requiresObservedInventory: true } },
    "recovery-exercises": { label: "Run Scheduled Recovery Exercises and Improve Runbooks", outcome: "Execute recurring, non-disruptive recovery exercises and improve the associated runbooks.", entryCondition: "a tested runbook, owners, and an agreed exercise scope exist", eligibility: { requiresAllFocuses: ["recovery-architecture"], requiresObservedInventory: true } },
    "cyber-recovery": { label: "Pilot an Isolated Cyber-Recovery Service", outcome: "Pilot an isolated recovery capability with operational entry and exit criteria.", entryCondition: "business sponsors, a recovery-data policy, and an isolated-recovery design are confirmed", eligibility: { requiresAllFocuses: ["recovery-architecture"], requiresObservedInventory: true } },
  },
  kubernetes: {
    "workload-domains": { label: "Pilot Kubernetes Workload Zones and Namespaces", outcome: "Onboard a governed Kubernetes pilot with namespaces, quotas, policy, and an initial workload.", entryCondition: "the Supervisor or workload-zone design, network and security controls, and a sponsored workload are confirmed" },
    "platform-operations": { label: "Operate the Kubernetes Fleet and Cluster Lifecycle", outcome: "Establish cluster lifecycle, fleet visibility, policy, data protection, and support ownership.", entryCondition: "a supported cluster estate and Kubernetes operating model are accepted", eligibility: { requiresAllFocuses: ["workload-domains"] } },
    "developer-experience": { label: "Create a Developer Self-Service Golden Path", outcome: "Provide a governed self-service path for a first development team, including deployment controls.", entryCondition: "an application team, GitOps or deployment workflow, and platform support model are confirmed", eligibility: { requiresAllFocuses: ["workload-domains"] } },
  },
  "private-ai": {
    "gpu-capacity": { label: "Plan GPU Capacity and Resilience for an AI Workload Domain", outcome: "Plan capacity, performance, backup and restore, and disaster-recovery needs for an approved GPU workload domain.", entryCondition: "GPU hardware, workload profile, sizing evidence, and a capacity owner are confirmed", eligibility: { requiresKnownHardwarePlan: true } },
    "ai-guardrails": { label: "Define Private AI Data Boundaries and Governance", outcome: "Define data access, model, security, audit, and operating guardrails for a candidate use case.", entryCondition: "a business use case, data classification, security owner, and governance authority are confirmed", eligibility: { requiresAllFocuses: ["gpu-capacity"], requiresKnownHardwarePlan: true } },
    "pilot-onboarding": { label: "Onboard One Private AI Pilot With Success Measures", outcome: "Onboard one approved pilot with success metrics, support ownership, and exit criteria.", entryCondition: "the use case, data boundary, GPU and platform foundation, and support model are approved", eligibility: { requiresAllFocuses: ["gpu-capacity", "ai-guardrails"], requiresKnownHardwarePlan: true } },
  },
};

function focusTitle(capability: Capability, focus: string): string {
  return focusLabels[capability][focus] || capabilityTitle(capability);
}

function humanList(values: string[]): string {
  if (values.length <= 1) return values[0] || "the selected focus";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function estateRecommendationSignal(fields: MinimalFields, inventory: InventorySummary): string | null {
  if (inventory.vmCount > 0 && inventory.hosts > 0) return `the imported estate shows ${inventory.vmCount.toLocaleString()} VMs across ${inventory.hosts.toLocaleString()} hosts`;
  if (inventory.vmCount > 0) return `the imported estate shows ${inventory.vmCount.toLocaleString()} VMs`;
  if (inventory.hosts > 0) return `the imported estate shows ${inventory.hosts.toLocaleString()} hosts`;
  if (fields.hardwareAvailability === "new") return "a new hardware path is confirmed";
  if (fields.hardwareAvailability === "existing") return "existing hardware is confirmed";
  return null;
}

function followOnBlockers(fields: MinimalFields, inventory: InventorySummary, capability: Capability, profile: FollowOnServiceProfile): string[] {
  const focuses = selectedFocuses(fields, capability);
  const eligibility = profile.eligibility;
  const estateSignal = estateRecommendationSignal(fields, inventory);
  const hasObservedInventory = inventory.vmCount > 0 || inventory.hosts > 0;
  const blockers: string[] = [];
  if (!estateSignal) blockers.push("Upload RVTools inventory or confirm Hardware availability as Existing or New in Plan Setup");
  if (eligibility?.requiresObservedInventory && !hasObservedInventory) blockers.push("Upload RVTools inventory with usable host or VM evidence");
  if (eligibility?.requiresKnownHardwarePlan && fields.hardwareAvailability === "unknown") blockers.push("Confirm Hardware availability as Existing or New in Plan Setup");
  const missingAll = (eligibility?.requiresAllFocuses || []).filter(required => !focuses.includes(required));
  if (missingAll.length) blockers.push(`Select ${humanList(missingAll.map(focus => focusTitle(capability, focus)))} under ${capabilityTitle(capability)}`);
  const hasSupportingAny = (eligibility?.requiresAnyFocus || []).some(required => focuses.includes(required));
  if (eligibility?.requiresAnyFocus?.length && !hasSupportingAny) blockers.push(`Select at least one of ${humanList(eligibility.requiresAnyFocus.map(focus => focusTitle(capability, focus)))} under ${capabilityTitle(capability)}`);
  return blockers.filter((item, index, values) => values.indexOf(item) === index);
}

function followOnRecommendationReason(fields: MinimalFields, inventory: InventorySummary, capability: Capability, focus: string, profile: FollowOnServiceProfile): string | null {
  const focuses = selectedFocuses(fields, capability);
  const eligibility = profile.eligibility;
  const estateSignal = estateRecommendationSignal(fields, inventory);
  if (followOnBlockers(fields, inventory, capability, profile).length) return null;
  const supportingAnyFocus = eligibility?.requiresAnyFocus?.find(required => focuses.includes(required));

  const contributingFocuses = [focus, ...(eligibility?.requiresAllFocuses || []), ...(supportingAnyFocus ? [supportingAnyFocus] : [])]
    .filter((item, index, values) => values.indexOf(item) === index)
    .map(item => focusTitle(capability, item));
  return `the customer selected ${humanList(contributingFocuses)} under the ${capabilityTitle(capability)} priority and ${estateSignal}`;
}

export type FollowOnReadinessGuidance = {
  blocked: boolean;
  title: string;
  detail: string;
  actions: string[];
};

export function getFollowOnReadinessGuidance(fields: MinimalFields, inventory: InventorySummary): FollowOnReadinessGuidance {
  if (!fields.priorities.length) {
    return {
      blocked: true,
      title: "Choose a customer outcome to unlock follow-on services.",
      detail: "Months 13–24 remain intentionally empty until at least one customer priority and its detailed capability focus are confirmed.",
      actions: ["In Plan Setup, select one or more Customer priorities.", "Choose a detailed capability focus beneath the selected priority."],
    };
  }

  const edition = effectivePlatformEdition(fields);
  const selectedProfiles = fields.priorities.flatMap(capability => selectedFocuses(fields, capability)
    .filter(focus => isPlanOutcomeAvailable(`${capability}:${focus}`, edition))
    .map(focus => ({ capability, focus, profile: followOnServiceProfiles[capability][focus] }))
    .filter((item): item is { capability: Capability; focus: string; profile: FollowOnServiceProfile } => Boolean(item.profile)));
  if (!selectedProfiles.length) {
    return {
      blocked: true,
      title: "Choose a detailed capability focus for the selected priority.",
      detail: `The selected ${humanList(fields.priorities.map(capabilityTitle))} outcome${fields.priorities.length === 1 ? " is" : "s are"} recorded, but no detailed focus has been selected to target a follow-on service.`,
      actions: ["Open Plan Setup and select a detailed capability focus under one of the chosen priorities."],
    };
  }

  const recommended = selectedProfiles.some(({ capability, focus, profile }) => Boolean(followOnRecommendationReason(fields, inventory, capability, focus, profile)));
  if (recommended) return { blocked: false, title: "", detail: "", actions: [] };

  const actions = selectedProfiles.flatMap(({ capability, profile }) => followOnBlockers(fields, inventory, capability, profile))
    .filter((item, index, values) => values.indexOf(item) === index);
  return {
    blocked: true,
    title: "Follow-on services are waiting on the inputs listed below.",
    detail: "The selected priority and detailed focus are retained; Months 13–24 will populate automatically when the remaining service prerequisites are confirmed.",
    actions: actions.length ? actions.map(action => `${action}.`) : ["Use the selected capability focus and estate evidence in Plan Setup."],
  };
}

function followOnActivities(fields: MinimalFields, inventory: InventorySummary, capability: Capability): Array<{ label: string; dependsOn: string; outcome: string }> {
  return selectedFocuses(fields, capability).flatMap(focus => {
    const profile = followOnServiceProfiles[capability][focus];
    if (!profile) return [];
    const reason = followOnRecommendationReason(fields, inventory, capability, focus, profile);
    if (!reason) return [];
    const prerequisite = `${focusTitle(capability, focus)} Plan`;
    return [{
      label: profile.label,
      outcome: profile.outcome,
      dependsOn: `Recommended because ${reason}. Start after ${prerequisite}, once ${profile.entryCondition}.`,
    }];
  });
}

/** Months from the first timeline month through the month the entitlement ends, or 0 when no entitlement end is known. */
function entitlementMonthCount(fields: MinimalFields): number {
  const end = parseIsoDate(entitlementLimitDate(fields));
  const start = parseIsoDate(timelineStartDate(fields));
  return end && start ? monthDifference(start, end) + 1 : 0;
}

function mirrorEntitlementLanes(adoptionTimeline: Timeline, columnCount: number): TimelineLane[] {
  // Weekly columns map to the calendar month each week falls in, so carried-over work keeps its real month.
  const firstWeek = parseIsoDate(adoptionTimeline.startDate);
  const monthOfWeek = (column: number) => firstWeek ? monthDifference(firstWeek, addUtcDays(firstWeek, (column - 1) * 7)) + 1 : column;
  const normalizeStart = (value: number) => adoptionTimeline.cadence === "week" ? Math.max(1, monthOfWeek(value)) : value;
  const normalizeEnd = (value: number) => adoptionTimeline.cadence === "week" ? Math.max(2, monthOfWeek(value - 1) + 1) : value;

  return adoptionTimeline.lanes.map(lane => ({
    id: lane.id,
    name: lane.category,
    category: lane.category,
    workstreamType: lane.workstreamType,
    bars: lane.bars.flatMap(item => {
      const startCol = Math.max(1, normalizeStart(item.startCol));
      const endCol = Math.min(columnCount + 1, Math.max(startCol + 1, normalizeEnd(item.endCol)));
      if (startCol > columnCount || endCol <= startCol) return [];
      return [{ ...item, startCol, endCol }];
    }),
  }));
}

function baselineEntitlementLanes(fields: MinimalFields, startColumn: number, columnCount: number): TimelineLane[] {
  if (startColumn > columnCount) return [];
  const end = columnCount + 1;
  const remainingColumns = Math.max(1, end - startColumn);
  const operatingModelStart = Math.min(columnCount, startColumn + Math.max(1, Math.floor(remainingColumns / 5)));
  const handoverStart = Math.min(columnCount, startColumn + Math.max(1, Math.floor((remainingColumns * 3) / 5)));
  const baseline: Array<{ id: string; category: TimelineCategory; workstreamType: WorkstreamType; start: number; end: number; label: string; outcome: string }> = [
    {
      id: "governance",
      category: "Program Management & Governance",
      workstreamType: "Governance",
      start: startColumn,
      end,
      label: "Delivery Governance and Value Tracking",
      outcome: "Maintain executive alignment, delivery ownership, adoption measures, and value tracking through the two-year planning horizon.",
    },
    {
      id: "operating-model",
      category: "Operations",
      workstreamType: "Operating Model / Platform",
      start: operatingModelStart,
      end,
      label: "Platform Operating Model and Lifecycle Adoption",
      outcome: "Embed platform lifecycle, service ownership, operational cadence, and consumption practices through the two-year planning horizon.",
    },
    {
      id: "handover",
      category: "Modernize Cloud",
      workstreamType: "Consume / Handover",
      start: handoverStart,
      end,
      label: "Service Consumption and Handover",
      outcome: "Complete service consumption, handover, and the next service-expansion decision within the two-year planning horizon.",
    },
  ];

  if (planRequiresNsx(fields)) {
    baseline.push({
      id: "networking-nsx",
      category: "Modernize Infrastructure",
      workstreamType: "Operating Model / Platform",
      start: startColumn,
      end,
      label: "VCF Networking and NSX Lifecycle Progression",
      outcome: "Continue the confirmed VCF networking and NSX platform operations, edge and overlay lifecycle planning, and network-service handover through entitlement end.",
    });
  }

  return baseline.map(item => ({
    id: `lane-two-year-baseline-${item.id}`,
    name: item.workstreamType,
    category: item.category,
    workstreamType: item.workstreamType,
    bars: [bar(`bar-two-year-baseline-${item.id}`, item.start, item.end, colorForWorkstreamType(item.workstreamType), item.label, false, false, undefined, item.outcome)],
  }));
}

function entitlementNotionalStartDate(fields: MinimalFields): string {
  // The entitlement view starts when delivery is planned to begin, then remains bounded by entitlement end.
  return timelineStartDate(fields);
}

function hasEntitlementAlignedNotional(timeline: Timeline, fields: MinimalFields): boolean {
  const notionalStart = entitlementNotionalStartDate(fields);
  const expectedColumns = buildTwoYearNotionalColumns(notionalStart);
  const columnsMatch = timeline.cadence === "month"
    && timeline.startDate === notionalStart
    && timeline.columns.length === expectedColumns.length
    && timeline.columns.every((column, index) => column === expectedColumns[index]);
  if (!columnsMatch) return false;
  if (!FIXED_GANTT_CATEGORIES.every(category => timeline.lanes.some(lane => lane.category === category))) return false;
  return timeline.lanes.flatMap(lane => lane.bars).some(activity => activity.id === "bar-platform-plan");
}

function buildTwoYearPlan(fields: MinimalFields, _inventory: InventorySummary, schedule: Timeline): Timeline {
  const startDate = entitlementNotionalStartDate(fields);
  const columns = buildTwoYearNotionalColumns(startDate);
  const lastEntitlementMonth = entitlementMonthCount(fields);
  const lanes: TimelineLane[] = mirrorEntitlementLanes(schedule, columns.length).map(lane => ({
    ...lane,
    bars: lane.bars.map(activity => lastEntitlementMonth && activity.startCol > lastEntitlementMonth && !activity.outcome?.includes(SCHEDULED_AFTER_ENTITLEMENT)
      ? { ...activity, outcome: [activity.outcome, SCHEDULED_AFTER_ENTITLEMENT].filter(Boolean).join(" ") }
      : activity),
  }));
  const implementationEnd = Math.max(1, ...lanes.flatMap(lane => lane.bars.map(activity => activity.endCol)));
  const continuationStart = Math.min(columns.length + 1, implementationEnd);

  if (continuationStart <= columns.length) {
    baselineEntitlementLanes(fields, continuationStart, columns.length).forEach(baselineLane => {
      const matchingLane = lanes.find(lane => lane.category === baselineLane.category && lane.workstreamType === baselineLane.workstreamType);
      if (matchingLane) matchingLane.bars.push(...baselineLane.bars);
      else lanes.push(baselineLane);
    });
  }

  return applyWorkstreamPresentation({ cadence: "month", startDate, columns, lanes });
}

export function buildAdoptionPlans(fields: MinimalFields, inventory: InventorySummary, providedHclPath?: HclSchedulePath): { adoptionTimeline: Timeline; twoYearPlan: Timeline; rationale: string } {
  const hclPath = providedHclPath ?? getHclSchedulePath(inventory);
  const playbookPlan = playbookPlanForFields(fields);
  // Schedule everything first, then cap the entitlement view; the Two-Year Notional carries what falls after it.
  const schedule = buildPrimaryTimeline(fields, inventory, hclPath);
  const adoptionTimeline = limitToEntitlement(fields, schedule);
  const twoYearPlan = buildTwoYearPlan(fields, inventory, schedule);
  const carriedToYearTwo = schedule.lanes.flatMap(lane => lane.bars).filter(activity => activity.startCol > adoptionTimeline.columns.length).length;
  const estate = inventory.vmCount ? `${inventory.vmCount.toLocaleString()} VMs across ${inventory.hosts.toLocaleString()} hosts` : "the imported estate";
  const amount = fields.entitlementAmount ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(fields.entitlementAmount) : "the confirmed entitlement value";
  const plannedProjectStart = timelineStartDate(fields);
  const entitlementEnd = entitlementNotionalEndDate(fields);
  const entitlementNotionalStart = entitlementNotionalStartDate(fields);
  const priorities = fields.priorities.length ? fields.priorities.map(capabilityTitle).join(", ") : "the selected customer outcomes";
  const cadence = fields.adoptionCadence === "week" ? "weekly execution windows" : "calendar-month execution windows";
  const detailCount = [fields.adoptionDetails.operations, fields.adoptionDetails.automation, fields.adoptionDetails.networking, fields.adoptionDetails.security, fields.adoptionDetails.resilience, fields.adoptionDetails.kubernetes, fields.adoptionDetails.privateAi].flat().length;
  const details = detailCount ? `${detailCount} selected detailed capability focus area${detailCount === 1 ? "" : "s"}` : "the initial customer outcome selections";
  const followOnCount = twoYearPlan.lanes.filter(lane => lane.id.startsWith("lane-follow-on-")).flatMap(lane => lane.bars).length;
  const followOnSummary = followOnCount
    ? `${followOnCount} selected follow-on service${followOnCount === 1 ? " is" : "s are"} placed across the directional two-year adoption horizon`
    : "continuing governance, operating-model, and handover work is shown across the directional two-year adoption horizon";
  const platformInventorySummary = buildPlatformInventoryActivity(inventory, fields.adoptionCadence, fields).outcome;
  const planningContext = planningInputContext(fields);
  const openingWindow = fields.adoptionCadence === "week" ? "the first two weeks" : "the first calendar month";
  const implementationStart = fields.plannedImplementationStart || plannedProjectStart;
  const implementationIsDeferred = Boolean(parseIsoDate(implementationStart) && parseIsoDate(plannedProjectStart) && implementationStart > plannedProjectStart);
  const customerContext = planningContext.customerNotes
    ? `Confirmed customer objectives or constraints are applied to sequencing and dependencies: “${planningContext.customerNotes}”.`
    : "No additional customer-specific objectives or constraints were recorded beyond the selected outcomes.";
  const timelineContext = planningContext.timelineNotes
    ? `Confirmed timeline notes are applied as execution conditions: “${planningContext.timelineNotes}”.`
    : "No additional timeline exceptions or sequencing conditions were recorded.";
  const industryContext = `The ${planningContext.template.label} industry discovery lens focuses mobilisation discussions on ${planningContext.industryThemes}; it informs the planning narrative only and does not add scope, priorities, or delivery activities.`;
  const hclContext = `The hardware compatibility check (HCL 2.0) result is ${hclPathLabel(hclPath)}; it sets the time allowed before platform build and is an offline precheck, not official certification.`;
  const designPackageSummary = playbookPlan.designPackages.map(item => item.title).join(", ");
  const implementationPackageSummary = playbookPlan.implementationPackages.map(item => item.title).join(", ");
  const migrationGateContext = playbookPlan.implementationPackages.length
    ? `Implementation begins only after the design package is accepted and hardware compatibility is confirmed. The approved execution sequence is ${implementationPackageSummary}. Selected component adoption begins after platform acceptance and may overlap later approved upgrade or migration waves where the workstreams are independent.`
    : "No implementation or migration work is generated until an execution pathway is approved; the current plan remains focused on design decisions and implementation-ready artifacts, followed by an execution decision, continuing design authority, and operating readiness through entitlement end.";
  const customer = fields.customerName || "The customer";
  const resolvedOutcomes = resolvePlanOutcomes(fields);
  const edition = resolvedOutcomes.edition;
  const editionName = edition === "vvf" ? "VVF" : "VCF";
  const editionContext = edition === "vvf"
    ? `The platform edition is VMware vSphere Foundation (VVF 9): vCenter, VCF Operations, VKS, and vSAN without NSX, VCF Automation, HCX, or Private AI Services.${resolvedOutcomes.excluded.length ? ` Selected outcomes that require VCF are left out of this plan: ${resolvedOutcomes.excluded.map(key => planOutcomeLabel(key)).join("; ")}.` : ""}`
    : "";
  const pulledIn = resolvedOutcomes.outcomes.filter(outcome => outcome.requiredBy.length);
  const yearTwoContext = carriedToYearTwo
    ? `${carriedToYearTwo} scheduled ${carriedToYearTwo === 1 ? "activity falls" : "activities fall"} after the entitlement ends and ${carriedToYearTwo === 1 ? "is" : "are"} carried in Year 2 of the Two-Year Notional.`
    : "";
  const prerequisiteContext = pulledIn.length
    ? `Prerequisites were added so selected outcomes can be delivered: ${pulledIn.map(outcome => `${planOutcomeLabel(outcome.key, edition)} (for ${outcome.requiredBy.map(key => planOutcomeLabel(key, edition)).join(", ")})`).join("; ")}.`
    : "";
  const deliveryTiming = implementationIsDeferred
    ? `Design and delivery-baseline work starts at the planned project start (${plannedProjectStart}), while implementation, upgrade, and migration services are planned to begin on ${implementationStart}. The gap is intentional and represents design, decision, dependency, procurement, and change-window preparation rather than idle delivery.`
    : `Design, delivery baseline, and implementation services are currently planned to begin at the planned project start (${plannedProjectStart}); change the implementation-services start when the customer is still in design or planning.`;
  const rationale = `${customer} is planning a ${editionName} adoption around ${estate}, ${cadence}, and ${details}. Delivery posture: ${deliveryTiming} The selected ${editionName} pathway is ${playbookPlan.label}. The generated design package is ${designPackageSummary}. ${playbookPlan.description} ${editionContext ? `${editionContext} ` : ""}${prerequisiteContext ? `${prerequisiteContext} ` : ""}${yearTwoContext ? `${yearTwoContext} ` : ""}${hclContext} ${migrationGateContext} ${customerContext} ${timelineContext} ${industryContext} ${platformInventorySummary} The Entitlement Adoption Timeline begins at the planned project start (${entitlementNotionalStart}) and sequences the planned drawdown through entitlement end (${entitlementEnd || "TBD"}) against ${amount}. The separate Two-Year Notional extends the directional adoption roadmap through month 24 and is not a commitment that all work is funded by the current entitlement; ${followOnSummary}. Multiple independently typed workstreams can coexist within the same fixed category, and every lane and activity can be renamed, moved, resized, added, or removed.`;
  return { adoptionTimeline, twoYearPlan, rationale };
}

export function buildTimeline(fields: MinimalFields, inventory: InventorySummary): { timeline: Timeline; rationale: string } {
  const plans = buildAdoptionPlans(fields, inventory);
  return { timeline: plans.adoptionTimeline, rationale: plans.rationale };
}

function platformId(vendor: string, model: string, cpuModel: string): string {
  return `${vendor}-${model}-${cpuModel}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function hardwarePlatformAssessment(platform: InventorySummary["hostModels"][number], targetRelease: HclCatalogRelease): HardwarePlatformAssessment {
  const vendor = platform.vendor.trim();
  const model = platform.model.trim();
  const cpuModel = platform.cpuModel.trim();
  const esxiVersions = Array.isArray(platform.esxiVersions) ? platform.esxiVersions : [];
  const esxiCorrelation = platform.esxiCorrelation || "unavailable";
  const clusterMembership = Array.isArray(platform.clusterMembership) ? platform.clusterMembership : [];
  const minimumMemoryGiB = Number.isFinite(platform.minimumMemoryGiB) ? platform.minimumMemoryGiB : 0;
  const maximumMemoryGiB = Number.isFinite(platform.maximumMemoryGiB) ? platform.maximumMemoryGiB : 0;
  const observedEsxi = esxiVersions.map(item => `${item.version}: ${item.hosts}`).join("; ");
  const esxiDetail = observedEsxi
    ? ` Observed ESXi ${observedEsxi}${esxiCorrelation === "estate-wide" ? " (estate-wide evidence; not uniquely correlated to this platform)" : ""}.`
    : " Per-platform ESXi version evidence was unavailable in the RVTools host rows.";
  const identifier = `${vendor} ${model}`.toLowerCase();
  const missingIdentity = !vendor || !model || /^unknown(?: vendor| model)?$/i.test(vendor) || /^unknown(?: vendor| model)?$/i.test(model);
  const currentDellPowerEdge = /\b(?:r760|r760xa|r760xs|r660|r860|r750|r650)\b/i.test(identifier);
  const legacyDellPowerEdge = /\b(?:r730|r530|r630|r430|r330|r720|r520|m630|m530|t630)\b/i.test(identifier);
  const hcl = assessHclPlatform(vendor, model, cpuModel, targetRelease);

  if (missingIdentity) {
    return {
      id: platformId(vendor || "unknown-vendor", model || "unknown-model", cpuModel || "unknown-cpu"),
      vendor: vendor || "Unknown vendor",
      model: model || "Unknown model",
      cpuModel: cpuModel || "Unknown CPU",
      hosts: platform.hosts,
      physicalCores: platform.physicalCores,
      esxiVersions,
      esxiCorrelation,
      clusterMembership,
      minimumMemoryGiB,
      maximumMemoryGiB,
      hcl,
      status: "unavailable",
      detail: `RVTools observed this host group but did not provide a usable vendor and model, so the plan begins with platform evidence collection before a ${targetRelease} path can be selected.${esxiDetail}`,
      nextAction: "Run the Platform Evidence Collection plan: collect the server make, model, CPU, BIOS, firmware, adapter, and storage-controller details before compatibility review.",
    };
  }

  if (legacyDellPowerEdge) {
    return {
      id: platformId(vendor, model, cpuModel),
      vendor,
      model,
      cpuModel: cpuModel || "Unknown CPU",
      hosts: platform.hosts,
      physicalCores: platform.physicalCores,
      esxiVersions,
      esxiCorrelation,
      clusterMembership,
      minimumMemoryGiB,
      maximumMemoryGiB,
      hcl,
      status: "upgrade-required",
      detail: `This legacy Dell PowerEdge generation has a replacement or exception decision plan for ${targetRelease}; it is not assumed to be an in-place upgrade target.${esxiDetail}`,
      nextAction: "Run the Replacement or Exception Decision plan: validate the exact configuration in the Broadcom Compatibility Guide and determine the replacement, repurpose, or exception path before Upgrade Services begins.",
    };
  }

  if (currentDellPowerEdge) {
    return {
      id: platformId(vendor, model, cpuModel),
      vendor,
      model,
      cpuModel: cpuModel || "Unknown CPU",
      hosts: platform.hosts,
      physicalCores: platform.physicalCores,
      esxiVersions,
      esxiCorrelation,
      clusterMembership,
      minimumMemoryGiB,
      maximumMemoryGiB,
      hcl,
      status: "candidate",
      detail: `This current-generation Dell PowerEdge model has a configuration compatibility confirmation plan; RVTools alone cannot establish a supported server configuration.${esxiDetail}`,
      nextAction: "Run the Compatibility Confirmation plan: validate the exact server, CPU, NIC, storage controller, firmware, driver, and vSAN/ReadyNode requirements in the Broadcom Compatibility Guide.",
    };
  }

  return {
    id: platformId(vendor, model, cpuModel),
    vendor,
    model,
    cpuModel: cpuModel || "Unknown CPU",
    hosts: platform.hosts,
    physicalCores: platform.physicalCores,
    esxiVersions,
    esxiCorrelation,
    clusterMembership,
    minimumMemoryGiB: platform.minimumMemoryGiB,
    maximumMemoryGiB: platform.maximumMemoryGiB,
    hcl,
    status: "review-required",
      detail: `RVTools provides a usable platform identity, so the plan starts with configuration compatibility confirmation; the server model alone cannot establish an official ${targetRelease} outcome.${esxiDetail}`,
    nextAction: "Run the Compatibility Confirmation plan: validate the exact server, CPU, adapters, storage controllers, firmware, drivers, and vSAN/ReadyNode requirements in the Broadcom Compatibility Guide.",
  };
}

export function assessHardwarePlatforms(inventory: InventorySummary, targetRelease: HclCatalogRelease = HCL_TARGET_RELEASE): HardwarePlatformAssessment[] {
  return inventory.hostModels.map(platform => hardwarePlatformAssessment(platform, targetRelease));
}

function extractEsxiMajorVersion(version: string): number | null {
  const text = version.trim();
  const explicitMatch = text.match(/\b(?:VMware\s+)?ESXi(?:\s+Version)?\s*[:=-]?\s*(\d+)(?:\.\d+){0,2}\b/i);
  const dottedMatch = text.match(/\b(\d+)\.\d+(?:\.\d+)?\b/);
  const bareMatch = text.match(/^(\d+)(?:\.\d+){0,2}(?:\b|$)/);
  const major = Number(explicitMatch?.[1] ?? dottedMatch?.[1] ?? bareMatch?.[1]);
  return Number.isInteger(major) && major >= 0 && major <= 99 ? major : null;
}

export function assessReadiness(fields: MinimalFields, inventory: InventorySummary, sourceWarnings: string[] = []): ReadinessAssessment {
  const items: ReadinessItem[] = [];
  items.push({
    id: "inventory-coverage",
    category: "inventory",
    status: inventory.hosts > 0 && inventory.vmCount > 0 ? (sourceWarnings.length ? "attention" : "good") : "attention",
    title: "RVTools Inventory Coverage",
    detail: inventory.hosts > 0 && inventory.vmCount > 0 ? `${inventory.sourceCount} export(s) provide ${inventory.hosts} unique hosts and ${inventory.vmCount} unique VMs.` : "No usable host and VM inventory has been imported.",
    evidence: sourceWarnings.length ? sourceWarnings.join(" ") : "Required vHost and vInfo data detected.",
  });

  const observedEsxiVersions = inventory.esxiVersions.map(item => ({ ...item, major: extractEsxiMajorVersion(item.version) }));
  const legacyHosts = observedEsxiVersions.filter(item => item.major !== null && item.major <= 7).reduce((sum, item) => sum + item.hosts, 0);
  const v8Hosts = observedEsxiVersions.filter(item => item.major === 8).reduce((sum, item) => sum + item.hosts, 0);
  const v9Hosts = observedEsxiVersions.filter(item => item.major !== null && item.major >= 9).reduce((sum, item) => sum + item.hosts, 0);
  const unclassifiedEsxiHosts = observedEsxiVersions.filter(item => item.major === null).reduce((sum, item) => sum + item.hosts, 0);
  const hasEsxiEvidence = observedEsxiVersions.length > 0;
  items.push({
    id: "software-baseline",
    category: "software",
    status: legacyHosts ? "attention" : v9Hosts ? "info" : v8Hosts ? "info" : hasEsxiEvidence ? "info" : "unknown",
    title: `${fields.compatibilityTargetRelease} Software Baseline Signal`,
    detail: legacyHosts
      ? `${legacyHosts} host(s) report ESXi 7.x or older.`
      : v9Hosts
        ? `${v9Hosts} host(s) report a 9.x or later ESXi baseline. This is a VCF 9.1 BOM-family signal, not confirmation of the required exact build, OEM image, or driver set.`
        : v8Hosts
          ? `${v8Hosts} host(s) report ESXi 8.x.`
          : hasEsxiEvidence
            ? `${unclassifiedEsxiHosts} host(s) report ESXi version data, but the major release could not be classified from the RVTools value.`
            : "ESXi versions were not available.",
    evidence: inventory.esxiVersions.map(item => `${item.version}: ${item.hosts}`).join("; ") || "No vHost version data",
  });

  const hardwarePlatforms = assessHardwarePlatforms(inventory, fields.compatibilityTargetRelease);
  const hcl = assessHclEstate(inventory.hclEvidence, new Date(), fields.compatibilityTargetRelease);
  const hclSchedulePath = hclSchedulePathForAssessment(inventory, hcl);
  const hclBlockers = hcl.findings.filter(finding => finding.severity === "BLOCKER");
  const hclWarnings = hcl.findings.filter(finding => finding.severity === "WARNING");
  const upgradeRequiredPlatforms = hardwarePlatforms.filter(platform => platform.status === "upgrade-required");
  const candidatePlatforms = hardwarePlatforms.filter(platform => platform.status === "candidate");
  const unavailablePlatforms = hardwarePlatforms.filter(platform => platform.status === "unavailable");
  const hclSupportedPlatforms = hardwarePlatforms.filter(platform => platform.hcl.status === "supported");
  const hclBlockingPlatforms = hardwarePlatforms.filter(platform => platform.hcl.status === "cpu-not-certified" || platform.hcl.status === "not-supported");
  const hclReviewPlatforms = hardwarePlatforms.filter(platform => ["supported-cpu-unverified", "review", "unknown"].includes(platform.hcl.status));
  items.push({
    id: "hardware-compatibility",
    category: "hardware",
    status: !hardwarePlatforms.length ? "attention" : upgradeRequiredPlatforms.length ? "attention" : unavailablePlatforms.length ? "unknown" : "info",
    title: `${fields.compatibilityTargetRelease} Hardware Platform Evidence`,
    detail: !hardwarePlatforms.length
      ? "Host vendor and model data are missing."
      : upgradeRequiredPlatforms.length
        ? `${upgradeRequiredPlatforms.reduce((sum, platform) => sum + platform.hosts, 0)} host(s) are on legacy platform generations that need a replacement or formal exception decision for ${fields.compatibilityTargetRelease} planning. ${candidatePlatforms.length ? `${candidatePlatforms.reduce((sum, platform) => sum + platform.hosts, 0)} host(s) remain candidate platforms pending exact configuration validation.` : ""}`
        : candidatePlatforms.length
          ? `${candidatePlatforms.reduce((sum, platform) => sum + platform.hosts, 0)} host(s) are on candidate platform generation(s); exact configuration validation is still required.`
          : "Every observed platform has a configuration compatibility confirmation plan; RVTools cannot determine final certification from server identity alone.",
    evidence: hardwarePlatforms.map(platform => `${platform.vendor} ${platform.model} (${platform.hosts}): ${platform.status}`).join("; ") || "No host model data",
  });

  const hclSupportedHosts = hclSupportedPlatforms.reduce((sum, platform) => sum + platform.hosts, 0);
  const hclBlockingHosts = hclBlockingPlatforms.reduce((sum, platform) => sum + platform.hosts, 0);
  const hclReviewHosts = hclReviewPlatforms.reduce((sum, platform) => sum + platform.hosts, 0);
  items.push({
    id: "server-cpu-hcl-snapshot",
    category: "hardware",
    status: !hardwarePlatforms.length ? "unknown" : hclBlockingPlatforms.length ? "attention" : hclReviewPlatforms.length ? "unknown" : "good",
    title: "Offline ESXi 9.1 Server HCL Snapshot",
    detail: !hardwarePlatforms.length
      ? "No usable vHost server cohorts are available for the offline HCL snapshot check."
      : hclBlockingPlatforms.length
        ? `${hclBlockingHosts} host(s) have a reported server-and-CPU pairing that is not listed for ESXi 9.1 in the supplied offline snapshot. Resolve the replacement, repurpose, or approved exception path before committing the VCF deployment baseline.`
        : hclReviewPlatforms.length
          ? `${hclReviewHosts} host(s) require CPU, vendor, or model confirmation before their server-and-CPU pairing can be relied upon. ${hclSupportedHosts ? `${hclSupportedHosts} host(s) have an exact model and CPU-series pairing in the same snapshot.` : ""}`
          : `${hclSupportedHosts} host(s) have an exact server-model and resolved CPU-series pairing in the supplied offline ESXi 9.1 snapshot. Complete the remaining configuration checks before deployment.`,
    evidence: hardwarePlatforms.map(platform => `${platform.vendor} ${platform.model} / ${platform.cpuModel || "CPU not reported"} (${platform.hosts}): ${platform.hcl.status}${platform.hcl.matchedCpuSeries ? ` — ${platform.hcl.matchedCpuSeries}` : ""}`).join("; ") || "No host model data",
  });

  const cohortByCluster = new Map<string, Set<string>>();
  const vendorByCluster = new Map<string, Set<string>>();
  for (const platform of hardwarePlatforms) {
    for (const membership of platform.clusterMembership || []) {
      const cohort = `${platform.vendor} ${platform.model} / ${platform.cpuModel}`;
      const cohorts = cohortByCluster.get(membership.name) || new Set<string>();
      const vendors = vendorByCluster.get(membership.name) || new Set<string>();
      cohorts.add(cohort);
      vendors.add(platform.vendor);
      cohortByCluster.set(membership.name, cohorts);
      vendorByCluster.set(membership.name, vendors);
    }
  }
  const clustersWithoutCohortEvidence = inventory.clusterProfiles.filter(cluster => !cohortByCluster.has(cluster.name));
  const crossVendorClusters = Array.from(vendorByCluster.entries()).filter(([, vendors]) => vendors.size > 1).map(([name]) => name);
  const mixedProfileClusters = Array.from(cohortByCluster.entries()).filter(([, cohorts]) => cohorts.size > 1).map(([name]) => name);
  items.push({
    id: "management-domain-cohort-uniformity",
    category: "hardware",
    status: !inventory.clusterProfiles.length || clustersWithoutCohortEvidence.length ? "unknown" : crossVendorClusters.length ? "attention" : mixedProfileClusters.length ? "attention" : "info",
    title: "Management-Domain Cohort Uniformity",
    detail: !inventory.clusterProfiles.length
      ? "RVTools did not provide cluster membership, so the prospective management-domain host cohort cannot be evaluated for the VCF 9.1 uniform-hardware and single-vendor requirement."
      : clustersWithoutCohortEvidence.length
        ? `${clustersWithoutCohortEvidence.length} observed cluster(s) lack usable vendor/model cohort evidence; select the management-domain hosts and collect the missing identities before design sign-off.`
        : crossVendorClusters.length
          ? `${crossVendorClusters.length} observed cluster(s) contain more than one hardware vendor. A VCF management domain must use hosts from one vendor, so choose a single-vendor cohort or remediate the topology before deployment.`
          : mixedProfileClusters.length
            ? `${mixedProfileClusters.length} observed cluster(s) contain more than one hardware profile. Confirm a uniform management-domain host cohort or document the remediation design before deployment.`
            : `${inventory.clusterProfiles.length} observed cluster(s) show one vendor and one hardware cohort in the imported host rows. This is useful selection evidence; the designated management-domain hosts still require exact compatibility confirmation.`,
    evidence: inventory.clusterProfiles.map(cluster => `${cluster.name}: ${cluster.hosts} hosts`).join("; ") || "No RVTools cluster membership data",
  });

  const clustersBelowThreeHosts = inventory.clusterProfiles.filter(cluster => cluster.hosts > 0 && cluster.hosts < 3);
  const threeHostClusters = inventory.clusterProfiles.filter(cluster => cluster.hosts === 3);
  const cohortsMissingMemory = hardwarePlatforms.filter(platform => !platform.minimumMemoryGiB || platform.minimumMemoryGiB <= 0);
  const observedMemory = hardwarePlatforms.filter(platform => platform.minimumMemoryGiB && platform.minimumMemoryGiB > 0).map(platform => `${platform.vendor} ${platform.model}: ${platform.minimumMemoryGiB.toLocaleString()}–${(platform.maximumMemoryGiB || platform.minimumMemoryGiB).toLocaleString()} GiB per host`);
  items.push({
    id: "deployment-topology-sizing-evidence",
    category: "planning",
    status: !inventory.clusterProfiles.length ? "unknown" : clustersBelowThreeHosts.length ? "attention" : cohortsMissingMemory.length ? "unknown" : "info",
    title: "VCF 9.1 Topology and N-1 Sizing Evidence",
    detail: !inventory.clusterProfiles.length
      ? "RVTools cluster membership is unavailable. The selected management-domain topology, storage model, host count, N-1 capacity, CPU, and RAM sizing inputs still need to be captured in the VCF Planning and Preparation Workbook."
      : clustersBelowThreeHosts.length
        ? `${clustersBelowThreeHosts.length} observed cluster(s) have fewer than three hosts. Validate the selected storage and availability design: the VCF 9.1 workbook describes two supported servers for a simple NFS/FC management domain, three for vSAN, and four for high availability. RVTools cannot establish which deployment model applies.`
        : cohortsMissingMemory.length
          ? `Cluster-size evidence is present, but ${cohortsMissingMemory.length} hardware cohort(s) lack per-host physical-memory evidence. Capture memory and validate the selected deployment model's N-1 sizing inputs in the VCF workbook; its example host memory values are not universal VCF minimums.`
          : threeHostClusters.length
            ? `${threeHostClusters.length} observed cluster(s) have three hosts, which is a vSAN minimum signal in the VCF workbook; it recommends at least four production nodes. Validate N-1 CPU and RAM sizing against the selected topology.`
            : `All ${inventory.clusterProfiles.length} observed cluster(s) have at least four hosts. Use the observed CPU and per-host memory ranges to validate the selected management-domain and workload-domain N-1 sizing model; this is planning evidence, not a deployment approval.`,
    evidence: `${inventory.clusterProfiles.map(cluster => `${cluster.name}: ${cluster.hosts} hosts`).join("; ") || "No cluster evidence"}${observedMemory.length ? ` | ${observedMemory.join("; ")}` : ""}`,
  });

  items.push({
    id: "hcl-2-estate-evidence",
    category: "planning",
    status: hclBlockers.length || hclWarnings.length ? "attention" : hcl.coverageGaps.length ? "unknown" : hcl.findings.length ? "good" : "unknown",
    title: "HCL 2.0 Estate Evidence",
    detail: !hcl.findings.length
      ? "No detailed RVTools evidence has been captured for the expanded HCL 2.0 checks. Import the available RVTools tabs to evaluate supported check families."
      : `${hcl.findings.length} RVTools-observable HCL 2.0 finding${hcl.findings.length === 1 ? "" : "s"} were recorded: ${hclBlockers.length} blocker${hclBlockers.length === 1 ? "" : "s"}, ${hclWarnings.length} warning${hclWarnings.length === 1 ? "" : "s"}, and ${hcl.coverageGaps.length} explicit coverage gap${hcl.coverageGaps.length === 1 ? "" : "s"}. The delivery path is ${hclPathLabel(hclSchedulePath)}.`,
    evidence: hcl.findings.length
      ? hcl.findings.slice(0, 8).map(finding => `${finding.severity}: ${finding.checkId} — ${finding.subject}`).join("; ")
      : "No detailed HCL evidence rows were available.",
  });

  const capacityAttention = inventory.highCpuHosts + inventory.highMemoryHosts + inventory.overcommittedDatastores;
  items.push({
    id: "capacity-signals",
    category: "capacity",
    status: capacityAttention ? "attention" : inventory.hosts ? "info" : "unknown",
    title: "Point-in-Time Capacity Signals",
    detail: capacityAttention ? `${inventory.highCpuHosts} high-CPU host(s), ${inventory.highMemoryHosts} high-memory host(s), and ${inventory.overcommittedDatastores} heavily provisioned datastore(s) were observed.` : "No simple point-in-time threshold exceptions were observed.",
    evidence: "RVTools provides a point-in-time inventory view.",
  });

  return {
    generatedAt: new Date().toISOString(),
    label: "Inventory-Informed VCF 9.1 Planning Considerations",
    items,
    hardwarePlatforms,
    hcl,
    hclSchedulePath,
    disclaimer: `These considerations summarize RVTools-observable inventory for planning. VCF 9.1 host preparation requires a release-note-supported ESX version, a uniform hardware profile, and one hardware vendor for the selected management domain. A candidate, upgrade-required, review-required, unavailable, or offline HCL snapshot result is not a VCF 9.1 certification. ${HCL_OFFLINE_LIMITATION} ${HCL_ESTATE_LIMITATION} Confirm the exact server, CPU, NIC, HBA/controller, firmware, driver, storage, vSAN/ReadyNode, stateless-installation status, licensing, sizing, architecture, networking, identity, and implementation requirements through the Broadcom Compatibility Guide, the VCF 9.1 Planning and Preparation Workbook, and the appropriate CDW and vendor processes.`,
  };
}

function migrateInventoryToV5(inventory: z.infer<typeof inventorySummaryV4Schema>): InventorySummary {
  return {
    ...inventory,
    hostModels: inventory.hostModels.map(platform => ({
      ...platform,
      esxiVersions: inventory.esxiVersions,
      esxiCorrelation: inventory.esxiVersions.length ? "estate-wide" as const : "unavailable" as const,
      clusterMembership: [],
      minimumMemoryGiB: 0,
      maximumMemoryGiB: 0,
    })),
    hclEvidence: emptyHclInventoryEvidence(),
  };
}

export function createDefaultDocument(): EngagementDocument {
  const fields = createDefaultFields();
  const inventory = emptyInventory();
  const readiness = assessReadiness(fields, inventory);
  const plans = buildAdoptionPlans(fields, inventory);
  return { version: 11, planAuthority: "generated", fields, inventorySources: [], inventory, readiness, adoptionTimeline: plans.adoptionTimeline, twoYearPlan: plans.twoYearPlan, rationale: plans.rationale };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function numberValue(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function migrateFieldsToV6(fields: z.infer<typeof minimalFieldsV5Schema>): z.infer<typeof minimalFieldsV6Schema> {
  const details = createDefaultAdoptionDetails();
  const { industryTemplate: _industryTemplate, ...legacyDetails } = details;
  return { ...fields, adoptionCadence: "month", adoptionDetails: legacyDetails };
}

function migrateFieldsToV7(fields: z.infer<typeof minimalFieldsV6Schema>): MinimalFields {
  return {
    ...fields,
    adoptionDetails: { ...fields.adoptionDetails, industryTemplate: "general-enterprise" },
    exportPreferences: { includeVcfReadiness: true, includeOperationalTimeline: true },
    compatibilityTargetRelease: HCL_TARGET_RELEASE,
    customerSegment: "unspecified",
  };
}

function canonicalWorkstreamType(value: unknown): WorkstreamType | null {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return legacyWorkstreamTypeAliases[raw] || null;
}

function canonicalTimelineCategory(value: unknown): TimelineCategory | null {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const aliases: Record<string, TimelineCategory> = {
    "program management & governance": "Program Management & Governance",
    "program management and governance": "Program Management & Governance",
    "hardware refresh": "Modernize Infrastructure",
    "modernize cloud": "Modernize Cloud",
    "operations": "Operations",
    "modernize infrastructure": "Modernize Infrastructure",
    "modernize security & reliance": "Modernize Security & Resilience",
    "modernize security and reliance": "Modernize Security & Resilience",
    "modernize security & resilience": "Modernize Security & Resilience",
    "modernize app platform & ai": "Modernize Cloud",
    "modernize app platform and ai": "Modernize Cloud",
  };
  if (aliases[raw]) return aliases[raw];
  if (/(program|govern)/.test(raw)) return "Program Management & Governance";
  if (/hardware/.test(raw)) return "Modernize Infrastructure";
  if (/modernize.*cloud|cloud/.test(raw)) return "Modernize Cloud";
  if (/operations?/.test(raw)) return "Operations";
  if (/infrastructure/.test(raw)) return "Modernize Infrastructure";
  if (/(security|reliance|resilience)/.test(raw)) return "Modernize Security & Resilience";
  if (/(app|platform|ai)/.test(raw)) return "Modernize Cloud";
  return null;
}

function normalizeRawTimelineTaxonomy(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const document = value as Record<string, unknown>;
  const normalizeTimeline = (timeline: unknown) => {
    if (!timeline || typeof timeline !== "object") return timeline;
    const candidate = timeline as Record<string, unknown>;
    if (!Array.isArray(candidate.lanes)) return timeline;
    return {
      ...candidate,
      lanes: candidate.lanes.map(lane => {
        if (!lane || typeof lane !== "object") return lane;
        const rawLane = lane as Record<string, unknown>;
        const inferred = typeof rawLane.id === "string" ? inferredLaneMetadata(rawLane.id) : null;
        const category = inferred?.category || canonicalTimelineCategory(rawLane.category) || DEFAULT_TIMELINE_LANE_METADATA.category;
        const workstreamType = canonicalWorkstreamType(rawLane.workstreamType) || inferred?.workstreamType || DEFAULT_TIMELINE_LANE_METADATA.workstreamType;
        return { ...rawLane, category, workstreamType, name: workstreamType, bars: Array.isArray(rawLane.bars) ? rawLane.bars.map(bar => {
          const rawBar = bar as Record<string, unknown>;
          const label = typeof rawBar.label === "string"
            ? rawBar.label.replace("Mobilize and Freeze VCF Delivery Baseline", "Mobilize and Establish Delivery Baseline")
            : rawBar.label;
          return { ...rawBar, label, color: colorForWorkstreamType(workstreamType), deferred: false };
        }) : rawLane.bars };
      }),
    };
  };
  return {
    ...document,
    adoptionTimeline: normalizeTimeline(document.adoptionTimeline),
    twoYearPlan: normalizeTimeline(document.twoYearPlan),
  };
}

function needsImplementationTimelineRebaseline(timeline: Timeline): boolean {
  const requiredFixedLaneIds = [
    "lane-program-governance",
    "lane-modernize-infrastructure-build",
    "lane-modernize-infrastructure-migration",
    "lane-operations",
    "lane-cloud",
    "lane-security-resilience",
  ];
  return requiredFixedLaneIds.some(laneId => !timeline.lanes.some(lane => lane.id === laneId));
}

function needsPlaybookCategoryRebaseline(timeline: Timeline, fields: MinimalFields): boolean {
  const plan = playbookPlanForFields(fields);
  const laneForActivity = (activityId: string) => timeline.lanes.find(lane => lane.bars.some(activity => activity.id === activityId));
  const hasExpectedOwnership = (activityId: string, ownership: VcfPlaybookOwnership) => {
    const lane = laneForActivity(activityId);
    return Boolean(lane && lane.category === ownership.category && lane.workstreamType === ownership.workstreamType);
  };

  for (const workPackage of [...plan.designPackages, ...plan.implementationPackages]) {
    const prefix = workPackage.phase === "Implementation" ? "bar-playbook-execution" : workPackage.phase === "Adoption" ? "bar-playbook-adoption" : "bar-playbook-design";
    const activityId = `${prefix}-${workPackage.id}`;
    if (plan.path === "converge" && workPackage.id === "converge") continue;
    if (plan.path === "import-workload-domain" && workPackage.id === "import") continue;
    if (plan.path === "greenfield" && workPackage.id === "foundation") continue;
    if (!hasExpectedOwnership(activityId, getVcfPlaybookWorkPackageOwnership(plan.path, workPackage))) return true;
  }

  for (const capability of fields.priorities) {
    if (!hasExpectedOwnership(`bar-playbook-component-design-${capability}`, getVcfComponentDesignOwnership(capability))) return true;
  }
  if (fields.adoptionDetails.componentDepths.efficiency !== "not-selected" && !hasExpectedOwnership("bar-playbook-component-design-efficiency", INFRASTRUCTURE_DESIGN_OWNERSHIP)) return true;
  if (plan.path === "import-workload-domain" && !hasExpectedOwnership("bar-import-workload-domain", INFRASTRUCTURE_WAVE_OWNERSHIP)) return true;
  return false;
}

function normalizePlanningDates(fields: MinimalFields): MinimalFields {
  const entitlementEnd = calculateEntitlementEndDate(fields.entitlementStart);
  const plannedProjectStart = fields.plannedProjectStart || fields.targetStart || fields.entitlementStart;
  const plannedImplementationStart = fields.plannedImplementationStart || plannedProjectStart;
  const upgradePath = canonicalVcfDeliveryPath(fields.adoptionDetails.upgradePath);
  return {
    ...fields,
    adoptionDetails: { ...fields.adoptionDetails, upgradePath },
    ...(entitlementEnd ? { entitlementEnd } : {}),
    ...(plannedProjectStart ? { plannedProjectStart } : {}),
    ...(plannedImplementationStart ? { plannedImplementationStart } : {}),
  };
}

function timelineSignature(timeline: Timeline): string {
  return JSON.stringify({ cadence: timeline.cadence, startDate: timeline.startDate, columns: timeline.columns, lanes: timeline.lanes });
}

function inferredPlanAuthority(value: unknown, document: EngagementDocument, generated: { adoptionTimeline: Timeline; twoYearPlan: Timeline }): PlanAuthority {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (raw.planAuthority === "manual" || raw.planAuthority === "generated") return raw.planAuthority;
  return timelineSignature(document.adoptionTimeline) === timelineSignature(generated.adoptionTimeline)
    && timelineSignature(document.twoYearPlan) === timelineSignature(generated.twoYearPlan)
    ? "generated"
    : "manual";
}

export function migrateDocument(value: unknown): EngagementDocument {
  const normalizedValue = normalizeRawTimelineTaxonomy(value);
  const current = engagementDocumentV11Schema.safeParse(normalizedValue);
  if (current.success) {
    const fields = normalizePlanningDates(current.data.fields);
    const generated = buildAdoptionPlans(fields, current.data.inventory);
    const planAuthority = inferredPlanAuthority(normalizedValue, current.data, generated);
    if ((needsImplementationTimelineRebaseline(current.data.adoptionTimeline) || needsPlaybookCategoryRebaseline(current.data.adoptionTimeline, fields)) && planAuthority !== "manual") {
      return {
        ...current.data,
        planAuthority: "generated",
        fields,
        readiness: assessReadiness(
          fields,
          current.data.inventory,
          current.data.inventorySources.flatMap(source => source.warnings),
        ),
        adoptionTimeline: generated.adoptionTimeline,
        twoYearPlan: generated.twoYearPlan,
        rationale: generated.rationale,
      };
    }

    const adoptionTimeline = withoutUnselectedGeneratedNetworking(
      normalizeTimelineTaxonomy(withConsolidatedPlatformInventory(current.data.adoptionTimeline, current.data.inventory)),
      fields,
    );
    const candidateTwoYearPlan = withoutUnselectedGeneratedNetworking(
      normalizeTimelineTaxonomy(withoutLegacyHostPlatformTwoYearLanes(current.data.twoYearPlan)),
      fields,
    );
    const twoYearPlan = planAuthority === "manual" || hasEntitlementAlignedNotional(candidateTwoYearPlan, fields)
      ? candidateTwoYearPlan
      : generated.twoYearPlan;
    return {
      ...current.data,
      planAuthority,
      fields,
      readiness: assessReadiness(
        fields,
        current.data.inventory,
        current.data.inventorySources.flatMap(source => source.warnings),
      ),
      adoptionTimeline,
      twoYearPlan,
      rationale: generated.rationale,
    };
  }

  const v10 = engagementDocumentV10Schema.safeParse(normalizedValue);
  if (v10.success) {
    const fields = normalizePlanningDates(v10.data.fields);
    const plans = buildAdoptionPlans(fields, v10.data.inventory);
    return {
      version: 11,
      planAuthority: "generated",
      fields,
      inventorySources: v10.data.inventorySources,
      inventory: v10.data.inventory,
      readiness: assessReadiness(fields, v10.data.inventory, v10.data.inventorySources.flatMap(source => source.warnings)),
      adoptionTimeline: plans.adoptionTimeline,
      twoYearPlan: plans.twoYearPlan,
      rationale: plans.rationale,
    };
  }

  const v9 = engagementDocumentV9Schema.safeParse(normalizedValue);
  if (v9.success) {
    const fields = normalizePlanningDates(v9.data.fields);
    const plans = buildAdoptionPlans(fields, v9.data.inventory);
    return {
      version: 11,
      planAuthority: "generated",
      fields,
      inventorySources: v9.data.inventorySources,
      inventory: v9.data.inventory,
      readiness: assessReadiness(fields, v9.data.inventory, v9.data.inventorySources.flatMap(source => source.warnings)),
      adoptionTimeline: plans.adoptionTimeline,
      twoYearPlan: plans.twoYearPlan,
      rationale: plans.rationale,
    };
  }

  const v8 = engagementDocumentV8Schema.safeParse(normalizedValue);
  if (v8.success) {
    const fields = normalizePlanningDates(v8.data.fields);
    const plans = buildAdoptionPlans(fields, v8.data.inventory);
    return {
      version: 11,
      planAuthority: "generated",
      fields,
      inventorySources: v8.data.inventorySources,
      inventory: v8.data.inventory,
      readiness: assessReadiness(fields, v8.data.inventory, v8.data.inventorySources.flatMap(source => source.warnings)),
      adoptionTimeline: plans.adoptionTimeline,
      twoYearPlan: plans.twoYearPlan,
      rationale: plans.rationale,
    };
  }

  const v7 = engagementDocumentV7Schema.safeParse(normalizedValue);
  if (v7.success) {
    const fields = normalizePlanningDates(v7.data.fields);
    const plans = buildAdoptionPlans(fields, v7.data.inventory);
    return {
      version: 11,
      planAuthority: "generated",
      fields,
      inventorySources: v7.data.inventorySources,
      inventory: v7.data.inventory,
      readiness: assessReadiness(fields, v7.data.inventory, v7.data.inventorySources.flatMap(source => source.warnings)),
      adoptionTimeline: plans.adoptionTimeline,
      twoYearPlan: plans.twoYearPlan,
      rationale: plans.rationale,
    };
  }

  const v6 = engagementDocumentV6Schema.safeParse(normalizedValue);
  if (v6.success) {
    const fields = normalizePlanningDates(migrateFieldsToV7(v6.data.fields));
    const plans = buildAdoptionPlans(fields, v6.data.inventory);
    return {
      version: 11,
      planAuthority: "generated",
      fields,
      inventorySources: v6.data.inventorySources,
      inventory: v6.data.inventory,
      readiness: assessReadiness(fields, v6.data.inventory, v6.data.inventorySources.flatMap(source => source.warnings)),
      adoptionTimeline: plans.adoptionTimeline,
      twoYearPlan: plans.twoYearPlan,
      rationale: plans.rationale,
    };
  }

  const v5 = engagementDocumentV5Schema.safeParse(normalizedValue);
  if (v5.success) {
    const fields = normalizePlanningDates(migrateFieldsToV7(migrateFieldsToV6(v5.data.fields)));
    const plans = buildAdoptionPlans(fields, v5.data.inventory);
    return {
      version: 11,
      planAuthority: "generated",
      fields,
      inventorySources: v5.data.inventorySources,
      inventory: v5.data.inventory,
      readiness: assessReadiness(fields, v5.data.inventory, v5.data.inventorySources.flatMap(source => source.warnings)),
      adoptionTimeline: plans.adoptionTimeline,
      twoYearPlan: plans.twoYearPlan,
      rationale: plans.rationale,
    };
  }

  const v4 = engagementDocumentV4Schema.safeParse(normalizedValue);
  if (v4.success) {
    const inventory = migrateInventoryToV5(v4.data.inventory);
    const fields = normalizePlanningDates(migrateFieldsToV7(migrateFieldsToV6(v4.data.fields)));
    const warnings = v4.data.inventorySources.flatMap(source => source.warnings);
    const plans = buildAdoptionPlans(fields, inventory);
    return {
      version: 11,
      planAuthority: "generated",
      fields,
      inventorySources: v4.data.inventorySources,
      inventory,
      readiness: assessReadiness(fields, inventory, warnings),
      adoptionTimeline: plans.adoptionTimeline,
      twoYearPlan: plans.twoYearPlan,
      rationale: plans.rationale,
    };
  }

  const v3 = engagementDocumentV3Schema.safeParse(normalizedValue);
  if (v3.success) {
    const inventory = migrateInventoryToV5(v3.data.inventory);
    const fields = normalizePlanningDates(migrateFieldsToV7(migrateFieldsToV6(v3.data.fields)));
    const warnings = v3.data.inventorySources.flatMap(source => source.warnings);
    const plans = buildAdoptionPlans(fields, inventory);
    return {
      version: 11,
      planAuthority: "generated",
      fields,
      inventorySources: v3.data.inventorySources,
      inventory,
      readiness: assessReadiness(fields, inventory, warnings),
      adoptionTimeline: plans.adoptionTimeline,
      twoYearPlan: plans.twoYearPlan,
      rationale: plans.rationale,
    };
  }

  const legacy = (normalizedValue && typeof normalizedValue === "object" ? normalizedValue : {}) as Record<string, unknown>;
  const oldFields = (legacy.fields && typeof legacy.fields === "object" ? legacy.fields : {}) as Record<string, unknown>;
  let fields: MinimalFields = {
    ...createDefaultFields(),
    customerName: stringValue(oldFields.customerName),
    accountId: stringValue(oldFields.accountId || oldFields.cust),
    location: stringValue(oldFields.location || oldFields.cityState || oldFields.city),
    primaryContact: stringValue(oldFields.primaryContact),
    entitlementAmount: numberValue(oldFields.entitlementAmount || oldFields.entitlementValue || oldFields.funds),
    entitlementStart: stringValue(oldFields.entitlementStart || oldFields.termStart),
    entitlementEnd: stringValue(oldFields.entitlementEnd || oldFields.entitlementEndDate || oldFields.termEnd),
    plannedProjectStart: stringValue(oldFields.plannedProjectStart || oldFields.projectPlannedStart || oldFields.targetStart || oldFields.kickoffDate),
    plannedImplementationStart: stringValue(oldFields.plannedImplementationStart || oldFields.implementationStart || oldFields.upgradeStart || oldFields.targetStart || oldFields.kickoffDate),
    targetStart: stringValue(oldFields.targetStart || oldFields.kickoffDate),
    targetComplete: stringValue(oldFields.targetComplete || oldFields.termEnd),
    hardwareAvailability: oldFields.hardwareAvailability === "existing" || oldFields.hardwareAvailability === "new" || oldFields.hardwareAvailability === "unknown" ? oldFields.hardwareAvailability : oldFields.hardwareIsNetNew === true ? "new" : oldFields.hardwareIsNetNew === false ? "existing" : "unknown",
    hardwareLeadWeeks: numberValue(oldFields.hardwareLeadWeeks) || numberValue(oldFields.hardwareLeadMonths) * 4,
    priorities: Array.isArray(oldFields.priorities) ? capabilitySchema.array().catch([]).parse(oldFields.priorities) : ["operations", "automation", ...(oldFields.vdefendInScope ? ["security" as const] : []), ...(oldFields.drInScope ? ["resilience" as const] : []), ...(oldFields.k8sInScope ? ["kubernetes" as const] : [])],
    timelineNotes: stringValue(oldFields.timelineNotes || oldFields.notes),
  };
  fields = normalizePlanningDates(fields);
  const parsedInventory = inventorySummaryV4Schema.safeParse(legacy.inventory);
  const inventory = parsedInventory.success ? migrateInventoryToV5(parsedInventory.data) : emptyInventory();
  if (!parsedInventory.success) {
    inventory.vmCount = numberValue(oldFields.vmCount);
    inventory.poweredOnVms = inventory.vmCount;
    inventory.hosts = numberValue(oldFields.hostCount);
    inventory.clusters = numberValue(oldFields.clusterCount);
    inventory.datacenters = numberValue(oldFields.siteCount);
  }
  const parsedSources = z.array(inventorySourceSchema).safeParse(legacy.inventorySources);
  const plans = buildAdoptionPlans(fields, inventory);
  return {
    version: 11,
    planAuthority: "generated",
    fields,
    inventorySources: parsedSources.success ? parsedSources.data : [],
    inventory,
    readiness: assessReadiness(fields, inventory, ["Existing engagement updated to the detailed adoption-intake and cadence-aware plan format."]),
    adoptionTimeline: plans.adoptionTimeline,
    twoYearPlan: plans.twoYearPlan,
    rationale: plans.rationale,
  };
}

export const engagementDocumentSchema = z.preprocess(migrateDocument, engagementDocumentV11Schema);

export function refreshDerivedDocument(document: EngagementDocument, options: { forceRebuild?: boolean } = {}): EngagementDocument {
  const warnings = document.inventorySources.flatMap(source => source.warnings);
  // Assessment can be expensive for large RVTools estates. Calculate it once and share its path with timeline generation.
  const readiness = assessReadiness(document.fields, document.inventory, warnings);
  const plans = buildAdoptionPlans(document.fields, document.inventory, readiness.hclSchedulePath);
  if (document.planAuthority === "manual" && !options.forceRebuild) {
    return { ...document, readiness, rationale: plans.rationale };
  }
  return { ...document, planAuthority: "generated", readiness, adoptionTimeline: plans.adoptionTimeline, twoYearPlan: plans.twoYearPlan, rationale: plans.rationale };
}

/**
 * Applies operational schedule changes to the corresponding entitlement-bounded work only.
 * Independent Notional-only bars (for example governance, handover, and explicitly added bars)
 * remain intact, so synchronizing the operational horizon cannot discard manual entitlement work.
 */
export function synchronizeEntitlementNotionalFromOperational(document: EngagementDocument, adoptionTimeline: Timeline): EngagementDocument {
  const startDate = entitlementNotionalStartDate(document.fields);
  const columns = buildTwoYearNotionalColumns(startDate, entitlementNotionalEndDate(document.fields));
  const mirroredLanes = mirrorEntitlementLanes(adoptionTimeline, columns.length);
  const priorOperationalIds = new Set(document.adoptionTimeline.lanes.flatMap(lane => lane.bars.map(item => item.id)));
  const nextOperationalIds = new Set(adoptionTimeline.lanes.flatMap(lane => lane.bars.map(item => item.id)));
  const synchronizedBarIds = new Set(Array.from(priorOperationalIds).concat(Array.from(nextOperationalIds)));
  const lanesById = new Map(document.twoYearPlan.lanes.map(lane => [lane.id, { ...lane, bars: lane.bars.filter(item => !synchronizedBarIds.has(item.id)) }]));
  const orderedLaneIds = document.twoYearPlan.lanes.map(lane => lane.id);

  // An activity cut at entitlement end keeps the Year 2 remainder it already had in the notional.
  const priorNotionalEnds = new Map(document.twoYearPlan.lanes.flatMap(lane => lane.bars.map(item => [item.id, item.endCol] as const)));
  const lastEntitlementMonth = entitlementMonthCount(document.fields);
  mirroredLanes.forEach(mirroredLane => {
    mirroredLane.bars = mirroredLane.bars.map(item => {
      const priorEnd = priorNotionalEnds.get(item.id);
      return lastEntitlementMonth && item.endCol >= lastEntitlementMonth + 1 && priorEnd && priorEnd > item.endCol ? { ...item, endCol: priorEnd } : item;
    });
    const existing = lanesById.get(mirroredLane.id);
    if (existing) {
      existing.name = mirroredLane.name;
      existing.category = mirroredLane.category;
      existing.workstreamType = mirroredLane.workstreamType;
      existing.bars.push(...mirroredLane.bars);
    } else {
      lanesById.set(mirroredLane.id, { ...mirroredLane, bars: [...mirroredLane.bars] });
      orderedLaneIds.push(mirroredLane.id);
    }
  });

  const lanes = orderedLaneIds
    .map(id => lanesById.get(id))
    .filter((lane): lane is TimelineLane => Boolean(lane && lane.bars.length));
  return {
    ...document,
    planAuthority: "manual",
    adoptionTimeline,
    twoYearPlan: applyWorkstreamPresentation({ cadence: "month", startDate, columns, lanes }),
  };
}

export function validateTimeline(timeline: Timeline): string[] {
  const errors: string[] = [];
  const maxEnd = timeline.columns.length + 1;
  for (const lane of timeline.lanes) {
    const sorted = [...lane.bars].sort((a, b) => a.startCol - b.startCol);
    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index];
      if (current.endCol <= current.startCol || current.endCol > maxEnd) errors.push(`${lane.name}: “${current.label}” is outside the timeline grid.`);
    }
  }
  return errors;
}

/**
 * Ordering warnings for activities that start before a prerequisite activity finishes.
 * Prerequisites that are no longer in the timeline are ignored; this never blocks editing.
 */
export function validateTimelineSequence(timeline: Timeline): string[] {
  const activities = new Map(timeline.lanes.flatMap(lane => lane.bars).map(activity => [activity.id, activity]));
  const warnings: string[] = [];
  for (const activity of Array.from(activities.values())) {
    for (const prerequisiteId of activity.prerequisites ?? []) {
      const prerequisite = activities.get(prerequisiteId);
      if (prerequisite && activity.startCol < prerequisite.endCol) warnings.push(`“${activity.label}” starts before its prerequisite “${prerequisite.label}” finishes.`);
    }
  }
  return warnings;
}

export type TimelineGestureMode = "move" | "start" | "end";

export function applyTimelineGesture(timeline: Timeline, laneId: string, barId: string, mode: TimelineGestureMode, deltaMonths: number): Timeline {
  if (!deltaMonths) return timeline;
  const lane = timeline.lanes.find(item => item.id === laneId);
  const current = lane?.bars.find(item => item.id === barId);
  if (!lane || !current) return timeline;

  const maxEnd = timeline.columns.length + 1;
  let startCol = current.startCol;
  let endCol = current.endCol;
  if (mode === "move") {
    startCol += deltaMonths;
    endCol += deltaMonths;
  } else if (mode === "start") {
    startCol += deltaMonths;
  } else {
    endCol += deltaMonths;
  }

  if (startCol < 1 || endCol > maxEnd || endCol <= startCol) return timeline;
  const candidate = { ...current, startCol, endCol };

  return {
    ...timeline,
    lanes: timeline.lanes.map(item => item.id === laneId
      ? { ...item, bars: item.bars.map(bar => bar.id === barId ? candidate : bar) }
      : item),
  };
}
