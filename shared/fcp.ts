import { z } from "zod";
import { getIndustryDiscoveryTemplate, industryDiscoveryPromptBlock } from "./industryDiscovery";
import { assessHclEstate, assessHclPlatform, emptyHclInventoryEvidence, hclAssessmentSchema, hclFindingSchedulePath, hclInventoryEvidenceSchema, hclSchedulePath, HCL_ESTATE_LIMITATION, HCL_EVALUATION_VERSION, HCL_OFFLINE_LIMITATION, HCL_SNAPSHOT, type HclSchedulePath } from "./hcl";

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

export const capabilitySchema = z.enum(["operations", "automation", "networking", "security", "resilience", "kubernetes", "private-ai"]);
export type Capability = z.infer<typeof capabilitySchema>;

export const upgradePathSchema = z.enum(["undecided", "in-place", "new-build", "migration-waves", "design-only"]);
export type UpgradePath = z.infer<typeof upgradePathSchema>;

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
const automationFocusSchema = z.enum(["vm-self-service", "infrastructure-as-code", "day-2-automation", "governance", "application-provisioning"]);
const networkingFocusSchema = z.enum(["physical-fabric", "edge-cluster-routing", "overlay-transport", "network-operations"]);
const securityFocusSchema = z.enum(["segmentation", "identity-rbac", "hardening-compliance"]);
const resilienceFocusSchema = z.enum(["recovery-architecture", "recovery-exercises", "cyber-recovery"]);
const kubernetesFocusSchema = z.enum(["workload-domains", "platform-operations", "developer-experience"]);
const privateAiFocusSchema = z.enum(["gpu-capacity", "ai-guardrails", "pilot-onboarding"]);
const softPrerequisiteSchema = z.enum(["dns-ntp", "ip-pools", "tor-switch-design"]);

const adoptionDetailsV6Schema = z.object({
  upgradePath: upgradePathSchema,
  operations: z.array(operationsFocusSchema).max(6),
  automation: z.array(automationFocusSchema).max(5),
  networking: z.array(networkingFocusSchema).max(4).default([]),
  security: z.array(securityFocusSchema).max(3),
  resilience: z.array(resilienceFocusSchema).max(3),
  kubernetes: z.array(kubernetesFocusSchema).max(3),
  privateAi: z.array(privateAiFocusSchema).max(3),
  /** Optional Red-path work that can run in parallel with procurement. */
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
  entitledCores: z.number().int().min(0).max(10_000_000),
  entitlementAmount: z.number().min(0).max(1_000_000_000_000),
  entitlementStart: z.string(),
  entitlementEnd: z.string(),
  /** Independently persisted delivery date; legacy targetStart remains a compatibility fallback. */
  plannedProjectStart: z.string().default(""),
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

export const minimalFieldsSchema = minimalFieldsV5Schema.extend({
  adoptionCadence: timelineCadenceSchema,
  adoptionDetails: adoptionDetailsSchema,
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
};

export const hclPlatformAssessmentSchema = z.object({
  targetRelease: z.literal("ESXi 9.1"),
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
export const engagementDocumentV11Schema = z.object({
  version: z.literal(11),
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
    entitledCores: 0,
    entitlementAmount: 0,
    entitlementStart: "",
    entitlementEnd: "",
    plannedProjectStart: "",
    targetStart: "",
    targetComplete: "",
    hardwareAvailability: "unknown",
    hardwareLeadWeeks: 0,
    priorities: ["operations", "automation"],
    timelineNotes: "",
    adoptionCadence: "month",
    adoptionDetails: createDefaultAdoptionDetails(),
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

export function buildTwoYearNotionalColumns(serviceStartValue: string, entitlementEndValue = ""): string[] {
  const start = parseMonth(serviceStartValue) || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const end = parseMonth(entitlementEndValue);
  const requested = end && end >= start ? monthDifference(start, end) + 1 : 12;
  const count = Math.max(2, Math.min(36, requested));
  return Array.from({ length: count }, (_, index) => displayMonth(addUtcMonths(start, index)));
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
  return {
    ...fields,
    ...patch,
    // Entitlement changes affect only the calculated entitlement end. Planned delivery dates remain independent.
    entitlementEnd: nextEntitlementEnd,
  };
}

function entitlementNotionalEndDate(fields: MinimalFields): string {
  return calculateEntitlementEndDate(fields.entitlementStart) || fields.entitlementEnd;
}

function primaryColumns(fields: MinimalFields): string[] {
  const start = timelineStartDate(fields);
  const end = timelineEndDate(fields);
  return fields.adoptionCadence === "week" ? buildWeekColumns(start, end, 12, 104) : buildMonthColumns(start, end, 12, 36);
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
      // The visible timeline lane is the immutable Gantt category; activities retain their detailed workstream content.
      name: lane.category,
      bars: lane.bars.map(activity => ({
        ...activity,
        color: colorForWorkstreamType(lane.workstreamType),
        deferred: false,
      })),
    })),
  };
}

export function normalizeTimelineTaxonomy(timeline: Timeline): Timeline {
  const normalized = {
    ...timeline,
    lanes: timeline.lanes.map(lane => {
      const inferred = inferredLaneMetadata(lane.id);
      return { ...lane, ...(inferred || {}) };
    }),
  };
  return applyWorkstreamPresentation(normalized);
}

function upgradeServiceLabel(path: UpgradePath): string {
  const labels: Record<UpgradePath, string> = {
    undecided: "Approve VCF Delivery Path and Execute the Confirmed Runbook",
    "in-place": "Execute VCF 9.1 In-Place Upgrade Waves",
    "new-build": "Deploy VCF 9.1 New Build and Converge Workloads",
    "migration-waves": "Execute VCF 9.1 Migration Waves",
    "design-only": "Close Architecture Decisions and Implementation Runbook",
  };
  return labels[path];
}

function upgradePathNarrative(path: UpgradePath): string {
  const narratives: Record<UpgradePath, string> = {
    undecided: "The delivery path remains open until the implementation decision, rollback approach, and change windows are confirmed during mobilisation.",
    "in-place": "The in-place path sequences controlled VCF 9.1 upgrade waves with rollback and post-wave health checks.",
    "new-build": "The new-build path establishes the target VCF platform before converging approved workloads through the accepted migration sequence.",
    "migration-waves": "The migration-waves path uses bounded workload waves with dependency, cutover, rollback, and post-migration validation controls.",
    "design-only": "The design-only path intentionally stops before migration execution and delivers architecture decisions plus an implementation-ready runbook.",
  };
  return narratives[path];
}

function upgradePathMigrationDuration(path: UpgradePath, cadence: TimelineCadence, baseDuration: number): number {
  if (path === "design-only") return 0;
  const adjustment: Record<Exclude<UpgradePath, "design-only">, number> = cadence === "week"
    ? { undecided: 0, "in-place": -1, "new-build": 1, "migration-waves": 2 }
    : { undecided: 0, "in-place": -1, "new-build": 1, "migration-waves": 2 };
  const maximum = cadence === "week" ? 12 : 6;
  return Math.max(1, Math.min(maximum, baseDuration + adjustment[path]));
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
  },
  networking: {
    "physical-fabric": "Implement Physical Fabric, VLAN, and MTU Prerequisites",
    "edge-cluster-routing": "Deploy NSX Edge Cluster and North-South Routing",
    "overlay-transport": "Roll Out NSX Overlay Transport and Host Connectivity",
    "network-operations": "Handover VCF Networking and NSX Operations",
  },
  security: {
    segmentation: "Implement Segmentation and Security Policy",
    "identity-rbac": "Implement Identity and RBAC Controls",
    "hardening-compliance": "Apply Hardening and Compliance Controls",
  },
  resilience: {
    "recovery-architecture": "Implement Recovery Architecture",
    "recovery-exercises": "Execute Recovery Exercise and Runbook Validation",
    "cyber-recovery": "Implement Cyber-Recovery Capabilities",
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

function selectedFocuses(fields: MinimalFields, capability: Capability): string[] {
  const detailKey: Record<Capability, keyof Omit<AdoptionDetails, "upgradePath" | "notes" | "industryTemplate">> = {
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
      label: `${openingWindow}: Mobilize and Freeze VCF Delivery Baseline`,
      color: "amber",
      dependsOn: appendDeliveryContext("Upload RVTools vHost data with server make, model, CPU, adapters, storage-controller, and ESXi fields; confirm the bill of materials and delivery prerequisites before platform deployment begins."),
      outcome: "Time-box the delivery baseline, then release the management-domain, networking, workload-domain, migration, and handover workstreams for execution.",
    };
  }

  return {
    label: `${openingWindow}: Mobilize and Freeze VCF Delivery Baseline`,
    color: "teal",
      dependsOn: appendDeliveryContext(`RVTools identifies ${observedHosts} observed host${observedHosts === 1 ? "" : "s"} across ${observedModels || platforms.length} host model${(observedModels || platforms.length) === 1 ? "" : "s"}. ${hclPathContext} ${hclDeliveryContext} Confirm server configuration, CPU, NIC, storage controller, firmware, driver, vSAN/ReadyNode details, bill of materials, and implementation prerequisites before platform deployment begins.`),
      outcome: `Time-box the delivery baseline, capture the offline HCL evidence and remaining configuration decisions, then release the management-domain, networking, workload-domain, migration, and handover workstreams for execution.`,
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
  return { id, name: category, category, workstreamType, bars };
}

function hclPathLabel(path: HclSchedulePath): string {
  return { green: "Green — baseline alignment", yellow: "Yellow — remediation and verification", red: "Red — procurement or greenfield provisioning", unresolved: "Unresolved — evidence collection and decision" }[path];
}

function softPrerequisiteLabel(key: AdoptionDetails["softPrerequisites"][number]): string {
  return {
    "dns-ntp": "Confirm DNS, NTP, and core services",
    "ip-pools": "Allocate management and workload IP pools",
    "tor-switch-design": "Finalize ToR switch design and port readiness",
  }[key];
}

function buildPrimaryTimeline(fields: MinimalFields, inventory: InventorySummary, path = getHclSchedulePath(inventory)): Timeline {
  const cadence = fields.adoptionCadence;
  const mobilizationDuration = scheduleUnits(cadence, 2, 1);
  const remediationDuration = scheduleUnits(cadence, 3, 1);
  const procurementDuration = scheduleUnits(cadence, 8, 2);
  const greenfieldDuration = scheduleUnits(cadence, 4, 1);
  const managementDuration = scheduleUnits(cadence, 4, 2);
  const networkingDuration = scheduleUnits(cadence, 5, 2);
  const workloadDuration = scheduleUnits(cadence, 5, 2);
  const moduleDuration = scheduleUnits(cadence, 3, 1);
  const securityDuration = scheduleUnits(cadence, 3, 1);
  const handoverDuration = scheduleUnits(cadence, 3, 1);
  const migrationDuration = upgradePathMigrationDuration(fields.adoptionDetails.upgradePath, cadence, scheduleUnits(cadence, 4, 2));
  const selectedTaskCount = (capability: "automation" | "kubernetes" | "private-ai" | "security" | "resilience") => {
    const selections = selectedFocuses(fields, capability);
    return selections.length || fields.priorities.includes(capability) ? Math.max(1, selections.length) : 0;
  };
  const hclBufferDuration = path === "red" ? procurementDuration + greenfieldDuration : path === "yellow" || path === "unresolved" ? remediationDuration : 0;
  const cloudDuration = (selectedTaskCount("automation") + selectedTaskCount("kubernetes") + selectedTaskCount("private-ai")) * moduleDuration;
  const securityPathDuration = (selectedTaskCount("security") + selectedTaskCount("resilience")) * securityDuration;
  const estimatedHandoverStart = 1 + mobilizationDuration + hclBufferDuration + 1 + Math.max(managementDuration + networkingDuration + workloadDuration + cloudDuration, securityPathDuration) + migrationDuration;
  const baseMinimumColumns = scheduleUnits(cadence, path === "red" ? 30 : path === "yellow" || path === "unresolved" ? 22 : 18, path === "red" ? 12 : path === "yellow" || path === "unresolved" ? 10 : 8);
  const minimumColumns = Math.max(baseMinimumColumns, estimatedHandoverStart);
  const startDate = timelineStartDate(fields);
  const columns = ensureScheduleColumns(primaryColumns(fields), startDate, cadence, minimumColumns);
  const count = columns.length;
  const deliveryContext = confirmedDeliveryContext(fields);
  const appendDeliveryContext = (value: string) => deliveryContext ? `${value} ${deliveryContext}` : value;
  const range = (start: number, duration: number) => boundedRange(Math.min(count, Math.max(1, start)), duration, count);
  const platformInventory = buildPlatformInventoryActivity(inventory, cadence, fields);

  const [mobilizationStart, mobilizationEnd] = range(1, mobilizationDuration);
  const programBars: TimelineBar[] = [
    bar("bar-platform-plan", mobilizationStart, mobilizationEnd, colorForWorkstreamType("Governance"), platformInventory.label, false, false, platformInventory.dependsOn, platformInventory.outcome),
  ];
  const infrastructureBars: TimelineBar[] = [];
  let hclBufferEnd = mobilizationEnd;
  let hclDependency = `${HCL_EVALUATION_VERSION} HCL path classified as ${hclPathLabel(path)} after the mobilisation baseline.`;

  if (path === "yellow" || path === "unresolved") {
    const [remediationStart, remediationEnd] = range(mobilizationEnd, remediationDuration);
    infrastructureBars.push(bar("bar-hcl-remediation", remediationStart, remediationEnd, "amber", path === "yellow" ? "Remediate and Verify HCL Exceptions" : "Collect Missing HCL Evidence and Confirm Path", false, false, appendDeliveryContext("Resolve server, CPU, firmware, or identity evidence before releasing the platform build."), path === "yellow" ? "Close the reported HCL exception path and retain verification evidence." : "Collect missing vHost identity and configuration evidence before committing the platform path."));
    hclBufferEnd = remediationEnd;
    hclDependency = `${HCL_EVALUATION_VERSION} ${hclPathLabel(path)} gate closes only after remediation or evidence review is accepted.`;
  }

  if (path === "red") {
    const [procurementStart, procurementEnd] = range(mobilizationEnd, procurementDuration);
    const [greenfieldStart, greenfieldEnd] = range(procurementEnd, greenfieldDuration);
    infrastructureBars.push(
      bar("bar-hcl-procurement", procurementStart, procurementEnd, "red", "Procure Replacement Hardware or Approve Greenfield Path", false, false, appendDeliveryContext("Proceed only after the Red HCL result has a replacement, repurpose, or approved exception decision."), "Secure the supported hardware path before downstream domain build activities begin."),
      bar("bar-hcl-greenfield", greenfieldStart, greenfieldEnd, "red", "Provision and Validate Greenfield Hardware Baseline", false, false, "Start after procurement, hardware delivery, and rack-and-stack acceptance.", "Validate the newly provisioned hardware baseline before releasing VCF deployment work."),
    );
    hclBufferEnd = greenfieldEnd;
    hclDependency = `${HCL_EVALUATION_VERSION} Red gate closes after procurement or greenfield provisioning is accepted.`;
    fields.adoptionDetails.softPrerequisites.forEach((prerequisite) => {
      const [softStart, softEnd] = range(mobilizationEnd, scheduleUnits(cadence, 3, 1));
      infrastructureBars.push(
        bar(`bar-soft-prerequisite-${prerequisite}`, softStart, softEnd, "teal", softPrerequisiteLabel(prerequisite), false, false, "This soft prerequisite may run in parallel with Red-path procurement and greenfield provisioning.", "Remove an infrastructure dependency without delaying the hardware procurement buffer."),
      );
    });
  }

  const [hclGateStart, hclGateEnd] = range(hclBufferEnd, 1);
  programBars.push(bar("bar-hcl-gate", hclGateStart, hclGateEnd, "gate", `HCL Gate: ${hclPathLabel(path)}`, true, false, hclDependency, "Authorize management-domain and NSX foundation work only after the required HCL path evidence is recorded."));

  const [managementStart, managementEnd] = range(hclGateEnd, managementDuration);
  const [networkingStart, networkingEnd] = range(managementEnd, networkingDuration);
  const foundationEnd = networkingEnd;
  const [workloadStart, workloadEnd] = range(foundationEnd, workloadDuration);
  infrastructureBars.push(
    bar("bar-management-domain", managementStart, managementEnd, colorForWorkstreamType("Infrastructure Build"), "Deploy VCF Management Domain and Core Control Plane", false, false, "Begin after the HCL gate, mobilisation baseline, bill of materials, and platform prerequisites are accepted.", "Deploy the VCF management domain and validate core platform health."),
    bar("bar-workload-domain", workloadStart, workloadEnd, colorForWorkstreamType("Infrastructure Build"), "Create or Import Workload Domain and Prepare Clusters", false, false, "Begin after management-domain health and the required network path are validated.", "Create or import the workload domain and prepare the foundation used by migration and selected module work."),
  );
  infrastructureBars.push(
    bar("bar-vcf-networking-nsx", networkingStart, networkingEnd, colorForWorkstreamType("Infrastructure Build"), "Implement VCF Networking, NSX Transport, Edge, and Routing", false, false, "Begin after the HCL gate; coordinate physical-fabric VLANs, MTU, routing handoffs, and Edge placement.", "Deliver the VCF networking and NSX foundation independently from security services."),
  );

  const operationsBars: TimelineBar[] = [];
  const [operationsDesignStart, operationsDesignEnd] = range(hclGateEnd, Math.max(1, Math.min(workloadDuration, scheduleUnits(cadence, 4, 2))));
  operationsBars.push(bar("bar-platform-design", operationsDesignStart, operationsDesignEnd, colorForWorkstreamType("Operating Model / Platform"), "Define Operating Model, Lifecycle, Monitoring, and Backup Controls", false, false, "Begin after the HCL gate and run in parallel with the VCF foundation build.", "Set operating ownership, lifecycle controls, monitoring, backup, and service-management expectations."));
  let operationsCursor = Math.max(operationsDesignEnd, workloadEnd);
  const addOperationsTask = (id: string, label: string) => {
    const [taskStart, taskEnd] = range(operationsCursor, moduleDuration);
    operationsBars.push(bar(id, taskStart, taskEnd, colorForWorkstreamType("Operating Model / Platform"), label, false, false, "Begin after workload-domain readiness and the HCL gate.", "Implement the selected operating capability with accountable ownership and measurable service outcomes."));
    operationsCursor = taskEnd;
  };
  const operationSelections = selectedFocuses(fields, "operations");
  if (operationSelections.length) {
    operationSelections.forEach((selection, index) => addOperationsTask(`bar-operations-${selection}`, focusLabels.operations[selection] ?? `Operational capability ${index + 1}`));
  } else if (fields.priorities.includes("operations")) {
    addOperationsTask("bar-operations-core", "Operationalize Platform Lifecycle and Service Health");
  }

  const cloudBars: TimelineBar[] = [];
  let cloudCursor = workloadEnd;
  const addCloudTask = (id: string, label: string, dependency: string) => {
    const [taskStart, taskEnd] = range(cloudCursor, moduleDuration);
    cloudBars.push(bar(id, taskStart, taskEnd, colorForWorkstreamType("Consume / Handover"), label, false, false, dependency, "Enable the confirmed cloud capability on the accepted VCF foundation."));
    cloudCursor = taskEnd;
  };
  const addCloudSelections = (capability: "automation" | "kubernetes" | "private-ai", genericLabel: string, dependency: string) => {
    const selections = selectedFocuses(fields, capability);
    if (selections.length) {
      selections.forEach((selection, index) => addCloudTask(`bar-cloud-${capability}-${selection}`, focusLabels[capability][selection] ?? `${capabilityTitle(capability)} capability ${index + 1}`, dependency));
    } else if (fields.priorities.includes(capability)) {
      addCloudTask(`bar-cloud-${capability}`, genericLabel, dependency);
    }
  };
  addCloudSelections("automation", "Enable Automation and Self-Service", "Begin after workload-domain readiness and the HCL gate.");
  addCloudSelections("kubernetes", "Enable Kubernetes / Supervisor Services", "Begin after workload-domain readiness; coordinate network and security controls.");
  addCloudSelections("private-ai", "Prepare Private AI / GPU Platform Enablement", "Begin after workload-domain readiness and confirmed GPU, data-governance, and security controls.");
  const cloudEnd = cloudBars.length ? cloudCursor : workloadEnd;

  const securityBars: TimelineBar[] = [];
  let securityCursor = hclGateEnd;
  const addSecurityTask = (id: string, label: string) => {
    const [taskStart, taskEnd] = range(securityCursor, securityDuration);
    securityBars.push(bar(id, taskStart, taskEnd, colorForWorkstreamType("Security & Resiliency"), label, false, false, "Begin after the HCL gate; this work does not wait for cloud module enablement.", "Implement the selected resilience and security capability with controlled evidence and ownership."));
    securityCursor = taskEnd;
  };
  const addSecuritySelections = (capability: "security" | "resilience", genericLabel: string) => {
    const selections = selectedFocuses(fields, capability);
    if (selections.length) {
      selections.forEach((selection, index) => addSecurityTask(`bar-${capability}-${selection}`, focusLabels[capability][selection] ?? `${capabilityTitle(capability)} capability ${index + 1}`));
    } else if (fields.priorities.includes(capability)) {
      addSecurityTask(`bar-${capability}-core`, genericLabel);
    }
  };
  addSecuritySelections("security", "Implement Security and Segmentation Controls");
  addSecuritySelections("resilience", "Implement Resilience, DR, and Cyber-Recovery Controls");
  const securityEnd = securityBars.length ? securityCursor : workloadEnd;

  const finalMigrationStart = Math.max(workloadEnd, cloudEnd, securityEnd);
  const migrationRange = migrationDuration ? range(finalMigrationStart, migrationDuration) : null;
  const migrationEnd = migrationRange?.[1] ?? finalMigrationStart;
  if (migrationRange) {
    infrastructureBars.push(bar("bar-vcf-upgrade-services", migrationRange[0], migrationRange[1], colorForWorkstreamType("Migration Waves"), upgradeServiceLabel(fields.adoptionDetails.upgradePath), false, false, appendDeliveryContext("Begin only after selected Cloud and Security & Resilience activities complete, as well as workload-domain readiness, application dependency review, rollback planning, and change-window approval."), upgradePathNarrative(fields.adoptionDetails.upgradePath)));
  }

  const [handoverStart, handoverEnd] = range(Math.max(migrationEnd, operationsCursor), handoverDuration);
  operationsBars.push(bar("bar-platform-handover", handoverStart, handoverEnd, colorForWorkstreamType("Operating Model / Platform"), "Validate Handover, Service Acceptance, and Ongoing Lifecycle", false, false, "Begin after the final migration or implementation wave is accepted.", "Confirm operational readiness, evidence, ownership, and the continuing lifecycle cadence."));

  const lanes: TimelineLane[] = [
    fixedGanttLane("lane-program-governance", "Program Management & Governance", "Governance", programBars),
    fixedGanttLane("lane-modernize-infrastructure", "Modernize Infrastructure", "Infrastructure Build", infrastructureBars),
    fixedGanttLane("lane-operations", "Operations", "Operating Model / Platform", operationsBars),
    fixedGanttLane("lane-cloud", "Modernize Cloud", "Consume / Handover", cloudBars),
    fixedGanttLane("lane-security-resilience", "Modernize Security & Resilience", "Security & Resiliency", securityBars),
  ];

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

  const selectedProfiles = fields.priorities.flatMap(capability => selectedFocuses(fields, capability)
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

function mirrorEntitlementLanes(adoptionTimeline: Timeline, columnCount: number): TimelineLane[] {
  const weeklyImplementationUnits = Math.min(52, adoptionTimeline.columns.length);
  const normalizeStart = (value: number) => adoptionTimeline.cadence === "week"
    ? Math.max(1, Math.floor(((value - 1) / weeklyImplementationUnits) * 12) + 1)
    : value;
  const normalizeEnd = (value: number) => adoptionTimeline.cadence === "week"
    ? Math.max(2, Math.ceil(((value - 1) / weeklyImplementationUnits) * 12) + 1)
    : value;

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

function baselineEntitlementLanes(startColumn: number, columnCount: number): TimelineLane[] {
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
      outcome: "Maintain executive alignment, delivery ownership, adoption measures, and value tracking through the remaining entitlement period.",
    },
    {
      id: "operating-model",
      category: "Operations",
      workstreamType: "Operating Model / Platform",
      start: operatingModelStart,
      end,
      label: "Platform Operating Model and Lifecycle Adoption",
      outcome: "Embed platform lifecycle, service ownership, operational cadence, and consumption practices before entitlement end.",
    },
    {
      id: "handover",
      category: "Modernize Cloud",
      workstreamType: "Consume / Handover",
      start: handoverStart,
      end,
      label: "Service Consumption and Handover",
      outcome: "Complete service consumption, handover, and the next service-expansion decision within the entitlement period.",
    },
    {
      id: "networking-nsx",
      category: "Modernize Infrastructure",
      workstreamType: "Operating Model / Platform",
      start: startColumn,
      end,
      label: "VCF Networking and NSX Lifecycle Progression",
      outcome: "Continue VCF networking and NSX platform operations, edge and overlay lifecycle planning, and network-service handover through entitlement end.",
    },
  ];

  return baseline.map(item => ({
    id: `lane-two-year-baseline-${item.id}`,
    name: item.workstreamType,
    category: item.category,
    workstreamType: item.workstreamType,
    bars: [bar(`bar-two-year-baseline-${item.id}`, item.start, item.end, colorForWorkstreamType(item.workstreamType), item.label, false, false, undefined, item.outcome)],
  }));
}

function hasEntitlementAlignedNotional(timeline: Timeline, fields: MinimalFields): boolean {
  const expectedColumns = buildTwoYearNotionalColumns(timelineStartDate(fields), entitlementNotionalEndDate(fields));
  const columnsMatch = timeline.cadence === "month"
    && timeline.startDate === timelineStartDate(fields)
    && timeline.columns.length === expectedColumns.length
    && timeline.columns.every((column, index) => column === expectedColumns[index]);
  if (!columnsMatch) return false;
  if (timeline.lanes.length !== FIXED_GANTT_CATEGORIES.length) return false;
  if (!timeline.lanes.every((lane, index) => lane.category === FIXED_GANTT_CATEGORIES[index] && lane.name === lane.category)) return false;
  return timeline.lanes.flatMap(lane => lane.bars).some(activity => activity.id === "bar-platform-plan");
}

function buildTwoYearPlan(fields: MinimalFields, _inventory: InventorySummary, adoptionTimeline: Timeline): Timeline {
  const startDate = timelineStartDate(fields);
  const entitlementEnd = entitlementNotionalEndDate(fields);
  const columns = buildTwoYearNotionalColumns(startDate, entitlementEnd);
  const lanes: TimelineLane[] = mirrorEntitlementLanes(adoptionTimeline, columns.length);
  const implementationEnd = Math.max(1, ...lanes.flatMap(lane => lane.bars.map(activity => activity.endCol)));
  const continuationStart = Math.min(columns.length + 1, implementationEnd);

  if (continuationStart <= columns.length) {
    baselineEntitlementLanes(continuationStart, columns.length).forEach(baselineLane => {
      const categoryLane = lanes.find(lane => lane.category === baselineLane.category);
      if (categoryLane) categoryLane.bars.push(...baselineLane.bars);
    });
  }

  return applyWorkstreamPresentation({ cadence: "month", startDate, columns, lanes });
}

export function buildAdoptionPlans(fields: MinimalFields, inventory: InventorySummary, providedHclPath?: HclSchedulePath): { adoptionTimeline: Timeline; twoYearPlan: Timeline; rationale: string } {
  const hclPath = providedHclPath ?? getHclSchedulePath(inventory);
  const adoptionTimeline = buildPrimaryTimeline(fields, inventory, hclPath);
  const twoYearPlan = buildTwoYearPlan(fields, inventory, adoptionTimeline);
  const estate = inventory.vmCount ? `${inventory.vmCount.toLocaleString()} VMs across ${inventory.hosts.toLocaleString()} hosts` : "the imported estate";
  const amount = fields.entitlementAmount ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(fields.entitlementAmount) : "the confirmed entitlement value";
  const plannedProjectStart = timelineStartDate(fields);
  const entitlementEnd = entitlementNotionalEndDate(fields);
  const term = fields.entitlementStart && entitlementEnd ? `${fields.entitlementStart} through ${entitlementEnd}` : "the confirmed entitlement term";
  const priorities = fields.priorities.length ? fields.priorities.map(capabilityTitle).join(", ") : "the selected customer outcomes";
  const cadence = fields.adoptionCadence === "week" ? "weekly execution windows" : "calendar-month execution windows";
  const detailCount = [fields.adoptionDetails.operations, fields.adoptionDetails.automation, fields.adoptionDetails.networking, fields.adoptionDetails.security, fields.adoptionDetails.resilience, fields.adoptionDetails.kubernetes, fields.adoptionDetails.privateAi].flat().length;
  const details = detailCount ? `${detailCount} selected detailed capability focus area${detailCount === 1 ? "" : "s"}` : "the initial customer outcome selections";
  const followOnCount = twoYearPlan.lanes.filter(lane => lane.id.startsWith("lane-follow-on-")).flatMap(lane => lane.bars).length;
  const followOnSummary = followOnCount
    ? `${followOnCount} selected follow-on service${followOnCount === 1 ? " is" : "s are"} placed only within the remaining entitlement period`
    : "continuing governance, operating-model, and handover work is bounded by the remaining entitlement period";
  const platformInventorySummary = buildPlatformInventoryActivity(inventory, fields.adoptionCadence, fields).outcome;
  const planningContext = planningInputContext(fields);
  const openingWindow = fields.adoptionCadence === "week" ? "the first two weeks" : "the first calendar month";
  const customerContext = planningContext.customerNotes
    ? `Confirmed customer objectives or constraints are applied to sequencing and dependencies: “${planningContext.customerNotes}”.`
    : "No additional customer-specific objectives or constraints were recorded beyond the selected outcomes.";
  const timelineContext = planningContext.timelineNotes
    ? `Confirmed timeline notes are applied as execution conditions: “${planningContext.timelineNotes}”.`
    : "No additional timeline exceptions or sequencing conditions were recorded.";
  const industryContext = `The ${planningContext.template.label} industry discovery lens focuses mobilisation discussions on ${planningContext.industryThemes}; it informs the planning narrative only and does not add scope, priorities, or delivery activities.`;
  const hclContext = `The HCL 2.0 evaluation path is ${hclPathLabel(hclPath)} and is used as planning evidence for the required buffer and gate; it remains an offline precheck, not official certification.`;
  const migrationGateContext = "The final migration or implementation phase is gated until selected Cloud and Security & Resilience work is complete, alongside workload-domain readiness, application dependency review, rollback planning, and change-window approval.";
  const rationale = `The operational Adoption Timeline is aligned to ${amount}, ${term}, ${estate}, ${cadence}, and ${details}. Mobilisation and delivery-baseline work are deliberately limited to ${openingWindow}, then the plan moves into management-domain deployment, VCF networking and NSX implementation, workload-domain creation or import, controlled upgrade or migration waves, and operational handover. ${upgradePathNarrative(fields.adoptionDetails.upgradePath)} ${hclContext} ${migrationGateContext} ${customerContext} ${timelineContext} ${industryContext} ${platformInventorySummary} The entitlement-aligned Notional runs from the planned project start (${plannedProjectStart}) through entitlement end (${entitlementEnd || "TBD"}); it mirrors the implementation sequence, then retains only governance, lifecycle, handover, and selected expansion work that fits within that entitlement period. ${followOnSummary}. Each recommendation states why it was selected, the intended outcome, and its required sequence; outstanding inputs are stated explicitly instead of creating a generic placeholder. Every lane and activity can be renamed, moved, resized, added, or removed.`;
  return { adoptionTimeline, twoYearPlan, rationale };
}

export function buildTimeline(fields: MinimalFields, inventory: InventorySummary): { timeline: Timeline; rationale: string } {
  const plans = buildAdoptionPlans(fields, inventory);
  return { timeline: plans.adoptionTimeline, rationale: plans.rationale };
}

function platformId(vendor: string, model: string, cpuModel: string): string {
  return `${vendor}-${model}-${cpuModel}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function hardwarePlatformAssessment(platform: InventorySummary["hostModels"][number]): HardwarePlatformAssessment {
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
  const hcl = assessHclPlatform(vendor, model, cpuModel);

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
      detail: `RVTools observed this host group but did not provide a usable vendor and model, so the plan begins with platform evidence collection before a VCF 9.1 path can be selected.${esxiDetail}`,
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
      detail: `This legacy Dell PowerEdge generation has a replacement or exception decision plan for VCF 9.1; it is not assumed to be an in-place upgrade target.${esxiDetail}`,
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
    clusterMembership: platform.clusterMembership,
    minimumMemoryGiB: platform.minimumMemoryGiB,
    maximumMemoryGiB: platform.maximumMemoryGiB,
    hcl,
    status: "review-required",
    detail: `RVTools provides a usable platform identity, so the plan starts with configuration compatibility confirmation; the server model alone cannot establish an official VCF 9.1 outcome.${esxiDetail}`,
    nextAction: "Run the Compatibility Confirmation plan: validate the exact server, CPU, adapters, storage controllers, firmware, drivers, and vSAN/ReadyNode requirements in the Broadcom Compatibility Guide.",
  };
}

export function assessHardwarePlatforms(inventory: InventorySummary): HardwarePlatformAssessment[] {
  return inventory.hostModels.map(hardwarePlatformAssessment);
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
    title: "VCF 9.1 ESX BOM Alignment Signal",
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

  const hardwarePlatforms = assessHardwarePlatforms(inventory);
  const hcl = assessHclEstate(inventory.hclEvidence);
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
    title: "VCF 9.1 Hardware Platform Precheck",
    detail: !hardwarePlatforms.length
      ? "Host vendor and model data are missing."
      : upgradeRequiredPlatforms.length
        ? `${upgradeRequiredPlatforms.reduce((sum, platform) => sum + platform.hosts, 0)} host(s) are on legacy platform generations that need a replacement or formal exception decision for VCF 9.1 planning. ${candidatePlatforms.length ? `${candidatePlatforms.reduce((sum, platform) => sum + platform.hosts, 0)} host(s) remain candidate platforms pending exact configuration validation.` : ""}`
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

  const delta = fields.entitledCores - inventory.physicalCores;
  items.push({
    id: "core-entitlement",
    category: "licensing",
    status: !fields.entitledCores || !inventory.physicalCores ? "unknown" : delta >= 0 ? "good" : "attention",
    title: "Core Entitlement Comparison",
    detail: !fields.entitledCores ? "Enter the entitled core quantity to compare it with observed physical cores." : !inventory.physicalCores ? "Physical-core inventory is unavailable." : delta >= 0 ? `${fields.entitledCores.toLocaleString()} entitled cores cover ${inventory.physicalCores.toLocaleString()} observed physical cores, with ${delta.toLocaleString()} unallocated.` : `${inventory.physicalCores.toLocaleString()} observed physical cores exceed entitlement by ${Math.abs(delta).toLocaleString()}.`,
    evidence: "Simple inventory comparison",
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
  return { version: 11, fields, inventorySources: [], inventory, readiness, adoptionTimeline: plans.adoptionTimeline, twoYearPlan: plans.twoYearPlan, rationale: plans.rationale };
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
  return { ...fields, adoptionDetails: { ...fields.adoptionDetails, industryTemplate: "general-enterprise" } };
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
        const workstreamType = inferred?.workstreamType || canonicalWorkstreamType(rawLane.workstreamType) || DEFAULT_TIMELINE_LANE_METADATA.workstreamType;
        return { ...rawLane, category, workstreamType, name: workstreamType, bars: Array.isArray(rawLane.bars) ? rawLane.bars.map(bar => ({ ...(bar as Record<string, unknown>), color: colorForWorkstreamType(workstreamType), deferred: false })) : rawLane.bars };
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
    "lane-infrastructure-core",
    "lane-operations",
    "lane-cloud",
    "lane-security-resilience",
  ];
  return requiredFixedLaneIds.some(laneId => !timeline.lanes.some(lane => lane.id === laneId));
}

function normalizePlanningDates(fields: MinimalFields): MinimalFields {
  const entitlementEnd = calculateEntitlementEndDate(fields.entitlementStart);
  const plannedProjectStart = fields.plannedProjectStart || fields.targetStart || fields.entitlementStart;
  return {
    ...fields,
    ...(entitlementEnd ? { entitlementEnd } : {}),
    ...(plannedProjectStart ? { plannedProjectStart } : {}),
  };
}

export function migrateDocument(value: unknown): EngagementDocument {
  const normalizedValue = normalizeRawTimelineTaxonomy(value);
  const current = engagementDocumentV11Schema.safeParse(normalizedValue);
  if (current.success) {
    const fields = normalizePlanningDates(current.data.fields);
    const generated = buildAdoptionPlans(fields, current.data.inventory);
    if (needsImplementationTimelineRebaseline(current.data.adoptionTimeline)) {
      return {
        ...current.data,
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

    const normalizedAdoptionTimeline = normalizeTimelineTaxonomy(withConsolidatedPlatformInventory(current.data.adoptionTimeline, current.data.inventory));
    const adoptionTimeline = normalizedAdoptionTimeline.lanes.some(lane => lane.id === "lane-vcf-networking-nsx")
      ? normalizedAdoptionTimeline
      : { ...normalizedAdoptionTimeline, lanes: [...normalizedAdoptionTimeline.lanes, ...generated.adoptionTimeline.lanes.filter(lane => lane.id === "lane-vcf-networking-nsx")] };
    const candidateTwoYearPlan = normalizeTimelineTaxonomy(withoutLegacyHostPlatformTwoYearLanes(current.data.twoYearPlan));
    const entitlementAlignedTwoYearPlan = hasEntitlementAlignedNotional(candidateTwoYearPlan, fields)
      ? candidateTwoYearPlan
      : generated.twoYearPlan;
    const generatedNetworkingLane = generated.twoYearPlan.lanes.filter(lane => lane.id === "lane-two-year-baseline-networking-nsx");
    const twoYearPlan = !generatedNetworkingLane.length || entitlementAlignedTwoYearPlan.lanes.some(lane => lane.id === "lane-two-year-baseline-networking-nsx")
      ? entitlementAlignedTwoYearPlan
      : { ...entitlementAlignedTwoYearPlan, lanes: [...entitlementAlignedTwoYearPlan.lanes, ...generatedNetworkingLane] };
    return {
      ...current.data,
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
    entitledCores: numberValue(oldFields.entitledCores || oldFields.entitlement),
    entitlementAmount: numberValue(oldFields.entitlementAmount || oldFields.entitlementValue || oldFields.funds),
    entitlementStart: stringValue(oldFields.entitlementStart || oldFields.termStart),
    entitlementEnd: stringValue(oldFields.entitlementEnd || oldFields.entitlementEndDate || oldFields.termEnd),
    plannedProjectStart: stringValue(oldFields.plannedProjectStart || oldFields.projectPlannedStart || oldFields.targetStart || oldFields.kickoffDate),
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

export function refreshDerivedDocument(document: EngagementDocument): EngagementDocument {
  const warnings = document.inventorySources.flatMap(source => source.warnings);
  // Assessment can be expensive for large RVTools estates. Calculate it once and share its path with timeline generation.
  const readiness = assessReadiness(document.fields, document.inventory, warnings);
  const plans = buildAdoptionPlans(document.fields, document.inventory, readiness.hclSchedulePath);
  return { ...document, readiness, adoptionTimeline: plans.adoptionTimeline, twoYearPlan: plans.twoYearPlan, rationale: plans.rationale };
}

export function validateTimeline(timeline: Timeline): string[] {
  const errors: string[] = [];
  const maxEnd = timeline.columns.length + 1;
  for (const lane of timeline.lanes) {
    const sorted = [...lane.bars].sort((a, b) => a.startCol - b.startCol);
    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index];
      if (current.endCol <= current.startCol || current.endCol > maxEnd) errors.push(`${lane.name}: “${current.label}” is outside the timeline grid.`);
      const next = sorted[index + 1];
      if (next && current.endCol > next.startCol) errors.push(`${lane.name}: “${current.label}” overlaps “${next.label}”. Split concurrent work into separate lanes.`);
    }
  }
  return errors;
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
  const overlaps = lane.bars.some(item => item.id !== barId && candidate.startCol < item.endCol && candidate.endCol > item.startCol);
  if (overlaps) return timeline;

  return {
    ...timeline,
    lanes: timeline.lanes.map(item => item.id === laneId
      ? { ...item, bars: item.bars.map(bar => bar.id === barId ? candidate : bar) }
      : item),
  };
}

export function completionPercent(fields: MinimalFields, inventory: InventorySummary): number {
  const checks = [
    fields.customerName.trim().length > 0,
    fields.entitledCores > 0,
    fields.entitlementAmount > 0,
    fields.entitlementStart.trim().length > 0,
    fields.entitlementEnd.trim().length > 0,
    inventory.hosts > 0,
    inventory.vmCount > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
