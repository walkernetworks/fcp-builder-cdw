import express from "express";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => {
  class BuildLockedError extends Error {}
  return { BuildLockedError, getEngagement: vi.fn(), getUserById: vi.fn(), getLatestIssuedVersion: vi.fn(), issueFcpVersion: vi.fn(), getIssuedVersion: vi.fn(), recordApproval: vi.fn(), listConsumptionEntries: vi.fn(async () => []) };
});
vi.mock("./pdf", () => ({ renderPdf: vi.fn(async (html: string) => Buffer.from(`%PDF-1.7\n${html.length}\n`, "utf8")) }));

import { computeChangeSummary, isEmptyChange } from "../shared/fcpChangeSummary";
import { issuedFilename } from "../shared/exportFilename";
import type { EngagementDocument } from "../shared/fcp";
import type { TrpcContext } from "./_core/context";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import * as db from "./db";
import { registerExportDownloadRoutes } from "./exportDownloadRoutes";
import { createExportTicket, verifyExportTicket } from "./exportTickets";
import { acmeHealth, acmeHealthReconciled, acmeHealthUnderFunded, FIXTURE_TODAY, meridianHealthForfeiting, riverbendHealth, riverbendHealthOverfunded } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";
import { appRouter } from "./routers";

const ROOT = path.resolve(import.meta.dirname, "..");
const effortOf = (document: EngagementDocument) => scopedEffortForDocument(document, FIXTURE_TODAY);
const snapshot = (document: EngagementDocument, issueNumber: number) => ({ document, effort: effortOf(document), issueNumber });

function caller() {
  const user = { id: 7, openId: "issue-test", email: "sa@example.test", name: "Test SA", loginMethod: "trusted-proxy", role: "user", workspaceId: 1, vsaRole: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  return appRouter.createCaller({ user, req: { headers: {}, protocol: "https" }, res: {} } as unknown as TrpcContext);
}

describe("change summary", () => {
  it("has nothing to compare on a first issue", () => {
    const document = acmeHealth();
    const summary = computeChangeSummary(null, { document, effort: effortOf(document) });
    expect(summary).toMatchObject({ basedOnIssue: null, packages: [], dates: [], outcomesOn: [], outcomesOff: [] });
    expect(summary.entitlementHours.after).toBe(Math.round(effortOf(document).totals.total));
    expect(isEmptyChange(summary)).toBe(false);
  });

  it("is empty when nothing changed", () => {
    const document = acmeHealth();
    expect(isEmptyChange(computeChangeSummary(snapshot(document, 1), { document, effort: effortOf(document) }))).toBe(true);
  });

  it("reports a package moved to follow-on with its hours, a date change and consumption since the last issue", () => {
    const before = acmeHealth();
    const package_ = effortOf(before).workPackages.find(row => !row.deferred && row.owner === "cdw" && row.total > 0 && row.category !== "Program Management & Governance")!;
    const after = acmeHealth();
    after.report.workPackageHours = [...after.report.workPackageHours, { id: package_.id, architect: null, srConsultant: null, projectManager: null, placement: "notional", owner: "auto" }];
    after.fields.targetComplete = "2027-12-31";
    after.report.entitlement = { ...after.report.entitlement, hoursConsumed: 140, consumedAsOf: "2026-12-15" };
    const summary = computeChangeSummary(snapshot(before, 1), { document: after, effort: effortOf(after) });
    expect(summary.basedOnIssue).toBe(1);
    expect(summary.packages).toContainEqual(expect.objectContaining({ id: package_.id, change: "to-follow-on", hoursBefore: Math.round(package_.total), hoursAfter: 0 }));
    expect(summary.entitlementHours.after).toBeLessThan(summary.entitlementHours.before);
    expect(summary.dates).toContainEqual(expect.objectContaining({ key: "targetComplete", after: "2027-12-31" }));
    expect(summary.consumption?.asOf).toBe("2026-12-15");
  });

  it("reports outcomes turned on, and stays in hours and dates", () => {
    const before = acmeHealth();
    const after = acmeHealth();
    const added = (["operations", "automation", "security", "resilience", "kubernetes"] as const).find(capability => !after.fields.priorities.includes(capability))!;
    after.fields.priorities = [...after.fields.priorities, added];
    const summary = computeChangeSummary(snapshot(before, 2), { document: after, effort: effortOf(after) });
    expect(summary.outcomesOn.length).toBeGreaterThan(0);
    const text = JSON.stringify(summary);
    expect(text).not.toMatch(/\$|USD|rate|depth to be confirmed/i);
  });
});

describe("fcpRecord.issue", () => {
  const row = (document: EngagementDocument) => ({ id: 4, title: "Acme Health FCP", customerName: "Acme Health", data: document }) as never;
  beforeEach(() => {
    vi.mocked(db.getEngagement).mockReset();
    vi.mocked(db.getLatestIssuedVersion).mockReset();
    vi.mocked(db.issueFcpVersion).mockReset();
  });

  it("issues the saved FCP exactly as rendered, without the draft mark, with the change summary", async () => {
    const document = acmeHealthReconciled();
    vi.mocked(db.getEngagement).mockResolvedValue(row(document));
    vi.mocked(db.getLatestIssuedVersion).mockResolvedValue(null);
    vi.mocked(db.issueFcpVersion).mockResolvedValue({ status: "ok", value: { id: 90, issueNumber: 1 } });
    expect(await caller().fcpRecord.issue({ id: 4, label: "Initial plan", revisionNote: null })).toEqual({ id: 90, issueNumber: 1 });
    const [, , input] = vi.mocked(db.issueFcpVersion).mock.calls[0];
    expect(input.html).toBe(renderCondensedFcpHtml("Acme Health FCP", input.data, { effort: input.effort }));
    expect(input.html).not.toContain("draft-mark");
    expect(input).toMatchObject({ label: "Initial plan", basedOnVersionId: null, changeSummary: { basedOnIssue: null } });
  });

  it("refuses when nothing changed since the current issue", async () => {
    const document = acmeHealthReconciled();
    vi.mocked(db.getEngagement).mockResolvedValue(row(document));
    vi.mocked(db.getLatestIssuedVersion).mockResolvedValue(null);
    vi.mocked(db.issueFcpVersion).mockResolvedValue({ status: "ok", value: { id: 90, issueNumber: 1 } });
    await caller().fcpRecord.issue({ id: 4 });
    const [, , first] = vi.mocked(db.issueFcpVersion).mock.calls[0];
    vi.mocked(db.getLatestIssuedVersion).mockResolvedValue({ id: 90, issueNumber: 1, status: "issued", data: first.data, effortSnapshot: first.effort, renderedHtml: first.html, issuedAt: new Date(), reportFormat: null } as never);
    await expect(caller().fcpRecord.issue({ id: 4 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: "Nothing has changed since issue 1." });
    expect(db.issueFcpVersion).toHaveBeenCalledTimes(1);
  });

  it("issues a Commercial record as the Summary, numbered and dated, and records the format", async () => {
    vi.mocked(db.getEngagement).mockResolvedValue({ ...(row(acmeHealthReconciled()) as object), segment: "commercial" } as never);
    vi.mocked(db.getLatestIssuedVersion).mockResolvedValue(null);
    vi.mocked(db.issueFcpVersion).mockResolvedValue({ status: "ok", value: { id: 90, issueNumber: 1 } });
    await caller().fcpRecord.issue({ id: 4 });
    const [, , input] = vi.mocked(db.issueFcpVersion).mock.calls[0];
    expect(input.reportFormat).toBe("summary");
    expect(input.html).toContain("Functional Consumption Plan · Summary");
    expect(input.html).toContain("<b>Version 1</b>Issued ");
    expect(input.html).not.toContain("draft-mark");
  });

  it("lets an issue override the segment's format, and finds an unchanged Summary unchanged", async () => {
    vi.mocked(db.getEngagement).mockResolvedValue({ ...(row(acmeHealthReconciled()) as object), segment: "corporate" } as never);
    vi.mocked(db.getLatestIssuedVersion).mockResolvedValue(null);
    vi.mocked(db.issueFcpVersion).mockResolvedValue({ status: "ok", value: { id: 90, issueNumber: 1 } });
    await caller().fcpRecord.issue({ id: 4 });
    expect(vi.mocked(db.issueFcpVersion).mock.calls[0][2].reportFormat).toBeNull();
    await caller().fcpRecord.issue({ id: 4, reportFormat: "summary" });
    const [, , summary] = vi.mocked(db.issueFcpVersion).mock.calls[1];
    expect(summary.reportFormat).toBe("summary");
    const issuedAt = new Date();
    vi.mocked(db.getLatestIssuedVersion).mockResolvedValue({ id: 90, issueNumber: 1, status: "issued", data: summary.data, effortSnapshot: summary.effort, renderedHtml: summary.html, issuedAt, reportFormat: "summary" } as never);
    await expect(caller().fcpRecord.issue({ id: 4, reportFormat: "summary" })).rejects.toMatchObject({ message: "Nothing has changed since issue 1." });
    // The same plan in another format is a change for the customer.
    vi.mocked(db.issueFcpVersion).mockResolvedValue({ status: "ok", value: { id: 91, issueNumber: 2 } });
    await caller().fcpRecord.issue({ id: 4 });
    expect(db.issueFcpVersion).toHaveBeenCalledTimes(3);
  });

  it("refuses an under-funded plan until a reason is given, and logs the reason on the version", async () => {
    vi.mocked(db.getEngagement).mockResolvedValue(row(acmeHealthUnderFunded()));
    vi.mocked(db.getLatestIssuedVersion).mockResolvedValue(null);
    vi.mocked(db.issueFcpVersion).mockResolvedValue({ status: "ok", value: { id: 90, issueNumber: 1 } });
    await expect(caller().fcpRecord.issue({ id: 4 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("Under-funded: 39 delivered, 191 planned and 4 held in reserve come to 144 hours more than the 90-hour entitlement.") });
    await expect(caller().fcpRecord.issue({ id: 4, fundingOverride: "  " })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.issueFcpVersion).not.toHaveBeenCalled();
    await caller().fcpRecord.issue({ id: 4, fundingOverride: "Broadcom asked for the plan as scoped; the follow-on purchase is in progress." });
    expect(vi.mocked(db.issueFcpVersion).mock.calls[0][2].fundingOverrideNote).toBe("Broadcom asked for the plan as scoped; the follow-on purchase is in progress.");
    const preview = await caller().fcpRecord.issuePreview({ id: 4 });
    expect(preview.fundingProblem).toMatch(/^Under-funded/);
  });

  it("requires a reason when the hours exceed the BSAS pool, and none when they reconcile", async () => {
    vi.mocked(db.getEngagement).mockResolvedValue(row(riverbendHealthOverfunded()));
    vi.mocked(db.getLatestIssuedVersion).mockResolvedValue(null);
    vi.mocked(db.issueFcpVersion).mockResolvedValue({ status: "ok", value: { id: 90, issueNumber: 1 } });
    await expect(caller().fcpRecord.issue({ id: 4 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("Under-funded: 40 delivered, 165 planned and 4 held in reserve come to 119 hours more than the 90-hour BSAS hours.") });
    expect(db.issueFcpVersion).not.toHaveBeenCalled();
    vi.mocked(db.getEngagement).mockResolvedValue(row(riverbendHealth()));
    expect((await caller().fcpRecord.issuePreview({ id: 4 })).fundingProblem).toBeNull();
  });

  it("requires a reason, in the forfeiture wording, when BSAS hours go unplanned", async () => {
    vi.mocked(db.getEngagement).mockResolvedValue(row(meridianHealthForfeiting()));
    vi.mocked(db.getLatestIssuedVersion).mockResolvedValue(null);
    vi.mocked(db.issueFcpVersion).mockResolvedValue({ status: "ok", value: { id: 90, issueNumber: 1 } });
    const preview = await caller().fcpRecord.issuePreview({ id: 4 });
    expect(preview.fundingProblem).toContain("277 hours are not planned and will be forfeited at term end (323 planned against the 600-hour BSAS allocation, 2027-05-01 to 2028-04-30).");
    await expect(caller().fcpRecord.issue({ id: 4 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringContaining("277 hours are not planned and will be forfeited at term end") });
    expect(db.issueFcpVersion).not.toHaveBeenCalled();
  });

  it("labels the delivered hours with the consumption notes in the issued Summary", async () => {
    vi.mocked(db.getEngagement).mockResolvedValue({ ...(row(acmeHealthReconciled()) as object), segment: "commercial" } as never);
    vi.mocked(db.getLatestIssuedVersion).mockResolvedValue(null);
    vi.mocked(db.listConsumptionEntries).mockResolvedValue([{ asOf: "2026-08-01", note: "Assessment and discovery" }, { asOf: "2026-09-03", note: null }, { asOf: "2026-10-15", note: "Kickoff" }] as never);
    vi.mocked(db.issueFcpVersion).mockResolvedValue({ status: "ok", value: { id: 90, issueNumber: 1 } });
    await caller().fcpRecord.issue({ id: 4 });
    const html = vi.mocked(db.issueFcpVersion).mock.calls[0][2].html;
    expect(html).toContain('<tr class="done"><td>Assessment and discovery</td>');
    expect(html).not.toContain("Kickoff</td><td>Apr");
  });

  it("keeps no override reason on a plan whose hours reconcile", async () => {
    vi.mocked(db.getEngagement).mockResolvedValue(row(acmeHealthReconciled()));
    vi.mocked(db.getLatestIssuedVersion).mockResolvedValue(null);
    vi.mocked(db.issueFcpVersion).mockResolvedValue({ status: "ok", value: { id: 90, issueNumber: 1 } });
    await caller().fcpRecord.issue({ id: 4, fundingOverride: "Not needed" });
    expect(vi.mocked(db.issueFcpVersion).mock.calls[0][2].fundingOverrideNote).toBeNull();
  });

  it("refuses an FCP that fails the export checks", async () => {
    const document = acmeHealth();
    // A second dollar figure: the FCP carries only the entitlement value.
    document.report.situation = [...document.report.situation, "A refresh budget of $99,999.00 is held for next year"];
    vi.mocked(db.getEngagement).mockResolvedValue(row(document));
    vi.mocked(db.getLatestIssuedVersion).mockResolvedValue(null);
    await expect(caller().fcpRecord.issue({ id: 4 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(db.issueFcpVersion).not.toHaveBeenCalled();
  });

  it("turns a version issued meanwhile into a conflict", async () => {
    vi.mocked(db.getEngagement).mockResolvedValue(row(acmeHealthReconciled()));
    vi.mocked(db.getLatestIssuedVersion).mockResolvedValue(null);
    vi.mocked(db.issueFcpVersion).mockResolvedValue({ status: "conflict" });
    await expect(caller().fcpRecord.issue({ id: 4 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("records approvals with a date, who approved and a note, and refuses a bad party at the input", async () => {
    vi.mocked(db.recordApproval).mockResolvedValue({ status: "ok", value: null });
    await caller().fcpRecord.recordApproval({ id: 4, versionId: 90, party: "customer", on: "2026-10-20", approverName: " Pat Rivera, CIO ", note: " " });
    expect(db.recordApproval).toHaveBeenCalledWith({ id: 7, workspaceId: 1, role: "user" }, 4, 90, "customer", { on: "2026-10-20", approverName: "Pat Rivera, CIO", note: null });
    await expect(caller().fcpRecord.recordApproval({ id: 4, versionId: 90, party: "nobody" as never, on: "2026-10-20", approverName: "Pat Rivera" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires who approved, separate from who recorded it", async () => {
    await expect(caller().fcpRecord.recordApproval({ id: 4, versionId: 90, party: "broadcom", on: "2026-10-20", approverName: "  " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().fcpRecord.recordApproval({ id: 4, versionId: 90, party: "broadcom", on: "2026-10-20" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("issued downloads", () => {
  let server: Server;
  let baseUrl = "";
  beforeAll(async () => {
    process.env.JWT_SECRET = "issue-route-test-secret-with-enough-entropy";
    const app = express();
    registerExportDownloadRoutes(app);
    await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", () => { const address = server.address(); if (address && typeof address !== "string") baseUrl = `http://127.0.0.1:${address.port}`; resolve(); }); });
  });
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

  it("names an issued version in the ticket, and only an issued version", () => {
    expect(verifyExportTicket(createExportTicket(7, 4, "pdf", "issued-fcp", 90))).toMatchObject({ documentType: "issued-fcp", versionId: 90 });
    expect(verifyExportTicket(createExportTicket(7, 4, "pdf", "issued-fcp"))).toBeNull();
    expect(verifyExportTicket(createExportTicket(7, 4, "pdf", "condensed-fcp", 90))).toBeNull();
  });

  it("returns a superseded version exactly as it was issued", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({ id: 7, workspaceId: 1, role: "user" } as never);
    vi.mocked(db.getEngagement).mockResolvedValue({ id: 4, title: "Acme Health FCP", data: acmeHealth() } as never);
    vi.mocked(db.getIssuedVersion).mockResolvedValue({ id: 90, issueNumber: 1, status: "superseded", title: "Acme Health FCP", renderedHtml: "<!doctype html><p>issue one</p>" } as never);
    const response = await fetch(`${baseUrl}/api/download/${createExportTicket(7, 4, "html", "issued-fcp", 90)}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<!doctype html><p>issue one</p>");
    expect(response.headers.get("content-disposition")).toContain(issuedFilename("Acme Health FCP", 1, "html"));
    expect(db.getIssuedVersion).toHaveBeenCalledWith({ id: 7, workspaceId: 1, role: "user" }, 4, 90);
  });

  it("marks an export of the working FCP as a draft", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({ id: 7, workspaceId: 1, role: "user" } as never);
    vi.mocked(db.getEngagement).mockResolvedValue({ id: 4, title: "Acme Health FCP", data: acmeHealth() } as never);
    const response = await fetch(`${baseUrl}/api/download/${createExportTicket(7, 4, "html", "condensed-fcp")}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("draft-mark");
  });
});

describe("version storage rules", () => {
  const source = readFileSync(path.join(ROOT, "server/db.ts"), "utf8");
  const issue = source.slice(source.indexOf("export async function issueFcpVersion"), source.indexOf("export async function reviseFromIssued"));
  const approval = source.slice(source.indexOf("export async function recordApproval"), source.indexOf("// Consumption history"));

  it("never rewrites what was issued", () => {
    expect(source).not.toMatch(/\.set\(\{[^}]*\b(renderedHtml|effortSnapshot|renderHash|issueNumber)\b/);
    expect(issue).toMatch(/\.set\(\{ status: "superseded" \}\)\.where\(and\(eq\(fcpVersions\.id, current\.id\)/);
  });

  it("stores the approver's name next to the recording user", () => {
    expect(approval).toMatch(/broadcomApproverName: approval\.approverName, broadcomApprovedByUserId: viewer\.id/);
    expect(approval).toMatch(/customerApproverName: approval\.approverName, customerApprovedByUserId: viewer\.id/);
  });

  it("fills the tracker gate dates only when they are empty", () => {
    expect(issue).toMatch(/if \(!record\.fcpSubmittedOn\)/);
    expect(issue).toMatch(/isNull\(engagements\.fcpSubmittedOn\)/);
    expect(approval).toMatch(/=== null\) \{/);
    expect(approval).toMatch(/isNull\(gate\)/);
  });
});

describe("issued filename", () => {
  it("adds the issue number", () => {
    expect(issuedFilename("Northwind Mfg", 2, "pdf")).toBe("Northwind Mfg - FCP Issue 2.pdf");
  });
});

describe("fcpRecord.compareIssued", () => {
  const issued = (id: number, issueNumber: number, document: EngagementDocument) => ({ id, issueNumber, status: issueNumber === 2 ? "issued" : "superseded", issuedAt: new Date("2026-10-01T12:00:00Z"), data: document, effortSnapshot: effortOf(document), renderedHtml: `<!doctype html><p>issue ${issueNumber}</p>` });
  beforeEach(() => vi.mocked(db.getIssuedVersion).mockReset());

  it("compares the earlier issue with the later, whichever order they are picked in, from the stored snapshots", async () => {
    const before = acmeHealth();
    const after = acmeHealth();
    after.fields.targetComplete = "2027-12-31";
    vi.mocked(db.getIssuedVersion).mockImplementation(async (_viewer, _id, versionId) => (versionId === 91 ? issued(91, 2, after) : issued(90, 1, before)) as never);
    const result = await caller().fcpRecord.compareIssued({ id: 4, versionIds: [91, 90] });
    expect(db.getIssuedVersion).toHaveBeenCalledWith({ id: 7, workspaceId: 1, role: "user" }, 4, 90);
    expect(db.getIssuedVersion).toHaveBeenCalledWith({ id: 7, workspaceId: 1, role: "user" }, 4, 91);
    expect([result.from.issueNumber, result.to.issueNumber]).toEqual([1, 2]);
    expect([result.from.html, result.to.html]).toEqual(["<!doctype html><p>issue 1</p>", "<!doctype html><p>issue 2</p>"]);
    expect(result.changeSummary.basedOnIssue).toBe(1);
    expect(result.changeSummary.dates).toContainEqual(expect.objectContaining({ key: "targetComplete", after: "2027-12-31" }));
    expect(result.changeSummary).toEqual(computeChangeSummary(snapshot(before, 1), { document: after, effort: effortOf(after) }));
  });

  it("is not found when either version is not an issued version of a visible record", async () => {
    vi.mocked(db.getIssuedVersion).mockImplementation(async (_viewer, _id, versionId) => (versionId === 90 ? issued(90, 1, acmeHealth()) : undefined) as never);
    await expect(caller().fcpRecord.compareIssued({ id: 4, versionIds: [90, 55] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("needs two different versions", async () => {
    await expect(caller().fcpRecord.compareIssued({ id: 4, versionIds: [90, 90] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.getIssuedVersion).not.toHaveBeenCalled();
  });
});
