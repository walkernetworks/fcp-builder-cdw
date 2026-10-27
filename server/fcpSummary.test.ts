import { describe, expect, it } from "vitest";
import type { EngagementDocument } from "../shared/fcp";
import { defaultReportFormat, fundingProblem, reconcileHours, reportFormatOption } from "../shared/reportFormat";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { createExportTicket, verifyExportTicket } from "./exportTickets";
import { SUMMARY_CAPS } from "./fcpSummaryRenderer";
import { acmeHealth, acmeHealthReconciled, FIXTURE_TODAY, northwindMfg, riverbendHealth } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

process.env.JWT_SECRET ||= "summary-test-secret";

const VERSION = { issueNumber: 1, issuedOn: FIXTURE_TODAY };
const summary = (document: EngagementDocument, extra: { draft?: boolean; version?: typeof VERSION | undefined } = { version: VERSION }) =>
  renderCondensedFcpHtml(document.fields.customerName, document, { effort: scopedEffortForDocument(document, FIXTURE_TODAY), today: FIXTURE_TODAY, format: "summary", ...extra });
const checks = (html: string, document: EngagementDocument) => checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount, bsasOnly: document.fields.fundingSource === "bsas", format: "summary" });
const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;

describe("report format choice", () => {
  it("follows the tracker segment: Commercial gets the Summary, everyone else the long report for now", () => {
    expect(defaultReportFormat("commercial")).toBe("summary");
    expect(defaultReportFormat("corporate")).toBe("full");
    expect(defaultReportFormat("strategic")).toBe("full");
    expect(defaultReportFormat(null)).toBe("full");
    expect(reportFormatOption("full")).toBeUndefined();
    expect(reportFormatOption("summary")).toBe("summary");
  });

  it("carries the format on a draft export ticket only", () => {
    const ticket = createExportTicket(7, 4, "pdf", "condensed-fcp", undefined, "summary");
    expect(verifyExportTicket(ticket)).toMatchObject({ documentType: "condensed-fcp", reportFormat: "summary" });
    expect(verifyExportTicket(createExportTicket(7, 4, "pdf", "condensed-fcp"))?.reportFormat).toBeUndefined();
    expect(verifyExportTicket(createExportTicket(7, 4, "pdf", "plan-output", undefined, "summary"))).toBeNull();
  });
});

describe("hours reconciliation", () => {
  it("counts delivered plus planned against the entitlement", () => {
    const reconciled = acmeHealthReconciled();
    expect(reconcileHours(reconciled, scopedEffortForDocument(reconciled, FIXTURE_TODAY), FIXTURE_TODAY)).toEqual({ delivered: 39, planned: 223, entitled: 262, deliveredAsOf: "2026-09-03", balanced: true, difference: 0 });
    expect(fundingProblem(reconciled, scopedEffortForDocument(reconciled, FIXTURE_TODAY), FIXTURE_TODAY)).toBeNull();
  });

  it("names an under-funded plan and a plan that leaves hours unplanned, for the planner", () => {
    const over = acmeHealth();
    expect(fundingProblem(over, scopedEffortForDocument(over, FIXTURE_TODAY), FIXTURE_TODAY)).toBe("Under-funded: 39 hours delivered plus 347 planned is 124 more than the 262-hour entitlement. Move work to the follow-on or reduce hours in the Plan section.");
    const under = acmeHealthReconciled();
    under.report.workPackageHours.push({ id: "bar-platform-handover", architect: 1, srConsultant: 0, projectManager: 0, placement: "auto", owner: "auto" });
    expect(fundingProblem(under, scopedEffortForDocument(under, FIXTURE_TODAY), FIXTURE_TODAY)).toMatch(/^39 hours delivered plus 213 planned leaves 10 of the 262-hour entitlement unplanned\./);
  });

  it("has nothing to reconcile without entitled hours, and falls back to the fit's under-funded flag", () => {
    const northwind = northwindMfg();
    expect(reconcileHours(northwind, scopedEffortForDocument(northwind, FIXTURE_TODAY), FIXTURE_TODAY)).toBeNull();
    expect(fundingProblem(northwind, scopedEffortForDocument(northwind, FIXTURE_TODAY), FIXTURE_TODAY)).toBeNull();
  });
});

describe("Summary FCP", () => {
  it("renders Acme Health as issued, byte-identical to the golden copy, and passes the content checks", async () => {
    const document = acmeHealthReconciled();
    const html = summary(document);
    expect(checks(html, document)).toEqual([]);
    await expect(html).toMatchFileSnapshot("./__golden__/summary-acme-health.html");
  });

  it("puts the version and issue date in the header and on every page's footer", () => {
    const html = summary(acmeHealthReconciled());
    expect(html).toContain("<b>Version 1</b>Issued 30 Sep 2026");
    expect(html).toContain('"Functional Consumption Plan · Acme Health · Version 1 · Page " counter(page) " of " counter(pages)');
    const draft = summary(acmeHealthReconciled(), { draft: true });
    expect(draft).toContain("<b>Working draft</b>Prepared 30 Sep 2026");
    expect(draft).toContain('Acme Health · Working draft · Page " counter(page)');
    expect(draft).toContain('class="draft-mark"');
    expect(summary(acmeHealthReconciled())).not.toContain('class="draft-mark"');
  });

  it("prints delivered hours as their own row and reconciles them with the plan", () => {
    const text = visible(summary(acmeHealthReconciled()));
    expect(text).toContain("Delivered to Date Hours delivered to date Apr – Sep 2026 39");
    expect(text).toContain("Total, funded by the entitlement 262");
    expect(text).toContain("39 delivered plus 223 planned equals the 262-hour entitlement");
    // The plan as scheduled: discovery was delivered, so it is not planned again.
    expect(text).not.toContain("Greenfield Discovery Sessions and Funding Oct 2026");
  });

  it("never prints the under-funded gap, the buckets or the reserve, and makes no equality claim it cannot keep", () => {
    const document = acmeHealth();
    const html = summary(document);
    const text = visible(html);
    for (const term of ["Under-funded", "under-funded", "Scope by Bucket", "reserve", "more than it funds", "Moved out of", "gap"]) expect(text).not.toContain(term);
    expect(text).toContain("Total CDW hours 386");
    expect(text).not.toContain("equals the");
    expect(checks(html, document)).toEqual([]);
  });

  it("caps key dates, commitments and open items, and says where the rest are", () => {
    const document = acmeHealthReconciled();
    document.report.customerAsks = Array.from({ length: 6 }, (_, index) => `Ask ${index + 1}: something the team provides`);
    document.report.openItems = Array.from({ length: 5 }, (_, index) => ({ item: `Open item ${index + 1}`, gates: "Design", owner: "Pat Rivera" }));
    document.report.milestonesToDate = [...document.report.milestonesToDate, ...["2026-10-15", "2026-11-15", "2026-12-15", "2027-02-15"].map(date => ({ date, event: `Checkpoint ${date}`, detail: "" }))];
    const html = summary(document);
    const asks = html.split('<ul class="asks">')[1].split("</ul>")[0];
    expect(count(asks, /<li>/g)).toBe(SUMMARY_CAPS.commitments);
    expect(count(html.split('<table class="open">')[1].split("</table>")[0], /<tr>/g)).toBe(SUMMARY_CAPS.openItems);
    const dates = html.split('<div class="dates">')[1].split("</div></div>")[0];
    expect(count(dates, /<div><b>/g)).toBe(SUMMARY_CAPS.keyDates);
    expect(dates).toContain("Entitlement ends");
    expect(count(html, /See the full list in the Standard FCP\./g)).toBe(3);
  });

  it("leaves out sections with nothing to show", () => {
    const document = northwindMfg();
    const html = summary(document);
    for (const heading of ["Delivered to Date", "After This Plan", "See the full list"]) expect(html).not.toContain(heading);
    expect(visible(html)).toContain("Planned CDW Hours");
    expect(checks(html, document)).toEqual([]);
  });

  it("draws a BSAS-only deal in hours, with no dollar figure", () => {
    const document = riverbendHealth();
    const html = summary(document);
    expect(visible(html)).not.toMatch(/\$\d/);
    expect(visible(html)).toContain("Broadcom Software Adoption Services");
    expect(checks(html, document)).toEqual([]);
  });

  it("keeps the long report when no format is chosen", () => {
    const document = acmeHealth();
    const effort = scopedEffortForDocument(document, FIXTURE_TODAY);
    const long = renderCondensedFcpHtml("Acme Health", document, { effort, today: FIXTURE_TODAY });
    expect(long).toContain("Executive Summary");
    expect(long).not.toContain("Functional Consumption Plan · Summary");
    // The issue stamp only applies to a format.
    expect(renderCondensedFcpHtml("Acme Health", document, { effort, today: FIXTURE_TODAY, version: VERSION })).toBe(long);
  });
});
