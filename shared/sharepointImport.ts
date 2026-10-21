/**
 * Daily import of the SharePoint VSA Pipeline List CSV export. Pure: parsing, mapping, matching, and the per-field merge.
 * The database side (load, apply in one transaction) is in server/db.ts. docs/VSA-TRACKER-DATA-MODEL.md sections 10 and 12.4.
 */
import { parseCsv } from "./csv";
import { OPPORTUNITY_NUMBER_PATTERN, type AssignmentRole } from "./vsaFields";
import { STAGE_LABELS, type Segment, type Stage } from "./vsaStage";

/** Client Folder values are site-relative SharePoint paths; this host makes them links. Text only; the app never fetches it. */
export const SHAREPOINT_HOST = "https://cdw.sharepoint.com";
export const MAX_IMPORT_CSV_BYTES = 5_000_000;

export type FieldValue = string | number | boolean | null;

/** Engagement columns the import writes. Anything else on the record is never touched by an import. */
export const IMPORT_FIELDS = [
  "customerName",
  "customerState",
  "salesforceOpportunityId",
  "opportunityNumber",
  "serNumber",
  "salesforceCustomerId",
  "sharepointItemId",
  "region",
  "program",
  "segment",
  "entitlementInterest",
  "raStatus",
  "riskAssessment",
  "health",
  "waitingOn",
  "vcfAssessment",
  "isFundingExtension",
  "nextSteps",
  "statusNotes",
  "fcpDraftCreatedOn",
  "fcpBroadcomAcceptedOn",
  "fcpCustomerAcceptedOn",
  "ikomOn",
  "ckomOn",
  "workAuthReceivedOn",
  "poReceivedOn",
  "projectStartOn",
  "estimatedCloseOn",
  "deliveryWindowEnd",
  "entitlementValue",
  "estimatedDealValue",
  "broadcomPo",
  "clientFolderUrl",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ImportFields = Record<ImportField, FieldValue>;

/** Roles the SharePoint list carries. The Broadcom AD comes from the intake form, not the list. */
export const IMPORT_ROLES = ["sales_rep", "account_manager", "presales", "architect", "pm", "sr_consultant"] as const satisfies readonly AssignmentRole[];
export type ImportRole = (typeof IMPORT_ROLES)[number];
export type ImportAssignment = { displayName: string; broadcomEmail: string | null };

/** Keys in the import snapshot besides the fields: the stage and each role's name and Broadcom email. */
const stageKey = "stage";
const nameKey = (role: ImportRole) => `assignment.${role}`;
const emailKey = (role: ImportRole) => `assignmentEmail.${role}`;
export type ImportSnapshot = Record<string, FieldValue>;

const UNIQUE_FIELDS = ["opportunityNumber", "salesforceOpportunityId", "sharepointItemId"] as const;
type UniqueField = (typeof UNIQUE_FIELDS)[number];
const isUniqueField = (field: string): field is UniqueField => (UNIQUE_FIELDS as readonly string[]).includes(field);

// ---------------------------------------------------------------------------------------------------------------------
// Columns

const COLUMN = {
  id: "ID",
  customerName: "Customer Name",
  customerState: "Customer State",
  opportunityLink: "Opportunity ID",
  dealId: "Deal ID or Name",
  region: "West vs East",
  program: "Program",
  segment: "BC Segment",
  interest: "Customer Entitlement Interest",
  approvalStage: "VSA Approval Stage",
  resourceAssignments: "Resource Assignments",
  presales: "Nat. Presales",
  dcFsa: "DC FSA",
  vcfAssessment: "VCF Assessment",
  fcpDraftCreated: "FCP Draft Created Date",
  fcpSubmitted: "FCP Submitted",
  fcpCustomerAccepted: "FCP Customer Acceptance Date",
  fcpDone: "FCP Done",
  ikom: "IKOM Date",
  risk: "CDW Risk Assessment",
  nextSteps: "Next Steps",
  ckom: "CKOM Date",
  fcpBroadcomAccepted: "FCP Broadcom Acceptance Date",
  workAuth: "Work Auth Rec'd Date",
  health: "Project Status",
  amount: "VSA Amount",
  poReceived: "PO Received",
  statusNotes: "Project Status Notes",
  estimatedClose: "Estimated Close Date",
  salesRep: "Sales Rep / Owner",
  expiration: "VSA Expiration",
  accountManager: "CDW Account Manager",
  account: "New CDW Account #",
  dealValue: "Estimated Deal Value ($)",
  broadcomPo: "Broadcom PO",
  pmBroadcomEmail: "PM: Broadcom email",
  architectBroadcomEmail: "Architect: Broadcom email",
  pm: "PM",
  srConsultantBroadcomEmail: "Sr. Consultant: Broadcom email",
  architect: "Architect",
  projectStart: "Project Start Date",
  srConsultant: "Sr. Consultant",
  isVsa: "Is VSA?",
  fundingExtension: "Funding Extension",
  modified: "Modified",
  ser: "SER Number",
  clientFolder: "Client Folder",
} as const;

/** Without these the file is not a Pipeline List export. Other columns may be missing; their fields are then left alone. */
const REQUIRED_COLUMNS = [COLUMN.customerName, COLUMN.approvalStage, COLUMN.dealId, COLUMN.ser, COLUMN.account];

/** SharePoint writes "#" in a header as "%23". */
function normalizeHeader(header: string) {
  return header.replace(/%23/g, "#").trim();
}

export type RawRow = { rowNumber: number; cells: Map<string, string> };
export type ParsedFile = { rows: RawRow[]; columns: Set<string>; problems: string[] };

export function parsePipelineCsv(text: string): ParsedFile {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], columns: new Set(), problems: ["The file is empty."] };
  const headers = table[0].map(normalizeHeader);
  const columns = new Set(headers);
  const missing = REQUIRED_COLUMNS.filter(column => !columns.has(column));
  if (missing.length) return { rows: [], columns, problems: [`This does not look like a VSA Pipeline List export. Missing columns: ${missing.join(", ")}.`] };
  const problems: string[] = [];
  if (!columns.has(COLUMN.id)) problems.push("No ID column. Add SharePoint's built-in ID column to the exported view so every row has a stable key; until then rows match on opportunity number, SER, and Customer ID.");
  const rows = table.slice(1).map((cells, index) => ({
    rowNumber: index + 2,
    cells: new Map(headers.map((header, column) => [header, (cells[column] ?? "").trim()])),
  }));
  return { rows, columns, problems };
}

// ---------------------------------------------------------------------------------------------------------------------
// Value parsers

const blank = (value: string | undefined) => !value || value === "[]";

function parseUsDate(value: string): string | null | undefined {
  if (blank(value)) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
  const parts = iso ? [iso[1], iso[2], iso[3]] : us ? [us[3], us[1], us[2]] : null;
  if (!parts) return undefined;
  const [year, month, day] = parts;
  const result = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${result}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(result) ? result : undefined;
}

function parseMoney(value: string): string | null | undefined {
  if (blank(value)) return null;
  const digits = value.replace(/[$,\s]/g, "");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(digits)) return undefined;
  return Number(digits).toFixed(2);
}

function parseBool(value: string) {
  return /^(true|yes|1)$/i.test(value);
}

/** Person columns hold "[]" when empty, comma-separated names, and a "Z_Archive:" prefix for people archived in SharePoint. */
function parsePeople(value: string): { names: string[]; archived: boolean } {
  if (blank(value)) return { names: [], archived: false };
  let archived = false;
  const names = value
    .split(",")
    .map(name => name.trim())
    .map(name => {
      const stripped = name.replace(/^Z_Archive:\s*/i, "");
      if (stripped !== name) archived = true;
      return stripped;
    })
    .filter(Boolean);
  return { names, archived };
}

function parseEmails(value: string) {
  return value
    .split(/[;,]/)
    .map(email => email.trim())
    .filter(email => email.includes("@"));
}

function text(value: string, max: number) {
  return blank(value) ? null : value.slice(0, max);
}

const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const PROGRAM_VALUES: Record<string, string> = {
  entitlement: "entitlement",
  extendedexpert: "extended_expert",
  bsas: "bsas",
  cashsow: "cash_sow",
  governmententitlement: "government_entitlement",
  governmentbsas: "government_bsas",
};
const RA_BY_NUMBER: Record<string, string> = { "0": "not_needed", "1": "not_started", "2": "waiting_from_broadcom", "5": "sent_to_broadcom", "6": "resources_onboarding", "7": "in_flight", "8": "delivery_complete", "9": "cancelled" };
const RISK_VALUES: Record<string, string> = { notsubmitted: "not_submitted", submitted: "submitted", standardtermsacknowledged: "standard_terms_acknowledged", nanotinterested: "not_applicable", na: "not_applicable" };
const SEGMENT_VALUES: Record<string, Segment> = { corporate: "corporate", strategic: "strategic", commercial: "commercial" };
const leadingNumber = (value: string) => value.match(/^(\d)/)?.[1];

function interestValue(value: string) {
  const key = squash(value);
  if (key.startsWith("notinterested")) return "not_interested";
  if (key.startsWith("interested")) return "interested";
  if (key.startsWith("pending")) return "pending";
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------------
// Row mapping

export type MappedRow = {
  rowNumber: number;
  fields: Partial<ImportFields>;
  stage: Stage | null;
  /** The date the derived stage began, from its gate date, else the row's Modified date. */
  stageEffectiveOn: string | null;
  assignments: Partial<Record<ImportRole, ImportAssignment | null>>;
  flags: string[];
  skipReason?: string;
};

function deriveStage(approval: string, ra: string | null, fields: Partial<ImportFields>, fcpSubmitted: boolean, flags: string[]): { stage: Stage | null; effectiveOn: string | null } {
  const date = (field: ImportField) => (fields[field] as string | null | undefined) ?? null;
  const segment = (fields.segment as Segment | null | undefined) ?? null;
  const afterFcp = (): { stage: Stage; effectiveOn: string | null } => {
    if (date("fcpCustomerAcceptedOn")) return { stage: "ra_staffing", effectiveOn: date("fcpCustomerAcceptedOn") };
    if (fcpSubmitted || date("fcpBroadcomAcceptedOn")) {
      if (segment === "commercial" || date("fcpBroadcomAcceptedOn")) return { stage: "customer_approval", effectiveOn: date("fcpBroadcomAcceptedOn") };
      return { stage: "broadcom_approval", effectiveOn: null };
    }
    return { stage: "fcp_draft", effectiveOn: date("fcpDraftCreatedOn") };
  };
  switch (leadingNumber(approval)) {
    case "0":
      return { stage: "broadcom_request", effectiveOn: null };
    case "1":
      return { stage: "discovery", effectiveOn: null };
    case "2":
      return afterFcp();
    case "3": {
      if (ra === "in_flight") return { stage: "in_delivery", effectiveOn: date("ckomOn") ?? date("projectStartOn") };
      if (ra === "delivery_complete") return { stage: "complete", effectiveOn: null };
      if (ra === "cancelled") return { stage: "lost", effectiveOn: null };
      if (date("poReceivedOn") && date("ckomOn")) {
        flags.push("Customer kickoff and PO are dated but Resource Assignments is not \"Project In Flight\"; placed in In Delivery");
        return { stage: "in_delivery", effectiveOn: date("ckomOn") };
      }
      if (date("poReceivedOn")) return { stage: "kickoff", effectiveOn: date("poReceivedOn") };
      return { stage: "ra_staffing", effectiveOn: date("fcpCustomerAcceptedOn") };
    }
    case "4":
      return { stage: "refused", effectiveOn: null };
    case "5": {
      fields.waitingOn = "sales";
      if (fcpSubmitted || date("fcpCustomerAcceptedOn") || date("fcpDraftCreatedOn") || date("fcpBroadcomAcceptedOn")) return afterFcp();
      return { stage: "discovery", effectiveOn: null };
    }
    case "6":
      return { stage: "paused", effectiveOn: null };
    case "7":
      return { stage: "lost", effectiveOn: null };
    default:
      flags.push(blank(approval) ? "No VSA Approval Stage; stage left as it is" : `Unrecognized VSA Approval Stage "${approval}"; stage left as it is`);
      return { stage: null, effectiveOn: null };
  }
}

export function mapPipelineRow(raw: RawRow, columns: Set<string>): MappedRow {
  const flags: string[] = [];
  const get = (column: string) => raw.cells.get(column) ?? "";
  const has = (column: string) => columns.has(column);
  const fields: Partial<ImportFields> = {};

  const setEnum = (field: ImportField, column: string, lookup: (value: string) => string | undefined) => {
    if (!has(column)) return;
    const value = get(column);
    if (blank(value)) return void (fields[field] = null);
    const mapped = lookup(value);
    if (!mapped) flags.push(`Unrecognized ${column} value "${value}"; left empty`);
    fields[field] = mapped ?? null;
  };
  const setDate = (field: ImportField, column: string) => {
    if (!has(column)) return;
    const parsed = parseUsDate(get(column));
    if (parsed === undefined) flags.push(`${column} "${get(column)}" is not a date; left empty`);
    fields[field] = parsed ?? null;
  };
  const setMoney = (field: ImportField, column: string) => {
    if (!has(column)) return;
    const parsed = parseMoney(get(column));
    if (parsed === undefined) flags.push(`${column} "${get(column)}" is not a dollar amount; left empty`);
    if (parsed === "0.00") flags.push(`${column} is $0.00, treated as a placeholder; left empty`);
    fields[field] = parsed && parsed !== "0.00" ? parsed : null;
  };
  const setText = (field: ImportField, column: string, max: number) => {
    if (has(column)) fields[field] = text(get(column), max);
  };

  if (has(COLUMN.isVsa) && !blank(get(COLUMN.isVsa)) && !parseBool(get(COLUMN.isVsa))) {
    return { rowNumber: raw.rowNumber, fields, stage: null, stageEffectiveOn: null, assignments: {}, flags, skipReason: "\"Is VSA?\" is false" };
  }
  const customerName = text(get(COLUMN.customerName), 240);
  if (!customerName) return { rowNumber: raw.rowNumber, fields, stage: null, stageEffectiveOn: null, assignments: {}, flags, skipReason: "No customer name" };
  fields.customerName = customerName;

  if (has(COLUMN.id)) {
    const id = get(COLUMN.id);
    fields.sharepointItemId = /^\d{1,9}$/.test(id) ? Number(id) : null;
    if (!fields.sharepointItemId) flags.push(`ID "${id}" is not a SharePoint item number`);
  }

  // Opportunity: the C-OPP number from "Deal ID or Name", else the link text; the Salesforce record ID from the link.
  const link = get(COLUMN.opportunityLink);
  const linkText = link.replace(/<[^>]+>/g, "").trim();
  const dealId = get(COLUMN.dealId).toUpperCase();
  const opportunityNumber = [dealId, linkText.toUpperCase()].find(value => OPPORTUNITY_NUMBER_PATTERN.test(value)) ?? null;
  fields.opportunityNumber = opportunityNumber;
  if (!opportunityNumber) {
    flags.push(/^AWC-OPP-/i.test(dealId) ? "Needs opportunity number: AWC-OPP placeholder is not valid" : blank(dealId) ? "Needs opportunity number" : `Needs opportunity number: "${dealId}" is not a C-OPP number`);
  }
  if (has(COLUMN.opportunityLink)) fields.salesforceOpportunityId = link.match(/\/Opportunity\/([A-Za-z0-9]{15,18})\b/)?.[1] ?? null;

  setText("serNumber", COLUMN.ser, 32);
  setText("salesforceCustomerId", COLUMN.account, 32);
  if (!fields.salesforceCustomerId) flags.push("No account number (Customer ID)");
  setText("customerState", COLUMN.customerState, 64);
  setText("broadcomPo", COLUMN.broadcomPo, 64);
  setText("nextSteps", COLUMN.nextSteps, 10_000);
  setText("statusNotes", COLUMN.statusNotes, 10_000);

  setEnum("region", COLUMN.region, value => ({ west: "west", east: "east" })[squash(value)]);
  setEnum("program", COLUMN.program, value => PROGRAM_VALUES[squash(value)]);
  setEnum("segment", COLUMN.segment, value => SEGMENT_VALUES[squash(value)]);
  if (has(COLUMN.segment) && !fields.segment) flags.push("Segment not set");
  setEnum("entitlementInterest", COLUMN.interest, interestValue);
  setEnum("raStatus", COLUMN.resourceAssignments, value => RA_BY_NUMBER[leadingNumber(value) ?? ""]);
  setEnum("riskAssessment", COLUMN.risk, value => RISK_VALUES[squash(value)]);
  setEnum("health", COLUMN.health, value => ({ green: "green", yellow: "yellow", red: "red" })[squash(value)]);
  if (has(COLUMN.vcfAssessment)) fields.vcfAssessment = parseBool(get(COLUMN.vcfAssessment));
  if (has(COLUMN.fundingExtension)) fields.isFundingExtension = parseBool(get(COLUMN.fundingExtension));

  setDate("fcpDraftCreatedOn", COLUMN.fcpDraftCreated);
  setDate("fcpBroadcomAcceptedOn", COLUMN.fcpBroadcomAccepted);
  setDate("fcpCustomerAcceptedOn", COLUMN.fcpCustomerAccepted);
  setDate("ikomOn", COLUMN.ikom);
  setDate("ckomOn", COLUMN.ckom);
  setDate("workAuthReceivedOn", COLUMN.workAuth);
  setDate("poReceivedOn", COLUMN.poReceived);
  setDate("projectStartOn", COLUMN.projectStart);
  setDate("estimatedCloseOn", COLUMN.estimatedClose);
  setDate("deliveryWindowEnd", COLUMN.expiration);
  setMoney("entitlementValue", COLUMN.amount);
  setMoney("estimatedDealValue", COLUMN.dealValue);

  if (has(COLUMN.clientFolder)) {
    const folder = get(COLUMN.clientFolder);
    const url = blank(folder) ? null : folder.startsWith("/") ? `${SHAREPOINT_HOST}${folder}` : folder.startsWith("https://") ? folder : null;
    if (!blank(folder) && !url) flags.push("Client Folder is not a SharePoint path or https link; left empty");
    fields.clientFolderUrl = url && url.length <= 1024 ? url : null;
  }

  const fcpSubmitted = parseBool(get(COLUMN.fcpSubmitted));
  if (fcpSubmitted) flags.push("FCP Submitted is checked but SharePoint has no submitted date; the FCP submitted date is left empty");
  if (has(COLUMN.fcpDone) && parseBool(get(COLUMN.fcpDone)) !== Boolean(fields.fcpCustomerAcceptedOn)) flags.push("FCP Done disagrees with the FCP customer acceptance date");
  if (fields.entitlementValue === undefined && !has(COLUMN.amount)) flags.push("No VSA Amount column");

  // Assignments. "Architect" (delivery, with a Broadcom email) wins over "DC FSA"; a difference is reported.
  const assignments: Partial<Record<ImportRole, ImportAssignment | null>> = {};
  const assign = (role: ImportRole, column: string, emailColumn?: string) => {
    if (!has(column)) return;
    const { names, archived } = parsePeople(get(column));
    if (archived) flags.push(`${column}: archived in SharePoint (Z_Archive)`);
    if (names.length > 1) flags.push(`${column} lists ${names.length} people; all are kept in one assignment`);
    const emails = emailColumn && has(emailColumn) ? parseEmails(get(emailColumn)) : [];
    assignments[role] = names.length ? { displayName: names.join(", ").slice(0, 240), broadcomEmail: emails.length ? emails.join("; ").slice(0, 320) : null } : null;
  };
  assign("sales_rep", COLUMN.salesRep);
  assign("account_manager", COLUMN.accountManager);
  assign("presales", COLUMN.presales);
  assign("pm", COLUMN.pm, COLUMN.pmBroadcomEmail);
  assign("sr_consultant", COLUMN.srConsultant, COLUMN.srConsultantBroadcomEmail);
  assign("architect", COLUMN.architect, COLUMN.architectBroadcomEmail);
  const fsa = has(COLUMN.dcFsa) ? parsePeople(get(COLUMN.dcFsa)).names.join(", ") : "";
  if (!assignments.architect && fsa) assignments.architect = { displayName: fsa.slice(0, 240), broadcomEmail: null };
  else if (assignments.architect && fsa && fsa !== assignments.architect.displayName) flags.push(`DC FSA (${fsa}) differs from Architect (${assignments.architect.displayName}); Architect kept`);

  const derived = deriveStage(get(COLUMN.approvalStage), (fields.raStatus as string | null | undefined) ?? null, fields, fcpSubmitted, flags);
  if ((derived.stage === "kickoff" || derived.stage === "in_delivery") && !fields.poReceivedOn) flags.push(`${STAGE_LABELS[derived.stage]} without a PO received date`);
  if (derived.stage && fields.waitingOn === undefined) fields.waitingOn = null;
  const modified = parseUsDate(get(COLUMN.modified)) ?? null;

  return { rowNumber: raw.rowNumber, fields, stage: derived.stage, stageEffectiveOn: derived.stage ? (derived.effectiveOn ?? modified) : null, assignments, flags };
}

// ---------------------------------------------------------------------------------------------------------------------
// Planning: match each row to a record, then merge field by field against the last import

export type ExistingRecord = Partial<Record<ImportField, FieldValue>> & {
  id: number;
  customerName: string;
  stage: Stage;
  stageEnteredOn: string;
  intakeSource: string;
  importSnapshot: ImportSnapshot | null;
  assignments: Partial<Record<ImportRole, ImportAssignment>>;
};

export type FieldChange = { field: string; from: FieldValue; to: FieldValue };
export type FieldConflict = { field: string; app: FieldValue; sharepoint: FieldValue };

export type RowReport = {
  rowNumber: number;
  customerName: string;
  opportunityNumber: string | null;
  action: "create" | "update" | "unchanged" | "skip";
  recordId?: number;
  matchedBy?: "sharepointItemId" | "opportunityNumber" | "serNumber" | "salesforceCustomerId";
  changes: FieldChange[];
  conflicts: FieldConflict[];
  flags: string[];
  skipReason?: string;
};

export type CreateOp = {
  rowNumber: number;
  fields: Partial<ImportFields>;
  stage: Stage;
  stageEffectiveOn: string;
  assignments: Partial<Record<ImportRole, ImportAssignment>>;
  snapshot: ImportSnapshot;
};

export type UpdateOp = {
  id: number;
  rowNumber: number;
  fields: Partial<ImportFields>;
  stageChange?: { from: Stage; to: Stage; effectiveOn: string };
  assignments: Partial<Record<ImportRole, ImportAssignment | null>>;
  snapshot: ImportSnapshot;
};

export type ImportPlan = {
  fileProblems: string[];
  rows: RowReport[];
  creates: CreateOp[];
  updates: UpdateOp[];
  /** Records from earlier imports that are not in this file. Never deleted. */
  missing: { id: number; customerName: string; opportunityNumber: string | null }[];
  summary: { rows: number; created: number; updated: number; unchanged: number; skipped: number; conflicts: number; flagged: number; missing: number };
};

const same = (a: FieldValue | undefined, b: FieldValue | undefined) => (a ?? null) === (b ?? null);

/**
 * Three-way merge for one field. Base is the value from the last import (undefined if this field was never imported).
 * SharePoint edits flow in, app edits are never overwritten, and only two-sided edits are conflicts.
 */
export function mergeField(base: FieldValue | undefined, app: FieldValue, incoming: FieldValue): "keep" | "take" | "conflict" {
  if (same(app, incoming)) return "keep";
  if (base === undefined) {
    if (incoming === null) return "keep";
    return app === null ? "take" : "conflict";
  }
  if (same(incoming, base)) return "keep";
  if (same(app, base)) return "take";
  return "conflict";
}

function snapshotOf(row: MappedRow): ImportSnapshot {
  const snapshot: ImportSnapshot = { ...row.fields };
  if (row.stage) snapshot[stageKey] = row.stage;
  for (const role of IMPORT_ROLES) {
    if (!(role in row.assignments)) continue;
    snapshot[nameKey(role)] = row.assignments[role]?.displayName ?? null;
    snapshot[emailKey(role)] = row.assignments[role]?.broadcomEmail ?? null;
  }
  return snapshot;
}

function clampDay(day: string | null, min: string, today: string) {
  const value = day ?? today;
  return value < min ? min : value > today ? today : value;
}

/**
 * A normalized pipeline row: what any pipeline source (server/pipelineSource.ts) hands to reconciliation. Fields use
 * tracker names and values, the stage is already derived, and per-row problems are in `flags`. Reconciliation does
 * not know whether it came from a CSV or a future connector.
 */
export type RawPipelineRow = MappedRow;

/** Parses and plans a CSV in one step (tests and tools). The app goes through the pipeline source instead. */
export function planImport(text: string, existing: ExistingRecord[], today: string): ImportPlan {
  const file = parsePipelineCsv(text);
  const mapped = file.rows.map(row => mapPipelineRow(row, file.columns));
  return planMappedRows(mapped, file.problems, existing, today);
}

export function planMappedRows(mapped: RawPipelineRow[], fileProblems: string[], existing: ExistingRecord[], today: string): ImportPlan {
  const byId = new Map(existing.map(record => [record.id, record]));
  const index = (field: ImportField) => {
    const map = new Map<string, number[]>();
    for (const record of existing) {
      const value = record[field];
      if (value === null || value === undefined || value === "") continue;
      const key = String(value);
      map.set(key, [...(map.get(key) ?? []), record.id]);
    }
    return map;
  };
  const indexes = { sharepointItemId: index("sharepointItemId"), opportunityNumber: index("opportunityNumber"), serNumber: index("serNumber"), salesforceCustomerId: index("salesforceCustomerId") };
  // Unique values already in use, so an import never writes a value another record holds.
  const taken = new Map<UniqueField, Map<string, number>>();
  for (const field of UNIQUE_FIELDS) {
    const map = new Map<string, number>();
    for (const record of existing) if (record[field] !== null && record[field] !== undefined) map.set(String(record[field]), record.id);
    taken.set(field, map);
  }
  const claimTaken = (field: UniqueField, value: FieldValue, owner: number) => {
    if (value === null) return true;
    const map = taken.get(field)!;
    const holder = map.get(String(value));
    if (holder !== undefined && holder !== owner) return false;
    map.set(String(value), owner);
    return true;
  };

  const claimed = new Map<number, number>(); // record id -> row number
  const pending: { rowNumber: number; sp: FieldValue; opp: FieldValue; accountSer: string | null }[] = [];
  const rows: RowReport[] = [];
  const creates: CreateOp[] = [];
  const updates: UpdateOp[] = [];
  let nextPendingId = -1;

  for (const row of mapped) {
    const report: RowReport = {
      rowNumber: row.rowNumber,
      customerName: (row.fields.customerName as string) ?? "",
      opportunityNumber: (row.fields.opportunityNumber as string | null) ?? null,
      action: "skip",
      changes: [],
      conflicts: [],
      flags: [...row.flags],
    };
    rows.push(report);
    if (row.skipReason) {
      report.skipReason = row.skipReason;
      continue;
    }

    // Match: SharePoint item ID, then opportunity number, then SER, then Customer ID (only when exactly one record fits).
    const sp = row.fields.sharepointItemId ?? null;
    const opp = row.fields.opportunityNumber ?? null;
    let match: ExistingRecord | undefined;
    let skip: string | undefined;
    for (const key of ["sharepointItemId", "opportunityNumber", "serNumber", "salesforceCustomerId"] as const) {
      const value = row.fields[key];
      if (value === null || value === undefined || value === "") continue;
      const ids = indexes[key].get(String(value)) ?? [];
      // Fallback keys never match a different SharePoint item, or a record with a different opportunity: that is another plan.
      const candidates = ids.map(id => byId.get(id)!).filter(candidate => {
        if (key === "sharepointItemId" || key === "opportunityNumber") return true;
        if (sp !== null && candidate.sharepointItemId != null && candidate.sharepointItemId !== sp) return false;
        if (opp !== null && candidate.opportunityNumber != null && candidate.opportunityNumber !== opp) return false;
        if (key === "salesforceCustomerId" && opp === null && candidate.opportunityNumber != null) return false;
        return true;
      });
      if (!candidates.length) continue;
      if (candidates.length > 1) {
        skip = `Matches ${candidates.length} records by ${key} (${candidates.map(candidate => `#${candidate.id}`).join(", ")}); not imported`;
        break;
      }
      const candidate = candidates[0];
      if (key === "opportunityNumber" && sp !== null && candidate.sharepointItemId != null && candidate.sharepointItemId !== sp) {
        skip = `Same opportunity number as record #${candidate.id}, which is a different SharePoint item; duplicate, not imported`;
        break;
      }
      match = candidate;
      report.matchedBy = key;
      break;
    }
    if (!skip && match && claimed.has(match.id)) skip = `Same record (#${match.id}) as row ${claimed.get(match.id)}; duplicate, not imported`;
    if (!skip && !match) {
      const accountSer = row.fields.salesforceCustomerId && row.fields.serNumber ? `${row.fields.salesforceCustomerId}|${row.fields.serNumber}` : null;
      const earlier = pending.find(other => (sp !== null && other.sp === sp) || (opp !== null && other.opp === opp) || (opp === null && other.opp === null && accountSer !== null && other.accountSer === accountSer));
      if (earlier) skip = `Duplicate of row ${earlier.rowNumber} (${sp !== null && earlier.sp === sp ? "same SharePoint ID" : opp !== null && earlier.opp === opp ? "same account and opportunity number" : "same account and SER, and no opportunity number to tell them apart"}); not imported`;
      else pending.push({ rowNumber: row.rowNumber, sp, opp, accountSer });
    }
    if (skip) {
      report.skipReason = skip;
      continue;
    }

    const snapshot = snapshotOf(row);

    if (!match) {
      const ownerId = nextPendingId--;
      const fields = { ...row.fields };
      for (const field of UNIQUE_FIELDS) {
        if (!claimTaken(field, fields[field] ?? null, ownerId)) {
          report.flags.push(`${field} ${fields[field]} is already on another record; left empty`);
          fields[field] = null;
        }
      }
      const assignments = Object.fromEntries(Object.entries(row.assignments).filter(([, value]) => value)) as Partial<Record<ImportRole, ImportAssignment>>;
      creates.push({ rowNumber: row.rowNumber, fields, stage: row.stage ?? "intake", stageEffectiveOn: clampDay(row.stageEffectiveOn, "0000-01-01", today), assignments, snapshot });
      report.action = "create";
      report.changes = Object.entries(fields).filter(([, value]) => value !== null).map(([field, value]) => ({ field, from: null, to: value }));
      continue;
    }

    claimed.set(match.id, row.rowNumber);
    report.recordId = match.id;
    const base = match.importSnapshot;
    const update: UpdateOp = { id: match.id, rowNumber: row.rowNumber, fields: {}, assignments: {}, snapshot };
    /** `apply` returns false to refuse a value it cannot write. */
    const decide = (field: string, app: FieldValue, incoming: FieldValue, apply: () => boolean | void) => {
      const decision = mergeField(base ? (field in base ? base[field] : undefined) : undefined, app, incoming);
      if (decision === "take") {
        if (apply() !== false) report.changes.push({ field, from: app, to: incoming });
      } else if (decision === "conflict") {
        report.conflicts.push({ field, app, sharepoint: incoming });
      }
    };
    for (const field of IMPORT_FIELDS) {
      if (!(field in row.fields)) continue;
      const incoming = row.fields[field] ?? null;
      const app = match[field] ?? null;
      if (field === "sharepointItemId" && app !== null) continue; // a matched record keeps its SharePoint item
      decide(field, app, incoming, () => {
        if (isUniqueField(field) && !claimTaken(field, incoming, match.id)) {
          report.flags.push(`${field} ${incoming} is already on another record; not applied`);
          return false;
        }
        update.fields[field] = incoming;
      });
    }
    if (row.stage) {
      decide(stageKey, match.stage, row.stage, () => {
        update.stageChange = { from: match.stage, to: row.stage!, effectiveOn: clampDay(row.stageEffectiveOn, match.stageEnteredOn, today) };
      });
    }
    for (const role of IMPORT_ROLES) {
      if (!(role in row.assignments)) continue;
      const incoming = row.assignments[role] ?? null;
      const current = match.assignments[role] ?? null;
      let next: ImportAssignment | null = current ? { ...current } : null;
      decide(nameKey(role), current?.displayName ?? null, incoming?.displayName ?? null, () => {
        next = incoming ? { displayName: incoming.displayName, broadcomEmail: next?.broadcomEmail ?? null } : null;
      });
      if (next || incoming) {
        decide(emailKey(role), current?.broadcomEmail ?? null, incoming?.broadcomEmail ?? null, () => {
          if (next) next = { ...next, broadcomEmail: incoming?.broadcomEmail ?? null };
        });
      }
      const changed = (next?.displayName ?? null) !== (current?.displayName ?? null) || (next?.broadcomEmail ?? null) !== (current?.broadcomEmail ?? null);
      if (changed) update.assignments[role] = next;
    }
    updates.push(update);
    report.action = report.changes.length ? "update" : "unchanged";
  }

  const seen = new Set(updates.map(update => update.id));
  const missing = existing
    .filter(record => !seen.has(record.id) && (record.intakeSource === "sharepoint_import" || record.importSnapshot !== null))
    .map(record => ({ id: record.id, customerName: record.customerName, opportunityNumber: (record.opportunityNumber as string | null) ?? null }));

  return {
    fileProblems,
    rows,
    creates,
    updates,
    missing,
    summary: {
      rows: rows.length,
      created: rows.filter(row => row.action === "create").length,
      updated: rows.filter(row => row.action === "update").length,
      unchanged: rows.filter(row => row.action === "unchanged").length,
      skipped: rows.filter(row => row.action === "skip").length,
      conflicts: rows.reduce((sum, row) => sum + row.conflicts.length, 0),
      flagged: rows.filter(row => row.flags.length).length,
      missing: missing.length,
    },
  };
}
