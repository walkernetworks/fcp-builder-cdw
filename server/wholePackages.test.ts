import { describe, expect, it } from "vitest";
import { refreshDerivedDocument, type EngagementDocument, type VcfDeliveryPath } from "../shared/fcp";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { acmeHealth, acmeHealthReconciled, cedarRidgeLogistics, FIXTURE_TODAY, meridianHealth, northwindMfg, riverbendHealth } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

// A package is funded whole or moved whole to the follow-on. No package is part funded, no row carries a remainder,
// and no follow-on row is dated "After <date>".
const FORMATS = ["summary", "standard"] as const;
const check = (document: EngagementDocument, label: string) => {
  const effort = scopedEffortForDocument(document, FIXTURE_TODAY);
  for (const row of effort.workPackages) {
    expect(row.id.endsWith(":later"), `${label}: ${row.id} is a continuation row`).toBe(false);
    expect(row.total > 0 && (row.followOn?.total ?? 0) > 0, `${label}: ${row.id} is in year one and the follow-on`).toBe(false);
  }
  const yearOne = new Set(effort.workPackages.filter(row => row.total > 0 && !row.deferred).map(row => row.label));
  for (const row of effort.workPackages.filter(item => item.deferred)) expect(yearOne.has(row.label), `${label}: ${row.label} is in year one and the follow-on`).toBe(false);
  for (const format of FORMATS) {
    const html = renderCondensedFcpHtml(document.fields.customerName, document, { effort, today: FIXTURE_TODAY, format, version: { issueNumber: 1, issuedOn: FIXTURE_TODAY } });
    const text = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ");
    expect(text, `${label} ${format}`).not.toMatch(/Remaining Scope|Later Waves/);
    expect(html, `${label} ${format}: a follow-on row dated After`).not.toMatch(/<td[^>]*>\s*After\s/);
  }
};

describe("packages are funded whole or moved whole", () => {
  for (const [name, make] of [["Acme Health", acmeHealth], ["Acme Health reconciled", acmeHealthReconciled], ["Meridian Health", meridianHealth], ["Riverbend Health", riverbendHealth], ["Cedar Ridge Logistics", cedarRidgeLogistics], ["Northwind Mfg", northwindMfg]] as const) {
    it(`${name}`, () => check(make(), name));
  }

  it("holds across the pathway, estate size and entitlement matrix", () => {
    const paths: VcfDeliveryPath[] = ["in-place", "converge", "import-workload-domain", "greenfield", "hybrid", "design-only"];
    for (const path of paths) for (const hosts of [6, 14, 40, 120]) for (const hours of [90, 150, 262, 400, 700]) {
      const document = acmeHealth();
      document.fields.adoptionDetails.upgradePath = path as never;
      document.inventory.hosts = hosts;
      document.inventory.clusters = Math.max(1, Math.round(hosts / 14));
      document.report.entitlement.hours = hours;
      check(refreshDerivedDocument(document, { forceRebuild: true }), `${path}, ${hosts} hosts, ${hours} hours`);
    }
  }, 120_000);
});
