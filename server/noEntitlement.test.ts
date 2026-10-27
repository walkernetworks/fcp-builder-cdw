import { describe, expect, it } from "vitest";
import type { EngagementDocument } from "../shared/fcp";
import { refreshDerivedDocument } from "../shared/fcp";
import { customerOpenItems, internalOpenItems, ownedOnlyByUs, termEndAssumed } from "../shared/reportView";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { bottomRow } from "./fcpSummaryRenderer";
import { cedarRidgeLogistics, FIXTURE_TODAY } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

// A record with nothing booked: no entitlement value, hours or term. Every customer format must still read as a plan.

const render = (document: EngagementDocument, format?: "summary") =>
  renderCondensedFcpHtml(document.fields.customerName, document, { effort: scopedEffortForDocument(document, FIXTURE_TODAY), today: FIXTURE_TODAY, ...(format ? { format } : {}) });
const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const tiles = (html: string) => Array.from(html.matchAll(/<div class="kpi"><div class="v">(.*?)<\/div><div class="l">(.*?)<\/div>/g), match => `${match[2]}: ${match[1]}`);

describe("no entitlement booked: the long report", () => {
  it("says the entitlement is not booked instead of repeating the planned hours", () => {
    const labels = tiles(render(cedarRidgeLogistics())).map(tile => tile.split(":")[0]);
    expect(labels).toEqual(["Entitlement", "Scoped Effort", "Planned Completion", "Target Platform"]);
    expect(tiles(render(cedarRidgeLogistics()))[0]).toBe("Entitlement: Not yet booked");
  });
});

describe("no entitlement booked: the Summary", () => {
  const summary = (document: EngagementDocument) => render(document, "summary");
  const check = (html: string, document: EngagementDocument) => checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount, format: "summary" });

  it("renders the Cedar Ridge Logistics Summary byte-identical to the golden copy, and passes the content checks", async () => {
    const document = cedarRidgeLogistics();
    const html = summary(document);
    expect(check(html, document)).toEqual([]);
    await expect(html).toMatchFileSnapshot("./__golden__/summary-cedar-ridge-logistics.html");
  });

  it("shows the plan's hours once, its dates, and says the entitlement is not booked", () => {
    expect(tiles(summary(cedarRidgeLogistics()))).toEqual(["Planned CDW Hours: 348 hrs", "Plan Starts: 2 Nov 2026", "Planned Completion: 31 Jul 2027", "Entitlement: Not yet booked"]);
  });

  it("calls it the planned delivery window, never the entitlement window", () => {
    const text = visible(summary(cedarRidgeLogistics()));
    expect(text).toContain("2 November 2026 through 31 July 2027, the planned delivery window.");
    expect(text).not.toMatch(/entitlement (window|ends)/i);
    expect(text).not.toContain("No entitlement booked yet");
  });

  it("prints key dates from the plan alone, including a plan with no start date set", () => {
    const text = visible(summary(cedarRidgeLogistics()));
    expect(text).toContain("Key Dates 2 Nov 2026 Design and planning start 1 Feb 2027 Platform build begins 31 Jul 2027 Planned completion");
    const undated = cedarRidgeLogistics();
    undated.fields.plannedProjectStart = "";
    undated.fields.plannedImplementationStart = "";
    const dates = visible(summary(undated));
    expect(dates).toContain("Key Dates");
    expect(dates).toMatch(/Planned completion/);
  });

  it("leaves an empty column out and lets the others share its width", () => {
    const full = summary(cedarRidgeLogistics());
    expect(full).toContain('<div class="bottom" style="grid-template-columns:1fr 1.15fr 0.9fr">');
    // Whichever column is empty is left out, and the rest share the row.
    expect(bottomRow([[1, ""], [1.15, "<p>needs</p>"], [0.9, "<p>after</p>"]])).toBe('<div class="bottom" style="grid-template-columns:1.15fr 0.9fr"><div><p>needs</p></div><div><p>after</p></div></div>');
    expect(bottomRow([[1, "<p>dates</p>"], [1.15, ""], [0.9, "<p>after</p>"]])).toContain("grid-template-columns:1fr 0.9fr");
  });

  it("keeps the signed-hours item off the page", () => {
    expect(visible(summary(cedarRidgeLogistics()))).not.toContain("Entitled hours from the signed resource assignments");
  });

  it("lists only the workstream types the chart uses, with shorter bar labels than the work package table", () => {
    const html = summary(cedarRidgeLogistics());
    const key = html.match(/<div class="timeline-legend">[\s\S]*?<\/div>/)![0];
    expect(visible(key)).toBe(" Delivery workstream key Governance Operating Model / Platform Infrastructure Build Migration Waves Customer-owned ◆ Checkpoint ");
    expect(key).not.toContain("Security &amp; Resiliency");
    const chart = html.split('class="timeline-wrap"')[1];
    expect(chart).toContain(">Discovery and Funding</div>");
    expect(chart).not.toContain("Greenfield Discovery Sessions and Funding</div>");
    expect(visible(html)).toContain("Greenfield Discovery Sessions and Funding Nov 2026");
  });

  it("keeps the entitlement window wording on a booked entitlement", () => {
    const booked = cedarRidgeLogistics();
    booked.fields.entitlementAmount = 90_000;
    booked.fields.entitlementStart = "2026-11-02";
    const text = visible(summary(booked));
    expect(text).toContain("the entitlement window.");
    expect(text).not.toContain("planned delivery window");
    expect(tiles(summary(booked))).not.toContain("Entitlement: Not yet booked");
  });
});

describe("customer open items: what the customer must do or decide", () => {
  const document = () => {
    const doc = cedarRidgeLogistics();
    doc.report.contacts = { customer: [{ name: "Pat Rivera", role: "Platform lead" }], cdw: [{ name: "Jordan Blake", role: "Architect" }], broadcom: [{ name: "Alex Kim", role: "PM" }] };
    return doc;
  };

  it("keeps an item the customer is named on and drops one owned only by CDW or Broadcom", () => {
    const doc = document();
    for (const owner of ["CDW account team", "Broadcom", "CDW pre-sales / Broadcom partner", "Jordan Blake", "Alex Kim (Broadcom PM)"]) expect(ownedOnlyByUs(owner, doc), owner).toBe(true);
    for (const owner of ["Cedar Ridge Logistics infrastructure team with CDW", "Cedar Ridge Logistics with CDW account team", "Pat Rivera", "Pat Rivera with Jordan Blake", "customer security lead", "", "Someone Else"]) expect(ownedOnlyByUs(owner, doc), owner).toBe(false);
  });

  it("filters both ways, so readiness can list what the customer formats leave out", () => {
    const doc = document();
    const items = [{ item: "Current RVTools export", gates: "Sizing", owner: "Pat Rivera" }, { item: "Confirm the Broadcom work plan", gates: "Hours", owner: "Broadcom" }];
    expect(customerOpenItems(items, doc).map(row => row.item)).toEqual(["Current RVTools export"]);
    expect(internalOpenItems(items, doc).map(row => row.item)).toEqual(["Confirm the Broadcom work plan"]);
  });

  it("leaves an item owned only by CDW or Broadcom off every customer format", () => {
    const doc = document();
    doc.report.openItems = [{ item: "Quote reconciled in the CDW system", gates: "Billing", owner: "CDW account team" }, { item: "Current RVTools export", gates: "Design sign-off and sizing", owner: "Pat Rivera" }];
    for (const html of [render(doc), render(doc, "summary")]) {
      expect(visible(html)).not.toContain("Quote reconciled in the CDW system");
      expect(visible(html)).toContain("Current RVTools export");
    }
  });

  it("no longer raises an assumed end date as an open item, and marks the date to be confirmed instead", () => {
    const doc = cedarRidgeLogistics();
    Object.assign(doc.fields, { entitlementAmount: 90_000, entitlementStart: "2026-11-02" });
    const refreshed = refreshDerivedDocument(doc, { forceRebuild: true });
    expect(refreshed.report.openItems.map(row => row.item).join(" ")).not.toMatch(/assumed as 12 months/);
    expect(termEndAssumed(refreshed)).toBe(true);
    const summaryText = visible(render(refreshed, "summary"));
    expect(summaryText).toContain("Entitlement ends; unused hours are not refunded (to be confirmed)");
    expect(summaryText).toContain("date to be confirmed");
    expect(summaryText).toMatch(/through 2 November 2027 \(to be confirmed\)/);
    expect(visible(render(refreshed))).toContain("(12 months from the start; to be confirmed)");
  });
});
