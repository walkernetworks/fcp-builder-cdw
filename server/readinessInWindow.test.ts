import { describe, expect, it } from "vitest";
import { barWindow } from "../shared/buildingBlocks";
import { entitlementTermEnd, lateWorkPackages } from "../shared/effort";
import { buildAdoptionPlans, createDefaultDocument } from "../shared/fcp";
import { acmeHealth } from "./fixtures/fcpFixtures";
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

  it("overlaps the closing packages with the last months when the project starts late, instead of scheduling them after the term", () => {
    for (const plannedProjectStart of ["2027-01-04", "2027-03-01"]) {
      const document: any = acmeHealth();
      Object.assign(document.fields, { entitlementStart: "2026-08-01", entitlementEnd: "2027-07-31", plannedProjectStart });
      Object.assign(document.fields.adoptionDetails, { upgradePath: "in-place" });
      Object.assign(document.report.entitlement, { termStart: "2026-08-01", termEnd: "2027-07-31", hours: 277 });
      Object.assign(document, buildAdoptionPlans(document.fields, document.inventory));
      const effort = scopedEffortForDocument(document, "2026-11-20");
      // Optional add-on packages that genuinely cannot fit a five-month window stay flagged; the closing packages never are.
      const late = lateWorkPackages(effort).map(row => row.label);
      expect(late.filter(label => /VCF Management|Lifecycle|Handover/.test(label)), plannedProjectStart).toEqual([]);
      if (plannedProjectStart === "2027-01-04") expect(late).toEqual([]);
      const bars = document.adoptionTimeline.lanes.flatMap((lane: any) => lane.bars);
      for (const bar of bars.filter((item: any) => /^bar-(playbook-adoption-vcf-management|operations-lifecycle|platform-handover)$/.test(item.id))) {
        expect(barWindow(document.adoptionTimeline, bar)!.start <= "2027-07-31", `${bar.id} ${plannedProjectStart}`).toBe(true);
      }
    }
  });
});
