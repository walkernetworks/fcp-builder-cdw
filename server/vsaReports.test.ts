import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { PROPRIETARY_LEGEND, REPORT_PRESETS, reportConfigSchema, reportCsv, runReport, type ReportConfig, type ReportSource } from "../shared/vsaReports";
import { columnName, renderReportWorkbook, reportFilename } from "./reportWorkbook";

const TODAY = "2026-10-16";
let nextId = 1;
const row = (overrides: Partial<ReportSource> = {}): ReportSource => ({
  id: nextId++,
  customerName: "Example Health",
  opportunityNumber: "C-OPP-1000001",
  salesforceCustomerId: "10000001",
  serNumber: "SER1",
  segment: "corporate",
  region: "west",
  program: "entitlement",
  stage: "discovery",
  stageEnteredOn: "2026-10-01",
  entitlementValue: "100000.00",
  entitlementGroupId: null,
  deliveryWindowEnd: "2027-06-30",
  assignments: [],
  ...overrides,
}) as ReportSource;

const config = (overrides: Partial<ReportConfig> = {}): ReportConfig => reportConfigSchema.parse({ columns: ["customerName", "stage", "entitlementValue"], ...overrides });

describe("report filters", () => {
  const rows = [
    row({ customerName: "Alpha", segment: "corporate", entitlementValue: "50000.00", deliveryWindowEnd: "2026-12-01" }),
    row({ customerName: "Beta", segment: "commercial", entitlementValue: "250000.00", deliveryWindowEnd: "2027-03-01" }),
    row({ customerName: "Gamma", segment: null, entitlementValue: null, deliveryWindowEnd: null }),
    row({ customerName: "Delta", stage: "complete" }),
  ];
  const names = (overrides: Partial<ReportConfig>) => runReport(rows, config(overrides), TODAY).rows.map(r => r.customerName);

  it("leaves closed engagements out unless asked", () => {
    expect(names({})).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(names({ includeClosed: true })).toContain("Delta");
  });

  it("filters by value list, text, ranges, and emptiness", () => {
    expect(names({ filters: [{ field: "segment", op: "in", values: ["commercial", ""] }] })).toEqual(["Beta", "Gamma"]);
    expect(names({ filters: [{ field: "customerName", op: "contains", text: "ph" }] })).toEqual(["Alpha"]);
    expect(names({ filters: [{ field: "entitlementValue", op: "between", from: "100000", to: null }] })).toEqual(["Beta"]);
    expect(names({ filters: [{ field: "deliveryWindowEnd", op: "between", from: "2026-11-01", to: "2026-12-31" }] })).toEqual(["Alpha"]);
    expect(names({ filters: [{ field: "segment", op: "empty" }] })).toEqual(["Gamma"]);
    expect(names({ filters: [{ field: "missingData", op: "notEmpty" }] })).toEqual(["Gamma"]);
  });

  it("sorts with empty values last in either direction", () => {
    expect(names({ sort: { field: "entitlementValue", dir: "desc" } })).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(names({ sort: { field: "entitlementValue", dir: "asc" } })).toEqual(["Alpha", "Beta", "Gamma"]);
  });
});

describe("grouping and comparing", () => {
  it("keeps stages in pipeline order and puts Not set last", () => {
    const result = runReport([row({ stage: "fcp_draft" }), row({ stage: "intake" }), row({ stage: "discovery", segment: null })], config({ groupBy: "stage" }), TODAY);
    expect(result.groups!.map(group => group.label)).toEqual(["Intake", "Discovery", "FCP Draft"]);
    expect(runReport([row({ segment: null }), row({ segment: "commercial" })], config({ groupBy: "segment" }), TODAY).groups!.map(group => group.label)).toEqual(["Commercial", "Not set"]);
  });

  it("sums VSA amounts once per alternative-plan group, never per plan", () => {
    const rows = [row({ entitlementGroupId: 7, entitlementValue: "300000.00" }), row({ entitlementGroupId: 7, entitlementValue: "300000.00" }), row({ entitlementValue: "100000.00" })];
    const result = runReport(rows, config({ measures: [{ kind: "count", field: null }, { kind: "sum", field: "entitlementValue" }] }), TODAY);
    expect(result.totals).toEqual([3, 400000]);
  });

  it("builds a pivot of the first measure with row and column totals", () => {
    const rows = [
      row({ stage: "discovery", segment: "corporate" }),
      row({ stage: "discovery", segment: "commercial" }),
      row({ stage: "fcp_draft", segment: "corporate" }),
      row({ stage: "fcp_draft", segment: "corporate" }),
    ];
    const result = runReport(rows, config({ groupBy: "stage", compareBy: "segment" }), TODAY);
    expect(result.pivot!.columns.map(col => col.label)).toEqual(["Corporate", "Commercial"]);
    expect(result.pivot!.cells).toEqual([[1, 1], [2, null]]);
    expect(result.pivot!.columnTotals).toEqual([3, 1]);
    expect(result.groups!.map(group => group.values[0])).toEqual([2, 2]);
  });

  it("groups by a person from the assignments", () => {
    const rows = [row({ assignments: [{ role: "architect", displayName: "Kim Park", userId: null }] }), row()];
    expect(runReport(rows, config({ groupBy: "architect" }), TODAY).groups!.map(group => [group.label, group.values[0]])).toEqual([["Kim Park", 1], ["Not set", 1]]);
  });
});

describe("exports", () => {
  it("writes CSV with labels, escaping, double-zero money, and the legend", () => {
    const csv = reportCsv(runReport([row({ customerName: 'Acme, "West"' })], config(), TODAY), PROPRIETARY_LEGEND);
    expect(csv.split("\r\n")[0]).toBe("Customer,Stage,VSA amount");
    expect(csv).toContain('"Acme, ""West""",Discovery,"$100,000.00"');
    expect(csv.trim().endsWith(PROPRIETARY_LEGEND)).toBe(true);
  });

  it("writes an XLSX with typed cells, a summary sheet when grouped, and the legend", () => {
    const rows = [row({ customerName: "Alpha" }), row({ customerName: "Beta", segment: "commercial" })];
    const cfg = config({ columns: ["customerName", "entitlementValue", "deliveryWindowEnd"], groupBy: "segment", compareBy: "region" });
    const files = unzipSync(renderReportWorkbook(runReport(rows, cfg, TODAY), cfg, PROPRIETARY_LEGEND, TODAY));
    const workbook = strFromU8(files["xl/workbook.xml"]);
    expect(workbook).toContain('name="Report"');
    expect(workbook).toContain('name="Summary"');
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain('<c r="B2" s="4"><v>100000</v></c>'); // money as a number in the $ format
    expect(sheet).toMatch(/<c r="C2" s="3"><v>46568<\/v><\/c>/); // 2027-06-30 as an Excel date
    expect(sheet).toContain("Proprietary and confidential");
    expect(strFromU8(files["xl/worksheets/sheet2.xml"])).toContain("Proprietary and confidential");
  });

  it("names columns past Z and files safely", () => {
    expect([columnName(0), columnName(25), columnName(26), columnName(51), columnName(52)]).toEqual(["A", "Z", "AA", "AZ", "BA"]);
    expect(reportFilename("Pipeline / by stage!", TODAY, "xlsx")).toBe("Pipeline-by-stage-2026-10-16.xlsx");
  });
});

describe("presets", () => {
  it("are valid report configs", () => {
    for (const preset of REPORT_PRESETS) expect(reportConfigSchema.safeParse(preset.config).success, preset.id).toBe(true);
  });

  it("rejects unknown fields", () => {
    expect(reportConfigSchema.safeParse({ columns: ["notAField"] }).success).toBe(false);
  });
});
