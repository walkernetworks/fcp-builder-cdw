import { z } from "zod";
import { capabilitySchema, migrateDocument, minimalFieldsSchema, refreshDerivedDocument, type EngagementDocument, type MinimalFields } from "./fcp";
import { createFieldCoercer, deepMerge, isPlainObject, type Json, type JsonObject } from "./fieldCoercion";
import { ADD_ON_OUTCOMES, canonicalAddOn, discoveryAnswersSchema, reportSchema, type ReportContent } from "./report";

export const CUSTOMER_BRIEF_VERSION = 1;

/** Result of reading a customer brief; nothing is applied until the planner confirms the preview. */
export type BriefImportResult = {
  ok: boolean;
  document: EngagementDocument;
  /** Field and report changes, for the preview. */
  changes: string[];
  /** Loose phrasings mapped to allowed values. */
  coerced: string[];
  /** Values or rows that could not be used and were dropped. */
  warnings: string[];
  /** Required facts the brief did not supply; they become Open Items in the report. */
  missing: string[];
  /** Set when the file cannot be imported at all. */
  error?: string;
};

/** Nulls mean "not stated": remove them so schema defaults apply and current values are kept. */
function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNulls).filter(item => item !== undefined);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const cleaned = withoutNulls(child);
      if (cleaned !== undefined && cleaned !== null) out[key] = cleaned;
    }
    return out;
  }
  // Template hints Copilot left in place ("commercial | public-sector | null", "YYYY-MM-DD") are not values.
  if (typeof value === "string" && (/^Y{4}-M{2}(-D{2})?$/.test(value.trim()) || / \| /.test(value))) return undefined;
  return value === null ? undefined : value;
}

function looseNumber(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const cleaned = value.replace(/[$,\s]/g, "").replace(/(hours?|hrs?|cores?)$/i, "");
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : value;
}

function looseBoolean(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (["yes", "y", "true", "done", "completed"].includes(normalized)) return true;
  if (["no", "n", "false", "none"].includes(normalized)) return false;
  return value;
}

const NUMBER_KEYS = new Set(["value", "hours", "hoursConsumed", "coreCount", "licensedCores", "vcenters", "datacenters", "edgeSites", "esxHosts", "vcfInstances", "architect", "srConsultant", "projectManager", "management", "workload"]);
const BOOLEAN_KEYS = new Set(["assessmentCompleted", "vcfLicensed", "enhancedLinkedMode", "jumboFrames", "consolidatedDomain"]);

function looseScalars(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map(item => looseScalars(item, key));
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, looseScalars(child, childKey)]));
  if (NUMBER_KEYS.has(key)) return looseNumber(value);
  if (BOOLEAN_KEYS.has(key)) return looseBoolean(value);
  return value;
}

/** Parses each list row on its own so one bad row is reported and dropped instead of failing the import. */
function parseRows<T>(rows: unknown, schema: z.ZodType<T>, label: string, warnings: string[]): T[] {
  if (rows === undefined) return [];
  if (!Array.isArray(rows)) { warnings.push(`${label}: expected a list; ignored`); return []; }
  // Template rows Copilot left empty carry no content; skip them quietly.
  const hasContent = (value: unknown): boolean => typeof value === "string" ? value.trim() !== "" && !/^Y{4}-M{2}(-D{2})?$/.test(value) : Array.isArray(value) ? value.some(hasContent) : isPlainObject(value) ? Object.values(value).some(hasContent) : typeof value === "number";
  return rows.filter(hasContent).flatMap((row, index) => {
    const parsed = schema.safeParse(row);
    if (parsed.success) return [parsed.data];
    warnings.push(`${label}[${index}]: ${parsed.error.issues.map(issue => `${issue.path.join(".") || "row"} ${issue.message}`).join("; ")}; row dropped`);
    return [];
  });
}

function textList(value: unknown, label: string, warnings: string[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) { warnings.push(`${label}: expected a list; ignored`); return []; }
  return value.flatMap(item => (typeof item === "string" && item.trim() ? [item.trim()] : []));
}

const reportShape = reportSchema.shape;
const element = <T extends z.ZodType>(schema: T) => (schema as any).unwrap().element as z.ZodType<any>;

/**
 * Reads a customer brief (JSON from Copilot) into an engagement: planning answers map to the existing
 * fields, narrative content goes to the report. RVTools inventory and hand-edited timelines are never
 * changed; a generated plan is rebuilt from the new fields.
 */
/**
 * Reads a brief from Copilot's reply: plain JSON, a fenced json code block, or JSON with text around it.
 * Throws when no JSON object can be read.
 */
export function parseBriefText(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  try { return JSON.parse(body); } catch {
    const start = body.indexOf("{"), end = body.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("No JSON object found.");
    return JSON.parse(body.slice(start, end + 1));
  }
}

export function applyCustomerBrief(document: EngagementDocument, raw: unknown): BriefImportResult {
  const fail = (error: string): BriefImportResult => ({ ok: false, document, changes: [], coerced: [], warnings: [], missing: [], error });
  if (!isPlainObject(raw)) return fail("The file is not a JSON object.");
  const brief = looseScalars(withoutNulls(raw)) as Record<string, any>;
  if (brief.schemaVersion !== undefined && brief.schemaVersion !== CUSTOMER_BRIEF_VERSION) return fail(`This brief is schema version ${String(brief.schemaVersion)}; the app reads version ${CUSTOMER_BRIEF_VERSION}.`);

  const coercer = createFieldCoercer();
  const warnings = coercer.warnings;
  const changes: string[] = [];
  const missing: string[] = [];

  // ---- Planning fields -------------------------------------------------------------------------
  const discovery = isPlainObject(brief.discovery) ? brief.discovery : {};
  const entitlement = isPlainObject(brief.entitlement) ? brief.entitlement : {};
  const customer = isPlainObject(brief.customer) ? brief.customer : {};
  const fieldsPatch: JsonObject = {};
  const detailsPatch: JsonObject = {};
  if (typeof customer.name === "string") fieldsPatch.customerName = customer.name;
  if (typeof customer.location === "string") fieldsPatch.location = customer.location;
  if (typeof customer.segment === "string") fieldsPatch.customerSegment = customer.segment;
  if (typeof customer.accountId === "string" || typeof customer.accountId === "number") fieldsPatch.accountId = String(customer.accountId);
  // The primary contact, or else the first customer contact, as "Name, role".
  const customerContacts = isPlainObject(brief.contacts) && Array.isArray(brief.contacts.customer) ? brief.contacts.customer.filter(isPlainObject) : [];
  const firstContact = customerContacts.find(item => typeof item.name === "string" && item.name.trim()) as { name: string; role?: string } | undefined;
  if (typeof customer.primaryContact === "string") fieldsPatch.primaryContact = customer.primaryContact;
  else if (firstContact && !document.fields.primaryContact) fieldsPatch.primaryContact = [firstContact.name, firstContact.role].filter(Boolean).join(", ");

  // Schedule: dates the customer named, hardware lead time, and calendar constraints.
  const schedule = isPlainObject(brief.schedule) ? brief.schedule : {};
  const date = (key: string, target: string) => {
    const value = schedule[key];
    if (typeof value !== "string") return;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) fieldsPatch[target] = value;
    else warnings.push(`schedule.${key}: ${JSON.stringify(value)} is not a YYYY-MM-DD date; ignored`);
  };
  date("projectStart", "plannedProjectStart");
  date("implementationStart", "plannedImplementationStart");
  date("targetComplete", "targetComplete");
  if (schedule.hardwareLeadWeeks !== undefined) fieldsPatch.hardwareLeadWeeks = schedule.hardwareLeadWeeks;
  if (typeof schedule.calendarConstraints === "string") fieldsPatch.timelineNotes = schedule.calendarConstraints;
  if (discovery.targetRelease !== undefined) fieldsPatch.compatibilityTargetRelease = discovery.targetRelease;
  if (typeof entitlement.value === "number") fieldsPatch.entitlementAmount = entitlement.value;
  if (typeof entitlement.termStart === "string") fieldsPatch.entitlementStart = entitlement.termStart;
  if (typeof discovery.plannedPath === "string") detailsPatch.upgradePath = discovery.plannedPath;
  if (typeof discovery.platformEdition === "string") detailsPatch.platformEdition = discovery.platformEdition;
  if (typeof discovery.consolidatedDomain === "boolean") detailsPatch.domainTopology = discovery.consolidatedDomain ? "consolidated" : "standard";
  if (typeof discovery.storage === "string") detailsPatch.principalStorage = discovery.storage;
  if (Array.isArray(discovery.sitePrerequisitesOpen)) detailsPatch.softPrerequisites = discovery.sitePrerequisitesOpen;
  if (isPlainObject(discovery.componentDepth)) detailsPatch.componentDepths = discovery.componentDepth;
  if (typeof discovery.industry === "string") detailsPatch.industryTemplate = discovery.industry;
  if (typeof discovery.planningNotes === "string") detailsPatch.notes = discovery.planningNotes;
  const newHosts = isPlainObject(discovery.newHostsPurchased) ? discovery.newHostsPurchased : {};
  if ((Number(newHosts.management) || 0) + (Number(newHosts.workload) || 0) > 0) fieldsPatch.hardwareAvailability = "new";

  const fieldsShape = minimalFieldsSchema.shape;
  const coercedFields = coercer.coerce("fields", "fields", fieldsPatch, minimalFieldsSchema) as JsonObject;
  const coercedDetails = coercer.coerce("fields.adoptionDetails", "adoptionDetails", detailsPatch, fieldsShape.adoptionDetails) as JsonObject;

  // Add-ons the customer is considering become priorities and outcomes; they add to what is already selected.
  const current = document.fields;
  const priorities = new Set<string>(current.priorities);
  const focusAdditions: Record<string, Set<string>> = {};
  let efficiency = false;
  for (const value of textList(discovery.addOnsConsidered, "discovery.addOnsConsidered", warnings)) {
    const key = canonicalAddOn(value);
    if (!key) { warnings.push(`discovery.addOnsConsidered: "${value}" is not a recognized add-on; ignored`); continue; }
    const addOn = ADD_ON_OUTCOMES[key];
    if (addOn.efficiency) efficiency = true;
    if (addOn.priority) priorities.add(addOn.priority);
    if (addOn.detailKey && addOn.focus) {
      focusAdditions[addOn.detailKey] ??= new Set();
      addOn.focus.forEach(focus => focusAdditions[addOn.detailKey!].add(focus));
    }
    if (key === "hcx") changes.push("discovery.addOnsConsidered: HCX is planned through the migration waves; no separate outcome added");
  }
  const declined = textList(discovery.notInterested, "discovery.notInterested", warnings);
  const declinedPriorities = new Set(declined.flatMap(value => {
    const key = canonicalAddOn(value);
    return key && ADD_ON_OUTCOMES[key].priority ? [ADD_ON_OUTCOMES[key].priority!] : [];
  }));

  const details = { ...current.adoptionDetails } as Record<string, unknown>;
  for (const [detailKey, additions] of Object.entries(focusAdditions)) {
    details[detailKey] = Array.from(new Set([...(details[detailKey] as string[]), ...Array.from(additions)]));
  }
  if (efficiency && current.adoptionDetails.componentDepths.efficiency === "not-selected") {
    details.componentDepths = { ...current.adoptionDetails.componentDepths, efficiency: "tier-1" };
  }
  const nextPriorities = capabilitySchema.options.filter(capability => priorities.has(capability) && !(declinedPriorities.has(capability) && !current.priorities.includes(capability)));

  const mergedFields = deepMerge(
    { ...current, priorities: current.priorities, adoptionDetails: details },
    { ...coercedFields, priorities: nextPriorities as Json, adoptionDetails: coercedDetails },
    "fields",
    changes,
  );
  const fieldsCheck = minimalFieldsSchema.safeParse(mergedFields);
  if (!fieldsCheck.success) {
    return { ...fail("Some planning values in the brief are not valid."), coerced: coercer.coerced, warnings: [...warnings, ...fieldsCheck.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`)] };
  }
  const fields: MinimalFields = fieldsCheck.data;

  // ---- Report content --------------------------------------------------------------------------
  const prior = document.report;
  const discoveryCheck = discoveryAnswersSchema.safeParse({ ...prior.discovery, ...Object.fromEntries(Object.entries(discovery).filter(([key]) => key in discoveryAnswersSchema.shape)) });
  if (!discoveryCheck.success) warnings.push(...discoveryCheck.error.issues.map(issue => `discovery.${issue.path.join(".")}: ${issue.message}; kept the previous value`));
  const extension = isPlainObject(entitlement.extension) ? entitlement.extension : {};
  const contacts = isPlainObject(brief.contacts) ? brief.contacts : {};
  const person = element(reportShape.contacts.unwrap().shape.customer);
  const designProfile = reportShape.designProfile.unwrap().safeParse({ ...prior.designProfile, ...(isPlainObject(brief.designProfile) ? brief.designProfile : {}) });
  if (!designProfile.success) warnings.push("designProfile: values must be text; kept the previous profile");

  // A section the brief leaves empty keeps what the planner already entered by hand.
  const keep = <T,>(next: T[], previous: T[]): T[] => (next.length ? next : previous);
  const report: ReportContent = {
    briefVersion: CUSTOMER_BRIEF_VERSION,
    importedAt: new Date().toISOString(),
    asOf: typeof brief.asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(brief.asOf) ? brief.asOf : prior.asOf,
    deliveryModel: typeof brief.deliveryModel === "string" ? brief.deliveryModel : prior.deliveryModel,
    headline: typeof brief.headline === "string" ? brief.headline : prior.headline,
    contacts: {
      customer: keep(parseRows(contacts.customer, person, "contacts.customer", warnings), prior.contacts.customer),
      cdw: keep(parseRows(contacts.cdw, person, "contacts.cdw", warnings), prior.contacts.cdw),
      broadcom: keep(parseRows(contacts.broadcom, person, "contacts.broadcom", warnings), prior.contacts.broadcom),
    },
    entitlement: reportShape.entitlement.unwrap().parse({
      hours: typeof entitlement.hours === "number" ? entitlement.hours : prior.entitlement.hours,
      termStart: typeof entitlement.termStart === "string" ? entitlement.termStart : prior.entitlement.termStart,
      termEnd: typeof entitlement.termEnd === "string" ? entitlement.termEnd : prior.entitlement.termEnd,
      hoursConsumed: typeof entitlement.hoursConsumed === "number" ? entitlement.hoursConsumed : prior.entitlement.hoursConsumed,
      consumedAsOf: typeof entitlement.consumedAsOf === "string" ? entitlement.consumedAsOf : prior.entitlement.consumedAsOf,
      extensionTo: null,
      extensionApprovedBy: null,
    }),
    discovery: discoveryCheck.success ? discoveryCheck.data : prior.discovery,
    declined: keep(declined, prior.declined),
    situation: keep(textList(brief.situation, "situation", warnings), prior.situation),
    designProfile: designProfile.success ? designProfile.data : prior.designProfile,
    designElements: keep(parseRows(brief.designElements, element(reportShape.designElements), "designElements", warnings), prior.designElements),
    whatWeHeard: keep(parseRows(brief.whatWeHeard, element(reportShape.whatWeHeard), "whatWeHeard", warnings), prior.whatWeHeard),
    problems: keep(parseRows(brief.problems, element(reportShape.problems), "problems", warnings), prior.problems),
    openQuestions: keep(parseRows(brief.openQuestions, element(reportShape.openQuestions), "openQuestions", warnings), prior.openQuestions),
    technicalItems: keep(parseRows(brief.technicalItems, element(reportShape.technicalItems), "technicalItems", warnings), prior.technicalItems),
    constraints: keep(parseRows(brief.constraints, element(reportShape.constraints), "constraints", warnings), prior.constraints),
    customerAsks: keep(textList(brief.customerAsks, "customerAsks", warnings), prior.customerAsks),
    customerOwnedWork: keep(parseRows(brief.customerOwnedWork, element(reportShape.customerOwnedWork), "customerOwnedWork", warnings), prior.customerOwnedWork),
    openItems: keep(parseRows(brief.openItems, element(reportShape.openItems), "openItems", warnings), prior.openItems),
    personnel: keep(parseRows(brief.personnel, element(reportShape.personnel), "personnel", warnings), prior.personnel),
    milestonesToDate: keep(parseRows(brief.milestonesToDate, element(reportShape.milestonesToDate), "milestonesToDate", warnings), prior.milestonesToDate),
    resourceAssignments: keep(parseRows(brief.resourceAssignments, element(reportShape.resourceAssignments), "resourceAssignments", warnings), prior.resourceAssignments),
    sources: keep(parseRows(brief.sources, element(reportShape.sources), "sources", warnings), prior.sources),
    revision: typeof brief.revision === "string" ? brief.revision : prior.revision,
    hiddenGenerated: prior.hiddenGenerated,
    workPackageHours: prior.workPackageHours,
  };

  // An expiry moves only when both the new date and the approver are recorded.
  if (typeof extension.to === "string" && typeof extension.approvedBy === "string") {
    report.entitlement = { ...report.entitlement, extensionTo: extension.to, extensionApprovedBy: extension.approvedBy };
  } else if (extension.to || extension.approvedBy) {
    warnings.push("entitlement.extension: an extension needs both the new date and who approved it; the original expiry stands");
  }

  const reportCount = (label: string, count: number) => { if (count) changes.push(`report.${label}: ${count} item${count === 1 ? "" : "s"}`); };
  reportCount("situation", report.situation.length);
  reportCount("designElements", report.designElements.length);
  reportCount("whatWeHeard", report.whatWeHeard.length);
  reportCount("problems", report.problems.length);
  reportCount("openQuestions", report.openQuestions.length);
  reportCount("technicalItems", report.technicalItems.length);
  reportCount("constraints", report.constraints.length);
  reportCount("openItems", report.openItems.length);
  reportCount("personnel", report.personnel.length);
  reportCount("milestonesToDate", report.milestonesToDate.length);
  reportCount("resourceAssignments", report.resourceAssignments.length);
  if (report.entitlement.hours !== prior.entitlement.hours) changes.push(`report.entitlement.hours: ${prior.entitlement.hours ?? "not set"} → ${report.entitlement.hours ?? "not set"}`);

  if (!fields.customerName) missing.push("Customer name");
  if (!fields.entitlementStart) missing.push("Entitlement start date");
  if (!fields.entitlementAmount) missing.push("Entitlement value");
  if (report.entitlement.hours === null) missing.push("Entitled hours (Resource Assignments total)");
  if (report.entitlement.hoursConsumed === null) missing.push("Hours consumed to date");
  if (!report.headline) missing.push("Cover headline");
  if (!report.whatWeHeard.length) missing.push("What we heard");
  if (!report.openQuestions.length) missing.push("Open questions");
  if (!report.personnel.length) missing.push("Target personnel");

  // Fields changed, so a generated plan is rebuilt; a hand-edited plan keeps its timelines.
  const merged = migrateDocument({ ...document, fields, report });
  const next = refreshDerivedDocument(merged);
  return { ok: true, document: next, changes, coerced: coercer.coerced, warnings, missing };
}
