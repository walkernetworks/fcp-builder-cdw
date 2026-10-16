import { describe, expect, it } from "vitest";
import {
  applicableStages,
  canTransition,
  customerApprovalItems,
  effectiveDateProblem,
  nextStage,
  sourceChainComplete,
  stageWarnings,
  STAGES,
  type StageRecord,
} from "../shared/vsaStage";

const record = (overrides: Partial<StageRecord> = {}): StageRecord => ({ stage: "intake", segment: "corporate", ...overrides });

describe("stage path by segment", () => {
  it("skips Broadcom Approval only for Commercial", () => {
    expect(applicableStages("corporate")).toContain("broadcom_approval");
    expect(applicableStages("strategic")).toContain("broadcom_approval");
    expect(applicableStages(null)).toContain("broadcom_approval");
    expect(applicableStages("commercial")).not.toContain("broadcom_approval");
  });

  it("moves Commercial from FCP Draft straight to Customer Approval", () => {
    expect(nextStage(record({ stage: "fcp_draft", segment: "commercial" }))).toBe("customer_approval");
    expect(nextStage(record({ stage: "fcp_draft", segment: "corporate" }))).toBe("broadcom_approval");
  });

  it("moves a Commercial record that is sitting in Broadcom Approval on to Customer Approval", () => {
    expect(nextStage(record({ stage: "broadcom_approval", segment: "commercial" }))).toBe("customer_approval");
  });

  it("has no next stage at the end, in an exit, or when paused with unknown history", () => {
    expect(nextStage(record({ stage: "complete" }))).toBeNull();
    expect(nextStage(record({ stage: "lost" }))).toBeNull();
    expect(nextStage(record({ stage: "paused" }))).toBeNull();
    expect(nextStage(record({ stage: "paused", pausedFrom: "discovery" }))).toBe("discovery");
  });

  it("keeps 11 main-line stages and 3 exits", () => {
    expect(STAGES).toHaveLength(14);
  });
});

describe("transitions", () => {
  it("allows the next stage with no note, and warns about missing exit dates", () => {
    const check = canTransition(record(), "broadcom_request");
    expect(check).toMatchObject({ ok: true, noteRequired: false });
    expect(check.warnings).toEqual(["SER not submitted"]);
    expect(canTransition(record({ serSubmittedOn: "2026-10-01" }), "broadcom_request").warnings).toEqual([]);
  });

  it("requires a note to skip ahead and collects every skipped stage's gaps", () => {
    const check = canTransition(record(), "discovery");
    expect(check.noteRequired).toBe(true);
    expect(check.warnings).toEqual(["SER not submitted", "Broadcom partner approval not recorded"]);
  });

  it("requires a note to move backward", () => {
    expect(canTransition(record({ stage: "fcp_draft" }), "discovery")).toMatchObject({ ok: true, noteRequired: true });
  });

  it("hard-blocks Kickoff and In Delivery without a PO date", () => {
    for (const to of ["kickoff", "in_delivery"] as const) {
      const blocked = canTransition(record({ stage: "ra_staffing" }), to);
      expect(blocked.ok).toBe(false);
      expect(blocked.hardBlock).toMatch(/PO/);
      expect(canTransition(record({ stage: "ra_staffing", poReceivedOn: "2026-10-01" }), to).ok).toBe(true);
    }
  });

  it("lets any open stage exit, and treats leaving a terminal stage as a reopening that needs a note", () => {
    expect(canTransition(record({ stage: "discovery" }), "lost")).toMatchObject({ ok: true, noteRequired: false });
    expect(canTransition(record({ stage: "lost" }), "discovery")).toMatchObject({ ok: true, noteRequired: true });
    expect(canTransition(record({ stage: "refused" }), "lost").noteRequired).toBe(true);
  });

  it("resumes a paused record to its paused-from stage without a note, elsewhere with one", () => {
    expect(canTransition(record({ stage: "paused", pausedFrom: "discovery" }), "discovery").noteRequired).toBe(false);
    expect(canTransition(record({ stage: "paused", pausedFrom: "discovery" }), "fcp_draft").noteRequired).toBe(true);
    expect(canTransition(record({ stage: "paused", pausedFrom: null }), "discovery").noteRequired).toBe(true);
  });

  it("refuses a move to the current stage", () => {
    expect(canTransition(record({ stage: "discovery" }), "discovery").ok).toBe(false);
  });

  it("warns when a Commercial record is moved into Broadcom Approval", () => {
    expect(canTransition(record({ stage: "fcp_draft", segment: "commercial" }), "broadcom_approval").warnings).toContain("Commercial customers skip Broadcom Approval");
  });

  it("checks the source chain when items are supplied", () => {
    const sourceItems = [
      { kind: "rvtools" as const, label: "RVTools export", required: true, status: "received" as const },
      { kind: "customer_brief" as const, label: "Customer brief", required: true, status: "needed" as const },
      { kind: "other" as const, label: "Nice to have", required: false, status: "needed" as const },
    ];
    expect(canTransition(record({ stage: "source_chain", sourceItems }), "fcp_draft").warnings).toEqual(["Source not received: Customer brief"]);
    expect(sourceChainComplete(sourceItems)).toBe(false);
    expect(sourceChainComplete(sourceItems.map(item => ({ ...item, status: "waived" as const })))).toBe(true);
  });
});

describe("customer approval and the work plan", () => {
  it("has two approvals for Corporate and Strategic, one for Commercial", () => {
    expect(customerApprovalItems(record({ segment: "corporate" })).workPlan).toBeDefined();
    expect(customerApprovalItems(record({ segment: "strategic" })).workPlan).toBeDefined();
    expect(customerApprovalItems(record({ segment: "commercial" })).workPlan).toBeUndefined();
  });

  it("names the missing approval when leaving Customer Approval", () => {
    const leaving = (overrides: Partial<StageRecord>) => canTransition(record({ stage: "customer_approval", ...overrides }), "ra_staffing").warnings;
    expect(leaving({})).toEqual(["Customer FCP acceptance not recorded", "Work plan not sent"]);
    expect(leaving({ fcpCustomerAcceptedOn: "2026-10-01", workPlanSentOn: "2026-10-02" })).toEqual(["Work plan sent, not accepted"]);
    expect(leaving({ fcpCustomerAcceptedOn: "2026-10-01", workPlanSentOn: "2026-10-02", workPlanAcceptedOn: "2026-10-05" })).toEqual([]);
    expect(leaving({ segment: "commercial", fcpCustomerAcceptedOn: "2026-10-01" })).toEqual([]);
  });

  it("warns about a work plan sent more than 14 days ago without acceptance", () => {
    const sent = record({ stage: "customer_approval", workPlanSentOn: "2026-10-01" });
    expect(stageWarnings(sent, "2026-10-15")).not.toContainEqual(expect.stringMatching(/Work plan/));
    expect(stageWarnings(sent, "2026-10-16")).toContainEqual(expect.stringMatching(/Work plan sent 2026-10-01/));
    expect(stageWarnings({ ...sent, segment: "commercial" }, "2026-11-30")).not.toContainEqual(expect.stringMatching(/Work plan/));
  });
});

describe("record warnings and dates", () => {
  it("flags a missing segment and a delivery stage with no PO", () => {
    expect(stageWarnings(record({ segment: null, stage: "in_delivery" }), "2026-10-15")).toEqual(["Segment not set", "In a delivery stage without a PO received date"]);
  });

  it("refuses stage dates before the current stage began or in the future", () => {
    expect(effectiveDateProblem("2026-10-05", "2026-10-05", "2026-10-15")).toBeNull();
    expect(effectiveDateProblem("2026-10-05", "2026-10-04", "2026-10-15")).toMatch(/before 2026-10-05/);
    expect(effectiveDateProblem("2026-10-05", "2026-10-16", "2026-10-15")).toMatch(/future/);
  });
});
