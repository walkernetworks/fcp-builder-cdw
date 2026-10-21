import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { allocateBsas, bsasTerm } from "../shared/bsas";
import { applyCustomerBrief } from "../shared/briefImport";
import { copilotBriefPrompt } from "../shared/briefPrompt";
import { createDefaultDocument, engagementDocumentSchema, migrateDocument, type EngagementDocument } from "../shared/fcp";
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
const bsasEngagement = (bsas: Record<string, unknown> = { hours: 600 }) => engagement(raw => {
  raw.customer.name = "Example Health System";
  raw.bsas = { ...bsas, amount: FAKE_BSAS_AMOUNT, rate: 271, tier: "Tier Zeta" };
});

describe("BSAS schema and migration", () => {
  it("loads a saved engagement from before BSAS with no BSAS block", () => {
    const saved = JSON.parse(JSON.stringify(engagement()));
    delete saved.report.bsas;
    expect(saved.version).toBe(11);
    const loaded = engagementDocumentSchema.parse(saved);
    expect(loaded.report.bsas).toBeNull();
    expect(migrateDocument(saved).report.bsas).toBeNull();
  });

  it("keeps a BSAS block through a save and load", () => {
    const loaded = engagementDocumentSchema.parse(JSON.parse(JSON.stringify(bsasEngagement({ hours: 600, termStart: "2027-11-01", termEnd: "2028-10-31" }))));
    expect(loaded.report.bsas).toEqual({ hours: 600, termStart: "2027-11-01", termEnd: "2028-10-31" });
  });

  it("takes hours and dates from the brief and never the amount, rate or tier", () => {
    const base = createDefaultDocument();
    const raw = brief();
    raw.bsas = { hours: 600, termStart: "2027-11-01", termEnd: null, amount: FAKE_BSAS_AMOUNT, rate: 271, tier: "Tier Zeta" };
    const result = applyCustomerBrief(base, raw);
    expect(result.document.report.bsas).toEqual({ hours: 600, termStart: "2027-11-01", termEnd: null });
    expect(result.warnings.join(" ")).toContain("only BSAS hours and term dates are kept");
    const stored = JSON.stringify(result.document);
    for (const internal of [String(FAKE_BSAS_AMOUNT), "Tier Zeta", "\"rate\":271"]) expect(stored).not.toContain(internal);
  });

  it("asks Copilot for BSAS hours and dates only", () => {
    const prompt = copilotBriefPrompt(createDefaultDocument());
    expect(prompt).toContain(`"bsas": { "hours": null, "termStart": null, "termEnd": null }`);
    expect(prompt).toContain("Never include the BSAS dollar amount, its rates or its rate tier.");
  });
});

describe("BSAS planning", () => {
  const term = (hours: number, termStart = "2027-11-01", termEnd = "2028-10-31") => bsasTerm({ bsas: { hours, termStart, termEnd } }, null)!;

  it("is absent without BSAS hours", () => {
    expect(bsasTerm({ bsas: null }, "2027-10-01")).toBeNull();
    expect(bsasTerm({ bsas: { hours: 0, termStart: "2027-11-01", termEnd: null } }, null)).toBeNull();
    expect(bsasTerm({ bsas: { hours: 100, termStart: null, termEnd: null } }, null)).toBeNull();
  });

  it("starts the day after the entitlement ends and runs twelve months when the dates are not stated", () => {
    expect(bsasTerm({ bsas: { hours: 100, termStart: null, termEnd: null } }, "2027-10-01")).toEqual({ hours: 100, termStart: "2027-10-02", termEnd: "2028-10-01", startAssumed: true, endAssumed: true });
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
    const without = scopedEffortForDocument(engagement(raw => { raw.customer.name = "Example Health System"; }), TODAY);
    const withBsas = scopedEffortForDocument(bsasEngagement(), TODAY);
    expect(withBsas.totals).toEqual(without.totals);
    expect(withBsas.workPackages).toEqual(without.workPackages);
  });
});

describe("BSAS in the documents", () => {
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

  it("goes back to the entitlement-only output when the BSAS block is cleared", () => {
    const cleared = { ...document, report: { ...document.report, bsas: null } };
    expect(condensed(cleared)).toBe(condensed(engagement(raw => { raw.customer.name = "Example Health System"; })));
  });
});
