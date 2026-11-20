import { describe, expect, it } from "vitest";
import { barWindow } from "../shared/buildingBlocks";
import { entitlementTermEnd, lateWorkPackages } from "../shared/effort";
import { buildAdoptionPlans, createDefaultDocument } from "../shared/fcp";
import { scopedEffortForDocument } from "./rateCard";

describe("packages that run to the entitlement end start inside the window", () => {
  it("keeps Operating Model, Skills, and Runbooks in a short window even when design runs past it", () => {
    const document: any = createDefaultDocument();
    Object.assign(document.fields, { entitlementAmount: 90529, entitlementStart: "2026-11-01", entitlementEnd: "2026-12-31" });
    Object.assign(document.report.entitlement, { termStart: "2026-11-01", termEnd: "2026-12-31" });
    Object.assign(document, buildAdoptionPlans(document.fields, document.inventory));
    const effort = scopedEffortForDocument(document, "2026-11-20");
    expect(lateWorkPackages(effort)).toEqual([]);
    const termEnd = entitlementTermEnd(document)!;
    const lanes = document.adoptionTimeline.lanes.flatMap((lane: any) => lane.bars.map((bar: any) => ({ lane, bar })));
    for (const id of ["bar-platform-operating-readiness", "bar-platform-design-authority", "bar-platform-execution-decision"]) {
      const found = lanes.find(({ bar }: any) => bar.id === id);
      if (found) expect(barWindow(document.adoptionTimeline, found.bar)!.start <= termEnd).toBe(true);
    }
  });
});
