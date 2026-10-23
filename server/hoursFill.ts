import { unusedEntitlementHours, type ScopedEffort } from "../shared/effort";
import { buildAdoptionPlans, capabilitySchema, effectivePlatformEdition, isPlanOutcomeAvailable, withHoursFillLane, type AdoptionDetails, type Capability, type EngagementDocument, type MinimalFields } from "../shared/fcp";
import { scopedEffortForDocument } from "./rateCard";

/** Scope the planner can add to use entitlement hours the plan leaves unused, with the hours each one adds. */
export type HoursFillOption = {
  id: string;
  label: string;
  detail: string;
  hours: number;
  /** The fields to apply; the client rebuilds the plan from them. */
  patch: Pick<MinimalFields, "priorities" | "adoptionDetails">;
};

export type HoursFillOptions = {
  /** Unused hours after the reserve, before the hours-fill package takes them; null without an entitlement fit. */
  unusedHours: number | null;
  options: HoursFillOption[];
  /** Additions that were priced but need more hours than are left. */
  tooLarge: number;
};

const OUTCOME_LABEL: Record<Capability, string> = {
  operations: "Operations",
  automation: "Automation and Self-Service",
  networking: "VCF Networking and NSX",
  security: "Security",
  resilience: "Resilience",
  kubernetes: "Kubernetes",
  "private-ai": "Private AI",
};

type DepthKey = keyof AdoptionDetails["componentDepths"];
const DEPTH_LABEL: Record<DepthKey, string> = {
  operations: "Operations",
  automation: "Automation",
  networkingSecurity: "Networking and security",
  kubernetesAi: "Kubernetes and Private AI",
  efficiency: "Efficiency and memory tiering",
};
const NEXT_TIER = { "not-selected": "tier-1", "tier-1": "tier-2", "tier-2": "tier-3" } as const;
const TIER_LABEL = { "tier-1": "Tier 1", "tier-2": "Tier 2", "tier-3": "Tier 3" } as const;

/** The document with new fields; a generated plan is rebuilt from them, a hand-edited one keeps its timeline. */
function withFields(document: EngagementDocument, fields: MinimalFields): EngagementDocument {
  const next = { ...document, fields };
  if (document.planAuthority === "manual") return { ...next, adoptionTimeline: withHoursFillLane(document.adoptionTimeline, fields) };
  const plans = buildAdoptionPlans(fields, document.inventory, document.readiness.hclSchedulePath, { edgeSites: document.report.discovery.edgeSites });
  return { ...next, adoptionTimeline: plans.adoptionTimeline, twoYearPlan: plans.twoYearPlan, rationale: plans.rationale };
}

const planHours = (effort: ScopedEffort) => effort.workPackages.reduce((sum, row) => sum + row.total, 0);
/** Hours outside the entitlement: the fit's displaced buckets and work on the Two-Year Notional. */
const laterHours = (effort: ScopedEffort) => (effort.internal.fit ? effort.internal.fit.buckets.F + effort.internal.fit.buckets.C : 0) + effort.workPackages.reduce((sum, row) => sum + (row.followOn?.total ?? 0), 0);

/**
 * Prices each outcome the plan does not have and each next depth tier, against the plan without the hours-fill
 * package, and returns the ones that fit the unused hours, largest first. Every candidate is a whole plan rebuild,
 * so the hours include the design, prerequisites and project management the addition brings with it.
 */
export function hoursFillOptions(source: EngagementDocument): HoursFillOptions {
  if (source.fields.hoursModel !== "v2") return { unusedHours: null, options: [], tooLarge: 0 };
  const fields: MinimalFields = { ...source.fields, hoursFill: { ...source.fields.hoursFill, enabled: false } };
  const document = withFields(source, fields);
  const base = scopedEffortForDocument(document);
  const unusedHours = unusedEntitlementHours(base);
  if (!unusedHours || base.internal.fit?.underFunded) return { unusedHours, options: [], tooLarge: 0 };
  const before = planHours(base);
  const laterBefore = laterHours(base);
  const edition = effectivePlatformEdition(fields);

  const candidates: Array<Omit<HoursFillOption, "hours">> = [];
  for (const capability of capabilitySchema.options) {
    if (fields.priorities.includes(capability) || !isPlanOutcomeAvailable(`${capability}:core`, edition)) continue;
    candidates.push({ id: `outcome:${capability}`, label: `Add ${OUTCOME_LABEL[capability]}`, detail: "A customer outcome not in the plan yet", patch: { priorities: [...fields.priorities, capability], adoptionDetails: fields.adoptionDetails } });
  }
  for (const key of Object.keys(DEPTH_LABEL) as DepthKey[]) {
    const current = fields.adoptionDetails.componentDepths[key];
    if (current === "tier-3") continue;
    const next = NEXT_TIER[current];
    candidates.push({
      id: `depth:${key}:${next}`,
      label: current === "not-selected" ? `Add ${DEPTH_LABEL[key]} at ${TIER_LABEL[next]}` : `${DEPTH_LABEL[key]} to ${TIER_LABEL[next]}`,
      detail: current === "not-selected" ? "Component adoption depth" : `Deeper adoption, from ${TIER_LABEL[current]}`,
      patch: { priorities: fields.priorities, adoptionDetails: { ...fields.adoptionDetails, componentDepths: { ...fields.adoptionDetails.componentDepths, [key]: next } } },
    });
  }

  const options: HoursFillOption[] = [];
  let tooLarge = 0;
  for (const candidate of candidates) {
    const effort = scopedEffortForDocument(withFields(document, { ...fields, ...candidate.patch }));
    const hours = Math.round(planHours(effort) - before);
    // An addition that does not fit pushes work out of the entitlement rather than adding hours to it.
    const pushedOut = laterHours(effort) - laterBefore >= 1 || Boolean(effort.internal.fit?.underFunded);
    if (hours < 1 && !pushedOut) continue;
    if (pushedOut || hours > unusedHours) tooLarge += 1;
    else options.push({ ...candidate, hours });
  }
  return { unusedHours, options: options.sort((left, right) => right.hours - left.hours), tooLarge };
}
