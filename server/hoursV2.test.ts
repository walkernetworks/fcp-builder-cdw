import { describe, expect, it } from "vitest";
import { buildScopedEffort } from "../shared/effort";
import { createDefaultDocument, refreshDerivedDocument, type EngagementDocument, type EstimateInputs } from "../shared/fcp";
import { fitV2 } from "../shared/hoursFit";
import { loadedOf, scopeV2, type Pass1, type V2Code } from "../shared/hoursV2";

type Options = {
  path?: string;
  edition?: "vcf" | "vvf";
  hosts?: number;
  clusters?: number;
  vms?: number;
  sites?: number;
  rvtoolsDatacenters?: number;
  vcenters?: number;
  instances?: number;
  elm?: boolean;
  prior?: boolean;
  topology?: "undecided" | "consolidated" | "standard";
  storage?: "undecided" | "vsan" | "nfs-v3" | "vmfs-fc" | "other-existing";
  focus?: Partial<Record<"operations" | "automation" | "networking" | "security" | "resilience" | "kubernetes" | "privateAi", string[]>>;
  priorities?: string[];
  depth?: Partial<Record<"operations" | "automation" | "networkingSecurity" | "kubernetesAi" | "efficiency", string>>;
  inputs?: EstimateInputs;
  entitlement?: number;
};

const CAPABILITY: Record<string, string> = { operations: "operations", automation: "automation", networking: "networking", security: "security", resilience: "resilience", kubernetes: "kubernetes", privateAi: "private-ai" };

function doc(options: Options = {}): EngagementDocument {
  let document = createDefaultDocument();
  const focus = options.focus ?? {};
  Object.assign(document.fields, {
    customerName: "Test", customerSegment: "commercial", entitlementAmount: options.entitlement ?? 0, entitlementStart: "2027-01-04", plannedProjectStart: "2027-01-04", hoursModel: "v2",
    priorities: options.priorities ?? Object.keys(focus).map(key => CAPABILITY[key]),
    estimateInputs: options.inputs ?? {},
    adoptionDetails: {
      ...document.fields.adoptionDetails,
      platformEdition: options.edition ?? "vcf",
      upgradePath: options.path ?? "greenfield",
      domainTopology: options.topology ?? "undecided",
      principalStorage: options.storage ?? "undecided",
      ...focus,
      componentDepths: { ...document.fields.adoptionDetails.componentDepths, ...options.depth },
    },
  });
  const hosts = options.hosts ?? 40;
  Object.assign(document.inventory, { hosts, clusters: options.clusters ?? 0, vmCount: options.vms ?? 0, datacenters: options.rvtoolsDatacenters ?? 1 });
  // Sites come from the brief (or the planner), never from RVTools datacenter objects.
  document.report.discovery = { ...document.report.discovery, datacenters: options.sites ?? null, vcenters: options.vcenters ?? 1, vcfInstances: options.instances ?? null, enhancedLinkedMode: options.elm ?? null, assessmentCompleted: options.prior ?? false };
  return refreshDerivedDocument(document);
}

const lineOf = (pass1: Pass1, code: V2Code) => pass1.lines.find(line => line.code === code);
const base = (document: EngagementDocument, code: V2Code) => lineOf(scopeV2(document), code)?.computedBase ?? 0;
const units = (document: EngagementDocument, code: V2Code) => lineOf(scopeV2(document), code)!.units.map(unit => [unit.id, unit.base] as const);

describe("v2 Pass 1 formulas (spec section 6)", () => {
  it("prices discovery from hosts, vCenters and sites, capped at 120", () => {
    expect(base(doc({ hosts: 40 }), "DD")).toBeCloseTo(36); // 24 + 6 + 6
    expect(base(doc({ hosts: 150, vcenters: 4, sites: 3 }), "DD")).toBeCloseTo(94.5); // 24 + 22.5 + 24 + 24
    expect(base(doc({ hosts: 600, vcenters: 10, sites: 4 }), "DD")).toBe(120);
    expect(base(doc({ hosts: 40, prior: true }), "DD")).toBe(0);
    expect(base(doc({ hosts: 40, inputs: { broadcomBaselineDelivered: true } }), "DD")).toBe(12);
  });

  it("prices discovery by area, with a site term for networking, DR and HCX", () => {
    expect(base(doc({ focus: { operations: ["observability"], security: ["segmentation"] } }), "DX")).toBe(20); // 8 + 12
    expect(base(doc({ sites: 3, focus: { networking: ["overlay-transport"] } }), "DX")).toBe(20); // 12 + 4 x 2
    expect(base(doc({ sites: 2, focus: { resilience: ["recovery-architecture"] } }), "DX")).toBe(16); // 12 + 4
  });

  it("prices design from topology", () => {
    // 64 + 16 x 2 WLDs + 24 extra instance + 32 extra site + 24 stretched + 8 extra storage type + min(40, 0.25 x 68)
    expect(base(doc({ hosts: 100, sites: 2, instances: 2, inputs: { workloadDomains: 2, stretchedClusters: 1, storageTypes: 2 } }), "A")).toBeCloseTo(201);
    expect(base(doc({ hosts: 400 }), "A")).toBe(64 + 16 + 40);
  });

  it("does not count RVTools datacenter objects as sites", () => {
    const pass1 = scopeV2(doc({ path: "design-only", hosts: 72, clusters: 29, rvtoolsDatacenters: 24, focus: { operations: ["lifecycle"] } }));
    expect(pass1.inputs.sites).toBe(1);
    expect(lineOf(pass1, "A")!.computedBase).toBeCloseTo(64 + 16 + 10);
    expect(pass1.assumptions.find(item => item.key === "sites")!.source).toMatch(/24 vCenter datacenter objects/);
    expect(scopeV2(doc({ path: "design-only", hosts: 72, rvtoolsDatacenters: 24, inputs: { sites: 3 } })).inputs.sites).toBe(3);
  });

  it("sizes a build by the new platform's clusters, and converge or import by the existing ones", () => {
    const build = scopeV2(doc({ path: "greenfield", hosts: 144, clusters: 36, storage: "vmfs-fc" }));
    expect(build.inputs.platformClusters).toBe(9);
    expect(lineOf(build, "S_storage")!.computedBase).toBe(72);
    expect(lineOf(build, "D")!.computedBase).toBeCloseTo(84 + 24 + 8 * 7 + 48 + 0.5 * 80);
    expect(scopeV2(doc({ path: "greenfield", hosts: 144, clusters: 36, inputs: { targetClusters: 12 } })).inputs.platformClusters).toBe(12);
    const converge = scopeV2(doc({ path: "converge", hosts: 144, clusters: 36 }));
    expect(converge.inputs.platformClusters).toBe(36);
    expect(lineOf(converge, "C1")!.computedBase).toBeCloseTo(40 + 4 * 36 + 0.25 * 144 + 8);
  });

  it("prices the VCF deploy continuously", () => {
    // 64 + 16 + 4 + (24 + 8 dedicated NSX) + 8 x (7 - 1 - 1) + 0.75 x 64 + 0.5 x 36
    expect(base(doc({ hosts: 100, clusters: 7, inputs: { dedicatedNsxWorkloadDomains: 1 } }), "D")).toBeCloseTo(222);
    // Consolidated: no workload domain, every extra cluster counts.
    expect(base(doc({ hosts: 8, clusters: 1, topology: "consolidated" }), "D")).toBeCloseTo(84 + 6);
    expect(base(doc({ hosts: 24, clusters: 2 }), "D")).toBeCloseTo(84 + 24 + 0.75 * 24);
    expect(base(doc({ hosts: 25, clusters: 2 }), "D")).toBeCloseTo(84 + 24 + 0.75 * 25);
  });

  it("prices the VVF build and the storage adder", () => {
    expect(base(doc({ edition: "vvf", hosts: 20, clusters: 2 }), "D_VVF")).toBe(40 + 16 + 8 + 15);
    expect(base(doc({ hosts: 20, clusters: 2, storage: "vmfs-fc", inputs: { mixedStorage: true } }), "S_storage")).toBe(16 + 8);
    expect(base(doc({ hosts: 20, clusters: 2, storage: "vsan" }), "S_storage")).toBe(0);
  });

  it("prices converge, remediation and the VVF upgrade", () => {
    expect(base(doc({ path: "converge", hosts: 40 }), "C1")).toBeCloseTo(70); // 40 + 4 x 3 + 10 + 8 NSX
    expect(base(doc({ path: "converge", edition: "vvf", hosts: 40 }), "C1")).toBeCloseTo(62); // no NSX on VVF
    expect(base(doc({ path: "converge", hosts: 40, inputs: { clustersOnVum: 2, vcentersWithIwa: 1, clustersOnVss: 1, legacyLogs: true } }), "R_remed")).toBe(8 + 4 + 6 + 8);
    expect(base(doc({ path: "in-place", edition: "vvf", hosts: 64, clusters: 4, vcenters: 2 }), "U_VVF")).toBe(16 + 16 + 16);
  });

  it("prices import per vCenter with the ELM and NSX adders on the first", () => {
    const document = doc({ path: "import-workload-domain", hosts: 64, clusters: 4, vcenters: 2, elm: true, inputs: { source8x: true } });
    // Per vCenter: 24 + 4 x 2 + 0.1 x 32 + (12 + 0.25 x 32); the first adds NSX 8 and ELM 16.
    expect(units(document, "X1")).toEqual([["X1:vcenter-1", expect.closeTo(79.2, 6)], ["X1:vcenter-2", expect.closeTo(55.2, 6)]]);
  });

  it("brings an in-place VCF estate under management with converge, import and the VCF upgrade, never a deploy", () => {
    const pass1 = scopeV2(doc({ path: "in-place", hosts: 150, clusters: 6, vcenters: 1 }));
    expect(lineOf(pass1, "C1")!.computedBase).toBeCloseTo(109.5); // 40 + 24 + 37.5 + 8
    expect(lineOf(pass1, "D")).toBeUndefined();
    expect(lineOf(pass1, "U3")).toBeUndefined();
    // Already VCF: U3 = 24 + 16 + 8 + 12 x 2 domains + 6 x 4 clusters + VCFA 12 + SRM 12 + 8 x 2 Supervisors.
    const upgrade = scopeV2(doc({ path: "in-place", hosts: 64, clusters: 4, vcenters: 2, inputs: { sourceIsVcf: true, upgradeVcfAutomation: true, upgradeSrm: true, upgradeSupervisors: 2 } }));
    expect(lineOf(upgrade, "U3")!.computedBase).toBe(136);
    expect(lineOf(upgrade, "X1")!.units).toHaveLength(1);
  });

  it("prices migration waves from VMs, waves and site pairs, with HCX setup and the pilot in the first wave", () => {
    const document = doc({ hosts: 20, vms: 500 });
    expect(base(document, "FILL_mig")).toBeCloseTo(217); // 16 + 50 + 40 + 75 + 20 + 16
    expect(units(document, "FILL_mig")).toEqual([
      ["FILL_mig:wave-1", expect.closeTo(16 + 20 + 16 + 10 + 0.25 * 150, 6)],
      ["FILL_mig:wave-2", expect.closeTo(47.5, 6)],
      ["FILL_mig:wave-3", expect.closeTo(47.5, 6)],
      ["FILL_mig:wave-4", expect.closeTo(22.5, 6)],
    ]);
    expect(base(doc({ hosts: 4, vms: 100 }), "FILL_mig")).toBeCloseTo(87);
  });

  it("prices in-place host waves by change window, with first-cluster proving in the first", () => {
    const document = doc({ path: "in-place", hosts: 40 });
    expect(base(document, "FILL_ip")).toBe(30); // 4 x 3 + 0.25 x 40 + 8
    expect(units(document, "FILL_ip")).toEqual([["FILL_ip:window-1", 16], ["FILL_ip:window-2", 8], ["FILL_ip:window-3", 6]]);
  });

  it("prices automation as one platform plus modules", () => {
    const document = doc({ focus: { automation: ["vm-self-service", "infrastructure-as-code"] }, inputs: { orgs: 2, catalogItems: 5, templates: 5 } });
    expect(base(document, "X_VCFA_platform")).toBe(32);
    expect(base(document, "X2")).toBe(24 + 16 + 8);
    expect(base(document, "X3")).toBe(32 + 8);
  });

  it("prices VCF Operations once, as modules on a base", () => {
    const document = doc({
      focus: { operations: ["lifecycle", "observability", "capacity-cost", "custom-dashboards", "identity-certificates", "event-integration"] },
      inputs: { vcenterSources: 2, managementPacks: 1, dashboards: 2, eventTargets: 2 },
    });
    expect(base(document, "X4")).toBe(16 + 8 + 4 + 8 + 12 + 12 + 8 + 8 + 32);
  });

  it("prices NSX overlay, Edge, VPC and VDS", () => {
    expect(base(doc({ hosts: 40, focus: { networking: ["overlay-transport"] }, inputs: { segments: 8 } }), "X5")).toBe(16 + 12 + 6);
    expect(base(doc({ focus: { networking: ["edge-cluster-routing"] }, inputs: { edgeClusters: 2, extraUplinkPairs: 1 } }), "X6")).toBe(88);
    expect(base(doc({ focus: { networking: ["vpc"] }, inputs: { externalVlans: 2, virtualNetworkAppliance: true } }), "X16")).toBe(16 + 8 + 12);
    const centralized = scopeV2(doc({ focus: { networking: ["vpc"] }, inputs: { transitGateway: "centralized" } }));
    expect(lineOf(centralized, "X16")!.computedBase).toBe(16);
    expect(lineOf(centralized, "X6")!.computedBase).toBe(40);
    expect(lineOf(centralized, "X16")!.requires).toContain("X6");
    expect(base(doc({ hosts: 40, focus: { networking: ["physical-fabric"] } }), "X7")).toBe(12 + 6);
  });

  it("prices vDefend by stage, zone and application, and never adds the NSX overlay for a security outcome", () => {
    const pass1 = scopeV2(doc({ focus: { security: ["segmentation"] } }));
    expect(lineOf(pass1, "X11")!.computedBase).toBe(24 + 8 + 16 + 30);
    expect(lineOf(pass1, "X5")).toBeUndefined();
    expect(base(doc({ focus: { security: ["segmentation", "security-intelligence"] } }), "X11")).toBe(78 + 16);
    // Malware prevention needs the SSP: deployed once, on the threat-prevention line.
    const atp = scopeV2(doc({ focus: { security: ["segmentation", "ids-ips", "malware-prevention", "security-intelligence"] } }));
    expect(lineOf(atp, "X12")!.computedBase).toBe(24 + 12 * 2 + 8);
    expect(lineOf(atp, "X11")!.computedBase).toBe(78);
    expect(lineOf(atp, "X5")).toBeUndefined();
    expect(base(doc({ focus: { security: ["ids-ips"] } }), "X12")).toBe(12 + 8);
  });

  it("prices recovery by site pair, protected VMs and exercises", () => {
    expect(base(doc({ hosts: 40, vms: 1000, focus: { resilience: ["recovery-architecture", "recovery-exercises"] } }), "X10")).toBe(24 + 2 + 20 + 12);
    expect(base(doc({ hosts: 40, vms: 1000, focus: { resilience: ["cyber-recovery"] } }), "X10")).toBe(24 + 2 + 20 + 32);
    expect(base(doc({ hosts: 40, vms: 1000, focus: { resilience: ["cloud-cyber-recovery"] } }), "X14")).toBe(16 + 10 + 12);
  });

  it("prices Kubernetes, Private AI, DSM, Avi and efficiency, with their dependencies", () => {
    expect(base(doc({ focus: { kubernetes: ["workload-domains"] } }), "X9")).toBe(32);
    const ai = scopeV2(doc({ focus: { privateAi: ["gpu-capacity"] }, inputs: { gpuHosts: 4, models: 2 } }));
    expect(lineOf(ai, "X8")!.computedBase).toBe(24 + 8 + 8 + 8 + 16);
    expect(lineOf(ai, "X8")!.requires).toEqual(["X9"]);
    expect(lineOf(ai, "X9")).toBeDefined();
    const dsm = scopeV2(doc({ focus: { automation: ["data-services"] }, inputs: { engines: 2, dsmTemplates: 1 } }));
    expect(lineOf(dsm, "X13")!.computedBase).toBe(36);
    expect(lineOf(dsm, "X13")!.requires).toEqual(["X_VCFA_platform", "X9"]);
    expect(lineOf(dsm, "X_VCFA_platform")).toBeDefined();
    expect(lineOf(dsm, "X9")).toBeDefined();
    expect(base(doc({ focus: { networking: ["load-balancing"] }, inputs: { virtualServices: 5 } }), "X15")).toBe(16 + 8 + 8);
    expect(base(doc({ focus: { networking: ["load-balancing"], security: ["waf"] } }), "X15")).toBe(16 + 8 + 8);
    expect(base(doc({ depth: { efficiency: "tier-1" }, inputs: { tieredHosts: 8 } }), "EF")).toBe(14);
  });

  it("allows Supervisor and VKS on VVF but no NSX, VPC or vDefend", () => {
    const pass1 = scopeV2(doc({ edition: "vvf", focus: { kubernetes: ["workload-domains"], networking: ["overlay-transport", "vpc"], security: ["segmentation"] } }));
    expect(lineOf(pass1, "X9")).toBeDefined();
    for (const code of ["X5", "X6", "X16", "X12"] as V2Code[]) expect(lineOf(pass1, code)).toBeUndefined();
  });

  it("applies the depth multiplier to add-ons only, as tier uplift units", () => {
    const pass1 = scopeV2(doc({ hosts: 40, focus: { networking: ["overlay-transport"] }, depth: { networkingSecurity: "tier-3" } }));
    const overlay = lineOf(pass1, "X5")!;
    expect(overlay.depthMultiplier).toBe(1.6);
    expect(overlay.computedBase).toBeCloseTo(28 * 1.6);
    expect(overlay.units.filter(unit => unit.tier > 1).map(unit => [unit.id, unit.base])).toEqual([["X5:tier-2", 7], ["X5:tier-3", expect.closeTo(28 * 0.35, 6)]]);
    expect(lineOf(pass1, "A")!.depthMultiplier).toBe(1);
  });

  it("keeps 25% of each add-on on design-only and undecided pathways", () => {
    for (const path of ["design-only", "undecided"]) {
      const pass1 = scopeV2(doc({ path, focus: { operations: ["observability"] } }));
      expect(lineOf(pass1, "X4")!.computedBase).toBeCloseTo(0.25 * (16 + 4 + 12));
      expect(lineOf(pass1, "X4")!.designOnly).toBe(true);
      expect(lineOf(pass1, "D")).toBeUndefined();
    }
  });

  it("splits roles: 10% secondary, 20% on X11, X12 and X16, none on DX, and 15% PM at engagement level with floors", () => {
    const pass1 = scopeV2(doc({ focus: { security: ["segmentation"], operations: ["observability"] } }));
    expect(lineOf(pass1, "A")!.secondaryShare).toBe(0.1);
    expect(lineOf(pass1, "X11")!.secondaryShare).toBe(0.2);
    expect(lineOf(pass1, "DX")!.secondaryShare).toBe(0);
    const technical = pass1.lines.reduce((sum, line) => sum + line.computedBase * (1 + line.secondaryShare), 0);
    expect(pass1.technical).toBeCloseTo(technical);
    expect(pass1.pm).toBeCloseTo(0.15 * technical);
    expect(loadedOf(pass1, lineOf(pass1, "A")!, 100)).toBeCloseTo(126.5);
    expect(loadedOf(pass1, lineOf(pass1, "X11")!, 100)).toBeCloseTo(138);
    expect(loadedOf(pass1, lineOf(pass1, "DX")!, 100)).toBeCloseTo(115);
    // A small import with a prior assessment: 15% of technical is under the 24-hour build floor.
    const small = scopeV2(doc({ path: "import-workload-domain", hosts: 8, prior: true, inputs: { noExistingNsx: false } }));
    expect(small.pmFloorApplied).toBe(true);
    expect(small.pm).toBe(24);
  });

  it("lists every defaulted input as an assumption", () => {
    const pass1 = scopeV2(doc({ focus: { security: ["segmentation"] } }));
    const keys = pass1.assumptions.map(item => item.key);
    expect(keys).toEqual(expect.arrayContaining(["clusters", "vms", "zones", "apps", "migrationSitePairs", "extendedVlans"]));
    expect(keys).not.toContain("gpuHosts");
    expect(scopeV2(doc({ focus: { security: ["segmentation"] }, inputs: { zones: 6 } })).assumptions.map(item => item.key)).not.toContain("zones");
  });
});

describe("v2 Pass 2 fit (spec section 7)", () => {
  /** The spec 7.8 inputs: $100k at $250/hr, 40 hosts, 1 site, 1 vCenter, 800 VMs, converge, Operations + segmentation + VM self-service at Tier 2. */
  const example = () => doc({
    path: "converge", hosts: 40, vms: 800, vcenters: 1,
    focus: { operations: ["lifecycle", "observability"], security: ["segmentation"], automation: ["vm-self-service"] },
    depth: { operations: "tier-2", automation: "tier-2", networkingSecurity: "tier-2" },
  });
  const fitOf = (pass1: Pass1, entitlementHours: number, extra: Partial<Parameters<typeof fitV2>[1]> = {}) => fitV2(pass1, { entitlementHours, monthsRemaining: 12, datedWaves: 1, ...extra });

  it("reproduces the 7.8 worked example under the section 6 and 7 rules", () => {
    const fit = fitOf(scopeV2(example()), 100_000 / 250);
    const e1 = fit.placements.filter(item => item.bucket === "E1");
    expect(e1.map(item => item.unitId)).toEqual(["DD", "DX:Operations and automation", "DX:Security", "A", "C1", "X4:platform", "X4:lifecycle", "X4:observability"]);
    expect(fit.buckets.E1).toBeCloseTo(45.54 + 23 + 103.73 + 88.55 + 50.6, 1);
    expect(fit.placements.filter(item => item.bucket === "E2").map(item => item.unitId)).toEqual(["X11:stages-1-2", "X11:stage-3", "X11:zone-1", "X11:zone-2"]);
    expect(fit.buckets.E1 + fit.buckets.E2).toBeCloseTo(366.62, 1);
    expect(fit.buckets.E1 + fit.buckets.E2).toBeLessThanOrEqual(fit.fillableHours);
    expect(fit.reserveHours).toBe(32);
    expect(fit.fillableHours).toBe(368);
    const displaced = fit.placements.filter(item => item.bucket === "F").map(item => item.unitId);
    expect(displaced).toEqual(expect.arrayContaining(["X11:zone-3", "X11:zone-4", "X11:app-1", "X11:app-5", "X_VCFA_platform", "X2:module", "X2:org-1", "X11:tier-2", "X2:tier-2", "X4:tier-2"]));
    expect(fit.designShareFlags).toHaveLength(2);
    expect(fit.underFunded).toBeNull();
  });

  it("never changes Pass 1", () => {
    const pass1 = scopeV2(example());
    const before = JSON.stringify(pass1);
    const freeze = (value: unknown): unknown => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    freeze(pass1);
    for (const hours of [50, 300, 400, 2000]) expect(() => fitOf(pass1, hours)).not.toThrow();
    expect(JSON.stringify(pass1)).toBe(before);
  });

  it("puts every hour of scope in exactly one bucket", () => {
    const pass1 = scopeV2(doc({ hosts: 60, vms: 1500, focus: { operations: ["observability"], networking: ["overlay-transport"], resilience: ["recovery-architecture", "recovery-exercises"] }, depth: { operations: "tier-3" } }));
    const total = pass1.lines.reduce((sum, line) => sum + loadedOf(pass1, line, line.computedBase), 0);
    for (const hours of [300, 900, 1500, 5000]) {
      const fit = fitOf(pass1, hours);
      expect(fit.buckets.E1 + fit.buckets.E2 + fit.buckets.F + fit.buckets.C).toBeCloseTo(total, 6);
      expect(new Set(fit.placements.map(item => `${item.unitId}|${item.designShare ?? false}`)).size).toBe(fit.placements.length);
    }
  });

  it("flags an under-funded core with its gap and keeps the whole core rather than stopping mid-spine", () => {
    const pass1 = scopeV2(doc({ hosts: 40, vms: 800 }));
    const fit = fitOf(pass1, 200);
    expect(fit.underFunded).not.toBeNull();
    expect(fit.underFunded!.gapHours).toBeCloseTo(fit.coreRequiredHours - fit.fillableHours, 6);
    expect(fit.placements.filter(item => item.step <= 5).every(item => item.bucket === "E1")).toBe(true);
    expect(fit.buckets.E2).toBe(0);
    expect(fit.warnings[0]).toMatch(/^Under-funded/);
  });

  it("keeps a displaced add-on's design share in E2 when it fits", () => {
    const pass1 = scopeV2(example());
    const core = fitOf(pass1, 100_000).coreRequiredHours;
    // Room for the core, all of X11 at Tier 1 and 15 hours: the Automation platform (40.5) does not fit, its design share (10.1) does, and the X2 share then does not.
    const x11 = pass1.lines.find(line => line.code === "X11")!;
    const x11Tier1 = x11.units.filter(unit => unit.tier === 1).reduce((sum, unit) => sum + loadedOf(pass1, x11, unit.base), 0);
    const fit = fitOf(pass1, (core + x11Tier1 + 15) / 0.92);
    const shares = fit.placements.filter(item => item.designShare);
    expect(shares.map(item => item.code)).toEqual(["X_VCFA_platform"]);
    expect(shares[0].bucket).toBe("E2");
    expect(shares[0].base).toBeCloseTo(8);
    // The rest of the line carries 75% of its Tier 1 units into F.
    expect(fit.placements.find(item => item.unitId === "X_VCFA_platform" && !item.designShare)).toMatchObject({ bucket: "F", base: 24 });
    expect(fit.designShareFlags.some(flag => flag.startsWith("VM self-service"))).toBe(true);
  });

  it("moves the design share with the line and flags it when it does not fit", () => {
    const fit = fitOf(scopeV2(example()), 400);
    expect(fit.placements.some(item => item.designShare)).toBe(false);
    expect(fit.designShareFlags).toEqual(expect.arrayContaining([expect.stringContaining("VCF Automation platform")]));
  });

  it("splits migration waves by wave and keeps HCX setup and the pilot with the first", () => {
    const pass1 = scopeV2(doc({ hosts: 40, vms: 800 }));
    const core = fitOf(pass1, 100_000).coreRequiredHours;
    const waves = pass1.lines.find(line => line.code === "FILL_mig")!;
    const fit = fitOf(pass1, (core + loadedOf(pass1, waves, waves.units[1].base) + 1) / 0.92);
    const placed = (id: string) => fit.placements.find(item => item.unitId === id)!;
    expect(placed("FILL_mig:wave-1")).toMatchObject({ bucket: "E1", step: 4 });
    expect(placed("FILL_mig:wave-2")).toMatchObject({ bucket: "E2", step: 7 });
    expect(placed("FILL_mig:wave-3").bucket).toBe("F");
    // More dated waves pull more into E1.
    expect(fitOf(pass1, 100_000, { datedWaves: 3 }).placements.filter(item => item.code === "FILL_mig" && item.step === 4)).toHaveLength(3);
  });

  it("splits in-place windows, imports by vCenter, recovery by site pair and exercise, and vDefend by stage", () => {
    const inPlace = fitOf(scopeV2(doc({ path: "in-place", hosts: 64 })), 100_000);
    expect(inPlace.placements.filter(item => item.code === "FILL_ip").map(item => item.unitId)).toEqual(["FILL_ip:window-1", "FILL_ip:window-2", "FILL_ip:window-3", "FILL_ip:window-4"]);
    const imports = scopeV2(doc({ path: "import-workload-domain", hosts: 64, clusters: 4, vcenters: 2, elm: true }));
    expect(imports.lines.find(line => line.code === "X1")!.units.map(unit => unit.tag)).toEqual(["first-vcenter", "vcenter"]);
    const recovery = scopeV2(doc({ hosts: 40, focus: { resilience: ["recovery-architecture", "recovery-exercises"] }, inputs: { drSitePairs: 2, exercises: 2 } }));
    expect(recovery.lines.find(line => line.code === "X10")!.units.map(unit => unit.tag)).toEqual(["site-pair", "site-pair", "exercise", "exercise"]);
    const segmentation = scopeV2(doc({ focus: { security: ["segmentation"] } }));
    expect(segmentation.lines.find(line => line.code === "X11")!.units.slice(0, 3).map(unit => [unit.id, unit.base])).toEqual([["X11:stages-1-2", 24], ["X11:stage-3", 8], ["X11:zone-1", 4]]);
  });

  it("splits depth by tier: Tier 1 can be funded while the uplift is displaced", () => {
    const fit = fitOf(scopeV2(example()), 400);
    expect(fit.placements.find(item => item.unitId === "X4:observability")!.bucket).toBe("E1");
    expect(fit.placements.find(item => item.unitId === "X4:tier-2")!.bucket).toBe("F");
  });

  it("follows the customer's outcome ranking and sends work they want this year to C", () => {
    const pass1 = scopeV2(example());
    const ranked = fitOf(pass1, 400, { ranking: ["automation", "security"] });
    expect(ranked.placements.filter(item => item.bucket === "E2").map(item => item.code)[0]).toBe("X_VCFA_platform");
    const wanted = fitOf(pass1, 400, { wantThisYear: ["automation"] });
    expect(wanted.placements.filter(item => item.code === "X2" && !item.designShare).every(item => item.bucket === "C")).toBe(true);
    expect(wanted.notFunded.find(row => row.code === "X2")!.bucket).toBe("C");
  });

  it("states the burn rate, reserve release and the follow-on condition", () => {
    const fit = fitOf(scopeV2(example()), 400, { monthsRemaining: 10 });
    expect(fit.requiredMonthlyBurn).toBe(40);
    expect(fit.notes.join(" ")).toMatch(/month 6/);
    expect(fit.notes.join(" ")).toMatch(/depends on a future purchase/);
  });
});

describe("v2 in the plan", () => {
  it("spreads the funded share on the stages and moves stages with nothing funded to the Two-Year Notional", () => {
    const document = { ...doc({ path: "converge", hosts: 40, vms: 800, focus: { operations: ["lifecycle", "observability"], security: ["segmentation"], automation: ["vm-self-service"] }, depth: { operations: "tier-2", automation: "tier-2", networkingSecurity: "tier-2" } }) };
    const effort = buildScopedEffort(document, { envelopeHours: 400, today: "2026-12-01" });
    expect(effort.internal.fit).toBeDefined();
    expect(effort.totals.total).toBeGreaterThan(360);
    expect(effort.totals.total).toBeLessThanOrEqual(370);
    const automation = effort.workPackages.find(row => row.id === "bar-cloud-automation-vm-self-service")!;
    expect(automation.deferred).toBe("not funded");
    expect(automation.followOn!.total).toBeGreaterThan(0);
    const segmentation = effort.workPackages.find(row => row.id === "bar-security-segmentation")!;
    expect(segmentation.total).toBeGreaterThan(0);
    expect(segmentation.followOn!.total).toBeGreaterThan(0);
    expect(effort.workPackages.some(row => row.id.startsWith("line:"))).toBe(false);
  });

  it("keeps v1 as the default and leaves v1 hours unchanged", () => {
    const document = doc({ hosts: 40 });
    const v1 = buildScopedEffort({ ...document, fields: { ...document.fields, hoursModel: "v1" } });
    expect(v1.internal.pass1).toBeUndefined();
    expect(v1.internal.lines.map(line => line.code)).toEqual(["A2", "DD1", "D4", "FILL"]);
  });
});

describe("entitlement ceiling and the reserve field", () => {
  it("never plans more than the entitlement after the reserve; the latest work moves to the follow-on", async () => {
    const { scopedEffortForDocument } = await import("./rateCard");
    // A 150-host greenfield build whose core needs more than this entitlement funds.
    const document = doc({ hosts: 150, entitlement: 150_000 });
    const effort = scopedEffortForDocument(document);
    const fit = effort.internal.fit!;
    expect(effort.totals.total).toBeLessThanOrEqual(Math.floor(fit.fillableHours));
    expect(fit.movedToFollowOn?.hours ?? 0).toBeGreaterThan(0);
    expect(fit.underFunded).toBeNull();
    expect(effort.internal.cost!.status).not.toBe("over");
    // Moved work is follow-on, and the buckets follow it.
    const moved = effort.workPackages.filter(row => row.deferred === "over budget");
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.every(row => (row.followOn?.total ?? 0) > 0)).toBe(true);
    expect(Math.abs(fit.buckets.E1 + fit.buckets.E2 - effort.totals.total)).toBeLessThanOrEqual(2);
    // Design packages stay in the entitlement.
    expect(moved.some(row => /^bar-playbook-(component-)?design-|^bar-(hcl-review|design-access-mapping)$/.test(row.id))).toBe(false);
  });

  it("uses the reserve set on the engagement, and none when it is 0", async () => {
    const { scopedEffortForDocument } = await import("./rateCard");
    const share = (reservePercent?: number) => { const fit = scopedEffortForDocument(doc({ hosts: 40, entitlement: 400_000, inputs: reservePercent === undefined ? {} : { reservePercent } })).internal.fit!; return fit.reserveHours / fit.entitlementHours; };
    expect(share()).toBeCloseTo(0.08);
    expect(share(12)).toBeCloseTo(0.12);
    expect(share(0)).toBe(0);
  });
});

describe("work moved to the Two-Year Notional keeps its order", () => {
  const domainPlan = (entitlementAmount: number) => {
    const document = createDefaultDocument();
    Object.assign(document.fields, { customerName: "Test", entitlementStart: "2026-10-11", entitlementAmount, plannedProjectStart: "2026-10-16", plannedImplementationStart: "2026-10-16", hardwareAvailability: "new", priorities: ["networking", "operations"], hoursModel: "v2" });
    document.inventory.hosts = 313;
    document.fields.adoptionDetails = { ...document.fields.adoptionDetails, upgradePath: "hybrid", domainTopology: "standard", networking: ["overlay-transport", "edge-cluster-routing"], domains: [
      { name: "North", kind: "management", pathway: "greenfield", instance: "North", hosts: 4, notes: "" },
      { name: "South", kind: "management", pathway: "greenfield", instance: "South", hosts: 4, notes: "" },
      { name: "Citrix VDI", kind: "workload", pathway: "greenfield", instance: "North", hosts: 80, notes: "" },
      { name: "Epic", kind: "workload", pathway: "import", instance: "North", hosts: 40, notes: "" },
    ] } as never;
    return refreshDerivedDocument(document, { forceRebuild: true });
  };

  it("leaves no stage, or checkpoint, starting before its prerequisite ends", async () => {
    const { scopedEffortForDocument } = await import("./rateCard");
    const { timelinesWithDeferrals, withOwnership } = await import("../shared/effort");
    const { validateTimelineSequence } = await import("../shared/fcp");
    for (const value of [120_000, 200_000, 300_000]) {
      const document = domainPlan(value);
      const deferred = scopedEffortForDocument(document).workPackages.filter(row => row.deferred).map(row => row.id);
      expect(validateTimelineSequence(timelinesWithDeferrals(withOwnership(document), deferred).notional)).toEqual([]);
    }
  });

  it("starts moved work after a prerequisite that stayed but runs past the entitlement end", async () => {
    const { timelinesWithDeferrals, withOwnership } = await import("../shared/effort");
    const { validateTimelineSequence } = await import("../shared/fcp");
    const document = domainPlan(10_000_000);
    // NSX stays in the entitlement but is stretched past its end; only the workload domain moves.
    const lanes = document.twoYearPlan.lanes.map(lane => ({ ...lane, bars: lane.bars.map(bar => (bar.id === "bar-vcf-networking-nsx" ? { ...bar, endCol: bar.endCol + 14 } : bar)) }));
    const stretched = { ...document, twoYearPlan: { ...document.twoYearPlan, lanes } };
    const notional = timelinesWithDeferrals(withOwnership(stretched), ["bar-workload-domain"]).notional;
    const bars = new Map(notional.lanes.flatMap(lane => lane.bars).map(bar => [bar.id, bar]));
    expect(bars.get("bar-workload-domain")!.startCol).toBeGreaterThanOrEqual(bars.get("bar-vcf-networking-nsx")!.endCol);
    expect(validateTimelineSequence(notional).filter(item => /Citrix VDI/.test(item))).toEqual([]);
  });
});
