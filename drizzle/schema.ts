import { sql } from "drizzle-orm";
import { boolean, date, decimal, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import type { EngagementDocument } from "../shared/fcp";
import {
  ASSIGNMENT_ROLES,
  ENTITLEMENT_INTEREST,
  HEALTH,
  INTAKE_SOURCES,
  PROGRAMS,
  RA_STATUSES,
  REGIONS,
  RISK_ASSESSMENTS,
  SOURCE_ITEM_KINDS,
  SOURCE_ITEM_STATUSES,
  STAGE_EVENT_SOURCES,
  VSA_ROLES,
  WAITING_ON,
} from "../shared/vsaFields";
import type { IntakeAnswers } from "../shared/vsaFields";
import { SEGMENTS, STAGES } from "../shared/vsaStage";

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
