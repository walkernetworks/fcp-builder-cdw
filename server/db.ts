import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { EngagementDocument } from "../shared/fcp";
import { engagements, InsertEngagement, InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

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
  await db.insert(users).values(values).onDuplicateKeyUpdate({
    set: {
      name: values.name,
      email: values.email,
      loginMethod: values.loginMethod,
      lastSignedIn: values.lastSignedIn,
    },
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listEngagements(ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  return db
    .select({
      id: engagements.id,
      title: engagements.title,
      customerName: engagements.customerName,
      customerShortName: engagements.customerShortName,
      status: engagements.status,
      createdAt: engagements.createdAt,
      updatedAt: engagements.updatedAt,
    })
    .from(engagements)
    .where(eq(engagements.ownerId, ownerId))
    .orderBy(desc(engagements.updatedAt));
}

export async function getEngagement(ownerId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const rows = await db
    .select()
    .from(engagements)
    .where(and(eq(engagements.ownerId, ownerId), eq(engagements.id, id)))
    .limit(1);
  return rows[0];
}

export async function createEngagement(ownerId: number, title: string, data: EngagementDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const values: InsertEngagement = {
    ownerId,
    title,
    customerName: data.fields.customerName || "Untitled customer",
    customerShortName: data.fields.accountId || "TBD",
    data,
  };
  const result = await db.insert(engagements).values(values);
  return getEngagement(ownerId, Number(result[0].insertId));
}

export async function updateEngagement(ownerId: number, id: number, title: string, data: EngagementDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  await db
    .update(engagements)
    .set({
      title,
      customerName: data.fields.customerName || "Untitled customer",
      customerShortName: data.fields.accountId || "TBD",
      data,
      status: data.fields.customerName && data.fields.entitlementEnd && data.inventory.hosts > 0 ? "ready" : "draft",
    })
    .where(and(eq(engagements.ownerId, ownerId), eq(engagements.id, id)));
  return getEngagement(ownerId, id);
}

export async function deleteEngagement(ownerId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db
    .delete(engagements)
    .where(and(eq(engagements.ownerId, ownerId), eq(engagements.id, id)));
  return result[0].affectedRows > 0;
}

export async function duplicateEngagement(ownerId: number, id: number) {
  const source = await getEngagement(ownerId, id);
  if (!source) return undefined;
  const copy = structuredClone(source.data);
  return createEngagement(ownerId, `${source.title} — Copy`, copy);
}
