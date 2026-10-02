import { z } from "zod";

/**
 * Report content for the Condensed FCP: what the customer brief (JSON from Copilot) carries beyond the
 * planning fields. Stored on the engagement document; every part defaults to empty so older documents load.
 */

const text = z.string().max(4000);
const optionalText = z.string().max(4000).nullable().default(null);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** A date that may still be blank while the planner is filling the row in; blank rows are left out of the report. */
const dateOrBlank = z.union([isoDate, z.literal("")]).default("");
const monthOrBlank = z.union([z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/), z.literal("")]).default("");
const optionalDate = isoDate.nullable().default(null);
const hours = z.number().min(0).max(100_000);
const optionalNumber = z.number().min(0).max(1_000_000_000).nullable().default(null);

const personSchema = z.object({ name: text, role: z.string().max(200).default("") });

export const reportEntitlementSchema = z.object({
  /** Entitled hours: the signed Resource Assignments total. */
  hours: optionalNumber,
  /** Term as stated by the entitlement record; when blank the app uses the engagement's entitlement dates. */
  termStart: optionalDate,
  termEnd: optionalDate,
  hoursConsumed: optionalNumber,
  consumedAsOf: optionalDate,
  /** An expiry moves only with both a new date and the approver recorded. */
  extensionTo: optionalDate,
  extensionApprovedBy: optionalText,
});

export const discoveryAnswersSchema = z.object({
  /** A prior assessment exists, so the hours model skips the design discovery line. */
  assessmentCompleted: z.boolean().nullable().default(null),
  coreCount: optionalNumber,
  licensedCores: optionalNumber,
  vcfLicensed: z.boolean().nullable().default(null),
  renewalDate: optionalDate,
  addOnsPurchased: z.array(z.string().max(200)).default([]),
  currentPlatform: optionalText,
  enhancedLinkedMode: z.boolean().nullable().default(null),
  networking: optionalText,
  vcenters: optionalNumber,
  datacenters: optionalNumber,
  edgeSites: optionalNumber,
  esxHosts: optionalNumber,
  /** VCF instances to deploy; drives the deploy bracket. Defaults to one. */
  vcfInstances: optionalNumber,
  storage: optionalText,
  serverVendor: optionalText,
  containerPlatform: optionalText,
  jumboFrames: z.boolean().nullable().default(null),
  securityTooling: optionalText,
  drSolution: optionalText,
  backup: optionalText,
  hyperscalers: z.array(z.string().max(200)).default([]),
});

const rowSchemas = {
  designElement: z.object({ component: text, requirement: z.string().max(4000).default(""), recommendation: z.string().max(4000).default(""), gate: optionalText }),
  heard: z.object({ component: text, customerPosition: z.string().max(4000).default(""), whereItLands: z.string().max(4000).default("") }),
  problem: z.object({ problem: text, addressedBy: z.string().max(4000).default("") }),
  question: z.object({ question: text, whyNow: z.string().max(4000).default("") }),
  technicalItem: z.object({ item: text, reference: z.string().max(1000).default("") }),
  constraint: z.object({ constraint: text, imposedBy: z.string().max(200).default(""), effect: z.string().max(4000).default("") }),
  customerWork: z.object({ label: text, start: monthOrBlank, end: monthOrBlank }),
  openItem: z.object({ item: text, gates: z.string().max(1000).default(""), owner: z.string().max(400).default("") }),
  personnel: z.object({ workstream: text, cdw: z.array(z.string().max(300)).default([]), broadcom: z.array(z.string().max(300)).default([]), customer: z.array(z.string().max(300)).default([]) }),
  milestone: z.object({ date: dateOrBlank, event: text, detail: z.string().max(4000).default("") }),
  /** Planner-adjusted hours for one timeline work package; a null role keeps the calculated baseline. */
  workPackageHours: z.object({ id: z.string().max(300), architect: hours.nullable().default(null), srConsultant: hours.nullable().default(null), projectManager: hours.nullable().default(null), placement: z.enum(["auto", "entitlement", "notional"]).default("auto"), owner: z.enum(["auto", "cdw", "customer", "checkpoint"]).default("auto") }),
  assignment: z.object({ workstream: text, architect: hours.default(0), srConsultant: hours.default(0), projectManager: hours.default(0) }),
  source: z.object({ title: text, date: optionalDate }),
};

export const designProfileSchema = z.object({
  consumption: optionalText,
  physicalSite: optionalText,
  availability: optionalText,
  isolation: optionalText,
  recoverability: optionalText,
  expansion: optionalText,
});

export const reportSchema = z.object({
  /** Version of the brief last imported, or null when nothing has been imported. */
  briefVersion: z.number().int().nullable().default(null),
  importedAt: z.string().nullable().default(null),
  asOf: optionalDate,
  deliveryModel: optionalText,
  headline: optionalText,
  contacts: z.object({ customer: z.array(personSchema).default([]), cdw: z.array(personSchema).default([]), broadcom: z.array(personSchema).default([]) }).default({ customer: [], cdw: [], broadcom: [] }),
  entitlement: reportEntitlementSchema.default({ hours: null, termStart: null, termEnd: null, hoursConsumed: null, consumedAsOf: null, extensionTo: null, extensionApprovedBy: null }),
  discovery: discoveryAnswersSchema.default(() => discoveryAnswersSchema.parse({})),
  /** Outcomes the customer said they are not interested in, in their words (for example "Kubernetes"). */
  declined: z.array(z.string().max(200)).default([]),
  situation: z.array(text).default([]),
  designProfile: designProfileSchema.default({ consumption: null, physicalSite: null, availability: null, isolation: null, recoverability: null, expansion: null }),
  designElements: z.array(rowSchemas.designElement).default([]),
  whatWeHeard: z.array(rowSchemas.heard).default([]),
  problems: z.array(rowSchemas.problem).default([]),
  openQuestions: z.array(rowSchemas.question).default([]),
  technicalItems: z.array(rowSchemas.technicalItem).default([]),
  constraints: z.array(rowSchemas.constraint).default([]),
  customerAsks: z.array(text).default([]),
  customerOwnedWork: z.array(rowSchemas.customerWork).default([]),
  openItems: z.array(rowSchemas.openItem).default([]),
  personnel: z.array(rowSchemas.personnel).default([]),
  milestonesToDate: z.array(rowSchemas.milestone).default([]),
  /** Signed Resource Assignments; when present they replace the calculated Scoped Effort on the page. */
  resourceAssignments: z.array(rowSchemas.assignment).default([]),
  sources: z.array(rowSchemas.source).default([]),
  revision: optionalText,
  /** Hours per role the planner set on timeline work packages, by bar id, replacing the calculated baseline. */
  workPackageHours: z.array(rowSchemas.workPackageHours).default([]),
  /** Keys of generated rows the planner removed from the report (see shared/reportView.ts). */
  hiddenGenerated: z.array(z.string().max(500)).default([]),
});
export type ReportContent = z.infer<typeof reportSchema>;
export type ResourceAssignment = ReportContent["resourceAssignments"][number];

export function emptyReport(): ReportContent {
  return reportSchema.parse({});
}

/** Add-ons named in the discovery questionnaire, mapped to plan outcomes. */
export const ADD_ON_OUTCOMES: Record<string, { label: string; priority?: string; detailKey?: string; focus?: string[]; efficiency?: boolean }> = {
  "vcf-operations": { label: "VCF Operations", priority: "operations", detailKey: "operations", focus: ["observability"] },
  chargeback: { label: "Chargeback and capacity", priority: "operations", detailKey: "operations", focus: ["capacity-cost"] },
  "vcf-automation": { label: "VCF Automation", priority: "automation", detailKey: "automation", focus: ["vm-self-service"] },
  "vcf-networks": { label: "VCF Operations for networks", priority: "networking", detailKey: "networking", focus: ["network-operations"] },
  nsx: { label: "NSX segments", priority: "networking", detailKey: "networking", focus: ["overlay-transport"] },
  vpc: { label: "VCF VPCs", priority: "networking", detailKey: "networking", focus: ["vpc"] },
  vdefend: { label: "vDefend microsegmentation", priority: "security", detailKey: "security", focus: ["segmentation"] },
  atp: { label: "vDefend Advanced Threat Prevention", priority: "security", detailKey: "security", focus: ["ids-ips", "malware-prevention"] },
  acc: { label: "Advanced Cyber Compliance", priority: "resilience", detailKey: "resilience", focus: ["cyber-recovery"] },
  vks: { label: "Supervisor and VKS", priority: "kubernetes", detailKey: "kubernetes", focus: ["workload-domains"] },
  "private-ai": { label: "Private AI Services", priority: "private-ai", detailKey: "privateAi", focus: ["gpu-capacity"] },
  "live-recovery": { label: "VMware Live Recovery", priority: "resilience", detailKey: "resilience", focus: ["recovery-architecture"] },
  "cloud-cyber-recovery": { label: "Live Cyber Recovery (cloud)", priority: "resilience", detailKey: "resilience", focus: ["cloud-cyber-recovery"] },
  dsm: { label: "Data Services Manager", priority: "automation", detailKey: "automation", focus: ["data-services"] },
  avi: { label: "Avi Load Balancer", priority: "networking", detailKey: "networking", focus: ["load-balancing"] },
  hcx: { label: "HCX migrations" },
  "memory-tiering": { label: "Memory tiering", efficiency: true },
};

const ADD_ON_ALIASES: Record<string, string> = {
  operations: "vcf-operations", "vcf-ops": "vcf-operations", "aria-operations": "vcf-operations",
  automation: "vcf-automation", "aria-automation": "vcf-automation", "vcf-a": "vcf-automation",
  "vcf-network": "vcf-networks", "operations-for-networks": "vcf-networks",
  "nsx-segments": "nsx", "advanced-networking": "nsx", vpcs: "vpc",
  microsegmentation: "vdefend", dfw: "vdefend", "vdefend-firewall": "vdefend",
  "advanced-threat-protection": "atp", "vdefend-atp": "atp",
  "advanced-cyber-compliance": "acc", cleanroom: "acc",
  kubernetes: "vks", supervisor: "vks", k8s: "vks", "vsphere-kubernetes-service": "vks",
  pais: "private-ai", "vmware-private-ai": "private-ai",
  vlr: "live-recovery", srm: "live-recovery", "site-recovery": "live-recovery", "vmware-live-recovery": "live-recovery",
  vlcr: "cloud-cyber-recovery", "live-cyber-recovery": "cloud-cyber-recovery",
  "data-services-manager": "dsm", dbaas: "dsm",
  "avi-load-balancer": "avi", "load-balancing": "avi",
  "vmware-hcx": "hcx",
};

export function canonicalAddOn(value: string): string | null {
  const key = value.trim().toLowerCase().replace(/[\s_/&+.,()]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (ADD_ON_OUTCOMES[key]) return key;
  return ADD_ON_ALIASES[key] ?? null;
}

const filled = (value: string | null | undefined) => Boolean(value && value.trim());

/** The report with rows the planner has not finished left out; used for the document and calculations. */
export function completedReport(report: ReportContent): ReportContent {
  return {
    ...report,
    declined: report.declined.filter(filled),
    situation: report.situation.filter(filled),
    contacts: {
      customer: report.contacts.customer.filter(item => filled(item.name)),
      cdw: report.contacts.cdw.filter(item => filled(item.name)),
      broadcom: report.contacts.broadcom.filter(item => filled(item.name)),
    },
    designElements: report.designElements.filter(item => filled(item.component) && (filled(item.requirement) || filled(item.recommendation))),
    whatWeHeard: report.whatWeHeard.filter(item => filled(item.component)),
    problems: report.problems.filter(item => filled(item.problem)),
    openQuestions: report.openQuestions.filter(item => filled(item.question)),
    technicalItems: report.technicalItems.filter(item => filled(item.item)),
    constraints: report.constraints.filter(item => filled(item.constraint)),
    customerAsks: report.customerAsks.filter(filled),
    customerOwnedWork: report.customerOwnedWork.filter(item => filled(item.label) && filled(item.start) && filled(item.end)),
    openItems: report.openItems.filter(item => filled(item.item)),
    personnel: report.personnel.filter(item => filled(item.workstream)),
    milestonesToDate: report.milestonesToDate.filter(item => filled(item.date) && filled(item.event)),
    resourceAssignments: report.resourceAssignments.filter(item => filled(item.workstream) && item.architect + item.srConsultant + item.projectManager > 0),
    sources: report.sources.filter(item => filled(item.title)),
  };
}
