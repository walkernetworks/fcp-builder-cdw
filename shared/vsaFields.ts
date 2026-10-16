import { z } from "zod";
import type { Engagement } from "../drizzle/schema";
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

/** Tracker fields a user may edit directly. Stage moves go through the transition procedure; import, intake, and lock fields are not editable. */
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
