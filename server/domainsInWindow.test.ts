import { describe, expect, it } from "vitest";
import { applyCustomerBrief } from "../shared/briefImport";
import { barWindow } from "../shared/buildingBlocks";
import { createDefaultDocument, refreshDerivedDocument, type EngagementDocument } from "../shared/fcp";
import { harborPointLogistics } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

const TODAY = "2026-10-15";
const DOMAIN_IDS = ["bar-converge-management-domain", "bar-import-domain-1", "bar-import-domain-2"];

/** Harbor Point with an entitlement that ends a month earlier, so the last import would fall after it. */
function shortTerm(edit: (document: EngagementDocument) => void = () => {}): EngagementDocument {
  const document = harborPointLogistics();
  document.fields.entitlementStart = "2026-03-20";
  document.report.entitlement.termStart = "2026-03-20";
  document.report.entitlement.termEnd = "2027-03-19";
  edit(document);
  return refreshDerivedDocument(document);
}

describe("requested domains stay in the window", () => {
  it("keeps every requested domain inside a shorter entitlement, funded", () => {
    const document = shortTerm();
    const termEnd = document.report.entitlement.termEnd!;
    const bars = document.adoptionTimeline.lanes.flatMap(lane => lane.bars);
    for (const id of DOMAIN_IDS) {
      const bar = bars.find(item => item.id === id);
      expect(bar, id).toBeTruthy();
      expect(barWindow(document.adoptionTimeline, bar!)!.start <= termEnd, id).toBe(true);
    }
    const effort = scopedEffortForDocument(document, TODAY);
    for (const id of DOMAIN_IDS) expect(effort.workPackages.find(row => row.id === id)?.deferred, id).toBeUndefined();
  });

  it("moves a domain the customer wants later to follow-on with its hours", () => {
    const document = shortTerm(edit => { edit.fields.adoptionDetails.domains[2].deferred = true; });
    const effort = scopedEffortForDocument(document, TODAY);
    const later = effort.workPackages.find(row => row.id === "bar-import-domain-2")!;
    expect(later.deferred).toBe("planned for later");
    expect(later.total).toBe(0);
    expect(later.followOn!.total).toBeGreaterThan(0);
    expect(effort.workPackages.find(row => row.id === "bar-import-domain-1")?.deferred).toBeUndefined();
  });

  it("imports the deferred flag on domain rows", () => {
    const brief = { discovery: { domains: [
      { name: "Management", kind: "management", pathway: "converge", hosts: 4 },
      { name: "Later", kind: "workload", pathway: "import", hosts: 6, deferred: true },
      { name: "Now", kind: "workload", pathway: "import", hosts: 6, deferred: null },
    ] } };
    const { fields } = applyCustomerBrief(createDefaultDocument(), brief).document;
    expect(fields.adoptionDetails.domains.map(domain => domain.deferred)).toEqual([false, true, false]);
  });
});
