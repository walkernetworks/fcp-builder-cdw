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

function fullVersionRows(workbook: Uint8Array): Map<string, Record<string, string>> {
  const files = unzipSync(workbook);
  const sheet = strFromU8(files["xl/worksheets/sheet2.xml"]);
  const shared = Array.from(strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g), match => Array.from(match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g), text => text[1]).join("").replace(/&amp;/g, "&"));
  const rows = new Map<string, Record<string, string>>();
  for (const row of sheet.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const values: Record<string, string> = {};
    for (const cell of row[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const body = cell[3] ?? "";
      values[cell[1]] = /t="s"/.test(cell[2]) ? shared[Number(body.match(/<v>(\d+)<\/v>/)?.[1])] : (body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "").replace(/&amp;/g, "&");
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
  it("fills columns D and E and adds projected dates on the Full Version tab", () => {
    const plan = commercialPlan();
    const rows = fullVersionRows(renderBuildingBlocksWorkbook(plan, "2026-09-23"));
    const assessments = assessBuildingBlocks(plan, "2026-09-23");

    expect(rows.get("1")).toMatchObject({ D: "Capability Rating", E: "Customer Deliverables", L: "Projected Dates" });
    const filled = Array.from(rows.values()).filter(row => row.C && row.D && rows.get("1") !== row);
    expect(filled).toHaveLength(BUILDING_BLOCKS.length);
    for (const item of assessments) {
      const row = filled.find(candidate => candidate.C.replace(/\s+/g, " ").trim() === item.area);
      expect(row, item.area).toMatchObject({ D: item.rating, E: item.deliverable });
      expect(row?.L ?? "").toBe(item.projectedDates);
    }
  });

  it("keeps the other template tabs and extends the filter to the new column", () => {
    const files = unzipSync(renderBuildingBlocksWorkbook(commercialPlan()));
    expect(strFromU8(files["xl/workbook.xml"])).toContain('name="Lite Version"');
    expect(strFromU8(files["xl/worksheets/sheet2.xml"])).toContain('<autoFilter ref="A1:L50"');
  });

  it("names the download after the engagement", () => {
    expect(buildingBlocksFilename("  ACME / FCP: West  ")).toBe("ACME-FCP-West-Building-Blocks.xlsx");
  });
});
