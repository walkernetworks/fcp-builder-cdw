import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { assessBuildingBlocks, barWindow, BLOCK_CATEGORIES, BLOCK_DEPENDENCIES, BLOCK_STATUSES, BUILDING_BLOCKS } from "../shared/buildingBlocks";
import { createDefaultDocument, refreshDerivedDocument, type EngagementDocument } from "../shared/fcp";
import { buildingBlocksFilename, renderBuildingBlocksWorkbook } from "./buildingBlocksWorkbook";

/** A commercial greenfield plan with operations and DFW; `hoursModel` v1 draws the NSX overlay build for the DFW, v2 does not. */
function commercialPlan(hoursModel: "v1" | "v2" = "v1"): EngagementDocument {
  const document = createDefaultDocument();
  Object.assign(document.fields, {
    hoursModel,
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
    expect(assessment(plan, "Private AI Services")).toMatchObject({ status: "Out of Scope", projectedDates: "", requiredBy: [] });
    expect(assessment(plan, "VVF Core").status).toBe("Out of Scope");
  });

  it("names only real blocks as dependencies", () => {
    const areas = new Set(BUILDING_BLOCKS.map(block => block.area));
    for (const [area, requirements] of Object.entries(BLOCK_DEPENDENCIES)) {
      expect(areas.has(area), area).toBe(true);
      for (const dependency of requirements.flat()) expect(areas.has(dependency), `${area} -> ${dependency}`).toBe(true);
    }
  });

  it("includes every dependency of a planned block, transitively", () => {
    const plan = commercialPlan();
    const assessments = assessBuildingBlocks(plan, "2026-09-23");
    const byArea = new Map(assessments.map(item => [item.area, item]));
    for (const item of assessments.filter(candidate => candidate.status !== "Out of Scope")) {
      for (const requirement of BLOCK_DEPENDENCIES[item.area] ?? []) {
        expect(requirement.some(dependency => byArea.get(dependency)?.status !== "Out of Scope"), `${item.area} needs ${requirement.join(" or ")}`).toBe(true);
      }
    }
    // DFW is planned and the plan deploys NSX for it, but has no Edge work, so NSX Edge comes in as a dependency.
    expect(byArea.get("NSX Edge Connectivity")).toMatchObject({ status: "Planning", projectedDates: "", requiredBy: expect.arrayContaining(["Distributed Firewall (DFW)"]) });
    expect(byArea.get("NSX Overlay Networking")?.requiredBy).toEqual([]);
    // Blocks the plan covers directly are never marked as pulled in.
    expect(byArea.get("Site Readiness")?.requiredBy).toEqual([]);
  });

  it("pulls in NSX Overlay and Edge as DFW dependencies when the v2 plan draws no overlay build", () => {
    const assessments = assessBuildingBlocks(commercialPlan("v2"), "2026-09-23");
    const byArea = new Map(assessments.map(item => [item.area, item]));
    expect(byArea.get("NSX Overlay Networking")?.requiredBy).toEqual(expect.arrayContaining(["Distributed Firewall (DFW)"]));
    expect(byArea.get("NSX Edge Connectivity")?.status).not.toBe("Out of Scope");
  });

  it("satisfies an either-or dependency with a block the plan already covers", () => {
    const assessments = assessBuildingBlocks(commercialPlan(), "2026-09-23");
    expect(assessments.find(item => item.area === "VCF Management Domain")?.requiredBy).toEqual([]);
    expect(assessments.find(item => item.area === "VVF Core")?.status).toBe("Out of Scope");
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

    expect(rows.get("1")).toEqual({ A: "Category", B: "Category Start Date", C: "Block", D: "Status", E: "Projected Dates", F: "Dependencies", G: "Notes" });
    const body = Array.from(rows.entries()).filter(([rowNumber]) => rowNumber !== "1").map(([, row]) => row);
    expect(body).toHaveLength(BUILDING_BLOCKS.length);
    assessments.forEach((item, index) => {
      expect(body[index], item.area).toMatchObject({ A: item.category, C: item.area, D: item.status, E: item.projectedDates });
    });
    expect(body.find(row => row.C === "Solution License Management")?.F).toBe("VCF Management Domain or VVF Core");
    expect(body.find(row => row.C === "VCF Management Domain")?.F).toBe("Platform Design & Scope, Site Readiness");
    expect(body.find(row => row.C === "NSX Edge Connectivity")?.G).toMatch(/^Included as a dependency of .*Distributed Firewall \(DFW\)/);
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

  it("is a single-sheet workbook with a filter across all columns", () => {
    const files = unzipSync(renderBuildingBlocksWorkbook(commercialPlan()));
    const workbook = strFromU8(files["xl/workbook.xml"]);
    expect(Array.from(workbook.matchAll(/<sheet /g))).toHaveLength(1);
    expect(workbook).toContain('name="Building Blocks"');
    expect(strFromU8(files["xl/worksheets/sheet1.xml"])).toContain(`<autoFilter ref="A1:G${BUILDING_BLOCKS.length + 1}">`);
  });

  it("hides Out of Scope rows by default behind the Status filter", () => {
    const plan = commercialPlan();
    const sheet = strFromU8(unzipSync(renderBuildingBlocksWorkbook(plan, "2026-09-23"))["xl/worksheets/sheet1.xml"]);
    const assessments = assessBuildingBlocks(plan, "2026-09-23");
    expect(sheet).toContain('<filterColumn colId="3"><customFilters><customFilter operator="notEqual" val="Out of Scope"/></customFilters></filterColumn>');
    const hiddenRows = Array.from(sheet.matchAll(/<row r="(\d+)" hidden="1">/g), match => Number(match[1]));
    const outOfScopeRows = assessments.flatMap((item, index) => (item.status === "Out of Scope" ? [index + 2] : []));
    expect(outOfScopeRows.length).toBeGreaterThan(0);
    expect(hiddenRows).toEqual(outOfScopeRows);
  });

  it("names the download after the engagement", () => {
    expect(buildingBlocksFilename("  ACME / FCP: West  ")).toBe("ACME FCP West - Building Blocks.xlsx");
  });
});

describe("building blocks for a VVF plan", () => {
  it("covers VVF Core instead of the VCF management domain", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, { customerName: "Acme", customerSegment: "commercial", plannedProjectStart: "2026-06-01", plannedImplementationStart: "2026-06-01", entitlementStart: "2026-06-01", priorities: ["security"] });
    Object.assign(document.fields.adoptionDetails, { upgradePath: "greenfield", platformEdition: "vvf", principalStorage: "vsan", security: ["waf"] });
    const plan = refreshDerivedDocument(document, { forceRebuild: true });
    const byArea = new Map(assessBuildingBlocks(plan, "2026-09-23").map(item => [item.area, item]));
    expect(byArea.get("VVF Core")?.status).not.toBe("Out of Scope");
    expect(byArea.get("VVF Core")?.requiredBy).toEqual([]);
    expect(byArea.get("VCF Management Domain")?.requiredBy).toEqual([]);
    expect(byArea.get("AVI LB (Layer-7 WAF & Ingress Security)")?.status).not.toBe("Out of Scope");
    expect(byArea.get("Avi Load Balancer (App Ingress)")?.status).not.toBe("Out of Scope");
  });
});
