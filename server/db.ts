import { and, asc, desc, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createDefaultDocument, EngagementDocument } from "../shared/fcp";
import { IMPORT_FIELDS, IMPORT_ROLES, planImport, type ExistingRecord, type ImportPlan, type ImportRole } from "../shared/sharepointImport";
import type { AssignmentRole, SourceItemKind, SourceItemStatus, TrackerPatch } from "../shared/vsaFields";
import { canTransition, DEFAULT_SOURCE_CHAIN, effectiveDateProblem, type Stage, type StageRecord } from "../shared/vsaStage";
import {
  engagementAssignments,
  engagements,
  InsertEngagement,
  InsertUser,
  sourceChainItems,
  stageEvents,
  User,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { deletableEngagements, visibleEngagements, type Viewer } from "./visibility";

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

/** FCP saves stay last-write-wins, as before. They never touch tracker columns, so they do not bump `rowVersion`. */
export async function updateEngagement(viewer: Viewer, id: number, title: string, data: EngagementDocument) {
  const db = await requireDb();
  await db
    .update(engagements)
    .set({
      title,
      customerName: data.fields.customerName || "Untitled customer",
      customerShortName: data.fields.accountId || "TBD",
      data,
      status: data.fields.customerName && data.fields.entitlementEnd && data.inventory.hosts > 0 ? "ready" : "draft",
      updatedByUserId: viewer.id,
    })
    .where(and(visibleEngagements(viewer), eq(engagements.id, id)));
  return getEngagement(viewer, id);
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
  const assignments = ids.length
    ? await db
        .select({ engagementId: engagementAssignments.engagementId, role: engagementAssignments.role, userId: engagementAssignments.userId, displayName: engagementAssignments.displayName })
        .from(engagementAssignments)
        .where(inArray(engagementAssignments.engagementId, ids))
    : [];
  return rows.map(row => ({ ...row, assignments: assignments.filter(assignment => assignment.engagementId === row.id) }));
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
  try {
    const result = await db
      .update(engagements)
      .set({ ...patch, rowVersion: sql`${engagements.rowVersion} + 1`, updatedByUserId: viewer.id })
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
    return { status: "ok", value: { warnings: check.warnings } } as const;
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
      const changed = Object.keys(update.fields).length > 0 || Boolean(update.stageChange) || Object.keys(update.assignments).length > 0;
      await tx
        .update(engagements)
        .set({
          ...(update.fields as Partial<InsertEngagement>),
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

