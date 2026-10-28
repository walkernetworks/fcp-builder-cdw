import { withMigrationWavesChoice } from "../shared/estateSize";
import { describe, expect, it } from "vitest";
import { ESTATE_SIZE_UNKNOWN_FLAG, estateSizeFlag, resolveEstateSize, withSmallEstateChoice } from "../shared/estateSize";
import { LATER_DESIGN_PHASE, RUNBOOK_TRANSFER_BAR, timelinesWithDeferrals, unscopedWorkPackageIds, withOwnership } from "../shared/effort";
import { activityOwner, migrateDocument, REFERENCE_DESIGN, refreshDerivedDocument, type EngagementDocument } from "../shared/fcp";
import { HOURS_V2 } from "../shared/hoursConfig";
import { loadedOf, scopeV2 } from "../shared/hoursV2";
import { fundingProblem } from "../shared/reportFormat";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { acmeHealth, acmeHealthReconciled, acmeHealthUnderFunded, cedarRidgeLogistics, FCP_FIXTURES, FIXTURE_TODAY, meridianHealth, northwindMfg, riverbendHealth } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

const effortOf = (document: EngagementDocument) => scopedEffortForDocument(document, FIXTURE_TODAY);
const design = (document: EngagementDocument) => scopeV2(document).lines.find(line => line.code === "A")!;
/** The design package's hours as shown: second role and project management inside the stated number. */
const designHours = (document: EngagementDocument) => { const pass1 = scopeV2(document); const line = pass1.lines.find(item => item.code === "A")!; return loadedOf(pass1, line, line.computedBase); };
const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** Acme Health sized exactly as given: RVTools counts, the brief's vCenters and instances, and the sites in scope. */
function sized(counts: { hosts?: number; clusters?: number; vcenters?: number; instances?: number; sites?: number }): EngagementDocument {
  const document = acmeHealth();
  Object.assign(document.inventory, { hosts: counts.hosts ?? 14, clusters: counts.clusters ?? 1 });
  document.report.discovery.vcenters = counts.vcenters ?? 1;
  document.report.discovery.vcfInstances = counts.instances ?? 1;
  document.fields.estimateInputs.sites = counts.sites ?? 1;
  // No recovery services: every stated site is in scope (the recovery site rule has its own tests).
  document.fields.adoptionDetails.resilience = [];
  document.fields.priorities = document.fields.priorities.filter(item => item !== "resilience");
  return document;
}

describe("rule 1: the Reference Architecture Design tier", () => {
  it("is a flat design for an estate at every limit, all taken from hoursConfig", () => {
    expect(HOURS_V2.smallEstate).toMatchObject({ hosts: { value: 16 }, clusters: { value: 2 }, vcenters: { value: 1 }, instances: { value: 1 }, sites: { value: 1 } });
    expect(HOURS_V2.design.referenceFlat.value).toBe(40);
    const document = sized({ hosts: 16, clusters: 2 });
    expect(resolveEstateSize(document)).toMatchObject({ small: true, known: true, exceeds: [] });
    const line = design(document);
    expect(line.name).toBe("Reference Architecture Design");
    expect(designHours(document)).toBeCloseTo(40, 6);
    expect(line.drivers.tier).toBe("reference architecture");
  });

  it("falls back to the full design when any one count is over its limit", () => {
    const over: Array<[string, Parameters<typeof sized>[0]]> = [["17 hosts", { hosts: 17 }], ["3 clusters", { clusters: 3 }], ["2 vCenters", { vcenters: 2 }], ["2 VCF instances", { instances: 2 }], ["2 sites", { sites: 2 }]];
    for (const [name, counts] of over) {
      const document = sized(counts);
      expect(resolveEstateSize(document).small, name).toBe(false);
      expect(resolveEstateSize(document).exceeds.length, name).toBe(1);
      expect(design(document).computedBase, name).toBeGreaterThan(HOURS_V2.design.referenceFlat.value);
    }
  });

  it("keeps the hours as the formula for the full design", () => {
    const document = sized({ hosts: 40, clusters: 3 });
    document.fields.estimateInputs.workloadDomains = 1;
    const line = design(document);
    const h = HOURS_V2.design;
    expect(line.computedBase).toBeCloseTo(h.base.value + h.perWorkloadDomain.value + h.perHostAboveThreshold.value * (40 - h.hostThreshold.value));
    expect(line.units.map(unit => unit.id)).toEqual(["A:foundation", "A:workload", "A:dr-nsx"]);
  });

  it("names the package Reference Architecture Design, accepted on the workbook, the bill of materials and the deviations", () => {
    const bar = acmeHealth().adoptionTimeline.lanes.flatMap(lane => lane.bars).find(item => item.id === "bar-playbook-design-target-state")!;
    expect(bar.label).toBe("Reference Architecture Design");
    expect(bar.outcome).toContain("VCF Planning and Preparation Workbook");
    expect(bar.outcome).toContain("bill of materials");
    expect(bar.outcome).toContain("deviations from the reference architecture");
    expect(bar.outcome).toContain(`Acceptance: ${REFERENCE_DESIGN.acceptance}`);
    expect(REFERENCE_DESIGN.acceptance).toMatch(/approved by the customer/);
    const full = refreshDerivedDocument(sized({ hosts: 40, clusters: 3 })).adoptionTimeline.lanes.flatMap(lane => lane.bars).find(item => item.id === "bar-playbook-design-target-state")!;
    expect(full.label).toBe("Greenfield Design and Bill of Materials");
  });

  it("is 40 hours on its own: the hardware review, the role and access mapping and the migration plan are separate packages with their own estimates", () => {
    const rows = effortOf(acmeHealth()).workPackages;
    const total = (id: string) => rows.find(row => row.id === id)?.total ?? 0;
    expect(total("bar-playbook-design-target-state")).toBe(HOURS_V2.design.referenceFlat.value);
    expect(total("bar-hcl-review")).toBe(HOURS_V2.design.hardwareReview.value);
    expect(total("bar-design-access-mapping")).toBe(HOURS_V2.design.roleAccess.value);
    expect(total("bar-platform-plan")).toBe(HOURS_V2.design.kickoff.value);
    expect(total("bar-playbook-design-migration-design")).toBe(HOURS_V2.waves.migrationPlan.value);
    expect(total("bar-playbook-design-requirements")).toBe(0);
  });

  it("moves a saved plan to the right title when the estate changes size, and never overwrites a typed label", () => {
    const small = acmeHealth();
    const saved = JSON.parse(JSON.stringify({ ...small, planAuthority: "manual" }));
    const target = saved.adoptionTimeline.lanes.flatMap((lane: any) => lane.bars).find((bar: any) => bar.id === "bar-playbook-design-target-state");
    target.label = "Greenfield Design and Bill of Materials"; // as the generator named it before the tier existed
    const migrated = migrateDocument(saved).adoptionTimeline.lanes.flatMap(lane => lane.bars).find(bar => bar.id === "bar-playbook-design-target-state")!;
    expect(migrated.label).toBe("Reference Architecture Design");
    target.label = "Our own design title";
    const typed = migrateDocument(saved).adoptionTimeline.lanes.flatMap(lane => lane.bars).find(bar => bar.id === "bar-playbook-design-target-state")!;
    expect(typed.label).toBe("Our own design title");
  });
});

describe("rule 2: unknown inventory, the Small estate input and the brief's counts", () => {
  const unknown = () => {
    const document = acmeHealth();
    Object.assign(document.inventory, { hosts: 0, clusters: 0 });
    document.report.discovery.esxHosts = null;
    return document;
  };

  it("treats an estate with no host count as not small, and flags it", () => {
    const document = unknown();
    expect(resolveEstateSize(document)).toMatchObject({ known: false, small: false });
    expect(ESTATE_SIZE_UNKNOWN_FLAG).toBe("Estate size unknown; design hours assume a full design");
    expect(estateSizeFlag(document)).toBe(ESTATE_SIZE_UNKNOWN_FLAG);
    expect(design(document).computedBase).toBeGreaterThanOrEqual(HOURS_V2.design.base.value);
    expect(effortOf(document).internal.fit!.warnings).toContain(ESTATE_SIZE_UNKNOWN_FLAG);
    expect(estateSizeFlag(acmeHealth())).toBeNull();
    expect(effortOf(acmeHealth()).internal.fit!.warnings).not.toContain(ESTATE_SIZE_UNKNOWN_FLAG);
  });

  it("lets the planner decide: yes forces the reference design, no forces the full design, auto follows the counts", () => {
    const yes = unknown();
    yes.fields.estimateInputs.smallEstate = "yes";
    expect(designHours(yes)).toBeCloseTo(40, 6);
    expect(estateSizeFlag(yes)).toBeNull();
    const no = acmeHealth();
    no.fields.estimateInputs.smallEstate = "no";
    expect(resolveEstateSize(no)).toMatchObject({ small: false, choice: "no" });
    expect(design(no).computedBase).toBeGreaterThan(40);
    const auto = acmeHealth();
    auto.fields.estimateInputs.smallEstate = "auto";
    expect(resolveEstateSize(auto).small).toBe(true);
  });

  it("uses the brief's counts when RVTools is missing", () => {
    const document = acmeHealth();
    Object.assign(document.inventory, { hosts: 0, clusters: 0 });
    document.report.discovery.esxHosts = 14;
    expect(resolveEstateSize(document)).toMatchObject({ hosts: 14, clusters: 1, known: true, small: true });
    document.report.discovery.esxHosts = 30;
    expect(resolveEstateSize(document)).toMatchObject({ hosts: 30, clusters: 2, small: false });
    // The planner's assumptions list says where the answer came from.
    expect(scopeV2(unknown()).assumptions.find(item => item.key === "smallEstate")!.source).toContain(ESTATE_SIZE_UNKNOWN_FLAG);
  });

  it("logs a change to the Small estate choice, once, and logs nothing when it did not change", () => {
    const first = withSmallEstateChoice(acmeHealth(), "yes", "2026-10-01T10:00:00.000Z");
    expect(first.fields.estimateInputs.smallEstate).toBe("yes");
    expect(first.fields.plannerLog).toEqual([{ at: "2026-10-01T10:00:00.000Z", input: "Small estate", from: "auto", to: "yes" }]);
    expect(withSmallEstateChoice(first, "yes", "2026-10-01T11:00:00.000Z")).toBe(first);
    const back = withSmallEstateChoice(first, "auto", "2026-10-02T09:00:00.000Z");
    expect(back.fields.estimateInputs.smallEstate).toBeUndefined();
    expect(back.fields.plannerLog!.map(entry => `${entry.from}>${entry.to}`)).toEqual(["auto>yes", "yes>auto"]);
    // Saved documents without the input or the log still load, and the log survives a load.
    expect(migrateDocument(JSON.parse(JSON.stringify(back))).fields.plannerLog).toHaveLength(2);
    expect(migrateDocument(JSON.parse(JSON.stringify(acmeHealth()))).fields.plannerLog).toBeUndefined();
  });
});

describe("sites in year-one scope", () => {
  it("does not count a recovery site against the one-site limit, and says which sites it counted", () => {
    const acme = acmeHealth();
    // The example brief names two data centers and wants recovery services: the second is the DR site.
    expect(acme.report.discovery.datacenters).toBe(2);
    expect(acme.fields.estimateInputs.sites).toBeUndefined();
    expect(resolveEstateSize(acme)).toMatchObject({ statedSites: 2, recoverySites: 1, sites: 1, small: true, exceeds: [] });
  });

  it("counts both sites when the second is not a recovery site", () => {
    const document = acmeHealth();
    document.fields.adoptionDetails.resilience = [];
    document.fields.priorities = document.fields.priorities.filter(item => item !== "resilience");
    expect(resolveEstateSize(document)).toMatchObject({ statedSites: 2, recoverySites: 0, sites: 2, small: false });
    expect(resolveEstateSize(document).exceeds.join(" ")).toContain("2 sites");
  });

  it("counts every site beyond the recovery site pairs", () => {
    const document = acmeHealth();
    document.fields.estimateInputs.sites = 3;
    expect(resolveEstateSize(document)).toMatchObject({ statedSites: 3, recoverySites: 1, sites: 2, small: false });
    document.fields.estimateInputs.drSitePairs = 2;
    expect(resolveEstateSize(document)).toMatchObject({ recoverySites: 2, sites: 1, small: true });
  });
});

describe("the fill order: whole packages, in order, never shaved", () => {
  const E = (effort: ReturnType<typeof effortOf>) => effort.internal.fit!.placements.filter(item => item.bucket === "E1" || item.bucket === "E2");

  it("funds discovery, hardware review and design, the foundation build and the Operations design first (Acme)", () => {
    const effort = effortOf(acmeHealth());
    const fit = effort.internal.fit!;
    expect(fit.underFunded).toBeNull();
    expect(E(effort).map(item => item.unitId).sort()).toEqual(["A", "AH", "AK", "AP", "AR", "D", "NX", "S_storage", "X10:design-share", "X4:design-share"]);
    const total = (id: string) => effort.workPackages.find(row => row.id === id)?.total ?? 0;
    for (const id of ["bar-platform-plan", "bar-hcl-review", "bar-playbook-design-target-state", "bar-management-domain", "bar-platform-licensing", "bar-platform-enablement", "bar-platform-handover", "bar-playbook-component-design-operations", "bar-design-access-mapping", "bar-playbook-design-migration-design"]) expect(total(id), id).toBeGreaterThan(0);
    // The first workload domain is whole or follow-on, and it is not in the build package's hours.
    expect(effort.workPackages.find(row => row.id === "bar-workload-domain")).toMatchObject({ total: 0, deferred: "not funded" });
  });

  it("never funds a package while an earlier one in the order is left out though it would have fit", () => {
    for (const document of [acmeHealth(), acmeHealthReconciled(), meridianHealth(), riverbendHealth(), cedarRidgeLogistics()]) {
      const fit = effortOf(document).internal.fit;
      if (!fit) continue;
      const funded = fit.placements.filter(item => item.bucket === "E1" || item.bucket === "E2");
      const left = fit.placements.filter(item => (item.bucket === "F" || item.bucket === "C") && item.reason === "ran out");
      for (const out of left) {
        const spentBefore = funded.filter(item => item.step <= out.step && !item.designShare).reduce((sum, item) => sum + item.loaded, 0) + funded.filter(item => item.designShare && item.code === "X4").reduce((sum, item) => sum + item.loaded, 0);
        // CDW's waves are one package, funded whole or not at all.
        const size = out.code === "FILL_mig" && out.step === 4 ? left.filter(item => item.code === "FILL_mig" && item.step === 4).reduce((sum, item) => sum + item.loaded, 0) : out.loaded;
        const fits = size <= fit.fillableHours - spentBefore + 1e-6;
        const laterFunded = funded.filter(item => item.step > out.step && !item.designShare);
        expect(fits && laterFunded.length > 0, `${document.fields.customerName}: ${out.label} fits but ${laterFunded.map(item => item.label).join(", ")} was funded after it`).toBe(false);
      }
    }
  });

  it("lists Acme's funded packages in fill order, with their hours", () => {
    const effort = effortOf(acmeHealth());
    const order = ["bar-platform-plan", "bar-hcl-review", "bar-playbook-design-target-state", "bar-management-domain", "bar-playbook-component-design-operations", "bar-design-access-mapping", "bar-platform-licensing", "bar-platform-enablement", "bar-platform-handover", "bar-playbook-design-migration-design", "bar-playbook-component-design-resilience"];
    expect(order.map(id => [id, effort.workPackages.find(row => row.id === id)!.total])).toEqual([
      ["bar-platform-plan", 2], ["bar-hcl-review", 13], ["bar-playbook-design-target-state", 40], ["bar-management-domain", 67], ["bar-playbook-component-design-operations", 10], ["bar-design-access-mapping", 13],
      ["bar-platform-licensing", 7], ["bar-platform-enablement", 7], ["bar-platform-handover", 12], ["bar-playbook-design-migration-design", 24], ["bar-playbook-component-design-resilience", 10],
    ]);
  });

  it("puts the migration waves, health and logs and recovery in the follow-on, whole, when they do not fit", () => {
    const effort = effortOf(acmeHealth());
    const fit = effort.internal.fit!;
    expect(fit.customerRun).toEqual({ hours: 0, waves: 0 });
    for (const id of ["bar-playbook-execution-migration-waves", "bar-operations-observability", "bar-resilience-recovery-architecture", "bar-workload-domain"]) {
      const row = effort.workPackages.find(item => item.id === id)!;
      expect(row, id).toMatchObject({ total: 0, deferred: "not funded" });
      expect(row.followOn!.total, id).toBeGreaterThan(0);
    }
    // CDW runs every wave by default, so the runbook knowledge transfer is not in the plan at all.
    expect(effort.workPackages.some(row => row.id === RUNBOOK_TRANSFER_BAR)).toBe(false);
    // The leftover goes to Optimization and Advisory Services.
    const roomy = acmeHealthReconciled();
    roomy.report.entitlement.hours = 290;
    roomy.fields.entitlementAmount = 290 * 330;
    expect(effortOf(refreshDerivedDocument(roomy, { forceRebuild: true })).workPackages.find(row => row.id === "bar-hours-fill")!.total).toBeGreaterThan(0);
  });

  it("runs the runbook transfer only when the customer asked to run the remaining waves and CDW's first waves are in", () => {
    const withWaves = acmeHealth();
    withWaves.report.entitlement.hours = 900;
    withWaves.fields.entitlementAmount = 900 * 330;
    withWaves.fields.estimateInputs.migrationWaves = "customer-remaining";
    const effort = effortOf(refreshDerivedDocument(withWaves, { forceRebuild: true }));
    const fit = effort.internal.fit!;
    expect(fit.placements.find(item => item.unitId === "FILL_mig:wave-1")!.bucket).toBe("E1");
    expect(effort.workPackages.find(row => row.id === RUNBOOK_TRANSFER_BAR)!.total).toBeGreaterThan(0);
    // The first waves do not fit: the customer is handed nothing, so the transfer is held with them.
    const without = acmeHealth();
    without.fields.estimateInputs.migrationWaves = "customer-remaining";
    expect(effortOf(refreshDerivedDocument(without, { forceRebuild: true })).workPackages.find(row => row.id === RUNBOOK_TRANSFER_BAR)).toMatchObject({ total: 0, deferred: "not funded" });
  });

  it("by default CDW runs every wave: the whole waves package, no runbook transfer and nothing handed to the customer", () => {
    const withWaves = acmeHealth();
    withWaves.report.entitlement.hours = 900;
    withWaves.fields.entitlementAmount = 900 * 330;
    const effort = effortOf(refreshDerivedDocument(withWaves, { forceRebuild: true }));
    const fit = effort.internal.fit!;
    expect(fit.customerRun).toEqual({ hours: 0, waves: 0 });
    expect(fit.placements.filter(item => item.code === "FILL_mig" && item.step === 4).every(item => item.bucket === "E1")).toBe(true);
    expect(fit.placements.some(item => item.code === "FILL_mig" && item.step === 7)).toBe(false);
    expect(effort.workPackages.some(row => row.id === RUNBOOK_TRANSFER_BAR)).toBe(false);
    // The customer runs all waves on request: the waves package is not CDW's at all.
    const theirs = acmeHealth();
    theirs.report.entitlement.hours = 900;
    theirs.fields.entitlementAmount = 900 * 330;
    theirs.fields.estimateInputs.migrationWaves = "customer-all";
    const all = effortOf(refreshDerivedDocument(theirs, { forceRebuild: true }));
    expect(all.internal.fit!.customerRun.waves).toBeGreaterThan(0);
    expect(all.internal.fit!.placements.some(item => item.code === "FILL_mig")).toBe(false);
    expect(all.workPackages.find(row => row.id === "bar-playbook-execution-migration-waves")?.followOn?.total ?? 0).toBe(0);
  });

  it("logs a change to the Migration waves setting, and nothing when it is chosen again", () => {
    const document = acmeHealth();
    const changed = withMigrationWavesChoice(document, "customer-remaining", "2026-10-28T10:00:00.000Z");
    expect(changed.fields.estimateInputs.migrationWaves).toBe("customer-remaining");
    expect(changed.fields.plannerLog!.at(-1)).toEqual({ at: "2026-10-28T10:00:00.000Z", input: "Migration waves", from: "cdw", to: "customer-remaining" });
    expect(withMigrationWavesChoice(changed, "customer-remaining")).toBe(changed);
    const back = withMigrationWavesChoice(changed, "cdw", "2026-10-28T11:00:00.000Z");
    expect(back.fields.estimateInputs.migrationWaves).toBeUndefined();
    expect(back.fields.plannerLog!.at(-1)).toMatchObject({ from: "customer-remaining", to: "cdw" });
  });

  it("makes the remaining waves a whole follow-on package, not customer-run, when the proving waves are not in", () => {
    const effort = effortOf(acmeHealth());
    const waves = effort.workPackages.find(row => row.id === "bar-playbook-execution-migration-waves")!;
    expect(waves).toMatchObject({ total: 0, deferred: "not funded" });
    expect(effort.internal.fit!.placements.filter(item => item.code === "FILL_mig").every(item => item.bucket === "F")).toBe(true);
    // A customer-run row is not drawn for waves the customer was never handed.
    expect(effort.workPackages.some(row => row.id.endsWith(":later") && /waves/i.test(row.id))).toBe(false);
  });

  it("carries each follow-on package's outcome and acceptance on its row, for the follow-on table", () => {
    const rows = effortOf(acmeHealth()).workPackages.filter(row => row.deferred);
    expect(rows.length).toBeGreaterThan(3);
    for (const row of rows) {
      // Every follow-on package has an outcome; acceptance is split off where the package states one (the design phases always do).
      expect(row.detail?.outcome, row.id).toBeTruthy();
      expect(row.detail!.outcome, row.id).not.toContain("Acceptance:");
      expect(typeof row.detail!.acceptance, row.id).toBe("string");
    }
  });

  it("phases the design by deliverable before it calls a plan under-funded", () => {
    const base = () => {
      const document = acmeHealth();
      document.fields.estimateInputs.smallEstate = "no";
      document.fields.estimateInputs.workloadDomains = 1;
      return document;
    };
    let found: ReturnType<typeof effortOf> | null = null;
    for (let hours = 120; hours <= 600 && !found; hours += 5) {
      const document = base();
      document.report.entitlement.hours = hours;
      const effort = effortOf(document);
      if (effort.internal.fit!.designPhased && !effort.internal.fit!.underFunded) found = effort;
    }
    expect(found, "some entitlement fits the phased design but not the full one").not.toBeNull();
    const fit = found!.internal.fit!;
    const byUnit = (id: string) => fit.placements.find(item => item.unitId === id)!;
    expect(byUnit("A:foundation").bucket).toBe("E1");
    expect(byUnit("A:workload")).toMatchObject({ bucket: "F", reason: "design phased" });
    expect(byUnit("A:dr-nsx")).toMatchObject({ bucket: "F", reason: "design phased" });
    expect(byUnit("A:foundation").label).toMatch(/management domain, platform, network and storage/);
    // The later phase is a package of its own with its own outcome and acceptance, wholly follow-on.
    const later = found!.workPackages.find(row => row.id === LATER_DESIGN_PHASE.id)!;
    expect(later).toMatchObject({ label: "Workload Domain, DR and NSX Overlay Design", total: 0, deferred: "not funded" });
    expect(later.followOn!.total).toBeGreaterThan(0);
    expect(later.detail!.outcome).toMatch(/workload domain/);
    expect(later.detail!.acceptance).toMatch(/approve/);
    const laterBase = byUnit("A:workload").loaded + byUnit("A:dr-nsx").loaded;
    expect(Math.abs(later.followOn!.total - laterBase)).toBeLessThan(3);
    expect(found!.workPackages.every(row => !(row.total > 0 && (row.followOn?.total ?? 0) > 0))).toBe(true);
  });

  it("does not phase a design that fits", () => {
    const document = acmeHealth();
    document.fields.estimateInputs.smallEstate = "no";
    document.report.entitlement.hours = 700;
    expect(effortOf(document).internal.fit!.designPhased).toBe(false);
  });

  it("is under-funded, with the gap in hours, when the minimum does not fit; nothing is shaved or squeezed", () => {
    const document = acmeHealthUnderFunded();
    const effort = effortOf(document);
    const fit = effort.internal.fit!;
    expect(fit.underFunded).not.toBeNull();
    expect(fit.underFunded!.gapHours).toBeGreaterThan(0);
    expect(fit.underFunded!.fullScopeGapHours).toBeGreaterThanOrEqual(fit.underFunded!.gapHours);
    // The minimum is placed whole, over the fillable hours: discovery, the foundation design, the build, the Operations design.
    expect(E(effort).map(item => item.unitId).sort()).toEqual(["A:foundation", "D", "NX", "S_storage", "X4:design-share"].sort());
    expect(effort.totals.total).toBeGreaterThan(fit.fillableHours);
    expect(effort.workPackages.filter(row => row.deferred === "over budget")).toEqual([]);
    expect(effort.workPackages.every(row => !(row.total > 0 && (row.followOn?.total ?? 0) > 0))).toBe(true);
    expect(fit.warnings[0]).toMatch(/^Under-funded/);
  });
});

describe("rule 5: what still does not fit is under-funded and stays internal", () => {
  it("makes the issue gate ask for a decision, saying how many more hours the full scope needs", () => {
    const document = acmeHealthUnderFunded();
    const effort = effortOf(document);
    const problem = fundingProblem(document, effort, FIXTURE_TODAY)!;
    expect(problem).toContain(`The full scope needs ${Math.round(effort.internal.fit!.underFunded!.fullScopeGapHours).toLocaleString("en-US")} more hours`);
    expect(problem).toContain("Record the decision");
  });

  it("prints nothing about the gap in any customer document", () => {
    for (const document of [acmeHealthUnderFunded(), (() => { const d = riverbendHealth(); d.fields.bsasHours = 90; return d; })()]) {
      const effort = effortOf(document);
      const gap = effort.internal.fit!.underFunded;
      for (const format of ["summary", undefined] as const) {
        const text = visible(renderCondensedFcpHtml(document.fields.customerName, document, { effort, today: FIXTURE_TODAY, ...(format ? { format } : {}) }));
        expect(text).not.toMatch(/under-?funded|full scope needs|fillable|design first|more hours than/i);
        if (gap) expect(text).not.toContain(`${Math.round(gap.fullScopeGapHours)} more hours`);
        expect(text).not.toContain("Closing the gap");
      }
    }
  });
});

describe("every CDW bar on the entitlement timeline is a funded package", () => {
  const fixtures = () => [acmeHealth(), acmeHealthReconciled(), meridianHealth(), riverbendHealth(), northwindMfg(), cedarRidgeLogistics(), acmeHealthUnderFunded()];
  const unfunded = (document: EngagementDocument) => {
    const effort = effortOf(document);
    const owned = withOwnership(document);
    const { adoption } = timelinesWithDeferrals(owned, effort.workPackages.filter(row => row.deferred).map(row => row.id), unscopedWorkPackageIds(effort));
    const rows = new Map(effort.workPackages.map(row => [row.id, row]));
    return adoption.lanes.flatMap(lane => lane.bars).filter(bar => activityOwner(bar) === "cdw" && !(rows.get(bar.id)?.total! > 0)).map(bar => bar.id);
  };
  /** The checkpoints and the package each gates: a checkpoint stays on the entitlement timeline only with its package funded. */
  const GATES: Record<string, RegExp> = { "bar-hcl-gate": /^bar-hcl-review$/, "bar-backup-gate": /^bar-playbook-execution-/ };
  const strayCheckpoints = (document: EngagementDocument) => {
    const effort = effortOf(document);
    const { adoption } = timelinesWithDeferrals(withOwnership(document), effort.workPackages.filter(row => row.deferred).map(row => row.id), unscopedWorkPackageIds(effort));
    const funded = effort.workPackages.filter(row => row.total > 0).map(row => row.id);
    return adoption.lanes.flatMap(lane => lane.bars).filter(bar => activityOwner(bar) === "checkpoint" && GATES[bar.id] && !funded.some(id => GATES[bar.id].test(id))).map(bar => bar.id);
  };

  it("draws no checkpoint whose package is not funded in year one, for every fixture", () => {
    for (const document of fixtures()) expect(strayCheckpoints(document), document.fields.customerName).toEqual([]);
  });

  it("draws no CDW bar with no funded hours, for every fixture", () => {
    for (const document of fixtures()) expect(unfunded(document), document.fields.customerName).toEqual([]);
  });

  it("moves the unfunded Acme bars to the Two-Year Notional and keeps the customer's bars where they are", () => {
    const document = acmeHealth();
    const effort = effortOf(document);
    const { adoption, notional } = timelinesWithDeferrals(withOwnership(document), effort.workPackages.filter(row => row.deferred).map(row => row.id), unscopedWorkPackageIds(effort));
    const year1 = new Set(adoption.lanes.flatMap(lane => lane.bars).map(bar => bar.id));
    const later = new Set(notional.lanes.flatMap(lane => lane.bars).map(bar => bar.id));
    for (const id of ["bar-playbook-execution-migration-waves", "bar-operations-observability", "bar-resilience-recovery-architecture"]) {
      expect(year1.has(id), `${id} is not in year one`).toBe(false);
      expect(later.has(id), `${id} is in the notional`).toBe(true);
    }
    // The migration plan is a funded package of its own; the workload domain, its backup checkpoint and discovery are not.
    expect(year1.has("bar-playbook-design-migration-design")).toBe(true);
    for (const id of ["bar-workload-domain", "bar-backup-gate", "bar-playbook-design-requirements"]) expect(year1.has(id), `${id} is not in year one`).toBe(false);
    expect(year1.has("bar-hcl-remediation")).toBe(true);
  });

  it("holds across entitlement sizes and pathways", () => {
    const offenders: string[] = [];
    for (const path of ["greenfield", "converge", "in-place"] as const) {
      for (const hours of [90, 200, 262, 330, 700, 3000]) {
        const document = acmeHealth();
        document.fields.adoptionDetails = { ...document.fields.adoptionDetails, upgradePath: path } as never;
        document.report.entitlement.hours = hours;
        document.fields.entitlementAmount = Math.round(hours * 330);
        for (const id of unfunded(refreshDerivedDocument(document, { forceRebuild: true }))) offenders.push(`${path}/${hours}: ${id}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("no package is scaled to fit", () => {
  it("places every unit at its full size, except a design share and the NSX carve-out, which are packages of their own", () => {
    const offenders: string[] = [];
    for (const path of ["greenfield", "converge", "in-place"] as const) {
      for (const hours of [90, 200, 262, 330, 700, 3000]) {
        const document = acmeHealth();
        document.fields.adoptionDetails = { ...document.fields.adoptionDetails, upgradePath: path } as never;
        document.report.entitlement.hours = hours;
        document.fields.entitlementAmount = Math.round(hours * 330);
        const refreshed = refreshDerivedDocument(document, { forceRebuild: true });
        const pass1 = scopeV2(refreshed);
        const units = new Map(pass1.lines.flatMap(line => line.units.map(unit => [unit.id, unit.base] as const)));
        for (const item of effortOf(refreshed).internal.fit!.placements) {
          if (item.designShare || item.unitId === "NX:3.5") continue;
          const full = units.get(item.unitId);
          if (full === undefined) continue;
          // A displaced add-on whose design share is funded carries the other 75%, and the networking line gives up the carved NSX design.
          const remainder = Math.abs(item.base - full * 0.75) < 1e-6 || /^X(5|6|7|16)/.test(item.code);
          if (Math.abs(item.base - full) > 1e-6 && !remainder) offenders.push(`${path}/${hours}: ${item.unitId} ${item.base} of ${full}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("no package is cut by hours with its remainder shown as After <date>", () => {
  const rowsOf = (document: EngagementDocument) => effortOf(document).workPackages;
  const split = (document: EngagementDocument) => rowsOf(document).filter(row => row.total > 0 && (row.followOn?.total ?? 0) > 0).map(row => row.id);

  it("holds for every fixture, as issued and as imported", () => {
    for (const fixture of FCP_FIXTURES) expect(split(fixture.build()), fixture.title).toEqual([]);
    for (const document of [acmeHealth(), acmeHealthReconciled(), meridianHealth(), riverbendHealth(), northwindMfg(), cedarRidgeLogistics(), acmeHealthUnderFunded()]) expect(split(document)).toEqual([]);
  });

  it("holds across entitlement sizes, estate sizes and pathways", () => {
    const sizes: Array<[string, (document: EngagementDocument) => void]> = [
      ["small", () => {}],
      ["medium", document => { Object.assign(document.inventory, { hosts: 40, clusters: 3 }); }],
      ["large", document => { Object.assign(document.inventory, { hosts: 150, clusters: 10 }); }],
      ["unknown", document => { Object.assign(document.inventory, { hosts: 0, clusters: 0 }); document.report.discovery.esxHosts = null; }],
    ];
    const offenders: string[] = [];
    for (const path of ["greenfield", "converge", "in-place"] as const) {
      for (const [name, apply] of sizes) {
        for (const hours of [90, 140, 200, 262, 330, 450, 700, 1200, 3000]) {
          const document = acmeHealth();
          document.fields.adoptionDetails = { ...document.fields.adoptionDetails, upgradePath: path } as never;
          apply(document);
          document.report.entitlement.hours = hours;
          document.fields.entitlementAmount = Math.round(hours * 330);
          const refreshed = refreshDerivedDocument(document, { forceRebuild: true });
          for (const id of split(refreshed)) offenders.push(`${path}/${name}/${hours}: ${id}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the customer's asks follow the plan", () => {
  const text = (document: EngagementDocument, format: "summary" | "standard") =>
    visible(renderCondensedFcpHtml(document.fields.customerName, document, { effort: effortOf(document), today: FIXTURE_TODAY, format, version: { issueNumber: 1, issuedOn: FIXTURE_TODAY } }));

  it("prints no customer-run waves, and no FTE peak from them, when CDW's proving waves are not funded", () => {
    // The example brief carries a customer-owned waves row of its own; the generated customer-run waves are what follow the plan.
    const document = acmeHealth();
    document.report.customerOwnedWork = [];
    for (const format of ["summary", "standard"] as const) {
      const html = text(document, format);
      expect(html, format).not.toMatch(/customer-run/i);
      // The entitlement timeline (not the follow-on roadmap, where the backup checkpoint travels with its waves).
      const year1 = html.slice(html.indexOf("Delivery workstream key"), html.indexOf("Key Dates"));
      expect(year1.length, format).toBeGreaterThan(100);
      expect(year1, format).not.toContain("Backup Validation");
      expect(year1, format).not.toContain("Discovery and Funding");
    }
  });

  it("prints the customer-run waves only when the customer asked to run them, and the proven runbook only with the transfer funded", () => {
    const withWaves = () => {
      const document = acmeHealth();
      document.report.entitlement.hours = 900;
      document.fields.entitlementAmount = 900 * 330;
      document.report.customerOwnedWork = [];
      return document;
    };
    for (const format of ["summary", "standard"] as const) {
      const byDefault = text(refreshDerivedDocument(withWaves(), { forceRebuild: true }), format);
      expect(byDefault, format).not.toMatch(/customer-run|proven runbook|proves the runbook|repeats it/i);
    }
    const remaining = withWaves();
    remaining.fields.estimateInputs.migrationWaves = "customer-remaining";
    const asked = text(refreshDerivedDocument(remaining, { forceRebuild: true }), "summary");
    expect(asked).toMatch(/customer-run migration waves/i);
    expect(asked).toContain("proves the runbook");
    const all = withWaves();
    all.fields.estimateInputs.migrationWaves = "customer-all";
    const theirs = text(refreshDerivedDocument(all, { forceRebuild: true }), "summary");
    expect(theirs).toMatch(/customer-run migration waves/i);
    expect(theirs).not.toMatch(/proven runbook|proves the runbook/i);
  });
});
