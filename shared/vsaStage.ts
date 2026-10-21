/**
 * VSA engagement stage model: one stage replaces the five SharePoint status fields.
 * Pure: no database or React imports. docs/VSA-TRACKER-DATA-MODEL.md section 2.
 */
import type { SourceItemKind, SourceItemStatus } from "./vsaFields";

export const MAIN_STAGES = [
  "intake",
  "broadcom_request",
  "discovery",
  "fcp_draft",
  "broadcom_approval",
  "customer_approval",
  "ra_staffing",
  "kickoff",
  "in_delivery",
  "complete",
] as const;
export const EXIT_STAGES = ["refused", "paused", "lost"] as const;
export const STAGES = [...MAIN_STAGES, ...EXIT_STAGES] as const;

export type Stage = (typeof STAGES)[number];
export type MainStage = (typeof MAIN_STAGES)[number];

export const SEGMENTS = ["corporate", "strategic", "commercial"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  intake: "Intake",
  broadcom_request: "Broadcom Request (SER)",
  discovery: "Discovery",
  fcp_draft: "FCP Draft",
  broadcom_approval: "Broadcom Approval",
  customer_approval: "Customer Approval",
  ra_staffing: "RA / Staffing",
  kickoff: "Kickoff",
  in_delivery: "In Delivery",
  complete: "Complete",
  refused: "Refused",
  paused: "Paused",
  lost: "Lost",
};

/** Terminal stages; leaving one is a reopening and needs a note. */
const TERMINAL: ReadonlySet<Stage> = new Set<Stage>(["complete", "refused", "lost"]);
/** No delivery work begins before the Broadcom PO, so these cannot be entered without one. */
const PO_REQUIRED: ReadonlySet<Stage> = new Set<Stage>(["kickoff", "in_delivery"]);
/** A work plan sent this many days ago without acceptance gets a warning. */
export const WORK_PLAN_STALE_DAYS = 14;

export type SourceItemSummary = { kind: SourceItemKind; label: string; required: boolean; status: SourceItemStatus };

/** The fields stage logic reads. Dates are "YYYY-MM-DD" or null. */
export type StageRecord = {
  stage: Stage;
  segment: Segment | null;
  serSubmittedOn?: string | null;
  serApprovedOn?: string | null;
  fcpSubmittedOn?: string | null;
  fcpBroadcomAcceptedOn?: string | null;
  fcpCustomerAcceptedOn?: string | null;
  workPlanSentOn?: string | null;
  workPlanAcceptedOn?: string | null;
  raReceivedOn?: string | null;
  workAuthReceivedOn?: string | null;
  poReceivedOn?: string | null;
  ckomOn?: string | null;
  completedOn?: string | null;
  /** The source checklist; it is the FCP Draft readiness check. When omitted, sources are not checked. */
  sourceItems?: SourceItemSummary[];
  /** For a paused record: the stage it paused from, when known. */
  pausedFrom?: Stage | null;
};

export function isMainStage(stage: Stage): stage is MainStage {
  return (MAIN_STAGES as readonly Stage[]).includes(stage);
}

export function isTerminal(stage: Stage) {
  return TERMINAL.has(stage);
}

/** Broadcom Approval and the work plan apply to Corporate and Strategic. An unset segment is treated as gated (conservative). */
export function requiresBroadcomApproval(segment: Segment | null) {
  return segment !== "commercial";
}

export function requiresWorkPlan(segment: Segment | null) {
  return segment !== "commercial";
}

export function applicableStages(segment: Segment | null): MainStage[] {
  return MAIN_STAGES.filter(stage => stage !== "broadcom_approval" || requiresBroadcomApproval(segment));
}

export function stageOrder(stage: Stage): number {
  return isMainStage(stage) ? MAIN_STAGES.indexOf(stage) : -1;
}

/** The next main-line stage for this record's segment, or null at the end, in an exit, or for a paused record with unknown history. */
export function nextStage(record: Pick<StageRecord, "stage" | "segment" | "pausedFrom">): MainStage | null {
  if (record.stage === "paused") return record.pausedFrom && isMainStage(record.pausedFrom) ? record.pausedFrom : null;
  if (!isMainStage(record.stage) || isTerminal(record.stage)) return null;
  const path = applicableStages(record.segment);
  const index = path.indexOf(record.stage);
  // A record sitting in a stage its segment skips (Commercial in Broadcom Approval) moves on to the next stage in order.
  if (index < 0) return path.find(stage => stageOrder(stage) > stageOrder(record.stage)) ?? null;
  return path[index + 1] ?? null;
}

export type CustomerApprovalItems = {
  fcp: { acceptedOn: string | null };
  workPlan?: { sentOn: string | null; acceptedOn: string | null };
};

/** Customer Approval holds FCP approval and, for Corporate and Strategic, the Broadcom work plan approval. */
export function customerApprovalItems(record: StageRecord): CustomerApprovalItems {
  return {
    fcp: { acceptedOn: record.fcpCustomerAcceptedOn ?? null },
    ...(requiresWorkPlan(record.segment) ? { workPlan: { sentOn: record.workPlanSentOn ?? null, acceptedOn: record.workPlanAcceptedOn ?? null } } : {}),
  };
}

/** Required sources not yet received, verified, or waived (waiving needs a note, enforced where items are saved). */
export function openSources(items: SourceItemSummary[]) {
  return items.filter(item => item.required && !["received", "verified", "waived"].includes(item.status));
}

export function sourceChainComplete(items: SourceItemSummary[]) {
  return items.every(item => !item.required || item.status === "received" || item.status === "verified" || item.status === "waived");
}

/** What is still missing to leave `stage` cleanly. Soft gates: these produce warnings, not blocks. */
export function exitGaps(record: StageRecord, stage: MainStage): string[] {
  switch (stage) {
    case "intake":
      return record.serSubmittedOn ? [] : ["SER not submitted"];
    case "broadcom_request":
      return record.serApprovedOn ? [] : ["Broadcom partner approval not recorded"];
    case "fcp_draft":
      return [...(record.fcpSubmittedOn ? [] : ["FCP not submitted"]), ...openSources(record.sourceItems ?? []).map(item => `Source not received: ${item.label}`)];
    case "broadcom_approval":
      return record.fcpBroadcomAcceptedOn ? [] : ["Broadcom FCP acceptance not recorded"];
    case "customer_approval": {
      const items = customerApprovalItems(record);
      const gaps = items.fcp.acceptedOn ? [] : ["Customer FCP acceptance not recorded"];
      if (items.workPlan && !items.workPlan.acceptedOn) gaps.push(items.workPlan.sentOn ? "Work plan sent, not accepted" : "Work plan not sent");
      return gaps;
    }
    case "ra_staffing":
      return [
        ...(record.raReceivedOn ? [] : ["RA not received"]),
        ...(record.workAuthReceivedOn ? [] : ["Work authorization not received"]),
        ...(record.poReceivedOn ? [] : ["PO not received"]),
      ];
    case "kickoff":
      return record.ckomOn ? [] : ["Customer kickoff not held"];
    case "in_delivery":
      return record.completedOn ? [] : ["Completion date not recorded"];
    default:
      return [];
  }
}

export type TransitionCheck = {
  ok: boolean;
  /** Set when the move is refused outright. */
  hardBlock?: string;
  /** Backward moves, reopenings, skips, and resuming to a stage other than the paused-from stage need a note. */
  noteRequired: boolean;
  warnings: string[];
};

export function canTransition(record: StageRecord, to: Stage): TransitionCheck {
  const from = record.stage;
  if (from === to) return { ok: false, hardBlock: `Already in ${STAGE_LABELS[to]}`, noteRequired: false, warnings: [] };
  if (PO_REQUIRED.has(to) && !record.poReceivedOn) {
    return { ok: false, hardBlock: `${STAGE_LABELS[to]} needs the Broadcom PO received date. No delivery work begins before the PO.`, noteRequired: false, warnings: [] };
  }

  const warnings: string[] = [];
  if (to === "broadcom_approval" && !requiresBroadcomApproval(record.segment)) warnings.push("Commercial customers skip Broadcom Approval");

  // Exits: any non-terminal stage can leave the main line.
  if (!isMainStage(to)) {
    if (isTerminal(from)) return { ok: true, noteRequired: true, warnings };
    return { ok: true, noteRequired: false, warnings };
  }

  if (from === "paused") {
    const resumesWhereItPaused = record.pausedFrom === to;
    return { ok: true, noteRequired: !resumesWhereItPaused, warnings };
  }
  if (isTerminal(from)) return { ok: true, noteRequired: true, warnings: [...warnings, `Reopens a record that was ${STAGE_LABELS[from]}`] };

  const fromIndex = stageOrder(from);
  const toIndex = stageOrder(to);
  if (toIndex < fromIndex) return { ok: true, noteRequired: true, warnings };

  // Forward: every stage passed through contributes its missing exit criteria.
  const path = applicableStages(record.segment);
  const passed = path.filter(stage => stageOrder(stage) >= fromIndex && stageOrder(stage) < toIndex);
  if (isMainStage(from) && !passed.includes(from)) passed.unshift(from);
  for (const stage of passed) warnings.push(...exitGaps(record, stage));
  const skipped = nextStage(record) !== to;
  return { ok: true, noteRequired: skipped, warnings };
}

/** A stage change cannot be dated before the record entered its current stage, or in the future. */
export function effectiveDateProblem(stageEnteredOn: string, effectiveOn: string, today: string): string | null {
  if (effectiveOn > today) return "A stage change cannot be dated in the future";
  if (effectiveOn < stageEnteredOn) return `A stage change cannot be dated before ${stageEnteredOn}, when the record entered its current stage`;
  return null;
}

function daysBetween(fromDay: string, toDay: string) {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
}

/**
 * Warnings about the record as it stands today, for the board card and record page. `today` is "YYYY-MM-DD".
 * `workPlanStaleDays` defaults to the constant; the app passes the admin setting (shared/appSettings.ts).
 */
export function stageWarnings(record: StageRecord, today: string, workPlanStaleDays: number = WORK_PLAN_STALE_DAYS): string[] {
  const warnings: string[] = [];
  if (!record.segment) warnings.push("Segment not set");
  if (record.stage === "broadcom_approval" && !requiresBroadcomApproval(record.segment)) warnings.push("Commercial customers skip Broadcom Approval");
  if (PO_REQUIRED.has(record.stage) && !record.poReceivedOn) warnings.push("In a delivery stage without a PO received date");
  // FCP Draft readiness: the FCP is built from these inputs. Soft only; the PO is the one hard gate.
  if (record.stage === "fcp_draft") for (const item of openSources(record.sourceItems ?? [])) warnings.push(`Source not received: ${item.label}`);
  if (requiresWorkPlan(record.segment) && record.workPlanSentOn && !record.workPlanAcceptedOn && daysBetween(record.workPlanSentOn, today) > workPlanStaleDays) {
    warnings.push(`Work plan sent ${record.workPlanSentOn}, not accepted after ${workPlanStaleDays} days`);
  }
  return warnings;
}

/** Source chain items every new record starts with. */
export const DEFAULT_SOURCE_CHAIN: ReadonlyArray<{ kind: SourceItemKind; label: string; required: boolean }> = [
  { kind: "rvtools", label: "RVTools export", required: true },
  { kind: "discovery_notes", label: "Discovery notes", required: true },
  { kind: "customer_brief", label: "Customer brief", required: true },
  { kind: "hours_source", label: "Hours source", required: true },
];
