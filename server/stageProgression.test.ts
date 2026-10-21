import { describe, expect, it } from "vitest";
import { GATE_DATES } from "../shared/vsaFields";
import { MAIN_STAGES, STAGE_GATES, stageProgression } from "../shared/vsaStage";

const gatesOf = (progression: ReturnType<typeof stageProgression>) => progression.steps.flatMap(step => step.gates.map(gate => gate.gate));

describe("stage progression", () => {
  it("puts every gate date under exactly one stage", () => {
    const placed = MAIN_STAGES.flatMap(stage => STAGE_GATES[stage]);
    expect([...placed].sort()).toEqual(GATE_DATES.map(gate => gate.key).sort());
  });

  it("shows Corporate and Strategic every stage and gate, and hides Broadcom Approval from Commercial", () => {
    const corporate = stageProgression({ stage: "fcp_draft", segment: "corporate" }, {});
    expect(corporate.steps.map(step => step.stage)).toContain("broadcom_approval");
    expect(gatesOf(corporate)).toHaveLength(GATE_DATES.length);
    const commercial = stageProgression({ stage: "fcp_draft", segment: "commercial" }, {});
    expect(commercial.steps.map(step => step.stage)).not.toContain("broadcom_approval");
    expect(gatesOf(commercial)).not.toEqual(expect.arrayContaining(["fcpBroadcomAcceptedOn"]));
    // The work plan applies to every segment.
    expect(gatesOf(commercial).filter(gate => gate.startsWith("workPlan"))).toEqual(["workPlanSentOn", "workPlanAcceptedOn"]);
    expect(gatesOf(commercial)).toHaveLength(GATE_DATES.length - 1);
    // An unset segment is treated as gated, like the transition rules.
    expect(gatesOf(stageProgression({ stage: "intake", segment: null }, {}))).toHaveLength(GATE_DATES.length);
  });

  it("marks earlier stages done, the current one current, and later ones upcoming", () => {
    const { steps } = stageProgression({ stage: "customer_approval", segment: "corporate" }, { serSubmittedOn: "2026-09-01" });
    const status = Object.fromEntries(steps.map(step => [step.stage, step.status]));
    expect(status).toMatchObject({ intake: "done", fcp_draft: "done", broadcom_approval: "done", customer_approval: "current", ra_staffing: "upcoming", complete: "upcoming" });
    expect(steps[0].gates[0]).toEqual({ gate: "serSubmittedOn", day: "2026-09-01", done: true, hard: false, planned: false, waived: false, ahead: false, trailing: false });
    expect(stageProgression({ stage: "complete", segment: "commercial" }, {}).steps.every(step => step.status === "done")).toBe(true);
  });

  it("marks the delivery requirements as hard gates for the segment, and the estimated close as a planned date", () => {
    const gates = stageProgression({ stage: "intake", segment: "corporate" }, {}).steps.flatMap(step => step.gates);
    expect(gates.filter(gate => gate.hard).map(gate => gate.gate)).toEqual(["fcpBroadcomAcceptedOn", "workPlanAcceptedOn", "poReceivedOn"]);
    const commercial = stageProgression({ stage: "intake", segment: "commercial" }, {}).steps.flatMap(step => step.gates);
    expect(commercial.filter(gate => gate.hard).map(gate => gate.gate)).toEqual(["fcpCustomerAcceptedOn", "workPlanAcceptedOn", "poReceivedOn"]);
    expect(gates.filter(gate => gate.planned).map(gate => gate.gate)).toEqual(["estimatedCloseOn"]);
  });

  it("places an exit where the record left the main line", () => {
    const lost = stageProgression({ stage: "lost", segment: "corporate", exitedFrom: "customer_approval" }, {});
    expect(lost.exit).toEqual({ stage: "lost", from: "customer_approval" });
    expect(lost.steps.find(step => step.stage === "customer_approval")?.status).toBe("current");
    expect(lost.next).toEqual({ kind: "closed", stage: "lost" });
    const paused = stageProgression({ stage: "paused", segment: "commercial", exitedFrom: "discovery" }, {});
    expect(paused.next).toEqual({ kind: "resume", stage: "discovery" });
    const unknown = stageProgression({ stage: "refused", segment: null }, {});
    expect(unknown.exit).toEqual({ stage: "refused", from: null });
    expect(unknown.steps.every(step => step.status === "upcoming")).toBe(true);
  });

  it("names the next action: the next gate, the PO that unblocks Kickoff, or the move", () => {
    expect(stageProgression({ stage: "intake", segment: "corporate" }, {}).next).toEqual({ kind: "record", gate: "serSubmittedOn", stage: "intake" });
    expect(stageProgression({ stage: "intake", segment: "corporate" }, { serSubmittedOn: "2026-10-01" }).next).toEqual({ kind: "move", stage: "broadcom_request" });
    expect(stageProgression({ stage: "discovery", segment: "corporate" }, {}).next).toEqual({ kind: "move", stage: "fcp_draft" });
    // RA / Staffing: the delivery requirements come first, because Kickoff can't start without them.
    const approved = { fcpSubmittedOn: "2026-09-01", fcpCustomerAcceptedOn: "2026-09-10" };
    expect(stageProgression({ stage: "ra_staffing", segment: "commercial" }, approved).next).toEqual({ kind: "unblock", gate: "workPlanAcceptedOn", stage: "kickoff", requirement: "work_plan" });
    expect(stageProgression({ stage: "ra_staffing", segment: "commercial" }, { ...approved, workPlanAcceptedOn: "2026-09-20" }).next).toEqual({ kind: "unblock", gate: "poReceivedOn", stage: "kickoff", requirement: "po" });
    expect(stageProgression({ stage: "ra_staffing", segment: "commercial" }, { ...approved, workPlanAcceptedOn: "2026-09-20", poReceivedOn: "2026-10-01" }).next).toEqual({ kind: "record", gate: "ikomOn", stage: "ra_staffing" });
    // A trailing FCP that was never submitted: submit it first.
    expect(stageProgression({ stage: "ra_staffing", segment: "corporate" }, {}).next).toEqual({ kind: "unblock", gate: "fcpSubmittedOn", stage: "kickoff", requirement: "fcp_approval" });
    // A waiver satisfies FCP approval.
    expect(stageProgression({ stage: "ra_staffing", segment: "corporate", fcpWaivedOn: "2026-09-01" }, {}).next).toMatchObject({ requirement: "work_plan" });
    // A record already in delivery without a PO is told so.
    expect(stageProgression({ stage: "in_delivery", segment: "commercial" }, { ...approved, workPlanAcceptedOn: "2026-09-20" }).next).toEqual({ kind: "unblock", gate: "poReceivedOn", stage: "in_delivery", requirement: "po" });
    // The planned estimated close never blocks: once the start and completion are in, it is time to move on.
    expect(stageProgression({ stage: "in_delivery", segment: "commercial" }, { ...approved, workPlanAcceptedOn: "2026-09-20", poReceivedOn: "2026-09-01", projectStartOn: "2026-09-10", completedOn: "2026-10-01" }).next).toEqual({ kind: "move", stage: "complete" });
    expect(stageProgression({ stage: "complete", segment: "commercial" }, {}).next).toEqual({ kind: "complete" });
  });

  it("marks gates recorded ahead of their stage, and FCP gates trailing behind it", () => {
    const { steps, trailing } = stageProgression({ stage: "ra_staffing", segment: "corporate" }, { fcpDraftCreatedOn: "2026-09-01", ckomOn: "2026-10-01" });
    const gate = (key: string) => steps.flatMap(step => step.gates).find(item => item.gate === key)!;
    expect(trailing).toMatchObject({ severity: "stop", gate: "fcpSubmittedOn" });
    expect(gate("ckomOn")).toMatchObject({ done: true, ahead: true });
    expect(gate("fcpSubmittedOn")).toMatchObject({ done: false, trailing: true });
    expect(gate("fcpBroadcomAcceptedOn")).toMatchObject({ trailing: true, hard: true });
    // Non-FCP gates left open in earlier stages are not "trailing".
    expect(gate("serSubmittedOn").trailing).toBe(false);
    expect(gate("fcpDraftCreatedOn").trailing).toBe(false);
  });

  it("shows the waived FCP approval gate as waived, not trailing", () => {
    const { steps, trailing, delivery } = stageProgression({ stage: "ra_staffing", segment: "commercial", fcpWaivedOn: "2026-09-15" }, {});
    const approval = steps.flatMap(step => step.gates).find(item => item.gate === "fcpCustomerAcceptedOn")!;
    expect(trailing).toBeNull();
    expect(approval).toMatchObject({ waived: true, trailing: false });
    expect(delivery.map(requirement => requirement.met)).toEqual([true, false, false]);
  });
});
