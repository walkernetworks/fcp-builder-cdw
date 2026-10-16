import { describe, expect, it } from "vitest";
import { resolveCustomerNameOnFcpSave } from "../shared/customerName";

describe("customer name shared by the tracker and the FCP document", () => {
  it("keeps a name changed in the tracker when a stale FCP copy saves", () => {
    // Tracker renamed "-Braintree Light" to "Braintree Light"; the open FCP still holds the old name it loaded.
    expect(resolveCustomerNameOnFcpSave({ incoming: "-Braintree Light", base: "-Braintree Light", storedDocName: "Braintree Light", column: "Braintree Light" })).toEqual({ column: "Braintree Light", docName: "Braintree Light" });
  });

  it("takes a name edited in the FCP", () => {
    expect(resolveCustomerNameOnFcpSave({ incoming: "Braintree", base: "Braintree Light", storedDocName: "Braintree Light", column: "Braintree Light" })).toEqual({ column: "Braintree", docName: "Braintree" });
  });

  it("without a base from an older client, compares with the stored document", () => {
    expect(resolveCustomerNameOnFcpSave({ incoming: "Acme", storedDocName: "Acme", column: "Acme Corp" })).toEqual({ column: "Acme Corp", docName: "Acme Corp" });
    expect(resolveCustomerNameOnFcpSave({ incoming: "Acme Inc", storedDocName: "Acme", column: "Acme Corp" })).toEqual({ column: "Acme Inc", docName: "Acme Inc" });
  });

  it("never blanks the column from an empty FCP name", () => {
    expect(resolveCustomerNameOnFcpSave({ incoming: "  ", base: "", storedDocName: null, column: "Imported Co" })).toEqual({ column: "Imported Co", docName: "Imported Co" });
  });
});
