import { z } from "zod";
import type { Engagement, FcpConsumptionEntry, FcpVersion } from "../drizzle/schema";
import { SEGMENTS } from "./vsaStage";

/** Enum values for the VSA tracker columns. docs/VSA-TRACKER-DATA-MODEL.md sections 3 to 6. */
export const PROGRAMS = ["entitlement", "extended_expert", "bsas", "cash_sow", "government_entitlement", "government_bsas"] as const;
export const REGIONS = ["west", "east"] as const;
export const ENTITLEMENT_INTEREST = ["interested", "not_interested", "pending"] as const;
export const WAITING_ON = ["sales", "customer", "broadcom", "cdw_internal"] as const;
export const HEALTH = ["green", "yellow", "red"] as const;
export const RISK_ASSESSMENTS = ["not_submitted", "submitted", "standard_terms_acknowledged", "not_applicable"] as const;
export const RA_STATUSES = ["not_needed", "not_started", "waiting_from_broadcom", "sent_to_broadcom", "resources_onboarding", "in_flight", "delivery_complete", "cancelled"] as const;
export const INTAKE_SOURCES = ["manual", "sharepoint_import", "intake_import"] as const;
export const STAGE_EVENT_SOURCES = ["manual", "import", "system"] as const;
export const SOURCE_ITEM_KINDS = ["rvtools", "discovery_notes", "customer_brief", "hardware_review", "hours_source", "broadcom_ser", "other"] as const;
export const SOURCE_ITEM_STATUSES = ["needed", "requested", "received", "verified", "waived"] as const;
export const ASSIGNMENT_ROLES = ["sales_rep", "account_manager", "presales", "architect", "pm", "sr_consultant", "broadcom_ad"] as const;
export const VSA_ROLES = ["sales", "architect", "presales", "pm", "leadership"] as const;
/** Who said FCP approval isn't needed. */
/**
 * Where a tracker segment came from, when not from a person or the Pipeline import. "inferred_from_fcp": filled by
 * migration 0009 from the FCP's old segment field, which had no Strategic value, so it needs a person's review.
 * NULL: set by a person or the import (confirmed). Any later segment edit clears it.
 */
export const SEGMENT_SOURCES = ["inferred_from_fcp"] as const;
/** Why an FCP copy was kept in History. "decision": a person resolved a tracker segment mismatch. */
export const FCP_VERSION_REASONS = ["manual", "submitted", "export", "restore", "decision", "issued"] as const;
/** An issued FCP version, then superseded when the next one is issued. A History save has no status. */
export const FCP_VERSION_STATUSES = ["issued", "superseded"] as const;
/** Where a consumption entry came from: entered by hand, or (reserved) read from Salesforce. */
export const CONSUMPTION_SOURCES = ["manual", "salesforce"] as const;
export const FCP_WAIVER_PARTIES = ["pm", "broadcom"] as const;

export type Program = (typeof PROGRAMS)[number];
export type AssignmentRole = (typeof ASSIGNMENT_ROLES)[number];
export type SourceItemKind = (typeof SOURCE_ITEM_KINDS)[number];
export type SourceItemStatus = (typeof SOURCE_ITEM_STATUSES)[number];

/** Opportunity numbers are CDW's internal Salesforce opportunity number. AWC-OPP- placeholders are not valid. */
export const OPPORTUNITY_NUMBER_PATTERN = /^C-OPP-\d{6,8}$/;

/** Intake form answers kept as read-only context; tracked values go to columns instead. */
export const intakeAnswersSchema = z.object({
  industryCodes: z.string().max(500).optional(),
  engagementScope: z.string().max(5000).optional(),
  contractYears: z.number().min(0).max(10).optional(),
  priorSalesOrServices: z.string().max(2000).optional(),
  holdsMsa: z.string().max(200).optional(),
  servicesProvidedSoFar: z.string().max(5000).optional(),
  evaluationNotes: z.string().max(5000).optional(),
});
export type IntakeAnswers = z.infer<typeof intakeAnswersSchema>;

/**
 * Structural tag for every engagements column: "customer" may appear in documents that go to the customer, "internal" never does.
 * `satisfies` makes `pnpm check` fail when a column is added without a tag.
 */
export const ENGAGEMENT_COLUMN_VISIBILITY = {
  id: "internal",
  ownerId: "internal",
  title: "customer",
  customerName: "customer",
  customerShortName: "customer",
  status: "internal",
  data: "customer",
  createdAt: "internal",
  updatedAt: "internal",
  workspaceId: "internal",
  salesforceCustomerId: "internal",
  salesforceOpportunityId: "internal",
  opportunityNumber: "internal",
  serNumber: "internal",
  intakeSource: "internal",
  intakeSubmissionId: "internal",
  sharepointItemId: "internal",
  importSnapshot: "internal",
  lastImportedAt: "internal",
  intakeAnswers: "internal",
  isFundingExtension: "internal",
  entitlementGroupId: "internal",
  segment: "internal",
  segmentSource: "internal",
  segmentReview: "internal",
  program: "internal",
  region: "internal",
  customerState: "internal",
  entitlementInterest: "internal",
  stage: "internal",
  stageEnteredOn: "internal",
  waitingOn: "internal",
  health: "internal",
  riskAssessment: "internal",
  raStatus: "internal",
  vcfAssessment: "internal",
  nextSteps: "internal",
  statusNotes: "internal",
  serSubmittedOn: "internal",
  serApprovedOn: "internal",
  fcpDraftCreatedOn: "internal",
  fcpSubmittedOn: "internal",
  fcpBroadcomAcceptedOn: "internal",
  fcpCustomerAcceptedOn: "customer",
  workPlanSentOn: "internal",
  workPlanAcceptedOn: "internal",
  workPlanHours: "internal",
  poHours: "internal",
  fcpWaiverParty: "internal",
  fcpWaiverBy: "internal",
  fcpWaivedOn: "internal",
  fcpWaiverSource: "internal",
  fcpWaiverRecordedByUserId: "internal",
  ikomOn: "internal",
  raReceivedOn: "internal",
  workAuthReceivedOn: "internal",
  poReceivedOn: "internal",
  ckomOn: "customer",
  projectStartOn: "customer",
  estimatedCloseOn: "internal",
  completedOn: "internal",
  entitlementValue: "customer",
  estimatedDealValue: "internal",
  broadcomPo: "internal",
  termStart: "customer",
  termEnd: "customer",
  deliveryWindowEnd: "customer",
  coreCount: "customer",
  clientFolderUrl: "internal",
  buildLockUserId: "internal",
  buildLockAt: "internal",
  rowVersion: "internal",
  updatedByUserId: "internal",
} as const satisfies Record<keyof Engagement, "customer" | "internal">;

/**
 * The same tags for FCP versions and consumption entries. Only what the customer received is customer-facing: the
 * issued HTML, its revision note, and the hours consumed as of a date that the burndown prints. Everything else,
 * History saves included, is internal.
 */
export const FCP_VERSION_COLUMN_VISIBILITY = {
  id: "internal",
  engagementId: "internal",
  versionNumber: "internal",
  title: "internal",
  data: "internal",
  dataHash: "internal",
  label: "internal",
  reason: "internal",
  createdByUserId: "internal",
  createdAt: "internal",
  issueNumber: "internal",
  status: "internal",
  basedOnVersionId: "internal",
  effortSnapshot: "internal",
  renderedHtml: "customer",
  renderHash: "internal",
  revisionNote: "customer",
  changeSummary: "internal",
  issuedAt: "internal",
  issuedByUserId: "internal",
  broadcomApprovedOn: "internal",
  broadcomApprovedByUserId: "internal",
  broadcomApproverName: "internal",
  broadcomApprovalNote: "internal",
  customerApprovedOn: "internal",
  customerApprovedByUserId: "internal",
  customerApproverName: "internal",
  customerApprovalNote: "internal",
  reportFormat: "internal",
  fundingOverrideNote: "internal",
} as const satisfies Record<keyof FcpVersion, "customer" | "internal">;

export const CONSUMPTION_ENTRY_COLUMN_VISIBILITY = {
  id: "internal",
  engagementId: "internal",
  // The latest entry reaches the burndown the customer sees.
  asOf: "customer",
  consumedHours: "customer",
  source: "internal",
  externalId: "internal",
  note: "internal",
  enteredByUserId: "internal",
  createdAt: "internal",
} as const satisfies Record<keyof FcpConsumptionEntry, "customer" | "internal">;

type CustomerColumn = { [K in keyof typeof ENGAGEMENT_COLUMN_VISIBILITY]: (typeof ENGAGEMENT_COLUMN_VISIBILITY)[K] extends "customer" ? K : never }[keyof typeof ENGAGEMENT_COLUMN_VISIBILITY];

/** The only way a renderer for a customer document may read tracker columns. */
export function customerFacingColumns(row: Engagement): Pick<Engagement, CustomerColumn> {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => ENGAGEMENT_COLUMN_VISIBILITY[key as keyof Engagement] === "customer"),
  ) as Pick<Engagement, CustomerColumn>;
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Not a valid date");
const optionalDay = isoDay.nullable().optional();
const optionalText = (max: number) => z.string().trim().max(max).transform(value => value || null).nullable().optional();
/** Dollar amounts travel as strings ("123456.78") so DECIMAL values never pass through a float. */
const optionalMoney = z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "Use a dollar amount like 125000.00").nullable().optional();

const optionalHours = z.number().int("Use whole hours").min(0).max(1_000_000).nullable().optional();

/**
 * An FCP waiver: the PM or Broadcom said FCP approval isn't required. It satisfies the FCP approval gate for delivery,
 * never the work plan or the PO. Saved through its own procedure, which records who entered it.
 */
export const fcpWaiverSchema = z
  .object({
    party: z.enum(FCP_WAIVER_PARTIES),
    by: z.string().trim().min(1, "Say who said it").max(120),
    on: isoDay,
    source: z.string().trim().min(1, "Say where it was said").max(500),
  })
  .strict();
export type FcpWaiver = z.infer<typeof fcpWaiverSchema>;

/** Tracker fields a user may edit directly. Stage moves go through the transition procedure; import, intake, and lock fields are not editable. */
/**
 * The gate dates, in the order the record's Stage & gates timeline shows them, with their default display labels.
 * Admins can rename the labels (shared/appSettings.ts); which gates apply to which segment stays in code (vsaStage.ts).
 */
export const GATE_DATES = [
  { key: "serSubmittedOn", label: "SER submitted" },
  { key: "serApprovedOn", label: "Broadcom partner approval" },
  { key: "fcpDraftCreatedOn", label: "FCP draft created" },
  { key: "fcpSubmittedOn", label: "FCP submitted" },
  { key: "fcpBroadcomAcceptedOn", label: "FCP Broadcom acceptance", hint: "Corporate and Strategic; required for delivery" },
  { key: "fcpCustomerAcceptedOn", label: "FCP customer acceptance", hint: "Required for delivery on Commercial" },
  { key: "workPlanSentOn", label: "Work plan sent", hint: "To the AD or customer, pending acknowledgment" },
  { key: "workPlanAcceptedOn", label: "Work plan accepted", hint: "Required for Kickoff and In Delivery" },
  { key: "ikomOn", label: "Internal kickoff (IKOM)" },
  { key: "raReceivedOn", label: "RA received" },
  { key: "workAuthReceivedOn", label: "Work authorization received" },
  { key: "poReceivedOn", label: "PO received", hint: "Required for Kickoff and In Delivery" },
  { key: "ckomOn", label: "Customer kickoff (CKOM)" },
  { key: "projectStartOn", label: "Project start" },
  { key: "estimatedCloseOn", label: "Estimated close" },
  { key: "completedOn", label: "Completed" },
] as const satisfies readonly { key: string; label: string; hint?: string }[];
export type GateKey = (typeof GATE_DATES)[number]["key"];

export const trackerPatchSchema = z
  .object({
    customerName: z.string().trim().min(1).max(240),
    salesforceCustomerId: optionalText(32),
    salesforceOpportunityId: optionalText(32),
    opportunityNumber: z.string().trim().toUpperCase().regex(OPPORTUNITY_NUMBER_PATTERN, "Use a C-OPP- number").nullable().optional(),
    serNumber: optionalText(32),
    segment: z.enum(SEGMENTS).nullable(),
    program: z.enum(PROGRAMS).nullable(),
    region: z.enum(REGIONS).nullable(),
    customerState: optionalText(64),
    entitlementInterest: z.enum(ENTITLEMENT_INTEREST).nullable(),
    waitingOn: z.enum(WAITING_ON).nullable(),
    health: z.enum(HEALTH).nullable(),
    riskAssessment: z.enum(RISK_ASSESSMENTS).nullable(),
    raStatus: z.enum(RA_STATUSES).nullable(),
    vcfAssessment: z.boolean(),
    nextSteps: optionalText(10_000),
    statusNotes: optionalText(10_000),
    serSubmittedOn: optionalDay,
    serApprovedOn: optionalDay,
    fcpDraftCreatedOn: optionalDay,
    fcpSubmittedOn: optionalDay,
    fcpBroadcomAcceptedOn: optionalDay,
    fcpCustomerAcceptedOn: optionalDay,
    workPlanSentOn: optionalDay,
    workPlanAcceptedOn: optionalDay,
    workPlanHours: optionalHours,
    poHours: optionalHours,
    ikomOn: optionalDay,
    raReceivedOn: optionalDay,
    workAuthReceivedOn: optionalDay,
    poReceivedOn: optionalDay,
    ckomOn: optionalDay,
    projectStartOn: optionalDay,
    estimatedCloseOn: optionalDay,
    completedOn: optionalDay,
    entitlementValue: optionalMoney,
    estimatedDealValue: optionalMoney,
    broadcomPo: optionalText(64),
    termStart: optionalDay,
    termEnd: optionalDay,
    deliveryWindowEnd: optionalDay,
    coreCount: z.number().int().min(0).max(10_000_000).nullable(),
    clientFolderUrl: z.string().trim().max(1024).url().refine(value => value.startsWith("https://"), "Use an https:// link").nullable().optional(),
  })
  .partial()
  .strict();
export type TrackerPatch = z.infer<typeof trackerPatchSchema>;
