import { index, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
import type { EngagementDocument } from "../shared/fcp";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 191 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

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
  },
  table => [index("engagements_owner_updated_idx").on(table.ownerId, table.updatedAt)],
);

export type Engagement = typeof engagements.$inferSelect;
export type InsertEngagement = typeof engagements.$inferInsert;
