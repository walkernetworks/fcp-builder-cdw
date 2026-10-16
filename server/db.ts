import { createHash } from "node:crypto";
import { and, asc, desc, eq, getTableColumns, inArray, isNull, max, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createDefaultDocument, EngagementDocument } from "../shared/fcp";
import { renameInTitle, resolveFcpSaveNames } from "../shared/customerName";
import { buildLockState, sourceUpdatesFromDocument } from "../shared/fcpRecord";
import { IMPORT_FIELDS, IMPORT_ROLES, planImport, type ExistingRecord, type ImportPlan, type ImportRole } from "../shared/sharepointImport";
import type { AssignmentRole, SourceItemKind, SourceItemStatus, TrackerPatch } from "../shared/vsaFields";
import { canTransition, DEFAULT_SOURCE_CHAIN, effectiveDateProblem, STAGE_LABELS, stageOrder, type Stage, type StageRecord } from "../shared/vsaStage";
import {
  engagementAssignments,
  engagements,
  fcpVersions,
  savedReports,
  InsertEngagement,
  InsertUser,
  sourceChainItems,
  stageEvents,
  User,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { deletableEngagements, editableReports, visibleEngagements, visibleReports, type Viewer } from "./visibility";
import type { ReportConfig } from "../shared/vsaReports";

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

export async function deleteEngagement(viewer: Viewer, id: number) {
  const db = await requireDb();
  const result = await db.delete(engagements).where(and(deletableEngagements(viewer), eq(engagements.id, id)));
  return result[0].affectedRows > 0;
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
  return { record, events, sources, assignments };
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
// SharePoint Pipeline List import (docs/VSA-TRACKER-DATA-MODEL.md section 12.4)

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
export async function runSharePointImport(viewer: Viewer, csv: string, mode: "preview" | "apply"): Promise<ImportPlan> {
  const db = await requireDb();
  const day = today();
  if (mode === "preview") return planImport(csv, await loadImportState(db, viewer), day);

  return db.transaction(async tx => {
    const plan = planImport(csv, await loadImportState(tx, viewer, true), day);
    const now = new Date();
    const note = (rowNumber: number) => `SharePoint import, row ${rowNumber}`;

    for (const create of plan.creates) {
      const data = createDefaultDocument();
      data.fields.customerName = String(create.fields.customerName ?? "");
      const result = await tx.insert(engagements).values({
        ...(create.fields as Partial<InsertEngagement>),
        ownerId: viewer.id,
        workspaceId: viewer.workspaceId,
        title: String(create.fields.customerName ?? "Imported engagement").slice(0, 240),
        customerName: String(create.fields.customerName ?? "Untitled customer"),
        data,
        stage: create.stage,
        stageEnteredOn: create.stageEffectiveOn,
        intakeSource: "sharepoint_import",
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
      // A rename from SharePoint renames the title too, like a rename in the tracker.
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
export async function createFcpVersion(viewer: Viewer, engagementId: number, label: string, reason: "manual" | "submitted" | "export" | "restore") {
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
 * Restores a version's FCP content. The current FCP is saved as a version first, so a restore can itself be undone.
 * The engagement keeps its current customer name and title; only the document content goes back.
 */
export async function restoreFcpVersion(viewer: Viewer, engagementId: number, versionId: number) {
  const version = await getFcpVersion(viewer, engagementId, versionId);
  if (!version) return undefined;
  const current = await getEngagement(viewer, engagementId);
  if (!current) return undefined;
  await createFcpVersion(viewer, engagementId, `Before restoring version ${version.versionNumber}`, "restore");
  const restored = { ...version.data, fields: { ...version.data.fields, customerName: current.customerName } };
  return updateEngagement(viewer, engagementId, current.title, restored, { customerName: current.customerName, title: current.title });
}

