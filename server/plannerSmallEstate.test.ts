import { describe, expect, it } from "vitest";
import { ESTATE_SIZE_UNKNOWN_FLAG, estateSizeFlag, resolveEstateSize, withSmallEstateChoice } from "../shared/estateSize";
import { LATER_DESIGN_PHASE } from "../shared/effort";
import { migrateDocument, REFERENCE_DESIGN, refreshDerivedDocument, type EngagementDocument } from "../shared/fcp";
import { HOURS_V2 } from "../shared/hoursConfig";
import { scopeV2 } from "../shared/hoursV2";
import { fundingProblem } from "../shared/reportFormat";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { acmeHealth, acmeHealthReconciled, acmeHealthUnderFunded, cedarRidgeLogistics, FCP_FIXTURES, FIXTURE_TODAY, meridianHealth, northwindMfg, riverbendHealth } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

const effortOf = (document: EngagementDocument) => scopedEffortForDocument(document, FIXTURE_TODAY);
const design = (document: EngagementDocument) => scopeV2(document).lines.find(line => line.code === "A")!;
const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** Acme Health sized exactly as given: RVTools counts, the brief's vCenters and instances, and the sites in scope. */
function sized(counts: { hosts?: number; clusters?: number; vcenters?: number; instances?: number; sites?: number }): EngagementDocument {
  const document = acmeHealth();
  Object.assign(document.inventory, { hosts: counts.hosts ?? 14, clusters: counts.clusters ?? 1 });
  document.report.discovery.vcenters = counts.vcenters ?? 1;
  document.report.discovery.vcfInstances = counts.instances ?? 1;
  document.fields.estimateInputs.sites = counts.sites ?? 1;
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
    expect(line.computedBase).toBe(40);
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

  it("carries the hours on that package and the two focused reviews, not on discovery or the migration plan", () => {
    const rows = effortOf(acmeHealth()).workPackages;
    const total = (id: string) => rows.find(row => row.id === id)?.total ?? 0;
    expect(total("bar-playbook-design-target-state")).toBeGreaterThan(0);
    expect(total("bar-playbook-design-requirements")).toBe(0);
    expect(total("bar-playbook-design-migration-design")).toBe(0);
    expect(total("bar-playbook-design-target-state") + total("bar-hcl-review") + total("bar-design-access-mapping")).toBeGreaterThanOrEqual(47);
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
    expect(design(yes).computedBase).toBe(40);
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

describe("rule 3: design first below 300 hours", () => {
  it("plans discovery, the full design and the foundation build, and hands the migration to the customer", () => {
    const effort = effortOf(acmeHealth());
    const fit = effort.internal.fit!;
    expect(fit.fillableHours).toBeLessThan(HOURS_V2.fit.designFirstThreshold.value);
    expect(fit.designFirst).toBe(true);
    expect(fit.placements.filter(item => item.bucket === "E1").map(item => item.code).sort()).toEqual(["A", "D", "NX", "S_storage"]);
    expect(fit.placements.some(item => item.bucket === "E2")).toBe(false);
    expect(fit.placements.some(item => item.code === "FILL_mig")).toBe(false);
    expect(fit.customerRun.hours).toBeGreaterThan(0);
    expect(fit.customerRun.waves).toBeGreaterThan(0);
    // The later work is follow-on.
    expect(fit.placements.filter(item => item.bucket === "F").map(item => item.code)).toEqual(expect.arrayContaining(["X4", "X10"]));
    const waves = effort.workPackages.find(row => row.id === "bar-playbook-execution-migration-waves");
    expect(waves?.total ?? 0).toBe(0);
    expect(waves?.followOn).toBeUndefined();
  });

  it("puts the foundation build in the follow-on when it does not fit after the full design", () => {
    const document = acmeHealth();
    document.fields.estimateInputs.smallEstate = "no";
    const fit = effortOf(document).internal.fit!;
    expect(fit.designFirst).toBe(true);
    expect(fit.designPhased).toBe(false);
    expect(fit.underFunded).toBeNull();
    expect(fit.placements.filter(item => item.bucket === "E1").map(item => item.code)).toEqual(["A", "A"]);
    expect(fit.placements.filter(item => item.bucket === "F").map(item => item.code)).toContain("D");
    expect(fit.warnings.join(" ")).toMatch(/the foundation build does not fit and goes to the follow-on/);
  });

  it("does not apply at 300 fillable hours or more", () => {
    const fit = effortOf(riverbendHealth()).internal.fit!;
    expect(fit.fillableHours).toBeGreaterThanOrEqual(300);
    expect(fit.designFirst).toBe(false);
    expect(fit.placements.some(item => item.code === "FILL_mig" && item.bucket === "E1")).toBe(true);
    const threshold = acmeHealth();
    threshold.report.entitlement.hours = Math.ceil(300 / 0.92) + 39; // 300 or more after delivery and the 8% reserve
    expect(effortOf(threshold).internal.fit!.designFirst).toBe(false);
    threshold.report.entitlement.hours = Math.floor(299 / 0.92) + 39;
    expect(effortOf(threshold).internal.fit!.designFirst).toBe(true);
  });
});

describe("rule 4: design phased by deliverable", () => {
  /** A full design on 120 entitled hours: the foundation design fits, the rest of the design does not. */
  const phased = () => {
    const document = acmeHealth();
    document.fields.estimateInputs.smallEstate = "no";
    document.fields.estimateInputs.workloadDomains = 1;
    document.report.entitlement.hours = 120;
    return document;
  };

  it("keeps the foundation design in the entitlement and moves workload domain, DR and NSX overlay design to the follow-on", () => {
    const effort = effortOf(phased());
    const fit = effort.internal.fit!;
    expect(fit.designPhased).toBe(true);
    expect(fit.underFunded).toBeNull();
    const byUnit = (id: string) => fit.placements.find(item => item.unitId === id)!;
    expect(byUnit("A:foundation").bucket).toBe("E1");
    expect(byUnit("A:workload")).toMatchObject({ bucket: "F", reason: "design phased" });
    expect(byUnit("A:dr-nsx")).toMatchObject({ bucket: "F", reason: "design phased" });
    // Deliverables, not hours: foundation design is the management domain, platform, network and storage.
    expect(byUnit("A:foundation").label).toMatch(/management domain, platform, network and storage/);
    expect(fit.placements.filter(item => item.bucket === "E1" || item.bucket === "E2").every(item => ["A"].includes(item.code))).toBe(true);
    // The later phase is a package of its own with its own outcome and acceptance, wholly follow-on.
    const later = effort.workPackages.find(row => row.id === LATER_DESIGN_PHASE.id)!;
    expect(later).toMatchObject({ label: "Workload Domain, DR and NSX Overlay Design", total: 0, deferred: "not funded" });
    expect(later.followOn!.total).toBeGreaterThan(0);
    expect(later.detail!.outcome).toMatch(/workload domain/);
    expect(later.detail!.acceptance).toMatch(/approve/);
    // No design package carries both entitlement hours and follow-on hours.
    expect(effort.workPackages.filter(row => /design/.test(row.id) && row.total > 0).every(row => !row.followOn)).toBe(true);
    // The follow-on design hours are the later phases' hours, as planned.
    const laterBase = byUnit("A:workload").loaded + byUnit("A:dr-nsx").loaded;
    expect(later.followOn!.total).toBeGreaterThan(laterBase - 3);
    expect(later.followOn!.total).toBeLessThan(laterBase + 3);
  });

  it("does not phase a design that fits", () => {
    const document = phased();
    document.report.entitlement.hours = 200;
    expect(effortOf(document).internal.fit!.designPhased).toBe(false);
  });
});

describe("rule 5: what still does not fit is under-funded and stays internal", () => {
  it("flags the gap, the hours the full scope needs, and splits nothing further", () => {
    const document = acmeHealthUnderFunded();
    const effort = effortOf(document);
    const fit = effort.internal.fit!;
    expect(fit.underFunded).not.toBeNull();
    expect(fit.underFunded!.gapHours).toBeGreaterThan(0);
    expect(fit.underFunded!.fullScopeGapHours).toBeGreaterThan(fit.underFunded!.gapHours);
    // The foundation design stays whole, in the entitlement; everything else is wholly follow-on.
    expect(fit.placements.filter(item => item.bucket === "E1").map(item => item.unitId)).toEqual(["A:foundation"]);
    expect(effort.workPackages.every(row => !(row.total > 0 && (row.followOn?.total ?? 0) > 0))).toBe(true);
    expect(fit.warnings[0]).toMatch(/^Under-funded/);
  });

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
      const gap = effort.internal.fit!.underFunded!;
      for (const format of ["summary", undefined] as const) {
        const text = visible(renderCondensedFcpHtml(document.fields.customerName, document, { effort, today: FIXTURE_TODAY, ...(format ? { format } : {}) }));
        expect(text).not.toMatch(/under-?funded|full scope needs|fillable|design first|more hours than/i);
        expect(text).not.toContain(`${Math.round(gap.fullScopeGapHours)} more hours`);
        expect(text).not.toContain("Closing the gap");
      }
    }
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
