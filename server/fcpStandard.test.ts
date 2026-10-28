import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EngagementDocument } from "../shared/fcp";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { acmeHealthReconciled, cedarRidgeLogistics, FIXTURE_TODAY, meridianHealth } from "./fixtures/fcpFixtures";
import { renderPdf } from "./pdf";
import { scopedEffortForDocument } from "./rateCard";

const chrome = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(path => existsSync(path));
if (chrome) process.env.PUPPETEER_EXECUTABLE_PATH ||= chrome;

const standard = (document: EngagementDocument, issueNumber = 1, draft = false) =>
  renderCondensedFcpHtml(document.fields.customerName, document, { effort: scopedEffortForDocument(document, FIXTURE_TODAY), today: FIXTURE_TODAY, format: "standard", version: { issueNumber, issuedOn: FIXTURE_TODAY }, draft });
const checks = (html: string, document: EngagementDocument) => checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount, bsasOnly: document.fields.fundingSource === "bsas", format: "standard" });
const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const pages = (pdf: Uint8Array) => (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe("Standard FCP", () => {
  it("renders Meridian Health (Corporate, entitlement plus BSAS) byte-identical to the golden copy, and passes the content checks", async () => {
    const document = meridianHealth();
    const html = standard(document);
    expect(checks(html, document)).toEqual([]);
    await expect(html).toMatchFileSnapshot("./__golden__/standard-meridian-health.html");
  });

  it("renders Cedar Ridge Logistics (no entitlement booked) byte-identical to the golden copy, and passes the content checks", async () => {
    const document = cedarRidgeLogistics();
    const html = standard(document);
    expect(checks(html, document)).toEqual([]);
    await expect(html).toMatchFileSnapshot("./__golden__/standard-cedar-ridge-logistics.html");
  });

  it("has the seven sections in order, with the document control on the Summary page", () => {
    const text = visible(standard(acmeHealthReconciled()));
    const order = ["Functional Consumption Plan · Standard", "Version 1, issued", "Scope and Architecture", "Work Packages and Scoped Effort", "Adoption Timeline", "After the Entitlement", "Working Together"].map(heading => text.indexOf(heading));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toMatch(/Supersedes None/);
  });

  it("names the issue it supersedes", () => {
    expect(visible(standard(acmeHealthReconciled(), 3))).toMatch(/Supersedes Version 2/);
  });

  it("draws the Summary's timeline: the same short bar labels and the same funded key", () => {
    const html = standard(acmeHealthReconciled());
    expect(html).toContain(">Design and BOM<");
    expect(html).not.toContain(">Greenfield Design and Bill of Materials</div>");
  });

  it("prints the hours as delivered, planned and held, adding up to the entitlement, and no internal buckets", () => {
    const text = visible(standard(acmeHealthReconciled()));
    expect(text).toContain("39 delivered, 205 planned and 18 held for change requests add up to the 262-hour entitlement");
    expect(text).toContain("Held for change requests, released to follow-on work if unused");
    expect(text).not.toMatch(/Scope by Bucket|Under-funded|catch-up|unfunded|shortfall/i);
  });

  it("states the BSAS pool in the roadmap's follow-on table, in hours and dates only", () => {
    const text = visible(standard(meridianHealth()));
    expect(text).toContain("BSAS hours");
    expect(text).toContain("(BSAS) fund this work: 188 hours from 1 May 2027 to 30 Apr 2028. 188 hours are planned.");
  });

  it("calls the window the planned delivery window when no entitlement is booked", () => {
    const text = visible(standard(cedarRidgeLogistics()));
    expect(text).toContain("planned delivery window");
    expect(text).not.toContain("entitlement window");
    expect(text).toContain("Not yet booked");
  });

  it("prints the superseded version's recorded approvals in document control, and None for Version 1", () => {
    const document = meridianHealth();
    const render = (issueNumber: number, supersedes?: { issueNumber: number; broadcomApprovedOn: string | null; customerApprovedOn: string | null }) =>
      visible(renderCondensedFcpHtml(document.fields.customerName, document, { effort: scopedEffortForDocument(document, FIXTURE_TODAY), today: FIXTURE_TODAY, format: "standard", version: { issueNumber, issuedOn: FIXTURE_TODAY }, ...(supersedes ? { supersedes } : {}) }));
    expect(render(1)).toContain("Supersedes None");
    expect(render(2, { issueNumber: 1, broadcomApprovedOn: "2026-10-12", customerApprovedOn: "2026-10-15" })).toContain("Supersedes Version 1, approved by Broadcom 12 Oct 2026 and by Meridian Health 15 Oct 2026");
    expect(render(2, { issueNumber: 1, broadcomApprovedOn: null, customerApprovedOn: "2026-10-15" })).toContain("Supersedes Version 1, approved by Meridian Health 15 Oct 2026");
    expect(render(2, { issueNumber: 1, broadcomApprovedOn: null, customerApprovedOn: null })).toContain("Supersedes Version 1 ");
    // A status for this issue would go stale once it is approved, so none is printed.
    expect(render(2)).not.toMatch(/Pending|Approved by Broadcom: /);
  });

  it("carries no signature lines, and says approval is by reply to the email", () => {
    const html = standard(meridianHealth());
    expect(html).not.toMatch(/Acceptance<\/h3>|class="sign"|class="signs"|Signature/);
    for (const issueNumber of [1, 2]) expect(visible(standard(meridianHealth(), issueNumber))).toContain("To approve this plan, reply to the email it was sent with.");
  });

  it("adds up the work packages: a Total planned row whose role columns sum, then delivered, held and the entitlement total", () => {
    const html = standard(acmeHealthReconciled());
    expect(checks(html, acmeHealthReconciled())).toEqual([]);
    const rows = Array.from((html.match(/<table class="std wp-table"[\s\S]*?<\/table>/) ?? [""])[0].matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g), match => ({ kind: /class="([a-z]+)"/.exec(match[1])?.[1] ?? "plain", cells: Array.from(match[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g), cell => cell[1].replace(/<[^>]+>/g, "").trim()) }));
    const number = (value: string | undefined) => (value ? Number(value.replace(/,/g, "")) : 0);
    const kinds = rows.filter(row => row.kind !== "cat").map(row => row.kind);
    expect(kinds.slice(-4)).toEqual(["sub", "done", "hold", "total"]);
    const planned = rows.filter(row => row.kind === "plain");
    const sub = rows.find(row => row.kind === "sub")!;
    const total = rows.find(row => row.kind === "total")!;
    for (const column of [3, 4, 5]) expect(number(sub.cells[column]), `role column ${column + 1}`).toBe(planned.reduce((sum, row) => sum + number(row.cells[column]), 0));
    expect(number(sub.cells[3]) + number(sub.cells[4]) + number(sub.cells[5])).toBe(number(sub.cells[6]));
    expect(sub.cells[0]).toBe("Total planned");
    // Delivered and held hours have no role split, so the entitlement total shows hours only.
    expect([3, 4, 5].map(column => total.cells[column])).toEqual(["", "", ""]);
    expect(number(sub.cells[6]) + rows.filter(row => row.kind === "done" || row.kind === "hold").reduce((sum, row) => sum + number(row.cells[6]), 0)).toBe(number(total.cells[6]));
  });

  it("never prints a zero or unknown count in the estate line", () => {
    for (const document of [cedarRidgeLogistics(), meridianHealth(), acmeHealthReconciled()]) {
      const text = visible(standard(document));
      expect(text).not.toMatch(/\b0 (powered on|VMs?|vCenters?|clusters?|ESXi hosts?)\b|\bunknown\b|\bNaN\b/i);
    }
    const document = cedarRidgeLogistics();
    Object.assign(document.inventory, { hosts: 1, clusters: 1, vmCount: 0, poweredOnVms: 0 });
    expect(visible(standard(document))).toMatch(/1 ESXi host and 1 cluster/);
  });

  it("is self-contained: one inline script, no network", () => {
    const scripts = standard(meridianHealth()).match(/<script[^>]*>[\s\S]*?<\/script>/g) ?? [];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).not.toMatch(/src=|https?:|fetch|XMLHttpRequest|import\(/);
  });

  it("puts the follow-on table at full width with How It's Funded below it, under a header strip that repeats on every page", () => {
    const html = standard(meridianHealth());
    const roadmap = html.slice(html.indexOf('<table class="paged">'));
    expect(roadmap).toContain('<thead><tr><td><div class="strip">');
    expect(roadmap.indexOf("Follow-on Work")).toBeGreaterThan(0);
    expect(roadmap.indexOf("Follow-on Work")).toBeLessThan(roadmap.indexOf("How It's Funded"));
    expect(roadmap.slice(0, roadmap.indexOf("How It's Funded"))).not.toContain('class="two"');
  });

  it.skipIf(!chrome)("prints on seven pages, or fewer when a page has nothing to show", async () => {
    expect(pages(await renderPdf(standard(acmeHealthReconciled(), 1, true)))).toBe(7);
    expect(pages(await renderPdf(standard(meridianHealth(), 1, true)))).toBe(7);
    expect(pages(await renderPdf(standard(cedarRidgeLogistics(), 1, true)))).toBeLessThanOrEqual(7);
  }, 90_000);
});
