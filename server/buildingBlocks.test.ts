import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { assessBuildingBlocks, barWindow, BUILDING_BLOCKS } from "../shared/buildingBlocks";
import { createDefaultDocument, refreshDerivedDocument, type EngagementDocument } from "../shared/fcp";
import { buildingBlocksFilename, renderBuildingBlocksWorkbook } from "./buildingBlocksWorkbook";

function commercialPlan(): EngagementDocument {
  const document = createDefaultDocument();
  Object.assign(document.fields, {
    customerName: "Acme",
    customerSegment: "commercial",
    plannedProjectStart: "2026-06-01",
    plannedImplementationStart: "2026-08-01",
    entitlementStart: "2026-06-01",
    entitlementEnd: "2027-06-01",
    priorities: ["operations", "security"],
  });
  const details = document.fields.adoptionDetails;
  details.upgradePath = "greenfield";
  details.principalStorage = "vsan";
  details.operations = ["lifecycle", "observability"];
  details.security = ["segmentation"];
  return refreshDerivedDocument(document, { forceRebuild: true });
}

function assessment(document: EngagementDocument, area: string, today = "2026-09-23") {
  const result = assessBuildingBlocks(document, today).find(item => item.area === area);
  if (!result) throw new Error(`No assessment for ${area}`);
  return result;
}

function outputRows(workbook: Uint8Array): Map<string, Record<string, string>> {
  const files = unzipSync(workbook);
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const rows = new Map<string, Record<string, string>>();
  for (const row of sheet.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const values: Record<string, string> = {};
    for (const cell of row[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const body = cell[3] ?? "";
      values[cell[1]] = (body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "").replace(/&amp;/g, "&");
    }
    rows.set(row[1], values);
  }
  return rows;
}

describe("building blocks assessment", () => {
  it("rates explicitly planned blocks Strongly Agree and unplanned blocks out of scope", () => {
    const plan = commercialPlan();
    expect(assessment(plan, "Distributed Firewall (DFW)")).toMatchObject({ rating: "Strongly Agree", deliverable: "Planning/TBD" });
    expect(assessment(plan, "vSAN ESA Implementation").rating).toBe("Strongly Agree");
    expect(assessment(plan, "Private AI Services")).toMatchObject({ rating: "*Out of Scope", deliverable: "Out of Scope", projectedDates: "" });
  });

  it("rates depth-only design work Mostly Agree", () => {
    expect(assessment(commercialPlan(), "Assess & Review (VCF Operations)").rating).toBe("Mostly Agree");
  });

  it("rates blocks that only appear in the two-year notional Mostly Disagree", () => {
    const plan = commercialPlan();
    plan.twoYearPlan.lanes[0].bars.push({ id: "bar-1767225600000-abcde", startCol: 18, endCol: 20, color: "blue", label: "Pilot Data Services Manager catalog", milestone: false, deferred: false });
    expect(assessment(plan, "Data Services Manager (DSM)")).toMatchObject({ rating: "Mostly Disagree", deliverable: "Planning/TBD" });
  });

  it("derives deliverable status from the projected window and today", () => {
    const plan = commercialPlan();
    const workshop = assessment(plan, "Assess & Review Workshop", "2026-06-15");
    expect(workshop.deliverable).toBe("In Progress");
    expect(assessment(plan, "Assess & Review Workshop", "2026-06-01").deliverable).toBe("In Progress");
    expect(assessment(plan, "Assess & Review Workshop", "2026-05-31").deliverable).toBe("Planning/TBD");
    expect(assessment(plan, "Assess & Review Workshop", "2030-01-01").deliverable).toBe("Completed");
    expect(workshop.projectedStart).toBe("2026-06-01");
    expect(workshop.projectedDates).toMatch(/^Jun 1, 2026 – /);
  });

  it("converts monthly and weekly columns to inclusive dates", () => {
    const monthly = { cadence: "month" as const, startDate: "2026-10-15", columns: ["a", "b", "c"], lanes: [] };
    expect(barWindow(monthly, { startCol: 1, endCol: 2 })).toEqual({ start: "2026-10-15", end: "2026-10-31" });
    expect(barWindow(monthly, { startCol: 2, endCol: 4 })).toEqual({ start: "2026-11-01", end: "2026-12-31" });
    const weekly = { ...monthly, cadence: "week" as const };
    expect(barWindow(weekly, { startCol: 2, endCol: 4 })).toEqual({ start: "2026-10-22", end: "2026-11-04" });
  });
});

describe("building blocks workbook", () => {
  it("outputs only Block, Category, Assessment Area, Capability Rating, Customer Deliverables, and Projected Dates", () => {
    const plan = commercialPlan();
    const rows = outputRows(renderBuildingBlocksWorkbook(plan, "2026-09-23"));
    const assessments = assessBuildingBlocks(plan, "2026-09-23");

    expect(rows.get("1")).toEqual({ A: "Block", B: "Category", C: "Assessment Area", D: "Capability Rating", E: "Customer Deliverables", F: "Projected Dates" });
    const body = Array.from(rows.entries()).filter(([rowNumber]) => rowNumber !== "1").map(([, row]) => row);
    expect(body).toHaveLength(BUILDING_BLOCKS.length);
    expect(body.every(row => Object.keys(row).every(column => "ABCDEF".includes(column)))).toBe(true);
    expect(body.every(row => row.A && row.B && row.C)).toBe(true);
    expect(body[0]).toMatchObject({ A: "1", B: "Platform Foundation", C: "Assess & Review Workshop" });
    // Categories are merged in the template; every output row carries its own.
    expect(body[1]).toMatchObject({ B: "Platform Foundation", C: "Site Readiness Validation" });
    for (const item of assessments) {
      const row = body.find(candidate => candidate.C === item.area);
      expect(row, item.area).toMatchObject({ D: item.rating, E: item.deliverable });
      expect(row?.F ?? "").toBe(item.projectedDates);
    }
  });

  it("is a single-sheet workbook with a filter across the six columns", () => {
    const files = unzipSync(renderBuildingBlocksWorkbook(commercialPlan()));
    const workbook = strFromU8(files["xl/workbook.xml"]);
    expect(Array.from(workbook.matchAll(/<sheet /g))).toHaveLength(1);
    expect(workbook).toContain('name="Building Blocks"');
    expect(files["xl/sharedStrings.xml"]).toBeUndefined();
    expect(strFromU8(files["xl/worksheets/sheet1.xml"])).toContain(`<autoFilter ref="A1:F${BUILDING_BLOCKS.length + 1}"/>`);
  });

  it("names the download after the engagement", () => {
    expect(buildingBlocksFilename("  ACME / FCP: West  ")).toBe("ACME-FCP-West-Building-Blocks.xlsx");
  });
});
