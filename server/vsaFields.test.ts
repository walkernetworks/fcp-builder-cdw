import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { engagements, type Engagement } from "../drizzle/schema";
import { createDefaultDocument } from "../shared/fcp";
import { customerFacingColumns, ENGAGEMENT_COLUMN_VISIBILITY, trackerPatchSchema } from "../shared/vsaFields";

describe("internal vs customer-facing columns", () => {
  it("tags every engagements column, and nothing else", () => {
    expect(Object.keys(ENGAGEMENT_COLUMN_VISIBILITY).sort()).toEqual(Object.keys(getTableColumns(engagements)).sort());
  });

  it("passes only customer-facing columns to customer documents", () => {
    const row = Object.fromEntries(Object.keys(ENGAGEMENT_COLUMN_VISIBILITY).map(key => [key, `sentinel-${key}`])) as unknown as Engagement;
    const visible = customerFacingColumns({ ...row, data: createDefaultDocument() });
    expect(Object.keys(visible).sort()).toEqual(
      ["ckomOn", "coreCount", "customerName", "customerShortName", "data", "deliveryWindowEnd", "entitlementValue", "fcpCustomerAcceptedOn", "projectStartOn", "termEnd", "termStart", "title"].sort(),
    );
    const serialized = JSON.stringify(visible);
    for (const [key, tag] of Object.entries(ENGAGEMENT_COLUMN_VISIBILITY)) {
      if (tag === "internal") expect(serialized).not.toContain(`sentinel-${key}`);
    }
  });
});

describe("tracker field edits", () => {
  it("accepts valid values and normalizes blank text to null", () => {
    const parsed = trackerPatchSchema.parse({ opportunityNumber: "c-opp-1234567", entitlementValue: "250000.00", poReceivedOn: "2026-10-01", nextSteps: "  ", clientFolderUrl: "https://example.test/folder" });
    expect(parsed).toEqual({ opportunityNumber: "C-OPP-1234567", entitlementValue: "250000.00", poReceivedOn: "2026-10-01", nextSteps: null, clientFolderUrl: "https://example.test/folder" });
  });

  it("rejects AWC placeholders, bad dates, float-like money, non-https links, and fields that are not editable", () => {
    expect(trackerPatchSchema.safeParse({ opportunityNumber: "AWC-OPP-123456" }).success).toBe(false);
    expect(trackerPatchSchema.safeParse({ poReceivedOn: "10/01/2026" }).success).toBe(false);
    expect(trackerPatchSchema.safeParse({ poReceivedOn: "2026-13-40" }).success).toBe(false);
    expect(trackerPatchSchema.safeParse({ entitlementValue: "1e6" }).success).toBe(false);
    expect(trackerPatchSchema.safeParse({ clientFolderUrl: "http://example.test" }).success).toBe(false);
    for (const field of ["stage", "workspaceId", "ownerId", "rowVersion", "importSnapshot", "isFundingExtension", "intakeAnswers", "buildLockUserId"]) {
      expect(trackerPatchSchema.safeParse({ [field]: null }).success, field).toBe(false);
    }
  });
});
