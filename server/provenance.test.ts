import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bsasTerm } from "../shared/bsas";
import { createDefaultDocument, type EngagementDocument } from "../shared/fcp";
import { confirmAssumedFunding, fundingProvenance } from "../shared/provenance";
import { reportTermEnd } from "../shared/reportView";
import { FCP_FIXTURES } from "./fixtures/fcpFixtures";

const ROOT = path.resolve(import.meta.dirname, "..");

function funded(patch: Partial<EngagementDocument["fields"]> = {}): EngagementDocument {
  const document = createDefaultDocument();
  Object.assign(document.fields, { customerName: "Acme Health", entitlementAmount: 250_000, entitlementStart: "2026-11-02", ...patch });
  return document;
}

describe("funding provenance", () => {
  it("marks entered values confirmed and missing ones unknown", () => {
    const facts = fundingProvenance(funded());
    expect(facts.entitlementAmount).toMatchObject({ state: "confirmed", value: 250_000 });
    expect(facts.entitlementStart).toMatchObject({ state: "confirmed", value: "2026-11-02" });
    expect(fundingProvenance(createDefaultDocument()).entitlementAmount.state).toBe("unknown");
    expect(fundingProvenance(createDefaultDocument()).entitlementEnd).toMatchObject({ state: "unknown", source: "Needs the start date" });
  });

  it("assumes the entitlement ends 12 months after it starts, as the FCP prints it, until a term end is stated", () => {
    const document = funded();
    expect(fundingProvenance(document).entitlementEnd).toMatchObject({ state: "assumed", source: "12 months from the start", value: reportTermEnd(document) });
    const stated = { ...document, report: { ...document.report, entitlement: { ...document.report.entitlement, termEnd: "2027-10-31" } } };
    expect(fundingProvenance(stated).entitlementEnd).toMatchObject({ state: "confirmed", value: "2027-10-31" });
  });

  it("uses the engine's BSAS term defaults after the entitlement", () => {
    const document = funded({ fundingSource: "entitlement-bsas", bsasHours: 400 });
    const facts = fundingProvenance(document);
    const term = bsasTerm(document.fields, reportTermEnd(document))!;
    expect(facts.bsasStart).toMatchObject({ state: "assumed", source: "Day after the entitlement ends", value: term.termStart });
    expect(facts.bsasEnd).toMatchObject({ state: "assumed", source: "12 months after the BSAS start", value: term.termEnd });
    expect(facts.bsasHours).toMatchObject({ state: "confirmed", value: 400 });
  });

  it("treats a BSAS end before its start as not stated, as the engine does", () => {
    const facts = fundingProvenance(funded({ fundingSource: "entitlement-bsas", bsasHours: 400, bsasStart: "2028-01-01", bsasEnd: "2027-01-01" }));
    expect(facts.bsasStart.state).toBe("confirmed");
    expect(facts.bsasEnd.state).toBe("assumed");
  });

  it("needs a stated start for BSAS alone", () => {
    expect(fundingProvenance(funded({ fundingSource: "bsas", entitlementAmount: 0, bsasHours: 300 })).bsasStart.state).toBe("unknown");
    expect(fundingProvenance(funded({ fundingSource: "bsas", entitlementAmount: 0, bsasHours: 300, bsasStart: "2026-12-01" })).bsasEnd).toMatchObject({ state: "assumed", value: "2027-12-01" });
  });

  it("separates entitled hours from consumed hours, each with its own source", () => {
    const document = funded();
    expect(fundingProvenance(document).entitledHours).toMatchObject({ state: "assumed", source: "Derived from the entitlement value" });
    expect(fundingProvenance(document).hoursConsumed).toMatchObject({ state: "unknown", source: "No consumption entry yet" });
    document.report.resourceAssignments = [{ ...({} as any), architect: 200, srConsultant: 300, projectManager: 100 }];
    document.report.entitlement = { ...document.report.entitlement, hours: 600, hoursConsumed: 120, consumedAsOf: "2026-12-15" };
    expect(fundingProvenance(document).entitledHours).toMatchObject({ state: "confirmed", source: "Signed resource assignments", value: 600 });
    expect(fundingProvenance(document).hoursConsumed).toMatchObject({ state: "confirmed", source: "Consumption entry as of 2026-12-15", value: 120 });
  });

  it("confirms an assumed date by stating it, and leaves a stated one alone", () => {
    const document = funded({ fundingSource: "entitlement-bsas", bsasHours: 400 });
    const assumedEnd = fundingProvenance(document).entitlementEnd.value;
    const confirmed = confirmAssumedFunding(document, "entitlementEnd");
    expect(confirmed.report.entitlement.termEnd).toBe(assumedEnd);
    expect(fundingProvenance(confirmed).entitlementEnd.state).toBe("confirmed");
    const bsasConfirmed = confirmAssumedFunding(confirmAssumedFunding(confirmed, "bsasStart"), "bsasEnd");
    expect([fundingProvenance(bsasConfirmed).bsasStart.state, fundingProvenance(bsasConfirmed).bsasEnd.state]).toEqual(["confirmed", "confirmed"]);
    expect(confirmAssumedFunding(bsasConfirmed, "bsasEnd")).toBe(bsasConfirmed);
  });

  it("agrees with what the FCP prints for every golden fixture", () => {
    for (const fixture of FCP_FIXTURES) {
      const document = fixture.build();
      const facts = fundingProvenance(document);
      if (document.fields.fundingSource !== "bsas") expect(facts.entitlementEnd.value, fixture.slug).toBe(reportTermEnd(document));
    }
  });
});

describe("funding section", () => {
  const source = readFileSync(path.join(ROOT, "client/src/components/fcp/FundingSection.tsx"), "utf8");

  it("keeps the rate, the hours derivation and the order details in the internal panel", () => {
    const [, panels] = source.split('<Panel title="Prints in the FCP"');
    const [printed, internal] = panels.split("<InternalPanel");
    expect(internal).toBeDefined();
    expect(internal).toMatch(/blendedRate/);
    expect(internal).toMatch(/Entitled hours derivation/);
    expect(internal).toMatch(/Purchase order/);
    expect(printed).not.toMatch(/blendedRate|poHours|poReceivedOn|reservePercent/);
  });

  it("is never read by the FCP renderer", () => {
    for (const file of ["server/condensedFcpRenderer.ts", "shared/reportView.ts"]) {
      expect(readFileSync(path.join(ROOT, file), "utf8"), file).not.toMatch(/provenance|FundingSection/);
    }
  });
});
