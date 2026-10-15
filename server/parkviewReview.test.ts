import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyCustomerBrief } from "../shared/briefImport";
import { barWindow } from "../shared/buildingBlocks";
import { buildCustomerEffort, customerRemainingWaves, formatWindow, NSX_VLAN_NOTE } from "../shared/effort";
import { effectiveReport } from "../shared/reportView";
import { createDefaultDocument, type EngagementDocument } from "../shared/fcp";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { scopedEffortForDocument } from "./rateCard";

/**
 * Regression fixture shaped like the Parkview review (two sites, two management domains, four workload domains,
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
  raw.entitlement = { value: 410_000, hours: null, termStart: "2026-10-11", termEnd: null, hoursConsumed: null, consumedAsOf: null };
  raw.schedule = { projectStart: "2026-10-16", implementationStart: null, targetComplete: "2027-10-15", hardwareLeadWeeks: null, calendarConstraints: null };
  raw.customerOwnedWork = [];
  raw.resourceAssignments = [];
  raw.openItems = [{ item: "Confirm the entitlement term and end date (not yet stated in writing)", gates: "Entitlement term and plan length", owner: "Account lead / Partner practice lead" }];
  Object.assign(raw.discovery, {
    assessmentCompleted: true, vcenters: 5, datacenters: 2, edgeSites: 12, esxHosts: 313, vcfInstances: 2, storage: "vmfs-fc",
    plannedPath: "hybrid", platformEdition: "vcf", consolidatedDomain: false, newHostsPurchased: { management: null, workload: null },
    addOnsConsidered: ["vcf-operations", "vcf-automation", "nsx"], notInterested: [], sitePrerequisitesOpen: ["tor-switch-design"],
    componentDepth: { operations: "tier-2", automation: null, networkingSecurity: "tier-1", kubernetesAi: null, efficiency: null },
    outcomesWanted: { operations: ["lifecycle", "observability", "capacity-cost"], automation: [], networking: ["physical-fabric"], security: ["identity-rbac"], resilience: ["recovery-architecture"], kubernetes: [], privateAi: [] },
    domains: DOMAINS, planningNotes: null, industry: "healthcare-life-sciences",
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
  const imported = applyCustomerBrief(base, raw);
  if (!imported.ok) throw new Error(imported.error);
  return imported.document;
}

const render = (document: EngagementDocument) => renderCondensedFcpHtml("Riverbend Health", document, { effort: scopedEffortForDocument(document), today: "2026-10-15" });
const text = (html: string) => html.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const bars = (document: EngagementDocument) => document.adoptionTimeline.lanes.flatMap(lane => lane.bars);
const windowOf = (document: EngagementDocument, id: string) => { const bar = bars(document).find(item => item.id === id); return bar ? barWindow(document.adoptionTimeline, bar) : null; };

describe("Parkview review: scope and sequencing", () => {
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
    expect(checked).toBe(plans.length);
    // The note reaches the customer document with the build date.
    expect(text(render(plans[1]))).toContain(`Platform build begins. ${NSX_VLAN_NOTE}`);
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
    // With the generated row hidden, CDW carries them as follow-on scope and the customer runs none.
    const hidden = twoSite();
    hidden.report.hiddenGenerated = [`customerOwnedWork:${customerRemainingWaves(hidden)!.label.toLowerCase()}`];
    const cdw = waves(hidden);
    expect(cdw.followOn).toBeGreaterThan(0);
    expect(cdw.customerRuns).toBe(false);
  });
});
