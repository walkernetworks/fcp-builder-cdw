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
  /** Sites in year-one scope: the sites stated, less a recovery site (see `recoverySites`). */
  sites: number;
  /** Sites stated by the planner or the brief. */
  statedSites: number;
  /** Stated sites that are recovery sites and so are not counted against the limit. */
  recoverySites: number;
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
  const statedSites = given.sites ?? (report.discovery.datacenters || 1);
  // A site that exists for disaster recovery is covered by the recovery design (the Recovery and Resilience Design package,
  // funded or follow-on), not by the Reference Architecture Design, so it does not count against the one-site limit. It is a
  // recovery site when the plan wants recovery services (a resilience outcome, or resilience as a priority); one per recovery
  // site pair, at most all the sites but the first. This reads the brief and the plan, not the fit, so the design tier never
  // depends on what the entitlement ends up funding.
  const wantsRecovery = fields.adoptionDetails.resilience.length > 0 || fields.priorities.includes("resilience");
  const recoverySites = wantsRecovery ? Math.min(Math.max(0, statedSites - 1), Math.max(1, given.drSitePairs ?? 1)) : 0;
  const sites = Math.max(1, statedSites - recoverySites);
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
  return { hosts, clusters, vcenters, instances, sites, statedSites, recoverySites, known, choice, small, exceeds };
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

export type MigrationWavesChoice = "cdw" | "customer-remaining" | "customer-all";

/** Sets who runs the migration waves and logs the change. "cdw" is the default and clears the input; choosing what is already chosen logs nothing. */
export function withMigrationWavesChoice<T extends { fields: { estimateInputs: { migrationWaves?: MigrationWavesChoice }; plannerLog?: Array<{ at: string; input: string; from: string; to: string }> } }>(document: T, choice: MigrationWavesChoice, at: string = new Date().toISOString()): T {
  const from = document.fields.estimateInputs.migrationWaves ?? "cdw";
  if (from === choice) return document;
  const { migrationWaves: _previous, ...rest } = document.fields.estimateInputs;
  return {
    ...document,
    fields: {
      ...document.fields,
      estimateInputs: choice === "cdw" ? rest : { ...rest, migrationWaves: choice },
      plannerLog: [...(document.fields.plannerLog ?? []), { at, input: "Migration waves", from, to: choice }].slice(-200),
    },
  };
}
