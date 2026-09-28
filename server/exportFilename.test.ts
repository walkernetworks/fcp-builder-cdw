import { describe, expect, it } from "vitest";
import { exportFilename } from "../shared/exportFilename";

describe("export file names", () => {
  it("appends - FCP to the FCP document", () => {
    expect(exportFilename("Northwind Mfg", "fcp", "pdf")).toBe("Northwind Mfg - FCP.pdf");
    expect(exportFilename("Northwind Mfg", "fcp", "html")).toBe("Northwind Mfg - FCP.html");
  });

  it("does not repeat the suffix when the title already ends with it", () => {
    expect(exportFilename("Northwind Mfg FCP", "fcp", "pdf")).toBe("Northwind Mfg FCP.pdf");
    expect(exportFilename("Northwind Mfg - FCP", "fcp", "pdf")).toBe("Northwind Mfg - FCP.pdf");
  });

  it("names the other exports the same way", () => {
    expect(exportFilename("Northwind Mfg", "plan-output", "pdf")).toBe("Northwind Mfg - Compatibility Handoff.pdf");
    expect(exportFilename("Northwind Mfg", "building-blocks", "xlsx")).toBe("Northwind Mfg - Building Blocks.xlsx");
  });

  it("removes characters that are unsafe in a file name or download header", () => {
    expect(exportFilename('  Acme / "Phase 1": West  ', "fcp", "pdf")).toBe("Acme Phase 1 West - FCP.pdf");
    expect(exportFilename("", "fcp", "pdf")).toBe("Engagement - FCP.pdf");
  });
});
