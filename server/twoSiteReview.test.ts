import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyCustomerBrief } from "../shared/briefImport";
import { barWindow } from "../shared/buildingBlocks";
import { buildCustomerEffort, customerRemainingWaves, formatWindow, NSX_VLAN_NOTE } from "../shared/effort";
import { effectiveReport, hardwareGroups } from "../shared/reportView";
import { refreshDerivedDocument, summarizeCompatibilityHandoff } from "../shared/fcp";
import { assessHclEstate, emptyHclInventoryEvidence, NSX_TEP_MIN_MTU, RECOMMENDED_MTU, VDS_MINIMUM } from "../shared/hcl";
import { createDefaultDocument, domainBuildWeight, domainHosts, domainPackages, type EngagementDocument } from "../shared/fcp";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { scopedEffortForDocument } from "./rateCard";
import { fundingProblem } from "../shared/reportFormat";

/**
 * Regression fixture shaped like a two-site customer review (two sites, two management domains, four workload domains,
 * about 300 hosts on vSphere 8 and 11,000 VMs). Names and figures are generic: no customer data is stored here.
 */
const exampleBrief = () => JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../docs/examples/customer-brief.example.json"), "utf8"));

const DOMAINS = [
  { name: "North management domain", kind: "management", pathway: "greenfield", instance: "North", hosts: 2, notes: "Built on the existing two-host North management cluster; move its management workloads to South first." },
  { name: "South management domain", kind: "management", pathway: "greenfield", instance: "South", hosts: 2, notes: "Built on the existing two-host South management cluster; it temporarily carries the North management workloads, so it follows the North build." },
  { name: "VDI workload domain – North", kind: "workload", pathway: "greenfield", instance: "North", hosts: null, notes: "Greenfield on new frames; replaces VDI capacity at North-VDI-DC (120 hosts today)." },
  { name: "VDI workload domain – South", kind: "workload", pathway: "greenfield", instance: "South", hosts: null, notes: "Greenfield on new frames; replaces VDI capacity at South-VDI-DC (49 hosts today)." },
  { name: "Clinical workload domain", kind: "workload", pathway: "import", instance: "South", hosts: 6, notes: "Import the existing clinical vCenter rather than rebuild it." },
  { name: "Server workload domain (VC 0470)", kind: "workload", pathway: "greenfield", instance: "North", hosts: null, notes: "Parallel capacity with meaningful cluster boundaries kept, migrated in controlled waves from VC 0470 (123 hosts today)." },
];

const hostModel = (vendor: string, model: string, cpuModel: string, hosts: number, cluster: string) => ({
  vendor, model, cpuModel, hosts, physicalCores: hosts * 48, esxiVersions: [{ version: "VMware ESXi 8.0.3 build-25205845", hosts }], esxiCorrelation: "per-platform",
  clusterMembership: [{ name: cluster, hosts }], minimumMemoryGiB: 512, maximumMemoryGiB: 1024,
});

function twoSite(patch: (raw: any) => void = () => {}): EngagementDocument {
  const raw = exampleBrief();
  raw.customer = { ...raw.customer, name: "Riverbend Health" };
  raw.entitlement = { value: 450_000, hours: null, termStart: "2026-10-11", termEnd: null, hoursConsumed: null, consumedAsOf: null };
  raw.schedule = { projectStart: "2026-10-16", implementationStart: null, targetComplete: "2027-10-15", hardwareLeadWeeks: null, calendarConstraints: null };
  raw.customerOwnedWork = [];
  raw.openItems = [{ item: "Confirm the entitlement term and end date (not yet stated in writing)", gates: "Entitlement term and plan length", owner: "Account lead / Partner practice lead" }];
  Object.assign(raw.discovery, {
    assessmentCompleted: true, vcenters: 5, datacenters: 2, edgeSites: 12, esxHosts: 313, vcfInstances: 2, storage: "vmfs-fc",
    plannedPath: "hybrid", platformEdition: "vcf", consolidatedDomain: false, newHostsPurchased: { management: null, workload: null },
    addOnsConsidered: ["vcf-operations", "vcf-automation", "nsx"], notInterested: [], sitePrerequisitesOpen: ["tor-switch-design"],
    componentDepth: { operations: "tier-2", automation: null, networkingSecurity: "tier-1", kubernetesAi: null, efficiency: null },
    outcomesWanted: { operations: ["lifecycle", "observability", "capacity-cost"], automation: [], networking: ["physical-fabric"], security: ["identity-rbac"], resilience: ["recovery-architecture"], kubernetes: [], privateAi: [] },
    domains: DOMAINS.map(domain => ({ ...domain })), planningNotes: null, industry: "healthcare-life-sciences",
  });
  patch(raw);
  const base = createDefaultDocument();
  base.fields.priorities = [];
  Object.assign(base.inventory, {
    hosts: 313, clusters: 52, datacenters: 14, vmCount: 11_466, poweredOnVms: 11_279, poweredOffVms: 187, physicalCores: 15_024, vCpu: 38_882,
    esxiVersions: [{ version: "VMware ESXi 8.0.3 build-25205845", hosts: 299 }, { version: "VMware ESXi 7.0.3 build-24784741", hosts: 14 }],
    clusterProfiles: [{ name: "North-VDI-DC / VDI01-CL", hosts: 60 }, { name: "North-VDI-DC / VDI02-CL", hosts: 60 }, { name: "South-VDI-DC / VDI11-CL", hosts: 49 }, { name: "Clinical-DC / Prod-CL", hosts: 6 }, { name: "Server-DC / App01-CL", hosts: 70 }, { name: "Server-DC / App02-CL", hosts: 53 }],
    hostModels: [
      hostModel("HPE", "Synergy 480 Gen10", "Intel(R) Xeon(R) Platinum 8268 CPU @ 2.90GHz", 142, "North-VDI-DC / VDI01-CL"),
      hostModel("HPE", "Synergy 480 Gen11", "Intel(R) Xeon(R) Gold 6430", 150, "Server-DC / App01-CL"),
      hostModel("HPE", "ProLiant BL460c Gen10", "Intel(R) Xeon(R) Gold 6148 CPU @ 2.40GHz", 16, "Server-DC / App02-CL"),
      // The same server model reported with the vendor in the model string, on another CPU.
      hostModel("HPE", "HPE Synergy 480 Gen10", "Intel(R) Xeon(R) Gold 6248 CPU @ 2.50GHz", 5, "South-VDI-DC / VDI11-CL"),
    ],
  });
  Object.assign(base.inventory.hclEvidence, {
    tabs: { ...base.inventory.hclEvidence.tabs, vdatastore: true, vhba: true },
    datastores: [
      { name: "PURE-FC-VDI-01", type: "VMFS", freeMiB: 500_000, freePct: 40, version: "6", capacityMiB: 1_000_000 },
      { name: "NimbleVol1", type: "VMFS", freeMiB: 500_000, freePct: 40, version: "6", capacityMiB: 1_000_000 },
      { name: "local-esx01", type: "VMFS", freeMiB: 100_000, freePct: 80, version: "6", capacityMiB: 120_000 },
      { name: "iso-library", type: "NFS", freeMiB: 50_000, freePct: 50, version: "", capacityMiB: 100_000 },
      { name: "VxRail-vsanDatastore", type: "vsan", freeMiB: 900_000, freePct: 60, version: "", capacityMiB: 1_500_000 },
    ],
    hbas: [
      { host: "esx01", model: "Emulex LPe32000 Fibre Channel", device: "vmhba1", driver: "lpfc", cluster: "North-VDI-DC / VDI01-CL" },
      { host: "esx40", model: "iSCSI Software Adapter", device: "vmhba64", driver: "iscsi_vmk", cluster: "Edge-DC / Site01-CL" },
    ],
  });
  base.fields.plannedProjectStart = "2026-10-16";
  // This estate is the fixture for the customer running the remaining waves after CDW's first waves (a customer request); every other fixture uses the default, CDW runs all waves.
  base.fields.estimateInputs.migrationWaves = "customer-remaining";
  const imported = applyCustomerBrief(base, raw);
  if (!imported.ok) throw new Error(imported.error);
  return imported.document;
}

const render = (document: EngagementDocument) => renderCondensedFcpHtml("Riverbend Health", document, { effort: scopedEffortForDocument(document), today: "2026-10-15" });
const text = (html: string) => html.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const bars = (document: EngagementDocument) => document.adoptionTimeline.lanes.flatMap(lane => lane.bars);
const windowOf = (document: EngagementDocument, id: string) => { const bar = bars(document).find(item => item.id === id); return bar ? barWindow(document.adoptionTimeline, bar) : null; };

describe("Two-site review: scope and sequencing", () => {
  it("1. scopes only what the brief selects: considered automation goes to the follow-on, unmentioned memory tiering and vDefend stay out", () => {
    const document = twoSite();
    expect(document.fields.adoptionDetails.componentDepths).toMatchObject({ automation: "not-selected", efficiency: "not-selected" });
    const effort = scopedEffortForDocument(document);
    const automation = effort.workPackages.filter(row => /automation/.test(row.id));
    expect(automation.length).toBeGreaterThan(0);
    for (const row of automation) expect(row.total).toBe(0);
    expect(automation.some(row => (row.followOn?.total ?? 0) > 0)).toBe(true);
    expect(effort.internal.fit?.placements.filter(item => /^X_VCFA|^X2|^X3/.test(item.code)).every(item => item.bucket === "F")).toBe(true);
    // Memory tiering is neither selected nor considered, so it is not in the plan at all.
    expect(bars(document).some(bar => bar.id === "bar-playbook-component-design-efficiency")).toBe(false);
    expect(effort.internal.pass1?.lines.some(line => line.code === "EF")).toBe(false);
    // Identity and access is selected; vDefend is not, so the security design is not called vDefend.
    expect(bars(document).find(bar => bar.id === "bar-playbook-component-design-security")?.label).not.toMatch(/vDefend/);
    const visible = text(render(document));
    expect(visible).toContain("Considered for after the entitlement: automation and self-service foundations.");
    expect(visible).not.toContain("vDefend Security Design");

    // A brief that does not consider automation at all has no automation work anywhere.
    const without = twoSite(raw => { raw.discovery.addOnsConsidered = ["vcf-operations", "nsx"]; });
    expect(bars(without).some(bar => /automation/.test(bar.id))).toBe(false);
  });

  it("2. gives every plan with a management domain in the entitlement NSX design hours in or before that package", () => {
    const plans = [
      ...[150_000, 410_000, 2_000_000].map(value => twoSite(raw => { raw.entitlement.value = value; })),
      // No networking outcome and NSX not considered: the VLAN-backed NSX design is core scope of its own.
      twoSite(raw => { raw.discovery.addOnsConsidered = ["vcf-operations"]; raw.discovery.outcomesWanted.networking = []; }),
      // No entitlement value: nothing is fitted, so every selected line is planned.
      twoSite(raw => { raw.entitlement.value = null; }),
    ];
    let checked = 0;
    for (const document of plans) {
      const effort = scopedEffortForDocument(document);
      const management = effort.workPackages.filter(row => /^bar-management-domain(-\d+)?$/.test(row.id) && !row.deferred && row.total > 0).sort((left, right) => (left.start ?? "").localeCompare(right.start ?? ""));
      if (!management.length) continue;
      checked += 1;
      const first = management[0];
      const design = effort.workPackages.find(row => row.id === "bar-playbook-component-design-networking" && !row.deferred && row.total > 0 && (row.start ?? "9999") <= (first.start ?? ""));
      const carried = first.id === "bar-management-domain" && effort.internal.lines.some(line => line.code === "NX");
      expect(Boolean(design) || carried).toBe(true);
      if (!design) expect(first.notes).toContain(NSX_VLAN_NOTE);
    }
    // A small entitlement may carry no management domain at all; the rule applies to every plan that does.
    expect(checked).toBeGreaterThanOrEqual(3);
    // The note reaches the customer document with the build date.
    const carrying = plans.find(plan => scopedEffortForDocument(plan).internal.lines.some(line => line.code === "NX"));
    expect(carrying).toBeDefined();
    expect(text(render(carrying!))).toContain(`Platform build begins. ${NSX_VLAN_NOTE}`);
  });

  it("3. states one vSphere 8 finding in the constraint and the open item, for waves after and before its end of support", () => {
    const rows = (document: EngagementDocument) => {
      const visible = text(render(document));
      return {
        constraint: /on vSphere 8 moved or upgraded before 11 Oct 2027 Broadcom product lifecycle The waves run to (\w{3} \d{4}), after vSphere 8 general support ends; ([^|]*?)(?= [A-Z][a-z]+ [a-z])/.exec(visible),
        openItem: /The waves run to (\w{3} \d{4}), after vSphere 8 general support ends on 11 Oct 2027, with (\d+) hosts still on vSphere 8 Supported platform\. Options: (.*?) Riverbend Health infrastructure team with CDW/.exec(visible),
        anyAfter: /after vSphere 8 general support ends/.test(visible),
      };
    };
    // After: the customer's waves run to Sep 2028. Both rows say so, with the same month; the item has an owner and three options.
    const after = rows(twoSite());
    expect(after.constraint?.[1]).toBe("Sep 2028");
    expect(after.constraint?.[2]).toMatch(/^how those hosts stay supported is an open item/);
    expect(after.openItem?.[1]).toBe(after.constraint?.[1]);
    expect(after.openItem?.[2]).toBe("299");
    expect(after.openItem?.[3].split("; or ")).toHaveLength(3);
    expect(after.openItem?.[3]).toContain("import the existing vCenters into VCF before it ends (import works on vSphere 8)");
    // Before: every wave ends in time, so neither row appears.
    const before = rows(twoSite(raw => { raw.customerOwnedWork = [{ label: "Remaining migration waves", start: "2027-09", end: "2027-09" }]; }));
    expect(before).toEqual({ constraint: null, openItem: null, anyAfter: false });
    // A strategy chosen in the brief resolves it: the constraint names it and no open item is raised.
    const chosen = text(render(twoSite(raw => { raw.discovery.vsphere8Strategy = "import-before-eogs"; })));
    expect(chosen).toContain("after vSphere 8 general support ends; Riverbend Health will import the existing vCenters into VCF before it ends");
    expect(chosen).not.toContain("still on vSphere 8");
  });

  it("5. starts training with the first management domain build and hands over the runbook before the customer's waves", () => {
    const document = twoSite();
    const management = windowOf(document, "bar-management-domain")!;
    const enablement = windowOf(document, "bar-platform-enablement")!;
    const runbook = windowOf(document, "bar-platform-runbook-transfer")!;
    const month = (iso: string, add = 0) => { const date = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + add); return date.toISOString().slice(0, 7); };
    expect([month(management.start), month(management.start, 1)]).toContain(month(enablement.start));
    const customerWaves = customerRemainingWaves(document)!;
    expect(month(runbook.end) < customerWaves.start).toBe(true);
    // The same training hours as before, split across the two packages: together one handover-sized package.
    const effort = scopedEffortForDocument(document);
    const hoursOf = (id: string) => { const row = effort.workPackages.find(item => item.id === id)!; return row.total + (row.followOn?.total ?? 0); };
    expect(hoursOf("bar-platform-enablement")).toBeGreaterThan(0);
    expect(Math.abs(hoursOf("bar-platform-enablement") + hoursOf("bar-platform-runbook-transfer") - hoursOf("bar-platform-handover"))).toBeLessThanOrEqual(1);
  });

  it("6. dates every customer effort phase from the span of the work it covers", () => {
    const document = twoSite();
    const { phases } = buildCustomerEffort({ ...document, report: effectiveReport(document) });
    expect(phases.length).toBeGreaterThan(3);
    for (const phase of phases) {
      expect(phase.sources.length).toBeGreaterThan(0);
      expect(phase.window).toBe(formatWindow(phase.sources.map(item => item.start).sort()[0], phase.sources.map(item => item.end).sort().at(-1)!));
    }
    // The migration phase is CDW's wave package, not the customer's site prerequisites that run during design.
    const migration = phases.find(phase => phase.phase === "Migration waves")!;
    const waves = windowOf(document, "bar-playbook-execution-delivery-waves")!;
    expect(migration.sources.map(item => item.label)).toEqual(["Delivery Waves by Pathway"]);
    expect(migration.window).toBe(formatWindow(waves.start, waves.end));
    expect(text(render(document))).toContain(`Migration waves ${formatWindow(waves.start, waves.end)}`);
  });

  it("7. sizes each domain's build by its pathway and host count", () => {
    const document = twoSite(raw => { raw.entitlement.value = 2_000_000; });
    const effort = scopedEffortForDocument(document);
    const packages = domainPackages(document.fields);
    // Every domain has its package on the plan.
    expect(packages.map(item => item.id).every(id => bars(document).some(bar => bar.id === id))).toBe(true);
    const sized = packages.map(({ id, domain }) => {
      const row = effort.workPackages.find(item => item.id === id)!;
      return { name: domain.name, kind: domain.kind, pathway: domain.pathway, hosts: domainHosts(domain, document.inventory).hosts ?? 0, hours: row.total + (row.followOn?.total ?? 0) };
    });
    // Host counts fall back to the domain notes when the brief leaves them out.
    expect(sized.find(item => item.name === "VDI workload domain – North")?.hosts).toBe(120);
    // For the same pathway and kind, more hosts never means fewer hours.
    for (const left of sized) for (const right of sized) {
      if (left.kind === right.kind && left.pathway === right.pathway && left.hosts > right.hosts) expect(left.hours).toBeGreaterThanOrEqual(right.hours);
    }
    // An import of 6 hosts costs less than a greenfield domain replacing 120.
    const imported = sized.find(item => item.pathway === "import")!;
    const greenfield = sized.find(item => item.name === "VDI workload domain – North")!;
    expect(imported.hours).toBeLessThan(greenfield.hours);
    // The weight itself never falls as hosts rise, on any pathway.
    for (const pathway of ["greenfield", "import", "converge"] as const) {
      const domain = { name: "Any", kind: "workload" as const, pathway, instance: "", hosts: null, notes: "" };
      expect(domainBuildWeight(domain, 200)).toBeGreaterThan(domainBuildWeight(domain, 20));
    }
    expect(text(render(document))).toContain("Domain build hours");
  });

  it("4. counts the remaining waves once: as work the customer runs or as CDW follow-on scope, never both", () => {
    const waves = (document: EngagementDocument) => {
      const effort = scopedEffortForDocument(document);
      const visible = text(render(document));
      const workRun = visible.split("Work Run by Riverbend Health")[1]?.split(/Target Personnel|Who Is Involved/)[0] ?? "";
      return {
        followOn: effort.workPackages.filter(row => /^bar-playbook-execution-/.test(row.id)).reduce((sum, row) => sum + (row.followOn?.total ?? 0), 0),
        customerRuns: /\bwaves\b/i.test(workRun),
        customerEffort: /Customer-run migration waves/.test(visible),
      };
    };
    // The plan hands the remaining waves to the customer's team: no CDW follow-on hours for them.
    expect(waves(twoSite())).toEqual({ followOn: 0, customerRuns: true, customerEffort: true });
    // The brief's own row for them does the same.
    expect(waves(twoSite(raw => { raw.customerOwnedWork = [{ label: "Remaining waves (customer team)", start: "2027-10", end: "2028-09" }]; }))).toMatchObject({ followOn: 0, customerRuns: true });
    // By default CDW runs every wave: they are CDW's whole package (funded or follow-on scope) and the customer runs none.
    const byDefault = twoSite();
    delete byDefault.fields.estimateInputs.migrationWaves;
    const cdw = waves(refreshDerivedDocument(byDefault, { forceRebuild: true }));
    expect(cdw.followOn).toBeGreaterThan(0);
    expect(cdw.customerRuns).toBe(false);
  });
});

describe("Two-site review: estimating and checks", () => {
  it("8. takes storage types and kept clusters from the estate instead of planning defaults", () => {
    const visible = text(render(twoSite()));
    // VMFS on Fibre Channel, NFS and vSAN from the RVTools datastores; local disks do not count.
    expect(visible).toMatch(/Principal storage types 3 [^|]*RVTools datastores show VMFS on Fibre Channel, NFS, vSAN \(Pure, Nimble, VxRail arrays\)/);
    expect(visible).toMatch(/Mixed principal storage Yes /);
    // The server domain keeps its cluster boundaries but its notes name no cluster: the count is set in design.
    expect(visible).toMatch(/Clusters on the new platform Set in design Assumed: Server workload domain \(VC 0470\) keeps its existing cluster boundaries/);
    // Named clusters are counted from RVTools.
    const keeps = twoSite(raw => { raw.discovery.domains[5].notes = "Cluster boundaries kept for the Server-DC clusters; the BC11-CL adapters are replaced first."; });
    // A cluster the notes name in passing (a hardware gate) is not one the domain keeps.
    keeps.inventory.clusterProfiles.push({ name: "Legacy-DC / BC11-CL", hosts: 16 });
    const named = text(render(keeps));
    expect(named).toMatch(/Clusters on the new platform 14 2 clusters kept for Server workload domain \(VC 0470\) \(RVTools\)/);
    // A brief can state mixed storage without RVTools datastores.
    const stated = twoSite(raw => { raw.discovery.storageSecondary = ["NFS v3", "made-up"]; });
    stated.inventory.hclEvidence.datastores = [];
    expect(stated.report.discovery.storageSecondary).toEqual(["nfs-v3"]);
    expect(text(render(stated))).toMatch(/Mixed principal storage Yes The brief states VMFS on Fibre Channel and NFS/);
  });

  it("9. states the same MTU and distributed switch thresholds in the host findings as in the technical items", () => {
    expect([NSX_TEP_MIN_MTU, RECOMMENDED_MTU, VDS_MINIMUM.converge, VDS_MINIMUM.import]).toEqual([1700, 9000, 8, 7]);
    const evidence = emptyHclInventoryEvidence();
    evidence.tabs = Object.fromEntries(["vHost", "vNIC", "dvSwitch"].map(tab => [tab, true]));
    evidence.hosts = [{ name: "esx01", cluster: "Server-CL", vendor: "HPE", model: "Synergy 480 Gen11", cpuModel: "Intel(R) Xeon(R) Gold 6430", esxiVersion: "8.0.3", socketCount: 2, coresPerSocket: 32, biosVersion: "1", biosDate: "2024-01-01" }];
    evidence.nics = [{ host: "esx01", cluster: "Server-CL", device: "vmnic0", driver: "ixgben", speedMb: 25000, switchName: "vSwitch0" }];
    evidence.distributedSwitches = [{ name: "vDS-Server", version: "7.0.3", maxMtu: 1500 }];
    const findings = assessHclEstate(evidence, new Date("2026-10-15T00:00:00Z")).findings;
    const remedy = (checkId: string) => findings.find(item => item.checkId === checkId)?.remediation ?? "";
    expect(remedy("NET.VDS_MTU_TOO_LOW")).toContain(`at least ${NSX_TEP_MIN_MTU} end to end; ${RECOMMENDED_MTU} is recommended`);
    expect(remedy("NET.VDS_BELOW_CONVERGE_MINIMUM")).toContain(`vDS to ${VDS_MINIMUM.converge}.0 or later before its vCenter converges`);
    expect(remedy("NET.NO_DISTRIBUTED_SWITCH")).toContain(`vDS ${VDS_MINIMUM.converge}.0 or later to converge into VCF; vDS ${VDS_MINIMUM.import}.0 or later to import`);
    expect(JSON.stringify(findings)).not.toMatch(/1600|vDS 7\.0 or later before it joins/);
    // The plan's own technical item and networking requirement use the same numbers.
    const visible = text(render(twoSite(raw => { raw.technicalItems = []; })));
    expect(visible).toContain(`NSX TEP traffic needs an MTU of at least ${NSX_TEP_MIN_MTU} end to end, with ${RECOMMENDED_MTU} recommended; hosts join VCF on a distributed switch (vDS ${VDS_MINIMUM.converge}.0 or later to converge into VCF; vDS ${VDS_MINIMUM.import}.0 or later to import)`);
    expect(visible).not.toMatch(/MTU of 1,600/);
  });

  it("10. puts every host model in exactly one of listed, to confirm or blocked, with an action that matches its group", () => {
    const document = twoSite();
    document.inventory.hostModels.push(hostModel("HPE", "ProLiant DL360 Gen10 8SFF CTO", "Intel(R) Xeon(R) Gold 6130 CPU @ 2.10GHz", 18, "Edge-DC / Site01-CL"));
    const refreshed = refreshDerivedDocument(document, { forceRebuild: true });
    const groups = hardwareGroups(refreshed);
    const labels = [...groups.listed, ...groups.toConfirm, ...groups.blocked].map(item => item.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toHaveLength(4);
    // Absent from the server list: blocked. A name variant of a listed model: to confirm.
    expect(groups.blocked.map(item => item.label)).toContain("HPE ProLiant BL460c Gen10");
    expect(groups.toConfirm.find(item => item.label === "HPE ProLiant DL360 Gen10 8SFF CTO")?.nameToConfirm).toBe(true);
    // Each action's wording matches its group.
    const handoff = summarizeCompatibilityHandoff(refreshed.readiness.hardwarePlatforms, refreshed.inventory.hosts);
    for (const action of handoff.actions) {
      if (action.priority === "blocker") expect(action.title).not.toMatch(/Confirm the exact model name/);
      if (/Confirm the exact model name/.test(action.title)) expect(action.priority).toBe("required");
    }
    expect(handoff.actions.some(action => action.priority === "required" && /Confirm the exact model name/.test(action.title))).toBe(true);
    const visible = text(render(refreshed));
    expect(visible).toMatch(/Blocked or not listed for the target release: [^.]*HPE ProLiant BL460c Gen10 \(16 hosts\)/);
    expect(visible).toMatch(/To confirm the exact model name with the vendor: HPE ProLiant DL360 Gen10 8SFF CTO \(18 hosts\)/);
  });

  it("11. counts every host of a model, whatever name or CPU it is reported with", () => {
    const document = twoSite();
    // 142 reported as "Synergy 480 Gen10" and 5 as "HPE Synergy 480 Gen10" on another CPU.
    expect(text(render(document))).toContain("Host platforms: 150 HPE Synergy 480 Gen11; 147 HPE Synergy 480 Gen10; 16 HPE ProLiant BL460c Gen10");
    const total = document.inventory.hostModels.reduce((sum, model) => sum + model.hosts, 0);
    expect(total).toBe(document.inventory.hosts);
  });
});

describe("Two-site review: text, dedupe and layout", () => {
  it("12. dates the implementation start constraint from the same values as Key Dates", () => {
    const document = twoSite();
    const visible = text(render(document));
    const keyDate = /(\d{1,2} \w{3} \d{4}) Implementation services start with design and planning\. (\d{1,2} \w{3} \d{4}) Platform build begins/.exec(visible);
    const constraint = /Implementation services start (\d{1,2} \w{3} \d{4}) with design and planning; the platform build begins (\d{1,2} \w{3} \d{4}) Riverbend Health Design and planning run from the project start/.exec(visible);
    expect(keyDate).not.toBeNull();
    expect(constraint?.slice(1)).toEqual(keyDate?.slice(1));
    expect(keyDate?.[1]).toBe("16 Oct 2026");
    // The build begins with the first management domain.
    const start = windowOf(document, "bar-management-domain")!.start;
    expect(keyDate?.[2]).toBe(new Date(`${start}T00:00:00Z`).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace("Sept", "Sep"));
    expect(visible).not.toContain("build, upgrade and migration begin on this date");
  });

  it("13. never repeats a word or the domain kind in a domain package's title or description", () => {
    for (const document of [twoSite(), twoSite(raw => { raw.discovery.domains = raw.discovery.domains.map((domain: any) => ({ ...domain, name: domain.name.replace(/ (management|workload) domain/, "") })); })]) {
      const packages = domainPackages(document.fields).map(({ id }) => bars(document).find(bar => bar.id === id)!);
      expect(packages).toHaveLength(6);
      for (const bar of packages) {
        for (const value of [bar.label, bar.outcome]) {
          expect(value).not.toMatch(/\b(\w+)\s+\1\b/i);
          expect(value).not.toMatch(/\bdomains?\b\W+(?:\w+\W+)?domains?\b/i);
        }
        expect(bar.label.match(/\bdomain\b/gi)?.length ?? 0).toBeLessThanOrEqual(1);
      }
    }
    const document = twoSite();
    const label = (id: string) => bars(document).find(bar => bar.id === id)!;
    expect(label("bar-management-domain-2").label).toBe("South management domain");
    expect(label("bar-import-domain-1").label).toBe("Import Clinical workload domain");
    // A note that already says how the domain is built is not followed by the template's own build sentence.
    expect(label("bar-management-domain-2").outcome).toBe("Built on the existing two-host South management cluster; it temporarily carries the North management workloads, so it follows the North build. Deploy it (2 hosts) with its fleet services and validate core platform health.");
  });

  it("14. gives every open item an owner, raises each subject once, and shows what the reserve is for", () => {
    const document = twoSite(raw => { raw.discovery.addOnsPurchased = ["vdefend"]; });
    const report = effectiveReport(document);
    expect(report.openItems.length).toBeGreaterThan(2);
    for (const item of report.openItems) expect(item.owner.trim()).not.toBe("");
    // The brief already asks to confirm the entitlement term, so the plan does not raise its own end-date item.
    expect(report.openItems.filter(item => /entitlement (term|end)/i.test(item.item))).toHaveLength(1);
    // No two items cover the same subject.
    const subject = (item: string) => item.toLowerCase().replace(/\(.*?\)/g, "").split(/[^a-z]+/).filter(word => word.length > 4).slice(0, 4).join(" ");
    const subjects = report.openItems.map(item => subject(item.item));
    expect(new Set(subjects).size).toBe(subjects.length);
    // Platform items fall to the customer's infrastructure team with CDW; commercial decisions to the customer with the brief's commercial owner.
    expect(report.openItems.find(item => /after vSphere 8 general support ends/.test(item.item))?.owner).toBe("Riverbend Health infrastructure team with CDW");
    expect(report.openItems.find(item => /purchased but not in this plan/.test(item.item))?.owner).toBe("Riverbend Health with Account lead / Partner practice lead");
    // The reserve is a line of its own with what it is for, not a loose sentence.
    const visible = text(render(document));
    expect(visible).toMatch(/This entitlement: reserve Held back for change requests and estimate variance; reviewed at month 6 and released to follow-on work if unused \d+/);
    expect(visible).not.toContain("held in reserve until month 6");
  });

  it("15. lists every in-entitlement package on the Plan on a Page, grouping the domains", () => {
    const document = twoSite();
    const effort = scopedEffortForDocument(document);
    const visible = text(render(document));
    const plan = visible.split("Plan on a Page")[1].split(/Entitlement Burndown|No consumption data/)[0];
    const inEntitlement = effort.workPackages.filter(row => !row.deferred && row.owner === "cdw" && row.category && bars(document).some(bar => bar.id === row.id));
    expect(inEntitlement.length).toBeGreaterThan(15);
    for (const row of inEntitlement) expect(plan).toContain(row.label.replace(/ — depth to be confirmed$/, "").replace(/^(Month \d+|Weeks? [\d–-]+): /, ""));
    expect(plan).toContain("6 domains (2 management, 4 workload): North management domain, South management domain");
  });
});

describe("Two-site review: the rebuild", () => {
  it("keeps the plan within the entitlement after the reserve by moving late work, and never blocks the export", () => {
    const document = twoSite(raw => { raw.entitlement.value = 410_000; });
    const effort = scopedEffortForDocument(document);
    expect(effort.source).toBe("calculated");
    const fit = effort.internal.fit!;
    expect(effort.workPackages.reduce((sum, row) => sum + row.total, 0)).toBeLessThanOrEqual(Math.floor(fit.fillableHours));
    expect(effort.internal.cost?.status).not.toBe("over");
    const html = renderCondensedFcpHtml("Riverbend Health", document, { effort, today: "2026-10-15" });
    expect(checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount })).toEqual([]);
  });
});


describe("Two-site review: a later start", () => {
  /** The fixture with the project start moved later (for a PO lead time), the entitlement unchanged. */
  const startingOn = (projectStart: string, implementationStart: string | null = null) => twoSite(raw => { raw.schedule = { ...raw.schedule, projectStart, implementationStart }; });
  const shifted = (months: number) => { const date = new Date(Date.UTC(2026, 9 + months, months ? 2 : 16)); return date.toISOString().slice(0, 10); };
  /** CDW packages that carry hours in the entitlement or as follow-on scope. */
  const base = (id: string) => id.replace(/:later$/, "");
  const packages = (document: EngagementDocument) => scopedEffortForDocument(document).workPackages.filter(row => row.owner === "cdw" && (row.total > 0 || (row.followOn?.total ?? 0) > 0));

  it("never loses a package when the start moves later, and the domain packages do not grow to absorb freed hours", () => {
    const before = packages(twoSite());
    const domainIds = new Set(domainPackages(twoSite().fields).map(({ id }) => id));
    for (let months = 1; months <= 4; months += 1) {
      const after = packages(startingOn(shifted(months)));
      // A package is funded whole or moves whole; either way the work is still listed under the package's id.
      expect(new Set(after.map(row => base(row.id))).size, `start + ${months} months`).toBeGreaterThanOrEqual(new Set(before.map(row => base(row.id))).size);
      for (const row of before) expect(after.some(item => base(item.id) === base(row.id)), `${row.id} at + ${months} months`).toBe(true);
      // Each role column is rounded on its own, so a package can differ by an hour per role.
      for (const row of after.filter(item => domainIds.has(item.id) && !item.deferred)) {
        expect(row.total, `${row.id} at + ${months} months`).toBeLessThanOrEqual(before.find(item => item.id === row.id)!.total + 3);
      }
      const domainHours = (rows: typeof before) => rows.filter(item => domainIds.has(item.id) && !item.deferred).reduce((sum, item) => sum + item.total, 0);
      expect(domainHours(after), `domains at + ${months} months`).toBeLessThanOrEqual(domainHours(before) + 1);
    }
    // Work the later start pushes past the entitlement is follow-on scope, listed after the entitlement and in the bucket note.
    const document = startingOn(shifted(4));
    const effort = scopedEffortForDocument(document);
    const late = effort.workPackages.filter(row => row.deferred === "after the entitlement window" && row.owner === "cdw");
    expect(late.map(row => row.id)).toContain("bar-operations-capacity-cost");
    for (const row of late) expect(row.followOn!.total, row.id).toBeGreaterThan(0);
    const visible = text(render(document));
    const plan = visible.split("Plan on a Page")[1].split(/Entitlement Burndown|No consumption data/)[0];
    expect(plan).toContain("after the entitlement: ");
    expect(plan).toContain("Capacity and Cost Visibility");
    expect(visible.split("Follow-on Scope — Two-Year Notional")[1]).toContain("Capacity and Cost Visibility");
    expect(visible).toMatch(/Moved out of this entitlement: .*Capacity and Cost Visibility \(\d+ hours\) moved to the follow-on because it is scheduled after the entitlement ends/);
    // Hours are placed by fit, not the calendar: the late work's hours are not parked in the reserve. The plan stops
    // balancing and the planner is told which package does not fit the window.
    expect(effort.internal.fit!.reserveHours).toBeCloseTo(scopedEffortForDocument(twoSite()).internal.fit!.reserveHours, 0);
    expect(fundingProblem(document, effort, "2026-10-15")).toMatch(/^Does not fit the window: .*Capacity and Cost Visibility \(\d+ hours\)/);
  });

  it("keeps handover inside the entitlement whenever a wave is, alongside the runbook knowledge transfer", () => {
    for (let months = 0; months <= 4; months += 1) {
      const document = months ? startingOn(shifted(months)) : twoSite();
      const effort = scopedEffortForDocument(document);
      const wave = effort.workPackages.find(row => /^bar-playbook-execution-/.test(row.id) && !row.deferred && row.total > 0);
      if (!wave) continue;
      const handover = effort.workPackages.find(row => row.id === "bar-platform-handover");
      expect(handover?.deferred, `+ ${months} months`).toBeUndefined();
      expect(handover!.total).toBeGreaterThan(0);
      expect(bars(document).some(bar => bar.id === "bar-platform-handover")).toBe(true);
      for (const id of ["bar-platform-runbook-transfer", "bar-platform-enablement", "bar-platform-licensing", "bar-management-domain", "bar-management-domain-2"]) {
        expect(effort.workPackages.find(row => row.id === id)?.deferred, `${id} at + ${months} months`).toBeUndefined();
      }
    }
    // At a 2 November start the waves end in the last entitlement month: handover runs in that month with the runbook transfer.
    const late = startingOn("2026-11-02");
    expect(windowOf(late, "bar-platform-handover")!.start.slice(0, 7)).toBe(windowOf(late, "bar-platform-runbook-transfer")!.start.slice(0, 7));
    expect(text(render(late))).toContain("Handover and Service Acceptance");
  });

  it("states one start date: the timeline, Key Dates and the constraint all start on the project start", () => {
    const document = startingOn("2026-11-02", "2026-11-26");
    expect(document.adoptionTimeline.startDate).toBe("2026-11-02");
    expect(barWindow(document.adoptionTimeline, bars(document).find(bar => bar.id === "bar-platform-plan")!)!.start).toBe("2026-11-02");
    // Nothing starts before the project start.
    for (const bar of bars(document)) expect(barWindow(document.adoptionTimeline, bar)!.start >= "2026-11-02", bar.id).toBe(true);
    const visible = text(render(document));
    const keyDate = /(\d{1,2} \w{3} \d{4}) Implementation services start/.exec(visible.split("Key Dates")[1] ?? "");
    const constraint = /Implementation services start (\d{1,2} \w{3} \d{4})/.exec(visible);
    expect(keyDate?.[1]).toBe("2 Nov 2026");
    expect(constraint?.[1]).toBe("2 Nov 2026");
  });

  it("lists no milestone to date after the build date; a future one is a key date", () => {
    // The entitlement becomes effective after the document is built.
    const document = twoSite(raw => {
      raw.schedule = { ...raw.schedule, projectStart: "2026-11-02" };
      raw.entitlement = { ...raw.entitlement, termStart: "2026-10-26" };
      raw.milestonesToDate = [...(raw.milestonesToDate ?? []).filter((row: any) => row.event !== "Entitlement effective"), { date: "2026-10-26", event: "Entitlement effective", detail: "Services entitlement opened." }];
    });
    const html = renderCondensedFcpHtml("Riverbend Health", document, { effort: scopedEffortForDocument(document), today: "2026-10-20" });
    const visible = text(html);
    const milestones = visible.includes("Engagement Milestones to Date") ? visible.split("Engagement Milestones to Date")[1].split(/Key Dates|Private Cloud Adoption Timeline/)[0] : "";
    for (const match of Array.from(milestones.matchAll(/(\d{1,2} \w{3} \d{4})/g))) expect(new Date(`${match[1]} UTC`).toISOString().slice(0, 10) <= "2026-10-20", match[1]).toBe(true);
    expect(milestones).not.toContain("Entitlement effective");
    expect(visible.split("Key Dates")[1]).toContain("26 Oct 2026 Entitlement effective");
  });
});
