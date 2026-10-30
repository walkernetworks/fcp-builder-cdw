import { effectiveDeliveryPath, resolvePlanOutcomes, usesVdefend, type EngagementDocument } from "./fcp";
import { ADD_ON_OUTCOMES, canonicalAddOn, storageLabel } from "./report";

/**
 * What the delivery team needs to know walking into the engagement: every discovery answer on record,
 * with what it means for the work in this plan. Answers not captured are left out.
 */
export type BriefingItem = { topic: string; detail: string; why: string };

const yesNo = (value: boolean) => (value ? "Yes" : "No");

/** A renewal date within a month of the entitlement start is the renewal that opened this term, not a deadline still ahead. */
export function renewalStartsCurrentTerm(document: EngagementDocument): boolean {
  const renewal = Date.parse(document.report.discovery.renewalDate ?? "");
  const start = Date.parse(document.fields.entitlementStart ?? "");
  return Number.isFinite(renewal) && Number.isFinite(start) && Math.abs(renewal - start) <= 31 * 86_400_000;
}

export function deliveryBriefing(document: EngagementDocument): BriefingItem[] {
  const { fields, inventory, report } = document;
  const discovery = report.discovery;
  const path = effectiveDeliveryPath(fields);
  const outcomes = new Set(resolvePlanOutcomes(fields).outcomes.map(item => item.key));
  const inScope = (capability: string) => Array.from(outcomes).some(key => key.startsWith(`${capability}:`));
  const converging = path === "converge" || path === "import-workload-domain";
  const moving = path !== "design-only" && path !== "undecided";
  const items: BriefingItem[] = [];
  const add = (topic: string, detail: string | null | undefined, why: string) => { if (detail && detail.trim()) items.push({ topic, detail: detail.trim(), why }); };

  add("Current platform", discovery.currentPlatform, "The starting release sets the upgrade and import sequence and which tools the team can use on day one.");
  add("vCenters", discovery.vcenters ? String(discovery.vcenters) : null, converging ? "Each vCenter converged or imported is its own runbook and change window." : "Every in-scope vCenter needs an RVTools export and a target in the design.");
  add("Enhanced Linked Mode", discovery.enhancedLinkedMode === null ? null : yesNo(discovery.enhancedLinkedMode), discovery.enhancedLinkedMode && converging ? "Linked vCenters must be split before convergence; schedule it ahead of the build." : "Affects identity, licensing views and how vCenters join the fleet.");
  add("Data centers", discovery.datacenters ? String(discovery.datacenters) : inventory.datacenters ? `${inventory.datacenters} (from RVTools)` : null, "Sets the site count for the design and where the management domain lands.");
  add("Edge sites", discovery.edgeSites ? String(discovery.edgeSites) : null, "Edge sites need their own connectivity, lifecycle and support decisions.");
  add("Server vendor", discovery.serverVendor, "Determines the vLCM vendor add-on, hardware support manager and firmware baseline.");
  add("Storage", storageLabel(discovery.storage), "Confirms the principal storage workflow and the array support matrix to check before the build.");
  add("Networking", discovery.networking, inScope("networking") ? "Shapes the NSX transport, Edge and VLAN design in scope." : "Needed for the management network, VLANs and IP plan of the build.");
  add("Jumbo frames", discovery.jumboFrames === null ? null : discovery.jumboFrames === "mixed" ? "Mixed" : yesNo(discovery.jumboFrames), discovery.jumboFrames === "mixed" ? "Some switches run jumbo frames and others do not: confirm the MTU end to end on every transport VLAN." : discovery.jumboFrames === false ? "Not enabled: raise the MTU on transport VLANs before overlay or vSAN traffic runs." : "Confirm the MTU end to end on the transport VLANs.");
  add("Backup", discovery.backup, moving ? "Confirm support for the target release before the first wave and re-point jobs as workloads move." : "Record it in the design so the build plan covers protection from day one.");
  add("Disaster recovery", discovery.drSolution, inScope("resilience") ? "The recovery design replaces or integrates it; capture current recovery objectives first." : "Not in this plan's scope; keep it working through every change.");
  add("Security tooling", discovery.securityTooling, inScope("security") ? (usesVdefend(fields) ? "Design vDefend policy alongside it to avoid conflicting controls." : "Design the identity, access and hardening controls alongside it to avoid conflicting controls.") : "Agents and integrations must support the target release.");
  add("Container platform", discovery.containerPlatform, inScope("kubernetes") ? "Decide which clusters move to the Supervisor and VKS." : "Out of scope; confirm nothing on it depends on the hosts being rebuilt.");
  add("Public cloud", discovery.hyperscalers.join(", "), "Existing cloud connectivity and workloads that the design must account for.");
  const bought = discovery.newHostsPurchased;
  const newHosts = [bought.management ? `${bought.management} for management` : "", bought.workload ? `${bought.workload} for workloads` : ""].filter(Boolean).join(", ");
  add("New hosts purchased", newHosts, "Sized into the design; the build waits for their delivery, rack and stack.");
  add("VCF licensed", discovery.vcfLicensed === null ? null : yesNo(discovery.vcfLicensed), "Licensing must be activated before the evaluation period on the new platform ends.");
  add("Licensed cores", discovery.licensedCores ? discovery.licensedCores.toLocaleString("en-US") : null, "Compared with the cores the hosts require at the 16-core-per-CPU minimum.");
  if (!renewalStartsCurrentTerm(document)) add("Subscription renewal", discovery.renewalDate, "Licensing activation and the renewal sizing land before this date.");
  const purchased = discovery.addOnsPurchased.map(value => ADD_ON_OUTCOMES[canonicalAddOn(value) ?? ""]?.label ?? value);
  add("Add-ons purchased", purchased.join(", "), "Anything purchased but not in this plan is raised as an open item for a scope decision.");
  add("Prior assessment", discovery.assessmentCompleted === null ? null : yesNo(discovery.assessmentCompleted), discovery.assessmentCompleted ? "Design builds on the existing assessment; the discovery sessions confirm and extend it rather than repeat it." : "Design discovery is scoped ahead of architecture and design.");
  return items;
}
