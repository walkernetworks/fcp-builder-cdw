import { describe, expect, it } from "vitest";
import { planBsasAllocation, planBuckets } from "../shared/planView";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { FCP_FIXTURES, FIXTURE_TODAY } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

const hours = (value: number) => Math.round(value).toLocaleString("en-US");

// The Plan section shows the buckets and the BSAS allocation before the FCP is rendered; they must be the figures it prints.
describe("plan view agrees with the printed FCP", () => {
  for (const fixture of FCP_FIXTURES) {
    it(`for ${fixture.title}`, () => {
      const document = fixture.build();
      const effort = scopedEffortForDocument(document, FIXTURE_TODAY);
      const html = renderCondensedFcpHtml(fixture.title, document, { effort, today: FIXTURE_TODAY });

      const printedBuckets = html.match(/<h3>Scope by Bucket<\/h3>.*?<\/table>/s)?.[0] ?? "";
      const buckets = planBuckets(document, effort);
      expect(buckets.length > 0).toBe(printedBuckets.length > 0);
      for (const bucket of buckets) expect(printedBuckets, bucket.name).toMatch(new RegExp(`<td>${bucket.name}</td><td>[^<]*</td><td class="num">${hours(bucket.hours)}</td>`));

      const bsas = planBsasAllocation(document, effort);
      if (bsas && bsas.rows.length) expect(html).toContain(`${hours(bsas.plannedHours)} are planned inside that window`);
      if (!bsas) expect(html).not.toMatch(/are planned inside that window/);
    });
  }

  it("covers the buckets and a BSAS allocation with follow-on work", () => {
    const views = FCP_FIXTURES.map(fixture => { const document = fixture.build(); const effort = scopedEffortForDocument(document, FIXTURE_TODAY); return { buckets: planBuckets(document, effort), bsas: planBsasAllocation(document, effort) }; });
    expect(views.filter(view => view.buckets.length).length).toBeGreaterThan(1);
    expect(views.some(view => (view.bsas?.rows.length ?? 0) > 0)).toBe(true);
  });
});
