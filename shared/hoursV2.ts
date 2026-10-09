import { HOURS_V2 as H, type Coefficient } from "./hoursConfig";
import { effectiveDeliveryPath, effectivePlatformEdition, resolvePlanOutcomes, type AdoptionDetails, type Capability, type EngagementDocument, type VcfDeliveryPath } from "./fcp";

/**
 * v2 hours model, Pass 1 (scope): every catalog line at its true effort, from the formulas in section 6 of
 * docs/FCP_Hours_Model_Rebuild.md. Nothing here depends on the entitlement. Values are not rounded; round
 * only when presenting. Pass 2 (shared/hoursFit.ts) splits these lines at their units and never changes them.
 */

export type V2Code =
  | "DD" | "DX" | "A" | "D" | "D_VVF" | "S_storage" | "C1" | "R_remed" | "X1" | "U_VVF" | "U3" | "FILL_mig" | "FILL_ip"
  | "X_VCFA_platform" | "X2" | "X3" | "X4" | "X5" | "X6" | "X7" | "X8" | "X9" | "X10" | "X11" | "X12" | "X13" | "X14" | "X15" | "X16" | "EF";

export type V2Lead = "architect" | "srConsultant";

/**
 * A piece of a line that Pass 2 can place on its own. Units of one line split only at these boundaries
 * (spec 7.5). `tier` 2 and 3 are the depth uplifts; `tag` tells Pass 2 which fill step a unit belongs to.
 */
export type V2Unit = {
  id: string;
  label: string;
  base: number;
  tier: 1 | 2 | 3;
  tag: UnitTag;
};

export type UnitTag =
  | "whole" // moves with the line
  | "platform" // the shared platform term; never split
  | "module" // a module or per-unit term
  | "first-wave" // HCX setup, pilot, extended VLANs and the first wave
  | "wave"
  | "first-window" // first-cluster proving and the first change window
  | "window"
  | "first-vcenter" // the first vCenter with the ELM and NSX adders
  | "vcenter"
  | "site-pair" // a recovery site pair with its protection groups and protected VMs
  | "exercise"
  | "stages-1-2" // vDefend assessment and shared services, kept together
  | "stage-3"
  | "zone"
  | "app"
  | "ops-core" // Operations Tier 1: the X4 platform term and the lifecycle and health modules
  | "uplift";

export type V2Line = {
  code: V2Code;
  name: string;
  lead: V2Lead;
  /** Share of base the other technical role adds. */
  secondaryShare: number;
  /** The capability a line serves, for the customer's outcome ranking; null for discovery, design and the spine. */
  capability: Capability | null;
  depthMultiplier: number;
  /** True on design-only and undecided pathways, where an add-on keeps only its design share. */
  designOnly: boolean;
  /** Lead-role hours for the whole line: the sum of its units. */
  computedBase: number;
  /** The driver values the formula used. */
  drivers: Record<string, number | boolean | string>;
  units: V2Unit[];
  /** Lines that must be in the same or an earlier bucket. */
  requires: V2Code[];
};

export type Assumption = { key: string; label: string; value: number | boolean | string; source: string };

export type Pass1 = {
  path: VcfDeliveryPath;
  edition: "vcf" | "vvf";
  lines: V2Line[];
  /** Lead plus secondary across the engagement. */
  technical: number;
  /** Engagement project management: 15% of technical, with a floor. */
  pm: number;
  pmFloorApplied: boolean;
  /** PM hours per technical hour; a line's loaded hours are its technical hours x (1 + pmRatio). */
  pmRatio: number;
  assumptions: Assumption[];
  inputs: ResolvedInputs;
};

const v = (coefficient: Coefficient) => coefficient.value;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** Lead hours, secondary hours and the loaded total for a line or unit, at the engagement's PM ratio. */
export function technicalOf(line: Pick<V2Line, "secondaryShare">, base: number): number {
  return base * (1 + line.secondaryShare);
}
export function loadedOf(pass1: Pick<Pass1, "pmRatio">, line: Pick<V2Line, "secondaryShare">, base: number): number {
  return technicalOf(line, base) * (1 + pass1.pmRatio);
}

// ---------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------

export type ResolvedInputs = ReturnType<typeof resolveInputs>["values"];

/** Every driver value, from the estimate inputs, RVTools, the brief, or a default that is recorded as an assumption. */
export function resolveInputs(document: EngagementDocument) {
  const { fields, inventory, report } = document;
  const given = fields.estimateInputs;
  const assumptions: Assumption[] = [];
  const assume = <T extends number | boolean | string>(key: string, label: string, value: T, source: string): T => {
    assumptions.push({ key, label, value, source });
    return value;
  };
  const pick = <T extends number | boolean | string>(key: keyof typeof given, label: string, fallback: () => { value: T; source: string } | T): T => {
    const value = given[key];
    if (value !== undefined && !Array.isArray(value)) return value as T;
    const resolved = fallback();
    if (typeof resolved === "object" && resolved !== null && "source" in resolved) return assume(String(key), label, resolved.value, resolved.source);
    return resolved as T;
  };
  const fromDefault = (key: keyof typeof H.defaults) => ({ value: v(H.defaults[key]), source: H.defaults[key].source });

  const hosts = inventory.hosts || report.discovery.esxHosts || assume("hosts", "ESX hosts", 0, "No RVTools inventory or host count in the brief");
  const sites = inventory.datacenters || report.discovery.datacenters || assume("sites", "Sites", 1, "No data center count in RVTools or the brief");
  const vcenters = report.discovery.vcenters || assume("vcenters", "vCenters", 1, "No vCenter count in the brief");
  const instances = report.discovery.vcfInstances || assume("instances", "VCF instances", 1, "No VCF instance count in the brief");
  const clusters = inventory.clusters || assume("clusters", "Clusters", Math.max(1, Math.ceil(hosts / v(H.defaults.hostsPerCluster))), H.defaults.hostsPerCluster.source);
  const vms = inventory.vmCount || assume("vms", "VMs", hosts * v(H.defaults.vmsPerHost), H.defaults.vmsPerHost.source);
  const topology = fields.adoptionDetails.domainTopology;
  const consolidated = topology === "consolidated" || (topology === "undecided" && hosts > 0 && hosts <= 10);
  const storage = fields.adoptionDetails.principalStorage;
  const source8xFromInventory = inventory.esxiVersions.some(item => /^8\./.test(item.version.trim()));

  const values = {
    hosts, sites, vcenters, instances, clusters, vms, consolidated,
    workloadDomains: pick("workloadDomains", "Workload domains", () => ({ value: consolidated ? 0 : 1, source: consolidated ? "Consolidated topology (or 10 hosts or fewer with topology undecided)" : "One workload domain unless the topology is consolidated" })),
    stretchedClusters: pick("stretchedClusters", "Stretched clusters", () => ({ value: 0, source: "None stated" })),
    storageTypes: pick("storageTypes", "Principal storage types", () => ({ value: 1, source: "One principal storage type" })),
    clustersOnFcOrNfs: pick("clustersOnFcOrNfs", "Clusters on FC or NFS principal storage", () => ({ value: storage === "vmfs-fc" || storage === "nfs-v3" ? clusters : 0, source: `Principal storage is ${storage}` })),
    mixedStorage: pick("mixedStorage", "Mixed principal storage", () => ({ value: false, source: "None stated" })),
    dedicatedNsxWorkloadDomains: pick("dedicatedNsxWorkloadDomains", "Workload domains with dedicated NSX", () => ({ value: 0, source: "None stated" })),
    noExistingNsx: pick("noExistingNsx", "No NSX in the existing estate", () => ({ value: v(H.defaults.noExistingNsx) === 1, source: H.defaults.noExistingNsx.source })),
    enhancedLinkedMode: pick("enhancedLinkedMode", "Enhanced Linked Mode", () => report.discovery.enhancedLinkedMode ?? { value: false, source: "Not stated in the brief" }),
    sourceIsVcf: pick("sourceIsVcf", "Source is already VCF (adds the VCF upgrade)", () => ({ value: false, source: "Open question; conservative reading" })),
    source8x: pick("source8x", "Source hosts on 8.x", () => inventory.esxiVersions.length ? source8xFromInventory : { value: false, source: "No ESXi versions in RVTools" }),
    clustersOnVum: pick("clustersOnVum", "Clusters on VUM baselines", () => ({ value: 0, source: "None stated" })),
    vcentersWithIwa: pick("vcentersWithIwa", "vCenters using IWA", () => ({ value: 0, source: "None stated" })),
    clustersOnVss: pick("clustersOnVss", "Clusters on standard switches", () => ({ value: 0, source: "None stated" })),
    legacyLogs: pick("legacyLogs", "Ops for Logs to redeploy", () => ({ value: false, source: "None stated" })),
    upgradeVcfAutomation: pick("upgradeVcfAutomation", "VCF upgrade includes VCF Automation", () => ({ value: false, source: "None stated" })),
    upgradeLogs: pick("upgradeLogs", "VCF upgrade includes Log Management", () => ({ value: false, source: "None stated" })),
    upgradeVidmToIdentityBroker: pick("upgradeVidmToIdentityBroker", "VCF upgrade moves VIDM to Identity Broker", () => ({ value: false, source: "None stated" })),
    upgradeHcx: pick("upgradeHcx", "VCF upgrade includes HCX", () => ({ value: false, source: "None stated" })),
    upgradeAvi: pick("upgradeAvi", "VCF upgrade includes Avi", () => ({ value: false, source: "None stated" })),
    upgradeSrm: pick("upgradeSrm", "VCF upgrade includes Live Recovery or SRM", () => ({ value: false, source: "None stated" })),
    upgradeSupervisors: pick("upgradeSupervisors", "Supervisors to upgrade", () => ({ value: 0, source: "None stated" })),
    upgradeNsxFederation: pick("upgradeNsxFederation", "VCF upgrade includes NSX Federation", () => ({ value: false, source: "None stated" })),
    migrationSitePairs: pick("migrationSitePairs", "Migration site pairs", () => fromDefault("migrationSitePairs")),
    extendedVlans: pick("extendedVlans", "Extended VLANs", () => fromDefault("extendedVlans")),
    datedWaves: pick("datedWaves", "Migration waves with a date behind them", () => fromDefault("datedWaves")),
    orgs: pick("orgs", "Tenant organizations", () => fromDefault("orgs")),
    catalogItems: pick("catalogItems", "Catalog items", () => fromDefault("catalogItems")),
    templates: pick("templates", "Templates", () => fromDefault("templates")),
    vcenterSources: pick("vcenterSources", "vCenter data sources", () => ({ value: vcenters, source: "One data source per vCenter" })),
    managementPacks: pick("managementPacks", "Management packs", () => fromDefault("managementPacks")),
    dashboards: pick("dashboards", "Custom dashboards", () => fromDefault("dashboards")),
    eventTargets: pick("eventTargets", "Event integration targets", () => fromDefault("eventTargets")),
    segments: pick("segments", "NSX segments", () => fromDefault("segments")),
    edgeClusters: pick("edgeClusters", "Edge clusters", () => fromDefault("edgeClusters")),
    extraUplinkPairs: pick("extraUplinkPairs", "Extra uplink pairs", () => ({ value: 0, source: "None stated" })),
    externalVlans: pick("externalVlans", "External VLANs for VPCs", () => fromDefault("externalVlans")),
    virtualNetworkAppliance: pick("virtualNetworkAppliance", "VNA cluster for stateful VPC services", () => ({ value: false, source: "None stated" })),
    transitGateway: pick("transitGateway", "Transit gateway model", () => ({ value: "distributed" as string, source: "VCF 9.1 distributed transit gateway; conservative reading" })),
    zones: pick("zones", "Segmentation zones", () => fromDefault("zones")),
    apps: pick("apps", "Applications to ringfence", () => fromDefault("apps")),
    sspAlreadyDeployed: pick("sspAlreadyDeployed", "Security Services Platform already deployed", () => ({ value: false, source: "None stated" })),
    tuningCycles: pick("tuningCycles", "Two-week tuning cycles", () => fromDefault("tuningCycles")),
    drSitePairs: pick("drSitePairs", "Recovery site pairs", () => fromDefault("drSitePairs")),
    recoveryPlans: pick("recoveryPlans", "Protection groups or recovery plans", () => fromDefault("recoveryPlans")),
    protectedVms: pick("protectedVms", "Protected VMs", () => ({ value: Math.round(vms * v(H.defaults.protectedVmShare)), source: H.defaults.protectedVmShare.source })),
    exercises: pick("exercises", "Recovery exercises", () => fromDefault("exercises")),
    ireTests: pick("ireTests", "IRE tests", () => fromDefault("ireTests")),
    supervisors: pick("supervisors", "Supervisors", () => fromDefault("supervisors")),
    vksClusters: pick("vksClusters", "VKS clusters", () => fromDefault("vksClusters")),
    gpuHosts: pick("gpuHosts", "GPU hosts", () => fromDefault("gpuHosts")),
    models: pick("models", "Models or runtimes", () => fromDefault("models")),
    engines: pick("engines", "Database engines", () => fromDefault("engines")),
    dsmTemplates: pick("dsmTemplates", "Database templates or plans", () => fromDefault("dsmTemplates")),
    clouds: pick("clouds", "Avi cloud connectors", () => fromDefault("clouds")),
    virtualServices: pick("virtualServices", "Avi virtual services", () => fromDefault("virtualServices")),
    wafPolicies: pick("wafPolicies", "WAF policies", () => fromDefault("wafPolicies")),
    tieredHosts: pick("tieredHosts", "Hosts with NVMe memory tiering", () => fromDefault("tieredHosts")),
    priorAssessment: report.discovery.assessmentCompleted === true,
    broadcomBaselineDelivered: pick("broadcomBaselineDelivered", "Broadcom baselining delivered", () => ({ value: false, source: "None stated" })),
  };
  return { values, assumptions };
}

// ---------------------------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------------------------

type DepthKey = keyof AdoptionDetails["componentDepths"];
/** Which depth tier drives each add-on. Recovery lines have no depth tier in the app, so they stay at 1.0. */
const DEPTH_KEY: Partial<Record<V2Code, DepthKey>> = {
  X2: "automation", X3: "automation", X13: "automation",
  X4: "operations",
  X5: "networkingSecurity", X6: "networkingSecurity", X7: "networkingSecurity", X11: "networkingSecurity", X12: "networkingSecurity", X15: "networkingSecurity", X16: "networkingSecurity",
  X8: "kubernetesAi", X9: "kubernetesAi",
  EF: "efficiency",
};
const ADD_ON_CODES = new Set<V2Code>(["X_VCFA_platform", "X2", "X3", "X4", "X5", "X6", "X7", "X8", "X9", "X10", "X11", "X12", "X13", "X14", "X15", "X16", "EF"]);
const HIGH_SECONDARY = new Set<V2Code>(["X11", "X12", "X16"]);

function depthMultiplier(tier: string): { multiplier: number; tier: 1 | 2 | 3 } {
  if (tier === "tier-3") return { multiplier: v(H.depth.tier3), tier: 3 };
  if (tier === "tier-2") return { multiplier: v(H.depth.tier2), tier: 2 };
  return { multiplier: v(H.depth.tier1), tier: 1 };
}

/** Pass 1: every line the engagement needs, at true effort. */
export function scopeV2(document: EngagementDocument): Pass1 {
  const { fields } = document;
  const { values: x, assumptions } = resolveInputs(document);
  const path = effectiveDeliveryPath(fields);
  const edition = effectivePlatformEdition(fields);
  const vvf = edition === "vvf";
  const resolved = resolvePlanOutcomes(fields).outcomes;
  const outcomes = new Set(resolved.map(outcome => outcome.key));
  const has = (...keys: string[]) => keys.some(key => outcomes.has(key));
  const hasAny = (capability: string) => Array.from(outcomes).some(key => key.startsWith(`${capability}:`));
  // NSX counts as an overlay choice only when the planner picked it; as a prerequisite of segmentation it does not.
  const explicitNsx = resolved.some(outcome => outcome.key === "platform:nsx" && !outcome.requiredBy.length);
  const designOnlyPath = path === "design-only" || path === "undecided";
  const addOns = new Set(document.report.discovery.addOnsPurchased.map(item => item.trim().toLowerCase()));
  const lines: V2Line[] = [];

  const unit = (id: string, label: string, base: number, tag: UnitTag = "whole"): V2Unit => ({ id, label, base, tier: 1, tag });
  const add = (code: V2Code, name: string, lead: V2Lead, units: V2Unit[], drivers: V2Line["drivers"], options: { capability?: Capability | null; requires?: V2Code[] } = {}) => {
    const live = units.filter(item => item.base > 0);
    if (!live.length) return;
    const addOn = ADD_ON_CODES.has(code);
    const depthKey = DEPTH_KEY[code];
    const depth = depthKey ? depthMultiplier(fields.adoptionDetails.componentDepths[depthKey]) : { multiplier: 1, tier: 1 as const };
    const designOnly = addOn && designOnlyPath;
    const share = designOnly ? v(H.designOnlyShare) : 1;
    const tier1 = live.map(item => ({ ...item, base: item.base * share }));
    const tier1Base = sum(tier1.map(item => item.base));
    const uplifts: V2Unit[] = [];
    if (depth.tier >= 2) uplifts.push({ id: `${code}:tier-2`, label: "Tier 2 uplift", base: tier1Base * (v(H.depth.tier2) - 1), tier: 2, tag: "uplift" });
    if (depth.tier >= 3) uplifts.push({ id: `${code}:tier-3`, label: "Tier 3 uplift", base: tier1Base * (v(H.depth.tier3) - v(H.depth.tier2)), tier: 3, tag: "uplift" });
    const all = [...tier1, ...uplifts];
    lines.push({
      code, name, lead,
      secondaryShare: code === "DX" ? 0 : HIGH_SECONDARY.has(code) ? v(H.roles.secondaryShareHigh) : v(H.roles.secondaryShare),
      capability: options.capability ?? null,
      depthMultiplier: depth.multiplier,
      designOnly,
      computedBase: sum(all.map(item => item.base)),
      drivers,
      units: all,
      requires: options.requires ?? [],
    });
  };

  // ---- Discovery
  if (!x.priorAssessment) {
    const dd = x.broadcomBaselineDelivered
      ? v(H.discovery.baselineDelivered)
      : Math.min(v(H.discovery.cap), v(H.discovery.base) + v(H.discovery.perHost) * x.hosts + v(H.discovery.perVcenter) * x.vcenters + v(H.discovery.perExtraSite) * (x.sites - 1));
    add("DD", "Design discovery", "srConsultant", [unit("DD", "Design discovery", dd)], { hosts: x.hosts, vcenters: x.vcenters, sites: x.sites, baselineDelivered: x.broadcomBaselineDelivered });
    if (!x.broadcomBaselineDelivered) {
      const extraSites = x.sites - 1;
      const areas: Array<[string, number]> = [];
      if (hasAny("operations") || hasAny("automation")) areas.push(["Operations and automation", v(H.discoveryAreas.opsAutomation)]);
      if (hasAny("kubernetes")) areas.push(["Kubernetes", v(H.discoveryAreas.kubernetes)]);
      if (Array.from(outcomes).some(key => key.startsWith("networking:") && key !== "networking:physical-fabric")) areas.push(["NSX networking", v(H.discoveryAreas.networking) + v(H.discoveryAreas.perExtraSite) * extraSites]);
      if (hasAny("security")) areas.push(["Security", v(H.discoveryAreas.security)]);
      if (has("resilience:core", "resilience:recovery-architecture", "resilience:recovery-exercises")) areas.push(["Disaster recovery", v(H.discoveryAreas.resilience) + v(H.discoveryAreas.perExtraSite) * extraSites]);
      if (addOns.has("hcx")) areas.push(["HCX", v(H.discoveryAreas.hcx) + v(H.discoveryAreas.perExtraSite) * extraSites]);
      if (has("resilience:cyber-recovery", "resilience:cloud-cyber-recovery") || addOns.has("acc")) areas.push(["Cyber recovery", v(H.discoveryAreas.cyberRecovery)]);
      if (hasAny("private-ai")) areas.push(["Private AI", v(H.discoveryAreas.privateAi)]);
      add("DX", "Discovery by area", "architect", areas.map(([label, base]) => unit(`DX:${label}`, label, base, "module")), { areas: areas.map(([label]) => label).join(", "), sites: x.sites });
    }
  }

  // ---- Design
  const hostTerm = Math.min(v(H.design.hostTermCap), v(H.design.perHostAboveThreshold) * Math.max(0, x.hosts - v(H.design.hostThreshold)));
  const design = v(H.design.base) + v(H.design.perWorkloadDomain) * x.workloadDomains + v(H.design.perExtraInstance) * (x.instances - 1) + v(H.design.perExtraSite) * (x.sites - 1)
    + v(H.design.perStretchedCluster) * x.stretchedClusters + v(H.design.perExtraStorageType) * (x.storageTypes - 1) + hostTerm;
  add("A", "Architecture and design", "architect", [unit("A", "Architecture and design", design)], { workloadDomains: x.workloadDomains, instances: x.instances, sites: x.sites, stretchedClusters: x.stretchedClusters, storageTypes: x.storageTypes, hosts: x.hosts });

  // ---- Pathway spine
  const remediation = v(H.remediation.perClusterOnVum) * x.clustersOnVum + v(H.remediation.perVcenterWithIwa) * x.vcentersWithIwa + v(H.remediation.perClusterOnVss) * x.clustersOnVss + v(H.remediation.legacyLogs) * Number(x.legacyLogs);
  const storageAdder = v(H.storage.perFcOrNfsCluster) * x.clustersOnFcOrNfs + v(H.storage.mixed) * Number(x.mixedStorage);
  const clustersPerVcenter = x.clusters / x.vcenters;
  const hostsPerVcenter = x.hosts / x.vcenters;
  const converge = () => {
    const nsx = vvf ? 0 : v(H.converge.nsxDeploy) * Number(x.noExistingNsx);
    const c1 = v(H.converge.base) + v(H.converge.perCluster) * clustersPerVcenter + v(H.converge.perHost) * hostsPerVcenter + nsx;
    add("C1", vvf ? "Converge the first vCenter into VVF" : "Converge the first vCenter into VCF", "srConsultant", [unit("C1", "Converge the first vCenter", c1, "platform")], { clusters: clustersPerVcenter, hosts: hostsPerVcenter, noExistingNsx: !vvf && x.noExistingNsx });
    add("R_remed", "Prerequisite remediation", "srConsultant", [unit("R_remed", "Prerequisite remediation", remediation)], { clustersOnVum: x.clustersOnVum, vcentersWithIwa: x.vcentersWithIwa, clustersOnVss: x.clustersOnVss, legacyLogs: x.legacyLogs });
    if (!vvf && x.vcenters > 1) importLine(x.vcenters - 1, false);
  };
  /** X1: one unit per imported vCenter; the ELM break-up and NSX deploy stay with the first one imported. */
  const importLine = (count: number, firstCarriesAdders: boolean) => {
    const perVcenter = v(H.import.perVcenter) + v(H.import.perCluster) * clustersPerVcenter + v(H.import.perHost) * hostsPerVcenter
      + (x.source8x ? v(H.import.sourceUpgrade) + v(H.import.sourceUpgradePerHost) * hostsPerVcenter : 0);
    const adders = firstCarriesAdders ? v(H.import.nsxDeploy) * Number(x.noExistingNsx) + v(H.import.elmBreakUp) * Number(x.enhancedLinkedMode) : 0;
    const units = Array.from({ length: count }, (_, index) => unit(`X1:vcenter-${index + 1}`, `Import vCenter ${index + 1}`, perVcenter + (index === 0 ? adders : 0), index === 0 ? "first-vcenter" : "vcenter"));
    add("X1", "Workload domain import", "srConsultant", units, { vcenters: count, clustersPerVcenter, hostsPerVcenter, noExistingNsx: firstCarriesAdders && x.noExistingNsx, enhancedLinkedMode: firstCarriesAdders && x.enhancedLinkedMode, source8x: x.source8x });
  };
  const deploy = () => {
    if (vvf) {
      const d = v(H.deployVvf.base) + v(H.deployVvf.handover) + v(H.deployVvf.perExtraCluster) * (x.clusters - 1) + v(H.deployVvf.perHost) * x.hosts;
      add("D_VVF", "VVF foundation build", "srConsultant", [unit("D_VVF", "VVF foundation build", d, "platform")], { clusters: x.clusters, hosts: x.hosts });
    } else {
      const wld = x.workloadDomains * v(H.deploy.perWorkloadDomain) + x.dedicatedNsxWorkloadDomains * v(H.deploy.perDedicatedNsx);
      const d = v(H.deploy.managementDomain) + v(H.deploy.handover) + v(H.deploy.managementServices) + v(H.deploy.perExtraInstance) * (x.instances - 1) + wld
        + v(H.deploy.perExtraCluster) * Math.max(0, x.clusters - 1 - x.workloadDomains) + v(H.deploy.perStretchedCluster) * x.stretchedClusters
        + v(H.deploy.perHostFirst) * Math.min(x.hosts, v(H.deploy.firstHostBand)) + v(H.deploy.perHostAbove) * Math.max(0, x.hosts - v(H.deploy.firstHostBand));
      add("D", path === "hybrid" ? "Shared foundation build" : "Management and workload domain build", "srConsultant", [unit("D", "Platform deploy", d, "platform")], { instances: x.instances, workloadDomains: x.workloadDomains, dedicatedNsx: x.dedicatedNsxWorkloadDomains, clusters: x.clusters, stretchedClusters: x.stretchedClusters, hosts: x.hosts });
    }
    add("S_storage", "Principal storage adder", "srConsultant", [unit("S_storage", "Principal storage adder", storageAdder)], { clustersOnFcOrNfs: x.clustersOnFcOrNfs, mixedStorage: x.mixedStorage });
  };
  const migrationWaves = () => {
    const waveSize = v(H.waves.vmsPerWave);
    const waves = Math.ceil(x.vms / waveSize);
    const perVm = v(H.waves.planningPerVm) + v(H.waves.executionPerVm);
    const setup = v(H.waves.hcxPerSitePair) * x.migrationSitePairs + v(H.waves.perExtendedVlan) * x.extendedVlans + v(H.waves.pilot);
    const units = Array.from({ length: Math.max(1, waves) }, (_, index) => {
      const vmsInWave = waves ? Math.min(waveSize, x.vms - index * waveSize) : 0;
      const wave = waves ? v(H.waves.perWave) + perVm * vmsInWave : 0;
      return index === 0
        ? unit("FILL_mig:wave-1", waves ? `HCX setup, pilot and wave 1 (${vmsInWave} VMs)` : "HCX setup and pilot", setup + wave, "first-wave")
        : unit(`FILL_mig:wave-${index + 1}`, `Wave ${index + 1} (${vmsInWave} VMs)`, wave, "wave");
    });
    add("FILL_mig", "Workload migration waves", "srConsultant", units, { vms: x.vms, waves, sitePairs: x.migrationSitePairs, extendedVlans: x.extendedVlans });
  };
  const hostUpgradeWindows = () => {
    const perWindow = v(H.inPlaceWaves.hostsPerWindow);
    const windows = Math.max(1, Math.ceil(x.hosts / perWindow));
    const units = Array.from({ length: windows }, (_, index) => {
      const hostsInWindow = x.hosts ? Math.min(perWindow, x.hosts - index * perWindow) : 0;
      const window = v(H.inPlaceWaves.perWindow) + v(H.inPlaceWaves.perHost) * hostsInWindow;
      return index === 0
        ? unit("FILL_ip:window-1", `First-cluster proving and window 1 (${hostsInWindow} hosts)`, v(H.inPlaceWaves.proving) + window, "first-window")
        : unit(`FILL_ip:window-${index + 1}`, `Window ${index + 1} (${hostsInWindow} hosts)`, window, "window");
    });
    add("FILL_ip", "In-place upgrade windows", "srConsultant", units, { hosts: x.hosts, windows });
  };

  if (path === "greenfield" || path === "hybrid") { deploy(); migrationWaves(); }
  if (path === "converge") converge();
  if (path === "import-workload-domain") importLine(x.vcenters, true);
  if (path === "in-place") {
    if (vvf) {
      const u = v(H.upgradeVvf.base) + v(H.upgradeVvf.perVcenter) * x.vcenters + v(H.upgradeVvf.perCluster) * x.clusters;
      add("U_VVF", "VVF 8 to 9 upgrade", "architect", [unit("U_VVF", "VVF upgrade", u, "platform")], { vcenters: x.vcenters, clusters: x.clusters });
      add("R_remed", "Prerequisite remediation", "srConsultant", [unit("R_remed", "Prerequisite remediation", remediation)], { clustersOnVum: x.clustersOnVum, vcentersWithIwa: x.vcentersWithIwa, clustersOnVss: x.clustersOnVss, legacyLogs: x.legacyLogs });
    } else {
      // Bring Under VCF Management: converge the first vCenter, import the rest, and upgrade when the source is already VCF.
      converge();
      if (x.sourceIsVcf) {
        const domains = 1 + x.workloadDomains;
        const u3 = v(H.upgradeVcf.planning) + v(H.upgradeVcf.coreServices) + v(H.upgradeVcf.managementServicesPrep) + v(H.upgradeVcf.perDomain) * domains + v(H.upgradeVcf.perCluster) * x.clusters
          + v(H.upgradeVcf.vcfAutomation) * Number(x.upgradeVcfAutomation) + v(H.upgradeVcf.logs) * Number(x.upgradeLogs) + v(H.upgradeVcf.vidmToIdentityBroker) * Number(x.upgradeVidmToIdentityBroker)
          + v(H.upgradeVcf.hcx) * Number(x.upgradeHcx) + v(H.upgradeVcf.avi) * Number(x.upgradeAvi) + v(H.upgradeVcf.srm) * Number(x.upgradeSrm)
          + v(H.upgradeVcf.perSupervisor) * x.upgradeSupervisors + v(H.upgradeVcf.nsxFederation) * Number(x.upgradeNsxFederation);
        add("U3", "VCF 5.x or 9.0 to 9.1 upgrade", "architect", [unit("U3", "VCF upgrade", u3, "platform")], { domains, clusters: x.clusters });
      }
    }
    hostUpgradeWindows();
  }

  // ---- Add-ons
  const automation = has("automation:vm-self-service", "automation:day-2-automation", "automation:core");
  const iac = has("automation:infrastructure-as-code", "automation:governance", "automation:application-provisioning");
  const dataServices = has("automation:data-services");
  const privateAi = hasAny("private-ai");
  const kubernetes = hasAny("kubernetes") || privateAi || dataServices;
  if (automation || iac || dataServices) add("X_VCFA_platform", "VCF Automation platform", "srConsultant", [unit("X_VCFA_platform", "VCF Automation platform", v(H.automation.platform), "platform")], {}, { capability: "automation" });
  if (automation) {
    const extraItems = Math.max(0, x.catalogItems - v(H.automation.freeCatalogItems));
    add("X2", "VM self-service", "srConsultant", [
      unit("X2:module", "VM self-service module", v(H.automation.vmSelfService), "module"),
      ...Array.from({ length: x.orgs }, (_, index) => unit(`X2:org-${index + 1}`, `Tenant organization ${index + 1}`, v(H.automation.perOrg), "module")),
      ...Array.from({ length: extraItems }, (_, index) => unit(`X2:item-${index + 1}`, `Catalog item ${index + 1 + v(H.automation.freeCatalogItems)}`, v(H.automation.perCatalogItemAboveFree), "module")),
    ], { orgs: x.orgs, catalogItems: x.catalogItems }, { capability: "automation", requires: ["X_VCFA_platform"] });
  }
  if (iac) {
    const extraTemplates = Math.max(0, x.templates - v(H.automation.freeTemplates));
    add("X3", "Infrastructure as code and governance", "srConsultant", [
      unit("X3:module", "IaC and governance module", v(H.automation.iacGovernance), "module"),
      ...Array.from({ length: extraTemplates }, (_, index) => unit(`X3:template-${index + 1}`, `Template ${index + 1 + v(H.automation.freeTemplates)}`, v(H.automation.perTemplateAboveFree), "module")),
    ], { templates: x.templates }, { capability: "automation", requires: ["X_VCFA_platform"] });
  }
  if (hasAny("operations")) {
    const platform = v(H.operations.base) + v(H.operations.perVcenterSource) * x.vcenterSources + v(H.operations.perManagementPack) * x.managementPacks;
    const modules: V2Unit[] = [unit("X4:platform", "VCF Operations configuration", platform, "ops-core")];
    if (has("operations:lifecycle")) modules.push(unit("X4:lifecycle", "Lifecycle and certificates", v(H.operations.lifecycle), "ops-core"));
    if (has("operations:observability")) modules.push(unit("X4:observability", "Health, logs and diagnostics", v(H.operations.observability), "ops-core"));
    if (has("operations:capacity-cost")) modules.push(unit("X4:capacity-cost", "Capacity and cost", v(H.operations.capacityCost), "module"));
    if (has("operations:custom-dashboards")) for (let index = 0; index < x.dashboards; index += 1) modules.push(unit(`X4:dashboard-${index + 1}`, `Dashboard ${index + 1}`, v(H.operations.perDashboard), "module"));
    if (has("operations:identity-certificates")) modules.push(unit("X4:identity", "Identity operations", v(H.operations.identityOperations), "module"));
    if (has("operations:event-integration")) for (let index = 0; index < x.eventTargets; index += 1) modules.push(unit(`X4:event-${index + 1}`, `Event integration target ${index + 1}`, v(H.operations.perEventTarget), "module"));
    add("X4", "VCF Operations configuration", "srConsultant", modules, { vcenterSources: x.vcenterSources, managementPacks: x.managementPacks, dashboards: x.dashboards, eventTargets: x.eventTargets }, { capability: "operations" });
  }
  const overlay = !vvf && (has("networking:overlay-transport", "networking:network-operations") || explicitNsx);
  const edge = !vvf && (has("networking:edge-cluster-routing") || (has("networking:vpc") && x.transitGateway === "centralized"));
  const vpc = !vvf && has("networking:vpc");
  if (overlay) {
    const extraSegments = Math.max(0, x.segments - v(H.overlay.freeSegments));
    add("X5", "NSX overlay", "srConsultant", [
      unit("X5:platform", "NSX overlay", v(H.overlay.base) + v(H.overlay.perCluster) * x.clusters, "platform"),
      ...Array.from({ length: extraSegments }, (_, index) => unit(`X5:segment-${index + 1}`, `Segment ${index + 1 + v(H.overlay.freeSegments)}`, v(H.overlay.perSegmentAboveFree), "module")),
    ], { clusters: x.clusters, segments: x.segments }, { capability: "networking" });
  }
  if (edge) {
    add("X6", "NSX Edge and routing", "architect", [
      ...Array.from({ length: x.edgeClusters }, (_, index) => unit(`X6:edge-${index + 1}`, `Edge cluster ${index + 1}`, v(H.edge.perEdgeCluster), index === 0 ? "platform" : "module")),
      ...Array.from({ length: x.extraUplinkPairs }, (_, index) => unit(`X6:uplink-${index + 1}`, `Extra uplink pair ${index + 1}`, v(H.edge.perExtraUplinkPair), "module")),
    ], { edgeClusters: x.edgeClusters, extraUplinkPairs: x.extraUplinkPairs }, { capability: "networking" });
  }
  if (vpc) {
    const distributed = x.transitGateway !== "centralized";
    add("X16", "VPC and transit gateway", "architect", [
      unit("X16:platform", "VPC and transit gateway", v(H.vpc.base), "platform"),
      ...(distributed ? Array.from({ length: x.externalVlans }, (_, index) => unit(`X16:vlan-${index + 1}`, `External VLAN ${index + 1}`, v(H.vpc.perExternalVlan), "module")) : []),
      ...(distributed && x.virtualNetworkAppliance ? [unit("X16:vna", "VNA cluster", v(H.vpc.virtualNetworkAppliance), "module")] : []),
    ], { transitGateway: x.transitGateway, externalVlans: distributed ? x.externalVlans : 0, vna: distributed && x.virtualNetworkAppliance }, { capability: "networking", requires: edge && !distributed ? ["X6"] : [] });
  }
  if (has("networking:physical-fabric") && !overlay && !edge && !vpc) {
    add("X7", "VDS networking", "architect", [unit("X7", "VDS networking", v(H.vds.base) + v(H.vds.perCluster) * x.clusters, "platform")], { clusters: x.clusters }, { capability: "networking" });
  }
  // The Security Services Platform is deployed once: on the threat-prevention line when it needs it, else for Security Intelligence.
  const atpFeatures = ["security:ids-ips", "security:malware-prevention", "security:identity-firewall"].filter(key => outcomes.has(key)).length;
  const sspForAtp = !vvf && atpFeatures > 0 && has("security:malware-prevention") && !x.sspAlreadyDeployed;
  const sspForIntelligence = !vvf && has("security:security-intelligence") && !sspForAtp && !x.sspAlreadyDeployed;
  if (!vvf && has("security:segmentation")) {
    add("X11", "vDefend distributed firewall", "architect", [
      unit("X11:stages-1-2", "Stages 1 and 2: assessment and shared services", v(H.segmentation.stage1Assessment) + v(H.segmentation.stage2SharedServices), "stages-1-2"),
      unit("X11:stage-3", "Stage 3: zones", v(H.segmentation.stage3Base), "stage-3"),
      ...Array.from({ length: x.zones }, (_, index) => unit(`X11:zone-${index + 1}`, `Zone ${index + 1}`, v(H.segmentation.perZone), "zone")),
      ...Array.from({ length: x.apps }, (_, index) => unit(`X11:app-${index + 1}`, `Application ${index + 1}`, v(H.segmentation.perApp), "app")),
      ...(sspForIntelligence ? [unit("X11:ssp", "Security Services Platform for Security Intelligence", v(H.segmentation.sspDeploy), "module")] : []),
    ], { zones: x.zones, apps: x.apps, sspNew: sspForIntelligence }, { capability: "security" });
  } else if (has("security:identity-rbac", "security:hardening-compliance")) {
    // Hardening, identity and access have no line in the spec; priced as vDefend stages 1 and 2 (open question).
    add("X11", vvf ? "vSphere hardening, identity and access" : "Security hardening, identity and access", "architect", [
      unit("X11:stages-1-2", "Assessment and shared services", v(H.segmentation.stage1Assessment) + v(H.segmentation.stage2SharedServices), "stages-1-2"),
    ], { zones: 0, apps: 0, sspNew: false }, { capability: "security" });
  }
  if (atpFeatures) {
    add("X12", "vDefend threat prevention", "architect", [
      ...(sspForAtp ? [unit("X12:ssp", "Security Services Platform", v(H.threatPrevention.sspDeploy), "platform")] : []),
      ...["security:ids-ips", "security:malware-prevention", "security:identity-firewall"].filter(key => outcomes.has(key)).map(key => unit(`X12:${key.split(":")[1]}`, key.split(":")[1], v(H.threatPrevention.perFeature), "module")),
      ...Array.from({ length: x.tuningCycles }, (_, index) => unit(`X12:tuning-${index + 1}`, `Tuning cycle ${index + 1}`, v(H.threatPrevention.perTuningCycle), "module")),
    ], { sspNew: sspForAtp, features: atpFeatures, tuningCycles: x.tuningCycles }, { capability: "security", requires: has("security:segmentation") ? ["X11"] : [] });
  }
  const recovery = has("resilience:core", "resilience:recovery-architecture", "resilience:recovery-exercises", "resilience:cyber-recovery");
  if (recovery) {
    const exercises = has("resilience:recovery-exercises") ? x.exercises : 0;
    const firstPair = v(H.recovery.perSitePair) + v(H.recovery.perPlan) * x.recoveryPlans + v(H.recovery.perProtectedVm) * x.protectedVms;
    add("X10", "VMware Live Recovery", "srConsultant", [
      ...Array.from({ length: x.drSitePairs }, (_, index) => unit(`X10:site-pair-${index + 1}`, index === 0 ? "Site pair 1 with protection groups" : `Site pair ${index + 1}`, index === 0 ? firstPair : v(H.recovery.perSitePair), "site-pair")),
      ...Array.from({ length: exercises }, (_, index) => unit(`X10:exercise-${index + 1}`, `Recovery exercise ${index + 1}`, v(H.recovery.perExercise), "exercise")),
      ...(has("resilience:cyber-recovery") ? [unit("X10:clean-room", "On-premises cyber clean room", v(H.recovery.onpremCleanRoom), "module")] : []),
    ], { sitePairs: x.drSitePairs, plans: x.recoveryPlans, protectedVms: x.protectedVms, exercises, onpremCleanRoom: has("resilience:cyber-recovery") }, { capability: "resilience" });
  }
  if (has("resilience:cloud-cyber-recovery")) {
    add("X14", "Live Cyber Recovery (cloud)", "srConsultant", [
      unit("X14:platform", "Cloud recovery and protected VMs", v(H.cloudCyberRecovery.base) + v(H.cloudCyberRecovery.perProtectedVm) * x.protectedVms, "platform"),
      ...Array.from({ length: x.ireTests }, (_, index) => unit(`X14:ire-${index + 1}`, `IRE test ${index + 1}`, v(H.cloudCyberRecovery.perIreTest), "module")),
    ], { protectedVms: x.protectedVms, ireTests: x.ireTests }, { capability: "resilience", requires: recovery ? ["X10"] : [] });
  }
  if (kubernetes) {
    add("X9", "Supervisor and VKS", "srConsultant", [
      unit("X9:platform", "Registry and first Supervisor", v(H.kubernetes.registry) + v(H.kubernetes.perSupervisor), "platform"),
      ...Array.from({ length: Math.max(0, x.supervisors - 1) }, (_, index) => unit(`X9:supervisor-${index + 2}`, `Supervisor ${index + 2}`, v(H.kubernetes.perSupervisor), "module")),
      ...Array.from({ length: x.vksClusters }, (_, index) => unit(`X9:vks-${index + 1}`, `VKS cluster ${index + 1}`, v(H.kubernetes.perVksCluster), "module")),
    ], { supervisors: x.supervisors, vksClusters: x.vksClusters }, { capability: "kubernetes" });
  }
  if (privateAi) {
    add("X8", "Private AI Services", "srConsultant", [
      unit("X8:platform", "PAIS platform, vGPU licensing and DLVM catalog", v(H.privateAi.platform) + v(H.privateAi.vgpuLicensing) + v(H.privateAi.dlvmCatalog), "platform"),
      ...Array.from({ length: x.gpuHosts }, (_, index) => unit(`X8:gpu-${index + 1}`, `GPU host ${index + 1}`, v(H.privateAi.perGpuHost), "module")),
      ...Array.from({ length: x.models }, (_, index) => unit(`X8:model-${index + 1}`, `Model ${index + 1}`, v(H.privateAi.perModel), "module")),
    ], { gpuHosts: x.gpuHosts, models: x.models }, { capability: "private-ai", requires: ["X9"] });
  }
  if (dataServices) {
    add("X13", "Data Services Manager", "srConsultant", [
      unit("X13:platform", "Data Services Manager", v(H.dataServices.base), "platform"),
      ...Array.from({ length: x.engines }, (_, index) => unit(`X13:engine-${index + 1}`, `Database engine ${index + 1}`, v(H.dataServices.perEngine), "module")),
      ...Array.from({ length: x.dsmTemplates }, (_, index) => unit(`X13:template-${index + 1}`, `Template ${index + 1}`, v(H.dataServices.perTemplate), "module")),
    ], { engines: x.engines, templates: x.dsmTemplates }, { capability: "automation", requires: ["X_VCFA_platform", "X9"] });
  }
  if (has("networking:load-balancing", "security:waf")) {
    const extraServices = Math.max(0, x.virtualServices - v(H.avi.freeVirtualServices));
    const waf = has("security:waf") ? x.wafPolicies : 0;
    add("X15", "Avi load balancing and WAF", "srConsultant", [
      unit("X15:platform", "Avi controller cluster", v(H.avi.controllerCluster), "platform"),
      ...Array.from({ length: x.clouds }, (_, index) => unit(`X15:cloud-${index + 1}`, `Cloud connector ${index + 1}`, v(H.avi.perCloud), "module")),
      ...Array.from({ length: extraServices }, (_, index) => unit(`X15:vs-${index + 1}`, `Virtual service ${index + 1 + v(H.avi.freeVirtualServices)}`, v(H.avi.perVirtualServiceAboveFree), "module")),
      ...Array.from({ length: waf }, (_, index) => unit(`X15:waf-${index + 1}`, `WAF policy ${index + 1}`, v(H.avi.perWafPolicy), "module")),
    ], { clouds: x.clouds, virtualServices: x.virtualServices, wafPolicies: waf }, { capability: "networking" });
  }
  if (fields.adoptionDetails.componentDepths.efficiency !== "not-selected") {
    add("EF", "Efficiency, memory tiering and sizing", "architect", [unit("EF", "Efficiency and memory tiering", v(H.efficiency.base) + v(H.efficiency.perTieredHost) * x.tieredHosts)], { tieredHosts: x.tieredHosts });
  }

  // ---- Engagement project management
  const technical = sum(lines.map(line => technicalOf(line, line.computedBase)));
  const build = lines.some(line => ["D", "D_VVF", "C1", "X1", "U3", "U_VVF", "FILL_mig", "FILL_ip"].includes(line.code));
  const floor = v(build ? H.roles.pmFloorBuild : H.roles.pmFloorDesign);
  const share = v(H.roles.pmShare) * technical;
  const pm = Math.max(floor, share);
  const present = new Set(lines.map(line => line.code));
  const relevant = assumptions.filter(item => {
    const users = ASSUMPTION_USERS[item.key];
    return !users || users.some(code => present.has(code));
  });
  return { path, edition, lines, technical, pm, pmFloorApplied: floor > share, pmRatio: technical ? pm / technical : 0, assumptions: relevant, inputs: x };
}

/** The lines each defaulted input feeds; an assumption is listed only when one of them is in the plan. Inputs not listed here feed every plan. */
const ASSUMPTION_USERS: Record<string, V2Code[]> = {
  stretchedClusters: ["A", "D"], storageTypes: ["A"], clustersOnFcOrNfs: ["S_storage", "D", "D_VVF"], mixedStorage: ["S_storage", "D", "D_VVF"],
  dedicatedNsxWorkloadDomains: ["D"], noExistingNsx: ["C1", "X1"], enhancedLinkedMode: ["X1"], source8x: ["X1"], sourceIsVcf: ["C1"],
  clustersOnVum: ["C1", "U_VVF"], vcentersWithIwa: ["C1", "U_VVF"], clustersOnVss: ["C1", "U_VVF"], legacyLogs: ["C1", "U_VVF"],
  upgradeVcfAutomation: ["U3"], upgradeLogs: ["U3"], upgradeVidmToIdentityBroker: ["U3"], upgradeHcx: ["U3"], upgradeAvi: ["U3"], upgradeSrm: ["U3"], upgradeSupervisors: ["U3"], upgradeNsxFederation: ["U3"],
  migrationSitePairs: ["FILL_mig"], extendedVlans: ["FILL_mig"], datedWaves: ["FILL_mig"],
  orgs: ["X2"], catalogItems: ["X2"], templates: ["X3"],
  vcenterSources: ["X4"], managementPacks: ["X4"], dashboards: ["X4"], eventTargets: ["X4"],
  segments: ["X5"], edgeClusters: ["X6"], extraUplinkPairs: ["X6"], externalVlans: ["X16"], virtualNetworkAppliance: ["X16"], transitGateway: ["X16"],
  zones: ["X11"], apps: ["X11"], sspAlreadyDeployed: ["X11", "X12"], tuningCycles: ["X12"],
  drSitePairs: ["X10"], recoveryPlans: ["X10"], protectedVms: ["X10", "X14"], exercises: ["X10"], ireTests: ["X14"],
  supervisors: ["X9"], vksClusters: ["X9"], gpuHosts: ["X8"], models: ["X8"], engines: ["X13"], dsmTemplates: ["X13"],
  clouds: ["X15"], virtualServices: ["X15"], wafPolicies: ["X15"], tieredHosts: ["EF"], broadcomBaselineDelivered: ["DD"],
};

/** A line's hours by role, with its share of the engagement PM pool. */
export function lineRoles(pass1: Pick<Pass1, "pmRatio">, line: V2Line, base = line.computedBase) {
  const lead = base;
  const secondary = base * line.secondaryShare;
  const architect = line.lead === "architect" ? lead : secondary;
  const srConsultant = line.lead === "architect" ? secondary : lead;
  return { architect, srConsultant, projectManager: (lead + secondary) * pass1.pmRatio };
}
