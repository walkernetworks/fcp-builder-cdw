import { describe, expect, it } from "vitest";
import { reconcileHours } from "../shared/reportFormat";
import { harborPointLogistics } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

const TODAY = "2026-10-15";

/** The converge-plus-import fixture the brief-to-plan changes are tested against (fake data only). */
describe("Harbor Point Logistics fixture", () => {
  for (const hours of [1000, 400]) {
    it(`imports the brief at ${hours} entitled hours`, () => {
      const document = harborPointLogistics(hours);
      expect(document.fields.customerName).toBe("Harbor Point Logistics");
      expect(document.fields.adoptionDetails.upgradePath).toBe("converge");
      expect(document.fields.plannedProjectStart).toBe("2026-11-09");
      expect(document.fields.plannedImplementationStart).toBe("2027-01-11");
      expect(document.report.entitlement.hours).toBe(hours);
      expect(document.report.entitlement.hoursConsumed).toBe(40);
      expect(document.fields.adoptionDetails.domains.map(domain => `${domain.kind}/${domain.pathway}/${domain.hosts}`)).toEqual([
        "management/converge/6",
        "workload/import/10",
        "workload/import/8",
      ]);
    });
  }

  for (const hours of [1000, 400]) {
    it(`fits by hours, not by the calendar, at ${hours} entitled hours`, () => {
      const document = harborPointLogistics(hours);
      const effort = scopedEffortForDocument(document, TODAY);
      // Nothing moves to the follow-on because of where the timeline put it.
      expect(effort.workPackages.filter(row => row.deferred === "after the entitlement window")).toEqual([]);
      expect(effort.internal.fit?.scopeMoves ?? []).toEqual([]);
      // The wanted outcome and every requested domain are funded in the window.
      const funded = (id: string) => effort.workPackages.find(row => row.id === id && !row.deferred && row.total > 0);
      for (const id of ["bar-operations-observability", "bar-converge-management-domain", "bar-import-domain-1", "bar-import-domain-2"]) expect(funded(id), id).toBeTruthy();
      // Delivered + planned + reserve = entitled.
      expect(reconcileHours(document, effort, TODAY)).toMatchObject({ entitled: hours, balanced: true });
    });
  }

  it("starts capability work once the converged management domain is accepted, alongside the imports", () => {
    const bars = harborPointLogistics().adoptionTimeline.lanes.flatMap(lane => lane.bars);
    const byId = (id: string) => bars.find(bar => bar.id === id)!;
    const observability = byId("bar-operations-observability");
    expect(observability.startCol).toBeGreaterThanOrEqual(byId("bar-converge-management-domain").endCol);
    expect(observability.startCol).toBeLessThan(byId("bar-import-domain-2").endCol);
    expect(observability.prerequisites).toContain("bar-converge-management-domain");
  });
});
