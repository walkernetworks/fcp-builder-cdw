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
  columns: z.array(z.string().min(1)).min(2).max(12),
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
  label: z.literal("Inventory-informed VCF 9.1 pre-assessment"),
  items: z.array(readinessItemSchema),
  disclaimer: z.string(),
});
export type ReadinessAssessment = z.infer<typeof readinessSchema>;

export const engagementDocumentV2Schema = z.object({
  version: z.literal(2),
  fields: minimalFieldsSchema,
  inventorySources: z.array(inventorySourceSchema),
  inventory: inventorySummarySchema,
  readiness: readinessSchema,
  timeline: timelineSchema,
  rationale: z.string(),
});
export type EngagementDocument = z.infer<typeof engagementDocumentV2Schema>;

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

export function estimateMigrationWaves(vmCount: number): number {
  if (!Number.isFinite(vmCount) || vmCount <= 0) return 2;
  if (vmCount <= 400) return 2;
  if (vmCount <= 1600) return 3;
  if (vmCount <= 3000) return 4;
  return 5;
}

function phaseColumns(fields: MinimalFields): string[] {
  const start = fields.targetStart ? `Start · ${fields.targetStart}` : "Confirm";
  const complete = fields.targetComplete ? `Target · ${fields.targetComplete}` : "Operate";
  return fields.hardwareAvailability === "new" && fields.hardwareLeadWeeks > 0
    ? [start, `Hardware · ~${fields.hardwareLeadWeeks} wk`, "Validate", "Foundation", "Wave 1", "Wave 2", "Modernize", complete]
    : [start, "Validate", "Foundation", "Wave 1", "Wave 2", "Stabilize", "Modernize", complete];
}

export function buildTimeline(fields: MinimalFields, inventory: InventorySummary): { timeline: Timeline; rationale: string } {
  const columns = phaseColumns(fields);
  const last = columns.length + 1;
  const hardwareGate = fields.hardwareAvailability === "new" && fields.hardwareLeadWeeks > 0;
  const validateStart = 2;
  const foundationStart = hardwareGate ? 4 : 3;
  const migrationStart = foundationStart + 1;
  const waves = estimateMigrationWaves(inventory.poweredOnVms || inventory.vmCount);
  const versionAttention = inventory.esxiVersions.some(item => /^(?:[0-7])(?:\.|$)/.test(item.version.trim()));
  const lanes: TimelineLane[] = [
    {
      id: "lane-validate",
      name: "Validate & Plan",
      bars: [
        bar("bar-inventory", 1, validateStart, "blue", "Reconcile RVTools inventory, entitlement cores, HCL and VCF planning workbook", true),
        bar("bar-decisions", validateStart, foundationStart, "slate", "Confirm architecture, networking, identity and operating decisions"),
      ],
    },
  ];

  if (hardwareGate) {
    lanes.push({
      id: "lane-hardware",
      name: "Hardware Readiness",
      bars: [
        bar("bar-hardware-order", 1, 2, "gate", "Approve supported hardware and place order", true),
        bar("bar-hardware-lead", 2, foundationStart, "amber", `Procurement and delivery · approximately ${fields.hardwareLeadWeeks} weeks`),
      ],
    });
  }

  lanes.push(
    {
      id: "lane-foundation",
      name: "VCF Foundation",
      bars: [
        bar("bar-foundation", foundationStart, migrationStart, versionAttention ? "red" : "teal", versionAttention ? "Remediate legacy vSphere and establish VCF 9.1 foundation" : "Establish or validate VCF 9.1 foundation", true),
        bar("bar-lifecycle", migrationStart, last, "green", "Lifecycle, operations and capacity governance"),
      ],
    },
    {
      id: "lane-workloads",
      name: "Workload Transition",
      bars: [
        bar("bar-pilot", migrationStart, migrationStart + 1, "blue", "Pilot mobility group and rollback validation", true),
        bar("bar-waves", migrationStart + 1, Math.min(last - 1, migrationStart + Math.max(3, waves)), "amber", `${waves} workload migration waves`),
        bar("bar-stabilize", Math.min(last - 1, migrationStart + Math.max(3, waves)), last, "green", "Stabilize and optimize"),
      ],
    },
  );

  if (fields.priorities.includes("automation") || fields.priorities.includes("operations")) {
    lanes.push({ id: "lane-consumption", name: "Cloud Consumption", bars: [bar("bar-consumption", foundationStart, last, "teal", "Operations, automation and governed self-service adoption")] });
  }
  if (fields.priorities.includes("security")) {
    lanes.push({ id: "lane-security", name: "Security", bars: [bar("bar-security", validateStart, last - 1, "red", "Security design, segmentation, policy and enforcement")] });
  }
  if (fields.priorities.includes("resilience")) {
    lanes.push({ id: "lane-resilience", name: "Resilience", bars: [bar("bar-resilience", validateStart, last - 1, "blue", "Recovery requirements, architecture, implementation and exercise", true)] });
  }
  if (fields.priorities.includes("kubernetes") || fields.priorities.includes("private-ai")) {
    const labels = [fields.priorities.includes("kubernetes") ? "Kubernetes" : "", fields.priorities.includes("private-ai") ? "private AI" : ""].filter(Boolean).join(" and ");
    lanes.push({ id: "lane-modern-apps", name: "Modern Applications", bars: [bar("bar-modern-apps", Math.max(foundationStart + 1, last - 3), last, "deferred", `${labels} enablement after foundation readiness`, false, true)] });
  }

  const estate = inventory.vmCount ? `${inventory.vmCount.toLocaleString()} VMs on ${inventory.hosts.toLocaleString()} hosts` : "the imported estate";
  const hardwareText = hardwareGate ? ` Hardware availability introduces an approximately ${fields.hardwareLeadWeeks}-week gate.` : " No confirmed procurement gate has been added.";
  const rationale = `This deterministic plan uses ${estate}, ${inventory.physicalCores.toLocaleString()} observed physical cores, software-version signals, selected outcomes, and the target window. It sequences validation before foundation changes, then a pilot and ${waves} migration waves.${hardwareText} Compatibility, network, identity, and detailed VCF design remain explicit human validations.`;
  return { timeline: { columns, lanes }, rationale };
}

export function assessReadiness(fields: MinimalFields, inventory: InventorySummary, sourceWarnings: string[] = []): ReadinessAssessment {
  const items: ReadinessItem[] = [];
  items.push({
    id: "inventory-coverage",
    category: "inventory",
    status: inventory.hosts > 0 && inventory.vmCount > 0 ? (sourceWarnings.length ? "attention" : "good") : "attention",
    title: "RVTools inventory coverage",
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
    title: "vSphere software baseline",
    detail: legacyHosts ? `${legacyHosts} host(s) report ESXi 7.x or older and need a modernization path before VCF 9.1.` : v9Hosts ? `${v9Hosts} host(s) report a 9.x ESXi baseline.` : v8Hosts ? `${v8Hosts} host(s) report ESXi 8.x; validate the supported VCF 9.1 import or upgrade path.` : "ESXi versions were not available.",
    evidence: inventory.esxiVersions.map(item => `${item.version}: ${item.hosts}`).join("; ") || "No vHost version data",
  });

  items.push({
    id: "hardware-compatibility",
    category: "hardware",
    status: inventory.hostModels.length ? "unknown" : "attention",
    title: "Broadcom hardware compatibility",
    detail: inventory.hostModels.length ? "Vendor, model, and CPU details are available for an official Broadcom Compatibility Guide check. RVTools cannot certify support." : "Host vendor/model data is missing; collect it before compatibility validation.",
    evidence: inventory.hostModels.slice(0, 6).map(item => `${item.vendor} ${item.model} (${item.hosts})`).join("; ") || "No host model data",
  });

  const capacityAttention = inventory.highCpuHosts + inventory.highMemoryHosts + inventory.overcommittedDatastores;
  items.push({
    id: "capacity-signals",
    category: "capacity",
    status: capacityAttention ? "attention" : inventory.hosts ? "info" : "unknown",
    title: "Point-in-time capacity signals",
    detail: capacityAttention ? `${inventory.highCpuHosts} high-CPU host(s), ${inventory.highMemoryHosts} high-memory host(s), and ${inventory.overcommittedDatastores} heavily provisioned datastore(s) were observed.` : "No simple point-in-time threshold exceptions were observed; use VCF Operations history for sizing.",
    evidence: "RVTools is a point-in-time inventory and is not a substitute for performance or growth analysis.",
  });

  const delta = fields.entitledCores - inventory.physicalCores;
  items.push({
    id: "core-entitlement",
    category: "licensing",
    status: !fields.entitledCores || !inventory.physicalCores ? "unknown" : delta >= 0 ? "good" : "attention",
    title: "Core entitlement comparison",
    detail: !fields.entitledCores ? "Enter the entitled core quantity to compare it with observed physical cores." : !inventory.physicalCores ? "Physical-core inventory is unavailable." : delta >= 0 ? `${fields.entitledCores.toLocaleString()} entitled cores cover ${inventory.physicalCores.toLocaleString()} observed physical cores, with ${delta.toLocaleString()} unallocated.` : `${inventory.physicalCores.toLocaleString()} observed physical cores exceed entitlement by ${Math.abs(delta).toLocaleString()}.`,
    evidence: "This is a simple inventory comparison, not a licensing determination.",
  });

  items.push({
    id: "planning-workbook",
    category: "planning",
    status: "unknown",
    title: "VCF planning and architecture decisions",
    detail: "Complete the official VCF 9.1 Planning and Preparation Workbook and validate networking, DNS/NTP, identity, NSX, storage, topology, ports, and operational requirements.",
    evidence: "These decisions are not available from RVTools.",
  });

  return {
    generatedAt: new Date().toISOString(),
    label: "Inventory-informed VCF 9.1 pre-assessment",
    items,
    disclaimer: "This pre-assessment summarizes RVTools-observable inventory. It is not an HCL certification, licensing determination, sizing study, low-level design, or supported-upgrade approval.",
  };
}

export function createDefaultDocument(): EngagementDocument {
  const fields = createDefaultFields();
  const inventory = emptyInventory();
  const readiness = assessReadiness(fields, inventory);
  const draft = buildTimeline(fields, inventory);
  return { version: 2, fields, inventorySources: [], inventory, readiness, timeline: draft.timeline, rationale: draft.rationale };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function numberValue(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

export function migrateDocument(value: unknown): EngagementDocument {
  const current = engagementDocumentV2Schema.safeParse(value);
  if (current.success) return current.data;
  const legacy = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const oldFields = (legacy.fields && typeof legacy.fields === "object" ? legacy.fields : {}) as Record<string, unknown>;
  const fields: MinimalFields = {
    ...createDefaultFields(),
    customerName: stringValue(oldFields.customerName),
    accountId: stringValue(oldFields.cust),
    location: stringValue(oldFields.cityState || oldFields.city),
    primaryContact: "",
    entitledCores: numberValue(oldFields.entitlement),
    entitlementStart: stringValue(oldFields.termStart),
    entitlementEnd: stringValue(oldFields.entitlementEndDate || oldFields.termEnd),
    targetStart: stringValue(oldFields.kickoffDate),
    targetComplete: stringValue(oldFields.termEnd),
    hardwareAvailability: oldFields.hardwareIsNetNew === true ? "new" : oldFields.hardwareIsNetNew === false ? "existing" : "unknown",
    hardwareLeadWeeks: numberValue(oldFields.hardwareLeadMonths) * 4,
    priorities: ["operations", "automation", ...(oldFields.vdefendInScope ? ["security" as const] : []), ...(oldFields.drInScope ? ["resilience" as const] : []), ...(oldFields.k8sInScope ? ["kubernetes" as const] : [])],
    timelineNotes: stringValue(oldFields.notes),
  };
  const inventory = emptyInventory();
  inventory.vmCount = numberValue(oldFields.vmCount);
  inventory.poweredOnVms = inventory.vmCount;
  inventory.hosts = numberValue(oldFields.hostCount);
  inventory.clusters = numberValue(oldFields.clusterCount);
  inventory.datacenters = numberValue(oldFields.siteCount);
  const draft = buildTimeline(fields, inventory);
  return {
    version: 2,
    fields,
    inventorySources: [],
    inventory,
    readiness: assessReadiness(fields, inventory, ["Migrated from the earlier manual-intake format; import RVTools to refresh inventory evidence."]),
    timeline: (legacy.timeline && timelineSchema.safeParse(legacy.timeline).success ? timelineSchema.parse(legacy.timeline) : draft.timeline),
    rationale: stringValue(legacy.rationale) || draft.rationale,
  };
}

export const engagementDocumentSchema = z.preprocess(migrateDocument, engagementDocumentV2Schema);

export function refreshDerivedDocument(document: EngagementDocument): EngagementDocument {
  const warnings = document.inventorySources.flatMap(source => source.warnings);
  const draft = buildTimeline(document.fields, document.inventory);
  return { ...document, readiness: assessReadiness(document.fields, document.inventory, warnings), timeline: draft.timeline, rationale: draft.rationale };
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

export function completionPercent(fields: MinimalFields, inventory: InventorySummary): number {
  const checks = [
    fields.customerName.trim().length > 0,
    fields.entitledCores > 0,
    fields.entitlementEnd.trim().length > 0,
    fields.targetStart.trim().length > 0,
    fields.targetComplete.trim().length > 0,
    inventory.hosts > 0,
    inventory.vmCount > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
