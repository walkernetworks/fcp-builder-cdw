import { describe, expect, it } from "vitest";
import { resolveCustomerNameOnFcpSave } from "../shared/customerName";

describe("customer name shared by the tracker and the FCP document", () => {
  it("keeps a name changed in the tracker when a stale FCP copy saves", () => {
    // Tracker renamed "-Northwind Mfg" to "Northwind Mfg"; the open FCP still holds the old name it loaded.
    expect(resolveCustomerNameOnFcpSave({ incoming: "-Northwind Mfg", base: "-Northwind Mfg", storedDocName: "Northwind Mfg", column: "Northwind Mfg" })).toEqual({ column: "Northwind Mfg", docName: "Northwind Mfg" });
  });

  it("takes a name edited in the FCP", () => {
    expect(resolveCustomerNameOnFcpSave({ incoming: "Northwind", base: "Northwind Mfg", storedDocName: "Northwind Mfg", column: "Northwind Mfg" })).toEqual({ column: "Northwind", docName: "Northwind" });
  });

  it("without a base from an older client, compares with the stored document", () => {
    expect(resolveCustomerNameOnFcpSave({ incoming: "Acme", storedDocName: "Acme", column: "Acme Corp" })).toEqual({ column: "Acme Corp", docName: "Acme Corp" });
    expect(resolveCustomerNameOnFcpSave({ incoming: "Acme Inc", storedDocName: "Acme", column: "Acme Corp" })).toEqual({ column: "Acme Inc", docName: "Acme Inc" });
  });

  it("never blanks the column from an empty FCP name", () => {
    expect(resolveCustomerNameOnFcpSave({ incoming: "  ", base: "", storedDocName: null, column: "Imported Co" })).toEqual({ column: "Imported Co", docName: "Imported Co" });
  });
});
