import { describe, expect, it } from "vitest";
import { entitlementTotal, expiryRows, expiryVerdict, formatMoney, inRoleView, type ExpiryInput } from "../shared/vsaViews";

const record = (overrides: Partial<ExpiryInput>): ExpiryInput => ({
  id: 1,
  customerName: "Example Health",
  opportunityNumber: "C-OPP-1000001",
  stage: "in_delivery",
  segment: "corporate",
  deliveryWindowEnd: "2027-06-30",
  entitlementValue: "250000.00",
  entitlementGroupId: null,
  ...overrides,
});
const TODAY = "2026-10-16";

describe("expiry verdicts", () => {
  it("names expired, expiring within 90 days, in window, and missing dates", () => {
    expect(expiryVerdict("2026-10-15", TODAY)).toMatchObject({ pill: "stop", label: "Expired", daysLeft: -1 });
    expect(expiryVerdict("2027-01-14", TODAY)).toMatchObject({ pill: "warn", daysLeft: 90 });
    expect(expiryVerdict("2027-01-15", TODAY)).toMatchObject({ pill: "ready", daysLeft: 91 });
    expect(expiryVerdict(null, TODAY)).toMatchObject({ pill: "unknown", daysLeft: null });
  });
});

describe("entitlement counted once per group", () => {
  it("collapses alternative plans to one row and never sums their entitlement", () => {
    const rows = expiryRows([
      record({ id: 1, entitlementGroupId: 7, customerName: "Example Health" }),
      record({ id: 2, entitlementGroupId: 7, customerName: "Example Health", opportunityNumber: "C-OPP-1000002" }),
      record({ id: 3, customerName: "Second Co", entitlementValue: "100000.00" }),
    ], TODAY);
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.key === "group:7")).toMatchObject({ entitlementValue: "250000.00", records: [{ id: 1 }, { id: 2 }] });
    expect(entitlementTotal(rows)).toEqual({ total: 350000, missing: 0 });
  });

  it("reports siblings that disagree, showing the largest amount and the earliest expiry", () => {
    const [row] = expiryRows([
      record({ id: 1, entitlementGroupId: 7, entitlementValue: "250000.00", deliveryWindowEnd: "2027-06-30" }),
      record({ id: 2, entitlementGroupId: 7, entitlementValue: "200000.00", deliveryWindowEnd: "2027-03-31" }),
    ], TODAY);
    expect(row).toMatchObject({ entitlementValue: "250000.00", deliveryWindowEnd: "2027-03-31" });
    expect(row.notes).toEqual(expect.arrayContaining([expect.stringMatching(/different VSA amounts/), expect.stringMatching(/different expiry dates/)]));
  });

  it("leaves closed records out, sorts soonest first, and counts rows with no amount", () => {
    const rows = expiryRows([
      record({ id: 1, deliveryWindowEnd: null, entitlementValue: null }),
      record({ id: 2, deliveryWindowEnd: "2027-01-01" }),
      record({ id: 3, stage: "complete" }),
      record({ id: 4, stage: "lost" }),
    ], TODAY);
    expect(rows.map(row => row.records[0].id)).toEqual([2, 1]);
    expect(entitlementTotal(rows)).toEqual({ total: 250000, missing: 1 });
  });
});

describe("role views", () => {
  const assigned = { assignments: [{ role: "architect" as const, userId: 5 }, { role: "pm" as const, userId: 9 }] };
  it("shows records where the user holds one of the view's roles; leadership sees all", () => {
    expect(inRoleView(assigned, 5, "architect")).toBe(true);
    expect(inRoleView(assigned, 5, "pm")).toBe(false);
    expect(inRoleView(assigned, 9, "pm")).toBe(true);
    expect(inRoleView(assigned, 1, "leadership")).toBe(true);
    expect(inRoleView(assigned, 1, null)).toBe(true);
  });
});

describe("money", () => {
  it("uses double zeros", () => {
    expect(formatMoney("560")).toBe("$560.00");
    expect(formatMoney(null)).toBe("—");
  });
});
