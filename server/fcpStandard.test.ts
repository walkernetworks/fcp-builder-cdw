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

  it("is self-contained: one inline script, no network", () => {
    const scripts = standard(meridianHealth()).match(/<script[^>]*>[\s\S]*?<\/script>/g) ?? [];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).not.toMatch(/src=|https?:|fetch|XMLHttpRequest|import\(/);
  });

  it.skipIf(!chrome)("prints on seven pages, or fewer when a page has nothing to show", async () => {
    expect(pages(await renderPdf(standard(acmeHealthReconciled(), 1, true)))).toBe(7);
    expect(pages(await renderPdf(standard(meridianHealth(), 1, true)))).toBe(7);
    expect(pages(await renderPdf(standard(cedarRidgeLogistics(), 1, true)))).toBeLessThanOrEqual(7);
  }, 90_000);
});
