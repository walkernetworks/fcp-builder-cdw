import { readFileSync } from "node:fs";
import path from "node:path";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { canDeleteEngagement, canEditEngagement, deletableEngagements, visibleEngagements } from "./visibility";

const dialect = new MySqlDialect();
const render = (sql: Parameters<MySqlDialect["sqlToQuery"]>[0]) => {
  const { sql: text, params } = dialect.sqlToQuery(sql);
  return { sql: text, params };
};

describe("visibility helper", () => {
  it("scopes reads to the viewer's workspace, not the owner", () => {
    expect(render(visibleEngagements({ id: 7, workspaceId: 3, role: "user" }))).toEqual({ sql: "`engagements`.`workspaceId` = ?", params: [3] });
  });

  it("limits delete to the owner within the workspace, or any record in the workspace for an admin", () => {
    expect(render(deletableEngagements({ id: 7, workspaceId: 3, role: "user" }))).toEqual({ sql: "(`engagements`.`workspaceId` = ? and `engagements`.`ownerId` = ?)", params: [3, 7] });
    expect(render(deletableEngagements({ id: 7, workspaceId: 3, role: "admin" }))).toEqual({ sql: "`engagements`.`workspaceId` = ?", params: [3] });
  });

  it("answers the same rules for a loaded row", () => {
    const row = { workspaceId: 3, ownerId: 7 };
    expect(canEditEngagement({ id: 8, workspaceId: 3, role: "user" }, row)).toBe(true);
    expect(canEditEngagement({ id: 7, workspaceId: 4, role: "admin" }, row)).toBe(false);
    expect(canDeleteEngagement({ id: 8, workspaceId: 3, role: "user" }, row)).toBe(false);
    expect(canDeleteEngagement({ id: 8, workspaceId: 3, role: "admin" }, row)).toBe(true);
    expect(canDeleteEngagement({ id: 7, workspaceId: 3, role: "user" }, row)).toBe(true);
  });
});

describe("db.ts engagement access", () => {
  const source = readFileSync(path.join(import.meta.dirname, "db.ts"), "utf8");
  const functions = [...source.matchAll(/^export async function (\w+)\(([\s\S]*?)^}$/gm)].map(([, name, body]) => ({ name, body }));
  // Direct use of the helper, or delegation to a function that is itself scoped (checked by this same test).
  const scoped = /visibleEngagements\(|deletableEngagements\(|requireVisibleEngagement\(|getEngagement\(viewer|getFcpVersion\(viewer/;
  const touchesEngagementData = /\b(engagements|stageEvents|sourceChainItems|engagementAssignments|fcpVersions|fcpConsumptionEntries)\b/;
  // Delegates to scoped functions, or writes a new row into the viewer's own workspace.
  const allowed: Record<string, RegExp> = {
    createEngagement: /workspaceId: viewer\.workspaceId/,
    duplicateEngagement: /getEngagement\(viewer/,
  };

  it("finds the engagement functions", () => {
    expect(functions.map(fn => fn.name)).toEqual(expect.arrayContaining(["listEngagements", "getEngagement", "listTracker", "transitionStage", "setAssignment", "listFcpVersions", "createFcpVersion", "restoreFcpVersion", "acquireBuildLock", "releaseBuildLock"]));
  });

  it("scopes every function that reads or writes engagement data through the visibility helper", () => {
    const unscoped = functions
      .filter(fn => touchesEngagementData.test(fn.body) || /getEngagement\(/.test(fn.body))
      .filter(fn => !(allowed[fn.name]?.test(fn.body) ?? scoped.test(fn.body)))
      .map(fn => fn.name);
    expect(unscoped).toEqual([]);
  });

  it("scopes saved reports to the workspace, and changes to the owner or an admin", () => {
    const touching = functions.filter(fn => /\bsavedReports\b/.test(fn.body));
    expect(touching.map(fn => fn.name)).toEqual(expect.arrayContaining(["listSavedReports", "saveReport", "deleteReport"]));
    const unscoped = touching.filter(fn => !/visibleReports\(|editableReports\(/.test(fn.body)).map(fn => fn.name);
    expect(unscoped).toEqual([]);
  });

  it("never updates or deletes stage events", () => {
    expect(source).not.toMatch(/\.update\(stageEvents\)|\.delete\(stageEvents\)/);
  });
});
