import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ addConsumptionEntry: vi.fn(), listConsumptionEntries: vi.fn() }));

import { consumedBetween, withLatestConsumption } from "../shared/consumption";
import { createDefaultDocument } from "../shared/fcp";
import { fundingProvenance } from "../shared/provenance";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";

const ROOT = path.resolve(import.meta.dirname, "..");

function caller() {
  const user = { id: 7, openId: "consumption-test", email: "pm@example.test", name: "Test PM", loginMethod: "trusted-proxy", role: "user", workspaceId: 1, vsaRole: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  return appRouter.createCaller({ user, req: { headers: {}, protocol: "https" }, res: {} } as unknown as TrpcContext);
}

function consumed(hoursConsumed: number | null, consumedAsOf: string | null) {
  const document = createDefaultDocument();
  document.fields.customerName = "Acme Health";
  document.report.entitlement = { ...document.report.entitlement, hoursConsumed, consumedAsOf };
  return document;
}

describe("the latest entry is what prints", () => {
  it("fills hours consumed and its date from a newer or same-day entry", () => {
    const next = withLatestConsumption(consumed(120, "2026-12-01"), { asOf: "2027-01-05", consumedHours: 180 });
    expect([next.report.entitlement.hoursConsumed, next.report.entitlement.consumedAsOf]).toEqual([180, "2027-01-05"]);
    expect(fundingProvenance(next).hoursConsumed).toMatchObject({ state: "confirmed", value: 180 });
    expect(withLatestConsumption(consumed(120, "2026-12-01"), { asOf: "2026-12-01", consumedHours: 125 }).report.entitlement.hoursConsumed).toBe(125);
  });

  it("never moves the burndown back for an older entry, unless asked to use it", () => {
    const document = consumed(120, "2026-12-01");
    expect(withLatestConsumption(document, { asOf: "2026-11-01", consumedHours: 80 })).toBe(document);
    expect(withLatestConsumption(document, { asOf: "2026-11-01", consumedHours: 80 }, true).report.entitlement.hoursConsumed).toBe(80);
  });

  it("leaves an unchanged document alone, so recording the same figure saves nothing", () => {
    const document = consumed(120, "2026-12-01");
    expect(withLatestConsumption(document, { asOf: "2026-12-01", consumedHours: 120 })).toBe(document);
  });

  it("reports hours delivered between two points", () => {
    expect(consumedBetween({ asOf: "2026-12-01", consumedHours: 120 }, { asOf: "2027-02-01", consumedHours: 260.5 })).toEqual({ hours: 140.5, asOf: "2027-02-01" });
    expect(consumedBetween(null, { asOf: "2027-02-01", consumedHours: 40 })).toEqual({ hours: 40, asOf: "2027-02-01" });
    expect(consumedBetween({ asOf: "2026-12-01", consumedHours: 120 }, null)).toBeNull();
  });
});

describe("fcpRecord.addConsumption", () => {
  beforeEach(() => vi.mocked(db.addConsumptionEntry).mockReset());

  it("records a manual entry as the signed-in person", async () => {
    vi.mocked(db.addConsumptionEntry).mockResolvedValueOnce({ status: "ok", value: 11 });
    expect(await caller().fcpRecord.addConsumption({ id: 4, asOf: "2027-01-05", consumedHours: 180.123, note: "  " })).toBe(11);
    expect(db.addConsumptionEntry).toHaveBeenCalledWith({ id: 7, workspaceId: 1, role: "user" }, 4, { asOf: "2027-01-05", consumedHours: 180.12, note: null });
  });

  it("refuses a bad date or negative hours", async () => {
    await expect(caller().fcpRecord.addConsumption({ id: 4, asOf: "05/01/2027", consumedHours: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().fcpRecord.addConsumption({ id: 4, asOf: "2027-01-05", consumedHours: -1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.addConsumptionEntry).not.toHaveBeenCalled();
  });

  it("is not found outside the viewer's workspace", async () => {
    vi.mocked(db.addConsumptionEntry).mockResolvedValueOnce({ status: "not_found" });
    await expect(caller().fcpRecord.addConsumption({ id: 4, asOf: "2027-01-05", consumedHours: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("consumption storage", () => {
  const source = readFileSync(path.join(ROOT, "server/db.ts"), "utf8");
  const migration = readFileSync(path.join(ROOT, "drizzle/0011_fcp_versions_issue.sql"), "utf8");

  it("is append-only, and entries made in the app are always manual", () => {
    expect(source).not.toMatch(/\.update\(fcpConsumptionEntries\)|\.delete\(fcpConsumptionEntries\)/);
    expect(source).toMatch(/insert\(fcpConsumptionEntries\)\.values\(\{[^}]*source: "manual", externalId: null/);
  });

  it("lets a future Salesforce read upsert its own rows by external id", () => {
    expect(migration).toContain("CONSTRAINT `fcp_consumption_external_uq` UNIQUE(`engagementId`,`source`,`externalId`)");
    expect(migration).toContain("`source` enum('manual','salesforce') NOT NULL DEFAULT 'manual'");
  });

  it("is an additive migration", () => {
    expect(migration).not.toMatch(/\bDROP\b|\bRENAME\b/i);
    expect(migration).toContain("MODIFY COLUMN `reason` enum('manual','submitted','export','restore','decision','issued') NOT NULL");
  });
});
