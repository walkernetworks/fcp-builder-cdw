import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { assessBuildingBlocks, barWindow, BLOCK_CATEGORIES, BLOCK_STATUSES, BUILDING_BLOCKS } from "../shared/buildingBlocks";
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
  it("covers every block the Building Blocks tool lists, in its category order", () => {
    const assessments = assessBuildingBlocks(commercialPlan(), "2026-09-23");
    expect(assessments).toHaveLength(48);
    expect(Array.from(new Set(assessments.map(item => item.category)))).toEqual([...BLOCK_CATEGORIES]);
    expect(assessments.filter(item => item.category === "Discovery & Assessment").map(item => item.area)).toEqual([
      "Scoping & Environment Assessment",
      "Deployment Posture Assessment",
      "Site Readiness",
      "Migration Execution Readiness",
    ]);
    expect(assessments.every(item => (BLOCK_STATUSES as readonly string[]).includes(item.status))).toBe(true);
  });

  it("marks planned blocks from their projected window and unplanned blocks Out of Scope", () => {
    const plan = commercialPlan();
    expect(assessment(plan, "Distributed Firewall (DFW)").status).toBe("Planning");
    expect(assessment(plan, "vSAN ESA Implementation").status).not.toBe("Out of Scope");
    expect(assessment(plan, "VCF Workload Domain").status).not.toBe("Out of Scope");
    expect(assessment(plan, "Private AI Services")).toMatchObject({ status: "Out of Scope", projectedDates: "" });
    expect(assessment(plan, "VVF Core").status).toBe("Out of Scope");
  });

  it("uses depth-only design work for the Design & Scope blocks", () => {
    expect(assessment(commercialPlan(), "Operations Design & Scope").status).not.toBe("Out of Scope");
  });

  it("falls back to the two-year notional for blocks not in the entitlement timeline", () => {
    const plan = commercialPlan();
    plan.twoYearPlan.lanes[0].bars.push({ id: "bar-1767225600000-abcde", startCol: 18, endCol: 20, color: "blue", label: "Pilot Data Services Manager catalog", milestone: false, deferred: false });
    expect(assessment(plan, "Data Services Manager (DSM)")).toMatchObject({ status: "Planning", projectedStart: "2027-11-01" });
  });

  it("splits cyber recovery hand-added activities between on-prem and cloud", () => {
    const plan = commercialPlan();
    plan.adoptionTimeline.lanes[0].bars.push({ id: "bar-1767225600000-cloud", startCol: 3, endCol: 4, color: "blue", label: "Cyber Recovery to cloud vault", milestone: false, deferred: false });
    expect(assessment(plan, "Cyber Recovery (Cloud)").status).not.toBe("Out of Scope");
    expect(assessment(plan, "Cyber Recovery (On Prem)").status).toBe("Out of Scope");
  });

  it("derives status from the projected window and today", () => {
    const plan = commercialPlan();
    const scoping = assessment(plan, "Scoping & Environment Assessment", "2026-06-15");
    expect(scoping.status).toBe("In Progress");
    expect(assessment(plan, "Scoping & Environment Assessment", "2026-06-01").status).toBe("In Progress");
    expect(assessment(plan, "Scoping & Environment Assessment", "2026-05-31").status).toBe("Planning");
    expect(assessment(plan, "Scoping & Environment Assessment", "2030-01-01").status).toBe("Completed");
    expect(scoping.projectedStart).toBe("2026-06-01");
    expect(scoping.projectedDates).toMatch(/^Jun 1, 2026 – /);
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
  it("outputs Category, Category Start Date, Block, Status, and Projected Dates for every block", () => {
    const plan = commercialPlan();
    const rows = outputRows(renderBuildingBlocksWorkbook(plan, "2026-09-23"));
    const assessments = assessBuildingBlocks(plan, "2026-09-23");

    expect(rows.get("1")).toEqual({ A: "Category", B: "Category Start Date", C: "Block", D: "Status", E: "Projected Dates" });
    const body = Array.from(rows.entries()).filter(([rowNumber]) => rowNumber !== "1").map(([, row]) => row);
    expect(body).toHaveLength(BUILDING_BLOCKS.length);
    assessments.forEach((item, index) => {
      expect(body[index], item.area).toMatchObject({ A: item.category, C: item.area, D: item.status, E: item.projectedDates });
    });
  });

  it("gives every row its category's earliest projected start as an Excel date", () => {
    const plan = commercialPlan();
    const rows = Array.from(outputRows(renderBuildingBlocksWorkbook(plan, "2026-09-23")).values()).slice(1);
    const discovery = rows.filter(row => row.A === "Discovery & Assessment");
    // 2026-06-01 is Excel serial 46174.
    expect(new Set(discovery.map(row => row.B))).toEqual(new Set(["46174"]));
    const aiOnly = rows.filter(row => row.A === "Apps & Cloud Consumption");
    expect(aiOnly.every(row => row.B === aiOnly[0].B)).toBe(true);
  });

  it("is a single-sheet workbook with a filter across the five columns", () => {
    const files = unzipSync(renderBuildingBlocksWorkbook(commercialPlan()));
    const workbook = strFromU8(files["xl/workbook.xml"]);
    expect(Array.from(workbook.matchAll(/<sheet /g))).toHaveLength(1);
    expect(workbook).toContain('name="Building Blocks"');
    expect(strFromU8(files["xl/worksheets/sheet1.xml"])).toContain(`<autoFilter ref="A1:E${BUILDING_BLOCKS.length + 1}"/>`);
  });

  it("names the download after the engagement", () => {
    expect(buildingBlocksFilename("  ACME / FCP: West  ")).toBe("ACME-FCP-West-Building-Blocks.xlsx");
  });
});
