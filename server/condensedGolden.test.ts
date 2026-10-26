import { describe, expect, it } from "vitest";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { FCP_FIXTURES, FIXTURE_TODAY } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

// The customer-facing FCP for the four fake fixtures, byte for byte. A change to the report updates these files
// deliberately, in the same PR, with the reason in the PR body.
describe("condensed FCP golden files", () => {
  for (const fixture of FCP_FIXTURES) {
    it(`renders ${fixture.title} byte-identical to the golden copy`, async () => {
      const document = fixture.build();
      const html = renderCondensedFcpHtml(fixture.title, document, { effort: scopedEffortForDocument(document, FIXTURE_TODAY), today: FIXTURE_TODAY });
      expect(checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount, bsasOnly: document.fields.fundingSource === "bsas" })).toEqual([]);
      await expect(html).toMatchFileSnapshot(`./__golden__/condensed-${fixture.slug}.html`);
    });
  }

  it("covers each funding source", () => {
    const sources = FCP_FIXTURES.map(fixture => fixture.build().fields.fundingSource);
    expect(new Set(sources)).toEqual(new Set(["entitlement", "entitlement-bsas", "bsas"]));
  });
});
