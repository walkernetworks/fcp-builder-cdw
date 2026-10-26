import { describe, expect, it } from "vitest";
import {
  applicableStages,
  authorizationCheck,
  deliveryRequirements,
  fcpTrailing,
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

  it("keeps 10 main-line stages and 3 exits", () => {
    expect(STAGES).toHaveLength(13);
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
    expect(canTransition(record({ stage: "discovery" }), "fcp_draft").noteRequired).toBe(false);
    expect(check.warnings).toEqual(["SER not submitted", "Broadcom partner approval not recorded"]);
  });

  it("requires a note to move backward", () => {
    expect(canTransition(record({ stage: "fcp_draft" }), "discovery")).toMatchObject({ ok: true, noteRequired: true });
  });

  it("hard-blocks Kickoff and In Delivery until FCP approval, work plan acceptance, and the PO are all recorded", () => {
    for (const to of ["kickoff", "in_delivery"] as const) {
      const blocked = canTransition(record({ stage: "ra_staffing" }), to);
      expect(blocked.ok).toBe(false);
      expect(blocked.hardBlock).toMatch(/Broadcom approval of the FCP.*work plan acceptance and the Broadcom PO/);
      expect(canTransition(record({ stage: "ra_staffing", poReceivedOn: "2026-10-01" }), to).hardBlock).not.toMatch(/PO/);
      expect(canTransition(record({ stage: "ra_staffing", fcpBroadcomAcceptedOn: "2026-09-20", workPlanAcceptedOn: "2026-09-25", poReceivedOn: "2026-10-01" }), to).ok).toBe(true);
    }
  });

  it("asks Commercial for the customer's FCP approval and Corporate for Broadcom's", () => {
    const base = { stage: "ra_staffing" as const, workPlanAcceptedOn: "2026-09-25", poReceivedOn: "2026-10-01" };
    expect(canTransition(record({ ...base, segment: "commercial", fcpCustomerAcceptedOn: "2026-09-20" }), "kickoff").ok).toBe(true);
    expect(canTransition(record({ ...base, segment: "commercial", fcpBroadcomAcceptedOn: "2026-09-20" }), "kickoff").hardBlock).toMatch(/customer approval of the FCP/);
    expect(canTransition(record({ ...base, segment: "corporate", fcpCustomerAcceptedOn: "2026-09-20" }), "kickoff").hardBlock).toMatch(/Broadcom approval of the FCP/);
    expect(canTransition(record({ ...base, segment: "strategic", fcpBroadcomAcceptedOn: "2026-09-20" }), "kickoff").ok).toBe(true);
  });

  it("lets an FCP waiver stand in for FCP approval, never for the work plan or the PO", () => {
    expect(canTransition(record({ stage: "ra_staffing", fcpWaivedOn: "2026-09-20", workPlanAcceptedOn: "2026-09-25", poReceivedOn: "2026-10-01" }), "kickoff").ok).toBe(true);
    const waivedOnly = canTransition(record({ stage: "ra_staffing", fcpWaivedOn: "2026-09-20" }), "kickoff");
    expect(waivedOnly.hardBlock).not.toMatch(/FCP/);
    expect(waivedOnly.hardBlock).toMatch(/work plan acceptance and the Broadcom PO/);
    expect(deliveryRequirements(record({ fcpWaivedOn: "2026-09-20" }))[0]).toMatchObject({ key: "fcp_approval", met: true, waived: true });
  });

  it("lets staffing start early in every segment, with no gate", () => {
    for (const segment of ["corporate", "strategic", "commercial"] as const) {
      expect(canTransition(record({ stage: "fcp_draft", segment }), "ra_staffing")).toMatchObject({ ok: true, noteRequired: true });
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

  it("treats the source checklist as FCP Draft readiness, never as a stage", () => {
    const sourceItems = [
      { kind: "rvtools" as const, label: "RVTools export", required: true, status: "received" as const },
      { kind: "customer_brief" as const, label: "Customer brief", required: true, status: "needed" as const },
      { kind: "other" as const, label: "Nice to have", required: false, status: "needed" as const },
    ];
    expect(STAGES).not.toContain("source_chain");
    expect(nextStage(record({ stage: "discovery" }))).toBe("fcp_draft");
    // Leaving FCP Draft lists the open sources with the other gaps; it is never blocked by them.
    const leaving = canTransition(record({ stage: "fcp_draft", fcpSubmittedOn: "2026-10-01", sourceItems }), "broadcom_approval");
    expect(leaving).toMatchObject({ ok: true, noteRequired: false, warnings: ["Source not received: Customer brief"] });
    expect(stageWarnings(record({ stage: "fcp_draft", sourceItems }), "2026-10-15")).toContain("Source not received: Customer brief");
    expect(stageWarnings(record({ stage: "discovery", sourceItems }), "2026-10-15")).not.toContain("Source not received: Customer brief");
    expect(sourceChainComplete(sourceItems)).toBe(false);
    expect(sourceChainComplete(sourceItems.map(item => ({ ...item, status: "waived" as const })))).toBe(true);
  });
});

describe("customer approval and the work plan", () => {
  it("has two approvals, FCP and work plan, in every segment", () => {
    for (const segment of ["corporate", "strategic", "commercial"] as const) expect(customerApprovalItems(record({ segment })).workPlan).toBeDefined();
  });

  it("names the missing approval when leaving Customer Approval", () => {
    const leaving = (overrides: Partial<StageRecord>) => canTransition(record({ stage: "customer_approval", ...overrides }), "ra_staffing").warnings;
    expect(leaving({})).toEqual(["Customer FCP acceptance not recorded", "Work plan not sent"]);
    expect(leaving({ fcpCustomerAcceptedOn: "2026-10-01", workPlanSentOn: "2026-10-02" })).toEqual(["Work plan sent, not accepted"]);
    expect(leaving({ fcpCustomerAcceptedOn: "2026-10-01", workPlanSentOn: "2026-10-02", workPlanAcceptedOn: "2026-10-05" })).toEqual([]);
    expect(leaving({ segment: "commercial", fcpCustomerAcceptedOn: "2026-10-01" })).toEqual(["Work plan not sent"]);
  });

  it("warns about a work plan sent more than 14 days ago without acceptance", () => {
    const sent = record({ stage: "customer_approval", workPlanSentOn: "2026-10-01" });
    expect(stageWarnings(sent, "2026-10-15")).not.toContainEqual(expect.stringMatching(/Work plan/));
    expect(stageWarnings(sent, "2026-10-16")).toContainEqual(expect.stringMatching(/Work plan sent 2026-10-01/));
    expect(stageWarnings({ ...sent, segment: "commercial" }, "2026-11-30")).toContainEqual(expect.stringMatching(/Work plan sent 2026-10-01/));
  });
});

describe("record warnings and dates", () => {
  it("flags a missing segment and a delivery stage missing its delivery requirements", () => {
    expect(stageWarnings(record({ segment: null, stage: "in_delivery" }), "2026-10-15")).toEqual([
      "Segment not set",
      "In a delivery stage without Broadcom approval of the FCP (or an FCP waiver)",
      "In a delivery stage without the customer's work plan acceptance",
      "In a delivery stage without the Broadcom PO received date",
      "FCP trailing: Broadcom approval of the FCP is needed before delivery",
    ]);
    expect(stageWarnings(record({ stage: "in_delivery", fcpBroadcomAcceptedOn: "2026-09-20", workPlanAcceptedOn: "2026-09-25", poReceivedOn: "2026-10-01" }), "2026-10-15")).toEqual([]);
  });

  it("refuses stage dates before the current stage began or in the future", () => {
    expect(effectiveDateProblem("2026-10-05", "2026-10-05", "2026-10-15")).toBeNull();
    expect(effectiveDateProblem("2026-10-05", "2026-10-04", "2026-10-15")).toMatch(/before 2026-10-05/);
    expect(effectiveDateProblem("2026-10-05", "2026-10-16", "2026-10-15")).toMatch(/future/);
  });
});

describe("FCP trailing", () => {
  it("flags a record in staffing or later whose FCP is not approved: red for Corporate and Strategic, amber for Commercial", () => {
    expect(fcpTrailing(record({ stage: "customer_approval" }))).toBeNull();
    expect(fcpTrailing(record({ stage: "ra_staffing", segment: "corporate" }))).toMatchObject({ severity: "stop", gate: "fcpSubmittedOn" });
    expect(fcpTrailing(record({ stage: "ra_staffing", segment: "strategic", fcpSubmittedOn: "2026-09-01" }))).toMatchObject({ severity: "stop", gate: "fcpBroadcomAcceptedOn" });
    expect(fcpTrailing(record({ stage: "ra_staffing", segment: "commercial", fcpSubmittedOn: "2026-09-01" }))).toMatchObject({ severity: "warn", gate: "fcpCustomerAcceptedOn" });
    expect(fcpTrailing(record({ stage: "ra_staffing", segment: null }))?.severity).toBe("stop");
  });

  it("clears once the FCP is approved or waived, and never flags a closed record", () => {
    expect(fcpTrailing(record({ stage: "ra_staffing", fcpBroadcomAcceptedOn: "2026-09-20" }))).toBeNull();
    expect(fcpTrailing(record({ stage: "ra_staffing", segment: "commercial", fcpCustomerAcceptedOn: "2026-09-20" }))).toBeNull();
    expect(fcpTrailing(record({ stage: "ra_staffing", fcpWaivedOn: "2026-09-20" }))).toBeNull();
    for (const stage of ["complete", "lost", "refused", "paused"] as const) expect(fcpTrailing(record({ stage }))).toBeNull();
  });

  it("shows up in the record's warnings", () => {
    expect(stageWarnings(record({ stage: "ra_staffing", segment: "commercial" }), "2026-10-15")).toContain("FCP trailing: customer approval of the FCP not recorded");
  });
});

describe("PO / work authorization before the work plan", () => {
  it("flags a PO or work authorization recorded before the work plan is accepted", () => {
    expect(authorizationCheck(record({}))).toBeNull();
    expect(authorizationCheck(record({ poReceivedOn: "2026-10-01" }))?.key).toBe("po_before_work_plan");
    expect(authorizationCheck(record({ workAuthReceivedOn: "2026-10-01" }))?.key).toBe("po_before_work_plan");
  });

  it("compares hours once the work plan is accepted: a match clears it, a difference is an hours mismatch", () => {
    const early = { poReceivedOn: "2026-10-01", workPlanAcceptedOn: "2026-10-10" };
    expect(authorizationCheck(record(early))).toMatchObject({ key: "po_before_work_plan", label: expect.stringMatching(/record both hours/) });
    expect(authorizationCheck(record({ ...early, workPlanHours: 400, poHours: 400 }))).toBeNull();
    expect(authorizationCheck(record({ ...early, workPlanHours: 400, poHours: 360 }))).toMatchObject({ key: "hours_mismatch", label: "Hours mismatch: work plan 400, PO / work authorization 360" });
  });

  it("does not flag a PO received after the work plan was accepted", () => {
    expect(authorizationCheck(record({ workPlanAcceptedOn: "2026-10-01", poReceivedOn: "2026-10-05" }))).toBeNull();
  });
});
