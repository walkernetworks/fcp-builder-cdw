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
    ["vInfoVMName", "vInfoPowerstate", "vInfoCPUs", "vInfoMemory", "vInfoOS", "VInfoVersion", "vInfoObjectID", "vInfoUUID", "vInfoDataCenter", "vInfoCluster"],
    [vm, "poweredOn", "4", "8192", "Microsoft Windows Server 2022", "vmx-20", `vm-${host}`, `uuid-${host}`, "Primary", "Compute"],
  ]);
  const vHost = worksheet([
    ["vHostName", "vHostDatacenter", "vHostCluster", "vHostNumCpuCores", "vHostVendor", "vHostModel", "vHostCpuModel", "vHostFullName", "vHostNumCpu", "vHostCoresPerCPU"],
    [host, "Primary", "Compute", "32", "Dell Inc.", "PowerEdge R760", "Intel Xeon", "VMware ESXi 8.0.2 build-22380479", "2", "16"],
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
    expect(result.summary.poweredOnVms).toBe(2);
    expect(result.summary.vCpu).toBe(8);
    expect(result.summary.vmMemoryGiB).toBe(16);
    expect(result.summary.esxiVersions).toEqual([{ version: "VMware ESXi 8.0.2 build-22380479", hosts: 2 }]);
    expect(result.summary.hclEvidence.hosts.map(host => host.name)).toEqual(["franklin-esx-01", "ashburn-esx-01"]);
    expect(result.summary.hclEvidence.hosts.map(host => host.esxiVersion)).toEqual(["VMware ESXi 8.0.2 build-22380479", "VMware ESXi 8.0.2 build-22380479"]);
    expect(result.summary.hclEvidence.vmInfo.map(vmInfo => vmInfo.vm)).toEqual(["franklin-app-01", "ashburn-app-01"]);
  });

  it("reads workbooks written with namespace-prefixed SpreadsheetML tags", async () => {
    const prefixed = (xml: string) => xml
      .replace(/<(\/?)(workbook|sheets|sheet|worksheet|sheetData|row|c|is|t)\b/g, "<$1x:$2")
      .replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"');
    const workbook = prefixed(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="vHost" sheetId="2" r:id="rId2" /></sheets></workbook>`);
    const relationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" Id="rId2" /></Relationships>`;
    const vHost = prefixed(worksheet([
      ["vHostName", "vHostNumCpuCores", "vHostCpuModel"],
      ["prefixed-esx-01", "24", "Intel Xeon"],
    ]));
    const file = new File([zipSync({
      "xl/workbook.xml": strToU8(workbook),
      "xl/_rels/workbook.xml.rels": strToU8(relationships),
      "xl/worksheets/sheet1.xml": strToU8(vHost),
    })], "Prefixed.xlsx");

    const result = await parseRvToolsFiles([file]);

    expect(result.sources[0].sheets).toEqual(["vHost"]);
    expect(result.sources[0].warnings).not.toContain("vHost data missing; host and core totals may be incomplete.");
    expect(result.summary.hosts).toBe(1);
    expect(result.summary.physicalCores).toBe(24);
  });

  it("skips nested ESXi hosts that report a VMware Virtual Processor CPU, and the VMs placed on them", async () => {
    const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="vHost" sheetId="1" r:id="rId1"/><sheet name="vNIC" sheetId="2" r:id="rId2"/><sheet name="vInfo" sheetId="3" r:id="rId3"/><sheet name="vTools" sheetId="4" r:id="rId4"/></sheets></workbook>`;
    const relationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Target="worksheets/sheet4.xml"/></Relationships>`;
    const vHost = worksheet([
      ["vHostName", "vHostNumCpuCores", "vHostVendor", "vHostModel", "vHostCpuModel"],
      ["physical-esx-01", "32", "Dell Inc.", "PowerEdge R760", "Intel(R) Xeon(R) Gold 6430"],
      ["nested-esx-01", "8", "VMware, Inc.", "VMware7,1", "VMware Virtual Processor"],
    ]);
    const vNic = worksheet([
      ["Host", "Network Device", "Driver"],
      ["physical-esx-01", "vmnic0", "i40en"],
      ["nested-esx-01", "vmnic0", "nvmxnet3"],
    ]);
    const vInfo = worksheet([
      ["VM", "Host", "Powerstate", "CPUs", "Memory"],
      ["app-01", "physical-esx-01", "poweredOn", "4", "8192"],
      ["nested-vm-01", "nested-esx-01", "poweredOn", "2", "4096"],
    ]);
    const vTools = worksheet([
      ["VM", "Tools Status"],
      ["app-01", "toolsOk"],
      ["nested-vm-01", "toolsNotInstalled"],
    ]);
    const file = new File([zipSync({
      "xl/workbook.xml": strToU8(workbook),
      "xl/_rels/workbook.xml.rels": strToU8(relationships),
      "xl/worksheets/sheet1.xml": strToU8(vHost),
      "xl/worksheets/sheet2.xml": strToU8(vNic),
      "xl/worksheets/sheet3.xml": strToU8(vInfo),
      "xl/worksheets/sheet4.xml": strToU8(vTools),
    })], "Nested.xlsx");

    const result = await parseRvToolsFiles([file]);

    expect(result.summary.hosts).toBe(1);
    expect(result.summary.physicalCores).toBe(32);
    expect(result.summary.hostModels.map(model => model.cpuModel)).toEqual(["Intel(R) Xeon(R) Gold 6430"]);
    expect(result.summary.hclEvidence.hosts.map(host => host.name)).toEqual(["physical-esx-01"]);
    expect(result.summary.hclEvidence.nics.map(nic => nic.host)).toEqual(["physical-esx-01"]);
    expect(result.summary.vmCount).toBe(1);
    expect(result.summary.vCpu).toBe(4);
    expect(result.summary.hclEvidence.vmInfo.map(vm => vm.vm)).toEqual(["app-01"]);
    expect(result.summary.hclEvidence.tools.map(tool => tool.vm)).toEqual(["app-01"]);
    expect(result.sources[0].warnings).toContain('Skipped 1 nested ESXi host with CPU model "VMware Virtual Processor"; it is not physical.');
    expect(result.sources[0].warnings).toContain("Skipped 1 VM running on nested ESXi hosts.");
  });
});
