/**
 * Every coefficient of the v2 hours model, from docs/FCP_Hours_Model_Rebuild.md. Values are base (lead-role)
 * hours unless stated. Each carries the spec's confidence rating and source so the model can be validated
 * against delivery data one number at a time. Logic in shared/hoursV2.ts and shared/hoursFit.ts reads only
 * from here.
 */

export type Confidence = "Medium" | "Medium-Low" | "Low-Medium" | "Low" | "Practice decision";
export type Coefficient = { value: number; confidence: Confidence; source: string };

const c = (value: number, confidence: Confidence, source: string): Coefficient => ({ value, confidence, source });

const PRESIDIO_VCF = "Presidio VCF Deployment QuickStart scope (10-host base, 10-host add-on blocks)";
const JUDGMENT = "Judgment; no published effort found";
const ITQ_UPGRADE = "ITQ VCF upgrade sequence checked against the Broadcom VCF Upgrade Planner for 9.1.0.0400";
const HCX_KB = "Broadcom KB 321604 (HCX scalability); practitioner RAV guidance; Presidio AVS QuickStart 50-VM blocks";

export const HOURS_V2 = {
  roles: {
    secondaryShare: c(0.1, "Medium-Low", "Spec section 6 Global: secondary technical role is 10% of base"),
    secondaryShareHigh: c(0.2, "Medium-Low", "Spec section 6 Global: 20% for X16 (VPC) and X11/X12 (vDefend)"),
    pmShare: c(0.15, "Low", "Spec section 6 Global: PM is 15% of technical hours at engagement level"),
    pmFloorBuild: c(24, "Low", "Spec section 6 Global: PM floor when any build stage exists"),
    pmFloorDesign: c(8, "Low", "Spec section 6 Global: PM floor on design-only engagements"),
  },
  depth: {
    tier1: c(1, "Low", "Spec section 3 item 3: Tier 1 Deployed"),
    tier2: c(1.25, "Low", "Spec section 3 item 3: Tier 2 Operationalized (runbooks, alerting, RBAC, knowledge transfer)"),
    tier3: c(1.6, "Low", "Spec section 3 item 3: Tier 3 Business consumption (catalog, chargeback, tenant onboarding)"),
  },
  designOnlyShare: c(0.25, "Practice decision", "Spec section 6 Global: design-only and undecided pathways keep 25% of each X line"),
  discovery: {
    base: c(24, "Low", "Broadcom VCF Services Entitlement SPD; judgment"),
    perHost: c(0.15, "Low", JUDGMENT),
    perVcenter: c(6, "Low", JUDGMENT),
    perExtraSite: c(12, "Low", JUDGMENT),
    cap: c(120, "Low", JUDGMENT),
    baselineDelivered: c(12, "Low", "Spec section 6: validation only when Broadcom baselining was delivered"),
  },
  discoveryAreas: {
    opsAutomation: c(8, "Low", JUDGMENT),
    kubernetes: c(8, "Low", JUDGMENT),
    networking: c(12, "Low", JUDGMENT),
    security: c(12, "Low", JUDGMENT),
    resilience: c(12, "Low", JUDGMENT),
    hcx: c(12, "Low", JUDGMENT),
    cyberRecovery: c(12, "Low", JUDGMENT),
    privateAi: c(16, "Low", JUDGMENT),
    perExtraSite: c(4, "Low", "Spec section 6: added to NSX networking, DR and HCX per extra site"),
  },
  design: {
    base: c(64, "Low", "Presidio VCF QuickStart scope; Broadcom VCF Solution Architecture and Design course scope"),
    perWorkloadDomain: c(16, "Low", JUDGMENT),
    perExtraInstance: c(24, "Low", JUDGMENT),
    perExtraSite: c(32, "Low", JUDGMENT),
    perStretchedCluster: c(24, "Low", JUDGMENT),
    perExtraStorageType: c(8, "Low", JUDGMENT),
    hostThreshold: c(32, "Low", JUDGMENT),
    perHostAboveThreshold: c(0.25, "Low", JUDGMENT),
    hostTermCap: c(40, "Low", JUDGMENT),
    /** The Reference Architecture Design tier: a small estate gets this flat design instead of the formula above. */
    referenceFlat: c(40, "Practice decision", "Product owner: small estates take a flat 40-hour Reference Architecture Design"),
    /**
     * When the entitlement cannot carry the full design, it is phased by deliverable. Foundation design (management domain,
     * platform, network and storage) is this many hours of the base; workload domain design, and DR and NSX overlay design
     * (the rest of the base, plus extra sites and stretched clusters), follow.
     */
    foundationBase: c(40, "Practice decision", "Product owner: foundation design is the management domain, platform, network and storage; the rest of the base is DR and NSX overlay design"),
  },
  /** The small-estate test for the Reference Architecture Design tier: all of these must hold, at most. */
  smallEstate: {
    hosts: c(16, "Practice decision", "Product owner: at most 16 hosts"),
    clusters: c(2, "Practice decision", "Product owner: at most 2 clusters"),
    vcenters: c(1, "Practice decision", "Product owner: at most 1 vCenter"),
    instances: c(1, "Practice decision", "Product owner: at most 1 VCF instance"),
    sites: c(1, "Practice decision", "Product owner: at most 1 site"),
  },
  deploy: {
    managementDomain: c(64, "Medium-Low", PRESIDIO_VCF),
    handover: c(16, "Medium-Low", PRESIDIO_VCF),
    managementServices: c(4, "Medium-Low", "Spec section 5: VCF 9.1 Management Services IP, DNS and certificate prep"),
    perExtraInstance: c(40, "Medium-Low", JUDGMENT),
    perWorkloadDomain: c(24, "Medium-Low", PRESIDIO_VCF),
    perDedicatedNsx: c(8, "Medium-Low", JUDGMENT),
    perExtraCluster: c(8, "Medium-Low", JUDGMENT),
    perStretchedCluster: c(24, "Medium-Low", JUDGMENT),
    perHostFirst: c(0.75, "Medium-Low", "Presidio 10-host blocks; VCF 9.1 bring-up runtime 2 to 6 hours"),
    firstHostBand: c(64, "Medium-Low", JUDGMENT),
    perHostAbove: c(0.5, "Medium-Low", JUDGMENT),
  },
  deployVvf: {
    base: c(40, "Low", "VVF FAQ (VCF Installer deploys VVF components); judgment"),
    handover: c(16, "Low", JUDGMENT),
    perExtraCluster: c(8, "Low", JUDGMENT),
    perHost: c(0.75, "Low", JUDGMENT),
  },
  storage: {
    perFcOrNfsCluster: c(8, "Low", "Converge and import need a shared writable datastore; vSAN, VMFS-FC and NFS supported"),
    mixed: c(8, "Low", JUDGMENT),
  },
  remediation: {
    perClusterOnVum: c(4, "Medium-Low", `${ITQ_UPGRADE} (vLCM images only)`),
    perVcenterWithIwa: c(4, "Medium-Low", `${ITQ_UPGRADE} (IWA removed in vCenter 9)`),
    perClusterOnVss: c(6, "Medium-Low", "Converge requires VDS 8.0 or later"),
    legacyLogs: c(8, "Medium-Low", `${ITQ_UPGRADE} (Ops for Logs has no in-place path)`),
  },
  converge: {
    base: c(40, "Medium-Low", "Broadcom converge requirements (VCF Installer converges an existing vCenter)"),
    perCluster: c(4, "Medium-Low", JUDGMENT),
    perHost: c(0.25, "Medium-Low", JUDGMENT),
    nsxDeploy: c(8, "Medium-Low", JUDGMENT),
  },
  import: {
    perVcenter: c(24, "Medium", "Broadcom import doc; VCF 9.1 FAQ (whole vCenter inventory imported)"),
    perCluster: c(4, "Medium", JUDGMENT),
    perHost: c(0.1, "Medium", JUDGMENT),
    nsxDeploy: c(8, "Medium", "NSX 4.x as a 3-node cluster is required for an 8.x import"),
    elmBreakUp: c(16, "Medium", "Practitioner: Enhanced Linked Mode is not supported for import"),
    sourceUpgrade: c(12, "Medium", "Practitioner: imports land at the discovered version and need a separate upgrade"),
    sourceUpgradePerHost: c(0.25, "Medium", JUDGMENT),
  },
  upgradeVvf: {
    base: c(16, "Medium-Low", ITQ_UPGRADE),
    perVcenter: c(8, "Medium-Low", ITQ_UPGRADE),
    perCluster: c(4, "Medium-Low", ITQ_UPGRADE),
  },
  upgradeVcf: {
    planning: c(24, "Medium", ITQ_UPGRADE),
    coreServices: c(16, "Medium", `${ITQ_UPGRADE} (VCF Operations, SDDC Manager, Management Services)`),
    managementServicesPrep: c(8, "Medium", "Spec section 5: Management Services prep during the upgrade"),
    perDomain: c(12, "Medium", ITQ_UPGRADE),
    perCluster: c(6, "Medium", ITQ_UPGRADE),
    vcfAutomation: c(12, "Medium", ITQ_UPGRADE),
    logs: c(12, "Medium", ITQ_UPGRADE),
    vidmToIdentityBroker: c(12, "Medium", ITQ_UPGRADE),
    hcx: c(6, "Medium", ITQ_UPGRADE),
    avi: c(6, "Medium", `${ITQ_UPGRADE} (Avi 32.1.1 or later gates the NSX and vCenter 9.1 upgrade)`),
    srm: c(12, "Medium", ITQ_UPGRADE),
    perSupervisor: c(8, "Medium", ITQ_UPGRADE),
    nsxFederation: c(16, "Medium", ITQ_UPGRADE),
  },
  waves: {
    vmsPerWave: c(150, "Medium", HCX_KB),
    hcxPerSitePair: c(16, "Medium", `${HCX_KB}; VCF 9.1 deploys HCX from VCF Operations`),
    planningPerVm: c(0.1, "Low", HCX_KB),
    perWave: c(10, "Low", HCX_KB),
    executionPerVm: c(0.15, "Low", HCX_KB),
    perExtendedVlan: c(2, "Low", HCX_KB),
    pilot: c(16, "Low", "Practitioner: pilot wave of 5 to 10 non-critical VMs"),
  },
  inPlaceWaves: {
    hostsPerWindow: c(16, "Low-Medium", "Broadcom ESX 9.1 upgrade doc (clusters in parallel, per-host selection)"),
    perWindow: c(4, "Low-Medium", JUDGMENT),
    perHost: c(0.25, "Low-Medium", JUDGMENT),
    proving: c(8, "Low-Medium", "Spec section 6: first-cluster proving"),
  },
  automation: {
    platform: c(32, "Low-Medium", "Practitioner: VCF Automation deploy is about 3 hours of machine time"),
    vmSelfService: c(24, "Low-Medium", "Presidio QuickStart (4 cloud accounts, 1 blueprint in base)"),
    perOrg: c(8, "Low-Medium", JUDGMENT),
    perCatalogItemAboveFree: c(4, "Low-Medium", JUDGMENT),
    freeCatalogItems: c(3, "Low-Medium", JUDGMENT),
    iacGovernance: c(32, "Low-Medium", JUDGMENT),
    perTemplateAboveFree: c(4, "Low-Medium", JUDGMENT),
    freeTemplates: c(3, "Low-Medium", JUDGMENT),
  },
  operations: {
    base: c(16, "Low-Medium", "Presidio QuickStart (4 vCenter, 6 network sources, 4 packs in base); VCF Operations deployed at bring-up"),
    perVcenterSource: c(4, "Low-Medium", JUDGMENT),
    perManagementPack: c(4, "Low-Medium", JUDGMENT),
    lifecycle: c(8, "Low-Medium", JUDGMENT),
    observability: c(12, "Low-Medium", JUDGMENT),
    capacityCost: c(12, "Low-Medium", JUDGMENT),
    perDashboard: c(4, "Low-Medium", JUDGMENT),
    identityOperations: c(8, "Low-Medium", JUDGMENT),
    perEventTarget: c(16, "Low-Medium", "Presidio VCF and ServiceNow QuickStart"),
  },
  overlay: {
    base: c(16, "Low-Medium", "Presidio QuickStart (1 T0, 1 T1, 5 segments inside base deploy)"),
    perCluster: c(4, "Low-Medium", JUDGMENT),
    perSegmentAboveFree: c(2, "Low-Medium", JUDGMENT),
    freeSegments: c(5, "Low-Medium", "Presidio QuickStart: 5 segments in base"),
  },
  edge: {
    perEdgeCluster: c(40, "Low", "Presidio QuickStart; VCF 9.1 upgrade notes (Edges upgraded at end of sequence)"),
    perExtraUplinkPair: c(8, "Low", JUDGMENT),
  },
  vpc: {
    base: c(16, "Medium", "Broadcom Distributed VLAN Connectivity Model and VPC Getting Started docs"),
    perExternalVlan: c(4, "Medium", "Broadcom Distributed VLAN Connectivity Model"),
    virtualNetworkAppliance: c(12, "Medium", "VCF 9.1 networking blog (stateful services through the VNA cluster)"),
  },
  vds: {
    base: c(12, "Low", "Converge requirement for VDS 8.0 or later; judgment"),
    perCluster: c(2, "Low", JUDGMENT),
  },
  segmentation: {
    stage1Assessment: c(8, "Medium-Low", "VMware DFW 1-2-3-4 blog; Broadcom vDefend DFW TechDocs"),
    stage2SharedServices: c(16, "Medium-Low", "VMware DFW 1-2-3-4 blog"),
    stage3Base: c(8, "Medium-Low", "VMware DFW 1-2-3-4 blog"),
    perZone: c(4, "Medium-Low", "VMware DFW 1-2-3-4 blog"),
    perApp: c(6, "Medium-Low", "VMware DFW 1-2-3-4 blog"),
    sspDeploy: c(16, "Medium-Low", "Spec section 6: SSP deploy when Security Intelligence is used"),
  },
  threatPrevention: {
    sspDeploy: c(24, "Low", "VMware Pro Cloud Services brief (SSP, virtual patching)"),
    perFeature: c(12, "Low", JUDGMENT),
    perTuningCycle: c(8, "Low", JUDGMENT),
  },
  recovery: {
    perSitePair: c(24, "Medium-Low", "Presidio AVS QuickStart (SRM per 50 protected VMs)"),
    perPlan: c(2, "Medium-Low", JUDGMENT),
    perProtectedVm: c(0.1, "Medium-Low", "Presidio AVS QuickStart (SRM per 50 protected VMs)"),
    perExercise: c(12, "Medium-Low", JUDGMENT),
    onpremCleanRoom: c(32, "Medium-Low", "VCF 9.1 FAQ (clean room requires the ACC entitlement)"),
  },
  cloudCyberRecovery: {
    base: c(16, "Low", "Broadcom KB 428834 (minimum reserved 2-node recovery SDDC)"),
    perProtectedVm: c(0.05, "Low", JUDGMENT),
    perIreTest: c(12, "Low", JUDGMENT),
  },
  kubernetes: {
    perSupervisor: c(16, "Low-Medium", "VVF datasheet (VKS included)"),
    perVksCluster: c(8, "Low-Medium", JUDGMENT),
    registry: c(8, "Low-Medium", "ITQ guide (VCF 9.1 lists regional Harbor as a prerequisite)"),
  },
  privateAi: {
    platform: c(24, "Low", JUDGMENT),
    vgpuLicensing: c(8, "Low", JUDGMENT),
    perGpuHost: c(2, "Low", JUDGMENT),
    perModel: c(8, "Low", JUDGMENT),
    dlvmCatalog: c(8, "Low", JUDGMENT),
  },
  dataServices: {
    base: c(16, "Low", "Broadcom VCFA services doc; DSM release notes"),
    perEngine: c(8, "Low", JUDGMENT),
    perTemplate: c(4, "Low", JUDGMENT),
  },
  avi: {
    controllerCluster: c(16, "Low", "ITQ guide (Avi 32.1.1 or later blocks the NSX and vCenter 9.1 upgrade)"),
    perCloud: c(8, "Low", JUDGMENT),
    perVirtualServiceAboveFree: c(4, "Low", JUDGMENT),
    freeVirtualServices: c(3, "Low", JUDGMENT),
    perWafPolicy: c(8, "Low", JUDGMENT),
  },
  efficiency: {
    base: c(12, "Low", "VVF datasheet (memory tiering with NVMe)"),
    perTieredHost: c(0.25, "Low", JUDGMENT),
  },
  /** Defaults when the brief and RVTools are silent. The plan lists each one it used as an assumption. */
  defaults: {
    hostsPerCluster: c(16, "Low", "Spec section 6 defaults: clusters = max(1, ceil(hosts / 16))"),
    vmsPerHost: c(25, "Low", "Spec section 6 defaults: VMs = hosts x 25"),
    zones: c(4, "Low", "Spec section 6 defaults"),
    apps: c(5, "Low", "Spec section 6 defaults"),
    protectedVmShare: c(0.2, "Low", "Spec section 6 defaults: protected VMs = 0.2 x VMs"),
    migrationSitePairs: c(1, "Low", "Spec section 6 defaults: 1 site pair if migration"),
    extendedVlans: c(10, "Low", "Spec section 6 defaults"),
    noExistingNsx: c(1, "Low", "Spec 7.8 worked example adds the NSX deploy on converge"),
    orgs: c(1, "Low", "Spec 7.8 worked example (X2 = 24 + 8)"),
    catalogItems: c(3, "Low", "Spec section 2c: the first 3 catalog items are in the module"),
    templates: c(3, "Low", "Spec section 2c: the first 3 templates are in the module"),
    managementPacks: c(0, "Low", "Open question; conservative reading"),
    dashboards: c(1, "Low", "Open question; one dashboard when the module is selected"),
    eventTargets: c(1, "Low", "Open question; one target when the module is selected"),
    segments: c(5, "Low", "Spec section 2c: 5 segments in base"),
    edgeClusters: c(1, "Low", "Open question; one Edge cluster when Edge routing is selected"),
    externalVlans: c(1, "Low", "Open question; conservative reading"),
    tuningCycles: c(1, "Low", "Open question; conservative reading"),
    drSitePairs: c(1, "Low", "Open question; a recovery design needs one site pair"),
    recoveryPlans: c(1, "Low", "Open question; conservative reading"),
    exercises: c(1, "Low", "Open question; one exercise when recovery exercises are selected"),
    ireTests: c(1, "Low", "Open question; one IRE test when cloud cyber recovery is selected"),
    supervisors: c(1, "Low", "Open question; one Supervisor"),
    vksClusters: c(1, "Low", "Open question; one VKS cluster"),
    gpuHosts: c(0, "Low", "Open question; conservative reading"),
    models: c(1, "Low", "Open question; one model for a pilot"),
    engines: c(1, "Low", "Open question; one database engine"),
    dsmTemplates: c(0, "Low", "Open question; conservative reading"),
    clouds: c(1, "Low", "Open question; one cloud connector"),
    virtualServices: c(3, "Low", "Spec section 2c: the first 3 virtual services are in the base"),
    wafPolicies: c(1, "Low", "Open question; one policy when WAF is selected"),
    tieredHosts: c(0, "Low", "Open question; conservative reading"),
    datedWaves: c(1, "Low", "Open question; only the first wave is assumed to have a date behind it"),
  },
  fit: {
    reserveShare: c(0.08, "Practice decision", "Spec 7.7: hold 8 to 10% unallocated until month 6"),
    reviewMonth: c(6, "Practice decision", "Spec 7.7: review burn at month 3 and month 6"),
    burnCheckpointShare: c(0.4, "Practice decision", "Spec 7.7: re-scope if burn at month 6 is below 40%"),
    termMonths: c(12, "Practice decision", "VCF Services Entitlement SPD: used within the initial 12 months"),
  },
} as const;

/** Build-stage weights for spreading a build line across its stages (kept from v1, spec section 6 Deploy). */
export const BUILD_STAGE_WEIGHTS = {
  managementDomain: c(1, "Medium-Low", "v1 build weights, kept by the spec"),
  workloadDomain: c(0.8, "Medium-Low", "v1 build weights, kept by the spec"),
  vvfCluster: c(0.4, "Medium-Low", "v1 build weights, kept by the spec"),
  preparation: c(0.4, "Medium-Low", "v1 build weights, kept by the spec"),
  handover: c(0.2, "Medium-Low", "v1 build weights, kept by the spec"),
  licensing: c(0.1, "Medium-Low", "v1 build weights, kept by the spec"),
} as const;

/**
 * Each domain's share of the build line: a base by pathway plus an increment per host, so a domain's hours follow its
 * size and how it is delivered. Shares, like the build weights above: they split the build line, never add to it.
 */
export const DOMAIN_BUILD_WEIGHTS = {
  managementBase: c(1, "Medium-Low", "Management domain build weight, as above"),
  greenfieldBase: c(0.6, "Low", "Judgment: a new workload domain with its vLCM images and validation, before its hosts"),
  importBase: c(0.3, "Low", "Judgment: an import brings an existing vCenter under fleet management without rebuilding it"),
  convergeBase: c(0.5, "Low", "Judgment: a converge adds the management components to an existing vCenter"),
  perHostGreenfield: c(0.004, "Low", "Judgment: host commissioning, images and cluster validation per host built new"),
  perHostImport: c(0.002, "Low", "Judgment: per-host validation and upgrade of an imported vCenter"),
  perHostConverge: c(0.003, "Low", "Judgment: per-host validation of a converged vCenter"),
} as const;
