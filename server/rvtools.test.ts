import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseRvToolsFiles } from "../client/src/lib/rvtools";

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function columnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function worksheet(rows: string[][]): string {
  const encodedRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, cellIndex) => `<c r="${columnName(cellIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${encodedRows}</sheetData></worksheet>`;
}

function rvToolsWorkbook(host: string, vm: string): Uint8Array {
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="vInfo" sheetId="1" r:id="rId1"/><sheet name="vHost" sheetId="2" r:id="rId2"/><sheet name="vDisk" sheetId="3" r:id="rId3"/></sheets></workbook>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/></Relationships>`;
  const vInfo = worksheet([
    ["VM", "OS according to the configuration file", "HW Version"],
    [vm, "Microsoft Windows Server 2022", "vmx-20"],
  ]);
  const vHost = worksheet([
    ["Host", "# Cores", "Datacenter", "Cluster", "Vendor", "Model", "CPU Model", "ESX Version", "# CPU", "Cores per CPU"],
    [host, "32", "Primary", "Compute", "Dell Inc.", "PowerEdge R760", "Intel Xeon", "8.0.2", "2", "16"],
  ]);

  return zipSync({
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(relationships),
    "xl/worksheets/sheet1.xml": strToU8(vInfo),
    "xl/worksheets/sheet2.xml": strToU8(vHost),
    // If the parser starts eagerly reading unrelated workbook tabs again, this invalid XML will surface as a failure.
    "xl/worksheets/sheet3.xml": strToU8("<not-a-valid-rvtools-sheet"),
  });
}

function workbookFile(name: string, host: string, vm: string): File {
  return new File([rvToolsWorkbook(host, vm)], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("RVTools workbook import", () => {
  it("imports multiple RVTools-style XLSX files while selectively reading only assessment-relevant worksheets", async () => {
    const result = await parseRvToolsFiles([
      workbookFile("Franklin_Park.xlsx", "franklin-esx-01", "franklin-app-01"),
      workbookFile("Ashburn.xlsx", "ashburn-esx-01", "ashburn-app-01"),
    ]);

    expect(result.sources.map(source => source.filename)).toEqual(["Franklin_Park.xlsx", "Ashburn.xlsx"]);
    expect(result.sources.every(source => source.sheets.includes("vInfo") && source.sheets.includes("vHost"))).toBe(true);
    expect(result.sources.every(source => !source.sheets.includes("vDisk"))).toBe(true);
    expect(result.summary.hosts).toBe(2);
    expect(result.summary.vmCount).toBe(2);
    expect(result.summary.physicalCores).toBe(64);
    expect(result.summary.hclEvidence.hosts.map(host => host.name)).toEqual(["franklin-esx-01", "ashburn-esx-01"]);
    expect(result.summary.hclEvidence.vmInfo.map(vmInfo => vmInfo.vm)).toEqual(["franklin-app-01", "ashburn-app-01"]);
  });
});
