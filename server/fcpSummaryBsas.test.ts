import { describe, expect, it } from "vitest";
import type { EngagementDocument } from "../shared/fcp";
import { fundingProblem } from "../shared/reportFormat";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { FIXTURE_TODAY, meridianHealth, riverbendHealth } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

const VERSION = { issueNumber: 1, issuedOn: FIXTURE_TODAY };
const summary = (document: EngagementDocument) =>
  renderCondensedFcpHtml(document.fields.customerName, document, { effort: scopedEffortForDocument(document, FIXTURE_TODAY), today: FIXTURE_TODAY, format: "summary", version: VERSION });
const checks = (html: string, document: EngagementDocument) => checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount, bsasOnly: document.fields.fundingSource === "bsas", format: "summary" });
const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("Summary with BSAS", () => {
  it("BSAS only: the fact strip shows the BSAS hours and term, and no dollar figure (golden)", async () => {
    const document = riverbendHealth();
    const html = summary(document);
    const text = visible(html);
    expect(text).toContain("400 hrs");
    expect(text).toContain("Broadcom Software Adoption Services");
    expect(text).toMatch(/BSAS hours · .*2027/);
    expect(text).not.toMatch(/\$\s?\d/);
    expect(checks(html, document)).toEqual([]);
    await expect(html).toMatchFileSnapshot("./__golden__/summary-riverbend-health.html");
  });

  it("entitlement plus BSAS: After This Plan names the BSAS hours, term and forfeiture, in hours and dates only (golden)", async () => {
    const document = meridianHealth();
    const html = summary(document);
    const after = visible(html).split("After This Plan")[1] ?? "";
    expect(after).toContain("(BSAS) provide 600 hours from 1 May 2027 to 30 Apr 2028. 247 hours are planned; 353 hours are not planned and will be forfeited at term end.");
    expect(after).not.toMatch(/\$\s?\d|rate|tier/i);
    expect(checks(html, document)).toEqual([]);
    await expect(html).toMatchFileSnapshot("./__golden__/summary-meridian-health.html");
  });
});

describe("compatibility setting", () => {
  it("is ignored by the Summary: it renders the same with the compatibility summary on or off", () => {
    const on = riverbendHealth();
    on.fields.exportPreferences.includeVcfReadiness = true;
    const off = riverbendHealth();
    off.fields.exportPreferences.includeVcfReadiness = false;
    expect(summary(on)).toBe(summary(off));
    expect(visible(summary(on))).not.toMatch(/Compatibility Actions|Host Findings|Planning Considerations|ESXi 9\.1 Compatibility/);
  });
});

describe("funding problems, per pool", () => {
  const problem = (document: EngagementDocument) => fundingProblem(document, scopedEffortForDocument(document, FIXTURE_TODAY), FIXTURE_TODAY);

  it("BSAS hours no planned follow-on work draws on are forfeited, and need a reason", () => {
    const message = problem(meridianHealth());
    expect(message).toMatch(/\d+ hours are not planned and will be forfeited at term end \(\d+ planned against the 600-hour BSAS allocation, 2027-05-01 to 2028-04-30\)\./);
  });

  it("stays quiet within one hour of rounding either way", () => {
    const document = meridianHealth();
    const effort = scopedEffortForDocument(document, FIXTURE_TODAY);
    const planned = Math.round(effort.workPackages.reduce((sum, row) => sum + (row.followOn?.total ?? 0), 0));
    document.fields.bsasHours = planned + 1;
    expect(problem(document) ?? "").not.toMatch(/BSAS allocation/);
    document.fields.bsasHours = planned + 2;
    expect(problem(document)).toMatch(/2 hours are not planned and will be forfeited at term end \(\d+ planned against the \d+-hour BSAS allocation/);
  });

  it("checks the entitlement and BSAS separately, and a BSAS-only deal against its own hours", () => {
    expect(problem(riverbendHealth())).not.toMatch(/BSAS allocation/);
  });
});
