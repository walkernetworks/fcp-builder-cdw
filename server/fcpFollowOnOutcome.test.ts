import { describe, expect, it } from "vitest";
import { LATER_DESIGN_PHASE } from "../shared/effort";
import type { EngagementDocument } from "../shared/fcp";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { acmeHealth, FIXTURE_TODAY, meridianHealth } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

const render = (document: EngagementDocument, format: "summary" | "standard") =>
  renderCondensedFcpHtml(document.fields.customerName, document, { effort: scopedEffortForDocument(document, FIXTURE_TODAY), today: FIXTURE_TODAY, format, version: { issueNumber: 1, issuedOn: FIXTURE_TODAY } });
const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

/** A plan that funds the foundation design but not the later phase (workload domain, DR and NSX overlay design). */
function phasedDesign(): EngagementDocument {
  for (let hours = 120; hours <= 600; hours += 5) {
    const document = acmeHealth();
    document.fields.estimateInputs.smallEstate = "no";
    document.fields.estimateInputs.workloadDomains = 1;
    document.report.entitlement.hours = hours;
    const fit = scopedEffortForDocument(document, FIXTURE_TODAY).internal.fit;
    if (fit?.designPhased && !fit.underFunded) return document;
  }
  throw new Error("no entitlement phases the design");
}

describe("the follow-on table prints each package's outcome", () => {
  it("prints the later design phase's outcome and acceptance, in the Summary's page 3", () => {
    const document = phasedDesign();
    for (const format of ["summary"] as const) {
      const text = visible(render(document, format));
      expect(text, format).toContain(LATER_DESIGN_PHASE.label);
      expect(text, format).toContain(LATER_DESIGN_PHASE.outcome.split(/(?<=\.)\s/)[0]);
      expect(text, format).toContain("Accepted when:");
    }
  });

  it("prints the outcome of the other follow-on packages too", () => {
    const document = meridianHealth();
    const effort = scopedEffortForDocument(document, FIXTURE_TODAY);
    const rows = effort.workPackages.filter(row => !row.id.includes(":") && (row.followOn?.total ?? 0) > 0 && row.detail?.outcome);
    expect(rows.length).toBeGreaterThan(0);
    const text = visible(render(document, "summary"));
    for (const row of rows) expect(text, row.id).toContain(row.detail!.outcome.split(/(?<=\.)\s/)[0].replace(/\.$/, ""));
  });
});
