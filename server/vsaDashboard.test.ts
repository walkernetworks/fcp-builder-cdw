import { describe, expect, it } from "vitest";
import { awaitingAction, dataQualityFlags, expiryBand, expiryBandTotals, expiryByMonth, fteForPace, inQueue, requiredWeeklyPace, stageCounts, staleness, type DashboardRecord } from "../shared/vsaDashboard";
import { expiryRows } from "../shared/vsaViews";

const TODAY = "2026-10-16";
const ME = 7;

function record(overrides: Partial<DashboardRecord> = {}): DashboardRecord {
  return {
    id: 1,
    customerName: "Example Co",
    opportunityNumber: "C-OPP-1234567",
    stage: "fcp_draft",
    stageEnteredOn: "2026-10-01",
    segment: "corporate",
    waitingOn: null,
    entitlementValue: "100000.00",
    deliveryWindowEnd: "2027-03-31",
    assignments: [{ role: "architect", userId: ME }],
    ...overrides,
  };
}

describe("awaiting my action", () => {
  it("is the stage owner's move unless the customer or Broadcom holds it", () => {
    expect(awaitingAction(record(), ME)).toBe(true);
    expect(awaitingAction(record({ waitingOn: "customer" }), ME)).toBe(false);
    expect(awaitingAction(record({ waitingOn: "broadcom" }), ME)).toBe(false);
    expect(awaitingAction(record({ stage: "ra_staffing" }), ME)).toBe(false);
    expect(awaitingAction(record({ stage: "paused" }), ME)).toBe(false);
  });

  it("goes to sales when the record says it is waiting on sales", () => {
    const rep = record({ waitingOn: "sales", assignments: [{ role: "sales_rep", userId: ME }] });
    expect(awaitingAction(rep, ME)).toBe(true);
    expect(awaitingAction(record({ waitingOn: "sales" }), ME)).toBe(false);
  });
});

describe("staleness", () => {
  it("compares days in stage with the stage's threshold; delivery has none", () => {
    expect(staleness(record({ stageEnteredOn: "2026-09-20" }), TODAY)).toEqual({ days: 26, threshold: 21, stale: true });
    expect(staleness(record({ stageEnteredOn: "2026-10-10" }), TODAY).stale).toBe(false);
    expect(staleness(record({ stage: "in_delivery", stageEnteredOn: "2025-01-01" }), TODAY)).toMatchObject({ threshold: null, stale: false });
  });
});

describe("data-quality flags", () => {
  it("flags missing classification, placeholder opportunity numbers, amounts, dates, and architects", () => {
    expect(dataQualityFlags(record())).toEqual([]);
    const flags = dataQualityFlags(record({ segment: null, opportunityNumber: "AWC-OPP-0001", entitlementValue: null, deliveryWindowEnd: null, assignments: [] }));
    expect(flags.map(flag => flag.key)).toEqual(["segment", "placeholder_opportunity", "amount", "expiry", "architect"]);
  });

  it("flags a PO / work authorization ahead of the work plan, and an hours mismatch, as data quality", () => {
    expect(dataQualityFlags(record({ poReceivedOn: "2026-10-01" })).map(flag => flag.key)).toEqual(["po_before_work_plan"]);
    expect(dataQualityFlags(record({ poReceivedOn: "2026-10-01", workPlanAcceptedOn: "2026-10-05", workPlanHours: 200, poHours: 240 })).map(flag => flag.key)).toEqual(["hours_mismatch"]);
    expect(dataQualityFlags(record({ poReceivedOn: "2026-10-01", workPlanAcceptedOn: "2026-10-05", workPlanHours: 200, poHours: 200 }))).toEqual([]);
    expect(dataQualityFlags(record({ stage: "complete", poReceivedOn: "2026-10-01" }))).toEqual([]);
  });

  it("does not ask for an architect before discovery, or flag closed records", () => {
    expect(dataQualityFlags(record({ stage: "intake", assignments: [] }))).toEqual([]);
    expect(dataQualityFlags(record({ stage: "lost", segment: null }))).toEqual([]);
  });
});

describe("expiry bands", () => {
  it("bands days left, and totals each entitlement once", () => {
    expect([-1, 0, 30, 31, 90, 91, 181, null].map(expiryBand)).toEqual(["expired", "d30", "d30", "d60", "d90", "d180", "later", "none"]);
    const rows = expiryRows([
      { id: 1, customerName: "A", opportunityNumber: null, stage: "fcp_draft", segment: null, deliveryWindowEnd: "2026-11-01", entitlementValue: "50000.00", entitlementGroupId: 9 },
      { id: 2, customerName: "A", opportunityNumber: null, stage: "discovery", segment: null, deliveryWindowEnd: "2026-11-01", entitlementValue: "50000.00", entitlementGroupId: 9 },
      { id: 3, customerName: "B", opportunityNumber: null, stage: "discovery", segment: null, deliveryWindowEnd: null, entitlementValue: null, entitlementGroupId: null },
    ], TODAY);
    const totals = expiryBandTotals(rows);
    expect(totals.find(band => band.key === "d30")).toMatchObject({ count: 1, amount: 50000 });
    expect(totals.find(band => band.key === "none")).toMatchObject({ count: 1, amount: 0 });
    const months = expiryByMonth(rows, TODAY, 3);
    expect(months.map(month => month.key)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(months[1]).toMatchObject({ count: 1, amount: 50000 });
  });
});

describe("stage counts and queues", () => {
  it("counts open stages in order, with Paused last", () => {
    const counts = stageCounts([record(), record({ stage: "paused" }), record({ stage: "complete" })]);
    expect(counts[0].stage).toBe("intake");
    expect(counts.at(-1)).toEqual({ stage: "paused", count: 1 });
    expect(counts.find(item => item.stage === "fcp_draft")?.count).toBe(1);
    expect(counts.some(item => item.stage === "complete")).toBe(false);
  });

  it("matches role queues on assignments and never shows closed records", () => {
    const never = () => false;
    expect(inQueue(record(), "architect", ME, never)).toBe(true);
    expect(inQueue(record(), "pm", ME, never)).toBe(false);
    expect(inQueue(record(), "assigned", ME, never)).toBe(true);
    expect(inQueue(record({ stage: "complete" }), "assigned", ME, never)).toBe(false);
    expect(inQueue(record(), "attention", ME, () => true)).toBe(true);
  });
});

describe("hours burndown math", () => {
  it("spreads remaining hours over the weeks left, and is empty without hours", () => {
    expect(requiredWeeklyPace(400, 70)).toBe(40);
    expect(fteForPace(requiredWeeklyPace(400, 70))).toBe(1);
    expect(requiredWeeklyPace(null, 70)).toBeNull();
    expect(requiredWeeklyPace(400, -3)).toBeNull();
    expect(requiredWeeklyPace(100, 3)).toBe(100);
  });
});
