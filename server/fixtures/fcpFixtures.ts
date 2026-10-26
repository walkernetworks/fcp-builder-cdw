import { readFileSync } from "node:fs";
import path from "node:path";
import { applyCustomerBrief } from "../../shared/briefImport";
import { createDefaultDocument, refreshDerivedDocument, type EngagementDocument } from "../../shared/fcp";

/**
 * The four fake customers the FCP golden files are rendered from. Each covers a different funding case, so a
 * change to the report shows up in at least one of them. Fake names and figures only; never real customer data.
 */
export const FIXTURE_TODAY = "2026-09-30";

const brief = () => JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../docs/examples/customer-brief.example.json"), "utf8"));

function fromBrief(patch: (raw: any) => void): EngagementDocument {
  const base = createDefaultDocument();
  base.fields.priorities = [];
  Object.assign(base.fields, { plannedProjectStart: "2026-10-01", plannedImplementationStart: "2026-12-01" });
  const raw = brief();
  patch(raw);
  const document = applyCustomerBrief(base, raw).document;
  // The import time is stamped on the document; fix it so the fixture is the same on every run.
  return { ...document, report: { ...document.report, importedAt: "2026-09-01T00:00:00.000Z" } };
}

/** Commercial, entitlement only, imported from the example brief (signed resource assignments, consumption to date). */
export function acmeHealth(): EngagementDocument {
  return fromBrief(raw => { raw.customer.name = "Acme Health"; });
}

/** Corporate, entitlement plus BSAS hours after the entitlement. */
export function meridianHealth(): EngagementDocument {
  return fromBrief(raw => {
    raw.customer.name = "Meridian Health";
    raw.customer.segment = "Corporate";
    raw.bsas = { hours: 600, termStart: "2027-05-01", termEnd: "2028-04-30" };
  });
}

/** BSAS only: no entitlement value, BSAS hours and term in its place. */
export function riverbendHealth(): EngagementDocument {
  return fromBrief(raw => {
    raw.customer.name = "Riverbend Health";
    raw.entitlement = { hoursConsumed: 40, consumedAsOf: "2026-09-03" };
    raw.milestonesToDate = [];
    raw.bsas = { hours: 400, termStart: "2026-10-01", termEnd: "2027-09-30" };
  });
}

/** Built by hand with no brief: Commercial VVF, greenfield, plan estimate as the hours source, no consumption, no operational timeline. */
export function northwindMfg(): EngagementDocument {
  const document = createDefaultDocument();
  Object.assign(document.fields, {
    customerName: "Northwind Mfg",
    accountId: "NWM",
    location: "Toledo, OH",
    customerSegment: "commercial", commercialPlan: true,
    entitlementAmount: 900_000,
    entitlementStart: "2026-11-02",
    plannedProjectStart: "2026-11-02",
    plannedImplementationStart: "2027-01-04",
    targetComplete: "2027-10-29",
    hoursModel: "v2",
    priorities: ["operations", "automation"],
    exportPreferences: { includeVcfReadiness: true, includeOperationalTimeline: false },
  });
  Object.assign(document.fields.adoptionDetails, { platformEdition: "vvf", upgradePath: "greenfield" });
  Object.assign(document.inventory, { hosts: 24, clusters: 2, vmCount: 300, datacenters: 1 });
  return refreshDerivedDocument(document);
}

export const FCP_FIXTURES = [
  { slug: "acme-health", title: "Acme Health", build: acmeHealth },
  { slug: "meridian-health", title: "Meridian Health", build: meridianHealth },
  { slug: "riverbend-health", title: "Riverbend Health", build: riverbendHealth },
  { slug: "northwind-mfg", title: "Northwind Mfg", build: northwindMfg },
] as const;
