import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultDocument, migrateDocument } from "../shared/fcp";
import { SOURCE_ITEM_KINDS, SOURCE_ITEM_STATUSES, sourceStatusLabel } from "../shared/vsaFields";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { acmeHealthReconciled, FIXTURE_TODAY } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

const client = path.resolve(import.meta.dirname, "../client/src");
const read = (file: string) => readFileSync(path.join(client, file), "utf8");

describe("Phase 5 intake: contacts", () => {
  it("stores email and phone on a contact, and an older document without them reads as blank", () => {
    const document = createDefaultDocument();
    const stored = JSON.parse(JSON.stringify(document));
    stored.report.contacts = { customer: [{ name: "Pat Rivera", role: "Platform lead" }], cdw: [{ name: "Jordan Blake", role: "Architect", email: "jordan@example.com", phone: "555-0100" }], broadcom: [] };
    const migrated = migrateDocument(stored);
    expect(migrated.report.contacts.customer[0]).toMatchObject({ name: "Pat Rivera", email: "", phone: "" });
    expect(migrated.report.contacts.cdw[0]).toMatchObject({ email: "jordan@example.com", phone: "555-0100" });
  });

  it("keeps contact email and phone out of the customer formats", () => {
    const document = acmeHealthReconciled();
    document.report.contacts.cdw = [{ name: "Jordan Blake", role: "Architect", email: "jordan@example.com", phone: "555-0100" }];
    for (const format of ["summary", "standard"] as const) {
      const html = renderCondensedFcpHtml(document.fields.customerName, document, { effort: scopedEffortForDocument(document, FIXTURE_TODAY), today: FIXTURE_TODAY, format });
      expect(html).not.toContain("jordan@example.com");
      expect(html).not.toContain("555-0100");
    }
  });

  it("has a Contacts editor in the Narrative section and no JSON box in Review", () => {
    const workspace = read("pages/FcpWorkspace.tsx");
    expect(workspace).toMatch(/NARRATIVE_SECTIONS[^\n]*"contacts"/);
    expect(workspace).not.toContain("Edit report content (JSON)");
    expect(workspace).not.toContain("ReportJsonButton");
    const editor = read("components/ReportContentEditor.tsx");
    expect(editor).toContain('<Section value="contacts"');
    for (const column of ['"email"', '"phone"']) expect(editor).toContain(column);
  });
});

describe("Phase 5 intake: source checklist labels (C-9)", () => {
  it("keeps one status enum and labels it per kind", () => {
    expect(sourceStatusLabel("discovery_notes", "requested")).toBe("Scheduled");
    expect(sourceStatusLabel("discovery_notes", "received")).toBe("Recorded");
    expect(sourceStatusLabel("discovery_notes", "verified")).toBe("Transcript attached");
  });

  it("labels every status of every kind, with Waived the same everywhere and no em-dash", () => {
    for (const kind of SOURCE_ITEM_KINDS) {
      for (const status of SOURCE_ITEM_STATUSES) {
        const label = sourceStatusLabel(kind, status);
        expect(label, `${kind} ${status}`).toBeTruthy();
        expect(label).not.toContain("—");
      }
      expect(sourceStatusLabel(kind, "waived")).toBe("Waived");
    }
    expect(sourceStatusLabel("other", "received")).toBe("Received");
  });

  it("is what the checklist row shows", () => {
    expect(read("components/vsa/RecordPeopleSources.tsx")).toContain("sourceStatusLabel(source.kind, option)");
  });
});
