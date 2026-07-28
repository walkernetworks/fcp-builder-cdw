import { z } from "zod";

export const TIMELINE_COLORS = ["slate", "blue", "teal", "amber", "red", "green", "gate", "deferred"] as const;
export type TimelineColor = (typeof TIMELINE_COLORS)[number];

export const TIMELINE_CATEGORIES = [
  "Program Management & Governance",
  "Hardware Refresh",
  "Modernize Cloud",
  "Operations",
  "Modernize Infrastructure",
  "Modernize Security & Reliance",
  "Modernize App Platform & AI",
] as const;
export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number];

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
  category: z.enum(TIMELINE_CATEGORIES).default("Program Management & Governance"),
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

const adoptionDetailsV6Schema = z.object({
  upgradePath: upgradePathSchema,
  operations: z.array(operationsFocusSchema).max(6),
  automation: z.array(automationFocusSchema).max(5),
  networking: z.array(networkingFocusSchema).max(4).default([]),
  security: z.array(securityFocusSchema).max(3),
  resilience: z.array(resilienceFocusSchema).max(3),
  kubernetes: z.array(kubernetesFocusSchema).max(3),
  privateAi: z.array(privateAiFocusSchema).max(3),
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
export type EngagementDocument = z.infer<typeof engagementDocumentV10Schema>;

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

export function buildTwoYearNotionalColumns(startValue: string): string[] {
  const start = parseMonth(startValue) || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  return Array.from({ length: 24 }, (_, index) => displayMonth(addUtcMonths(start, index)));
}

function timelineStartDate(fields: MinimalFields): string {
  const candidate = fields.targetStart || fields.entitlementStart;
  return parseIsoDate(candidate) ? candidate : isoDate(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)));
}

function timelineEndDate(fields: MinimalFields): string {
  const candidate = fields.targetComplete || fields.entitlementEnd;
  return parseIsoDate(candidate) ? candidate : "";
}

export function applyScheduleFieldPatch(fields: MinimalFields, patch: Partial<MinimalFields>): MinimalFields {
  const targetStartTracksEntitlement = !fields.targetStart || fields.targetStart === fields.entitlementStart;
  const targetCompleteTracksEntitlement = !fields.targetComplete || fields.targetComplete === fields.entitlementEnd;
  return {
    ...fields,
    ...patch,
    ...(patch.entitlementStart !== undefined && patch.targetStart === undefined && targetStartTracksEntitlement ? { targetStart: patch.entitlementStart } : {}),
    ...(patch.entitlementEnd !== undefined && patch.targetComplete === undefined && targetCompleteTracksEntitlement ? { targetComplete: patch.entitlementEnd } : {}),
  };
}

function followOnStartDate(fields: MinimalFields): string {
  const start = parseIsoDate(timelineStartDate(fields)) || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  return isoDate(addUtcMonths(start, 12));
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
    security: { category: "Modernize Security & Reliance", workstreamType: "Security & Resiliency" },
    resilience: { category: "Modernize Security & Reliance", workstreamType: "Security & Resiliency" },
    kubernetes: { category: "Modernize App Platform & AI", workstreamType: "Consume / Handover" },
    "private-ai": { category: "Modernize App Platform & AI", workstreamType: "Consume / Handover" },
  };
  return metadata[capability];
}

function inferredLaneMetadata(laneId: string): TimelineLaneMetadata | null {
  const id = laneId.replace(/^lane-two-year-year-one-/, "");
  if (id === "lane-platform-plan") return DEFAULT_TIMELINE_LANE_METADATA;
  if (id === "lane-hardware-refresh") return { category: "Hardware Refresh", workstreamType: "Infrastructure Build" };
  if (id === "lane-upgrade-services") return { category: "Modernize Infrastructure", workstreamType: "Migration Waves" };
  if (id === "lane-vcf-networking-nsx") return { category: "Modernize Infrastructure", workstreamType: "Infrastructure Build" };
  if (id === "lane-platform-design") return { category: "Modernize Cloud", workstreamType: "Operating Model / Platform" };
  const capabilityMatch = id.match(/^lane-(?:follow-on-)?(operations|automation|networking|security|resilience|kubernetes|private-ai)(?:-\d+)?$/);
  return capabilityMatch ? capabilityLaneMetadata(capabilityMatch[1] as Capability) : null;
}

export function applyWorkstreamPresentation(timeline: Timeline): Timeline {
  return {
    ...timeline,
    lanes: timeline.lanes.map(lane => ({
      ...lane,
      // The visible timeline lane is the workstream type; activities remain the detailed delivery content.
      name: lane.workstreamType,
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
    undecided: "VCF 9.1 Upgrade Services Scope and Runbook",
    "in-place": "VCF 9.1 In-Place Upgrade Services",
    "new-build": "VCF 9.1 New-Build and Converge Services",
    "migration-waves": "VCF 9.1 Migration Wave Services",
    "design-only": "VCF 9.1 Upgrade Architecture and Runbook",
  };
  return labels[path];
}

const focusLabels: Record<Capability, Record<string, string>> = {
  operations: {
    lifecycle: "Lifecycle and Certificate Ownership",
    observability: "Health, Logs, and Diagnostics Observability",
    "capacity-cost": "Capacity and Cost Visibility",
    "custom-dashboards": "Custom Operations Dashboards",
    "identity-certificates": "Identity, Certificates, and Password Operations",
    "event-integration": "Event and Incident Integration",
  },
  automation: {
    "vm-self-service": "VM Self-Service Catalog",
    "infrastructure-as-code": "Infrastructure-as-Code Patterns",
    "day-2-automation": "Day-2 Automation",
    governance: "Organization and Policy Governance",
    "application-provisioning": "Application Platform Provisioning",
  },
  networking: {
    "physical-fabric": "Physical Fabric, VLAN, and MTU Design",
    "edge-cluster-routing": "NSX Edge Cluster and Routing Design",
    "overlay-transport": "NSX Overlay Transport and Host Connectivity",
    "network-operations": "VCF Networking and NSX Operating Model",
  },
  security: {
    segmentation: "Segmentation and Security Policy",
    "identity-rbac": "Identity and RBAC Design",
    "hardening-compliance": "Hardening and Compliance Controls",
  },
  resilience: {
    "recovery-architecture": "Recovery Architecture",
    "recovery-exercises": "Recovery Exercise and Runbook",
    "cyber-recovery": "Cyber-Recovery Design",
  },
  kubernetes: {
    "workload-domains": "Workload Domain and Supervisor Design",
    "platform-operations": "Kubernetes Platform Operations",
    "developer-experience": "Developer Experience and Guardrails",
  },
  "private-ai": {
    "gpu-capacity": "AI Capacity and GPU Planning",
    "ai-guardrails": "Private AI Guardrails",
    "pilot-onboarding": "Private AI Pilot Onboarding",
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
  if (!focuses.length) return [`${capabilityTitle(capability)} Design`];
  return focuses.map(focus => `${focusLabels[capability][focus] || capabilityTitle(capability)} Plan`);
}

const legacyHostPlatformLanePrefix = "lane-host-platform-";

type PlatformInventoryActivity = Pick<TimelineBar, "label" | "color" | "dependsOn" | "outcome">;

function buildPlatformInventoryActivity(inventory: InventorySummary): PlatformInventoryActivity {
  const platforms = assessHardwarePlatforms(inventory);
  const observedHosts = platforms.reduce((total, platform) => total + platform.hosts, 0);
  const observedModels = new Set(platforms.map(platform => `${platform.vendor} ${platform.model}`.trim().replace(/\s+/g, " ").toLowerCase()).filter(model => model && model !== "unknown vendor unknown model")).size;

  if (!platforms.length) {
    return {
      label: "VCF 9.1 Platform Inventory",
      color: "amber",
      dependsOn: "Upload RVTools vHost data with server make, model, CPU, adapters, storage-controller, and ESXi fields before platform design begins.",
      outcome: "Consolidate the host inventory and configuration details used in delivery design.",
    };
  }

  return {
    label: "VCF 9.1 Platform Inventory and Delivery Plan",
    color: "teal",
    dependsOn: `RVTools identifies ${observedHosts} observed host${observedHosts === 1 ? "" : "s"} across ${observedModels || platforms.length} host model${(observedModels || platforms.length) === 1 ? "" : "s"}. Consolidate the server configuration, CPU, NIC, storage controller, firmware, driver, and vSAN/ReadyNode details in the delivery plan before Upgrade Services begins.`,
    outcome: "Create one delivery-owned host inventory that groups identical platforms and records the delivery path for each model before service execution.",
  };
}

function withConsolidatedPlatformInventory(timeline: Timeline, inventory: InventorySummary): Timeline {
  const platformInventory = buildPlatformInventoryActivity(inventory);
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

function buildPrimaryTimeline(fields: MinimalFields, inventory: InventorySummary): Timeline {
  const columns = primaryColumns(fields);
  const count = columns.length;
  const cadence = fields.adoptionCadence;
  const upgradeDuration = Math.max(2, Math.min(count, Math.ceil(count * 0.36)));
  const inventoryDuration = Math.max(2, Math.min(count, Math.ceil(count * 0.22)));
  const designDuration = Math.max(2, Math.min(count, Math.ceil(count * 0.3)));
  const networkingDuration = Math.max(2, Math.min(count, Math.ceil(count * 0.42)));
  const [inventoryStart, inventoryEnd] = boundedRange(1, inventoryDuration, count);
  const [upgradeStart, upgradeEnd] = boundedRange(Math.min(count, inventoryEnd), upgradeDuration, count);
  const [networkingStart, networkingEnd] = boundedRange(Math.min(count, inventoryEnd), networkingDuration, count);
  const [platformStart, platformEnd] = boundedRange(Math.min(count, Math.max(inventoryEnd, upgradeStart)), designDuration, count);
  const platformInventory = buildPlatformInventoryActivity(inventory);
  const lanes: TimelineLane[] = [
    { id: "lane-platform-plan", name: "Governance", ...DEFAULT_TIMELINE_LANE_METADATA, bars: [bar("bar-platform-plan", inventoryStart, inventoryEnd, colorForWorkstreamType("Governance"), platformInventory.label, false, false, platformInventory.dependsOn, platformInventory.outcome)] },
    { id: "lane-upgrade-services", name: "Migration Waves", category: "Modernize Infrastructure", workstreamType: "Migration Waves", bars: [bar("bar-vcf-upgrade-services", upgradeStart, upgradeEnd, colorForWorkstreamType("Migration Waves"), upgradeServiceLabel(fields.adoptionDetails.upgradePath), false, false, "Start after the platform inventory and delivery plan records the path for every observed host group.")] },
    { id: "lane-vcf-networking-nsx", name: "Infrastructure Build", category: "Modernize Infrastructure", workstreamType: "Infrastructure Build", bars: [bar("bar-vcf-networking-nsx", networkingStart, networkingEnd, colorForWorkstreamType("Infrastructure Build"), "VCF Networking and NSX Foundation", false, false, "Begin after the platform inventory establishes the delivery path; coordinate physical-fabric, NSX edge, overlay, and routing dependencies with the network team.", "Establish the VCF networking and NSX foundation independently from security services, including physical-fabric alignment, Edge Cluster planning, overlay transport, and the networking operating model.")] },
    { id: "lane-platform-design", name: "Operating Model / Platform", category: "Modernize Cloud", workstreamType: "Operating Model / Platform", bars: [bar("bar-platform-design", platformStart, platformEnd, colorForWorkstreamType("Operating Model / Platform"), "VCF Platform Design") ] },
  ];

  const capabilityStart = Math.max(2, Math.min(count, Math.ceil(count * 0.45)));
  const priorityStagger = Math.max(0, Math.floor(count * 0.05));
  fields.priorities.forEach((priority, priorityIndex) => {
    const labels = activityLabelsForCapability(fields, priority);
    const baseStart = Math.min(count, capabilityStart + (priorityIndex % 3) * priorityStagger);
    const availableWindows = Math.max(1, count - baseStart + 1);
    const laneCount = Math.max(1, Math.ceil(labels.length / availableWindows));
    const labelsPerLane = Math.ceil(labels.length / laneCount);

    for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
      const laneLabels = labels.slice(laneIndex * labelsPerLane, (laneIndex + 1) * labelsPerLane);
      const slot = Math.max(1, Math.floor(availableWindows / laneLabels.length));
      const bars = laneLabels.map((label, index) => {
        const start = baseStart + index * slot;
        const end = index === laneLabels.length - 1 ? count + 1 : Math.min(count + 1, start + slot);
        return bar(`bar-${priority}-${laneIndex * labelsPerLane + index + 1}`, start, end, colorForWorkstreamType(capabilityLaneMetadata(priority).workstreamType), label);
      });
      const laneId = laneIndex === 0 ? `lane-${priority}` : `lane-${priority}-${laneIndex + 1}`;
      const metadata = capabilityLaneMetadata(priority);
      lanes.push({ id: laneId, name: metadata.workstreamType, ...metadata, bars });
    }
  });

  return { cadence, startDate: timelineStartDate(fields), columns, lanes };
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

function mirrorYearOneLanes(adoptionTimeline: Timeline): TimelineLane[] {
  const unitsPerYear = adoptionTimeline.cadence === "week" ? Math.min(52, adoptionTimeline.columns.length) : 12;
  const normalizeStart = (value: number) => adoptionTimeline.cadence === "week"
    ? Math.max(1, Math.floor(((value - 1) / unitsPerYear) * 12) + 1)
    : value;
  const normalizeEnd = (value: number) => adoptionTimeline.cadence === "week"
    ? Math.max(2, Math.ceil(((value - 1) / unitsPerYear) * 12) + 1)
    : value;

  return adoptionTimeline.lanes.map(lane => ({
    id: `lane-two-year-year-one-${lane.id}`,
    name: lane.name,
    category: lane.category,
    workstreamType: lane.workstreamType,
    bars: lane.bars.flatMap(item => {
      const startCol = Math.max(1, normalizeStart(item.startCol));
      const endCol = Math.min(13, Math.max(startCol + 1, normalizeEnd(item.endCol)));
      if (startCol >= 13 || endCol <= startCol) return [];
      return [{ ...item, id: `bar-two-year-year-one-${item.id}`, startCol, endCol }];
    }),
  }));
}

function baselineYearTwoLanes(): TimelineLane[] {
  const baseline: Array<{ id: string; category: TimelineCategory; workstreamType: WorkstreamType; start: number; end: number; label: string; outcome: string }> = [
    {
      id: "governance",
      category: "Program Management & Governance",
      workstreamType: "Governance",
      start: 13,
      end: 25,
      label: "Delivery Governance and Value Tracking",
      outcome: "Maintain executive alignment, delivery ownership, adoption measures, and continuous value tracking through the second year.",
    },
    {
      id: "operating-model",
      category: "Operations",
      workstreamType: "Operating Model / Platform",
      start: 13,
      end: 21,
      label: "Platform Operating Model and Lifecycle Adoption",
      outcome: "Embed platform lifecycle, service ownership, operational cadence, and consumption practices.",
    },
    {
      id: "handover",
      category: "Modernize Cloud",
      workstreamType: "Consume / Handover",
      start: 18,
      end: 25,
      label: "Service Consumption and Handover",
      outcome: "Extend consumption, complete handover, and establish the next service-expansion sequence.",
    },
    {
      id: "networking-nsx",
      category: "Modernize Infrastructure",
      workstreamType: "Operating Model / Platform",
      start: 13,
      end: 25,
      label: "VCF Networking and NSX Lifecycle Progression",
      outcome: "Continue VCF networking and NSX platform operations, edge and overlay lifecycle planning, and network-service handover through the second year.",
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

function hasYearTwoActivity(timeline: Timeline): boolean {
  return timeline.lanes.some(lane => lane.bars.some(activity => activity.endCol > 13));
}

function buildTwoYearPlan(fields: MinimalFields, inventory: InventorySummary, adoptionTimeline: Timeline): Timeline {
  const startDate = timelineStartDate(fields);
  const columns = buildTwoYearNotionalColumns(startDate);
  const lanes: TimelineLane[] = [...mirrorYearOneLanes(adoptionTimeline)];

  fields.priorities.forEach((priority, priorityIndex) => {
    const activities = followOnActivities(fields, inventory, priority);
    if (!activities.length) return;
    const slot = Math.max(1, Math.floor(10 / activities.length));
    const duration = Math.max(1, Math.min(3, slot));
    const bars = activities.map((activity, index) => {
      const start = Math.min(columns.length, 13 + (priorityIndex % 2) + index * slot);
      const [safeStart, end] = boundedRange(start, duration, columns.length);
      return bar(`bar-follow-on-${priority}-${index + 1}`, safeStart, end, colorForWorkstreamType(capabilityLaneMetadata(priority).workstreamType), activity.label, false, false, activity.dependsOn, activity.outcome);
    });
      const metadata = capabilityLaneMetadata(priority);
      lanes.push({ id: `lane-follow-on-${priority}`, name: metadata.workstreamType, ...metadata, bars });
  });

  // Every notional remains continuous through Month 24; selected services are added alongside this standard sequence.
  lanes.push(...baselineYearTwoLanes());

  return applyWorkstreamPresentation({ cadence: "month", startDate, columns, lanes });
}

export function buildAdoptionPlans(fields: MinimalFields, inventory: InventorySummary): { adoptionTimeline: Timeline; twoYearPlan: Timeline; rationale: string } {
  const adoptionTimeline = buildPrimaryTimeline(fields, inventory);
  const twoYearPlan = buildTwoYearPlan(fields, inventory, adoptionTimeline);
  const estate = inventory.vmCount ? `${inventory.vmCount.toLocaleString()} VMs across ${inventory.hosts.toLocaleString()} hosts` : "the imported estate";
  const amount = fields.entitlementAmount ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(fields.entitlementAmount) : "the confirmed entitlement value";
  const term = fields.entitlementStart && fields.entitlementEnd ? `${fields.entitlementStart} through ${fields.entitlementEnd}` : "the confirmed entitlement term";
  const priorities = fields.priorities.length ? fields.priorities.map(capabilityTitle).join(", ") : "the selected customer outcomes";
  const cadence = fields.adoptionCadence === "week" ? "weekly execution windows" : "calendar-month execution windows";
  const detailCount = [fields.adoptionDetails.operations, fields.adoptionDetails.automation, fields.adoptionDetails.networking, fields.adoptionDetails.security, fields.adoptionDetails.resilience, fields.adoptionDetails.kubernetes, fields.adoptionDetails.privateAi].flat().length;
  const details = detailCount ? `${detailCount} selected detailed capability focus area${detailCount === 1 ? "" : "s"}` : "the initial customer outcome selections";
  const followOnCount = twoYearPlan.lanes.filter(lane => lane.id.startsWith("lane-follow-on-")).flatMap(lane => lane.bars).length;
  const followOnSummary = followOnCount
    ? `${followOnCount} selected follow-on service${followOnCount === 1 ? " is" : "s are"} included in the second-year delivery sequence`
    : "the standard second-year governance, platform operating model, and handover sequence is included";
  const platformInventorySummary = buildPlatformInventoryActivity(inventory).outcome;
  const rationale = `The operational Adoption Timeline is aligned to ${amount}, ${term}, ${estate}, ${cadence}, and ${details}. Platform inventory and delivery planning begins at the start of the target window and maintains one consolidated host inventory and delivery path before Upgrade Services begins. ${platformInventorySummary} The Two-Year Notional is a continuous 24-month view: months 1–12 mirror the operational sequence, while months 13–24 continue with the standard governance, platform, and handover sequence plus any selected services. ${followOnSummary}. Each recommendation states why it was selected, the intended outcome, and its required sequence; outstanding inputs are stated explicitly instead of creating a generic placeholder. Every lane and activity can be renamed, moved, resized, added, or removed.`;
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
  const upgradeRequiredPlatforms = hardwarePlatforms.filter(platform => platform.status === "upgrade-required");
  const candidatePlatforms = hardwarePlatforms.filter(platform => platform.status === "candidate");
  const unavailablePlatforms = hardwarePlatforms.filter(platform => platform.status === "unavailable");
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
    disclaimer: "These considerations summarize RVTools-observable inventory for planning. VCF 9.1 host preparation requires a release-note-supported ESX version, a uniform hardware profile, and one hardware vendor for the selected management domain. A candidate, upgrade-required, review-required, or unavailable platform result is not a VCF 9.1 certification. Confirm the exact server, CPU, NIC, HBA/controller, firmware, driver, storage, vSAN/ReadyNode, stateless-installation status, licensing, sizing, architecture, networking, identity, and implementation requirements through the Broadcom Compatibility Guide, the VCF 9.1 Planning and Preparation Workbook, and the appropriate CDW and vendor processes.",
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
  };
}

export function createDefaultDocument(): EngagementDocument {
  const fields = createDefaultFields();
  const inventory = emptyInventory();
  const readiness = assessReadiness(fields, inventory);
  const plans = buildAdoptionPlans(fields, inventory);
  return { version: 10, fields, inventorySources: [], inventory, readiness, adoptionTimeline: plans.adoptionTimeline, twoYearPlan: plans.twoYearPlan, rationale: plans.rationale };
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
    "hardware refresh": "Hardware Refresh",
    "modernize cloud": "Modernize Cloud",
    "operations": "Operations",
    "modernize infrastructure": "Modernize Infrastructure",
    "modernize security & reliance": "Modernize Security & Reliance",
    "modernize security and reliance": "Modernize Security & Reliance",
    "modernize app platform & ai": "Modernize App Platform & AI",
    "modernize app platform and ai": "Modernize App Platform & AI",
  };
  if (aliases[raw]) return aliases[raw];
  if (/(program|govern)/.test(raw)) return "Program Management & Governance";
  if (/hardware/.test(raw)) return "Hardware Refresh";
  if (/modernize.*cloud|cloud/.test(raw)) return "Modernize Cloud";
  if (/operations?/.test(raw)) return "Operations";
  if (/infrastructure/.test(raw)) return "Modernize Infrastructure";
  if (/(security|reliance)/.test(raw)) return "Modernize Security & Reliance";
  if (/(app|platform|ai)/.test(raw)) return "Modernize App Platform & AI";
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

export function migrateDocument(value: unknown): EngagementDocument {
  const normalizedValue = normalizeRawTimelineTaxonomy(value);
  const current = engagementDocumentV10Schema.safeParse(normalizedValue);
  if (current.success) {
    const normalizedAdoptionTimeline = normalizeTimelineTaxonomy(withConsolidatedPlatformInventory(current.data.adoptionTimeline, current.data.inventory));
    const generated = buildAdoptionPlans(current.data.fields, current.data.inventory);
    const adoptionTimeline = normalizedAdoptionTimeline.lanes.some(lane => lane.id === "lane-vcf-networking-nsx")
      ? normalizedAdoptionTimeline
      : { ...normalizedAdoptionTimeline, lanes: [...normalizedAdoptionTimeline.lanes, ...generated.adoptionTimeline.lanes.filter(lane => lane.id === "lane-vcf-networking-nsx")] };
    const candidateTwoYearPlan = normalizeTimelineTaxonomy(withoutLegacyHostPlatformTwoYearLanes(current.data.twoYearPlan));
    const continuousTwoYearPlan = hasYearTwoActivity(candidateTwoYearPlan) ? candidateTwoYearPlan : generated.twoYearPlan;
    const twoYearPlan = continuousTwoYearPlan.lanes.some(lane => lane.id === "lane-two-year-baseline-networking-nsx")
      ? continuousTwoYearPlan
      : { ...continuousTwoYearPlan, lanes: [...continuousTwoYearPlan.lanes, ...generated.twoYearPlan.lanes.filter(lane => lane.id === "lane-two-year-baseline-networking-nsx")] };
    return {
      ...current.data,
      readiness: assessReadiness(
        current.data.fields,
        current.data.inventory,
        current.data.inventorySources.flatMap(source => source.warnings),
      ),
      adoptionTimeline,
      twoYearPlan,
      rationale: generated.rationale,
    };
  }

  const v9 = engagementDocumentV9Schema.safeParse(normalizedValue);
  if (v9.success) {
    const plans = buildAdoptionPlans(v9.data.fields, v9.data.inventory);
    return {
      version: 10,
      fields: v9.data.fields,
      inventorySources: v9.data.inventorySources,
      inventory: v9.data.inventory,
      readiness: assessReadiness(v9.data.fields, v9.data.inventory, v9.data.inventorySources.flatMap(source => source.warnings)),
      adoptionTimeline: plans.adoptionTimeline,
      twoYearPlan: plans.twoYearPlan,
      rationale: plans.rationale,
    };
  }

  const v8 = engagementDocumentV8Schema.safeParse(normalizedValue);
  if (v8.success) {
    const plans = buildAdoptionPlans(v8.data.fields, v8.data.inventory);
    return {
      version: 10,
      fields: v8.data.fields,
      inventorySources: v8.data.inventorySources,
      inventory: v8.data.inventory,
      readiness: assessReadiness(v8.data.fields, v8.data.inventory, v8.data.inventorySources.flatMap(source => source.warnings)),
      adoptionTimeline: plans.adoptionTimeline,
      twoYearPlan: plans.twoYearPlan,
      rationale: plans.rationale,
    };
  }

  const v7 = engagementDocumentV7Schema.safeParse(normalizedValue);
  if (v7.success) {
    const plans = buildAdoptionPlans(v7.data.fields, v7.data.inventory);
    return {
      version: 10,
      fields: v7.data.fields,
      inventorySources: v7.data.inventorySources,
      inventory: v7.data.inventory,
      readiness: assessReadiness(v7.data.fields, v7.data.inventory, v7.data.inventorySources.flatMap(source => source.warnings)),
      adoptionTimeline: plans.adoptionTimeline,
      twoYearPlan: plans.twoYearPlan,
      rationale: plans.rationale,
    };
  }

  const v6 = engagementDocumentV6Schema.safeParse(normalizedValue);
  if (v6.success) {
    const fields = migrateFieldsToV7(v6.data.fields);
    const plans = buildAdoptionPlans(fields, v6.data.inventory);
    return {
      version: 10,
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
    const fields = migrateFieldsToV7(migrateFieldsToV6(v5.data.fields));
    const plans = buildAdoptionPlans(fields, v5.data.inventory);
    return {
      version: 10,
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
    const fields = migrateFieldsToV7(migrateFieldsToV6(v4.data.fields));
    const warnings = v4.data.inventorySources.flatMap(source => source.warnings);
    const plans = buildAdoptionPlans(fields, inventory);
    return {
      version: 10,
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
    const fields = migrateFieldsToV7(migrateFieldsToV6(v3.data.fields));
    const warnings = v3.data.inventorySources.flatMap(source => source.warnings);
    const plans = buildAdoptionPlans(fields, inventory);
    return {
      version: 10,
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
  const fields: MinimalFields = {
    ...createDefaultFields(),
    customerName: stringValue(oldFields.customerName),
    accountId: stringValue(oldFields.accountId || oldFields.cust),
    location: stringValue(oldFields.location || oldFields.cityState || oldFields.city),
    primaryContact: stringValue(oldFields.primaryContact),
    entitledCores: numberValue(oldFields.entitledCores || oldFields.entitlement),
    entitlementAmount: numberValue(oldFields.entitlementAmount || oldFields.entitlementValue || oldFields.funds),
    entitlementStart: stringValue(oldFields.entitlementStart || oldFields.termStart),
    entitlementEnd: stringValue(oldFields.entitlementEnd || oldFields.entitlementEndDate || oldFields.termEnd),
    targetStart: stringValue(oldFields.targetStart || oldFields.kickoffDate),
    targetComplete: stringValue(oldFields.targetComplete || oldFields.termEnd),
    hardwareAvailability: oldFields.hardwareAvailability === "existing" || oldFields.hardwareAvailability === "new" || oldFields.hardwareAvailability === "unknown" ? oldFields.hardwareAvailability : oldFields.hardwareIsNetNew === true ? "new" : oldFields.hardwareIsNetNew === false ? "existing" : "unknown",
    hardwareLeadWeeks: numberValue(oldFields.hardwareLeadWeeks) || numberValue(oldFields.hardwareLeadMonths) * 4,
    priorities: Array.isArray(oldFields.priorities) ? capabilitySchema.array().catch([]).parse(oldFields.priorities) : ["operations", "automation", ...(oldFields.vdefendInScope ? ["security" as const] : []), ...(oldFields.drInScope ? ["resilience" as const] : []), ...(oldFields.k8sInScope ? ["kubernetes" as const] : [])],
    timelineNotes: stringValue(oldFields.timelineNotes || oldFields.notes),
  };
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
    version: 10,
    fields,
    inventorySources: parsedSources.success ? parsedSources.data : [],
    inventory,
    readiness: assessReadiness(fields, inventory, ["Existing engagement updated to the detailed adoption-intake and cadence-aware plan format."]),
    adoptionTimeline: plans.adoptionTimeline,
    twoYearPlan: plans.twoYearPlan,
    rationale: plans.rationale,
  };
}

export const engagementDocumentSchema = z.preprocess(migrateDocument, engagementDocumentV10Schema);

export function refreshDerivedDocument(document: EngagementDocument): EngagementDocument {
  const warnings = document.inventorySources.flatMap(source => source.warnings);
  const plans = buildAdoptionPlans(document.fields, document.inventory);
  return { ...document, readiness: assessReadiness(document.fields, document.inventory, warnings), adoptionTimeline: plans.adoptionTimeline, twoYearPlan: plans.twoYearPlan, rationale: plans.rationale };
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
