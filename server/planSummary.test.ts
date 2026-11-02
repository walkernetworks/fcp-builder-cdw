import { describe, expect, it } from "vitest";
import { bringIntoEntitlement, setFollowOn } from "../client/src/lib/planEdits";
import { bringInPreview, laterReason, planSummary } from "../shared/planSummary";
import { acmeHealth, acmeHealthUnderFunded, harborPointLogistics } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

const TODAY = "2026-10-15";
const summaryOf = (document: ReturnType<typeof acmeHealth>) => planSummary(document, scopedEffortForDocument(document, TODAY), TODAY);

describe("plan summary", () => {
  it("says everything fits when nothing moves to year two", () => {
    const summary = summaryOf(harborPointLogistics(1000));
    expect(summary).toMatchObject({ entitled: 1000, delivered: 40, planned: 883, held: 77, status: "fits", headline: "Everything requested fits in this entitlement." });
    expect(summary.later).toEqual([]);
  });

  it("names how much moves to year two, and why, when the hours run out", () => {
    const summary = summaryOf(acmeHealth());
    expect(summary.status).toBe("moves");
    expect(summary.headline).toMatch(/^\d+ packages \([\d,]+ h\) move to year two; everything else fits\.$/);
    expect(summary.later.every(row => (row.followOn?.total ?? 0) > 0)).toBe(true);
    expect(summary.later.map(laterReason)).toContain("Did not fit the hours");
    expect(summary.delivered + summary.planned + summary.held).toBe(summary.entitled);
  });

  it("never shows a small entitlement as under-funded: what it cannot carry is year two", () => {
    const summary = summaryOf(acmeHealthUnderFunded());
    expect(summary.status).not.toBe("problem");
    expect(summary.problem).toBeNull();
    expect(summary.delivered + summary.planned + summary.held).toBe(summary.entitled);
  });

  it("says a package the planner moved was moved, not that it did not fit", () => {
    const document = setFollowOn(harborPointLogistics(1000), "bar-operations-observability", true);
    const row = summaryOf(document).later.find(item => item.id === "bar-operations-observability")!;
    expect(laterReason(row)).toBe("Moved to year two");
  });
});

describe("bring into this entitlement", () => {
  it("places the package ahead of the lower-priority work and shows what moves out to make room", () => {
    const document = acmeHealth();
    const before = scopedEffortForDocument(document, TODAY);
    expect(before.workPackages.find(row => row.id === "bar-operations-observability")?.deferred).toBeTruthy();
    const after = scopedEffortForDocument(bringIntoEntitlement(document, "bar-operations-observability"), TODAY);
    const preview = bringInPreview(before, after, "bar-operations-observability");
    expect(preview.fits).toBe(true);
    if (!preview.fits) return;
    expect(preview.movesOut.length).toBeGreaterThan(0);
    expect(preview.movesOut.every(item => item.hours > 0)).toBe(true);
    // Still whole packages, and still within the entitlement.
    expect(after.workPackages.every(row => !(row.total > 0 && (row.followOn?.total ?? 0) > 0))).toBe(true);
    expect(after.totals.total).toBeLessThanOrEqual(after.internal.fit!.fillableHours + 1);
  });

  it("says so when a package does not fit even ahead of everything after the foundation", () => {
    const document = acmeHealth();
    const before = scopedEffortForDocument(document, TODAY);
    const after = scopedEffortForDocument(bringIntoEntitlement(document, "bar-resilience-recovery-architecture"), TODAY);
    const preview = bringInPreview(before, after, "bar-resilience-recovery-architecture");
    expect(preview).toMatchObject({ fits: false });
    if (!preview.fits) expect(preview.reason).toMatch(/^It needs \d+ h, more than the entitlement has left/);
  });
});
