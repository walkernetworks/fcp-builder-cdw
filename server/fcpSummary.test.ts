import { describe, expect, it } from "vitest";
import type { EngagementDocument } from "../shared/fcp";
import { deliveredNotes } from "../shared/consumption";
import { defaultReportFormat, fundingProblem, reconcileHours, reportFormatOption } from "../shared/reportFormat";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { createExportTicket, verifyExportTicket } from "./exportTickets";
import { SUMMARY_CAPS } from "./fcpSummaryRenderer";
import { acmeHealth, acmeHealthReconciled, acmeHealthUnderFunded, FIXTURE_TODAY, northwindMfg, riverbendHealth } from "./fixtures/fcpFixtures";
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
  it("counts delivered, planned and the reserve against the entitlement", () => {
    const reconciled = acmeHealthReconciled();
    expect(reconcileHours(reconciled, scopedEffortForDocument(reconciled, FIXTURE_TODAY), FIXTURE_TODAY)).toEqual({ delivered: 39, planned: 205, reserve: 18, entitled: 262, deliveredAsOf: "2026-09-03", balanced: true, exact: true, difference: 0 });
    expect(fundingProblem(reconciled, scopedEffortForDocument(reconciled, FIXTURE_TODAY), FIXTURE_TODAY)).toBeNull();
  });

  it("names an under-funded plan and a plan that leaves hours unplanned, for the planner", () => {
    const over = acmeHealthUnderFunded();
    const problem = fundingProblem(over, scopedEffortForDocument(over, FIXTURE_TODAY), FIXTURE_TODAY);
    expect(problem).toContain("Under-funded: 39 delivered, 191 planned and 4 held in reserve come to 144 hours more than the 90-hour entitlement. Move work to the follow-on or reduce hours in the Plan section.");
    // Rule 5: the internal problem says how many more hours the full scope needs.
    expect(problem).toMatch(/The full scope needs 219 more hours than the entitlement funds after the reserve \(148 more for the minimum that can be delivered\)\./);
    // Without the hours-fill package, the 6 hours the whole packages leave over are not planned.
    const under = acmeHealth();
    expect(fundingProblem(under, scopedEffortForDocument(under, FIXTURE_TODAY), FIXTURE_TODAY)).toBe("6 hours are not planned and will be forfeited at term end (39 delivered, 199 planned and 18 held in reserve, against the 262-hour entitlement). Plan them in the Plan section.");
  });

  it("never moves a package to the follow-on for hours: a large estate whose minimum does not fit is under-funded, whole", () => {
    const document = acmeHealth();
    Object.assign(document.inventory, { hosts: 120, clusters: 8 });
    document.report.entitlement.hours = 380;
    const effort = scopedEffortForDocument(document, FIXTURE_TODAY);
    expect(effort.workPackages.filter(row => row.deferred === "over budget")).toEqual([]);
    expect(effort.internal.fit?.underFunded?.gapHours).toBeGreaterThan(0);
    expect(effort.workPackages.every(row => !(row.total > 0 && (row.followOn?.total ?? 0) > 0))).toBe(true);
  });

  it("allows an hour either way for rounding, and says so on the page instead of claiming the figures are equal", () => {
    const document = acmeHealth();
    document.report.workPackageHours.push({ id: "bar-platform-handover", architect: 1, srConsultant: 11, projectManager: 4, placement: "auto", owner: "auto" });
    const effort = scopedEffortForDocument(document, FIXTURE_TODAY);
    expect(reconcileHours(document, effort, FIXTURE_TODAY)).toMatchObject({ planned: 204, balanced: true, exact: false, difference: -1 });
    expect(fundingProblem(document, effort, FIXTURE_TODAY)).toBeNull();
    const text = visible(summary(document));
    expect(text).toContain("39 delivered, 204 planned and 18 held for change requests use the 262-hour entitlement, to within an hour of rounding");
    expect(text).toContain("Total, funded by the entitlement 261");
    document.report.workPackageHours.push({ id: "bar-platform-enablement", architect: 0, srConsultant: 4, projectManager: 0, placement: "auto", owner: "auto" });
    expect(fundingProblem(document, scopedEffortForDocument(document, FIXTURE_TODAY), FIXTURE_TODAY)).toMatch(/^3 hours are not planned/);
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

  it("prints delivered hours and the reserve as their own rows, so the column adds up to the entitlement", () => {
    const text = visible(summary(acmeHealthReconciled()));
    expect(text).toContain("Delivered to Date Hours delivered to date Apr – Sep 2026 39");
    expect(text).toContain("Total, funded by the entitlement 262");
    expect(text).toContain("Held for change requests, released to follow-on work if unused 18 Total, funded by the entitlement 262");
    expect(text).toContain("39 delivered, 205 planned and 18 held for change requests add up to the 262-hour entitlement");
    // The plan as scheduled: discovery was delivered, so it is not planned again.
    expect(text).not.toContain("Greenfield Discovery Sessions and Funding Oct 2026");
  });

  it("labels the delivered row with the consumption notes, oldest first, up to the printed figure", () => {
    expect(deliveredNotes([{ asOf: "2026-09-03", note: "Design discovery." }, { asOf: "2026-07-21", note: "Assessment" }, { asOf: "2026-08-01", note: " " }, { asOf: "2026-08-15", note: "Assessment" }, { asOf: "2026-12-01", note: "Kickoff" }], "2026-09-03")).toEqual(["Assessment", "Design discovery"]);
    expect(deliveredNotes([{ asOf: "2026-09-03", note: null }], "2026-09-03")).toEqual([]);
    const html = renderCondensedFcpHtml("Acme Health", acmeHealthReconciled(), { effort: scopedEffortForDocument(acmeHealthReconciled(), FIXTURE_TODAY), today: FIXTURE_TODAY, format: "summary", version: VERSION, deliveredNotes: ["Assessment", "Design discovery"] });
    expect(visible(html)).toContain("Delivered to Date Assessment; Design discovery Apr – Sep 2026 39");
  });

  it("never prints the under-funded gap or the buckets, and makes no equality claim it cannot keep", () => {
    const document = acmeHealthUnderFunded();
    const html = summary(document);
    const text = visible(html);
    for (const term of ["Under-funded", "under-funded", "Scope by Bucket", "reserve", "more than it funds", "Moved out of", "gap", "bucket"]) expect(text).not.toContain(term);
    expect(text).toContain("Total CDW hours 234");
    expect(text).not.toMatch(/add up to the|use the 262/);
    expect(checks(html, document)).toEqual([]);
  });

  it("checks that the work packages column foots", () => {
    const document = acmeHealthReconciled();
    const html = summary(document).replace('Total, funded by the entitlement</td><td></td><td class="num">262', 'Total, funded by the entitlement</td><td></td><td class="num">270');
    expect(checks(html, document)).toEqual(["A table column does not foot: column 3 totals 270 but its rows sum to 262."]);
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
    document.twoYearPlan = { ...document.twoYearPlan, lanes: document.twoYearPlan.lanes.map(lane => ({ ...lane, bars: [] })) };
    const html = summary(document);
    for (const heading of ["Delivered to Date", "After This Plan", "After the Entitlement", "See the full list"]) expect(html).not.toContain(heading);
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
