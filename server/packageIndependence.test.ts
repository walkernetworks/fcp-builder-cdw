import { describe, expect, it } from "vitest";
import { activityOwner, type EngagementDocument } from "../shared/fcp";
import { acmeHealth, acmeHealthReconciled, FIXTURE_TODAY, meridianHealth, riverbendHealth } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

// A package's hours come from its own drivers: adding or removing another package never changes them. Each package's
// whole-hour figure is footed to the column totals, so one hour of rounding is the most that can move.
const scope = (document: EngagementDocument) => new Map(scopedEffortForDocument(document, FIXTURE_TODAY).workPackages.map(row => [row.id, row.total + (row.followOn?.total ?? 0)] as const));

describe("package estimates are independent", () => {
  for (const [name, make] of [["Acme Health", acmeHealth], ["Acme Health reconciled", acmeHealthReconciled], ["Meridian Health", meridianHealth], ["Riverbend Health", riverbendHealth]] as const) {
    it(`${name}: removing any package leaves every other package's hours unchanged`, () => {
      const base = make();
      const reference = scope(base);
      const ids = base.adoptionTimeline.lanes.flatMap(lane => lane.bars).filter(bar => activityOwner(bar) === "cdw").map(bar => bar.id);
      expect(ids.length).toBeGreaterThan(5);
      for (const id of ids) {
        const document = structuredClone(base);
        for (const lane of document.adoptionTimeline.lanes) lane.bars = lane.bars.filter(bar => bar.id !== id);
        const after = scope(document);
        for (const [other, hours] of reference) {
          // The leftover filling package is the one place freed hours land, by design.
          if (other === id || other.startsWith(`${id}:`) || other === "bar-hours-fill") continue;
          expect(Math.abs((after.get(other) ?? 0) - hours), `removing ${id} moved ${other} from ${hours} to ${after.get(other) ?? 0}`).toBeLessThanOrEqual(1);
        }
      }
    });
  }
});
