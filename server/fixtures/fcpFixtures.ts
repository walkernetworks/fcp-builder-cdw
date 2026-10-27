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

/**
 * Acme Health as a planner would issue it: the plan reconciled to its funding. The 39 hours already delivered covered
 * discovery, so the discovery package carries no further hours, and the waves are cut to CDW's proving waves (the
 * team runs the rest with the runbook): 39 delivered, 205 planned and the 18-hour reserve add up to the 262-hour
 * entitlement.
 */
export function acmeHealthReconciled(): EngagementDocument {
  const document = acmeHealth();
  const set = (id: string, architect: number, srConsultant: number, projectManager: number) => ({ id, architect, srConsultant, projectManager, placement: "auto" as const, owner: "auto" as const });
  document.report.workPackageHours = [
    set("bar-playbook-design-requirements", 0, 0, 0),
    set("bar-playbook-design-target-state", 20, 2, 2),
    set("bar-playbook-design-migration-design", 20, 2, 2),
    set("bar-playbook-execution-migration-waves", 4, 13, 6),
  ];
  return document;
}

const packageHours = (id: string, architect: number, srConsultant: number, projectManager: number) => ({ id, architect, srConsultant, projectManager, placement: "auto" as const, owner: "auto" as const });

/** Corporate, entitlement plus BSAS hours after the entitlement; the plan's hours are as calculated (see meridianHealth). */
function meridianCalculated(bsasHours = 600): EngagementDocument {
  return fromBrief(raw => {
    raw.customer.name = "Meridian Health";
    raw.customer.segment = "Corporate";
    raw.bsas = { hours: bsasHours, termStart: "2027-05-01", termEnd: "2028-04-30" };
  });
}

/**
 * Meridian Health as a planner would issue it: the entitlement plan reconciled (39 delivered, 205 planned and the
 * 18-hour reserve add up to 262, the same cuts as Acme Health), so the work the entitlement cannot carry becomes the
 * follow-on scope that the BSAS hours fund inside the term. The follow-on scope is 188 hours, so that is the BSAS
 * allocation: every hour is planned inside the term and none is forfeited.
 */
export function meridianHealth(): EngagementDocument {
  const document = meridianCalculated(188);
  document.report.workPackageHours = [
    packageHours("bar-playbook-design-requirements", 0, 0, 0),
    packageHours("bar-playbook-design-target-state", 20, 2, 2),
    packageHours("bar-playbook-design-migration-design", 20, 2, 2),
    packageHours("bar-playbook-execution-migration-waves", 4, 13, 6),
  ];
  return document;
}

/** Meridian Health reconciled on the entitlement, with 600 BSAS hours of which only the 188-hour follow-on is planned (412 forfeited). A gate fixture, not a golden. */
export function meridianHealthForfeiting(): EngagementDocument {
  const document = meridianHealth();
  document.fields.bsasHours = 600;
  return document;
}

/** BSAS only: no entitlement value, BSAS hours and term in its place; the plan's hours are as calculated (see riverbendHealth). */
function riverbendCalculated(): EngagementDocument {
  return fromBrief(raw => {
    raw.customer.name = "Riverbend Health";
    raw.entitlement = { hoursConsumed: 40, consumedAsOf: "2026-09-03" };
    raw.milestonesToDate = [];
    raw.bsas = { hours: 400, termStart: "2026-10-01", termEnd: "2027-09-30" };
  });
}

/** Riverbend Health as a planner would issue it: 40 delivered, 331 planned and the 29-hour reserve add up to the 400 BSAS hours. */
export function riverbendHealth(): EngagementDocument {
  const document = riverbendCalculated();
  document.report.workPackageHours = [packageHours("bar-playbook-execution-migration-waves", 10, 84, 16)];
  return document;
}

/** Riverbend Health with only 150 BSAS hours: the protected work and the design it builds on alone need more, so the squeeze cannot close the gap. A gate fixture, not a golden. */
export function riverbendHealthOverfunded(): EngagementDocument {
  const document = riverbendHealth();
  document.fields.bsasHours = 150;
  return document;
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

/**
 * Commercial, nothing booked: no entitlement value, hours or term, and a plan with a start date but no target
 * completion. The plan is the full scope at its estimate, so the customer formats must not lean on an entitlement.
 */
export function cedarRidgeLogistics(): EngagementDocument {
  const document = createDefaultDocument();
  Object.assign(document.fields, {
    customerName: "Cedar Ridge Logistics",
    accountId: "CRL",
    location: "Duluth, MN",
    customerSegment: "commercial", commercialPlan: true,
    entitlementAmount: 0,
    plannedProjectStart: "2026-11-02",
    plannedImplementationStart: "",
    targetComplete: "",
    hoursModel: "v2",
    priorities: ["operations"],
    exportPreferences: { includeVcfReadiness: true, includeOperationalTimeline: false },
  });
  Object.assign(document.fields.adoptionDetails, { platformEdition: "vvf", upgradePath: "greenfield" });
  Object.assign(document.inventory, { hosts: 8, clusters: 1, vmCount: 120, datacenters: 1 });
  return refreshDerivedDocument(document);
}

export const FCP_FIXTURES = [
  { slug: "acme-health", title: "Acme Health", build: acmeHealth },
  { slug: "meridian-health", title: "Meridian Health", build: meridianHealth },
  { slug: "riverbend-health", title: "Riverbend Health", build: riverbendHealth },
  { slug: "northwind-mfg", title: "Northwind Mfg", build: northwindMfg },
  { slug: "cedar-ridge-logistics", title: "Cedar Ridge Logistics", build: cedarRidgeLogistics },
] as const;
