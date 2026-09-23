import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseRvToolsFiles } from "../client/src/lib/rvtools";

async function workbookFile(path: string, name: string): Promise<File> {
  const bytes = await readFile(path);
  return new File([bytes], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// Customer workbooks are not in the repo; this runs only where they have been supplied.
const franklinPark = "/home/ubuntu/upload/Franklin_Park.xlsx";
const ashburn = "/home/ubuntu/upload/Ashburn.xlsx";
const workbooksSupplied = existsSync(franklinPark) && existsSync(ashburn);

describe("supplied RVTools workbooks", () => {
  it.skipIf(!workbooksSupplied)("retains real VM rows and ESXi build evidence", async () => {
    const result = await parseRvToolsFiles([
      await workbookFile(franklinPark, "Franklin_Park.xlsx"),
      await workbookFile(ashburn, "Ashburn.xlsx"),
    ]);

    expect(result.summary.hosts).toBe(66);
    expect(result.summary.vmCount).toBe(3892);
    expect(result.summary.esxiVersions).toEqual([{ version: "VMware ESXi 8.0.3 build-25205845", hosts: 66 }]);
  }, 30000);
});
