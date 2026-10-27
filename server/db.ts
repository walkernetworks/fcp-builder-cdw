import { createHash } from "node:crypto";
import { and, asc, desc, eq, getTableColumns, inArray, isNotNull, isNull, max, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createDefaultDocument, EngagementDocument } from "../shared/fcp";
import { renameInTitle, resolveFcpSaveNames } from "../shared/customerName";
import { buildLockState, segmentDecisionLabel, segmentDisagrees, sourceUpdatesFromDocument, storedCommercialPlan, type SegmentChoice, type SegmentReview } from "../shared/fcpRecord";
import { IMPORT_FIELDS, IMPORT_ROLES, planMappedRows, type ExistingRecord, type ImportPlan, type ImportRole } from "../shared/sharepointImport";
import type { PipelineBatch } from "./pipelineSource";
import type { AssignmentRole, FcpWaiver, SourceItemKind, SourceItemStatus, TrackerPatch } from "../shared/vsaFields";
import { canTransition, DEFAULT_SOURCE_CHAIN, effectiveDateProblem, STAGE_LABELS, stageOrder, type Stage, type StageRecord } from "../shared/vsaStage";
import { alias } from "drizzle-orm/mysql-core";
import { applySettingChanges, resolveOperationalSettings, type AppSettingValue, type ResolvedSettings } from "../shared/appSettings";
import {
  appSettings,
  engagementAssignments,
  engagements,
  fcpConsumptionEntries,
  fcpVersions,
  type FcpVersion,
  savedReports,
  InsertEngagement,
  InsertUser,
  sourceChainItems,
  stageEvents,
  User,
  users,
  workspaces,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { deletableEngagements, editableReports, visibleEngagements, visibleReports, type Viewer } from "./visibility";
import type { ReportConfig } from "../shared/vsaReports";
import type { ScopedEffort } from "../shared/effort";
import type { ChangeSummary } from "../shared/fcpChangeSummary";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

type Db = Awaited<ReturnType<typeof requireDb>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isDuplicateKey(error: unknown) {
  const cause = (error as { cause?: { errno?: number } })?.cause ?? (error as { errno?: number });
  return cause?.errno === 1062;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = {
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    role: user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user"),
    lastSignedIn: user.lastSignedIn ?? new Date(),
  };
  const result = await db.insert(users).values(values).onDuplicateKeyUpdate({
    set: {
      name: values.name,
      email: values.email,
      loginMethod: values.loginMethod,
      lastSignedIn: values.lastSignedIn,
      // updatedAt and updatedByUserId record admin changes; a sign-in is recorded in lastSignedIn.
      updatedAt: sql`${users.updatedAt}`,
    },
  });
  // affectedRows is 1 only for a new row: link assignments that were made for this person before they first signed in.
  if (result[0].affectedRows === 1 && values.email) {
    const created = await getUserByOpenId(values.openId);
    if (created) await linkAssignmentsToUser(created);
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

/** The signed-in user's default role view. Not a permission. */
export async function setUserVsaRole(userId: number, vsaRole: User["vsaRole"]) {
  const db = await requireDb();
  await db.update(users).set({ vsaRole }).where(eq(users.id, userId));
}

/** Links unlinked assignments in the user's workspace whose CDW email matches the user's. */
export async function linkAssignmentsToUser(user: User) {
  if (!user.email) return;
  const db = await requireDb();
  const visibleIds = db.select({ id: engagements.id }).from(engagements).where(visibleEngagements(user));
  await db
    .update(engagementAssignments)
    .set({ userId: user.id })
    .where(and(isNull(engagementAssignments.userId), eq(engagementAssignments.email, user.email), inArray(engagementAssignments.engagementId, visibleIds)));
}

/**
 * How many visible records have a tracker segment that disagrees with the FCP's plan type. A count for the admin
 * status line only: it reads the two plan-input values, never the rest of the document, and changes nothing.
 */
export async function countSegmentMismatches(viewer: Viewer): Promise<number> {
  const db = await requireDb();
  const rows = await db
    .select({
      segment: engagements.segment,
      commercialPlan: sql<unknown>`JSON_EXTRACT(${engagements.data}, '$.fields.commercialPlan')`,
      customerSegment: sql<unknown>`JSON_UNQUOTE(JSON_EXTRACT(${engagements.data}, '$.fields.customerSegment'))`,
    })
    .from(engagements)
    .where(visibleEngagements(viewer));
  return rows.filter(row => segmentDisagrees(row.segment, storedCommercialPlan(jsonBoolean(row.commercialPlan), row.customerSegment))).length;
}

/** How many visible records have a tracker segment migration 0009 inferred from the FCP and no person has confirmed since. */
export async function countInferredSegments(viewer: Viewer): Promise<number> {
  const db = await requireDb();
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(engagements)
    .where(and(visibleEngagements(viewer), eq(engagements.segmentSource, "inferred_from_fcp")));
  return Number(row?.count ?? 0);
}

/** mysql2 returns a JSON_EXTRACT boolean as true/false, 1/0 or the text "true"/"false" depending on the driver path. */
function jsonBoolean(value: unknown): unknown {
  if (value === "true" || value === 1) return true;
  if (value === "false" || value === 0) return false;
  return value;
}

// ---------------------------------------------------------------------------------------------------------------------
// FCP engagement document (existing procedures)

export async function listEngagements(viewer: Viewer) {
  const db = await requireDb();
  return db
    .select({
      id: engagements.id,
      title: engagements.title,
      customerName: engagements.customerName,
      customerShortName: engagements.customerShortName,
      status: engagements.status,
      stage: engagements.stage,
      createdAt: engagements.createdAt,
      updatedAt: engagements.updatedAt,
    })
    .from(engagements)
    .where(visibleEngagements(viewer))
    .orderBy(desc(engagements.updatedAt));
}

export async function getEngagement(viewer: Viewer, id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(engagements)
    .where(and(visibleEngagements(viewer), eq(engagements.id, id)))
    .limit(1);
  return rows[0];
}

/**
 * Creates the record with its first stage event and the default source chain, in one transaction.
 * Records started from the FCP workspace begin in FCP Draft; tracker records begin in Intake.
 */
export async function createEngagement(viewer: Viewer, title: string, data: EngagementDocument, options: { stage?: Stage } = {}) {
  const db = await requireDb();
  const stage = options.stage ?? "intake";
  const enteredOn = today();
  const values: InsertEngagement = {
    ownerId: viewer.id,
    workspaceId: viewer.workspaceId,
    title,
    customerName: data.fields.customerName || "Untitled customer",
    customerShortName: data.fields.accountId || "TBD",
    data,
    stage,
    stageEnteredOn: enteredOn,
    updatedByUserId: viewer.id,
  };
  const id = await db.transaction(async tx => {
    const result = await tx.insert(engagements).values(values);
    const engagementId = Number(result[0].insertId);
    await tx.insert(stageEvents).values({ engagementId, fromStage: null, toStage: stage, effectiveOn: enteredOn, actorUserId: viewer.id, source: "manual" });
    await tx.insert(sourceChainItems).values(DEFAULT_SOURCE_CHAIN.map(item => ({ ...item, engagementId, createdByUserId: viewer.id })));
    return engagementId;
  });
  return getEngagement(viewer, id);
}

/**
 * FCP saves stay last-write-wins for the document and do not bump `rowVersion`. The customer name and title are shared
 * with the tracker (shared/customerName.ts): a rename made in the FCP renames the record, and a stale FCP copy cannot
 * revert a rename made in the tracker or by the import.
 */
export async function updateEngagement(viewer: Viewer, id: number, title: string, data: EngagementDocument, base: { customerName?: string | null; title?: string | null } = {}) {
  const db = await requireDb();
  const [current] = await db
    .select({ customerName: engagements.customerName, title: engagements.title, storedDocName: sql<string | null>`JSON_UNQUOTE(JSON_EXTRACT(${engagements.data}, '$.fields.customerName'))`, buildLockUserId: engagements.buildLockUserId, buildLockAt: engagements.buildLockAt })
    .from(engagements)
    .where(and(visibleEngagements(viewer), eq(engagements.id, id)))
    .limit(1);
  if (!current) return undefined;
  // One editor at a time: a save from someone who does not hold a live build lock is refused.
  if (buildLockState({ userId: current.buildLockUserId, at: current.buildLockAt }, viewer.id, Date.now()) === "other") throw new BuildLockedError(await lockHolderName(current.buildLockUserId));
  const names = resolveFcpSaveNames({ incomingName: data.fields.customerName ?? "", incomingTitle: title, baseName: base.customerName, baseTitle: base.title, storedDocName: current.storedDocName, storedTitle: current.title, column: current.customerName });
  const document = names.docName === data.fields.customerName ? data : { ...data, fields: { ...data.fields, customerName: names.docName } };
  await db
    .update(engagements)
    .set({
      title: names.title.slice(0, 240) || title,
      customerName: names.column || "Untitled customer",
      customerShortName: data.fields.accountId || "TBD",
      data: document,
      status: data.fields.customerName && data.fields.entitlementEnd && data.inventory.hosts > 0 ? "ready" : "draft",
      updatedByUserId: viewer.id,
      // Saving renews (or takes, when free) the build lock.
      buildLockUserId: viewer.id,
      buildLockAt: new Date(),
    })
    .where(and(visibleEngagements(viewer), eq(engagements.id, id)));
  await applySourceEvidence(db, viewer, id, document);
  return getEngagement(viewer, id);
}

/** Ticks off checklist items the saved FCP evidences (RVTools imported, brief imported, signed hours entered). */
async function applySourceEvidence(db: Db, viewer: Viewer, engagementId: number, document: EngagementDocument) {
  if (!(await requireVisibleEngagement(db, viewer, engagementId))) return;
  const items = await db.select({ id: sourceChainItems.id, kind: sourceChainItems.kind, status: sourceChainItems.status, reference: sourceChainItems.reference }).from(sourceChainItems).where(eq(sourceChainItems.engagementId, engagementId));
  for (const update of sourceUpdatesFromDocument(document, items, today())) {
    await db
      .update(sourceChainItems)
      .set({ status: update.status, receivedOn: update.receivedOn, reference: update.reference, note: update.note, updatedByUserId: viewer.id })
      .where(and(eq(sourceChainItems.id, update.id), eq(sourceChainItems.engagementId, engagementId), inArray(sourceChainItems.status, ["needed", "requested"])));
  }
}

export class BuildLockedError extends Error {
  constructor(readonly holder: string) {
    super(`${holder} is editing this FCP. Your change was not saved. Take over editing or wait until they finish.`);
  }
}

async function lockHolderName(userId: number | null) {
  if (userId === null) return "Someone";
  const holder = await getUserById(userId);
  return holder?.name || holder?.email || "Someone";
}

export type BuildLockResult = { held: boolean; holder: string | null; since: Date | null };

/** Takes or renews the build lock. `takeOver` takes it from another live holder. */
export async function acquireBuildLock(viewer: Viewer, id: number, takeOver = false): Promise<BuildLockResult | undefined> {
  const db = await requireDb();
  return db.transaction(async tx => {
    const row = await requireVisibleEngagement(tx, viewer, id, true);
    if (!row) return undefined;
    const state = buildLockState({ userId: row.buildLockUserId, at: row.buildLockAt }, viewer.id, Date.now());
    if (state === "other" && !takeOver) return { held: false, holder: await lockHolderName(row.buildLockUserId), since: row.buildLockAt };
    const now = new Date();
    await tx.update(engagements).set({ buildLockUserId: viewer.id, buildLockAt: now, updatedAt: sql`${engagements.updatedAt}` }).where(and(visibleEngagements(viewer), eq(engagements.id, id)));
    return { held: true, holder: null, since: now };
  });
}

export async function releaseBuildLock(viewer: Viewer, id: number) {
  const db = await requireDb();
  await db
    .update(engagements)
    .set({ buildLockUserId: null, buildLockAt: null, updatedAt: sql`${engagements.updatedAt}` })
    .where(and(visibleEngagements(viewer), eq(engagements.id, id), eq(engagements.buildLockUserId, viewer.id)));
}

/**
 * Deletes the record and, by cascade, everything that hangs off it: History, issued versions, consumption, stage
 * history, sources and assignments. Owner or admin only. Issued versions point at the issue they revised, so those
 * links are cleared first in the same transaction and the cascade never meets a row another row still references.
 */
export async function deleteEngagement(viewer: Viewer, id: number) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [row] = await tx.select({ id: engagements.id }).from(engagements).where(and(deletableEngagements(viewer), eq(engagements.id, id))).limit(1).for("update");
    if (!row) return false;
    await tx.update(fcpVersions).set({ basedOnVersionId: null }).where(eq(fcpVersions.engagementId, row.id));
    const result = await tx.delete(engagements).where(and(deletableEngagements(viewer), eq(engagements.id, row.id)));
    return result[0].affectedRows > 0;
  });
}

/** Copies the FCP document only. Tracker fields, identifiers, and history stay with the original. */
export async function duplicateEngagement(viewer: Viewer, id: number) {
  const source = await getEngagement(viewer, id);
  if (!source) return undefined;
  const copy = structuredClone(source.data);
  return createEngagement(viewer, `${source.title} — Copy`, copy, { stage: "fcp_draft" });
}

// ---------------------------------------------------------------------------------------------------------------------
// VSA tracker

const { data: _data, importSnapshot: _importSnapshot, ...trackerColumns } = getTableColumns(engagements);

export type TrackerFilter = { stages?: Stage[]; assignedUserId?: number; assignedRole?: AssignmentRole };

/** Tracker rows without the FCP document or the import snapshot. */
export async function listTracker(viewer: Viewer, filter: TrackerFilter = {}) {
  const db = await requireDb();
  const conditions = [visibleEngagements(viewer)];
  if (filter.stages?.length) conditions.push(inArray(engagements.stage, filter.stages));
  if (filter.assignedUserId !== undefined) {
    const assigned = db
      .select({ id: engagementAssignments.engagementId })
      .from(engagementAssignments)
      .where(and(eq(engagementAssignments.userId, filter.assignedUserId), filter.assignedRole ? eq(engagementAssignments.role, filter.assignedRole) : undefined));
    conditions.push(inArray(engagements.id, assigned));
  }
  const rows = await db
    .select(trackerColumns)
    .from(engagements)
    .where(and(...conditions))
    .orderBy(asc(engagements.stageEnteredOn), asc(engagements.id));
  const ids = rows.map(row => row.id);
  // The source checklist rides along so FCP Draft readiness can show on the board and in reports.
  const sources = ids.length
    ? await db.select({ engagementId: sourceChainItems.engagementId, kind: sourceChainItems.kind, label: sourceChainItems.label, required: sourceChainItems.required, status: sourceChainItems.status }).from(sourceChainItems).where(inArray(sourceChainItems.engagementId, ids))
    : [];
  const assignments = ids.length
    ? await db
        .select({ engagementId: engagementAssignments.engagementId, role: engagementAssignments.role, userId: engagementAssignments.userId, displayName: engagementAssignments.displayName })
        .from(engagementAssignments)
        .where(inArray(engagementAssignments.engagementId, ids))
    : [];
  return rows.map(row => ({ ...row, assignments: assignments.filter(assignment => assignment.engagementId === row.id), sourceItems: sources.filter(source => source.engagementId === row.id) }));
}

async function requireVisibleEngagement(tx: Db | Tx, viewer: Viewer, id: number, lock = false) {
  const query = tx.select(trackerColumns).from(engagements).where(and(visibleEngagements(viewer), eq(engagements.id, id))).limit(1);
  const rows = lock ? await query.for("update") : await query;
  return rows[0];
}

export async function getTrackerRecord(viewer: Viewer, id: number) {
  const db = await requireDb();
  const record = await requireVisibleEngagement(db, viewer, id);
  if (!record) return undefined;
  const [events, sources, assignments] = await Promise.all([
    db.select().from(stageEvents).where(eq(stageEvents.engagementId, record.id)).orderBy(asc(stageEvents.effectiveOn), asc(stageEvents.id)),
    db.select().from(sourceChainItems).where(eq(sourceChainItems.engagementId, record.id)).orderBy(asc(sourceChainItems.id)),
    db.select().from(engagementAssignments).where(eq(engagementAssignments.engagementId, record.id)).orderBy(asc(engagementAssignments.role)),
  ]);
  const [waiverRecorder] = record.fcpWaiverRecordedByUserId ? await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, record.fcpWaiverRecordedByUserId)).limit(1) : [];
  return { record, events, sources, assignments, waiverRecordedBy: waiverRecorder ? (waiverRecorder.name ?? waiverRecorder.email) : null };
}

export type WriteResult<T> =
  | { status: "ok"; value: T }
  | { status: "not_found" }
  | { status: "conflict" }
  | { status: "duplicate" }
  | { status: "blocked"; reason: string }
  | { status: "note_required"; warnings: string[] };

/** Tracker field edits use optimistic concurrency: a write based on a stale `rowVersion` is rejected. */
export async function updateTrackerFields(viewer: Viewer, id: number, expectedRowVersion: number, patch: TrackerPatch): Promise<WriteResult<NonNullable<Awaited<ReturnType<typeof getTrackerRecord>>>>> {
  const db = await requireDb();
  // The title follows a rename: the old name is replaced wherever it appears in the title.
  let titlePatch: { title?: string } = {};
  if (patch.customerName) {
    const current = await requireVisibleEngagement(db, viewer, id);
    if (current) titlePatch = { title: renameInTitle(current.title, current.customerName, patch.customerName).slice(0, 240) };
  }
  try {
    const result = await db
      .update(engagements)
      .set({
        ...patch,
        ...titlePatch,
        // A person setting the segment confirms it; an inferred one stops being inferred.
        ...("segment" in patch ? { segmentSource: null } : {}),
        // The FCP document carries its own copy of the customer name; keep it in step with the column.
        ...(patch.customerName ? { data: sql`JSON_SET(${engagements.data}, '$.fields.customerName', ${patch.customerName})` } : {}),
        rowVersion: sql`${engagements.rowVersion} + 1`,
        updatedByUserId: viewer.id,
      })
      .where(and(visibleEngagements(viewer), eq(engagements.id, id), eq(engagements.rowVersion, expectedRowVersion)));
    if (result[0].affectedRows === 0) return (await requireVisibleEngagement(db, viewer, id)) ? { status: "conflict" } : { status: "not_found" };
  } catch (error) {
    if (isDuplicateKey(error)) return { status: "duplicate" };
    throw error;
  }
  const value = await getTrackerRecord(viewer, id);
  return value ? { status: "ok", value } : { status: "not_found" };
}

/**
 * Records or removes the FCP waiver (null removes it), with the person who entered it. Uses the record's rowVersion
 * like any tracker edit. The waiver stands in for the FCP approval gate only (shared/vsaStage.ts deliveryRequirements).
 */
export async function setFcpWaiver(viewer: Viewer, id: number, expectedRowVersion: number, waiver: FcpWaiver | null): Promise<WriteResult<null>> {
  const db = await requireDb();
  if (waiver && waiver.on > today()) return { status: "blocked", reason: "A waiver cannot be dated in the future" };
  const result = await db
    .update(engagements)
    .set({
      fcpWaiverParty: waiver?.party ?? null,
      fcpWaiverBy: waiver?.by ?? null,
      fcpWaivedOn: waiver?.on ?? null,
      fcpWaiverSource: waiver?.source ?? null,
      fcpWaiverRecordedByUserId: waiver ? viewer.id : null,
      rowVersion: sql`${engagements.rowVersion} + 1`,
      updatedByUserId: viewer.id,
    })
    .where(and(visibleEngagements(viewer), eq(engagements.id, id), eq(engagements.rowVersion, expectedRowVersion)));
  if (result[0].affectedRows === 0) return (await requireVisibleEngagement(db, viewer, id)) ? { status: "conflict" } : { status: "not_found" };
  return { status: "ok", value: null };
}

export type StageTransition = { to: Stage; effectiveOn: string; note?: string; expectedRowVersion: number };

/** Writes the stage event, the stage, and `stageEnteredOn` in one transaction. Rules come from shared/vsaStage.ts. */
export async function transitionStage(viewer: Viewer, id: number, transition: StageTransition): Promise<WriteResult<{ warnings: string[] }>> {
  const db = await requireDb();
  const result = await transitionStageInTx(db, viewer, id, transition);
  // Leaving FCP Draft forward keeps the FCP as it stood when it went for approval.
  if (result.status === "ok" && result.from === "fcp_draft" && stageOrder(transition.to) > stageOrder("fcp_draft")) {
    await createFcpVersion(viewer, id, `Submitted: moved to ${STAGE_LABELS[transition.to]}`, "submitted");
  }
  return result.status === "ok" ? { status: "ok", value: result.value } : result;
}

async function transitionStageInTx(db: Db, viewer: Viewer, id: number, transition: StageTransition): Promise<WriteResult<{ warnings: string[] }> & { from?: Stage }> {
  return db.transaction(async tx => {
    const row = await requireVisibleEngagement(tx, viewer, id, true);
    if (!row) return { status: "not_found" } as const;
    if (row.rowVersion !== transition.expectedRowVersion) return { status: "conflict" } as const;
    const dateProblem = effectiveDateProblem(row.stageEnteredOn, transition.effectiveOn, today());
    if (dateProblem) return { status: "blocked", reason: dateProblem } as const;

    const sources = await tx.select().from(sourceChainItems).where(eq(sourceChainItems.engagementId, row.id));
    let pausedFrom: Stage | null = null;
    if (row.stage === "paused") {
      const [last] = await tx.select().from(stageEvents).where(and(eq(stageEvents.engagementId, row.id), eq(stageEvents.toStage, "paused"))).orderBy(desc(stageEvents.effectiveOn), desc(stageEvents.id)).limit(1);
      pausedFrom = last?.fromStage ?? null;
    }
    const record: StageRecord = { ...row, sourceItems: sources, pausedFrom };
    const check = canTransition(record, transition.to);
    if (check.hardBlock) return { status: "blocked", reason: check.hardBlock } as const;
    const note = transition.note?.trim() || null;
    if (check.noteRequired && !note) return { status: "note_required", warnings: check.warnings } as const;

    await tx.insert(stageEvents).values({ engagementId: row.id, fromStage: row.stage, toStage: transition.to, effectiveOn: transition.effectiveOn, actorUserId: viewer.id, source: "manual", note });
    await tx
      .update(engagements)
      .set({ stage: transition.to, stageEnteredOn: transition.effectiveOn, rowVersion: sql`${engagements.rowVersion} + 1`, updatedByUserId: viewer.id })
      .where(eq(engagements.id, row.id));
    return { status: "ok", value: { warnings: check.warnings }, from: row.stage } as const;
  });
}

export type SourceItemInput = {
  kind: SourceItemKind;
  label: string;
  required?: boolean;
  status?: SourceItemStatus;
  requestedOn?: string | null;
  receivedOn?: string | null;
  reference?: string | null;
  note?: string | null;
};

function waivedWithoutNote(item: { status?: SourceItemStatus; note?: string | null }) {
  return item.status === "waived" && !item.note?.trim();
}

export async function addSourceItem(viewer: Viewer, engagementId: number, item: SourceItemInput): Promise<WriteResult<number>> {
  const db = await requireDb();
  if (!(await requireVisibleEngagement(db, viewer, engagementId))) return { status: "not_found" };
  if (waivedWithoutNote(item)) return { status: "blocked", reason: "A waived source needs a note" };
  const result = await db.insert(sourceChainItems).values({ ...item, engagementId, createdByUserId: viewer.id });
  return { status: "ok", value: Number(result[0].insertId) };
}

export async function updateSourceItem(viewer: Viewer, engagementId: number, itemId: number, patch: Partial<SourceItemInput>): Promise<WriteResult<number>> {
  const db = await requireDb();
  if (!(await requireVisibleEngagement(db, viewer, engagementId))) return { status: "not_found" };
  const [existing] = await db.select().from(sourceChainItems).where(and(eq(sourceChainItems.id, itemId), eq(sourceChainItems.engagementId, engagementId))).limit(1);
  if (!existing) return { status: "not_found" };
  if (waivedWithoutNote({ ...existing, ...patch })) return { status: "blocked", reason: "A waived source needs a note" };
  await db.update(sourceChainItems).set({ ...patch, updatedByUserId: viewer.id }).where(and(eq(sourceChainItems.id, itemId), eq(sourceChainItems.engagementId, engagementId)));
  return { status: "ok", value: itemId };
}

export async function deleteSourceItem(viewer: Viewer, engagementId: number, itemId: number) {
  const db = await requireDb();
  if (!(await requireVisibleEngagement(db, viewer, engagementId))) return false;
  const result = await db.delete(sourceChainItems).where(and(eq(sourceChainItems.id, itemId), eq(sourceChainItems.engagementId, engagementId)));
  return result[0].affectedRows > 0;
}

export type AssignmentInput = { role: AssignmentRole; displayName: string; email?: string | null; broadcomEmail?: string | null };

/** One person per role per record. Links to an existing user in the workspace by CDW email. */
export async function setAssignment(viewer: Viewer, engagementId: number, input: AssignmentInput): Promise<WriteResult<number>> {
  const db = await requireDb();
  if (!(await requireVisibleEngagement(db, viewer, engagementId))) return { status: "not_found" };
  const email = input.email?.trim() || null;
  const [match] = email ? await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), eq(users.workspaceId, viewer.workspaceId))).limit(1) : [];
  const values = { engagementId, role: input.role, displayName: input.displayName, email, broadcomEmail: input.broadcomEmail?.trim() || null, userId: match?.id ?? null, createdByUserId: viewer.id };
  await db.insert(engagementAssignments).values(values).onDuplicateKeyUpdate({
    set: { displayName: values.displayName, email: values.email, broadcomEmail: values.broadcomEmail, userId: values.userId },
  });
  return { status: "ok", value: engagementId };
}

export async function removeAssignment(viewer: Viewer, engagementId: number, role: AssignmentRole) {
  const db = await requireDb();
  if (!(await requireVisibleEngagement(db, viewer, engagementId))) return false;
  const result = await db.delete(engagementAssignments).where(and(eq(engagementAssignments.engagementId, engagementId), eq(engagementAssignments.role, role)));
  return result[0].affectedRows > 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pipeline import: rows from a pipeline source (server/pipelineSource.ts), reconciled here (docs/VSA-TRACKER-DATA-MODEL.md section 12.4)

async function loadImportState(tx: Db | Tx, viewer: Viewer, lock = false): Promise<ExistingRecord[]> {
  const query = tx.select({ ...trackerColumns, importSnapshot: engagements.importSnapshot }).from(engagements).where(visibleEngagements(viewer));
  const rows = lock ? await query.for("update") : await query;
  const visibleIds = tx.select({ id: engagements.id }).from(engagements).where(visibleEngagements(viewer));
  const assignments = await tx.select().from(engagementAssignments).where(inArray(engagementAssignments.engagementId, visibleIds));
  const byRecord = new Map<number, ExistingRecord["assignments"]>();
  for (const assignment of assignments) {
    if (!(IMPORT_ROLES as readonly string[]).includes(assignment.role)) continue;
    const roles = byRecord.get(assignment.engagementId) ?? {};
    roles[assignment.role as ImportRole] = { displayName: assignment.displayName, broadcomEmail: assignment.broadcomEmail };
    byRecord.set(assignment.engagementId, roles);
  }
  return rows.map(row => ({
    ...Object.fromEntries(IMPORT_FIELDS.map(field => [field, row[field] ?? null])),
    id: row.id,
    customerName: row.customerName,
    stage: row.stage,
    stageEnteredOn: row.stageEnteredOn,
    intakeSource: row.intakeSource,
    importSnapshot: (row.importSnapshot as ExistingRecord["importSnapshot"]) ?? null,
    assignments: byRecord.get(row.id) ?? {},
  }));
}

/**
 * Plans the import against the records the viewer can see. "preview" writes nothing; "apply" re-plans on locked rows and
 * writes every create, update, stage event, and assignment change in one transaction. Records are never deleted.
 */
/**
 * Reconciles a batch of normalized pipeline rows against the workspace and, in "apply" mode, writes the result in one
 * transaction. The batch comes from a pipeline source (server/pipelineSource.ts); nothing here depends on which.
 */
export async function runPipelineImport(viewer: Viewer, batch: PipelineBatch, mode: "preview" | "apply"): Promise<ImportPlan> {
  const db = await requireDb();
  const day = today();
  if (mode === "preview") return planMappedRows(batch.rows, batch.problems, await loadImportState(db, viewer), day);

  return db.transaction(async tx => {
    const plan = planMappedRows(batch.rows, batch.problems, await loadImportState(tx, viewer, true), day);
    const now = new Date();
    const note = batch.rowNote;

    for (const create of plan.creates) {
      const data = createDefaultDocument();
      data.fields.customerName = String(create.fields.customerName ?? "");
      // The plan type starts from the tracker segment, once, at creation. A default: a person can change it in the FCP.
      data.fields.commercialPlan = create.fields.segment === "commercial";
      const result = await tx.insert(engagements).values({
        ...(create.fields as Partial<InsertEngagement>),
        ownerId: viewer.id,
        workspaceId: viewer.workspaceId,
        title: String(create.fields.customerName ?? "Imported engagement").slice(0, 240),
        customerName: String(create.fields.customerName ?? "Untitled customer"),
        data,
        stage: create.stage,
        stageEnteredOn: create.stageEffectiveOn,
        intakeSource: batch.intakeSource,
        importSnapshot: create.snapshot,
        lastImportedAt: now,
        updatedByUserId: viewer.id,
      });
      const engagementId = Number(result[0].insertId);
      await tx.insert(stageEvents).values({ engagementId, fromStage: null, toStage: create.stage, effectiveOn: create.stageEffectiveOn, actorUserId: viewer.id, source: "import", note: note(create.rowNumber) });
      await tx.insert(sourceChainItems).values(DEFAULT_SOURCE_CHAIN.map(item => ({ ...item, engagementId, createdByUserId: viewer.id })));
      const assignments = Object.entries(create.assignments).map(([role, value]) => ({ engagementId, role: role as ImportRole, displayName: value!.displayName, broadcomEmail: value!.broadcomEmail, createdByUserId: viewer.id }));
      if (assignments.length) await tx.insert(engagementAssignments).values(assignments);
      const report = plan.rows.find(row => row.rowNumber === create.rowNumber);
      if (report) report.recordId = engagementId;
    }

    for (const update of plan.updates) {
      // A rename from the source renames the title too, like a rename in the tracker.
      let titlePatch: { title?: string } = {};
      if (typeof update.fields.customerName === "string") {
        const [current] = await tx.select({ title: engagements.title, customerName: engagements.customerName }).from(engagements).where(and(visibleEngagements(viewer), eq(engagements.id, update.id))).limit(1);
        if (current) titlePatch = { title: renameInTitle(current.title, current.customerName, update.fields.customerName).slice(0, 240) };
      }
      const changed = Object.keys(update.fields).length > 0 || Boolean(update.stageChange) || Object.keys(update.assignments).length > 0;
      await tx
        .update(engagements)
        .set({
          ...(update.fields as Partial<InsertEngagement>),
          // A segment from the Pipeline List is confirmed, so an inferred one stops being inferred.
          ...("segment" in update.fields ? { segmentSource: null } : {}),
          ...(typeof update.fields.customerName === "string" ? { data: sql`JSON_SET(${engagements.data}, '$.fields.customerName', ${update.fields.customerName})`, ...titlePatch } : {}),
          ...(update.stageChange ? { stage: update.stageChange.to, stageEnteredOn: update.stageChange.effectiveOn } : {}),
          importSnapshot: update.snapshot,
          lastImportedAt: now,
          // An unchanged record keeps its updatedAt and rowVersion, so a daily import does not reorder lists or cause edit conflicts.
          ...(changed ? { rowVersion: sql`${engagements.rowVersion} + 1`, updatedByUserId: viewer.id } : { updatedAt: sql`${engagements.updatedAt}` }),
        })
        .where(and(visibleEngagements(viewer), eq(engagements.id, update.id)));
      if (update.stageChange) {
        await tx.insert(stageEvents).values({ engagementId: update.id, fromStage: update.stageChange.from, toStage: update.stageChange.to, effectiveOn: update.stageChange.effectiveOn, actorUserId: viewer.id, source: "import", note: note(update.rowNumber) });
      }
      for (const [role, value] of Object.entries(update.assignments)) {
        if (!value) {
          await tx.delete(engagementAssignments).where(and(eq(engagementAssignments.engagementId, update.id), eq(engagementAssignments.role, role as ImportRole)));
        } else {
          await tx
            .insert(engagementAssignments)
            .values({ engagementId: update.id, role: role as ImportRole, displayName: value.displayName, broadcomEmail: value.broadcomEmail, createdByUserId: viewer.id })
            .onDuplicateKeyUpdate({ set: { displayName: value.displayName, broadcomEmail: value.broadcomEmail } });
        }
      }
    }
    return plan;
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Saved reports

export async function listSavedReports(viewer: Viewer) {
  const db = await requireDb();
  return db
    .select({ id: savedReports.id, name: savedReports.name, config: savedReports.config, ownerId: savedReports.ownerId, ownerName: users.name, updatedAt: savedReports.updatedAt })
    .from(savedReports)
    .leftJoin(users, eq(users.id, savedReports.ownerId))
    .where(visibleReports(viewer))
    .orderBy(asc(savedReports.name));
}

/** Creates a report, or updates one the viewer may edit. Returns the id, or undefined when the report is not editable. */
export async function saveReport(viewer: Viewer, input: { id?: number; name: string; config: ReportConfig }) {
  const db = await requireDb();
  if (input.id) {
    const result = await db.update(savedReports).set({ name: input.name, config: input.config }).where(and(editableReports(viewer), eq(savedReports.id, input.id)));
    return result[0].affectedRows > 0 ? input.id : undefined;
  }
  const result = await db.insert(savedReports).values({ workspaceId: viewer.workspaceId, ownerId: viewer.id, name: input.name, config: input.config });
  return Number(result[0].insertId);
}

export async function deleteReport(viewer: Viewer, id: number) {
  const db = await requireDb();
  const result = await db.delete(savedReports).where(and(editableReports(viewer), eq(savedReports.id, id)));
  return result[0].affectedRows > 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// FCP version history

const versionSummary = { id: fcpVersions.id, versionNumber: fcpVersions.versionNumber, title: fcpVersions.title, label: fcpVersions.label, reason: fcpVersions.reason, createdAt: fcpVersions.createdAt, createdByName: users.name };

export async function listFcpVersions(viewer: Viewer, engagementId: number) {
  const db = await requireDb();
  if (!(await requireVisibleEngagement(db, viewer, engagementId))) return undefined;
  return db.select(versionSummary).from(fcpVersions).leftJoin(users, eq(users.id, fcpVersions.createdByUserId)).where(eq(fcpVersions.engagementId, engagementId)).orderBy(desc(fcpVersions.versionNumber));
}

export async function getFcpVersion(viewer: Viewer, engagementId: number, versionId: number) {
  const db = await requireDb();
  if (!(await requireVisibleEngagement(db, viewer, engagementId))) return undefined;
  const [version] = await db.select().from(fcpVersions).where(and(eq(fcpVersions.id, versionId), eq(fcpVersions.engagementId, engagementId))).limit(1);
  return version;
}

/** Saves the stored FCP as a new version. An export of an FCP identical to the latest version is not saved again. */
export async function createFcpVersion(viewer: Viewer, engagementId: number, label: string, reason: FcpVersion["reason"]) {
  const db = await requireDb();
  const engagement = await getEngagement(viewer, engagementId);
  if (!engagement) return undefined;
  const dataHash = createHash("sha256").update(JSON.stringify(engagement.data)).digest("hex");
  const [latest] = await db.select({ id: fcpVersions.id, dataHash: fcpVersions.dataHash, versionNumber: fcpVersions.versionNumber }).from(fcpVersions).where(eq(fcpVersions.engagementId, engagementId)).orderBy(desc(fcpVersions.versionNumber)).limit(1);
  // Repeated exports of an unchanged FCP add nothing; a submission or a saved version is always recorded as a milestone.
  if (latest && latest.dataHash === dataHash && reason === "export") return { id: latest.id, versionNumber: latest.versionNumber, skipped: true };
  const [{ highest }] = await db.select({ highest: max(fcpVersions.versionNumber) }).from(fcpVersions).where(eq(fcpVersions.engagementId, engagementId));
  const versionNumber = (highest ?? 0) + 1;
  const result = await db.insert(fcpVersions).values({ engagementId, versionNumber, title: engagement.title, data: engagement.data, dataHash, label: label.slice(0, 160), reason, createdByUserId: viewer.id });
  return { id: Number(result[0].insertId), versionNumber, skipped: false };
}

/**
 * Records a person's decision on a tracker segment that disagrees with the FCP plan type, and keeps a copy of the FCP
 * in History with the decision as its label. It changes neither the segment nor the plan: "match-tracker" is recorded
 * after the workspace has saved the plan with the matching type (refused until it has), "keep-plan" while they still
 * disagree. Refused while someone else holds the build lock.
 */
export async function decideSegment(viewer: Viewer, byName: string | null, id: number, choice: SegmentChoice): Promise<WriteResult<SegmentReview>> {
  const db = await requireDb();
  const [row] = await db
    .select({
      segment: engagements.segment,
      buildLockUserId: engagements.buildLockUserId,
      buildLockAt: engagements.buildLockAt,
      commercialPlan: sql<unknown>`JSON_EXTRACT(${engagements.data}, '$.fields.commercialPlan')`,
      customerSegment: sql<unknown>`JSON_UNQUOTE(JSON_EXTRACT(${engagements.data}, '$.fields.customerSegment'))`,
    })
    .from(engagements)
    .where(and(visibleEngagements(viewer), eq(engagements.id, id)))
    .limit(1);
  if (!row) return { status: "not_found" };
  if (buildLockState({ userId: row.buildLockUserId, at: row.buildLockAt }, viewer.id, Date.now()) === "other") throw new BuildLockedError(await lockHolderName(row.buildLockUserId));
  if (!row.segment) return { status: "blocked", reason: "The tracker record has no segment, so there is nothing to decide." };
  const commercialPlan = storedCommercialPlan(jsonBoolean(row.commercialPlan), row.customerSegment);
  const disagrees = segmentDisagrees(row.segment, commercialPlan);
  if (choice === "match-tracker" && disagrees) return { status: "blocked", reason: "Save the FCP with the matching plan type first." };
  if (choice === "keep-plan" && !disagrees) return { status: "blocked", reason: "The plan type already matches the tracker segment." };
  const review: SegmentReview = { segment: row.segment, commercialPlan, choice, byUserId: viewer.id, byName, at: new Date().toISOString() };
  await db.update(engagements).set({ segmentReview: review, updatedByUserId: viewer.id }).where(and(visibleEngagements(viewer), eq(engagements.id, id)));
  await createFcpVersion(viewer, id, segmentDecisionLabel(row.segment, commercialPlan, choice), "decision");
  return { status: "ok", value: review };
}

/**
 * Restores a version's FCP content. The current FCP is saved as a version first, so a restore can itself be undone.
 * The engagement keeps its current customer name and title; only the document content goes back.
 */
export async function restoreFcpVersion(viewer: Viewer, engagementId: number, versionId: number) {
  const version = await getFcpVersion(viewer, engagementId, versionId);
  if (!version) return undefined;
  const current = await getEngagement(viewer, engagementId);
  if (!current) return undefined;
  await createFcpVersion(viewer, engagementId, `Before restoring the copy saved ${version.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC`, "restore");
  const restored = { ...version.data, fields: { ...version.data.fields, customerName: current.customerName } };
  return updateEngagement(viewer, engagementId, current.title, restored, { customerName: current.customerName, title: current.title });
}

// ---------------------------------------------------------------------------------------------------------------------
// Issued FCP versions (docs/FCP-WORKSPACE.md section 13): numbered, immutable snapshots of what the customer received.

const issuer = alias(users, "issuer");
const broadcomApprover = alias(users, "broadcom_approver");
const customerApprover = alias(users, "customer_approver");
const issuedSummary = {
  id: fcpVersions.id,
  issueNumber: fcpVersions.issueNumber,
  status: fcpVersions.status,
  title: fcpVersions.title,
  label: fcpVersions.label,
  revisionNote: fcpVersions.revisionNote,
  changeSummary: fcpVersions.changeSummary,
  dataHash: fcpVersions.dataHash,
  basedOnVersionId: fcpVersions.basedOnVersionId,
  issuedAt: fcpVersions.issuedAt,
  issuedByName: issuer.name,
  broadcomApprovedOn: fcpVersions.broadcomApprovedOn,
  broadcomApprovedByName: broadcomApprover.name,
  broadcomApproverName: fcpVersions.broadcomApproverName,
  broadcomApprovalNote: fcpVersions.broadcomApprovalNote,
  customerApprovedOn: fcpVersions.customerApprovedOn,
  customerApprovedByName: customerApprover.name,
  customerApproverName: fcpVersions.customerApproverName,
  customerApprovalNote: fcpVersions.customerApprovalNote,
};

/** Issued and superseded versions, newest first, without their snapshots. */
export async function listIssuedVersions(viewer: Viewer, engagementId: number) {
  const db = await requireDb();
  if (!(await requireVisibleEngagement(db, viewer, engagementId))) return undefined;
  return db
    .select(issuedSummary)
    .from(fcpVersions)
    .leftJoin(issuer, eq(issuer.id, fcpVersions.issuedByUserId))
    .leftJoin(broadcomApprover, eq(broadcomApprover.id, fcpVersions.broadcomApprovedByUserId))
    .leftJoin(customerApprover, eq(customerApprover.id, fcpVersions.customerApprovedByUserId))
    .where(and(eq(fcpVersions.engagementId, engagementId), isNotNull(fcpVersions.issueNumber)))
    .orderBy(desc(fcpVersions.issueNumber));
}

/** One issued version with its snapshots and HTML; undefined for a History save or another workspace's record. */
export async function getIssuedVersion(viewer: Viewer, engagementId: number, versionId: number) {
  const version = await getFcpVersion(viewer, engagementId, versionId);
  return version && version.issueNumber !== null ? version : undefined;
}

/** The current issued version (status issued), if any. */
export async function getLatestIssuedVersion(viewer: Viewer, engagementId: number) {
  const db = await requireDb();
  if (!(await requireVisibleEngagement(db, viewer, engagementId))) return undefined;
  const [latest] = await db.select().from(fcpVersions).where(and(eq(fcpVersions.engagementId, engagementId), eq(fcpVersions.status, "issued"))).orderBy(desc(fcpVersions.issueNumber)).limit(1);
  return latest ?? null;
}

export type IssueInput = {
  title: string;
  data: EngagementDocument;
  effort: ScopedEffort;
  html: string;
  label: string;
  revisionNote: string | null;
  changeSummary: ChangeSummary;
  /** The issued version the snapshot was compared against; the issue is refused if another was issued meanwhile. */
  basedOnVersionId: number | null;
};

/**
 * Issues the next version: stores the snapshot as given, supersedes the previous issued version, and fills the
 * tracker's "FCP submitted" date when it is empty (never overwriting one). One transaction, on the locked row.
 * Refused while someone else holds the build lock.
 */
export async function issueFcpVersion(viewer: Viewer, engagementId: number, input: IssueInput): Promise<WriteResult<{ id: number; issueNumber: number }>> {
  const db = await requireDb();
  return db.transaction(async tx => {
    const record = await requireVisibleEngagement(tx, viewer, engagementId, true);
    if (!record) return { status: "not_found" } as const;
    if (buildLockState({ userId: record.buildLockUserId, at: record.buildLockAt }, viewer.id, Date.now()) === "other") throw new BuildLockedError(await lockHolderName(record.buildLockUserId));
    const [current] = await tx.select({ id: fcpVersions.id }).from(fcpVersions).where(and(eq(fcpVersions.engagementId, engagementId), eq(fcpVersions.status, "issued"))).orderBy(desc(fcpVersions.issueNumber)).limit(1);
    if ((current?.id ?? null) !== input.basedOnVersionId) return { status: "conflict" } as const;
    const [{ highestSave, highestIssue }] = await tx.select({ highestSave: max(fcpVersions.versionNumber), highestIssue: max(fcpVersions.issueNumber) }).from(fcpVersions).where(eq(fcpVersions.engagementId, engagementId));
    const issueNumber = (highestIssue ?? 0) + 1;
    const now = new Date();
    const result = await tx.insert(fcpVersions).values({
      engagementId,
      versionNumber: (highestSave ?? 0) + 1,
      title: input.title.slice(0, 240),
      data: input.data,
      dataHash: createHash("sha256").update(JSON.stringify(input.data)).digest("hex"),
      label: (input.label || `Issue ${issueNumber}`).slice(0, 160),
      reason: "issued",
      createdByUserId: viewer.id,
      issueNumber,
      status: "issued",
      basedOnVersionId: input.basedOnVersionId,
      effortSnapshot: input.effort,
      renderedHtml: input.html,
      renderHash: createHash("sha256").update(input.html).digest("hex"),
      revisionNote: input.revisionNote,
      changeSummary: input.changeSummary,
      issuedAt: now,
      issuedByUserId: viewer.id,
    });
    if (current) await tx.update(fcpVersions).set({ status: "superseded" }).where(and(eq(fcpVersions.id, current.id), eq(fcpVersions.engagementId, engagementId)));
    if (!record.fcpSubmittedOn) await tx.update(engagements).set({ fcpSubmittedOn: today(), rowVersion: sql`${engagements.rowVersion} + 1`, updatedByUserId: viewer.id }).where(and(visibleEngagements(viewer), eq(engagements.id, engagementId), isNull(engagements.fcpSubmittedOn)));
    return { status: "ok", value: { id: Number(result[0].insertId), issueNumber } } as const;
  });
}

/**
 * Starts the next revision from the latest issued version, so a re-issue begins from what the customer holds. The
 * working FCP is saved to History first, so nothing is lost. The engagement keeps its current customer name and title.
 */
export async function reviseFromIssued(viewer: Viewer, engagementId: number): Promise<WriteResult<{ issueNumber: number }>> {
  const latest = await getLatestIssuedVersion(viewer, engagementId);
  if (latest === undefined) return { status: "not_found" };
  if (latest === null || latest.issueNumber === null) return { status: "blocked", reason: "Nothing has been issued yet, so there is nothing to revise from." };
  const current = await getEngagement(viewer, engagementId);
  if (!current) return { status: "not_found" };
  await createFcpVersion(viewer, engagementId, `Before revising from issue ${latest.issueNumber}`, "restore");
  const restored = { ...latest.data, fields: { ...latest.data.fields, customerName: current.customerName } };
  const saved = await updateEngagement(viewer, engagementId, current.title, restored, { customerName: current.customerName, title: current.title });
  return saved ? { status: "ok", value: { issueNumber: latest.issueNumber } } : { status: "not_found" };
}

export type ApprovalParty = "broadcom" | "customer";

/**
 * Records an approval of the current issued version: the date, who approved it, who recorded it and an optional note. Recorded once
 * per party. Fills the tracker's matching acceptance date when it is empty, so the stage gates read it; a date already
 * on the tracker is never overwritten.
 */
export async function recordApproval(viewer: Viewer, engagementId: number, versionId: number, party: ApprovalParty, approval: { on: string; approverName: string; note: string | null }): Promise<WriteResult<null>> {
  const db = await requireDb();
  if (approval.on > today()) return { status: "blocked", reason: "An approval cannot be dated in the future." };
  return db.transaction(async tx => {
    const record = await requireVisibleEngagement(tx, viewer, engagementId, true);
    if (!record) return { status: "not_found" } as const;
    const [version] = await tx.select({ status: fcpVersions.status, broadcomApprovedOn: fcpVersions.broadcomApprovedOn, customerApprovedOn: fcpVersions.customerApprovedOn }).from(fcpVersions).where(and(eq(fcpVersions.id, versionId), eq(fcpVersions.engagementId, engagementId))).limit(1);
    if (!version || version.status === null) return { status: "not_found" } as const;
    if (version.status !== "issued") return { status: "blocked", reason: "Approvals are recorded on the current issued version." } as const;
    if ((party === "broadcom" ? version.broadcomApprovedOn : version.customerApprovedOn) !== null) return { status: "blocked", reason: "This approval is already recorded." } as const;
    await tx.update(fcpVersions).set(party === "broadcom"
      ? { broadcomApprovedOn: approval.on, broadcomApproverName: approval.approverName, broadcomApprovedByUserId: viewer.id, broadcomApprovalNote: approval.note }
      : { customerApprovedOn: approval.on, customerApproverName: approval.approverName, customerApprovedByUserId: viewer.id, customerApprovalNote: approval.note }).where(and(eq(fcpVersions.id, versionId), eq(fcpVersions.engagementId, engagementId)));
    const gate = party === "broadcom" ? engagements.fcpBroadcomAcceptedOn : engagements.fcpCustomerAcceptedOn;
    if ((party === "broadcom" ? record.fcpBroadcomAcceptedOn : record.fcpCustomerAcceptedOn) === null) {
      await tx.update(engagements).set({ [party === "broadcom" ? "fcpBroadcomAcceptedOn" : "fcpCustomerAcceptedOn"]: approval.on, rowVersion: sql`${engagements.rowVersion} + 1`, updatedByUserId: viewer.id }).where(and(visibleEngagements(viewer), eq(engagements.id, engagementId), isNull(gate)));
    }
    return { status: "ok", value: null } as const;
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Consumption history: hours consumed as of a date. Append-only; a correction is a new entry.

export type ConsumptionEntryInput = { asOf: string; consumedHours: number; note: string | null };

export async function listConsumptionEntries(viewer: Viewer, engagementId: number) {
  const db = await requireDb();
  if (!(await requireVisibleEngagement(db, viewer, engagementId))) return undefined;
  return db
    .select({ id: fcpConsumptionEntries.id, asOf: fcpConsumptionEntries.asOf, consumedHours: fcpConsumptionEntries.consumedHours, source: fcpConsumptionEntries.source, note: fcpConsumptionEntries.note, createdAt: fcpConsumptionEntries.createdAt, enteredByName: users.name })
    .from(fcpConsumptionEntries)
    .leftJoin(users, eq(users.id, fcpConsumptionEntries.enteredByUserId))
    .where(eq(fcpConsumptionEntries.engagementId, engagementId))
    .orderBy(desc(fcpConsumptionEntries.asOf), desc(fcpConsumptionEntries.id));
}

/** Records hours consumed, by anyone who can see the engagement, as a manual entry logged with who entered it. */
export async function addConsumptionEntry(viewer: Viewer, engagementId: number, entry: ConsumptionEntryInput): Promise<WriteResult<number>> {
  const db = await requireDb();
  if (!(await requireVisibleEngagement(db, viewer, engagementId))) return { status: "not_found" };
  const result = await db.insert(fcpConsumptionEntries).values({ engagementId, asOf: entry.asOf, consumedHours: entry.consumedHours, source: "manual", externalId: null, note: entry.note, enteredByUserId: viewer.id });
  return { status: "ok", value: Number(result[0].insertId) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Admin: users and operational settings. No engagement data. Callers are adminProcedures (server/routers.ts), which
// are the only enforcement point; these functions trust that the caller has already been checked.

const editor = alias(users, "editor");

/** Every user, with who last changed them. No identity digest (openId) leaves the server. */
export async function listUsersForAdmin() {
  const db = await requireDb();
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      vsaRole: users.vsaRole,
      workspaceId: users.workspaceId,
      lastSignedIn: users.lastSignedIn,
      updatedAt: users.updatedAt,
      updatedByName: editor.name,
    })
    .from(users)
    .leftJoin(editor, eq(editor.id, users.updatedByUserId))
    .orderBy(asc(users.name), asc(users.id));
}

export type AdminActivity = { at: Date; kind: "stage" | "fcp_version" | "user_change" | "setting"; text: string; recordId: number | null; customerName: string | null };

/** How many of each kind of event the profile reads before merging; it shows the newest `ACTIVITY_LIMIT` overall. */
const ACTIVITY_LIMIT = 20;

/**
 * One user's profile for the admin screen: the user, the record assignments they hold, and their recent activity
 * (stage moves, FCP versions saved, and admin changes they made). Record data is read only through records visible to
 * the admin (`visibleEngagements`), like every engagement read.
 */
export async function getUserForAdmin(viewer: Viewer, userId: number) {
  const db = await requireDb();
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      vsaRole: users.vsaRole,
      workspaceId: users.workspaceId,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
      updatedAt: users.updatedAt,
      updatedByName: editor.name,
    })
    .from(users)
    .leftJoin(editor, eq(editor.id, users.updatedByUserId))
    .where(eq(users.id, userId));
  if (!user) return undefined;

  const visible = visibleEngagements(viewer);
  const assignments = await db
    .select({ recordId: engagements.id, customerName: engagements.customerName, opportunityNumber: engagements.opportunityNumber, stage: engagements.stage, role: engagementAssignments.role })
    .from(engagementAssignments)
    .innerJoin(engagements, eq(engagements.id, engagementAssignments.engagementId))
    .where(and(eq(engagementAssignments.userId, userId), visible))
    .orderBy(asc(engagements.customerName), asc(engagementAssignments.role));

  const [moves, versions, userChanges, settingChanges] = await Promise.all([
    db
      .select({ at: stageEvents.recordedAt, fromStage: stageEvents.fromStage, toStage: stageEvents.toStage, recordId: engagements.id, customerName: engagements.customerName })
      .from(stageEvents)
      .innerJoin(engagements, eq(engagements.id, stageEvents.engagementId))
      .where(and(eq(stageEvents.actorUserId, userId), visible))
      .orderBy(desc(stageEvents.recordedAt))
      .limit(ACTIVITY_LIMIT),
    db
      .select({ at: fcpVersions.createdAt, label: fcpVersions.label, versionNumber: fcpVersions.versionNumber, recordId: engagements.id, customerName: engagements.customerName })
      .from(fcpVersions)
      .innerJoin(engagements, eq(engagements.id, fcpVersions.engagementId))
      .where(and(eq(fcpVersions.createdByUserId, userId), visible))
      .orderBy(desc(fcpVersions.createdAt))
      .limit(ACTIVITY_LIMIT),
    db.select({ at: users.updatedAt, name: users.name, email: users.email }).from(users).where(eq(users.updatedByUserId, userId)).orderBy(desc(users.updatedAt)).limit(ACTIVITY_LIMIT),
    db.select({ at: appSettings.updatedAt, key: appSettings.key }).from(appSettings).where(eq(appSettings.updatedByUserId, userId)).orderBy(desc(appSettings.updatedAt)).limit(ACTIVITY_LIMIT),
  ]);

  const activity: AdminActivity[] = [
    ...moves.map(move => ({ at: move.at, kind: "stage" as const, text: move.fromStage ? `Moved from ${STAGE_LABELS[move.fromStage]} to ${STAGE_LABELS[move.toStage]}` : `Created in ${STAGE_LABELS[move.toStage]}`, recordId: move.recordId, customerName: move.customerName })),
    ...versions.map(version => ({ at: version.at, kind: "fcp_version" as const, text: `Saved the FCP: ${version.label}`, recordId: version.recordId, customerName: version.customerName })),
    ...userChanges.map(change => ({ at: change.at, kind: "user_change" as const, text: `Changed access for ${change.name ?? change.email ?? "a user"}`, recordId: null, customerName: null })),
    ...settingChanges.map(change => ({ at: change.at, kind: "setting" as const, text: `Changed setting ${change.key}`, recordId: null, customerName: null })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, ACTIVITY_LIMIT);

  return { user, assignments, activity };
}

export async function listWorkspaces() {
  const db = await requireDb();
  return db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).orderBy(asc(workspaces.id));
}

export type AdminUserPatch = { role?: User["role"]; vsaRole?: User["vsaRole"]; workspaceId?: number };
export type AdminUserResult = { status: "ok" } | { status: "not_found" } | { status: "last_admin" } | { status: "no_workspace" };

/**
 * An admin's change to a user's role, role view, or workspace, attributed to the admin. Refuses to demote the last
 * admin, so the app can never be left without one. The admin rows are locked, so two admins demoting each other at
 * the same moment cannot both succeed.
 */
export async function updateUserByAdmin(actor: Viewer, userId: number, patch: AdminUserPatch): Promise<AdminUserResult> {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [target] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).for("update");
    if (!target) return { status: "not_found" };
    if (target.role === "admin" && patch.role === "user") {
      const admins = await tx.select({ id: users.id }).from(users).where(eq(users.role, "admin")).for("update");
      if (admins.length <= 1) return { status: "last_admin" };
    }
    if (patch.workspaceId !== undefined) {
      const [workspace] = await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, patch.workspaceId));
      if (!workspace) return { status: "no_workspace" };
    }
    await tx.update(users).set({ ...patch, updatedByUserId: actor.id, updatedAt: sql`CURRENT_TIMESTAMP` }).where(eq(users.id, userId));
    return { status: "ok" };
  });
}

/** Stored settings with who last changed each, for the admin screen. */
export async function listAppSettings() {
  const db = await requireDb();
  return db
    .select({ key: appSettings.key, value: appSettings.value, updatedAt: appSettings.updatedAt, updatedByName: users.name })
    .from(appSettings)
    .leftJoin(users, eq(users.id, appSettings.updatedByUserId));
}

/**
 * The operational settings the app runs on. Falls back to the code defaults for any missing or invalid value, and
 * entirely when the database or the table is unavailable (for example before `pnpm db:migrate`), so a missing
 * setting never breaks a screen.
 */
export async function readOperationalSettings(): Promise<ResolvedSettings> {
  const db = await getDb();
  if (!db) return resolveOperationalSettings([]);
  try {
    return resolveOperationalSettings(await db.select({ key: appSettings.key, value: appSettings.value }).from(appSettings));
  } catch (error) {
    console.warn("[Settings] Using code defaults:", (error as Error).message);
    return resolveOperationalSettings([]);
  }
}

export type SaveSettingsResult = { status: "ok"; changed: string[] } | { status: "invalid"; errors: Record<string, string> };

/** Validates the changes against the stored settings and writes the changed keys, attributed to the admin. */
export async function saveAppSettings(actor: Viewer, changes: Record<string, AppSettingValue>): Promise<SaveSettingsResult> {
  const db = await requireDb();
  return db.transaction(async tx => {
    const rows = await tx.select({ key: appSettings.key, value: appSettings.value }).from(appSettings).for("update");
    const result = applySettingChanges(resolveOperationalSettings(rows).settings, changes);
    if (!result.ok) return { status: "invalid", errors: result.errors };
    for (const [key, value] of Object.entries(result.changed)) {
      await tx.insert(appSettings).values({ key, value, updatedByUserId: actor.id }).onDuplicateKeyUpdate({ set: { value, updatedByUserId: actor.id } });
    }
    return { status: "ok", changed: Object.keys(result.changed) };
  });
}
