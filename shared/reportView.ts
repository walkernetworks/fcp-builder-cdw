import { barWindow } from "./buildingBlocks";
import { buildCustomerEffort, buildScopedEffort, customerRemainingWaves, WAVES_LABEL, withOwnership } from "./effort";
import { activityOwner, calculateEntitlementEndDate, effectiveDeliveryPath, effectivePlatformEdition, planOutcomeLabel, playbookPlanForFields, resolvePlanOutcomes, serverLabel, summarizeVcfCompatibility, usesVdefend, type EngagementDocument } from "./fcp";
import { renewalStartsCurrentTerm } from "./deliveryBriefing";
import { backInTime } from "./hclCorpus";
import { MTU_REQUIREMENT_SOURCE, NSX_TEP_MIN_MTU, RECOMMENDED_MTU, VDS_REQUIREMENT } from "./hcl";
import { ADD_ON_OUTCOMES, canonicalAddOn, completedReport, VSPHERE8_STRATEGY_TEXT, type ReportContent } from "./report";

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
/** True when the term end is calculated as 12 months from the start rather than stated in the brief or work plan. */
export function termEndAssumed(document: EngagementDocument): boolean {
  return !document.report.entitlement.termEnd && Boolean(calculateEntitlementEndDate(document.fields.entitlementStart));
}

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

/**
 * Each host model in exactly one group: blocked (some hosts not listed for the target release), to confirm (a CPU row
 * or the model name still to confirm), or listed. A model that splits by CPU is grouped by its weakest result.
 */
export function hardwareGroups(document: EngagementDocument) {
  type Entry = { label: string; hosts: number; blocked: number; toConfirm: number; nameToConfirm: boolean };
  const models = new Map<string, Entry>();
  for (const item of summarizeVcfCompatibility(document.readiness.hardwarePlatforms)) {
    const label = serverLabel(item.vendor, item.model);
    const key = normalizedModel(label);
    const entry = models.get(key) ?? { label, hosts: 0, blocked: 0, toConfirm: 0, nameToConfirm: false };
    entry.hosts += item.hosts;
    if (item.decision === "action-required") entry.blocked += item.hosts;
    if (item.decision === "validation-required") entry.toConfirm += item.hosts;
    if (item.evidenceState === "identity-confirmation-required") entry.nameToConfirm = true;
    models.set(key, entry);
  }
  const all = Array.from(models.values());
  return {
    blocked: all.filter(item => item.blocked > 0),
    toConfirm: all.filter(item => item.blocked === 0 && item.toConfirm > 0),
    listed: all.filter(item => item.blocked === 0 && item.toConfirm === 0),
  };
}

/** A server model compared without its vendor name, so "HPE Synergy 480 Gen10" and "Synergy 480 Gen10" are one model. */
export function normalizedModel(label: string): string {
  return label.toLowerCase().replace(/^(hpe|hp|dell( inc\.?)?|lenovo|cisco( systems)?( inc\.?)?)\s+/, "").replace(/\s+/g, " ").trim();
}

/** The packages that start the platform build, first match wins: the first management domain or foundation, then any build or wave. */
const BUILD_START = [/^bar-(management-domain|converge-management-domain|vvf-foundation|in-place-preparation|import-foundation-validation)$/, /^bar-(management-domain|workload-domain|import-domain|import-workload-domain)(-\d+)?$|^bar-playbook-execution-/];

/**
 * When implementation services start (design and planning) and when the platform build begins (the first management
 * domain or foundation package). Key Dates and the sequencing constraint both read these.
 */
export function planKeyDates(document: EngagementDocument): { implementationStart: string; buildStart: string | null; buildLater: boolean } {
  const timeline = document.adoptionTimeline;
  const all = timeline.lanes.flatMap(lane => lane.bars);
  const starts = (pattern: RegExp) => all.filter(bar => pattern.test(bar.id)).map(bar => barWindow(timeline, bar)?.start).filter((start): start is string => Boolean(start)).sort();
  const buildStart = BUILD_START.map(starts).find(found => found.length)?.[0] ?? null;
  const implementationStart = document.fields.plannedImplementationStart;
  return { implementationStart, buildStart, buildLater: Boolean(buildStart && implementationStart && buildStart.slice(0, 7) > implementationStart.slice(0, 7)) };
}

/** The overlay MTU requirement, from the same constants the host findings use. */
const OVERLAY_MTU_REQUIREMENT = `Workload traffic on distributed switches (${VDS_REQUIREMENT}); NSX TEP traffic needs an MTU of at least ${NSX_TEP_MIN_MTU.toLocaleString("en-US")} end to end, with ${RECOMMENDED_MTU.toLocaleString("en-US")} recommended.`;

/** vSphere 8 reaches end of general support on this date. */
export const VSPHERE8_EOGS = "2027-10-11";
/** The default owner of a platform item the plan raises. */
export const PLATFORM_OWNER = (customer: string) => `${customer} infrastructure team with CDW`;

/**
 * Hosts still on vSphere 8 and whether any wave (CDW-led or run by the customer's team) ends after vSphere 8 general
 * support ends. Null when no host is on vSphere 8 or the plan moves nothing.
 */
export function vsphere8Exposure(document: EngagementDocument): { hosts: number; where: string; lastWave: string | null; after: boolean; strategy: ReportContent["discovery"]["vsphere8Strategy"] } | null {
  const { inventory, fields, report } = document;
  const path = playbookPlanForFields(fields).path;
  const hosts = inventory.esxiVersions.filter(item => /\b8\.\d/.test(item.version)).reduce((sum, item) => sum + item.hosts, 0);
  if (!hosts || !["greenfield", "hybrid", "in-place", "converge", "import-workload-domain"].includes(path)) return null;
  const clusters = Array.from(new Set(inventory.hclEvidence.hosts.filter(host => /\b8\.\d/.test(host.esxiVersion)).map(host => host.cluster).filter(Boolean)));
  const where = clusters.length ? ` (${clusters.slice(0, 3).join(", ")}${clusters.length > 3 ? ` and ${clusters.length - 3} more clusters` : ""})` : "";
  // The customer's waves: its own rows, or the plan's generated row unless the planner hid it.
  const own = completedReport(report).customerOwnedWork.filter(row => WAVES_LABEL.test(row.label));
  const generated = customerRemainingWaves(document);
  const customerWaves = own.length ? own : generated && !report.hiddenGenerated.includes(`customerOwnedWork:${generated.label.trim().toLowerCase()}`) ? [generated] : [];
  // CDW's waves in the entitlement; its waves in the Two-Year Notional only when the customer's team runs none, since
  // otherwise the customer's waves are the remaining waves (they are never counted twice).
  const cdwWaves = (customerWaves.length ? [document.adoptionTimeline] : [document.adoptionTimeline, document.twoYearPlan]).flatMap(timeline => timeline.lanes.flatMap(lane => lane.bars).filter(bar => /^bar-playbook-execution-/.test(bar.id)).map(bar => barWindow(timeline, bar)?.end ?? ""));
  const lastWave = [...customerWaves.map(row => row.end), ...cdwWaves].filter(Boolean).map(value => value.slice(0, 7)).sort().at(-1) ?? null;
  return { hosts, where, lastWave, after: Boolean(lastWave && lastWave > VSPHERE8_EOGS.slice(0, 7)), strategy: report.discovery.vsphere8Strategy };
}

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
    // Every host in vHost counts, maintenance-mode and disconnected hosts included; a model reported under several
    // names or CPUs ("HPE Synergy 480 Gen10", "Synergy 480 Gen10") is one model.
    const byModel = new Map<string, { label: string; hosts: number }>();
    for (const model of inventory.hostModels) {
      const label = serverLabel(model.vendor, model.model);
      const entry = byModel.get(normalizedModel(label)) ?? { label, hosts: 0 };
      entry.hosts += model.hosts;
      byModel.set(normalizedModel(label), entry);
    }
    const models = Array.from(byModel.values()).sort((left, right) => right.hosts - left.hosts).slice(0, 3).map(model => `${model.hosts} ${model.label}`);
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
        ? { component: "Networking", requirement: OVERLAY_MTU_REQUIREMENT, recommendation: "Jumbo frames are already enabled; confirm the transport VLANs carry them end to end before the overlay is enabled.", gate: null }
        : { component: "Networking", requirement: OVERLAY_MTU_REQUIREMENT, recommendation: `${discovery.jumboFrames === false ? "Jumbo frames are not enabled today; raise" : discovery.jumboFrames === "mixed" ? "Jumbo frames run on some switches only; confirm" : "Confirm"} the MTU end to end and the transport VLANs before the overlay is enabled.`, gate: "MTU confirmed" }
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
    // Images are built for models listed for the target release, including those whose CPU row still needs
    // confirming; models that are blocked or not listed are a gate. A model can split by CPU, so it is grouped by its
    // weakest result and the hosts behind each result are named.
    const groups = hardwareGroups(document);
    const count = (part: number, whole: number) => (part === whole ? `${whole} host${whole === 1 ? "" : "s"}` : `${part} of ${whole} hosts, by CPU`);
    const { listed, toConfirm, blocked } = groups;
    // Images are built for listed models, including those whose CPU row is still to confirm; a model whose name is
    // still to confirm is not listed yet.
    const imageModels = [...listed, ...toConfirm.filter(item => !item.nameToConfirm)];
    const vendor = discovery.serverVendor || Array.from(new Set(serverModels.map(item => serverLabel(item.vendor, "")))).join(" and ");
    designElements.push({
      component: "Hardware lifecycle",
      requirement: `Hosts are ${vendor}; vLCM images manage firmware and drivers with the ESX image.`,
      recommendation: !serverModels.length
        ? `Build the cluster images with the ${vendor} vendor add-on and hardware support manager once the compatibility check confirms the host models.`
        : [
          imageModels.length ? `Build the cluster images with the vendor add-on and hardware support manager for the models listed for the target release: ${imageModels.map(item => item.label).join(", ")}.` : "No host model is listed for the target release yet.",
          toConfirm.some(item => !item.nameToConfirm) ? `Listed, with the CPU row to confirm against the current Compatibility Guide: ${toConfirm.filter(item => !item.nameToConfirm).map(item => `${item.label} (${count(item.toConfirm, item.hosts)})`).join(", ")}.` : "",
          toConfirm.some(item => item.nameToConfirm) ? `To confirm the exact model name with the vendor: ${toConfirm.filter(item => item.nameToConfirm).map(item => `${item.label} (${count(item.toConfirm, item.hosts)})`).join(", ")}.` : "",
          blocked.length ? `Blocked or not listed for the target release: ${blocked.map(item => `${item.label} (${count(item.blocked, item.hosts)})`).join(", ")}. Replace these hosts or confirm support before they join a cluster.` : "",
        ].filter(Boolean).join(" "),
      gate: !serverModels.length ? "compatibility check run on a current RVTools export" : blocked.length ? "support confirmed or hardware replaced for every host model" : toConfirm.length ? "CPU rows confirmed for every host model" : null,
    });
  }
  if (moves && discovery.backup) designElements.push({ component: "Backup", requirement: `${discovery.backup} protects the workloads moving to the new platform.`, recommendation: `Confirm ${discovery.backup} supports the target vSphere and VCF release before the first wave; re-point jobs as each wave lands.`, gate: "backup support confirmed" });
  if (inScope("resilience") && discovery.drSolution) designElements.push({ component: "Disaster recovery", requirement: `Recovery runs on ${discovery.drSolution} today.`, recommendation: "The recovery design decides whether VMware Live Recovery replaces it or runs alongside, and sets the recovery objectives.", gate: null });
  if (inScope("security") && discovery.securityTooling) designElements.push({ component: "Security tooling", requirement: `${discovery.securityTooling} stays in place.`, recommendation: usesVdefend(fields) ? "Design vDefend policy alongside the existing tooling so controls do not overlap or conflict." : "Design the identity, access and hardening controls alongside the existing tooling so they do not overlap or conflict.", gate: null });
  if (inScope("kubernetes") && discovery.containerPlatform) designElements.push({ component: "Containers", requirement: `${discovery.containerPlatform} runs containers today.`, recommendation: "Decide in design which clusters move to the Supervisor and VKS and which stay where they are.", gate: null });
  if (discovery.edgeSites) designElements.push({ component: "Edge sites", requirement: `${discovery.edgeSites} edge site${discovery.edgeSites === 1 ? "" : "s"} in the estate.`, recommendation: "Decide in design whether each edge site joins the fleet or stays on its current platform.", gate: null });

  // ---- Technical items
  const technicalItems: Array<Row<"technicalItems">> = [];
  if (onVsphere8(document)) technicalItems.push({ item: "vSphere 8 end of general support 11 October 2027", reference: "Broadcom Product Lifecycle" });
  if (!vvf && (path === "greenfield" || path === "hybrid" || path === "converge")) technicalItems.push({ item: "The VCF Installer deploys vCenter, NSX and VCF Operations with the management domain", reference: "VCF documentation > Overview > VCF Installer Overview" });
  // The brief's own MTU item, when it has one, already states this requirement.
  if (!vvf && builds && !report.technicalItems.some(item => /\bMTU\b/i.test(item.item))) technicalItems.push({ item: `NSX TEP traffic needs an MTU of at least ${NSX_TEP_MIN_MTU} end to end, with ${RECOMMENDED_MTU} recommended; hosts join VCF on a distributed switch (${VDS_REQUIREMENT})`, reference: MTU_REQUIREMENT_SOURCE });
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
  const keyDates = planKeyDates(document);
  if (keyDates.implementationStart) constraints.push(keyDates.buildLater
    ? { constraint: `Implementation services start ${shortDate(keyDates.implementationStart)} with design and planning; the platform build begins ${shortDate(keyDates.buildStart!)}`, imposedBy: customer, effect: "Design and planning run from the project start; build, upgrade and migration begin with the platform build" }
    : { constraint: `Implementation services start ${shortDate(keyDates.implementationStart)}`, imposedBy: customer, effect: "Design runs from the project start; build, upgrade and migration begin on this date" });
  if (fields.timelineNotes.trim()) constraints.push({ constraint: fields.timelineNotes.trim(), imposedBy: "Calendar", effect: "Applied to the schedule of every affected work package" });
  if (fields.adoptionDetails.notes.trim()) constraints.push({ constraint: fields.adoptionDetails.notes.trim(), imposedBy: "Planning note", effect: "Applied to the design and the work packages it affects" });
  if (termEnd) constraints.push({ constraint: `Entitlement expiry ${shortDate(termEnd)}${termEndAssumed(document) ? " (12 months from the start; to be confirmed)" : ""}`, imposedBy: "Entitlement term", effect: handoverWindow ? `Handover completes in ${monthYear(handoverWindow.end)}` : "All hours consumed before expiry" });

  // ---- Asks of the customer's team
  // The generated customer-run waves count toward the customer's effort too.
  const generatedWaves = customerRemainingWaves(document);
  const { phases, peak } = buildCustomerEffort(generatedWaves && !report.customerOwnedWork.some(row => /\bwaves?\b/i.test(row.label)) ? { ...document, report: { ...report, customerOwnedWork: [...report.customerOwnedWork, generatedWaves] } } : document);
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
    // CDW proves the runbook on the first waves; the customer's team runs the rest, unless the planner already planned them.
    ...(() => { const waves = customerRemainingWaves(document); return waves && !report.customerOwnedWork.some(row => /\bwaves?\b/i.test(row.label)) ? [waves] : []; })(),
  ];

  // ---- Open items for what is still missing
  const openItems: Array<Row<"openItems">> = [];
  // vSphere 8 end of general support: one finding drives both the constraint and the open item, so they always agree.
  // Waves that all end in time need neither row.
  const vsphere8 = vsphere8Exposure(document);
  if (vsphere8?.after) {
    const hostsText = `${vsphere8.hosts} host${vsphere8.hosts === 1 ? "" : "s"}`;
    const runTo = monthYear(`${vsphere8.lastWave}-01`);
    const chosen = vsphere8.strategy ? VSPHERE8_STRATEGY_TEXT[vsphere8.strategy] : null;
    constraints.push({
      constraint: `${hostsText} on vSphere 8${vsphere8.where} moved or upgraded before ${shortDate(VSPHERE8_EOGS)}`,
      imposedBy: "Broadcom product lifecycle",
      effect: `The waves run to ${runTo}, after vSphere 8 general support ends; ${chosen ? `${customer} will ${chosen}` : "how those hosts stay supported is an open item"}`,
    });
    if (!chosen) openItems.push({
      item: `The waves run to ${runTo}, after vSphere 8 general support ends on ${shortDate(VSPHERE8_EOGS)}, with ${hostsText} still on vSphere 8${vsphere8.where}`,
      gates: `Supported platform. Options: ${(Object.values(VSPHERE8_STRATEGY_TEXT) as string[]).join("; or ")}`,
      owner: PLATFORM_OWNER(customer),
    });
  }
  if (!inventory.hosts) openItems.push({ item: "Current RVTools export", gates: "Design sign-off and sizing", owner: "" });
  for (const purchased of discovery.addOnsPurchased) {
    const key = canonicalAddOn(purchased);
    const addOn = key ? ADD_ON_OUTCOMES[key] : null;
    const planned = addOn?.priority && addOn.focus ? addOn.focus.some(focus => outcomeKeys.has(`${addOn.priority}:${focus}`)) : false;
    if (!planned) openItems.push({ item: `${addOn?.label ?? purchased} is purchased but not in this plan`, gates: "Scope: add it or record why it waits", owner: "" });
  }
  // The brief often carries its own item for the work plan hours; raise this one only when nothing covers it.
  const hoursItemOnRecord = report.openItems.some(item => /resource assignment|work plan|entitled hours/i.test(`${item.item} ${item.gates}`));
  if (!report.entitlement.hours && !hoursItemOnRecord) openItems.push({ item: "Entitled hours from the signed resource assignments", gates: "Burndown and weekly pace", owner: "" });
  if (termEndAssumed(document) && termEnd) openItems.push({ item: `Entitlement end date: ${shortDate(termEnd)} is assumed as 12 months from the start; confirm the term`, gates: "Timeline end, weekly pace and follow-on scope", owner: "" });
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
      case "availability": if (fields.adoptionDetails.domains.length) {
        // The domains from the brief, by instance: what is built, imported or converged.
        const how = (domain: (typeof fields.adoptionDetails.domains)[number]) => (domain.pathway === "import" ? "imported" : domain.pathway === "converge" ? "converged" : "built new");
        const list = (kind: "management" | "workload") => fields.adoptionDetails.domains.filter(domain => domain.kind === kind).map(domain => `${domain.name}${domain.instance ? ` (${domain.instance})` : ""}, ${how(domain)}`).join("; ");
        const workloads = list("workload");
        return `Management domains: ${list("management") || "to be confirmed in design"}.${workloads ? ` Workload domains: ${workloads}.` : ""} HA and fully automated DRS on every cluster.`;
      }
      return fields.adoptionDetails.domainTopology === "consolidated" ? "Consolidated management domain: management components and workloads share the cluster; HA and fully automated DRS retained." : fields.adoptionDetails.domainTopology === "standard" ? "Standard architecture: a dedicated management domain and separate workload domains." : "Management domain topology to be decided in design.";
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

/** One sentence on what the plan is framed around and the delivery path, for the Plan on a Page. */
export function selectedScopeSummary(document: EngagementDocument) {
  const { priorities, adoptionDetails } = document.fields;
  const resolved = resolvePlanOutcomes(document.fields);
  const vvf = resolved.edition === "vvf";
  const scope: string[] = [];
  const later: string[] = [];
  const area = (capability: string, selected: boolean, phrase: string) => { if (selected) (adoptionDetails.followOnOnly.includes(capability as never) ? later : scope).push(phrase); };
  area("operations", priorities.includes("operations") || adoptionDetails.operations.length > 0, "operations and lifecycle management");
  area("automation", priorities.includes("automation") || adoptionDetails.automation.length > 0, "automation and self-service foundations");
  area("networking", priorities.includes("networking") || adoptionDetails.networking.length > 0, vvf ? "the explicitly selected networking and load-balancing scope" : "the explicitly selected VCF networking and NSX scope");
  area("security", priorities.includes("security") || adoptionDetails.security.length > 0, usesVdefend(document.fields) ? "security and segmentation controls" : "identity, access and hardening controls");
  area("resilience", priorities.includes("resilience") || adoptionDetails.resilience.length > 0, "resilience and recovery planning");
  area("kubernetes", priorities.includes("kubernetes") || adoptionDetails.kubernetes.length > 0, "Kubernetes and workload-domain enablement");
  area("private-ai", priorities.includes("private-ai") || adoptionDetails.privateAi.length > 0, "private AI enablement");
  if (adoptionDetails.followOnOnly.includes("efficiency")) later.push("memory tiering");

  const deliveryPath = {
    "migration-waves": "controlled migration waves",
    "new-build": "a new platform build",
    "in-place": "an in-place modernization path",
    converge: "convergence of an existing vCenter into the VCF management domain",
    "import-workload-domain": "import of an existing vCenter as a VCF workload domain",
    greenfield: "a separately funded greenfield VCF foundation and workload migration path",
    hybrid: "a combination of approved VCF adoption pathways, one for each vCenter or cluster",
    "design-only": "architecture and implementation-ready design work",
    undecided: "a delivery path still to be confirmed",
  }[vvf ? effectiveDeliveryPath(document.fields) : adoptionDetails.upgradePath];

  const selected = scope.length ? scope.join(", ").replace(/, ([^,]*)$/, " and $1") : "the selected operational priorities";
  const edition = vvf ? " on VMware vSphere Foundation (VVF)" : "";
  const excluded = resolved.excluded.length ? ` Outcomes that require VCF are not included: ${resolved.excluded.map(key => planOutcomeLabel(key)).join("; ")}.` : "";
  const considered = later.length ? ` Considered for after the entitlement: ${later.join(", ").replace(/, ([^,]*)$/, " and $1")}.` : "";
  return `The plan is framed around ${selected}, with ${vvf ? deliveryPath.replace(/VCF/g, "VVF") : deliveryPath}${edition}.${excluded}${considered}`;
}
