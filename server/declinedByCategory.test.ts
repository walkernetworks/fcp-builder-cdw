import { describe, expect, it } from "vitest";
import { declinedInCategory } from "../shared/report";
import { renderSummaryFcpHtml } from "./fcpSummaryRenderer";
import { harborPointLogistics } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

const text = (html: string) => html.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("declined add-ons by category", () => {
  it("names only the declined items that belong to the category", () => {
    const declined = ["Kubernetes", "Private AI", "HCX", "vDefend"];
    expect(declinedInCategory(declined, "Modernize Cloud")).toEqual(["Kubernetes", "Private AI"]);
    expect(declinedInCategory(declined, "Modernize Security & Resilience")).toEqual(["vDefend"]);
    expect(declinedInCategory(declined, "Operations")).toEqual([]);
  });

  it("does not list Kubernetes and Private AI under Security & Resilience in the Summary", () => {
    const document = harborPointLogistics();
    const visible = text(renderSummaryFcpHtml("Harbor Point Logistics", document, { effort: scopedEffortForDocument(document, "2026-10-15"), today: "2026-10-15" }));
    expect(visible).toContain("Modernize Cloud: not requested (Kubernetes and Private AI)");
    expect(visible).toContain("Modernize Security & Resilience: not in this plan");
  });
});
