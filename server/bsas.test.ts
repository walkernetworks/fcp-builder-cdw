import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allocateBsas, bsasTerm, fundedDocument } from "../shared/bsas";
import { applyCustomerBrief } from "../shared/briefImport";
import { copilotBriefPrompt } from "../shared/briefPrompt";
import { createDefaultDocument, engagementDocumentSchema, fundedFields, migrateDocument, type EngagementDocument } from "../shared/fcp";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { renderFcpHtml } from "./fcpRenderer";
import { scopedEffortForDocument } from "./rateCard";

const TODAY = "2026-09-30";
const brief = () => JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../docs/examples/customer-brief.example.json"), "utf8"));

function engagement(patch: (raw: any) => void = () => {}): EngagementDocument {
  const base = createDefaultDocument();
  base.fields.priorities = [];
  Object.assign(base.fields, { plannedProjectStart: "2026-10-01", plannedImplementationStart: "2026-12-01" });
  const raw = brief();
  patch(raw);
  return applyCustomerBrief(base, raw).document;
}

const condensed = (document: EngagementDocument) => renderCondensedFcpHtml("Example Health System", document, { effort: scopedEffortForDocument(document, TODAY), today: TODAY });
const full = (document: EngagementDocument) => renderFcpHtml("Example Health System", document);
const text = (html: string) => html.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("entitlement-only output (no BSAS)", () => {
  // Captured from main before BSAS support was added: an engagement without BSAS must render exactly as it did.
  it("renders the condensed FCP byte-identical to the golden copy", async () => {
    await expect(condensed(engagement())).toMatchFileSnapshot("./__golden__/condensed-no-bsas.html");
  });

  it("renders the full FCP byte-identical to the golden copy", async () => {
    await expect(full(engagement())).toMatchFileSnapshot("./__golden__/full-no-bsas.html");
  });
});

// Generic BSAS deal: the example brief plus a BSAS block. The amount, rate and tier are obviously fake and must never
// reach the document or the output; the brief import keeps hours and dates only.
const FAKE_BSAS_AMOUNT = 424242;
const named = (raw: any) => { raw.customer.name = "Example Health System"; };
const bsasEngagement = (bsas: Record<string, unknown> = { hours: 600 }) => engagement(raw => {
  named(raw);
  raw.bsas = { ...bsas, amount: FAKE_BSAS_AMOUNT, rate: 271, tier: "Tier Zeta" };
});
// BSAS only: no entitlement value or entitled hours, and no customer-entered text that names the entitlement.
const bsasOnlyEngagement = () => engagement(raw => {
  named(raw);
  raw.entitlement = { hoursConsumed: 40, consumedAsOf: "2026-09-03" };
  raw.milestonesToDate = [];
  raw.bsas = { hours: 400, termStart: "2026-10-01", termEnd: "2027-09-30", amount: FAKE_BSAS_AMOUNT, rate: 271, tier: "Tier Zeta" };
});

describe("funding source and migration", () => {
  it("loads a saved engagement from before BSAS as entitlement only", () => {
    const saved = JSON.parse(JSON.stringify(engagement()));
    for (const key of ["fundingSource", "bsasHours", "bsasStart", "bsasEnd"]) delete saved.fields[key];
    expect(saved.version).toBe(11);
    for (const loaded of [engagementDocumentSchema.parse(saved), migrateDocument(saved)]) {
      expect(loaded.fields).toMatchObject({ fundingSource: "entitlement", bsasHours: 0, bsasStart: "", bsasEnd: "" });
    }
  });

  it("keeps the funding source and BSAS fields through a save and load", () => {
    const loaded = engagementDocumentSchema.parse(JSON.parse(JSON.stringify(bsasEngagement({ hours: 600, termStart: "2027-05-01", termEnd: "2028-04-30" }))));
    expect(loaded.fields).toMatchObject({ fundingSource: "entitlement-bsas", bsasHours: 600, bsasStart: "2027-05-01", bsasEnd: "2028-04-30" });
  });

  it("takes hours and dates from the brief and never the amount, rate or tier", () => {
    const result = applyCustomerBrief(createDefaultDocument(), { ...brief(), bsas: { hours: 600, termStart: "2027-05-01", amount: FAKE_BSAS_AMOUNT, rate: 271, tier: "Tier Zeta" } });
    expect(result.document.fields).toMatchObject({ fundingSource: "entitlement-bsas", bsasHours: 600, bsasStart: "2027-05-01", bsasEnd: "" });
    expect(result.warnings.join(" ")).toContain("only BSAS hours and term dates are kept");
    const stored = JSON.stringify(result.document);
    for (const internal of [String(FAKE_BSAS_AMOUNT), "Tier Zeta", "\"rate\":271"]) expect(stored).not.toContain(internal);
  });

  it("sets BSAS only when the brief has BSAS hours and no entitlement value", () => {
    const document = bsasOnlyEngagement();
    expect(document.fields).toMatchObject({ fundingSource: "bsas", entitlementAmount: 0, bsasHours: 400 });
  });

  it("asks Copilot for BSAS hours and dates only", () => {
    const prompt = copilotBriefPrompt(createDefaultDocument());
    expect(prompt).toContain(`"bsas": { "hours": null, "termStart": null, "termEnd": null }`);
    expect(prompt).toContain("Never include the BSAS dollar amount, its rates or its rate tier.");
  });
});

describe("BSAS after the entitlement: planning", () => {
  const funding = (bsasHours: number, bsasStart = "", bsasEnd = "") => ({ fundingSource: "entitlement-bsas" as const, bsasHours, bsasStart, bsasEnd });
  const term = (hours: number, start = "2027-11-01", end = "2028-10-31") => bsasTerm(funding(hours, start, end), null)!;

  it("is absent for other funding sources or without BSAS hours", () => {
    expect(bsasTerm({ ...funding(100, "2027-11-01"), fundingSource: "entitlement" }, null)).toBeNull();
    expect(bsasTerm({ ...funding(100, "2027-11-01"), fundingSource: "bsas" }, null)).toBeNull();
    expect(bsasTerm(funding(0, "2027-11-01"), null)).toBeNull();
    expect(bsasTerm(funding(100), null)).toBeNull();
  });

  it("starts the day after the entitlement ends and runs twelve months when the dates are not stated", () => {
    expect(bsasTerm(funding(100), "2027-10-01")).toEqual({ hours: 100, termStart: "2027-10-02", termEnd: "2028-10-01", startAssumed: true, endAssumed: true });
  });

  it("draws follow-on work on BSAS in start order until the hours run out", () => {
    const plan = allocateBsas(term(300), [
      { id: "b", label: "Later", hours: 200, start: "2028-03-01", end: "2028-04-30" },
      { id: "a", label: "First", hours: 200, start: "2027-11-01", end: "2027-12-31" },
    ]);
    expect(plan.rows.map(row => [row.id, row.bsasHours])).toEqual([["a", 200], ["b", 100]]);
    expect(plan).toMatchObject({ plannedHours: 300, forfeitedHours: 0, unfundedHours: 100 });
  });

  it("funds only the share of a work package inside the BSAS term and forfeits what is left", () => {
    const plan = allocateBsas(term(1000), [
      // Half of this window (two of four months, by day) is after the term ends.
      { id: "straddle", label: "Straddles the end", hours: 100, start: "2028-09-01", end: "2028-12-31" },
      { id: "after", label: "After the term", hours: 50, start: "2029-01-01", end: "2029-02-28" },
    ]);
    const byId = Object.fromEntries(plan.rows.map(row => [row.id, row.bsasHours]));
    expect(byId.straddle).toBeGreaterThan(45);
    expect(byId.straddle).toBeLessThan(55);
    expect(byId.after).toBe(0);
    expect(plan.forfeitedHours).toBe(1000 - byId.straddle);
    expect(plan.unfundedHours).toBe(150 - byId.straddle);
  });

  it("never uses BSAS before its own term starts", () => {
    const plan = allocateBsas(term(500), [{ id: "early", label: "Before BSAS", hours: 80, start: "2027-08-01", end: "2027-09-30" }]);
    expect(plan.rows[0].bsasHours).toBe(0);
    expect(plan.forfeitedHours).toBe(500);
  });

  it("leaves the entitlement plan unchanged: the entitlement is always spent first", () => {
    const without = scopedEffortForDocument(engagement(named), TODAY);
    const withBsas = scopedEffortForDocument(bsasEngagement(), TODAY);
    expect(withBsas.totals).toEqual(without.totals);
    expect(withBsas.workPackages).toEqual(without.workPackages);
  });
});

describe("BSAS after the entitlement: documents", () => {
  const document = bsasEngagement();
  const html = condensed(document);
  const visible = text(html);

  it("shows BSAS as hours and dates in the follow-on scope, the notional and key dates, and passes the content gates", () => {
    expect(checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount })).toEqual([]);
    expect(visible).toContain("BSAS Hours");
    expect(visible).toContain("Broadcom Software Adoption Services (BSAS) fund");
    expect(visible).toContain("BSAS term ends: BSAS hours not used by this date are forfeited.");
    expect(visible).toMatch(/BSAS funds up to 600 hours/);
  });

  it("adds BSAS to the full FCP plan summary and Two-Year Notional", () => {
    const fullText = text(full(document));
    expect(fullText).toContain("600 BSAS hours are available from");
    expect(fullText).toContain("Broadcom Software Adoption Services (BSAS) fund up to 600 hours");
  });

  it("goes back to the entitlement-only output when the funding source is set back to entitlement only", () => {
    const back = { ...document, fields: { ...document.fields, fundingSource: "entitlement" as const } };
    expect(condensed(back)).toBe(condensed(engagement(named)));
  });
});

describe("BSAS only", () => {
  const document = bsasOnlyEngagement();
  const effort = scopedEffortForDocument(document, TODAY);
  const html = condensed(document);
  const visible = text(html);
  const fullText = text(full(document));

  it("plans on the BSAS term and BSAS hours in the entitlement's place", () => {
    expect(fundedFields(document.fields)).toMatchObject({ entitlementAmount: 0, entitlementStart: "2026-10-01", entitlementEnd: "2027-09-30" });
    expect(effort.internal).toMatchObject({ envelopeHours: 400, envelopeSource: "entitled hours" });
    expect(effort.totals.total).toBeGreaterThan(0);
    expect(effort.totals.total).toBeLessThanOrEqual(400);
    // The entitlement window ends with the BSAS term.
    expect(document.adoptionTimeline.columns.at(-1)).toMatch(/Sep.*27|2027-09/);
  });

  it("runs the BSAS term to the end the planner entered, not a fixed twelve months", () => {
    const short = { ...document, fields: { ...document.fields, bsasEnd: "2027-03-31" } };
    expect(fundedFields(short.fields).entitlementEnd).toBe("2027-03-31");
    expect(fundedDocument(short).report.entitlement).toMatchObject({ hours: 400, termStart: "2026-10-01", termEnd: "2027-03-31", hoursConsumed: 40 });
  });

  it("carries no dollar figure and passes the BSAS-only content gate", () => {
    expect(visible).not.toMatch(/\$\s?\d/);
    expect(fullText).not.toMatch(/\$\s?\d/);
    expect(checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount, bsasOnly: true })).toEqual([]);
    expect(checkCondensedFcp(html.replace("Executive Summary", "Executive Summary $79,403"), { customerName: document.fields.customerName, entitlementValue: 0, bsasOnly: true }).join(" ")).toContain("A BSAS-only plan carries no dollar figure");
    for (const internal of ["424,242", "424242", "Zeta"]) { expect(visible).not.toContain(internal); expect(fullText).not.toContain(internal); }
  });

  it("names BSAS, not an entitlement, throughout both documents", () => {
    expect(visible).toContain("BSAS Burndown");
    expect(visible).toContain("Broadcom Software Adoption Services");
    expect(fullText).toContain("BSAS Adoption Timeline");
    expect(fullText).toContain("400 BSAS hours");
    const mentions = (value: string) => Array.from(value.matchAll(/.{0,60}entitlement.{0,60}/gi), match => match[0]);
    expect(mentions(visible)).toEqual([]);
    expect(mentions(fullText)).toEqual([]);
  });
});
