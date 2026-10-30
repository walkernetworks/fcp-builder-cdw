import { describe, expect, it } from "vitest";
import { createDefaultDocument } from "../shared/fcp";
import { BUILD_LOCK_STALE_MS, buildLockState, hoursSource, sourceUpdatesFromDocument, type SourceItemState } from "../shared/fcpRecord";

const TODAY = "2026-10-16";
const items = (overrides: Partial<Record<SourceItemState["kind"], SourceItemState["status"]>> = {}): SourceItemState[] =>
  (["rvtools", "discovery_notes", "customer_brief", "hours_source"] as const).map((kind, index) => ({ id: index + 1, kind, status: overrides[kind] ?? "needed", reference: null }));

function documentWith(options: { rvtools?: boolean; brief?: boolean; signedHours?: number; hoursModel?: "v1" | "v2" } = {}) {
  const document = createDefaultDocument();
  if (options.rvtools) document.inventorySources = [{ id: "f1", filename: "RVTools_export_example.xlsx", byteSize: 1000, sheets: ["vInfo"], importedAt: "2026-10-12T15:00:00.000Z", warnings: [] }];
  if (options.brief) document.report.whatWeHeard = [{ component: "Consolidation", customerPosition: "Fewer clusters", whereItLands: "" }];
  // A document saved before signed resource assignments were removed.
  if (options.signedHours) (document.report as Record<string, unknown>).resourceAssignments = [{ workstream: "Design", architect: options.signedHours, srConsultant: 0, projectManager: 0, seniorArchitect: 0, offshoreProjectManager: 0 }];
  if (options.hoursModel) document.fields.hoursModel = options.hoursModel;
  return document;
}

describe("source checklist evidence from the FCP", () => {
  it("receives RVTools from imported file names (aggregates only), dated by the import", () => {
    const [update] = sourceUpdatesFromDocument(documentWith({ rvtools: true }), items(), TODAY);
    expect(update).toMatchObject({ id: 1, status: "received", receivedOn: "2026-10-12", reference: "RVTools_export_example.xlsx" });
  });

  it("receives the customer brief from what the FCP holds; signed hours from an old document receive nothing", () => {
    const updates = sourceUpdatesFromDocument(documentWith({ brief: true, signedHours: 320 }), items(), TODAY);
    expect(updates.map(update => update.id)).toEqual([3]);
  });

  it("receives the hours source once entitled hours from Broadcom's record are on the plan", () => {
    const document = documentWith();
    document.report.entitlement.hours = 1000;
    const [update] = sourceUpdatesFromDocument(document, items(), TODAY);
    expect(update).toMatchObject({ id: 4, status: "received", reference: "1,000 entitled hours" });
    expect(sourceUpdatesFromDocument(document, items({ hours_source: "waived" }), TODAY)).toEqual([]);
  });

  it("never changes a verified or waived decision, and leaves discovery notes to people", () => {
    const updates = sourceUpdatesFromDocument(documentWith({ rvtools: true, brief: true }), items({ rvtools: "verified", customer_brief: "waived" }), TODAY);
    expect(updates).toEqual([]);
  });

  it("does nothing for an empty FCP", () => {
    expect(sourceUpdatesFromDocument(createDefaultDocument(), items(), TODAY)).toEqual([]);
  });
});

describe("hours source", () => {
  it("is always the calculated estimate, even when a saved document still carries signed assignments", () => {
    expect(hoursSource(documentWith({ signedHours: 200 }))).toMatchObject({ kind: "catalog-estimate" });
    expect(hoursSource(documentWith())).toMatchObject({ kind: "catalog-estimate" });
    expect(hoursSource(documentWith({ hoursModel: "v1" }))).toMatchObject({ kind: "bracket-estimate" });
  });
});

describe("build lock", () => {
  const now = Date.parse("2026-10-16T15:00:00Z");
  it("is free with no holder, mine when I hold it, and someone else's while it is live", () => {
    expect(buildLockState({ userId: null, at: null }, 1, now)).toBe("free");
    expect(buildLockState({ userId: 1, at: new Date(now - 30_000) }, 1, now)).toBe("mine");
    expect(buildLockState({ userId: 2, at: new Date(now - 30_000) }, 1, now)).toBe("other");
  });

  it("treats a lock that was not renewed in time as released", () => {
    expect(buildLockState({ userId: 2, at: new Date(now - BUILD_LOCK_STALE_MS - 1) }, 1, now)).toBe("free");
  });
});
