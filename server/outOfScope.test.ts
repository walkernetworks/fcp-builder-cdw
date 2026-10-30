import { describe, expect, it } from "vitest";
import { applyCustomerBrief } from "../shared/briefImport";
import { createDefaultDocument, refreshDerivedDocument } from "../shared/fcp";
import { harborPointLogistics } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

const TODAY = "2026-10-15";
const briefWith = (patch: (discovery: Record<string, unknown>) => void) => {
  const brief = JSON.parse(JSON.stringify({ discovery: { outcomesWanted: { operations: ["observability", "capacity-cost"] }, addOnsConsidered: ["vcf-automation"] } }));
  patch(brief.discovery);
  const base = createDefaultDocument();
  base.fields.priorities = [];
  return applyCustomerBrief(base, brief);
};

describe("out of scope", () => {
  it("drops an outcome from the plan and keeps the rest of its area", () => {
    const result = briefWith(discovery => { discovery.outOfScope = ["capacity-cost"]; });
    expect(result.document.fields.adoptionDetails.operations).toEqual(["observability"]);
    expect(result.document.fields.priorities).toContain("operations");
    expect(result.document.report.declined).toContain("capacity-cost");
  });

  it("drops a considered add-on from the follow-on too, unlike considering it", () => {
    const considered = briefWith(() => {});
    expect(considered.document.fields.adoptionDetails.followOnOnly).toContain("automation");
    const ruledOut = briefWith(discovery => { discovery.outOfScope = ["VCF Automation"]; });
    expect(ruledOut.document.fields.adoptionDetails.followOnOnly).not.toContain("automation");
    expect(ruledOut.document.fields.priorities).not.toContain("automation");
    expect(ruledOut.document.fields.adoptionDetails.automation).toEqual([]);
  });

  it("accepts the outOfScopeThisTerm spelling and warns on a name it does not know", () => {
    const result = briefWith(discovery => { discovery.outOfScopeThisTerm = ["observability", "Mainframe offload"]; });
    expect(result.document.fields.adoptionDetails.operations).toEqual(["capacity-cost"]);
    expect(result.warnings).toContain('discovery.outOfScopeThisTerm: "Mainframe offload" is not a recognized add-on or outcome; ignored');
  });

  it("leaves no hours for it in the plan or the follow-on", () => {
    const document = harborPointLogistics();
    expect(scopedEffortForDocument(document, TODAY).workPackages.some(row => row.id === "bar-operations-observability")).toBe(true);
    document.fields.adoptionDetails.operations = [];
    document.fields.priorities = document.fields.priorities.filter(capability => capability !== "operations");
    const effort = scopedEffortForDocument(refreshDerivedDocument(document), TODAY);
    expect(effort.workPackages.some(row => row.id === "bar-operations-observability")).toBe(false);
  });
});
