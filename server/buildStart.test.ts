import { describe, expect, it } from "vitest";
import { barWindow, buildStartWarning } from "../shared/buildingBlocks";
import { buildAdoptionPlans } from "../shared/fcp";
import { harborPointLogistics } from "./fixtures/fcpFixtures";

describe("build start", () => {
  it("starts the converge build on the planned implementation start, with the runbook written alongside the design", () => {
    const document = harborPointLogistics();
    const bars = document.adoptionTimeline.lanes.flatMap(lane => lane.bars);
    const byId = (id: string) => bars.find(bar => bar.id === id)!;
    expect(barWindow(document.adoptionTimeline, byId("bar-converge-management-domain"))?.start).toBe("2027-01-01");
    expect(byId("bar-playbook-design-converge-runbook").startCol).toBe(byId("bar-playbook-design-target-state").startCol);
    expect(buildStartWarning(document.fields, document.adoptionTimeline)).toBeNull();
  });

  it("names what holds the build back when it starts after the planned implementation start", () => {
    const document = harborPointLogistics();
    document.fields.plannedImplementationStart = "2026-12-01";
    const timeline = buildAdoptionPlans(document.fields, document.inventory).adoptionTimeline;
    const warning = buildStartWarning(document.fields, timeline);
    expect(warning).toContain("starts Jan 1, 2027, after the planned implementation start of Dec 1, 2026");
    expect(warning).toContain("“Management Domain Design”");
  });

  it("says nothing without a planned implementation start", () => {
    const document = harborPointLogistics();
    expect(buildStartWarning({ plannedImplementationStart: "" }, document.adoptionTimeline)).toBeNull();
  });
});
