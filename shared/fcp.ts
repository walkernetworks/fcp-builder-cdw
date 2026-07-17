import { z } from "zod";

export const TIMELINE_COLORS = ["slate", "blue", "teal", "amber", "red", "green", "gate", "deferred"] as const;
export type TimelineColor = (typeof TIMELINE_COLORS)[number];

export const timelineBarSchema = z.object({
  id: z.string().min(1),
  startCol: z.number().int().min(1),
  endCol: z.number().int().min(2),
  color: z.enum(TIMELINE_COLORS),
  label: z.string().min(1),
  milestone: z.boolean().default(false),
  deferred: z.boolean().default(false),
});

export const timelineLaneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  bars: z.array(timelineBarSchema),
});

export const timelineSchema = z.object({
  columns: z.array(z.string().min(1)).min(2).max(36),
  lanes: z.array(timelineLaneSchema).min(1),
});

export type TimelineBar = z.infer<typeof timelineBarSchema>;
export type TimelineLane = z.infer<typeof timelineLaneSchema>;
export type Timeline = z.infer<typeof timelineSchema>;

export const capabilitySchema = z.enum(["operations", "automation", "security", "resilience", "kubernetes", "private-ai"]);
export type Capability = z.infer<typeof capabilitySchema>;

export const minimalFieldsSchema = z.object({
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
export type MinimalFields = z.infer<typeof minimalFieldsSchema>;

export const inventorySourceSchema = z.object({
  id: z.string(),
  filename: z.string(),
  byteSize: z.number().int().nonnegative(),
  sheets: z.array(z.string()),
  importedAt: z.string(),
  warnings: z.array(z.string()),
});

export const inventoryHostModelSchema = z.object({
  vendor: z.string(),
  model: z.string(),
  cpuModel: z.string(),
  hosts: z.number().int().nonnegative(),
  physicalCores: z.number().int().nonnegative(),
});

export const inventoryVersionSchema = z.object({ version: z.string(), hosts: z.number().int().nonnegative() });

export const inventorySummarySchema = z.object({
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
  hostModels: z.array(inventoryHostModelSchema),
  esxiVersions: z.array(inventoryVersionSchema),
  guestOperatingSystems: z.array(z.object({ name: z.string(), vms: z.number().int().nonnegative() })),
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

export const readinessSchema = z.object({
  generatedAt: z.string(),
  label: z.literal("Inventory-Informed VCF 9.1 Planning Considerations"),
  items: z.array(readinessItemSchema),
  disclaimer: z.string(),
});
export type ReadinessAssessment = z.infer<typeof readinessSchema>;

export const engagementDocumentV3Schema = z.object({
  version: z.literal(3),
  fields: minimalFieldsSchema,
  inventorySources: z.array(inventorySourceSchema),
  inventory: inventorySummarySchema,
  readiness: readinessSchema,
  adoptionTimeline: timelineSchema,
  twoYearPlan: timelineSchema,
  rationale: z.string(),
});
export type EngagementDocument = z.infer<typeof engagementDocumentV3Schema>;

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
  };
}

function bar(id: string, startCol: number, endCol: number, color: TimelineColor, label: string, milestone = false, deferred = false): TimelineBar {
  return { id, startCol, endCol, color, label, milestone, deferred };
}

function parseMonth(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (!Number.isInteger(year) || month < 0 || month > 11) return null;
  return new Date(Date.UTC(year, month, 1));
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
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

export function buildTwoYearColumns(startValue: string): string[] {
  const start = parseMonth(startValue) || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  return Array.from({ length: 24 }, (_, index) => displayMonth(addUtcMonths(start, index)));
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
  return /\b(plan|design)\b/i.test(titled) ? titled : `${titled} Plan`;
}

export function normalizeWorkstreamLabel(value: string): string {
  const cleaned = value.trim().replace(/\b(workshop|readiness|assessment|validation)\b/gi, "plan");
  return titleCase(cleaned || "Custom Workstream");
}

function buildPrimaryTimeline(fields: MinimalFields): Timeline {
  const columns = buildMonthColumns(fields.entitlementStart || fields.targetStart, fields.entitlementEnd || fields.targetComplete, 12, 36);
  const count = columns.length;
  const planDuration = Math.max(2, Math.min(4, Math.ceil(count * 0.2)));
  const designDuration = Math.max(2, Math.min(6, Math.ceil(count * 0.3)));
  const [planStart, planEnd] = boundedRange(1, planDuration, count);
  const [platformStart, platformEnd] = boundedRange(Math.max(2, planEnd - 1), designDuration, count);
  const lanes: TimelineLane[] = [
    { id: "lane-plan", name: "Consumption Plan", bars: [bar("bar-consumption-plan", planStart, planEnd, "blue", "Functional Consumption Plan")] },
    { id: "lane-platform-design", name: "Platform Design", bars: [bar("bar-platform-design", platformStart, platformEnd, "teal", "VCF Platform Design")] },
  ];

  fields.priorities.forEach((priority, index) => {
    const start = Math.min(count - 1, Math.max(2, platformStart + 1 + (index % 3)));
    const duration = Math.max(2, Math.min(5, Math.ceil(count * 0.22)));
    const [capStart, capEnd] = boundedRange(start, duration, count);
    const title = capabilityTitle(priority);
    lanes.push({
      id: `lane-${priority}`,
      name: `${title} Design`,
      bars: [bar(`bar-${priority}`, capStart, capEnd, priority === "security" ? "red" : priority === "resilience" ? "blue" : priority === "automation" ? "amber" : "green", `${title} Design`)],
    });
  });

  return { columns, lanes };
}

function buildTwoYearPlan(fields: MinimalFields): Timeline {
  const columns = buildTwoYearColumns(fields.entitlementStart || fields.targetStart);
  const lanes: TimelineLane[] = [
    {
      id: "lane-two-year-plan",
      name: "Consumption Plan",
      bars: [
        bar("bar-year-one-plan", 1, 5, "blue", "Year 1 Consumption Plan"),
        bar("bar-year-two-plan", 13, 17, "slate", "Year 2 Consumption Plan"),
      ],
    },
    {
      id: "lane-two-year-platform",
      name: "Platform Design",
      bars: [
        bar("bar-year-one-platform", 3, 9, "teal", "Core Platform Design"),
        bar("bar-year-two-platform", 15, 22, "green", "Expansion Design"),
      ],
    },
  ];

  fields.priorities.forEach((priority, index) => {
    const title = capabilityTitle(priority);
    const start = 6 + (index % 4) * 2;
    const end = Math.min(25, start + 6);
    lanes.push({
      id: `lane-two-year-${priority}`,
      name: `${title} Design`,
      bars: [bar(`bar-two-year-${priority}`, start, end, priority === "security" ? "red" : priority === "automation" ? "amber" : "blue", `${title} Design`)],
    });
  });

  return { columns, lanes };
}

export function buildAdoptionPlans(fields: MinimalFields, inventory: InventorySummary): { adoptionTimeline: Timeline; twoYearPlan: Timeline; rationale: string } {
  const adoptionTimeline = buildPrimaryTimeline(fields);
  const twoYearPlan = buildTwoYearPlan(fields);
  const estate = inventory.vmCount ? `${inventory.vmCount.toLocaleString()} VMs across ${inventory.hosts.toLocaleString()} hosts` : "the imported estate";
  const amount = fields.entitlementAmount ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(fields.entitlementAmount) : "the confirmed entitlement value";
  const term = fields.entitlementStart && fields.entitlementEnd ? `${fields.entitlementStart} through ${fields.entitlementEnd}` : "the confirmed entitlement term";
  const priorities = fields.priorities.length ? fields.priorities.map(capabilityTitle).join(", ") : "the selected customer outcomes";
  const rationale = `The adoption plan is aligned to ${amount}, ${term}, ${estate}, and the selected outcomes: ${priorities}. The recommendation contains planning and design activities only. Every lane and activity can be renamed, moved, resized, added, or removed.`;
  return { adoptionTimeline, twoYearPlan, rationale };
}

export function buildTimeline(fields: MinimalFields, inventory: InventorySummary): { timeline: Timeline; rationale: string } {
  const plans = buildAdoptionPlans(fields, inventory);
  return { timeline: plans.adoptionTimeline, rationale: plans.rationale };
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

  const legacyHosts = inventory.esxiVersions.filter(item => /^(?:[0-7])(?:\.|$)/.test(item.version.trim())).reduce((sum, item) => sum + item.hosts, 0);
  const v8Hosts = inventory.esxiVersions.filter(item => /^8(?:\.|$)/.test(item.version.trim())).reduce((sum, item) => sum + item.hosts, 0);
  const v9Hosts = inventory.esxiVersions.filter(item => /^9(?:\.|$)/.test(item.version.trim())).reduce((sum, item) => sum + item.hosts, 0);
  items.push({
    id: "software-baseline",
    category: "software",
    status: legacyHosts ? "attention" : v9Hosts ? "good" : v8Hosts ? "info" : "unknown",
    title: "vSphere Software Baseline",
    detail: legacyHosts ? `${legacyHosts} host(s) report ESXi 7.x or older.` : v9Hosts ? `${v9Hosts} host(s) report a 9.x ESXi baseline.` : v8Hosts ? `${v8Hosts} host(s) report ESXi 8.x.` : "ESXi versions were not available.",
    evidence: inventory.esxiVersions.map(item => `${item.version}: ${item.hosts}`).join("; ") || "No vHost version data",
  });

  items.push({
    id: "hardware-compatibility",
    category: "hardware",
    status: inventory.hostModels.length ? "unknown" : "attention",
    title: "Hardware Compatibility Lookup",
    detail: inventory.hostModels.length ? "Vendor, model, and CPU details are available for an official compatibility check." : "Host vendor and model data are missing.",
    evidence: inventory.hostModels.slice(0, 6).map(item => `${item.vendor} ${item.model} (${item.hosts})`).join("; ") || "No host model data",
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
    disclaimer: "These considerations summarize RVTools-observable inventory for planning. Confirm compatibility, licensing, sizing, architecture, networking, identity, and implementation requirements through the appropriate CDW and vendor processes.",
  };
}

export function createDefaultDocument(): EngagementDocument {
  const fields = createDefaultFields();
  const inventory = emptyInventory();
  const readiness = assessReadiness(fields, inventory);
  const plans = buildAdoptionPlans(fields, inventory);
  return { version: 3, fields, inventorySources: [], inventory, readiness, adoptionTimeline: plans.adoptionTimeline, twoYearPlan: plans.twoYearPlan, rationale: plans.rationale };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function numberValue(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

export function migrateDocument(value: unknown): EngagementDocument {
  const current = engagementDocumentV3Schema.safeParse(value);
  if (current.success) return current.data;
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
  const parsedInventory = inventorySummarySchema.safeParse(legacy.inventory);
  const inventory = parsedInventory.success ? parsedInventory.data : emptyInventory();
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
    version: 3,
    fields,
    inventorySources: parsedSources.success ? parsedSources.data : [],
    inventory,
    readiness: assessReadiness(fields, inventory, ["Existing engagement updated to the calendar-month adoption-plan format."]),
    adoptionTimeline: plans.adoptionTimeline,
    twoYearPlan: plans.twoYearPlan,
    rationale: plans.rationale,
  };
}

export const engagementDocumentSchema = z.preprocess(migrateDocument, engagementDocumentV3Schema);

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
