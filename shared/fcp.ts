import { z } from "zod";

export const TIMELINE_COLORS = [
  "slate",
  "blue",
  "teal",
  "amber",
  "red",
  "green",
  "gate",
  "deferred",
] as const;

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

export const milestoneSchema = z.object({
  id: z.string(),
  label: z.string(),
  date: z.string(),
  occurred: z.boolean(),
});

export const engagementFieldsSchema = z.object({
  customerName: z.string(),
  cust: z.string(),
  city: z.string(),
  cityState: z.string(),
  updatedDate: z.string(),
  source: z.string(),
  entitlement: z.string(),
  broadcomTokens: z.string(),
  laborPool: z.string(),
  totalProgram: z.string(),
  laborPoolEnd: z.string(),
  termStart: z.string(),
  termEnd: z.string(),
  clockStart: z.string(),
  entitlementEndDate: z.string(),
  y1: z.string(),
  y2: z.string(),
  y3: z.string(),
  y4: z.string(),
  newDC: z.string(),
  hardwareVendor: z.string(),
  hardwareTLA: z.string(),
  tlaDate: z.string(),
  existingStorage: z.string(),
  loadBalancer: z.string(),
  vmCount: z.string(),
  hostCount: z.string(),
  clusterCount: z.string(),
  siteCount: z.string(),
  drVmCount: z.string(),
  k8sSME: z.string(),
  kickoffDate: z.string(),
  kickoffTime: z.string(),
  drInScope: z.boolean(),
  drApproach: z.string(),
  rtoTarget: z.string(),
  rpoTarget: z.string(),
  k8sInScope: z.boolean(),
  dsmInScope: z.boolean(),
  vdefendInScope: z.boolean(),
  ariaOperationsInScope: z.boolean(),
  ariaAutomationInScope: z.boolean(),
  lcmInScope: z.boolean(),
  storageDecision: z.enum(["vSAN-ESA", "vSAN", "external"]),
  hardwareIsNetNew: z.boolean(),
  hardwareLeadMonths: z.number().int().min(0).max(24),
  buildApproach: z.string(),
  complianceFrameworks: z.array(z.string()),
  notes: z.string(),
  milestones: z.array(milestoneSchema),
});

export type EngagementFields = z.infer<typeof engagementFieldsSchema>;

export const engagementDocumentSchema = z.object({
  version: z.literal(1),
  fields: engagementFieldsSchema,
  timeline: timelineSchema,
  rationale: z.string(),
});

export type EngagementDocument = z.infer<typeof engagementDocumentSchema>;

const currentYear = new Date().getFullYear();
const today = new Date().toISOString().slice(0, 10);

export function createDefaultFields(): EngagementFields {
  return {
    customerName: "",
    cust: "",
    city: "",
    cityState: "",
    updatedDate: today,
    source: "",
    entitlement: "",
    broadcomTokens: "",
    laborPool: "",
    totalProgram: "",
    laborPoolEnd: "",
    termStart: "",
    termEnd: "",
    clockStart: "",
    entitlementEndDate: "",
    y1: String(currentYear),
    y2: String(currentYear + 1),
    y3: String(currentYear + 2),
    y4: String(currentYear + 3),
    newDC: "",
    hardwareVendor: "",
    hardwareTLA: "",
    tlaDate: "",
    existingStorage: "",
    loadBalancer: "",
    vmCount: "",
    hostCount: "",
    clusterCount: "",
    siteCount: "",
    drVmCount: "",
    k8sSME: "",
    kickoffDate: "",
    kickoffTime: "",
    drInScope: false,
    drApproach: "",
    rtoTarget: "",
    rpoTarget: "",
    k8sInScope: false,
    dsmInScope: false,
    vdefendInScope: false,
    ariaOperationsInScope: true,
    ariaAutomationInScope: true,
    lcmInScope: true,
    storageDecision: "vSAN-ESA",
    hardwareIsNetNew: true,
    hardwareLeadMonths: 4,
    buildApproach: "Parallel build / migration",
    complianceFrameworks: [],
    notes: "",
    milestones: [
      "VMware Renewal & Quote Structure",
      "Customer Scoping Strategy",
      "ELA Renewal — Onsite",
      "5-Year Subscription Quote Review",
      "VMware DSM Discussion",
      "Site Readiness Workshop Review",
      "Technical Alignment & Readiness Finalization",
      "Sales-to-Services Handoff (IKOM)",
    ].map((label, index) => ({ id: `milestone-${index + 1}`, label, date: "", occurred: false })),
  };
}

function bar(
  id: string,
  startCol: number,
  endCol: number,
  color: TimelineColor,
  label: string,
  milestone = false,
  deferred = false,
): TimelineBar {
  return { id, startCol, endCol, color, label, milestone, deferred };
}

export function estimateMigrationWaves(vmCount: number): number {
  if (!Number.isFinite(vmCount) || vmCount <= 0) return 2;
  if (vmCount <= 400) return 2;
  if (vmCount <= 1600) return 3;
  if (vmCount <= 3000) return 4;
  return 5;
}

export function buildTimelineFromFields(fields: EngagementFields): { timeline: Timeline; rationale: string } {
  const vmCount = Number(String(fields.vmCount).replace(/[^0-9.]/g, "")) || 0;
  const waves = estimateMigrationWaves(vmCount);
  const hwLabel = fields.hardwareVendor || "Hardware vendor";
  const dcLabel = fields.newDC || "Destination DC";
  const lead = Math.max(0, fields.hardwareLeadMonths || 0);
  const hasGate = fields.hardwareIsNetNew && lead > 0;
  const columns = hasGate
    ? [
        `G0 · ${dcLabel} Decision`,
        `HW Lead (~${lead} mo)`,
        "S1 · Stand-Up",
        "Wave 1",
        waves >= 3 ? "Wave 2 · DC Flip" : "Wave 2 · DC Flip",
        waves >= 3 ? "Wave 3" : "Stabilize",
        "Modernize",
        "Operate",
      ]
    : ["Readiness", "S1 · Stand-Up", "Wave 1", "Wave 2 · DC Flip", "Stabilize", "Modernize", "Operate"];
  const last = columns.length + 1;
  const buildStart = hasGate ? 3 : 2;
  const migrationStart = buildStart + 1;
  const migrationEnd = Math.min(last - 2, migrationStart + Math.max(2, waves));

  const lanes: TimelineLane[] = [
    {
      id: "lane-governance",
      name: "Program Management & Governance",
      bars: [bar("bar-governance", 1, last, "slate", "Joint steering · monthly consumption and risk review")],
    },
  ];

  if (hasGate) {
    lanes.push({
      id: "lane-hardware",
      name: "Hardware Refresh",
      bars: [
        bar("bar-hw-gate", 1, 2, "gate", `${dcLabel} selected · ${hwLabel} quoting`, true),
        bar("bar-hw-lead", 2, buildStart + 1, "amber", `${hwLabel} order · ~${lead}-month lead → Tranche 1`),
        bar("bar-hw-scale", buildStart + 1, last, "green", "Refresh waves · capacity scales as deployed"),
      ],
    });
  }

  lanes.push(
    {
      id: "lane-operations-readiness",
      name: "Cloud Operations Readiness",
      bars: [
        bar("bar-ops-design", 1, buildStart, "blue", "Readiness · operating model · VCF Operations design"),
        bar("bar-ops-enable", buildStart, Math.min(last, migrationStart + 2), "teal", "Operations & VCF Automation front-loaded"),
        bar("bar-ops-run", Math.min(last - 1, migrationStart + 2), last, "green", "Run-state hardening · capacity governance"),
      ],
    },
    {
      id: "lane-infrastructure",
      name: "Modernize Infrastructure",
      bars: [
        bar("bar-foundation", buildStart, migrationStart, "teal", "Management domain → VI workload domain", true),
        bar("bar-migrations", migrationStart, Math.min(last, migrationEnd + 1), "amber", `${waves} HCX Mobility-Group waves · DC flip at wave boundary`, true),
        bar("bar-stabilize", Math.min(last - 1, migrationEnd + 1), last, "green", "Stabilize · optimize · operate"),
      ],
    },
  );

  if (fields.vdefendInScope) {
    lanes.push({
      id: "lane-security",
      name: "Modernize Security",
      bars: [bar("bar-vdefend", 1, Math.min(last, migrationEnd + 1), "red", "VDefend micro-segmentation · design and enforce in Year 1")],
    });
  }
  if (fields.drInScope) {
    lanes.push({
      id: "lane-resilience",
      name: "Modernize Resilience",
      bars: [
        bar("bar-dr-design", 1, buildStart, "blue", `${fields.drApproach || "SRM"} DR design · RPO/RTO alignment`),
        bar("bar-dr-build", buildStart, Math.min(last, migrationEnd + 1), "red", `${fields.drApproach || "SRM"} deployment · multi-site failover`, true),
      ],
    });
  }
  if (fields.drInScope || fields.vdefendInScope) {
    lanes.push({
      id: "lane-acc",
      name: "Clean-Room Recovery",
      bars: [bar("bar-acc", Math.max(2, last - 2), last, "deferred", "Clean-room ACC · Year 2+ / not yet procured", false, true)],
    });
  }

  if (fields.k8sInScope || fields.dsmInScope) {
    const appBars: TimelineBar[] = [
      bar("bar-vks", buildStart, Math.min(last, migrationStart + 2), "teal", "VKS / Supervisor enabled with workload domain"),
    ];
    if (fields.dsmInScope) {
      appBars.push(bar("bar-dsm", Math.min(last - 1, migrationStart + 1), Math.min(last, migrationStart + 3), "blue", "DSM Day-1 after VCF Automation and Supervisor"));
    }
    lanes.push({ id: "lane-app", name: "Modernize App Platform & AI", bars: appBars });
  }

  const rationale = hasGate
    ? `The plan is hardware-gated on the ${lead}-month ${hwLabel} lead, so readiness, cloud operations${fields.drInScope ? ", DR" : ""}${fields.vdefendInScope ? ", and VDefend" : ""} run in parallel while equipment is in transit. The ${vmCount ? `approximately ${vmCount.toLocaleString()}-VM` : "customer"} estate is organized into ${waves} HCX waves with the primary data-center flip at a wave boundary.`
    : `Existing or immediately available hardware removes the procurement gate, so foundation work starts after readiness and the plan compresses left. The ${vmCount ? `approximately ${vmCount.toLocaleString()}-VM` : "customer"} estate is organized into ${waves} HCX waves with operations and automation front-loaded alongside the build.`;

  return { timeline: { columns, lanes }, rationale };
}

export function createDefaultDocument(): EngagementDocument {
  const fields = createDefaultFields();
  const draft = buildTimelineFromFields(fields);
  return { version: 1, fields, timeline: draft.timeline, rationale: draft.rationale };
}

export function validateTimeline(timeline: Timeline): string[] {
  const errors: string[] = [];
  const maxEnd = timeline.columns.length + 1;
  for (const lane of timeline.lanes) {
    const sorted = [...lane.bars].sort((a, b) => a.startCol - b.startCol);
    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index];
      if (current.endCol <= current.startCol || current.endCol > maxEnd) {
        errors.push(`${lane.name}: “${current.label}” is outside the timeline grid.`);
      }
      const next = sorted[index + 1];
      if (next && current.endCol > next.startCol) {
        errors.push(`${lane.name}: “${current.label}” overlaps “${next.label}”. Split concurrent work into separate lanes.`);
      }
    }
  }
  return errors;
}

export const INTAKE_REQUIRED_KEYS: Array<keyof EngagementFields> = [
  "customerName",
  "cust",
  "entitlementEndDate",
  "entitlement",
  "broadcomTokens",
  "laborPool",
  "termStart",
  "termEnd",
  "clockStart",
  "hardwareVendor",
  "newDC",
  "vmCount",
  "existingStorage",
  "loadBalancer",
  "kickoffDate",
];

export function completionPercent(fields: EngagementFields): number {
  const completed = INTAKE_REQUIRED_KEYS.filter(key => {
    const value = fields[key];
    return Array.isArray(value) ? value.length > 0 : String(value ?? "").trim().length > 0;
  }).length;
  return Math.round((completed / INTAKE_REQUIRED_KEYS.length) * 100);
}
