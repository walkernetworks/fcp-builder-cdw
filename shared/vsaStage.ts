/**
 * VSA engagement stage model: one stage replaces the five SharePoint status fields.
 * Pure: no database or React imports. docs/VSA-TRACKER-DATA-MODEL.md section 2.
 */
import type { GateKey, SourceItemKind, SourceItemStatus } from "./vsaFields";

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

// ---------------------------------------------------------------------------------------------------------------------
// Stage progression: the gate dates grouped under the stage they belong to, for the record's Stages & gates view.
// Display only: the rules above (canTransition, exitGaps, the PO hard gate) are unchanged and still decide every move.

/** The stage each gate date is recorded in. Matches exitGaps: a stage's gates are what it takes to leave it. */
export const STAGE_GATES: Record<MainStage, readonly GateKey[]> = {
  intake: ["serSubmittedOn"],
  broadcom_request: ["serApprovedOn"],
  discovery: [],
  fcp_draft: ["fcpDraftCreatedOn", "fcpSubmittedOn"],
  broadcom_approval: ["fcpBroadcomAcceptedOn"],
  customer_approval: ["fcpCustomerAcceptedOn", "workPlanSentOn", "workPlanAcceptedOn"],
  ra_staffing: ["ikomOn", "raReceivedOn", "workAuthReceivedOn", "poReceivedOn"],
  kickoff: ["ckomOn"],
  in_delivery: ["projectStartOn", "estimatedCloseOn", "completedOn"],
  complete: [],
};

/** The one hard gate: Kickoff and In Delivery cannot be entered without it. */
export const HARD_GATE: GateKey = "poReceivedOn";
/** A forecast, not an event: it is set to a date rather than marked done, and never counts as pending. */
export const PLANNED_GATES: ReadonlySet<GateKey> = new Set<GateKey>(["estimatedCloseOn"]);

export function requiresPo(stage: Stage) {
  return PO_REQUIRED.has(stage);
}

/** Broadcom FCP acceptance and the work plan apply to Corporate and Strategic only; every other gate applies to all. */
export function gateApplies(gate: GateKey, segment: Segment | null) {
  if (gate === "fcpBroadcomAcceptedOn") return requiresBroadcomApproval(segment);
  if (gate === "workPlanSentOn" || gate === "workPlanAcceptedOn") return requiresWorkPlan(segment);
  return true;
}

export type GateDates = Partial<Record<GateKey, string | null>>;
export type GateRow = { gate: GateKey; day: string | null; done: boolean; hard: boolean; planned: boolean };
export type StepStatus = "done" | "current" | "upcoming";
export type StageStep = { stage: MainStage; status: StepStatus; gates: GateRow[] };

export type NextAction =
  /** The next gate to record in the current stage. */
  | { kind: "record"; gate: GateKey; stage: MainStage }
  /** The PO is missing and the next stage (or this one) needs it. */
  | { kind: "unblock"; gate: GateKey; stage: MainStage }
  /** The current stage's gates are recorded; the record can move on. */
  | { kind: "move"; stage: MainStage }
  | { kind: "resume"; stage: Stage | null }
  | { kind: "closed"; stage: "refused" | "lost" }
  | { kind: "complete" };

export type StageProgression = {
  steps: StageStep[];
  /** Set when the record is in an exit: where it left the main line, when known. */
  exit: { stage: "refused" | "paused" | "lost"; from: MainStage | null } | null;
  next: NextAction;
};

/**
 * The record's path through the stages that apply to its segment, each with its applicable gates, and the next action.
 * `exitedFrom` is the main stage the record left for an exit (from its stage history); `dates` are the gate dates.
 */
export function stageProgression(record: Pick<StageRecord, "stage" | "segment"> & { exitedFrom?: Stage | null }, dates: GateDates): StageProgression {
  const exited = isMainStage(record.stage) ? null : record.exitedFrom && isMainStage(record.exitedFrom) ? record.exitedFrom : null;
  const anchor: MainStage | null = isMainStage(record.stage) ? record.stage : exited;
  const steps = applicableStages(record.segment).map(stage => {
    const status: StepStatus =
      anchor === null ? "upcoming" : record.stage === "complete" || stageOrder(stage) < stageOrder(anchor) ? "done" : stage === anchor ? "current" : "upcoming";
    const gates = STAGE_GATES[stage]
      .filter(gate => gateApplies(gate, record.segment))
      .map(gate => ({ gate, day: dates[gate] || null, done: Boolean(dates[gate]), hard: gate === HARD_GATE, planned: PLANNED_GATES.has(gate) }));
    return { stage, status, gates };
  });
  const exit = isMainStage(record.stage) ? null : { stage: record.stage as "refused" | "paused" | "lost", from: exited };
  return { steps, exit, next: nextAction(record, steps, dates, exited) };
}

function nextAction(record: Pick<StageRecord, "stage" | "segment">, steps: StageStep[], dates: GateDates, exited: MainStage | null): NextAction {
  if (record.stage === "complete") return { kind: "complete" };
  if (record.stage === "refused" || record.stage === "lost") return { kind: "closed", stage: record.stage };
  if (record.stage === "paused") return { kind: "resume", stage: exited };
  const stage = record.stage as MainStage;
  const next = nextStage({ stage, segment: record.segment });
  if (!dates[HARD_GATE] && (requiresPo(stage) || (next && requiresPo(next)))) return { kind: "unblock", gate: HARD_GATE, stage: requiresPo(stage) ? stage : next! };
  const pending = steps.find(step => step.stage === stage)?.gates.find(gate => !gate.done && !gate.planned);
  if (pending) return { kind: "record", gate: pending.gate, stage };
  return next ? { kind: "move", stage: next } : { kind: "complete" };
}
