import { z } from "zod";
import { capabilitySchema, migrateDocument, minimalFieldsSchema, refreshDerivedDocument, vcfDomainSchema, type Capability, type EngagementDocument, type MinimalFields } from "./fcp";
import { createFieldCoercer, deepMerge, isPlainObject, type Json, type JsonObject } from "./fieldCoercion";
import { WAVES_LABEL } from "./effort";
import { withMigrationWavesChoice } from "./estateSize";
import { ADD_ON_OUTCOMES, canonicalAddOn, discoveryAnswersSchema, reportSchema, VSPHERE8_STRATEGIES, type ReportContent } from "./report";

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
  if (key === "jumboFrames" && typeof value === "string" && /mixed|partial|some|varies/i.test(value)) return "mixed";
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

/** Brief outcome areas: the adoption-detail list each fills, and the priority it turns on. */
const OUTCOME_AREAS: Array<[string, Capability]> = [
  ["operations", "operations"], ["automation", "automation"], ["networking", "networking"], ["security", "security"],
  ["resilience", "resilience"], ["kubernetes", "kubernetes"], ["privateAi", "private-ai"],
];

/** The component depth that sizes each outcome area; recovery has none. */
const DEPTH_OF_AREA: Record<string, string> = {
  operations: "operations", automation: "automation", networking: "networkingSecurity", security: "networkingSecurity",
  resilience: "", kubernetes: "kubernetesAi", privateAi: "kubernetesAi",
};

/** The allowed focus values for one adoption-detail list. */
function focusOptions(detailKey: string): string[] {
  let schema: any = (minimalFieldsSchema.shape.adoptionDetails.shape as Record<string, unknown>)[detailKey];
  while (schema && !(schema instanceof z.ZodArray)) schema = schema._def?.innerType;
  return schema ? [...schema.element.options] : [];
}

const reportShape = reportSchema.shape;
const isoDateOrNull = (value: unknown): string | null => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
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
  const bsasBrief = isPlainObject(brief.bsas) ? brief.bsas : null;
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
  // BSAS is hours and dates only. A BSAS amount, rate or tier in the brief is never read, so it never reaches the document.
  // BSAS hours set the funding source: alongside an entitlement value, BSAS follows the entitlement; without one, BSAS only.
  if (bsasBrief && typeof bsasBrief.hours === "number" && bsasBrief.hours > 0 && bsasBrief.hours <= 100_000) {
    fieldsPatch.bsasHours = bsasBrief.hours;
    const bsasStart = isoDateOrNull(bsasBrief.termStart);
    const bsasEnd = isoDateOrNull(bsasBrief.termEnd);
    if (bsasStart) fieldsPatch.bsasStart = bsasStart;
    if (bsasEnd) fieldsPatch.bsasEnd = bsasEnd;
    const entitlementValue = typeof fieldsPatch.entitlementAmount === "number" ? fieldsPatch.entitlementAmount : document.fields.entitlementAmount;
    fieldsPatch.fundingSource = entitlementValue > 0 ? "entitlement-bsas" : "bsas";
  }
  if (typeof discovery.plannedPath === "string") detailsPatch.upgradePath = discovery.plannedPath;
  if (typeof discovery.platformEdition === "string") detailsPatch.platformEdition = discovery.platformEdition;
  if (typeof discovery.consolidatedDomain === "boolean") detailsPatch.domainTopology = discovery.consolidatedDomain ? "consolidated" : "standard";
  if (typeof discovery.storage === "string") detailsPatch.principalStorage = discovery.storage;
  if (Array.isArray(discovery.sitePrerequisitesOpen)) detailsPatch.softPrerequisites = discovery.sitePrerequisitesOpen;
  if (isPlainObject(discovery.componentDepth)) detailsPatch.componentDepths = discovery.componentDepth;
  if (typeof discovery.industry === "string") detailsPatch.industryTemplate = discovery.industry;
  if (typeof discovery.planningNotes === "string") detailsPatch.notes = discovery.planningNotes;
  if (discovery.domains !== undefined) {
    // Loose phrasing from Copilot: "Workload Domain", "Import", "greenfield build" and so on.
    const rows = Array.isArray(discovery.domains) ? discovery.domains.map(row => isPlainObject(row) ? {
      ...row,
      kind: /manag/i.test(String(row.kind ?? "")) ? "management" : /work/i.test(String(row.kind ?? "")) ? "workload" : row.kind,
      pathway: /import/i.test(String(row.pathway ?? "")) ? "import" : /converg/i.test(String(row.pathway ?? "")) ? "converge" : /green|new|build/i.test(String(row.pathway ?? "")) ? "greenfield" : row.pathway ?? undefined,
      hosts: row.hosts === null || row.hosts === undefined || row.hosts === "" ? null : Number(row.hosts),
      instance: row.instance ?? "", notes: row.notes ?? "",
      deferred: row.deferred === true || /^(true|yes|later|deferred)$/i.test(String(row.deferred ?? "")),
    } : row) : discovery.domains;
    detailsPatch.domains = parseRows(rows, vcfDomainSchema, "discovery.domains", warnings);
  }
  if (discovery.excludedHosts !== undefined) {
    if (Array.isArray(discovery.excludedHosts) && discovery.excludedHosts.every(name => typeof name === "string")) {
      detailsPatch.excludedHosts = (discovery.excludedHosts as string[]).map(name => name.trim()).filter(Boolean);
    } else if (discovery.excludedHosts !== null) {
      warnings.push("discovery.excludedHosts: expected a list of host names; ignored");
    }
  }
  const newHosts = isPlainObject(discovery.newHostsPurchased) ? discovery.newHostsPurchased : {};
  const purchased = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value));
  const [newManagement, newWorkload] = [purchased(newHosts.management), purchased(newHosts.workload)];
  if ((newManagement ?? 0) + (newWorkload ?? 0) > 0) fieldsPatch.hardwareAvailability = "new";
  // Both counts stated as zero: no hosts are bought, so the plan runs on the existing hardware.
  else if (newManagement === 0 && newWorkload === 0) fieldsPatch.hardwareAvailability = "existing";

  const fieldsShape = minimalFieldsSchema.shape;
  const coercedFields = coercer.coerce("fields", "fields", fieldsPatch, minimalFieldsSchema) as JsonObject;
  const coercedDetails = coercer.coerce("fields.adoptionDetails", "adoptionDetails", detailsPatch, fieldsShape.adoptionDetails) as JsonObject;

  // The brief is the source of truth for scope. When it states outcomes or depths, each area's outcome list replaces
  // the earlier one, a depth left null with nothing wanted in its area is not selected, and an add-on it only
  // considers (no outcome wanted and no depth stated in its area) is planned as follow-on scope outside the
  // entitlement. A brief that states neither keeps the planning defaults: considered add-ons are planned as before.
  const current = document.fields;
  const depthGiven = isPlainObject(discovery.componentDepth) ? discovery.componentDepth : null;
  const wantedGiven = isPlainObject(discovery.outcomesWanted) ? discovery.outcomesWanted : null;
  const statesScope = Boolean(depthGiven || wantedGiven);
  const depthStated = (key: string) => typeof depthGiven?.[key] === "string" && String(depthGiven[key]).trim() !== "";
  const wanted: Record<string, string[]> = {};
  for (const [detailKey] of OUTCOME_AREAS) {
    const allowed = focusOptions(detailKey);
    wanted[detailKey] = [];
    for (const value of textList(wantedGiven?.[detailKey], `discovery.outcomesWanted.${detailKey}`, warnings)) {
      const focus = value.toLowerCase().replace(/[\s_]+/g, "-");
      if (!allowed.includes(focus)) { warnings.push(`discovery.outcomesWanted.${detailKey}: "${value}" is not a recognized outcome; ignored`); continue; }
      wanted[detailKey].push(focus);
    }
  }
  const areaSelected = (detailKey: string) => !statesScope || wanted[detailKey].length > 0 || Boolean(DEPTH_OF_AREA[detailKey] && depthStated(DEPTH_OF_AREA[detailKey]));
  const priorities = new Set<string>(current.priorities);
  // Areas the brief answers are rebuilt from it; the others keep what is already selected.
  for (const [detailKey, capability] of OUTCOME_AREAS) if (Array.isArray(wantedGiven?.[detailKey])) priorities.delete(capability);
  const focusAdditions: Record<string, Set<string>> = {};
  const followOnOnly = new Set<string>();
  let efficiency = false;
  const considered = new Map<string, { detailKey: string; focus: string[] }>();
  for (const value of textList(discovery.addOnsConsidered, "discovery.addOnsConsidered", warnings)) {
    const key = canonicalAddOn(value);
    if (!key) { warnings.push(`discovery.addOnsConsidered: "${value}" is not a recognized add-on; ignored`); continue; }
    const addOn = ADD_ON_OUTCOMES[key];
    if (addOn.efficiency) {
      if (!statesScope || depthStated("efficiency")) efficiency = true;
      else followOnOnly.add("efficiency");
    }
    // Considered is not wanted: an add-on the customer only considered is follow-on scope. What the plan builds comes
    // from outcomesWanted and componentDepth.
    if (addOn.priority && addOn.detailKey && addOn.focus) considered.set(addOn.priority, { detailKey: addOn.detailKey, focus: addOn.focus });
    if (key === "hcx") changes.push("discovery.addOnsConsidered: HCX is planned through the migration waves; no separate outcome added");
    if (key === "nsx") changes.push("discovery.addOnsConsidered: NSX is part of the VCF platform; no separate outcome added");
  }
  // Outcomes the customer asked for in each area build the adoption plan.
  for (const [detailKey, capability] of OUTCOME_AREAS) {
    for (const focus of wanted[detailKey]) {
      priorities.add(capability);
      (focusAdditions[detailKey] ??= new Set()).add(focus);
    }
  }
  // A considered add-on outside the planned areas is follow-on scope; inside them it adds nothing.
  for (const [capability, { detailKey, focus }] of Array.from(considered.entries())) {
    // In an area the plan already builds, a considered add-on adds nothing: what is built comes from outcomesWanted.
    if (priorities.has(capability) || (statesScope && areaSelected(detailKey))) continue;
    // Outside them it is follow-on scope, estimated from its outcome.
    priorities.add(capability);
    focusAdditions[detailKey] ??= new Set();
    focus.forEach(item => focusAdditions[detailKey].add(item));
    followOnOnly.add(capability);
  }
  for (const capability of Array.from(followOnOnly)) changes.push(`discovery.addOnsConsidered: ${capability === "efficiency" ? "memory tiering" : capability} is considered but not selected; planned as follow-on scope after the entitlement`);
  const declined = textList(discovery.notInterested, "discovery.notInterested", warnings);
  const declinedPriorities = new Set(declined.flatMap(value => {
    const key = canonicalAddOn(value);
    return key && ADD_ON_OUTCOMES[key].priority ? [ADD_ON_OUTCOMES[key].priority!] : [];
  }));

  const details = { ...current.adoptionDetails } as Record<string, unknown>;
  for (const [detailKey] of OUTCOME_AREAS) if (Array.isArray(wantedGiven?.[detailKey])) details[detailKey] = [];
  for (const [detailKey, additions] of Object.entries(focusAdditions)) {
    details[detailKey] = Array.from(new Set([...(details[detailKey] as string[]), ...Array.from(additions)]));
  }
  const depths = { ...current.adoptionDetails.componentDepths };
  if (depthGiven) {
    // A null depth is not selected unless the brief wants outcomes in that area, where the planning default stays.
    for (const key of Object.keys(depths) as Array<keyof typeof depths>) {
      if (depthStated(key) || key === "efficiency") continue;
      const areas = Object.entries(DEPTH_OF_AREA).filter(([, depthKey]) => depthKey === key).map(([area]) => area);
      if (!areas.some(area => wanted[area].length)) depths[key] = "not-selected";
    }
    if (!depthStated("efficiency")) depths.efficiency = "not-selected";
  }
  if (efficiency && depths.efficiency === "not-selected") depths.efficiency = "tier-1";
  details.componentDepths = depths;
  details.followOnOnly = statesScope ? Array.from(followOnOnly) : current.adoptionDetails.followOnOnly;
  // Out of scope: the customer has ruled it out. It leaves the plan and the follow-on completely, unlike a considered
  // add-on (follow-on) or a declined one (simply not added).
  const outOfScopeGiven = discovery.outOfScope !== undefined ? discovery.outOfScope : discovery.outOfScopeThisTerm;
  const outOfScopeKey = discovery.outOfScope !== undefined ? "discovery.outOfScope" : "discovery.outOfScopeThisTerm";
  const outOfScope: string[] = [];
  const dropped = new Set<string>();
  const removeFocus = (detailKey: string, focus: string[]) => {
    details[detailKey] = (details[detailKey] as string[]).filter(item => !focus.includes(item));
  };
  for (const value of textList(outOfScopeGiven, outOfScopeKey, warnings)) {
    const key = canonicalAddOn(value);
    const addOn = key ? ADD_ON_OUTCOMES[key] : null;
    const focusKey = value.toLowerCase().replace(/[\s_]+/g, "-");
    const area = OUTCOME_AREAS.find(([detailKey]) => focusOptions(detailKey).includes(focusKey));
    if (addOn?.efficiency) {
      depths.efficiency = "not-selected";
      dropped.add("efficiency");
    } else if (addOn?.detailKey && addOn.focus) {
      removeFocus(addOn.detailKey, addOn.focus);
      if (addOn.priority) dropped.add(addOn.priority);
    } else if (area) {
      removeFocus(area[0], [focusKey]);
      dropped.add(area[1]);
    } else {
      warnings.push(`${outOfScopeKey}: "${value}" is not a recognized add-on or outcome; ignored`);
      continue;
    }
    outOfScope.push(addOn?.label ?? value);
    changes.push(`${outOfScopeKey}: ${addOn?.label ?? value} is out of scope; left out of the plan and the follow-on`);
  }
  for (const capability of Array.from(dropped)) {
    // An area with nothing left in it leaves the plan and the follow-on.
    const detailKey = OUTCOME_AREAS.find(([, owner]) => owner === capability)?.[0];
    const empty = capability === "efficiency" || (detailKey !== undefined && !(details[detailKey] as string[]).length);
    if (!empty) continue;
    priorities.delete(capability);
    details.followOnOnly = (details.followOnOnly as string[]).filter(item => item !== capability);
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
  // A segment the brief states sets the plan inputs: Commercial builds a Commercial plan, and VVF is kept only there.
  const commercialPlan = "customerSegment" in fieldsPatch ? fieldsCheck.data.customerSegment === "commercial" : fieldsCheck.data.commercialPlan;
  const vvfDropped = !commercialPlan && fieldsCheck.data.adoptionDetails.platformEdition === "vvf";
  if (vvfDropped && "platformEdition" in detailsPatch) warnings.push("discovery.platformEdition: VVF applies only to a Commercial plan; planned as VCF");
  const fields: MinimalFields = {
    ...fieldsCheck.data,
    commercialPlan,
    adoptionDetails: vvfDropped ? { ...fieldsCheck.data.adoptionDetails, platformEdition: "vcf" } : fieldsCheck.data.adoptionDetails,
  };

  // ---- Report content --------------------------------------------------------------------------
  const prior = document.report;
  // Loose list values are kept when they name a storage type and dropped with a warning when they do not.
  const STORAGE = ["vsan", "nfs-v3", "vmfs-fc", "other-existing"];
  const storageSecondary = discovery.storageSecondary === undefined ? undefined : textList(discovery.storageSecondary, "discovery.storageSecondary", warnings).map(value => value.toLowerCase().replace(/[\s_]+/g, "-")).filter(value => {
    if (STORAGE.includes(value)) return true;
    warnings.push(`discovery.storageSecondary: "${value}" is not a storage type (${STORAGE.join(", ")}); ignored`);
    return false;
  });
  const vsphere8Strategy = typeof discovery.vsphere8Strategy === "string" && !(VSPHERE8_STRATEGIES as readonly string[]).includes(discovery.vsphere8Strategy)
    ? (warnings.push(`discovery.vsphere8Strategy: "${discovery.vsphere8Strategy}" is not one of ${VSPHERE8_STRATEGIES.join(", ")}; ignored`), null)
    : discovery.vsphere8Strategy;
  const discoveryCheck = discoveryAnswersSchema.safeParse({ ...prior.discovery, ...Object.fromEntries(Object.entries({ ...discovery, ...(storageSecondary ? { storageSecondary } : {}), ...(vsphere8Strategy !== undefined ? { vsphere8Strategy } : {}) }).filter(([key]) => key in discoveryAnswersSchema.shape)) });
  if (!discoveryCheck.success) warnings.push(...discoveryCheck.error.issues.map(issue => `discovery.${issue.path.join(".")}: ${issue.message}; kept the previous value`));
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
    }),
    discovery: discoveryCheck.success ? discoveryCheck.data : prior.discovery,
    declined: keep(Array.from(new Set([...declined, ...outOfScope])), prior.declined),
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
    customerEffort: keep(parseRows(Array.isArray(brief.customerEffort) ? brief.customerEffort.map(row => isPlainObject(row) ? { ...row, phase: String(row.phase ?? "").toLowerCase().replace(/[\s_]+/g, "-") } : row) : brief.customerEffort, element(reportShape.customerEffort), "customerEffort", warnings), prior.customerEffort),
    openItems: keep(parseRows(brief.openItems, element(reportShape.openItems), "openItems", warnings), prior.openItems),
    personnel: keep(parseRows(brief.personnel, element(reportShape.personnel), "personnel", warnings), prior.personnel),
    milestonesToDate: keep(parseRows(brief.milestonesToDate, element(reportShape.milestonesToDate), "milestonesToDate", warnings), prior.milestonesToDate),
    sources: keep(parseRows(brief.sources, element(reportShape.sources), "sources", warnings), prior.sources),
    revision: typeof brief.revision === "string" ? brief.revision : prior.revision,
    hiddenGenerated: prior.hiddenGenerated,
    workPackageHours: prior.workPackageHours,
  };

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
  if (brief.resourceAssignments !== undefined && brief.resourceAssignments !== null) warnings.push("resourceAssignments: signed resource assignments are no longer used; the block is ignored");
  if (bsasBrief && Object.keys(bsasBrief).some(key => !["hours", "termStart", "termEnd"].includes(key))) warnings.push("bsas: only BSAS hours and term dates are kept; any amount, rate or tier is left out of the plan");
  if (report.entitlement.hours !== prior.entitlement.hours) changes.push(`report.entitlement.hours: ${prior.entitlement.hours ?? "not set"} → ${report.entitlement.hours ?? "not set"}`);

  if (!fields.customerName) missing.push("Customer name");
  if (fields.fundingSource === "bsas") {
    if (!fields.bsasStart) missing.push("BSAS start date");
  } else {
    if (!fields.entitlementStart) missing.push("Entitlement start date");
    if (!fields.entitlementAmount) missing.push("Entitlement value");
    if (report.entitlement.hours === null) missing.push("Entitled hours");
  }
  if (report.entitlement.hoursConsumed === null) missing.push("Hours consumed to date");
  if (!report.headline) missing.push("Cover headline");
  if (!report.whatWeHeard.length) missing.push("What we heard");
  if (!report.openQuestions.length) missing.push("Open questions");
  if (!report.personnel.length) missing.push("Target personnel");

  // Fields changed, so a generated plan is rebuilt; a hand-edited plan keeps its timelines.
  // A customer-owned row the brief gives for waves sets the Migration waves setting to the matching customer request, and the change is logged.
  // "Remaining" or "later" waves are the second option; a row for the waves in general is the third. A planner's earlier choice stands.
  const waveRow = parseRows(brief.customerOwnedWork, element(reportShape.customerOwnedWork), "customerOwnedWork", []).find(row => WAVES_LABEL.test(row.label));
  const stated: EngagementDocument = { ...document, fields, report };
  const withWaves = waveRow && !fields.estimateInputs.migrationWaves
    ? withMigrationWavesChoice(stated, /\b(remaining|later|rest of)\b/i.test(waveRow.label) ? "customer-remaining" : "customer-all")
    : stated;
  const merged = migrateDocument(withWaves);
  const next = refreshDerivedDocument(merged);
  return { ok: true, document: next, changes, coerced: coercer.coerced, warnings, missing };
}
