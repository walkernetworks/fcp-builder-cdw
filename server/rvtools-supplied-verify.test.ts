import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseRvToolsFiles } from "../client/src/lib/rvtools";

async function workbookFile(path: string, name: string): Promise<File> {
  const bytes = await readFile(path);
  return new File([bytes], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

describe("supplied RVTools workbooks", () => {
  it("retains real VM rows and ESXi build evidence", async () => {
    const result = await parseRvToolsFiles([
      await workbookFile("/home/ubuntu/upload/Franklin_Park.xlsx", "Franklin_Park.xlsx"),
      await workbookFile("/home/ubuntu/upload/Ashburn.xlsx", "Ashburn.xlsx"),
    ]);

    expect(result.summary.hosts).toBe(66);
    expect(result.summary.vmCount).toBe(3892);
    expect(result.summary.esxiVersions).toEqual([{ version: "VMware ESXi 8.0.3 build-25205845", hosts: 66 }]);
  }, 30000);
});
