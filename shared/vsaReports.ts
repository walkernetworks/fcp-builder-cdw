/**
 * Report engine for the tracker: a field catalog, a config schema, filtering, grouping with an optional comparison
 * dimension (pivot), and measures. Pure, so the Reports screen, CSV export, and the server's Excel export compute the same
 * result. VSA amounts are summed once per entitlement group: alternative plans share one entitlement.
 */
import { z } from "zod";
import type { Engagement } from "../drizzle/schema";
import { DEFAULT_OPERATIONAL_SETTINGS, type OperationalSettings } from "./appSettings";
import type { AssignmentRole } from "./vsaFields";
import { isTerminal, STAGE_LABELS, STAGES, stageWarnings, type SourceItemSummary } from "./vsaStage";
import { daysBetween, expiryVerdict } from "./vsaViews";

export type ReportSource = Omit<Engagement, "data" | "importSnapshot"> & {
  assignments: { role: AssignmentRole; displayName: string; userId: number | null }[];
  /** The source checklist, for FCP Draft readiness warnings. */
  sourceItems?: SourceItemSummary[];
};

export type FieldType = "text" | "number" | "money" | "date" | "enum" | "bool";
export type ReportValue = string | number | boolean | null;

export type ReportField = {
  key: string;
  label: string;
  group: string;
  type: FieldType;
  /** Can be used to group or compare. */
  dimension?: boolean;
  /** Display labels for enum values. */
  labels?: Record<string, string>;
  /** `settings` are the operational thresholds (shared/appSettings.ts); only stage warnings read them. */
  get: (row: ReportSource, today: string, settings: OperationalSettings) => ReportValue;
};

const label = (labels: Record<string, string>) => labels;
const SEGMENTS = label({ corporate: "Corporate", strategic: "Strategic", commercial: "Commercial" });
const PROGRAMS = label({ entitlement: "Entitlement", extended_expert: "Extended Expert", bsas: "BSAS", cash_sow: "Cash SOW", government_entitlement: "Government: Entitlement", government_bsas: "Government BSAS" });
const REGIONS = label({ west: "West", east: "East" });
const INTEREST = label({ interested: "Interested, pursuing VCF", not_interested: "Not interested", pending: "Pending response" });
const HEALTH = label({ green: "Green", yellow: "Yellow", red: "Red" });
const WAITING = label({ sales: "Sales", customer: "Customer", broadcom: "Broadcom", cdw_internal: "CDW internal" });
const RISK = label({ not_submitted: "Not submitted", submitted: "Submitted", standard_terms_acknowledged: "Standard terms acknowledged", not_applicable: "Not applicable" });
const RA = label({ not_needed: "No RA needed", not_started: "Not started", waiting_from_broadcom: "Waiting on RA from Broadcom", sent_to_broadcom: "RA sent to Broadcom", resources_onboarding: "Resources onboarding", in_flight: "Project in flight", delivery_complete: "Delivery complete", cancelled: "Delivery cancelled" });
const SOURCES = label({ manual: "Entered in the app", sharepoint_import: "SharePoint import", intake_import: "Intake import" });

const column = (key: keyof ReportSource) => (row: ReportSource) => (row[key] ?? null) as ReportValue;
const person = (role: AssignmentRole) => (row: ReportSource) => row.assignments.find(assignment => assignment.role === role)?.displayName ?? null;

/** Every field a report can show, filter, group, or measure. */
export const REPORT_FIELDS: ReportField[] = [
  { key: "customerName", label: "Customer", group: "Identity", type: "text", get: column("customerName") },
  { key: "opportunityNumber", label: "Opportunity number", group: "Identity", type: "text", get: column("opportunityNumber") },
  { key: "salesforceCustomerId", label: "Customer ID", group: "Identity", type: "text", get: column("salesforceCustomerId") },
  { key: "serNumber", label: "SER number", group: "Identity", type: "text", get: column("serNumber") },
  { key: "intakeSource", label: "Record source", group: "Identity", type: "enum", dimension: true, labels: SOURCES, get: column("intakeSource") },

  { key: "segment", label: "Segment", group: "Classification", type: "enum", dimension: true, labels: SEGMENTS, get: column("segment") },
  { key: "program", label: "Program", group: "Classification", type: "enum", dimension: true, labels: PROGRAMS, get: column("program") },
  { key: "region", label: "Region", group: "Classification", type: "enum", dimension: true, labels: REGIONS, get: column("region") },
  { key: "customerState", label: "Customer state", group: "Classification", type: "text", dimension: true, get: column("customerState") },
  { key: "entitlementInterest", label: "Entitlement interest", group: "Classification", type: "enum", dimension: true, labels: INTEREST, get: column("entitlementInterest") },

  { key: "stage", label: "Stage", group: "Stage and status", type: "enum", dimension: true, labels: Object.fromEntries(STAGES.map(stage => [stage, STAGE_LABELS[stage]])), get: column("stage") },
  { key: "stageEnteredOn", label: "In stage since", group: "Stage and status", type: "date", get: column("stageEnteredOn") },
  { key: "daysInStage", label: "Days in stage", group: "Stage and status", type: "number", get: (row, today) => daysBetween(row.stageEnteredOn, today) },
  { key: "health", label: "Project health", group: "Stage and status", type: "enum", dimension: true, labels: HEALTH, get: column("health") },
  { key: "waitingOn", label: "Waiting on", group: "Stage and status", type: "enum", dimension: true, labels: WAITING, get: column("waitingOn") },
  { key: "riskAssessment", label: "CDW risk assessment", group: "Stage and status", type: "enum", dimension: true, labels: RISK, get: column("riskAssessment") },
  { key: "raStatus", label: "Resource assignment", group: "Stage and status", type: "enum", dimension: true, labels: RA, get: column("raStatus") },
  { key: "vcfAssessment", label: "VCF assessment done", group: "Stage and status", type: "bool", dimension: true, get: column("vcfAssessment") },
  { key: "warnings", label: "Open warnings", group: "Stage and status", type: "text", get: (row, today, settings) => stageWarnings(row, today, settings.workPlanStaleDays).join("; ") || null },
  {
    key: "missingData",
    label: "Missing key data",
    group: "Stage and status",
    type: "text",
    get: row => [!row.segment && "segment", !row.opportunityNumber && "opportunity number", !row.salesforceCustomerId && "Customer ID", !row.entitlementValue && "VSA amount", !row.deliveryWindowEnd && "VSA expiration"].filter(Boolean).join(", ") || null,
  },

  { key: "salesRep", label: "Sales rep", group: "People", type: "text", dimension: true, get: person("sales_rep") },
  { key: "accountManager", label: "Account manager", group: "People", type: "text", dimension: true, get: person("account_manager") },
  { key: "presales", label: "Presales", group: "People", type: "text", dimension: true, get: person("presales") },
  { key: "architect", label: "Architect", group: "People", type: "text", dimension: true, get: person("architect") },
  { key: "pm", label: "PM", group: "People", type: "text", dimension: true, get: person("pm") },
  { key: "srConsultant", label: "Sr. consultant", group: "People", type: "text", dimension: true, get: person("sr_consultant") },

  { key: "entitlementValue", label: "VSA amount", group: "Commercials and term", type: "money", get: column("entitlementValue") },
  { key: "estimatedDealValue", label: "Estimated deal value", group: "Commercials and term", type: "money", get: column("estimatedDealValue") },
  { key: "coreCount", label: "Licensed cores", group: "Commercials and term", type: "number", get: column("coreCount") },
  { key: "termStart", label: "Term start", group: "Commercials and term", type: "date", get: column("termStart") },
  { key: "termEnd", label: "Term end", group: "Commercials and term", type: "date", get: column("termEnd") },
  { key: "deliveryWindowEnd", label: "VSA expiration", group: "Commercials and term", type: "date", get: column("deliveryWindowEnd") },
  { key: "windowEndMonth", label: "Expiration month", group: "Commercials and term", type: "text", dimension: true, get: row => row.deliveryWindowEnd?.slice(0, 7) ?? null },
  { key: "daysLeft", label: "Days left in window", group: "Commercials and term", type: "number", get: (row, today) => (row.deliveryWindowEnd ? daysBetween(today, row.deliveryWindowEnd) : null) },
  { key: "expiry", label: "Expiry", group: "Commercials and term", type: "enum", dimension: true, labels: label({ stop: "Expired", warn: "Expiring within 90 days", ready: "In window", unknown: "No expiry date" }), get: (row, today) => expiryVerdict(row.deliveryWindowEnd, today).pill },
  { key: "entitlementGroup", label: "Plan group", group: "Commercials and term", type: "text", dimension: true, get: row => (row.entitlementGroupId === null ? null : `Group ${row.entitlementGroupId}`) },

  ...([
    ["serSubmittedOn", "SER submitted"],
    ["serApprovedOn", "Broadcom partner approval"],
    ["fcpDraftCreatedOn", "FCP draft created"],
    ["fcpSubmittedOn", "FCP submitted"],
    ["fcpBroadcomAcceptedOn", "FCP Broadcom acceptance"],
    ["fcpCustomerAcceptedOn", "FCP customer acceptance"],
    ["workPlanSentOn", "Work plan sent"],
    ["workPlanAcceptedOn", "Work plan accepted"],
    ["ikomOn", "Internal kickoff"],
    ["raReceivedOn", "RA received"],
    ["workAuthReceivedOn", "Work authorization received"],
    ["poReceivedOn", "PO received"],
    ["ckomOn", "Customer kickoff"],
    ["projectStartOn", "Project start"],
    ["estimatedCloseOn", "Estimated close"],
    ["completedOn", "Completed"],
  ] as const).map(([key, name]): ReportField => ({ key, label: name, group: "Gate dates", type: "date", get: column(key) })),

  { key: "nextSteps", label: "Next steps", group: "Notes", type: "text", get: column("nextSteps") },
  { key: "statusNotes", label: "Status notes", group: "Notes", type: "text", get: column("statusNotes") },
];

export const FIELD_BY_KEY = new Map(REPORT_FIELDS.map(field => [field.key, field]));
const fieldKey = z.string().refine(key => FIELD_BY_KEY.has(key), "Unknown field");

export const reportFilterSchema = z.discriminatedUnion("op", [
  z.object({ field: fieldKey, op: z.literal("in"), values: z.array(z.string().max(200)).max(100) }),
  z.object({ field: fieldKey, op: z.literal("contains"), text: z.string().max(200) }),
  z.object({ field: fieldKey, op: z.literal("between"), from: z.string().max(40).nullable(), to: z.string().max(40).nullable() }),
  z.object({ field: fieldKey, op: z.literal("empty") }),
  z.object({ field: fieldKey, op: z.literal("notEmpty") }),
  z.object({ field: fieldKey, op: z.literal("is"), value: z.boolean() }),
]);
export type ReportFilter = z.infer<typeof reportFilterSchema>;

export const reportMeasureSchema = z.object({ kind: z.enum(["count", "sum", "avg", "min", "max"]), field: fieldKey.nullable() });
export type ReportMeasure = z.infer<typeof reportMeasureSchema>;

export const reportConfigSchema = z.object({
  columns: z.array(fieldKey).min(1).max(40),
  filters: z.array(reportFilterSchema).max(20).default([]),
  groupBy: fieldKey.nullable().default(null),
  compareBy: fieldKey.nullable().default(null),
  measures: z.array(reportMeasureSchema).min(1).max(6).default([{ kind: "count", field: null }]),
  sort: z.object({ field: fieldKey, dir: z.enum(["asc", "desc"]) }).nullable().default(null),
  includeClosed: z.boolean().default(false),
});
export type ReportConfig = z.infer<typeof reportConfigSchema>;

/** Built-in reports. "expiry" replaces the former Expiry screen. */
export const REPORT_PRESETS: { id: string; name: string; description: string; config: ReportConfig }[] = [
  {
    id: "expiry",
    name: "Delivery windows and expiry",
    description: "Open engagements by how close their delivery window is to ending, with the entitlement at stake. Hours burned are not tracked here: time entries live in Broadcom Clarity.",
    config: { columns: ["customerName", "opportunityNumber", "stage", "deliveryWindowEnd", "daysLeft", "entitlementValue", "expiry"], filters: [], groupBy: "expiry", compareBy: null, measures: [{ kind: "count", field: null }, { kind: "sum", field: "entitlementValue" }], sort: { field: "deliveryWindowEnd", dir: "asc" }, includeClosed: false },
  },
  {
    id: "pipeline",
    name: "Pipeline by stage and segment",
    description: "How many engagements sit in each stage, compared across segments.",
    config: { columns: ["customerName", "opportunityNumber", "segment", "stage", "daysInStage", "entitlementValue"], filters: [], groupBy: "stage", compareBy: "segment", measures: [{ kind: "count", field: null }, { kind: "sum", field: "entitlementValue" }], sort: { field: "daysInStage", dir: "desc" }, includeClosed: false },
  },
  {
    id: "entitlement-segment-region",
    name: "Entitlement by segment and region",
    description: "VSA amounts in flight by segment, compared across regions. Alternative plans count once.",
    config: { columns: ["customerName", "segment", "region", "stage", "entitlementValue", "deliveryWindowEnd"], filters: [], groupBy: "segment", compareBy: "region", measures: [{ kind: "sum", field: "entitlementValue" }, { kind: "count", field: null }], sort: { field: "entitlementValue", dir: "desc" }, includeClosed: false },
  },
  {
    id: "architect-workload",
    name: "Architect workload",
    description: "Open engagements per architect, compared across stages.",
    config: { columns: ["architect", "customerName", "stage", "daysInStage", "deliveryWindowEnd"], filters: [], groupBy: "architect", compareBy: "stage", measures: [{ kind: "count", field: null }, { kind: "avg", field: "daysInStage" }], sort: { field: "architect", dir: "asc" }, includeClosed: false },
  },
  {
    id: "work-plans",
    name: "Work plans awaiting acceptance",
    description: "Broadcom work plans sent to customers and not yet accepted.",
    config: { columns: ["customerName", "segment", "stage", "workPlanSentOn", "fcpCustomerAcceptedOn", "nextSteps"], filters: [{ field: "workPlanSentOn", op: "notEmpty" }, { field: "workPlanAcceptedOn", op: "empty" }], groupBy: null, compareBy: null, measures: [{ kind: "count", field: null }], sort: { field: "workPlanSentOn", dir: "asc" }, includeClosed: false },
  },
  {
    id: "data-quality",
    name: "Data quality",
    description: "Engagements missing a segment, opportunity number, Customer ID, VSA amount, or expiration.",
    config: { columns: ["customerName", "stage", "missingData", "opportunityNumber", "segment", "salesforceCustomerId"], filters: [{ field: "missingData", op: "notEmpty" }], groupBy: "stage", compareBy: null, measures: [{ kind: "count", field: null }], sort: { field: "customerName", dir: "asc" }, includeClosed: true },
  },
];

/** Brand guide 4.10: every exported report carries the proprietary legend. */
export const PROPRIETARY_LEGEND = "CDW \u2014 Proprietary and confidential. Copying restricted.";

const isEmpty = (value: ReportValue) => value === null || value === "" || value === undefined;

/** A value as people read it: enum labels, money with double zeros, dates as YYYY-MM-DD. */
export function displayValue(field: ReportField, value: ReportValue): string {
  if (isEmpty(value)) return "";
  if (field.type === "bool") return value ? "Yes" : "No";
  if (field.type === "money") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number(value));
  if (field.labels && typeof value === "string") return field.labels[value] ?? value;
  return String(value);
}

function matches(filter: ReportFilter, value: ReportValue): boolean {
  switch (filter.op) {
    case "empty":
      return isEmpty(value);
    case "notEmpty":
      return !isEmpty(value);
    case "is":
      return Boolean(value) === filter.value;
    case "in":
      return filter.values.length === 0 || filter.values.includes(isEmpty(value) ? "" : String(value));
    case "contains":
      return !filter.text.trim() || String(value ?? "").toLowerCase().includes(filter.text.trim().toLowerCase());
    case "between": {
      if (isEmpty(value)) return false;
      const numeric = typeof value === "number" || (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value));
      const compare = (bound: string) => (numeric ? Number(value) - Number(bound) : String(value).localeCompare(bound));
      return (filter.from === null || filter.from === "" || compare(filter.from) >= 0) && (filter.to === null || filter.to === "" || compare(filter.to) <= 0);
    }
  }
}

/** Measures one bucket. Sums of VSA amount count each entitlement group once (alternative plans share it). */
export function measure(rows: ReportSource[], m: ReportMeasure, today: string, settings: OperationalSettings = DEFAULT_OPERATIONAL_SETTINGS): number | null {
  if (m.kind === "count") return rows.length;
  const field = m.field ? FIELD_BY_KEY.get(m.field) : undefined;
  if (!field) return null;
  let members = rows;
  if (field.key === "entitlementValue") {
    const seen = new Set<number>();
    members = rows.filter(row => row.entitlementGroupId === null || (!seen.has(row.entitlementGroupId) && Boolean(seen.add(row.entitlementGroupId))));
  }
  const values = members.map(row => field.get(row, today, settings)).filter(value => !isEmpty(value)).map(Number).filter(value => Number.isFinite(value));
  if (!values.length) return null;
  switch (m.kind) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
  }
}

export function measureLabel(m: ReportMeasure) {
  if (m.kind === "count") return "Engagements";
  const field = m.field ? FIELD_BY_KEY.get(m.field) : undefined;
  const name = field?.label ?? "value";
  return { sum: `Total ${name}`, avg: `Average ${name}`, min: `Lowest ${name}`, max: `Highest ${name}` }[m.kind];
}

/** How a measure's result is formatted: money stays money; averages of counts keep one decimal. */
export function formatMeasure(m: ReportMeasure, value: number | null) {
  if (value === null) return "—";
  const field = m.field ? FIELD_BY_KEY.get(m.field) : undefined;
  if (m.kind !== "count" && field?.type === "money") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: m.kind === "avg" ? 1 : 0 }).format(value);
}

export type Bucket = { key: string; label: string; rows: ReportSource[]; values: (number | null)[] };
export type ReportResult = {
  columns: ReportField[];
  rows: ReportSource[];
  table: string[][];
  totals: (number | null)[];
  groups: Bucket[] | null;
  pivot: { compare: ReportField; columns: { key: string; label: string }[]; cells: (number | null)[][]; columnTotals: (number | null)[] } | null;
};

const EMPTY_KEY = "";

function bucketBy(rows: ReportSource[], field: ReportField, today: string, settings: OperationalSettings) {
  const map = new Map<string, ReportSource[]>();
  for (const row of rows) {
    const value = field.get(row, today, settings);
    const key = isEmpty(value) ? EMPTY_KEY : String(value);
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  // Enum dimensions keep their defined order (stages run in pipeline order); others sort by label. "Not set" goes last.
  const order = field.labels ? Object.keys(field.labels) : null;
  return Array.from(map.entries())
    .map(([key, members]) => ({ key, label: key === EMPTY_KEY ? "Not set" : displayValue(field, key), rows: members }))
    .sort((a, b) => (a.key === EMPTY_KEY ? 1 : b.key === EMPTY_KEY ? -1 : order ? order.indexOf(a.key) - order.indexOf(b.key) : a.label.localeCompare(b.label)));
}

export function runReport(source: ReportSource[], config: ReportConfig, today: string, settings: OperationalSettings = DEFAULT_OPERATIONAL_SETTINGS): ReportResult {
  const columns = config.columns.map(key => FIELD_BY_KEY.get(key)).filter((field): field is ReportField => Boolean(field));
  let rows = config.includeClosed ? source : source.filter(row => !isTerminal(row.stage));
  for (const filter of config.filters) {
    const field = FIELD_BY_KEY.get(filter.field);
    if (field) rows = rows.filter(row => matches(filter, field.get(row, today, settings)));
  }
  if (config.sort) {
    const field = FIELD_BY_KEY.get(config.sort.field);
    if (field) {
      const dir = config.sort.dir === "asc" ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const left = field.get(a, today, settings);
        const right = field.get(b, today, settings);
        if (isEmpty(left) && isEmpty(right)) return 0;
        if (isEmpty(left)) return 1; // empty values sort last either way
        if (isEmpty(right)) return -1;
        const numeric = field.type === "number" || field.type === "money";
        return (numeric ? Number(left) - Number(right) : displayValue(field, left).localeCompare(displayValue(field, right))) * dir;
      });
    }
  }
  const table = rows.map(row => columns.map(field => displayValue(field, field.get(row, today, settings))));
  const totals = config.measures.map(m => measure(rows, m, today, settings));

  const groupField = config.groupBy ? FIELD_BY_KEY.get(config.groupBy) : undefined;
  const groups = groupField ? bucketBy(rows, groupField, today, settings).map(bucket => ({ ...bucket, values: config.measures.map(m => measure(bucket.rows, m, today, settings)) })) : null;

  const compareField = config.compareBy && config.compareBy !== config.groupBy ? FIELD_BY_KEY.get(config.compareBy) : undefined;
  let pivot: ReportResult["pivot"] = null;
  if (groups && compareField) {
    const pivotColumns = bucketBy(rows, compareField, today, settings).map(({ key, label: name }) => ({ key, label: name }));
    const first = config.measures[0];
    const cells = groups.map(group => pivotColumns.map(col => {
      const members = group.rows.filter(row => {
        const value = compareField.get(row, today, settings);
        return (isEmpty(value) ? EMPTY_KEY : String(value)) === col.key;
      });
      return members.length ? measure(members, first, today, settings) : null;
    }));
    const columnTotals = pivotColumns.map(col => measure(rows.filter(row => {
      const value = compareField.get(row, today, settings);
      return (isEmpty(value) ? EMPTY_KEY : String(value)) === col.key;
    }), first, today, settings));
    pivot = { compare: compareField, columns: pivotColumns, cells, columnTotals };
  }
  return { columns, rows, table, totals, groups, pivot };
}

/** CSV with a header row and the proprietary legend as the last line. */
export function reportCsv(result: ReportResult, legend: string): string {
  const cell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = [result.columns.map(field => cell(field.label)).join(","), ...result.table.map(row => row.map(cell).join(","))];
  return [...lines, "", cell(legend)].join("\r\n");
}
