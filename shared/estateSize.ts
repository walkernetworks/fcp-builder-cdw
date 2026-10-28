import { HOURS_V2 as H } from "./hoursConfig";
import type { EngagementDocument } from "./fcp";

/**
 * The small-estate test for the Reference Architecture Design tier. Pure, and free of runtime imports from shared/fcp.ts
 * so the plan generator can use it for the design package's wording.
 *
 * Counts come from the RVTools inventory when it is loaded, else from the brief. The brief does not state clusters, so
 * without RVTools they are the assumed `ceil(hosts / 16)`. An unknown estate (no host count anywhere) is never small
 * under "auto": it gets the full design, and the readiness flag says so. The planner can force the answer either way.
 */

export type SmallEstateChoice = "auto" | "yes" | "no";

export type EstateSize = {
  hosts: number;
  clusters: number;
  vcenters: number;
  instances: number;
  sites: number;
  /** True when a host count is known from RVTools or the brief. */
  known: boolean;
  choice: SmallEstateChoice;
  /** Whether the Reference Architecture Design tier applies. */
  small: boolean;
  /** The counts that break the limits, for the planner (empty when small or forced). */
  exceeds: string[];
};

/** The readiness flag for an estate whose size nobody has stated. Internal wording. */
export const ESTATE_SIZE_UNKNOWN_FLAG = "Estate size unknown; design hours assume a full design";

type Source = Pick<EngagementDocument, "fields" | "inventory" | "report">;

export function resolveEstateSize(document: Source): EstateSize {
  const { fields, inventory, report } = document;
  const given = fields.estimateInputs;
  const hosts = inventory.hosts || report.discovery.esxHosts || 0;
  const domains = fields.adoptionDetails.domains;
  const managementDomains = domains.filter(domain => domain.kind === "management").length;
  const instances = Math.max(report.discovery.vcfInstances ?? 0, managementDomains) || 1;
  const vcenters = report.discovery.vcenters || 1;
  const sites = given.sites ?? (report.discovery.datacenters || 1);
  const assumedClusters = Math.max(1, Math.ceil(hosts / H.defaults.hostsPerCluster.value));
  const clusters = Math.max(inventory.clusters || assumedClusters, given.targetClusters ?? 0);
  const known = hosts > 0;
  const choice: SmallEstateChoice = given.smallEstate ?? "auto";
  const exceeds: string[] = [];
  if (hosts > H.smallEstate.hosts.value) exceeds.push(`${hosts} hosts (limit ${H.smallEstate.hosts.value})`);
  if (clusters > H.smallEstate.clusters.value) exceeds.push(`${clusters} clusters (limit ${H.smallEstate.clusters.value})`);
  if (vcenters > H.smallEstate.vcenters.value) exceeds.push(`${vcenters} vCenters (limit ${H.smallEstate.vcenters.value})`);
  if (instances > H.smallEstate.instances.value) exceeds.push(`${instances} VCF instances (limit ${H.smallEstate.instances.value})`);
  if (sites > H.smallEstate.sites.value) exceeds.push(`${sites} sites (limit ${H.smallEstate.sites.value})`);
  const small = choice === "yes" ? true : choice === "no" ? false : known && exceeds.length === 0;
  return { hosts, clusters, vcenters, instances, sites, known, choice, small, exceeds };
}

/** The flag text when the estate size is unknown and the planner has not decided, else null. */
export function estateSizeFlag(document: Source): string | null {
  const size = resolveEstateSize(document);
  return !size.known && size.choice === "auto" ? ESTATE_SIZE_UNKNOWN_FLAG : null;
}

/**
 * Sets the Small estate choice and logs the change (what it was, what it is, when) in the document's planner log. The log
 * is internal and never printed. Choosing what is already chosen changes nothing and logs nothing; "auto" clears the input.
 */
export function withSmallEstateChoice<T extends { fields: { estimateInputs: { smallEstate?: SmallEstateChoice }; plannerLog?: Array<{ at: string; input: string; from: string; to: string }> } }>(document: T, choice: SmallEstateChoice, at: string = new Date().toISOString()): T {
  const from = document.fields.estimateInputs.smallEstate ?? "auto";
  if (from === choice) return document;
  const { smallEstate: _previous, ...rest } = document.fields.estimateInputs;
  return {
    ...document,
    fields: {
      ...document.fields,
      estimateInputs: choice === "auto" ? rest : { ...rest, smallEstate: choice },
      plannerLog: [...(document.fields.plannerLog ?? []), { at, input: "Small estate", from, to: choice }].slice(-200),
    },
  };
}
