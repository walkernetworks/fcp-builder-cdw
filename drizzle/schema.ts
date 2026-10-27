import { sql } from "drizzle-orm";
import { boolean, date, decimal, index, int, json, mediumtext, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar, type AnyMySqlColumn } from "drizzle-orm/mysql-core";
import type { EngagementDocument } from "../shared/fcp";
import {
  ASSIGNMENT_ROLES,
  CONSUMPTION_SOURCES,
  ENTITLEMENT_INTEREST,
  FCP_VERSION_REASONS,
  FCP_VERSION_STATUSES,
  FCP_WAIVER_PARTIES,
  HEALTH,
  INTAKE_SOURCES,
  PROGRAMS,
  RA_STATUSES,
  REGIONS,
  RISK_ASSESSMENTS,
  SEGMENT_SOURCES,
  SOURCE_ITEM_KINDS,
  SOURCE_ITEM_STATUSES,
  STAGE_EVENT_SOURCES,
  VSA_ROLES,
  WAITING_ON,
} from "../shared/vsaFields";
import type { IntakeAnswers } from "../shared/vsaFields";
import type { SegmentReview } from "../shared/fcpRecord";
import type { ScopedEffort } from "../shared/effort";
import type { ChangeSummary } from "../shared/fcpChangeSummary";
import { SEGMENTS, STAGES } from "../shared/vsaStage";
import { STORED_REPORT_FORMATS } from "../shared/reportFormat";
import type { ReportConfig } from "../shared/vsaReports";
import type { AppSettingValue } from "../shared/appSettings";

/** Visibility boundary for engagements. One workspace (id 1) is expected; see docs/VSA-TRACKER-DATA-MODEL.md section 6.1. */
export const workspaces = mysqlTable("workspaces", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Workspace = typeof workspaces.$inferSelect;

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 191 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  workspaceId: int("workspaceId").default(1).notNull().references(() => workspaces.id),
  /** Default role view. Not a permission; `role` stays the only permission flag. */
  vsaRole: mysqlEnum("vsaRole", VSA_ROLES),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  /** The admin who last changed this user's role, role view, or workspace; null for changes made at sign-in. */
  updatedByUserId: int("updatedByUserId").references((): AnyMySqlColumn => users.id, { onDelete: "set null" }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Business dates are calendar days stored as DATE and read as "YYYY-MM-DD" strings. */
const day = (name: string) => date(name, { mode: "string" });
const money = (name: string) => decimal(name, { precision: 14, scale: 2 });

export const engagements = mysqlTable(
  "engagements",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    customerName: varchar("customerName", { length: 240 }).notNull().default("Untitled customer"),
    customerShortName: varchar("customerShortName", { length: 64 }).notNull().default("TBD"),
    status: mysqlEnum("status", ["draft", "ready", "archived"]).default("draft").notNull(),
    data: json("data").$type<EngagementDocument>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),

    // Identity and intake
    workspaceId: int("workspaceId").default(1).notNull().references(() => workspaces.id),
    salesforceCustomerId: varchar("salesforceCustomerId", { length: 32 }),
    salesforceOpportunityId: varchar("salesforceOpportunityId", { length: 32 }),
    opportunityNumber: varchar("opportunityNumber", { length: 32 }),
    serNumber: varchar("serNumber", { length: 32 }),
    intakeSource: mysqlEnum("intakeSource", INTAKE_SOURCES).default("manual").notNull(),
    intakeSubmissionId: varchar("intakeSubmissionId", { length: 64 }),
    sharepointItemId: int("sharepointItemId"),
    importSnapshot: json("importSnapshot").$type<Record<string, unknown>>(),
    lastImportedAt: timestamp("lastImportedAt"),
    intakeAnswers: json("intakeAnswers").$type<IntakeAnswers>(),
    isFundingExtension: boolean("isFundingExtension").default(false).notNull(),
    /** Peer group of alternative plans sharing one entitlement; NULL for a single plan. Hours and the entitlement count once per group. */
    entitlementGroupId: int("entitlementGroupId"),

    // Classification
    segment: mysqlEnum("segment", SEGMENTS),
    /** NULL when a person or the import set the segment; see SEGMENT_SOURCES. */
    segmentSource: mysqlEnum("segmentSource", SEGMENT_SOURCES),
    /** A person's decision on a tracker segment that disagrees with the FCP plan type (shared/fcpRecord.ts segmentWarning). */
    segmentReview: json("segmentReview").$type<SegmentReview>(),
    program: mysqlEnum("program", PROGRAMS),
    region: mysqlEnum("region", REGIONS),
    customerState: varchar("customerState", { length: 64 }),
    entitlementInterest: mysqlEnum("entitlementInterest", ENTITLEMENT_INTEREST),

    // Stage and health
    stage: mysqlEnum("stage", STAGES).default("intake").notNull(),
    stageEnteredOn: day("stageEnteredOn").default(sql`(curdate())`).notNull(),
    waitingOn: mysqlEnum("waitingOn", WAITING_ON),
    health: mysqlEnum("health", HEALTH),
    riskAssessment: mysqlEnum("riskAssessment", RISK_ASSESSMENTS),
    raStatus: mysqlEnum("raStatus", RA_STATUSES),
    vcfAssessment: boolean("vcfAssessment").default(false).notNull(),
    nextSteps: text("nextSteps"),
    statusNotes: text("statusNotes"),

    // Gate dates
    serSubmittedOn: day("serSubmittedOn"),
    serApprovedOn: day("serApprovedOn"),
    fcpDraftCreatedOn: day("fcpDraftCreatedOn"),
    fcpSubmittedOn: day("fcpSubmittedOn"),
    fcpBroadcomAcceptedOn: day("fcpBroadcomAcceptedOn"),
    fcpCustomerAcceptedOn: day("fcpCustomerAcceptedOn"),
    workPlanSentOn: day("workPlanSentOn"),
    workPlanAcceptedOn: day("workPlanAcceptedOn"),
    /** Hours on the accepted work plan, and on the PO / work authorization; compared when the PO came first. */
    workPlanHours: int("workPlanHours"),
    poHours: int("poHours"),
    /** FCP waiver: the PM or Broadcom said FCP approval isn't required. Stands in for the FCP approval gate only. */
    fcpWaiverParty: mysqlEnum("fcpWaiverParty", FCP_WAIVER_PARTIES),
    fcpWaiverBy: varchar("fcpWaiverBy", { length: 120 }),
    fcpWaivedOn: day("fcpWaivedOn"),
    fcpWaiverSource: varchar("fcpWaiverSource", { length: 500 }),
    fcpWaiverRecordedByUserId: int("fcpWaiverRecordedByUserId").references(() => users.id, { onDelete: "set null" }),
    ikomOn: day("ikomOn"),
    raReceivedOn: day("raReceivedOn"),
    workAuthReceivedOn: day("workAuthReceivedOn"),
    poReceivedOn: day("poReceivedOn"),
    ckomOn: day("ckomOn"),
    projectStartOn: day("projectStartOn"),
    estimatedCloseOn: day("estimatedCloseOn"),
    completedOn: day("completedOn"),

    // Commercials and term
    entitlementValue: money("entitlementValue"),
    estimatedDealValue: money("estimatedDealValue"),
    broadcomPo: varchar("broadcomPo", { length: 64 }),
    termStart: day("termStart"),
    termEnd: day("termEnd"),
    deliveryWindowEnd: day("deliveryWindowEnd"),
    coreCount: int("coreCount"),

    // Links, locks, concurrency
    clientFolderUrl: varchar("clientFolderUrl", { length: 1024 }),
    buildLockUserId: int("buildLockUserId").references(() => users.id, { onDelete: "set null" }),
    buildLockAt: timestamp("buildLockAt"),
    rowVersion: int("rowVersion").default(0).notNull(),
    updatedByUserId: int("updatedByUserId").references(() => users.id, { onDelete: "set null" }),
  },
  table => [
    index("engagements_owner_updated_idx").on(table.ownerId, table.updatedAt),
    index("engagements_sf_customer_idx").on(table.salesforceCustomerId),
    uniqueIndex("engagements_sf_opportunity_uq").on(table.salesforceOpportunityId),
    uniqueIndex("engagements_opportunity_number_uq").on(table.opportunityNumber),
    uniqueIndex("engagements_sharepoint_item_uq").on(table.sharepointItemId),
    uniqueIndex("engagements_intake_submission_uq").on(table.intakeSubmissionId),
    index("engagements_workspace_stage_idx").on(table.workspaceId, table.stage, table.stageEnteredOn),
    index("engagements_workspace_expiry_idx").on(table.workspaceId, table.deliveryWindowEnd),
    index("engagements_ser_idx").on(table.serNumber),
    index("engagements_entitlement_group_idx").on(table.entitlementGroupId),
  ],
);

export type Engagement = typeof engagements.$inferSelect;
export type InsertEngagement = typeof engagements.$inferInsert;

/** Append-only. db.ts exposes no update or delete for this table; a correction is a new event. */
export const stageEvents = mysqlTable(
  "stageEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    engagementId: int("engagementId").notNull().references(() => engagements.id, { onDelete: "cascade" }),
    fromStage: mysqlEnum("fromStage", STAGES),
    toStage: mysqlEnum("toStage", STAGES).notNull(),
    effectiveOn: day("effectiveOn").notNull(),
    recordedAt: timestamp("recordedAt").defaultNow().notNull(),
    actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
    source: mysqlEnum("source", STAGE_EVENT_SOURCES).notNull(),
    note: text("note"),
  },
  table => [index("stage_events_engagement_idx").on(table.engagementId, table.effectiveOn, table.id)],
);

export type StageEvent = typeof stageEvents.$inferSelect;

export const sourceChainItems = mysqlTable(
  "sourceChainItems",
  {
    id: int("id").autoincrement().primaryKey(),
    engagementId: int("engagementId").notNull().references(() => engagements.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", SOURCE_ITEM_KINDS).notNull(),
    label: varchar("label", { length: 240 }).notNull(),
    required: boolean("required").default(true).notNull(),
    status: mysqlEnum("status", SOURCE_ITEM_STATUSES).default("needed").notNull(),
    requestedOn: day("requestedOn"),
    receivedOn: day("receivedOn"),
    /** File name or client-folder path. Text only; no file content is stored. */
    reference: varchar("reference", { length: 1024 }),
    note: text("note"),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    updatedByUserId: int("updatedByUserId").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("source_chain_engagement_idx").on(table.engagementId, table.kind)],
);

export type SourceChainItem = typeof sourceChainItems.$inferSelect;

export const engagementAssignments = mysqlTable(
  "engagementAssignments",
  {
    id: int("id").autoincrement().primaryKey(),
    engagementId: int("engagementId").notNull().references(() => engagements.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ASSIGNMENT_ROLES).notNull(),
    /** NULL until the person signs in; linked by email on sign-in. */
    userId: int("userId").references(() => users.id, { onDelete: "set null" }),
    displayName: varchar("displayName", { length: 240 }).notNull(),
    email: varchar("email", { length: 320 }),
    broadcomEmail: varchar("broadcomEmail", { length: 320 }),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("assignments_engagement_role_uq").on(table.engagementId, table.role),
    index("assignments_user_role_idx").on(table.userId, table.role),
  ],
);

export type EngagementAssignment = typeof engagementAssignments.$inferSelect;

/** Report definitions saved from the Reports screen. Visible to the workspace; editable by the owner or an admin. */
export const savedReports = mysqlTable(
  "savedReports",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspaceId").default(1).notNull().references(() => workspaces.id),
    ownerId: int("ownerId").notNull().references(() => users.id),
    name: varchar("name", { length: 120 }).notNull(),
    config: json("config").$type<ReportConfig>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("saved_reports_workspace_idx").on(table.workspaceId, table.name)],
);

export type SavedReport = typeof savedReports.$inferSelect;

/** Snapshots of an engagement's FCP document. Made on request, when the FCP leaves FCP Draft, and on export. */
export const fcpVersions = mysqlTable(
  "fcpVersions",
  {
    id: int("id").autoincrement().primaryKey(),
    engagementId: int("engagementId").notNull().references(() => engagements.id, { onDelete: "cascade" }),
    versionNumber: int("versionNumber").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    data: json("data").$type<EngagementDocument>().notNull(),
    /** SHA-256 of the document JSON, so an unchanged FCP is not saved twice. */
    dataHash: varchar("dataHash", { length: 64 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    reason: mysqlEnum("reason", FCP_VERSION_REASONS).notNull(),
    createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    // Issued versions (docs/FCP-WORKSPACE.md section 13). Null on every History save.
    /** 1, 2, 3 per engagement, for issued versions only; the save counter above is never shown as a version. */
    issueNumber: int("issueNumber"),
    status: mysqlEnum("status", FCP_VERSION_STATUSES),
    /** The issued version this one revises. */
    basedOnVersionId: int("basedOnVersionId").references((): AnyMySqlColumn => fcpVersions.id, { onDelete: "set null" }),
    effortSnapshot: json("effortSnapshot").$type<ScopedEffort>(),
    /** The Condensed FCP exactly as issued; downloads of the version return it unchanged. */
    renderedHtml: mediumtext("renderedHtml"),
    /** SHA-256 of renderedHtml. */
    renderHash: varchar("renderHash", { length: 64 }),
    revisionNote: text("revisionNote"),
    changeSummary: json("changeSummary").$type<ChangeSummary>(),
    issuedAt: timestamp("issuedAt"),
    issuedByUserId: int("issuedByUserId").references(() => users.id, { onDelete: "set null" }),
    broadcomApprovedOn: day("broadcomApprovedOn"),
    /** Who recorded the approval in the app. */
    broadcomApprovedByUserId: int("broadcomApprovedByUserId").references(() => users.id, { onDelete: "set null" }),
    /** Who approved it at Broadcom, as given by the person recording it. */
    broadcomApproverName: varchar("broadcomApproverName", { length: 160 }),
    broadcomApprovalNote: text("broadcomApprovalNote"),
    customerApprovedOn: day("customerApprovedOn"),
    /** Who recorded the approval in the app. */
    customerApprovedByUserId: int("customerApprovedByUserId").references(() => users.id, { onDelete: "set null" }),
    /** Who approved it at the customer, as given by the person recording it. */
    customerApproverName: varchar("customerApproverName", { length: 160 }),
    customerApprovalNote: text("customerApprovalNote"),
    /** The format the customer received (docs/fcp-formats/); null when it was issued as the long report. */
    reportFormat: mysqlEnum("reportFormat", STORED_REPORT_FORMATS),
    /** Why it was issued although its hours do not reconcile with the funding; null when they did. */
    fundingOverrideNote: text("fundingOverrideNote"),
  },
  table => [uniqueIndex("fcp_versions_number_uq").on(table.engagementId, table.versionNumber), uniqueIndex("fcp_versions_issue_uq").on(table.engagementId, table.issueNumber)],
);

/**
 * Hours consumed against the entitlement, as of a date: the burndown's history. Append-only; a correction is a new
 * entry. Entered by hand today; `source` and `externalId` let a future Salesforce read upsert its own rows without
 * touching manual ones (docs/FCP-WORKSPACE.md section 13.1).
 */
export const fcpConsumptionEntries = mysqlTable(
  "fcpConsumptionEntries",
  {
    id: int("id").autoincrement().primaryKey(),
    engagementId: int("engagementId").notNull().references(() => engagements.id, { onDelete: "cascade" }),
    asOf: day("asOf").notNull(),
    consumedHours: decimal("consumedHours", { precision: 10, scale: 2, mode: "number" }).notNull(),
    source: mysqlEnum("source", CONSUMPTION_SOURCES).notNull().default("manual"),
    externalId: varchar("externalId", { length: 128 }),
    note: text("note"),
    enteredByUserId: int("enteredByUserId").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("fcp_consumption_engagement_idx").on(table.engagementId, table.asOf, table.id), uniqueIndex("fcp_consumption_external_uq").on(table.engagementId, table.source, table.externalId)],
);

export type FcpConsumptionEntry = typeof fcpConsumptionEntries.$inferSelect;

export type FcpVersion = typeof fcpVersions.$inferSelect;

/**
 * Operational settings an admin edits in the app: one row per key in shared/appSettings.ts SETTING_DEFINITIONS. A
 * missing row means the code default applies. No customer data.
 */
export const appSettings = mysqlTable("app_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: json("value").$type<AppSettingValue>().notNull(),
  updatedByUserId: int("updatedByUserId").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
