import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { engagements, fcpConsumptionEntries, fcpVersions, type Engagement } from "../drizzle/schema";
import { createDefaultDocument } from "../shared/fcp";
import { CONSUMPTION_ENTRY_COLUMN_VISIBILITY, customerFacingColumns, ENGAGEMENT_COLUMN_VISIBILITY, FCP_VERSION_COLUMN_VISIBILITY, trackerPatchSchema } from "../shared/vsaFields";

describe("internal vs customer-facing columns", () => {
  it("tags every engagements column, and nothing else", () => {
    expect(Object.keys(ENGAGEMENT_COLUMN_VISIBILITY).sort()).toEqual(Object.keys(getTableColumns(engagements)).sort());
  });

  it("tags every FCP version and consumption entry column; only what the customer received is customer-facing", () => {
    expect(Object.keys(FCP_VERSION_COLUMN_VISIBILITY).sort()).toEqual(Object.keys(getTableColumns(fcpVersions)).sort());
    expect(Object.keys(CONSUMPTION_ENTRY_COLUMN_VISIBILITY).sort()).toEqual(Object.keys(getTableColumns(fcpConsumptionEntries)).sort());
    const customer = (tags: Record<string, string>) => Object.entries(tags).filter(([, tag]) => tag === "customer").map(([key]) => key).sort();
    expect(customer(FCP_VERSION_COLUMN_VISIBILITY)).toEqual(["renderedHtml", "revisionNote"]);
    expect(customer(CONSUMPTION_ENTRY_COLUMN_VISIBILITY)).toEqual(["asOf", "consumedHours"]);
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

describe("engagement keys", () => {
  const indexes = Object.fromEntries(getTableConfig(engagements).indexes.map(index => [index.config.name, index.config.unique]));

  it("keeps one engagement per plan: opportunity, SharePoint item, and intake submission are unique", () => {
    expect(indexes).toMatchObject({ engagements_opportunity_number_uq: true, engagements_sharepoint_item_uq: true, engagements_intake_submission_uq: true, engagements_sf_opportunity_uq: true });
  });

  it("lets one Salesforce account carry many engagements, and groups alternative plans as peers", () => {
    expect(indexes).toMatchObject({ engagements_sf_customer_idx: false, engagements_entitlement_group_idx: false });
    expect(indexes).not.toHaveProperty("engagements_sf_customer_uq");
    expect(getTableColumns(engagements)).not.toHaveProperty("parentEngagementId");
  });
});
