import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../shared/fcp";
import { appendIndustryDiscoveryPrompts, getIndustryDiscoveryReviewContent, getIndustryDiscoveryTemplate, removeIndustryDiscoveryPrompts } from "../shared/industryDiscovery";

describe("industry discovery intake", () => {
  it("exposes the selected template's reviewable prompt cards and preserves non-empty confirmed scope when prompts are cleared", () => {
    const document = createDefaultDocument();
    const template = getIndustryDiscoveryTemplate("financial-services-insurance");
    const confirmedDetails = {
      ...document.fields.adoptionDetails,
      industryTemplate: template.id,
      operations: ["custom-dashboards"],
      automation: ["infrastructure-as-code"],
      notes: "Customer confirmed an operations owner and source-control integration.",
    };
    const confirmedPriorities = ["operations", "automation"] as const;
    const review = getIndustryDiscoveryReviewContent(confirmedDetails.industryTemplate);
    const promptedNotes = appendIndustryDiscoveryPrompts(confirmedDetails.notes, template.id);
    const clearedNotes = removeIndustryDiscoveryPrompts(promptedNotes, template.id);

    expect(review.template.label).toBe("Financial services and insurance");
    expect(review.promptItems).toHaveLength(5);
    expect(review.promptItems[0]).toMatchObject({
      ordinal: "01",
      theme: "Change and evidence",
      question: "Which platform changes need traceable approvals, operational evidence, or reporting for the customer’s governance process?",
    });
    expect(review.promptItems.map(item => item.id)).toEqual(template.questions.map(item => `${template.id}-${item.theme}`));
    expect(clearedNotes).toBe("Customer confirmed an operations owner and source-control integration.");
    expect(confirmedDetails.operations).toEqual(["custom-dashboards"]);
    expect(confirmedDetails.automation).toEqual(["infrastructure-as-code"]);
    expect(confirmedPriorities).toEqual(["operations", "automation"]);
  });
});
