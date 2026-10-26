import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => {
  class BuildLockedError extends Error {}
  return { BuildLockedError, decideSegment: vi.fn() };
});

import { commercialPlanForSegment, segmentDecisionLabel, segmentWarning, type SegmentReview } from "../shared/fcpRecord";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";

const ROOT = path.resolve(import.meta.dirname, "..");

function caller() {
  const user = { id: 7, openId: "segment-test", email: "sa@example.test", name: "Test SA", loginMethod: "trusted-proxy", role: "user", workspaceId: 1, vsaRole: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  return appRouter.createCaller({ user, req: { headers: {}, protocol: "https" }, res: {} } as unknown as TrpcContext);
}

const review = (patch: Partial<SegmentReview> = {}): SegmentReview => ({ segment: "strategic", commercialPlan: true, choice: "keep-plan", byUserId: 7, byName: "Test SA", at: "2026-10-23T00:00:00.000Z", ...patch });

describe("segment warning", () => {
  it("names both sides when the tracker segment and the plan type disagree", () => {
    expect(segmentWarning("strategic", true, null)).toBe("Tracker segment is Strategic; this plan is built as Commercial.");
    expect(segmentWarning("commercial", false, null)).toBe("Tracker segment is Commercial; this plan is built as Standard.");
    expect(segmentWarning("corporate", true, null)).toBe("Tracker segment is Corporate; this plan is built as Commercial.");
  });

  it("is quiet when they agree or the tracker has no segment", () => {
    expect(segmentWarning("commercial", true, null)).toBeNull();
    expect(segmentWarning("strategic", false, null)).toBeNull();
    expect(segmentWarning(null, true, null)).toBeNull();
  });

  it("stays quiet after a person decides that exact pair, and returns when either side changes", () => {
    expect(segmentWarning("strategic", true, review())).toBeNull();
    expect(segmentWarning("corporate", true, review())).not.toBeNull();
    expect(segmentWarning("commercial", false, review({ segment: "commercial", commercialPlan: true }))).not.toBeNull();
  });

  it("matches a segment with the plan type that fits it", () => {
    expect([commercialPlanForSegment("commercial"), commercialPlanForSegment("corporate"), commercialPlanForSegment("strategic")]).toEqual([true, false, false]);
  });

  it("labels the decision for History", () => {
    expect(segmentDecisionLabel("strategic", true, "keep-plan")).toBe("Segment decision: plan kept as Commercial; tracker segment is Strategic");
    expect(segmentDecisionLabel("strategic", false, "match-tracker")).toBe("Segment decision: plan changed to Standard to match the tracker segment (Strategic)");
  });
});

describe("fcpRecord.decideSegment", () => {
  beforeEach(() => vi.mocked(db.decideSegment).mockReset());

  it("records the decision as the signed-in person", async () => {
    vi.mocked(db.decideSegment).mockResolvedValueOnce({ status: "ok", value: review() });
    expect(await caller().fcpRecord.decideSegment({ id: 4, choice: "keep-plan" })).toEqual(review());
    expect(db.decideSegment).toHaveBeenCalledWith({ id: 7, workspaceId: 1, role: "user" }, "Test SA", 4, "keep-plan");
  });

  it("refuses a decision the saved FCP does not support", async () => {
    vi.mocked(db.decideSegment).mockResolvedValueOnce({ status: "blocked", reason: "Save the FCP with the matching plan type first." });
    await expect(caller().fcpRecord.decideSegment({ id: 4, choice: "match-tracker" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("refuses while someone else is editing", async () => {
    vi.mocked(db.decideSegment).mockRejectedValueOnce(new db.BuildLockedError("Priya Shah is editing this FCP"));
    await expect(caller().fcpRecord.decideSegment({ id: 4, choice: "keep-plan" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("accepts only the two explicit choices", async () => {
    await expect(caller().fcpRecord.decideSegment({ id: 4, choice: "auto" as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.decideSegment).not.toHaveBeenCalled();
  });
});

describe("where the plan type comes from", () => {
  const source = readFileSync(path.join(ROOT, "server/db.ts"), "utf8");

  it("starts a record created by the Pipeline import from its tracker segment, once", () => {
    expect(source).toContain('data.fields.commercialPlan = create.fields.segment === "commercial";');
  });

  it("never copies the tracker segment into an existing FCP", () => {
    // The only writes into a saved document's fields are the customer name (shared with the tracker) and FCP saves.
    const jsonWrites = source.match(/JSON_SET\([^)]*\)/g) ?? [];
    expect(jsonWrites.every(write => write.includes("'$.fields.customerName'"))).toBe(true);
    // The plan type is set from a segment in one place only: a record the Pipeline import creates.
    expect(source.match(/commercialPlan\s*[:=][^;\n]*\.segment\b.*/g)).toEqual(['commercialPlan = create.fields.segment === "commercial";']);
  });
});

describe("funding copy", () => {
  const editor = readFileSync(path.join(ROOT, "client/src/components/ReportContentEditor.tsx"), "utf8");

  it("keeps the entitled and consumed hours out of the customer-conversation group, as two sections", () => {
    const customerGroup = editor.match(/<Group title="From the customer"[^>]*members=\{\[([^\]]*)\]/)?.[1] ?? "";
    expect(customerGroup).not.toMatch(/"entitlement"|"consumption"/);
    expect(editor).toMatch(/<Section value="entitlement" title="Entitled hours"/);
    expect(editor).toMatch(/<Section value="consumption" title=\{bsasOnly \? "BSAS hours consumed" : "Hours consumed"\}/);
  });
});
