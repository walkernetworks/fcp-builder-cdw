import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyCustomerBrief } from "../shared/briefImport";
import { createDefaultDocument, migrateDocument, refreshDerivedDocument, validateTimeline, type CustomerSegment, type EngagementDocument, type PlatformEdition, type Timeline, type UpgradePath } from "../shared/fcp";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { FCP_FIXTURES, FIXTURE_TODAY } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

// The plan inputs (Commercial plan, platform edition) are explicit FCP fields. Documents saved before they existed
// derive them once from the segment that drove the plan then, so no saved plan or customer document changes.

/** A document as it was saved before `commercialPlan` existed: the segment drove the plan, and VVF was ignored off Commercial. */
function legacy(document: EngagementDocument): Record<string, any> {
  const raw = JSON.parse(JSON.stringify(document));
  delete raw.fields.commercialPlan;
  return raw;
}

function saved(segment: CustomerSegment, edition: PlatformEdition, upgradePath: UpgradePath): EngagementDocument {
  const document = createDefaultDocument();
  Object.assign(document.fields, {
    customerName: "Acme Health",
    customerSegment: segment,
    // What the old rule did: the segment decided Commercial behavior.
    commercialPlan: segment === "commercial",
    entitlementAmount: 400_000,
    plannedProjectStart: "2026-06-01",
    plannedImplementationStart: "2026-08-03",
    entitlementStart: "2026-06-01",
    priorities: ["operations", "automation", "networking"],
  });
  // The stored edition is kept as saved, even VVF on a segment that ignored it.
  document.fields.adoptionDetails = { ...document.fields.adoptionDetails, platformEdition: edition, upgradePath };
  Object.assign(document.inventory, { hosts: 16, clusters: 2, vmCount: 240, datacenters: 1 });
  return refreshDerivedDocument(document, { forceRebuild: true });
}

function positions(timeline: Timeline) {
  return timeline.lanes.flatMap(lane => lane.bars.map(bar => `${lane.id}/${bar.id}:${bar.start}-${bar.end}:${bar.label}`));
}

function render(document: EngagementDocument) {
  return renderCondensedFcpHtml("Acme Health", document, { effort: scopedEffortForDocument(document, FIXTURE_TODAY), today: FIXTURE_TODAY });
}

describe("explicit plan inputs on older documents", () => {
  it("derives Commercial and the edition once, from the segment that drove the plan", () => {
    const cases: Array<[CustomerSegment | "public-sector", PlatformEdition, boolean, PlatformEdition]> = [
      ["commercial", "vvf", true, "vvf"],
      ["commercial", "vcf", true, "vcf"],
      ["corporate", "vvf", false, "vcf"],
      ["public-sector", "vvf", false, "vcf"],
      ["unspecified", "vvf", false, "vcf"],
      ["unspecified", "vcf", false, "vcf"],
    ];
    for (const [segment, edition, commercialPlan, platformEdition] of cases) {
      const raw = legacy(saved("unspecified", edition, "greenfield"));
      raw.fields.customerSegment = segment;
      const migrated = migrateDocument(raw);
      expect([segment, migrated.fields.commercialPlan, migrated.fields.adoptionDetails.platformEdition]).toEqual([segment, commercialPlan, platformEdition]);
    }
  });

  it("never reads the segment again once the plan inputs are set", () => {
    const corporatePlanOnCommercialSegment = JSON.parse(JSON.stringify(saved("commercial", "vcf", "greenfield")));
    corporatePlanOnCommercialSegment.fields.commercialPlan = false;
    expect(migrateDocument(corporatePlanOnCommercialSegment).fields.commercialPlan).toBe(false);
    const commercialPlanOnCorporateSegment = JSON.parse(JSON.stringify(saved("corporate", "vcf", "greenfield")));
    commercialPlanOnCorporateSegment.fields.commercialPlan = true;
    expect(migrateDocument(commercialPlanOnCorporateSegment).fields.commercialPlan).toBe(true);
  });

  it("keeps every generated and hand-edited plan unchanged", () => {
    let compared = 0;
    for (const segment of ["commercial", "corporate", "unspecified"] as const) {
      for (const edition of ["vcf", "vvf"] as const) {
        for (const upgradePath of ["greenfield", "in-place", "converge", "design-only"] as const) {
          const document = saved(segment, edition, upgradePath);
          const manual = structuredClone(document);
          manual.planAuthority = "manual";
          const bar = manual.adoptionTimeline.lanes.flatMap(lane => lane.bars).at(-1)!;
          Object.assign(bar, { label: "Hand-named activity", start: Math.max(1, bar.start - 1) });
          for (const stored of [document, manual]) {
            const before = migrateDocument(JSON.parse(JSON.stringify(stored)));
            const after = migrateDocument(legacy(stored));
            expect(positions(after.adoptionTimeline)).toEqual(positions(before.adoptionTimeline));
            expect(positions(after.twoYearPlan)).toEqual(positions(before.twoYearPlan));
            expect(after.rationale).toEqual(before.rationale);
            expect({ ...after.readiness, generatedAt: "" }).toEqual({ ...before.readiness, generatedAt: "" });
            expect(validateTimeline(after.adoptionTimeline)).toEqual(validateTimeline(before.adoptionTimeline));
            expect(render(after)).toBe(render(before));
            compared += 1;
          }
        }
      }
    }
    expect(compared).toBe(48);
  });

  it("renders every golden fixture byte-identical when saved without the plan inputs", () => {
    for (const fixture of FCP_FIXTURES) {
      const document = migrateDocument(legacy(fixture.build()));
      const html = renderCondensedFcpHtml(fixture.title, document, { effort: scopedEffortForDocument(document, FIXTURE_TODAY), today: FIXTURE_TODAY });
      expect(html, fixture.slug).toBe(readFileSync(path.join(import.meta.dirname, "__golden__", `condensed-${fixture.slug}.html`), "utf8"));
    }
  });
});

describe("plan inputs from a customer brief", () => {
  const brief = () => JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../docs/examples/customer-brief.example.json"), "utf8"));

  it("builds a Commercial plan when the brief states a Commercial segment", () => {
    const { document } = applyCustomerBrief(createDefaultDocument(), brief());
    expect(document.fields.commercialPlan).toBe(true);
  });

  it("plans VCF when the brief asks for VVF on a non-Commercial segment, and says so", () => {
    const raw = brief();
    raw.customer.segment = "Corporate";
    raw.discovery.platformEdition = "vvf";
    const result = applyCustomerBrief(createDefaultDocument(), raw);
    expect(result.document.fields.commercialPlan).toBe(false);
    expect(result.document.fields.adoptionDetails.platformEdition).toBe("vcf");
    expect(result.warnings.some(warning => warning.startsWith("discovery.platformEdition"))).toBe(true);
  });

  it("keeps the plan type when the brief states no segment", () => {
    const raw = brief();
    delete raw.customer.segment;
    const start = createDefaultDocument();
    start.fields.commercialPlan = true;
    expect(applyCustomerBrief(start, raw).document.fields.commercialPlan).toBe(true);
  });
});

describe("tracker segment and plan type", () => {
  it("reads a stored plan type the way migrateDocument derives it", async () => {
    const { storedCommercialPlan } = await import("../shared/fcpRecord");
    expect(storedCommercialPlan(true, "corporate")).toBe(true);
    expect(storedCommercialPlan(false, "commercial")).toBe(false);
    expect(storedCommercialPlan(null, "commercial")).toBe(true);
    expect(storedCommercialPlan(undefined, "corporate")).toBe(false);
    expect(storedCommercialPlan(undefined, null)).toBe(false);
  });

  it("disagrees only when a set tracker segment and the plan type point different ways", async () => {
    const { segmentDisagrees } = await import("../shared/fcpRecord");
    expect(segmentDisagrees(null, true)).toBe(false);
    expect(segmentDisagrees("commercial", true)).toBe(false);
    expect(segmentDisagrees("corporate", false)).toBe(false);
    expect(segmentDisagrees("strategic", false)).toBe(false);
    expect(segmentDisagrees("strategic", true)).toBe(true);
    expect(segmentDisagrees("corporate", true)).toBe(true);
    expect(segmentDisagrees("commercial", false)).toBe(true);
  });

  it("fills only empty tracker segments from the FCP, and never writes the FCP", () => {
    const sql = readFileSync(path.resolve(import.meta.dirname, "../drizzle/0009_fill_empty_tracker_segment.sql"), "utf8").replace(/^--.*$/gm, "");
    const statements = sql.split(";").map(part => part.trim()).filter(Boolean);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^UPDATE `engagements`\s+SET `segment` = /);
    expect(statements[0]).toMatch(/WHERE `segment` IS NULL\s+AND /);
    // Only the tracker segment is written: no JSON write into the document, and nothing removed.
    expect(statements[0]).not.toMatch(/`data`\s*=|JSON_SET|JSON_REPLACE|JSON_INSERT|JSON_REMOVE|^\s*(DELETE|INSERT)/im);
  });
});
