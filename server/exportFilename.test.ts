import { describe, expect, it } from "vitest";
import { exportFilename } from "../shared/exportFilename";

describe("export file names", () => {
  it("appends - FCP to the FCP document", () => {
    expect(exportFilename("OrthoCarolina", "fcp", "pdf")).toBe("OrthoCarolina - FCP.pdf");
    expect(exportFilename("OrthoCarolina", "fcp", "html")).toBe("OrthoCarolina - FCP.html");
  });

  it("does not repeat the suffix when the title already ends with it", () => {
    expect(exportFilename("OrthoCarolina FCP", "fcp", "pdf")).toBe("OrthoCarolina FCP.pdf");
    expect(exportFilename("OrthoCarolina - FCP", "fcp", "pdf")).toBe("OrthoCarolina - FCP.pdf");
  });

  it("names the other exports the same way", () => {
    expect(exportFilename("OrthoCarolina", "plan-output", "pdf")).toBe("OrthoCarolina - Compatibility Handoff.pdf");
    expect(exportFilename("OrthoCarolina", "building-blocks", "xlsx")).toBe("OrthoCarolina - Building Blocks.xlsx");
  });

  it("removes characters that are unsafe in a file name or download header", () => {
    expect(exportFilename('  Acme / "Phase 1": West  ', "fcp", "pdf")).toBe("Acme Phase 1 West - FCP.pdf");
    expect(exportFilename("", "fcp", "pdf")).toBe("Engagement - FCP.pdf");
  });
});
