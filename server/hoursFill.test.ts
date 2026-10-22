import { describe, expect, it } from "vitest";
import { unusedEntitlementHours, type ScopedEffort } from "../shared/effort";
import { createDefaultDocument, HOURS_FILL_BAR_ID, migrateDocument, refreshDerivedDocument, validateTimeline, type EngagementDocument, type MinimalFields } from "../shared/fcp";
import { hoursFillOptions } from "./hoursFill";
import { scopedEffortForDocument } from "./rateCard";

/** A greenfield VCF plan for a fake customer with a generous entitlement, so the scope leaves hours unused. */
function doc(entitlement = 900_000, patch: Partial<MinimalFields> = {}): EngagementDocument {
  const document = createDefaultDocument();
  Object.assign(document.fields, {
    customerName: "Acme Health", customerSegment: "commercial", entitlementAmount: entitlement, entitlementStart: "2027-01-04", plannedProjectStart: "2027-01-04", hoursModel: "v2",
    priorities: ["operations"],
    ...patch,
  });
  Object.assign(document.inventory, { hosts: 24, clusters: 2, vmCount: 300, datacenters: 1 });
  return refreshDerivedDocument(document);
}

const withFill = (document: EngagementDocument, enabled = true) => refreshDerivedDocument({ ...document, fields: { ...document.fields, hoursFill: { ...document.fields.hoursFill, enabled } } });
const planHours = (effort: ScopedEffort) => effort.workPackages.reduce((sum, row) => sum + row.total, 0);
const fillBar = (document: EngagementDocument) => document.adoptionTimeline.lanes.flatMap(lane => lane.bars).find(bar => bar.id === HOURS_FILL_BAR_ID);

describe("fully staffing the entitlement", () => {
  it("leaves hours unused when the scope is smaller than the entitlement", () => {
    expect(unusedEntitlementHours(scopedEffortForDocument(doc()))).toBeGreaterThan(100);
  });

  it("has no fill package until the planner turns it on", () => {
    const document = doc();
    expect(document.fields.hoursFill.enabled).toBe(false);
    expect(fillBar(document)).toBeUndefined();
  });

  it("takes up every unused hour after the reserve, in the depth bucket", () => {
    const before = scopedEffortForDocument(doc());
    const unused = unusedEntitlementHours(before)!;
    const document = withFill(doc());
    expect(fillBar(document)).toMatchObject({ endCol: document.adoptionTimeline.columns.length + 1 });
    expect(validateTimeline(document.adoptionTimeline)).toEqual([]);
    const effort = scopedEffortForDocument(document);
    const row = effort.workPackages.find(item => item.id === HOURS_FILL_BAR_ID)!;
    expect(row.total).toBe(unused);
    expect(row.architect + row.srConsultant + row.projectManager).toBe(row.total);
    expect(unusedEntitlementHours(effort)).toBe(0);
    expect(planHours(effort)).toBe(planHours(before) + unused);
    expect(effort.internal.fit!.buckets.E2).toBeCloseTo(before.internal.fit!.buckets.E2 + unused);
    expect(effort.internal.fit!.entitlementRemaining).toBe(0);
    // The reserve is still held back.
    expect(planHours(effort)).toBeLessThanOrEqual(effort.internal.fit!.entitlementHours - effort.internal.fit!.reserveHours);
  });

  it("never fills past the entitlement value when the signed hours are worth more", () => {
    const document = withFill(doc(150_000));
    document.report.entitlement = { ...document.report.entitlement, hours: 1500 };
    const effort = scopedEffortForDocument(document);
    expect(effort.workPackages.find(item => item.id === HOURS_FILL_BAR_ID)!.total).toBeGreaterThan(0);
    expect(effort.internal.cost!.ratio!).toBeLessThanOrEqual(1);
    expect(unusedEntitlementHours(effort)).toBe(0);
    expect(hoursFillOptions(document).unusedHours).toBeLessThan(1500 * 0.92 - planHours(scopedEffortForDocument({ ...document, fields: { ...document.fields, hoursFill: { ...document.fields.hoursFill, enabled: false } } })));
  });

  it("never shows more in the entitlement buckets than the work packages carry, after planner cuts", () => {
    const base = withFill(doc());
    const cut = scopedEffortForDocument(base).workPackages.find(row => row.total > 40 && row.id !== HOURS_FILL_BAR_ID)!;
    const document = { ...base, report: { ...base.report, workPackageHours: [{ id: cut.id, architect: 0, srConsultant: 0, projectManager: 0, placement: "auto" as const, owner: "auto" as const }] } };
    const effort = scopedEffortForDocument(document);
    const fit = effort.internal.fit!;
    expect(fit.buckets.E1 + fit.buckets.E2).toBeLessThanOrEqual(planHours(effort) + 1e-6);
    expect(planHours(effort)).toBe(Math.floor(fit.entitlementHours - fit.reserveHours));
  });

  it("keeps the hours the planner set on the package", () => {
    const document = withFill(doc());
    document.report.workPackageHours = [{ id: HOURS_FILL_BAR_ID, architect: 10, srConsultant: 20, projectManager: 5, placement: "auto", owner: "auto" }];
    const effort = scopedEffortForDocument(document);
    expect(effort.workPackages.find(item => item.id === HOURS_FILL_BAR_ID)!.total).toBe(35);
    expect(unusedEntitlementHours(effort)).toBeGreaterThan(0);
  });

  it("takes only the gap the squeeze leaves when the core does not fit", () => {
    const squeezed = scopedEffortForDocument(doc(40_000));
    const effort = scopedEffortForDocument(withFill(doc(40_000)));
    const fit = effort.internal.fit!;
    expect(effort.workPackages.find(item => item.id === HOURS_FILL_BAR_ID)!.total).toBe(unusedEntitlementHours(squeezed));
    expect(planHours(effort)).toBeLessThanOrEqual(Math.floor(fit.entitlementHours - fit.reserveHours));
    expect(fit.movedToFollowOn).toEqual(squeezed.internal.fit!.movedToFollowOn);
  });

  it("adds and removes the package on a hand-edited plan, and keeps where the planner moved it", () => {
    const manual: EngagementDocument = { ...doc(), planAuthority: "manual" };
    const added = withFill(manual);
    expect(added.planAuthority).toBe("manual");
    const lane = added.adoptionTimeline.lanes.find(item => item.bars.some(bar => bar.id === HOURS_FILL_BAR_ID))!;
    lane.bars[0] = { ...lane.bars[0], startCol: 2, label: "Advisory hours" };
    const reloaded = migrateDocument(JSON.parse(JSON.stringify(added)));
    expect(fillBar(reloaded)).toMatchObject({ startCol: 2, label: "Advisory hours" });
    const removed = withFill(reloaded, false);
    expect(fillBar(removed)).toBeUndefined();
    expect(removed.adoptionTimeline.lanes.length).toBe(manual.adoptionTimeline.lanes.length);
  });

  it("lists scope that fits the unused hours, each priced as a whole plan", () => {
    const document = doc();
    const result = hoursFillOptions(document);
    expect(result.unusedHours).toBe(unusedEntitlementHours(scopedEffortForDocument(document)));
    expect(result.options.length).toBeGreaterThan(0);
    for (const option of result.options) expect(option.hours).toBeLessThanOrEqual(result.unusedHours!);
    const [first] = result.options;
    const applied = refreshDerivedDocument({ ...document, fields: { ...document.fields, ...first.patch } });
    expect(Math.round(planHours(scopedEffortForDocument(applied)) - planHours(scopedEffortForDocument(document)))).toBe(first.hours);
  });

  it("prices the options without the fill package taking the hours first", () => {
    expect(hoursFillOptions(withFill(doc())).unusedHours).toBe(hoursFillOptions(doc()).unusedHours);
  });
});
