import { describe, expect, it } from "vitest";
import { renameInTitle, resolveFcpSaveNames } from "../shared/customerName";

const save = (overrides: Partial<Parameters<typeof resolveFcpSaveNames>[0]>) =>
  resolveFcpSaveNames({ incomingName: "Braintree Light", incomingTitle: "Braintree Light", baseName: "Braintree Light", baseTitle: "Braintree Light", storedDocName: "Braintree Light", storedTitle: "Braintree Light", column: "Braintree Light", ...overrides });

describe("one name across the record, the FCP document, and the title", () => {
  it("renames the title with the customer: exact titles and titles that contain the name", () => {
    expect(renameInTitle("-Braintree Light", "-Braintree Light", "Braintree Light")).toBe("Braintree Light");
    expect(renameInTitle("-Braintree Light VCF Adoption", "-Braintree Light", "Braintree Light")).toBe("Braintree Light VCF Adoption");
    expect(renameInTitle("Q3 platform plan", "Braintree", "Braintree Light")).toBe("Q3 platform plan");
  });

  it("keeps a tracker rename when a stale FCP copy saves", () => {
    // The drawer renamed "-Braintree Light"; the open FCP still holds the old name and title it loaded.
    expect(save({ incomingName: "-Braintree Light", incomingTitle: "-Braintree Light", baseName: "-Braintree Light", baseTitle: "-Braintree Light" })).toEqual({ column: "Braintree Light", docName: "Braintree Light", title: "Braintree Light" });
  });

  it("renames the record from the FCP's customer name, and the title follows", () => {
    expect(save({ incomingName: "Braintree", storedTitle: "Braintree Light VCF Adoption", incomingTitle: "Braintree Light VCF Adoption", baseTitle: "Braintree Light VCF Adoption" })).toEqual({ column: "Braintree", docName: "Braintree", title: "Braintree VCF Adoption" });
  });

  it("renames the record from the workspace title when the title was the customer name", () => {
    expect(save({ incomingTitle: "Braintree" })).toEqual({ column: "Braintree", docName: "Braintree", title: "Braintree" });
  });

  it("keeps the customer name when a custom title is edited", () => {
    expect(save({ storedTitle: "Braintree Light VCF Adoption", baseTitle: "Braintree Light VCF Adoption", incomingTitle: "Braintree Light VCF and NSX" })).toEqual({ column: "Braintree Light", docName: "Braintree Light", title: "Braintree Light VCF and NSX" });
  });

  it("never blanks the name from an empty FCP field", () => {
    expect(save({ incomingName: " ", baseName: "", storedDocName: null })).toMatchObject({ column: "Braintree Light", docName: "Braintree Light" });
  });
});
