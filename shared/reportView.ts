import { barWindow } from "./buildingBlocks";
import { buildCustomerEffort, buildScopedEffort, withOwnership } from "./effort";
import { activityOwner, calculateEntitlementEndDate, effectivePlatformEdition, planOutcomeLabel, playbookPlanForFields, resolvePlanOutcomes, serverLabel, summarizeVcfCompatibility, type EngagementDocument } from "./fcp";
import { renewalStartsCurrentTerm } from "./deliveryBriefing";
import { backInTime } from "./hclCorpus";
import { ADD_ON_OUTCOMES, canonicalAddOn, completedReport, type ReportContent } from "./report";

/**
 * What the Condensed FCP generates from the plan when the planner has not written it, and the report the
 * document actually prints: generated rows the planner has not hidden or overridden, plus the planner's own rows.
 * The report content form and the renderer both use this, so the form shows exactly what will print.
 */

type Row<K extends keyof ReportContent> = ReportContent[K] extends Array<infer T> ? T : never;
export type GeneratedRow<T> = { key: string; row: T };

export type GeneratedReport = {
  headline: string;
  designProfile: Record<keyof ReportContent["designProfile"], string>;
  situation: Array<GeneratedRow<string>>;
  designElements: Array<GeneratedRow<Row<"designElements">>>;
  technicalItems: Array<GeneratedRow<Row<"technicalItems">>>;
  constraints: Array<GeneratedRow<Row<"constraints">>>;
  customerAsks: Array<GeneratedRow<string>>;
  personnel: Array<GeneratedRow<Row<"personnel">>>;
  customerOwnedWork: Array<GeneratedRow<Row<"customerOwnedWork">>>;
  openItems: Array<GeneratedRow<Row<"openItems">>>;
  milestonesToDate: Array<GeneratedRow<Row<"milestonesToDate">>>;
};
export type GeneratedSection = Exclude<keyof GeneratedReport, "headline" | "designProfile">;

export const DEFAULT_HEADLINE = "Amazing happens when the platform runs itself.";
export const SITE_PREREQUISITES_LABEL = "Site prerequisites and hardware evidence";
const SITE_ID = /^bar-(hcl-remediation|hcl-procurement|hcl-greenfield|soft-prerequisite-|networking-physical-fabric)/;

const parseIso = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
};
const shortDate = (value: string) => {
  const date = parseIso(value);
  return date ? `${date.getUTCDate()} ${new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date)} ${date.getUTCFullYear()}` : value;
};
const monthYear = (value: string) => {
  const date = parseIso(value);
  return date ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(date) : value;
};
const keyOf = (section: GeneratedSection, value: string) => `${section}:${value.trim().toLowerCase()}`;

export function platformName(document: EngagementDocument): string {
  const release = minimumTargetRelease(document)?.minimum ?? document.fields.compatibilityTargetRelease.replace(/^ESXi\s*/, "");
  return `${effectivePlatformEdition(document.fields) === "vvf" ? "VVF" : "VCF"} ${release}`;
}

/** Hosts on builds newer than the target's first release (8.0 U3j and later) need a later release to upgrade or converge (KB 450972, 454369). */
export function minimumTargetRelease(document: EngagementDocument): { minimum: string; hosts: number; sources: string[] } | null {
  const target = document.fields.compatibilityTargetRelease;
  const late = document.inventory.hclEvidence.hosts.map(host => backInTime(host.esxiVersion, target)).filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (!late.length) return null;
  const minimum = late.map(item => item.minimum).sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))[0];
  return { minimum, hosts: late.length, sources: Array.from(new Set(late.map(item => item.source))) };
}

/** The entitlement end the report works to: the stated term end, or start + 12 months. */
export function reportTermEnd(document: EngagementDocument): string | null {
  const { entitlement } = document.report;
  return entitlement.termEnd || calculateEntitlementEndDate(document.fields.entitlementStart) || null;
}

function requiredCores(document: EngagementDocument): number | null {
  const hosts = document.inventory.hclEvidence.hosts.filter(host => host.socketCount > 0 && host.coresPerSocket > 0);
  // VCF and VVF license at least 16 cores per CPU.
  return hosts.length ? hosts.reduce((total, host) => total + host.socketCount * Math.max(16, host.coresPerSocket), 0) : null;
}

const vmsBelowHardware19 = (document: EngagementDocument) => document.inventory.hclEvidence.vmInfo.filter(vm => {
  const version = Number(/(\d+)/.exec(vm.hardwareVersion)?.[1]);
  return version > 0 && version < 19;
}).length;
const onVsphere8 = (document: EngagementDocument) => document.inventory.esxiVersions.some(item => /\b8\.\d/.test(item.version));

export function generateReport(document: EngagementDocument): GeneratedReport {
  const { fields, inventory, report } = document;
  const customer = fields.customerName || "the customer";
  const outcomes = resolvePlanOutcomes(fields).outcomes;
  const outcomeKeys = new Set(outcomes.map(item => item.key));
  const vvf = effectivePlatformEdition(fields) === "vvf";
  const sites = inventory.datacenters || report.discovery.datacenters || 0;
  const path = playbookPlanForFields(fields).path;
  const discovery = report.discovery;
  const builds = path !== "design-only" && path !== "undecided";
  const moves = path === "greenfield" || path === "hybrid" || path === "in-place" || path === "converge" || path === "import-workload-domain";
  const inScope = (capability: string) => Array.from(outcomeKeys).some(key => key.startsWith(`${capability}:`));
  const overlay = outcomeKeys.has("networking:overlay-transport") || outcomeKeys.has("networking:vpc") || outcomeKeys.has("networking:edge-cluster-routing");

  // ---- Situation (from RVTools)
  const situation: string[] = [];
  if (inventory.hosts) {
    const vcenters = report.discovery.vcenters;
    situation.push(`${inventory.hosts} ESXi hosts · ${inventory.vmCount.toLocaleString("en-US")} VMs (${inventory.poweredOnVms.toLocaleString("en-US")} powered on)${vcenters ? ` across ${vcenters} vCenter${vcenters === 1 ? "" : "s"}` : ""}${inventory.clusters ? ` and ${inventory.clusters} cluster${inventory.clusters === 1 ? "" : "s"}` : ""}`);
    const models = inventory.hostModels.slice(0, 3).map(model => `${model.hosts} ${serverLabel(model.vendor, model.model)}`);
    if (models.length) situation.push(`Host platforms: ${models.join("; ")}`);
    const versions = inventory.esxiVersions.slice(0, 3).map(item => `${item.version} (${item.hosts})`);
    if (versions.length) situation.push(`ESXi versions in use: ${versions.join(", ")}`);
    if (inventory.datastoreCount) situation.push(`${inventory.datastoreCount} datastores, ${inventory.datastoreCapacityTiB.toLocaleString("en-US")} TiB capacity`);
    const oldHardware = vmsBelowHardware19(document);
    if (oldHardware) situation.push(`${oldHardware.toLocaleString("en-US")} VMs below VM hardware version 19`);
    if (onVsphere8(document)) situation.push("vSphere 8 reaches end of general support on 11 October 2027");
    // Estate health from RVTools: compute, memory, capacity and hosts that need attention before the work starts.
    const compute = [
      inventory.physicalCores ? `${inventory.physicalCores.toLocaleString("en-US")} physical cores` : "",
      inventory.vCpu ? `${inventory.vCpu.toLocaleString("en-US")} vCPU${inventory.physicalCores ? ` (${(inventory.vCpu / inventory.physicalCores).toFixed(1)} per core)` : ""}` : "",
      inventory.vmMemoryGiB ? `${Math.round(inventory.vmMemoryGiB).toLocaleString("en-US")} GiB VM memory` : "",
      inventory.datastoreUsedTiB ? `${inventory.datastoreUsedTiB.toLocaleString("en-US")} TiB of storage used` : "",
    ].filter(Boolean);
    if (compute.length) situation.push(`Estate size: ${compute.join(", ")}`);
    const attention = [
      inventory.poweredOffVms ? `${inventory.poweredOffVms.toLocaleString("en-US")} powered-off VMs to confirm or retire` : "",
      inventory.snapshotCount ? `${inventory.snapshotCount.toLocaleString("en-US")} VM snapshots to clear before migration` : "",
      inventory.maintenanceHosts ? `${inventory.maintenanceHosts} host${inventory.maintenanceHosts === 1 ? "" : "s"} in maintenance mode` : "",
      inventory.disconnectedHosts ? `${inventory.disconnectedHosts} disconnected host${inventory.disconnectedHosts === 1 ? "" : "s"}` : "",
      inventory.highCpuHosts ? `${inventory.highCpuHosts} host${inventory.highCpuHosts === 1 ? "" : "s"} running high on CPU` : "",
      inventory.highMemoryHosts ? `${inventory.highMemoryHosts} host${inventory.highMemoryHosts === 1 ? "" : "s"} running high on memory` : "",
      inventory.overcommittedDatastores ? `${inventory.overcommittedDatastores} overcommitted datastore${inventory.overcommittedDatastores === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    if (attention.length) situation.push(`Estate health: ${attention.join("; ")}`);
    const guests = inventory.guestOperatingSystems.slice().sort((left, right) => right.vms - left.vms).slice(0, 3).map(item => `${item.name} (${item.vms.toLocaleString("en-US")})`);
    if (guests.length) situation.push(`Most common guest operating systems: ${guests.join(", ")}`);
  }

  // ---- Design elements
  const designElements: Array<Row<"designElements">> = [];
  if (!inventory.hosts) designElements.push({ component: "Inventory", requirement: "Sizing needs the current estate.", recommendation: "Provide an RVTools export of every in-scope vCenter.", gate: "a current RVTools export" });
  const storage = fields.adoptionDetails.principalStorage;
  const storageText: Record<string, [string, string]> = {
    vsan: ["vSAN is the principal storage for the management domain and new clusters.", "Size vSAN ESA from the estate and validate ReadyNode configurations."],
    "nfs-v3": ["NFS v3 is a supported principal storage type; the datastore must exist and be mounted on all hosts first.", "Keep the existing NFS storage; confirm the export and host access before the build."],
    "vmfs-fc": ["VMFS on Fibre Channel is a supported management-domain storage type; the datastore must be created and mounted on all hosts first.", "Keep the existing array over Fibre Channel; no vSAN needed."],
    "other-existing": ["Existing storage must be validated against the supported principal storage types.", "Confirm the storage workflow in design."],
  };
  if (storageText[storage]) designElements.push({ component: "Principal storage", requirement: storageText[storage][0], recommendation: storageText[storage][1], gate: null });
  if (!vvf) {
    designElements.push(overlay
      ? discovery.jumboFrames === true
        ? { component: "Networking", requirement: "Workload traffic on distributed switches; the overlay needs an MTU of 1,600 or more.", recommendation: "Jumbo frames are already enabled; confirm the transport VLANs carry them end to end before the overlay is enabled.", gate: null }
        : { component: "Networking", requirement: "Workload traffic on distributed switches; the overlay needs an MTU of 1,600 or more.", recommendation: `${discovery.jumboFrames === false ? "Jumbo frames are not enabled today; raise" : "Confirm"} the MTU end to end and the transport VLANs before the overlay is enabled.`, gate: "MTU confirmed" }
      : { component: "Networking", requirement: "NSX is deployed with VCF; workloads can stay VLAN-backed.", recommendation: "Start VLAN-backed; consider overlay networking in a later phase.", gate: null });
  }
  const required = requiredCores(document);
  const licensed = report.discovery.licensedCores ?? report.discovery.coreCount;
  if (required) {
    designElements.push({
      component: "Licensing",
      requirement: "16-core-per-CPU minimum per licensed core.",
      // Licensed cores beyond what the imported hosts need are only unmatched: they may cover hosts in a vCenter that was not exported.
      recommendation: licensed
        ? licensed === required
          ? `${licensed.toLocaleString("en-US")} licensed cores on record, matching the ${required.toLocaleString("en-US")} the ${inventory.hosts} hosts in these RVTools exports require.`
          : licensed > required
          ? `${licensed.toLocaleString("en-US")} licensed cores on record; the ${inventory.hosts} hosts in these RVTools exports require ${required.toLocaleString("en-US")}. The other ${(licensed - required).toLocaleString("en-US")} are not matched to these hosts; confirm which hosts they cover before treating any as available.`
          : `${licensed.toLocaleString("en-US")} licensed cores on record against ${required.toLocaleString("en-US")} required for the ${inventory.hosts} hosts in these RVTools exports (${(required - licensed).toLocaleString("en-US")} short).`
        : `${required.toLocaleString("en-US")} cores required for the ${inventory.hosts} hosts; licensed core count to be confirmed.`,
      gate: !licensed ? "licensed core count confirmed" : licensed > required ? "licensed cores reconciled to every in-scope host" : null,
    });
  }
  const oldHardware = vmsBelowHardware19(document);
  if (oldHardware) designElements.push({ component: "Workloads", requirement: "Supported guest operating systems and VM hardware.", recommendation: `Remediate ${oldHardware.toLocaleString("en-US")} VMs below hardware version 19 ahead of their migration waves.`, gate: null });

  // Discovery answers that change the design, only where the plan makes them matter.
  const serverModels = summarizeVcfCompatibility(document.readiness.hardwarePlatforms);
  if (builds && (discovery.serverVendor || serverModels.length)) {
    // Images are built only for the server models the compatibility check lists for every host; the rest are a gate.
    // A model can split by CPU, so it counts as listed only when all of its hosts are.
    const models = new Map<string, { label: string; hosts: number; listedHosts: number }>();
    for (const item of serverModels) {
      const label = serverLabel(item.vendor, item.model);
      const entry = models.get(label.toLowerCase()) ?? { label, hosts: 0, listedHosts: 0 };
      entry.hosts += item.hosts;
      if (item.decision === "eligible") entry.listedHosts += item.hosts;
      models.set(label.toLowerCase(), entry);
    }
    const listed = Array.from(models.values()).filter(item => item.listedHosts === item.hosts);
    const notListed = Array.from(models.values()).filter(item => item.listedHosts < item.hosts);
    const unlisted = (item: { hosts: number; listedHosts: number }) => item.hosts - item.listedHosts;
    const notListedNames = notListed.map(item => `${item.label} (${item.listedHosts ? `${unlisted(item)} of ${item.hosts} hosts, by CPU` : `${item.hosts} host${item.hosts === 1 ? "" : "s"}`})`).join(", ");
    const vendor = discovery.serverVendor || Array.from(new Set(serverModels.map(item => serverLabel(item.vendor, "")))).join(" and ");
    designElements.push({
      component: "Hardware lifecycle",
      requirement: `Hosts are ${vendor}; vLCM images manage firmware and drivers with the ESX image.`,
      recommendation: !serverModels.length
        ? `Build the cluster images with the ${vendor} vendor add-on and hardware support manager once the compatibility check confirms the host models.`
        : `${listed.length ? `Build the cluster images with the vendor add-on and hardware support manager for the models the compatibility check lists: ${listed.map(item => item.label).join(", ")}.` : "No host model is confirmed for the target release yet."}${notListed.length ? ` Not confirmed for the target release: ${notListedNames}. Replace these hosts or confirm support before they join a cluster.` : ""}`,
      gate: !serverModels.length ? "compatibility check run on a current RVTools export" : notListed.length ? "support confirmed or hardware replaced for every host model" : null,
    });
  }
  if (moves && discovery.backup) designElements.push({ component: "Backup", requirement: `${discovery.backup} protects the workloads moving to the new platform.`, recommendation: `Confirm ${discovery.backup} supports the target vSphere and VCF release before the first wave; re-point jobs as each wave lands.`, gate: "backup support confirmed" });
  if (inScope("resilience") && discovery.drSolution) designElements.push({ component: "Disaster recovery", requirement: `Recovery runs on ${discovery.drSolution} today.`, recommendation: "The recovery design decides whether VMware Live Recovery replaces it or runs alongside, and sets the recovery objectives.", gate: null });
  if (inScope("security") && discovery.securityTooling) designElements.push({ component: "Security tooling", requirement: `${discovery.securityTooling} stays in place.`, recommendation: "Design vDefend policy alongside the existing tooling so controls do not overlap or conflict.", gate: null });
  if (inScope("kubernetes") && discovery.containerPlatform) designElements.push({ component: "Containers", requirement: `${discovery.containerPlatform} runs containers today.`, recommendation: "Decide in design which clusters move to the Supervisor and VKS and which stay where they are.", gate: null });
  if (discovery.edgeSites) designElements.push({ component: "Edge sites", requirement: `${discovery.edgeSites} edge site${discovery.edgeSites === 1 ? "" : "s"} in the estate.`, recommendation: "Decide in design whether each edge site joins the fleet or stays on its current platform.", gate: null });

  // ---- Technical items
  const technicalItems: Array<Row<"technicalItems">> = [];
  if (onVsphere8(document)) technicalItems.push({ item: "vSphere 8 end of general support 11 October 2027", reference: "Broadcom Product Lifecycle" });
  if (!vvf && (path === "greenfield" || path === "hybrid" || path === "converge")) technicalItems.push({ item: "The VCF Installer deploys vCenter, NSX and VCF Operations with the management domain", reference: "VCF documentation > Overview > VCF Installer Overview" });
  if (path === "converge" || path === "import-workload-domain") technicalItems.push({ item: `Convergence blockers closed: ${discovery.enhancedLinkedMode === false ? "" : "Enhanced Linked Mode removed, "}vLCM images, no vCenter HA, DRS fully automated`, reference: "VCF documentation > Deployment > Supported and not supported configurations" });

  // ---- Sequencing constraints
  const timeline = document.adoptionTimeline;
  const handover = timeline.lanes.flatMap(lane => lane.bars).find(bar => bar.id === "bar-platform-handover");
  const handoverWindow = handover ? barWindow(timeline, handover) : null;
  const termEnd = reportTermEnd(document);
  const constraints: Array<Row<"constraints">> = [{ constraint: "Design and a current inventory before the build", imposedBy: "Sizing", effect: "Build starts after design sign-off" }];
  if (path === "greenfield" || path === "hybrid") constraints.push({ constraint: "Management domain before any workload moves", imposedBy: "Platform", effect: "Proving wave follows the build" });
  if (inventory.hclEvidence.vmInfo.length) constraints.push({ constraint: "Guest OS and VM hardware remediation before each wave", imposedBy: "Platform", effect: `${customer} remediates ahead of its waves` });
  for (const outcome of outcomes.filter(item => item.requiredBy.length).slice(0, 3)) {
    constraints.push({ constraint: `${planOutcomeLabel(outcome.key)} before ${outcome.requiredBy.map(key => planOutcomeLabel(key)).join(" and ")}`, imposedBy: "Platform", effect: "Sequenced as a prerequisite" });
  }
  if ((path === "converge" || path === "import-workload-domain") && discovery.enhancedLinkedMode === true) constraints.push({ constraint: "Enhanced Linked Mode split before convergence", imposedBy: "Platform", effect: "vCenters leave the linked group before they join VCF" });
  const today = report.asOf || new Date().toISOString().slice(0, 10);
  // A renewal that opened the current term is neither a deadline nor a lapsed renewal.
  const termRenewal = renewalStartsCurrentTerm(document);
  const renewalPassed = Boolean(discovery.renewalDate && discovery.renewalDate < today && !termRenewal);
  if (discovery.renewalDate && !renewalPassed && !termRenewal) constraints.push({ constraint: `Subscription renewal ${shortDate(discovery.renewalDate)}`, imposedBy: "Licensing", effect: "Licensing activated and the renewal sized before that date" });
  if (fields.hardwareAvailability === "new" && fields.hardwareLeadWeeks > 0) constraints.push({ constraint: `New hardware lead time of ${fields.hardwareLeadWeeks} week${fields.hardwareLeadWeeks === 1 ? "" : "s"}`, imposedBy: "Hardware", effect: "The platform build waits for delivery, rack and stack" });
  if (fields.plannedImplementationStart) constraints.push({ constraint: `Implementation services start ${shortDate(fields.plannedImplementationStart)}`, imposedBy: customer, effect: "Design runs from the project start; build, upgrade and migration begin on this date" });
  if (fields.timelineNotes.trim()) constraints.push({ constraint: fields.timelineNotes.trim(), imposedBy: "Calendar", effect: "Applied to the schedule of every affected work package" });
  if (fields.adoptionDetails.notes.trim()) constraints.push({ constraint: fields.adoptionDetails.notes.trim(), imposedBy: "Planning note", effect: "Applied to the design and the work packages it affects" });
  if (termEnd) constraints.push({ constraint: `Entitlement expiry ${shortDate(termEnd)}`, imposedBy: "Entitlement term", effect: handoverWindow ? `Handover completes in ${monthYear(handoverWindow.end)}` : "All hours consumed before expiry" });

  // ---- Asks of the customer's team
  const { phases, peak } = buildCustomerEffort(document);
  const customerAsks: string[] = [];
  if (peak) customerAsks.push(`Effort: ${Math.min(...phases.map(phase => phase.total))}–${peak.total} hours per week, peaking at ${peak.fte} FTE during ${peak.phase.toLowerCase()}`);
  if (!inventory.hosts) customerAsks.push("Inventory: a current RVTools export");

  // ---- People by work stream (names to be filled in)
  const personnel = buildScopedEffort(document).rows.map(row => ({ workstream: row.workstream, cdw: [] as string[], broadcom: [] as string[], customer: [] as string[] }));

  // ---- Customer-owned work from the plan
  // Work packages the customer carries: the default site work as one span, anything else the planner gave the customer by name.
  const customerBars = withOwnership(document).adoptionTimeline.lanes.flatMap(lane => lane.bars).filter(bar => activityOwner(bar) === "customer");
  const windowsOf = (bars: typeof customerBars) => bars.flatMap(bar => { const window = barWindow(timeline, bar); return window ? [window] : []; });
  const siteWindows = windowsOf(customerBars.filter(bar => SITE_ID.test(bar.id)));
  const customerOwnedWork: Array<Row<"customerOwnedWork">> = [
    ...(siteWindows.length ? [{ label: SITE_PREREQUISITES_LABEL, start: siteWindows.map(window => window.start).sort()[0].slice(0, 7), end: siteWindows.map(window => window.end).sort().at(-1)!.slice(0, 7) }] : []),
    ...customerBars.filter(bar => !SITE_ID.test(bar.id)).flatMap(bar => { const window = barWindow(timeline, bar); return window ? [{ label: bar.label, start: window.start.slice(0, 7), end: window.end.slice(0, 7) }] : []; }),
  ];

  // ---- Open items for what is still missing
  const openItems: Array<Row<"openItems">> = [];
  if (!inventory.hosts) openItems.push({ item: "Current RVTools export", gates: "Design sign-off and sizing", owner: "" });
  for (const purchased of discovery.addOnsPurchased) {
    const key = canonicalAddOn(purchased);
    const addOn = key ? ADD_ON_OUTCOMES[key] : null;
    const planned = addOn?.priority && addOn.focus ? addOn.focus.some(focus => outcomeKeys.has(`${addOn.priority}:${focus}`)) : false;
    if (!planned) openItems.push({ item: `${addOn?.label ?? purchased} is purchased but not in this plan`, gates: "Scope: add it or record why it waits", owner: "" });
  }
  if (!report.entitlement.hours) openItems.push({ item: "Entitled hours from the signed resource assignments", gates: "Burndown and weekly pace", owner: "" });
  if (renewalPassed) openItems.push({ item: `The subscription renewal date on record (${shortDate(discovery.renewalDate!)}) has passed: confirm the renewal and the new term`, gates: "Licensing activation and core sizing", owner: "" });
  // Licensed cores the imported hosts do not account for usually mean an estate that was not exported.
  if (required && licensed && licensed > required) openItems.push({ item: `${(licensed - required).toLocaleString("en-US")} licensed cores are not matched to the hosts in these RVTools exports`, gates: "Licensing sizing; confirm whether another vCenter needs an RVTools export", owner: "" });
  const exported = document.inventorySources.filter(source => /\.xlsx?$/i.test(source.filename)).length;
  if (discovery.vcenters && exported && exported < discovery.vcenters) openItems.push({ item: `RVTools exports for ${exported} of ${discovery.vcenters} vCenters`, gates: "Sizing, compatibility and licensing for the vCenters not exported", owner: "" });

  // ---- Milestones from the engagement dates
  const milestonesToDate: Array<Row<"milestonesToDate">> = [];
  if (fields.entitlementStart) milestonesToDate.push({ date: fields.entitlementStart, event: "Entitlement effective", detail: report.entitlement.hours ? `${report.entitlement.hours}-hour services entitlement opened.` : "Services entitlement opened." });

  const profile = (key: keyof ReportContent["designProfile"]): string => {
    switch (key) {
      case "consumption": return `${platformName(document)} with VCF Operations as the daily operations console${outcomes.some(item => item.key.startsWith("automation:")) ? "; self-service through VCF Automation" : "; automation evaluated later"}.`;
      case "physicalSite": return sites ? `${sites} site${sites === 1 ? "" : "s"}${inventory.hosts ? `, ${inventory.hosts} hosts in the current estate` : ""}.` : "Sites to be confirmed in design.";
      case "availability": return fields.adoptionDetails.domainTopology === "consolidated" ? "Consolidated management domain: management components and workloads share the cluster; HA and fully automated DRS retained." : fields.adoptionDetails.domainTopology === "standard" ? "Standard architecture: a dedicated management domain and separate workload domains." : "Management domain topology to be decided in design.";
      case "isolation": return vvf ? "vSphere Distributed Switch networking; no NSX overlay in VVF." : outcomeKeys.has("networking:overlay-transport") || outcomeKeys.has("networking:vpc") ? "NSX deployed with VCF, with overlay networking in scope." : "NSX deployed with VCF, VLAN-backed at first; no network redesign on day one.";
      case "recoverability": return outcomes.some(item => item.key.startsWith("resilience:")) ? "Recovery design with VMware Live Recovery; recovery objectives set in design." : "Recovery approach to be confirmed in design.";
      default: return "Capacity added wave by wave as hosts are evacuated and rebuilt into the platform.";
    }
  };

  return {
    headline: DEFAULT_HEADLINE,
    designProfile: { consumption: profile("consumption"), physicalSite: profile("physicalSite"), availability: profile("availability"), isolation: profile("isolation"), recoverability: profile("recoverability"), expansion: profile("expansion") },
    situation: situation.map(row => ({ key: keyOf("situation", row), row })),
    designElements: designElements.map(row => ({ key: keyOf("designElements", row.component), row })),
    technicalItems: technicalItems.map(row => ({ key: keyOf("technicalItems", row.item), row })),
    constraints: constraints.map(row => ({ key: keyOf("constraints", row.constraint), row })),
    customerAsks: customerAsks.map(row => ({ key: keyOf("customerAsks", row.split(":")[0]), row })),
    personnel: personnel.map(row => ({ key: keyOf("personnel", row.workstream), row })),
    customerOwnedWork: customerOwnedWork.map(row => ({ key: keyOf("customerOwnedWork", row.label), row })),
    openItems: openItems.map(row => ({ key: keyOf("openItems", row.item), row })),
    milestonesToDate: milestonesToDate.map(row => ({ key: keyOf("milestonesToDate", row.event), row })),
  };
}

/** The planner's row that replaces a generated one, matched on the row's identifying field. */
const OVERRIDE_FIELD: Partial<Record<GeneratedSection, string>> = {
  designElements: "component",
  personnel: "workstream",
  constraints: "constraint",
  technicalItems: "item",
  customerOwnedWork: "label",
  openItems: "item",
  milestonesToDate: "event",
};

/** Generated rows still in the report: not hidden by the planner and not replaced by a planner row with the same name. */
export function visibleGenerated<S extends GeneratedSection>(document: EngagementDocument, generated: GeneratedReport, section: S): GeneratedReport[S] {
  const hidden = new Set(document.report.hiddenGenerated);
  const field = OVERRIDE_FIELD[section];
  const own = (document.report[section] as unknown as Array<Record<string, unknown>>);
  const replaced = new Set(field ? own.map(row => String(row[field] ?? "").trim().toLowerCase()).filter(Boolean) : []);
  return (generated[section] as Array<GeneratedRow<any>>).filter(item => !hidden.has(item.key) && !(field && replaced.has(String(item.row[field]).trim().toLowerCase()))) as GeneratedReport[S];
}

/** The report as it prints: generated rows (unless hidden or overridden) followed by the planner's completed rows. */
export function effectiveReport(document: EngagementDocument): ReportContent {
  const generated = generateReport(document);
  const own = completedReport(document.report);
  const merge = <S extends GeneratedSection>(section: S) => [
    ...(visibleGenerated(document, generated, section) as Array<GeneratedRow<any>>).map(item => item.row),
    ...(own[section] as unknown[]),
  ] as ReportContent[S];
  return {
    ...own,
    headline: own.headline || generated.headline,
    designProfile: Object.fromEntries(Object.entries(generated.designProfile).map(([key, value]) => [key, own.designProfile[key as keyof ReportContent["designProfile"]] || value])) as ReportContent["designProfile"],
    situation: merge("situation"),
    designElements: merge("designElements"),
    technicalItems: merge("technicalItems"),
    constraints: merge("constraints"),
    customerAsks: merge("customerAsks"),
    personnel: merge("personnel"),
    customerOwnedWork: merge("customerOwnedWork"),
    openItems: merge("openItems"),
    milestonesToDate: merge("milestonesToDate").sort((left, right) => left.date.localeCompare(right.date)),
  };
}
