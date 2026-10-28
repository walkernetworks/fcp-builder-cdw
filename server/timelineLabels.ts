import type { Timeline } from "../shared/fcp";
import { UNDECIDED_DEPTH } from "./fcpReportParts";

/**
 * Bar labels for the Summary's timeline, where a bar can be a single month wide: the plan's package names, shortened.
 * The Work Packages table keeps the full names. A label with no short form is only stripped of its planner prefix.
 */
const SHORT_BAR_LABELS: Array<[RegExp, string]> = [
  [/^Greenfield Discovery Sessions and Funding$/, "Discovery and Funding"],
  [/^Hardware Compatibility Review$/, "Hardware Review"],
  [/^Hardware Compatibility Sign-Off$/, "Hardware Sign-Off"],
  [/^Kickoff and Delivery Plan$/, "Kickoff"],
  [/^Close HCL Evidence Gaps$/, "Close HCL Gaps"],
  [/^Greenfield Design and Bill of Materials$/, "Design and BOM"],
  [/^Reference Architecture Design$/, "Reference Design"],
  [/^Migration and Cutover Plan$/, "Cutover Plan"],
  [/^Greenfield (VCF|VVF) Foundation Build$/, "$1 Foundation Build"],
  [/^Workload Clusters and vLCM Images$/, "Clusters and vLCM"],
  [/^Workload Migration and Cutover$/, "Migration Waves"],
  [/^Backup Validated Before Each Wave$/, "Backup Validation"],
  [/^(VCF|VVF) Operations Design$/, "Operations Design"],
  [/^Role and Access Mapping$/, "Roles and Access"],
  [/^Training and Knowledge Transfer$/, "Training"],
  [/^(VCF|VVF) Operations Licensing$/, "Licensing"],
  [/^Platform Lifecycle and Service Health$/, "Lifecycle and Health"],
  [/^Runbook Knowledge Transfer$/, "Runbook Transfer"],
  [/^Handover and Service Acceptance$/, "Handover"],
];
/** Bar labels without the planner's prefixes ("Month 1: ", "Weeks 1-2: "). */
export const packageLabel = (value: string) => value.replace(UNDECIDED_DEPTH, "").replace(/^(Month \d+|Weeks? [\d–-]+): /, "");
export const shortBarLabel = (label: string) => {
  const plain = packageLabel(label);
  for (const [pattern, short] of SHORT_BAR_LABELS) if (pattern.test(plain)) return plain.replace(pattern, short);
  return plain;
};
export const summaryTimeline = (timeline: Timeline): Timeline => ({ ...timeline, lanes: timeline.lanes.map(lane => ({ ...lane, bars: lane.bars.map(bar => ({ ...bar, label: bar.label.replace(/^((?:← )?)(.*?)((?: →)?)$/, (_all, before: string, name: string, after: string) => `${before}${shortBarLabel(name)}${after}`) })) })) });
