import { describe, expect, it } from "vitest";
import { renameInTitle, resolveFcpSaveNames } from "../shared/customerName";

const save = (overrides: Partial<Parameters<typeof resolveFcpSaveNames>[0]>) =>
  resolveFcpSaveNames({ incomingName: "Northwind Mfg", incomingTitle: "Northwind Mfg", baseName: "Northwind Mfg", baseTitle: "Northwind Mfg", storedDocName: "Northwind Mfg", storedTitle: "Northwind Mfg", column: "Northwind Mfg", ...overrides });

describe("one name across the record, the FCP document, and the title", () => {
  it("renames the title with the customer: exact titles and titles that contain the name", () => {
    expect(renameInTitle("-Northwind Mfg", "-Northwind Mfg", "Northwind Mfg")).toBe("Northwind Mfg");
    expect(renameInTitle("-Northwind Mfg VCF Adoption", "-Northwind Mfg", "Northwind Mfg")).toBe("Northwind Mfg VCF Adoption");
    expect(renameInTitle("Q3 platform plan", "Northwind", "Northwind Mfg")).toBe("Q3 platform plan");
  });

  it("keeps a tracker rename when a stale FCP copy saves", () => {
    // The drawer renamed "-Northwind Mfg"; the open FCP still holds the old name and title it loaded.
    expect(save({ incomingName: "-Northwind Mfg", incomingTitle: "-Northwind Mfg", baseName: "-Northwind Mfg", baseTitle: "-Northwind Mfg" })).toEqual({ column: "Northwind Mfg", docName: "Northwind Mfg", title: "Northwind Mfg" });
  });

  it("renames the record from the FCP's customer name, and the title follows", () => {
    expect(save({ incomingName: "Northwind", storedTitle: "Northwind Mfg VCF Adoption", incomingTitle: "Northwind Mfg VCF Adoption", baseTitle: "Northwind Mfg VCF Adoption" })).toEqual({ column: "Northwind", docName: "Northwind", title: "Northwind VCF Adoption" });
  });

  it("renames the record from the workspace title when the title was the customer name", () => {
    expect(save({ incomingTitle: "Northwind" })).toEqual({ column: "Northwind", docName: "Northwind", title: "Northwind" });
  });

  it("keeps the customer name when a custom title is edited", () => {
    expect(save({ storedTitle: "Northwind Mfg VCF Adoption", baseTitle: "Northwind Mfg VCF Adoption", incomingTitle: "Northwind Mfg VCF and NSX" })).toEqual({ column: "Northwind Mfg", docName: "Northwind Mfg", title: "Northwind Mfg VCF and NSX" });
  });

  it("never blanks the name from an empty FCP field", () => {
    expect(save({ incomingName: " ", baseName: "", storedDocName: null })).toMatchObject({ column: "Northwind Mfg", docName: "Northwind Mfg" });
  });
});
