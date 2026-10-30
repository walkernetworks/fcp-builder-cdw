import { describe, expect, it } from "vitest";
import { harborPointLogistics } from "./fixtures/fcpFixtures";

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
});
