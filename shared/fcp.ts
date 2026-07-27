import { z } from "zod";

export const TIMELINE_COLORS = ["slate", "blue", "teal", "amber", "red", "green", "gate", "deferred"] as const;
export type TimelineColor = (typeof TIMELINE_COLORS)[number];

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

export const capabilitySchema = z.enum(["operations", "automation", "security", "resilience", "kubernetes", "private-ai"]);
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
const securityFocusSchema = z.enum(["segmentation", "identity-rbac", "hardening-compliance"]);
const resilienceFocusSchema = z.enum(["recovery-architecture", "recovery-exercises", "cyber-recovery"]);
const kubernetesFocusSchema = z.enum(["workload-domains", "platform-operations", "developer-experience"]);
const privateAiFocusSchema = z.enum(["gpu-capacity", "ai-guardrails", "pilot-onboarding"]);

const adoptionDetailsV6Schema = z.object({
  upgradePath: upgradePathSchema,
  operations: z.array(operationsFocusSchema).max(6),
  automation: z.array(automationFocusSchema).max(5),
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
});

const inventorySummaryBaseSchema = z.object({
  sourceCount: z.number().int().nonnegative(),
  datacenters: z.number().int().nonnegative(),
  clusters: z.number().int().nonnegative(),
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

function capabilityColor(capability: Capability): TimelineColor {
  return capability === "security" ? "red" : capability === "resilience" ? "blue" : capability === "automation" ? "amber" : capability === "operations" ? "teal" : "green";
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
    "gpu-capacity": "AI Capacity and GPU Readiness",
    "ai-guardrails": "Private AI Guardrails",
    "pilot-onboarding": "Private AI Pilot Onboarding",
  },
};

function selectedFocuses(fields: MinimalFields, capability: Capability): string[] {
  const detailKey: Record<Capability, keyof Omit<AdoptionDetails, "upgradePath" | "notes" | "industryTemplate">> = {
    operations: "operations",
    automation: "automation",
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

function buildPrimaryTimeline(fields: MinimalFields): Timeline {
  const columns = primaryColumns(fields);
  const count = columns.length;
  const cadence = fields.adoptionCadence;
  const upgradeDuration = Math.max(2, Math.min(count, Math.ceil(count * 0.36)));
  const planDuration = Math.max(2, Math.min(count, Math.ceil(count * 0.22)));
  const designDuration = Math.max(2, Math.min(count, Math.ceil(count * 0.3)));
  const [upgradeStart, upgradeEnd] = boundedRange(1, upgradeDuration, count);
  const [planStart, planEnd] = boundedRange(1, planDuration, count);
  const [platformStart, platformEnd] = boundedRange(Math.max(2, planEnd - 1), designDuration, count);
  const lanes: TimelineLane[] = [
    { id: "lane-upgrade-services", name: "Upgrade Services", bars: [bar("bar-vcf-upgrade-services", upgradeStart, upgradeEnd, "blue", upgradeServiceLabel(fields.adoptionDetails.upgradePath))] },
    { id: "lane-platform-plan", name: "Platform Plan", bars: [bar("bar-platform-plan", planStart, planEnd, "teal", "Platform Plan and Decision Log")] },
    { id: "lane-platform-design", name: "Platform Design", bars: [bar("bar-platform-design", platformStart, platformEnd, "green", "VCF Platform Design") ] },
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
        return bar(`bar-${priority}-${laneIndex * labelsPerLane + index + 1}`, start, end, capabilityColor(priority), label);
      });
      const suffix = laneCount > 1 ? ` ${laneIndex + 1}` : "";
      const laneId = laneIndex === 0 ? `lane-${priority}` : `lane-${priority}-${laneIndex + 1}`;
      lanes.push({ id: laneId, name: `${capabilityTitle(priority)} Outcomes${suffix}`, bars });
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
    lifecycle: { label: "VCF Lifecycle Management and Change Governance", outcome: "Set up a repeatable lifecycle calendar, change approvals, certificate ownership, and exception reviews for the VCF platform.", entryCondition: "the lifecycle owner, maintenance window, and supported upgrade path are confirmed" },
    observability: { label: "Operations Telemetry and Service Health Reviews", outcome: "Use health, log, and diagnostic data to define service objectives, diagnostic patterns, and quarterly operational reviews.", entryCondition: "operational telemetry and an accountable operations team are available" },
    "capacity-cost": { label: "Capacity Forecasting and Cost Optimization", outcome: "Run rightsizing, forecasting, and cost-governance cycles against established capacity data.", entryCondition: "capacity data, cost owners, and a review cadence are confirmed", eligibility: { requiresObservedInventory: true } },
    "custom-dashboards": { label: "Operations Dashboards With Ownership and Review", outcome: "Publish governed dashboards with support-team ownership, service measures, and a review cadence.", entryCondition: "the dashboards, data sources, and ownership model are accepted", eligibility: { requiresAllFocuses: ["observability"], requiresObservedInventory: true } },
    "identity-certificates": { label: "Identity, Credential, and Certificate Operations", outcome: "Operate identity, credential, and certificate hygiene with ownership, evidence, and exception procedures.", entryCondition: "privileged-access owners and approved operating procedures are confirmed" },
    "event-integration": { label: "Event-to-Incident Integration and Escalation", outcome: "Route prioritized events into incident workflows with escalation paths and service-level reporting.", entryCondition: "the ITSM or event target, severity model, and resolver groups are agreed" },
  },
  automation: {
    "vm-self-service": { label: "Launch a Governed VM Self-Service Catalog", outcome: "Launch a measured catalog for selected tenants with quotas, approvals, and support ownership.", entryCondition: "catalog blueprints, tenancy rules, and a support handoff are accepted" },
    "infrastructure-as-code": { label: "Infrastructure-as-Code Blueprint Factory and Release Controls", outcome: "Establish reusable blueprints, source control, policy controls, and release practices.", entryCondition: "a source-control workflow, security review, and content owners are available" },
    "day-2-automation": { label: "Operate Day-2 Remediation and Maintenance Automation", outcome: "Operationalize priority remediation and maintenance automations with runbook and rollback controls.", entryCondition: "priority workflows, approval paths, and rollback owners are confirmed" },
    governance: { label: "Tenant, Quota, and Policy Governance", outcome: "Run tenant, quota, policy, and exception governance as an ongoing operating practice.", entryCondition: "the tenant model, quota policy, and exception authority are confirmed", eligibility: { requiresAnyFocus: ["vm-self-service", "infrastructure-as-code"] } },
    "application-provisioning": { label: "Onboard the First Application Team to the Platform", outcome: "Onboard a first application team through governed blueprints and a supported delivery path.", entryCondition: "a sponsored workload, application team, and service support model are confirmed", eligibility: { requiresAnyFocus: ["vm-self-service", "infrastructure-as-code"] } },
  },
  security: {
    segmentation: { label: "Segment Workloads in Prioritized Rollout Waves", outcome: "Apply and tune segmentation in prioritized workload waves with outcome review.", entryCondition: "wave scope, application dependencies, and change authority are confirmed", eligibility: { requiresObservedInventory: true } },
    "identity-rbac": { label: "Run Access Reviews and Role Recertification", outcome: "Operate access reviews, role recertification, and privilege-exception handling.", entryCondition: "role owners, a review cadence, and evidence requirements are confirmed" },
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
    "gpu-capacity": { label: "Validate GPU Capacity and Resilience for an AI Workload Domain", outcome: "Validate capacity, performance, backup and restore, and disaster-recovery posture for an approved GPU workload domain.", entryCondition: "GPU hardware, workload profile, sizing evidence, and a capacity owner are confirmed", eligibility: { requiresKnownHardwarePlan: true } },
    "ai-guardrails": { label: "Define Private AI Data Boundaries and Governance", outcome: "Define data access, model, security, audit, and operating guardrails for a candidate use case.", entryCondition: "a business use case, data classification, security owner, and governance authority are confirmed", eligibility: { requiresAllFocuses: ["gpu-capacity"], requiresKnownHardwarePlan: true } },
    "pilot-onboarding": { label: "Onboard One Private AI Pilot With Success Measures", outcome: "Onboard one approved pilot with success metrics, support ownership, and exit criteria.", entryCondition: "the use case, data boundary, GPU and platform readiness, and support model are approved", eligibility: { requiresAllFocuses: ["gpu-capacity", "ai-guardrails"], requiresKnownHardwarePlan: true } },
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

function followOnRecommendationReason(fields: MinimalFields, inventory: InventorySummary, capability: Capability, focus: string, profile: FollowOnServiceProfile): string | null {
  const focuses = selectedFocuses(fields, capability);
  const eligibility = profile.eligibility;
  const estateSignal = estateRecommendationSignal(fields, inventory);
  const hasObservedInventory = inventory.vmCount > 0 || inventory.hosts > 0;
  if (!estateSignal) return null;
  if (eligibility?.requiresObservedInventory && !hasObservedInventory) return null;
  if (eligibility?.requiresKnownHardwarePlan && fields.hardwareAvailability === "unknown") return null;
  if (eligibility?.requiresAllFocuses?.some(required => !focuses.includes(required))) return null;
  const supportingAnyFocus = eligibility?.requiresAnyFocus?.find(required => focuses.includes(required));
  if (eligibility?.requiresAnyFocus?.length && !supportingAnyFocus) return null;

  const contributingFocuses = [focus, ...(eligibility?.requiresAllFocuses || []), ...(supportingAnyFocus ? [supportingAnyFocus] : [])]
    .filter((item, index, values) => values.indexOf(item) === index)
    .map(item => focusTitle(capability, item));
  return `the customer selected ${humanList(contributingFocuses)} under the ${capabilityTitle(capability)} priority and ${estateSignal}`;
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
    bars: lane.bars.flatMap(item => {
      const startCol = Math.max(1, normalizeStart(item.startCol));
      const endCol = Math.min(13, Math.max(startCol + 1, normalizeEnd(item.endCol)));
      if (startCol >= 13 || endCol <= startCol) return [];
      return [{ ...item, id: `bar-two-year-year-one-${item.id}`, startCol, endCol }];
    }),
  }));
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
      return bar(`bar-follow-on-${priority}-${index + 1}`, safeStart, end, capabilityColor(priority), activity.label, false, false, activity.dependsOn, activity.outcome);
    });
    lanes.push({ id: `lane-follow-on-${priority}`, name: `${capabilityTitle(priority)} Services`, bars });
  });

  return { cadence: "month", startDate, columns, lanes };
}

export function buildAdoptionPlans(fields: MinimalFields, inventory: InventorySummary): { adoptionTimeline: Timeline; twoYearPlan: Timeline; rationale: string } {
  const adoptionTimeline = buildPrimaryTimeline(fields);
  const twoYearPlan = buildTwoYearPlan(fields, inventory, adoptionTimeline);
  const estate = inventory.vmCount ? `${inventory.vmCount.toLocaleString()} VMs across ${inventory.hosts.toLocaleString()} hosts` : "the imported estate";
  const amount = fields.entitlementAmount ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(fields.entitlementAmount) : "the confirmed entitlement value";
  const term = fields.entitlementStart && fields.entitlementEnd ? `${fields.entitlementStart} through ${fields.entitlementEnd}` : "the confirmed entitlement term";
  const priorities = fields.priorities.length ? fields.priorities.map(capabilityTitle).join(", ") : "the selected customer outcomes";
  const cadence = fields.adoptionCadence === "week" ? "weekly execution windows" : "calendar-month execution windows";
  const detailCount = [fields.adoptionDetails.operations, fields.adoptionDetails.automation, fields.adoptionDetails.security, fields.adoptionDetails.resilience, fields.adoptionDetails.kubernetes, fields.adoptionDetails.privateAi].flat().length;
  const details = detailCount ? `${detailCount} confirmed detailed capability focus area${detailCount === 1 ? "" : "s"}` : "high-level outcome selections pending detailed discovery";
  const followOnCount = twoYearPlan.lanes.filter(lane => lane.id.startsWith("lane-follow-on-")).flatMap(lane => lane.bars).length;
  const followOnSummary = followOnCount
    ? `${followOnCount} follow-on service recommendation${followOnCount === 1 ? " is" : "s are"} shown because the related priority, detailed intake selection, and estate or hardware signal are present`
    : "no follow-on services are shown until a confirmed priority, detailed intake selection, and usable estate or hardware signal align";
  const rationale = `The operational Adoption Timeline is aligned to ${amount}, ${term}, ${estate}, ${cadence}, and ${details}. Upgrade Services begins at the start of the target window while initial platform planning and design work run in parallel. The Two-Year Notional is a continuous 24-month view: months 1–12 mirror the operational sequence, while months 13–24 contain only selective services. ${followOnSummary}. Each recommendation states why it was selected, the intended outcome, and what must be ready before it starts; unmet prerequisites defer the service instead of creating a generic placeholder. Every lane and activity can be renamed, moved, resized, added, or removed.`;
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
  const esxiVersions = platform.esxiVersions;
  const esxiCorrelation = platform.esxiCorrelation;
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
      status: "unavailable",
      detail: `A VCF 9.1 platform precheck cannot be formed because RVTools did not provide a usable vendor and model.${esxiDetail}`,
      nextAction: "Collect the server make, model, CPU, BIOS, firmware, adapter, and storage-controller details before compatibility review.",
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
      status: "upgrade-required",
      detail: `This legacy Dell PowerEdge generation should be treated as a replacement or exception decision for VCF 9.1 planning, not as an assumed in-place upgrade target.${esxiDetail}`,
      nextAction: "Validate the exact configuration in the Broadcom Compatibility Guide and determine the replacement, repurpose, or exception path before the Upgrade Services workstream begins.",
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
      status: "candidate",
      detail: `This current-generation Dell PowerEdge model is a candidate for VCF 9.1 infrastructure validation; RVTools alone cannot establish a supported server configuration.${esxiDetail}`,
      nextAction: "Validate the exact server, CPU, NIC, storage controller, firmware, driver, and vSAN/ReadyNode requirements in the Broadcom Compatibility Guide.",
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
    status: "review-required",
    detail: `RVTools provides a usable platform identity, but no deterministic VCF 9.1 outcome can be inferred from this model alone.${esxiDetail}`,
    nextAction: "Validate the exact server, CPU, adapters, storage controllers, firmware, drivers, and vSAN/ReadyNode requirements in the Broadcom Compatibility Guide.",
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
    status: legacyHosts ? "attention" : v9Hosts ? "good" : v8Hosts ? "info" : hasEsxiEvidence ? "info" : "unknown",
    title: "vSphere Software Baseline",
    detail: legacyHosts
      ? `${legacyHosts} host(s) report ESXi 7.x or older.`
      : v9Hosts
        ? `${v9Hosts} host(s) report a 9.x or later ESXi baseline.`
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
          : "Platform identities are available for a VCF 9.1 compatibility review, but RVTools cannot determine final certification.",
    evidence: hardwarePlatforms.map(platform => `${platform.vendor} ${platform.model} (${platform.hosts}): ${platform.status}`).join("; ") || "No host model data",
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
    disclaimer: "These considerations summarize RVTools-observable inventory for planning. A candidate, upgrade-required, review-required, or unavailable platform result is not a VCF 9.1 certification. Confirm the exact server, CPU, NIC, HBA/controller, firmware, driver, vSAN/ReadyNode, licensing, sizing, architecture, networking, identity, and implementation requirements through the Broadcom Compatibility Guide and the appropriate CDW and vendor processes.",
  };
}

function migrateInventoryToV5(inventory: z.infer<typeof inventorySummaryV4Schema>): InventorySummary {
  return {
    ...inventory,
    hostModels: inventory.hostModels.map(platform => ({
      ...platform,
      esxiVersions: inventory.esxiVersions,
      esxiCorrelation: inventory.esxiVersions.length ? "estate-wide" as const : "unavailable" as const,
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

export function migrateDocument(value: unknown): EngagementDocument {
  const current = engagementDocumentV10Schema.safeParse(value);
  if (current.success) {
    return {
      ...current.data,
      readiness: assessReadiness(
        current.data.fields,
        current.data.inventory,
        current.data.inventorySources.flatMap(source => source.warnings),
      ),
    };
  }

  const v9 = engagementDocumentV9Schema.safeParse(value);
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

  const v8 = engagementDocumentV8Schema.safeParse(value);
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

  const v7 = engagementDocumentV7Schema.safeParse(value);
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

  const v6 = engagementDocumentV6Schema.safeParse(value);
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

  const v5 = engagementDocumentV5Schema.safeParse(value);
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

  const v4 = engagementDocumentV4Schema.safeParse(value);
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

  const v3 = engagementDocumentV3Schema.safeParse(value);
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

  const legacy = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
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
