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
/** The delivery stages. They cannot be entered until the delivery requirements are met (deliveryRequirements). */
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
  /** Set when the PM or Broadcom said FCP approval isn't needed; it stands in for the FCP approval gate only. */
  fcpWaivedOn?: string | null;
  /** Hours on the accepted work plan, and on the PO / work authorization; compared when the PO came first. */
  workPlanHours?: number | null;
  poHours?: number | null;
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

/** Broadcom Approval applies to Corporate and Strategic. An unset segment is treated as gated (conservative). */
export function requiresBroadcomApproval(segment: Segment | null) {
  return segment !== "commercial";
}

/** Every segment needs the customer to accept the Broadcom work plan before delivery. */
export function requiresWorkPlan(_segment: Segment | null) {
  return true;
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

/** Customer Approval holds FCP approval and the Broadcom work plan approval. */
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
  if (PO_REQUIRED.has(to)) {
    const unmet = deliveryRequirements(record).filter(requirement => !requirement.met);
    if (unmet.length) return { ok: false, hardBlock: `${STAGE_LABELS[to]} needs ${listOf(unmet.map(requirement => requirement.need))}. No delivery work begins before them.`, noteRequired: false, warnings: [] };
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

// ---------------------------------------------------------------------------------------------------------------------
// Delivery requirements. Staffing (RA / Staffing) can start early in every segment, with no gate; entering delivery
// (Kickoff or In Delivery) is a hard block until all three are met.

/** The FCP approval delivery needs: Broadcom's for Corporate and Strategic, the customer's for Commercial. */
export function fcpApprovalGate(segment: Segment | null): GateKey {
  return requiresBroadcomApproval(segment) ? "fcpBroadcomAcceptedOn" : "fcpCustomerAcceptedOn";
}

export type DeliveryRequirement = {
  key: "fcp_approval" | "work_plan" | "po";
  gate: GateKey;
  met: boolean;
  /** Met by an FCP waiver rather than the approval date. A waiver never stands in for the work plan or the PO. */
  waived: boolean;
  /** What is missing, for messages: "the Broadcom PO received date". */
  need: string;
};

type DeliveryRecord = Pick<StageRecord, "segment" | "fcpBroadcomAcceptedOn" | "fcpCustomerAcceptedOn" | "fcpWaivedOn" | "workPlanAcceptedOn" | "poReceivedOn">;

export function deliveryRequirements(record: DeliveryRecord): DeliveryRequirement[] {
  const gate = fcpApprovalGate(record.segment);
  const approved = Boolean(record[gate as "fcpBroadcomAcceptedOn" | "fcpCustomerAcceptedOn"]);
  const waived = !approved && Boolean(record.fcpWaivedOn);
  return [
    { key: "fcp_approval", gate, met: approved || waived, waived, need: requiresBroadcomApproval(record.segment) ? "Broadcom approval of the FCP (or an FCP waiver)" : "customer approval of the FCP (or an FCP waiver)" },
    { key: "work_plan", gate: "workPlanAcceptedOn", met: Boolean(record.workPlanAcceptedOn), waived: false, need: "the customer's work plan acceptance" },
    { key: "po", gate: "poReceivedOn", met: Boolean(record.poReceivedOn), waived: false, need: "the Broadcom PO received date" },
  ];
}

/** The gates that block delivery for this segment. */
export function hardGates(segment: Segment | null): GateKey[] {
  return [fcpApprovalGate(segment), "workPlanAcceptedOn", "poReceivedOn"];
}

export type FcpTrailing = {
  /** "stop" for Corporate and Strategic (it blocks delivery until Broadcom approves), "warn" for Commercial. */
  severity: "stop" | "warn";
  /** The FCP gate to record next. */
  gate: GateKey;
  label: string;
};

/**
 * A record already in staffing or later whose FCP is not approved (or waived): the FCP is trailing the engagement.
 * Typical for records being caught up, where staffing runs while the FCP is still being written.
 */
export function fcpTrailing(record: Pick<StageRecord, "stage" | "fcpSubmittedOn"> & DeliveryRecord): FcpTrailing | null {
  if (!isMainStage(record.stage) || record.stage === "complete" || stageOrder(record.stage) < stageOrder("ra_staffing")) return null;
  const approval = deliveryRequirements(record)[0];
  if (approval.met) return null;
  const broadcom = requiresBroadcomApproval(record.segment);
  const gate: GateKey = record.fcpSubmittedOn ? approval.gate : "fcpSubmittedOn";
  return {
    severity: broadcom ? "stop" : "warn",
    gate,
    label: broadcom ? "FCP trailing: Broadcom approval of the FCP is needed before delivery" : "FCP trailing: customer approval of the FCP not recorded",
  };
}

export type AuthorizationCheck = { key: "po_before_work_plan" | "hours_mismatch"; label: string };

/**
 * The PO or work authorization arrived before the work plan was accepted. Soft: a data-quality flag, never a block.
 * Once the work plan is accepted, matching hours clear it and different hours raise an hours mismatch instead.
 */
export function authorizationCheck(record: Pick<StageRecord, "poReceivedOn" | "workAuthReceivedOn" | "workPlanAcceptedOn" | "workPlanHours" | "poHours">): AuthorizationCheck | null {
  const received = [record.poReceivedOn, record.workAuthReceivedOn].filter((day): day is string => Boolean(day)).sort()[0];
  if (!received) return null;
  const bothHours = record.workPlanHours != null && record.poHours != null;
  if (bothHours && record.workPlanAcceptedOn && Number(record.workPlanHours) !== Number(record.poHours)) {
    return { key: "hours_mismatch", label: `Hours mismatch: work plan ${record.workPlanHours}, PO / work authorization ${record.poHours}` };
  }
  if (!record.workPlanAcceptedOn) return { key: "po_before_work_plan", label: "PO / work authorization before work plan acceptance" };
  if (received < record.workPlanAcceptedOn && !bothHours) return { key: "po_before_work_plan", label: "PO / work authorization came before the work plan; record both hours to compare" };
  return null;
}

function listOf(items: string[]) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
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
  if (PO_REQUIRED.has(record.stage)) {
    for (const requirement of deliveryRequirements(record)) if (!requirement.met) warnings.push(`In a delivery stage without ${requirement.need}`);
  }
  const trailing = fcpTrailing(record);
  if (trailing) warnings.push(trailing.label);
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
  { kind: "hours_source", label: "Entitled hours (Broadcom record)", required: true },
];

// ---------------------------------------------------------------------------------------------------------------------
// Stage progression: the gate dates grouped under the stage they belong to, for the record's Stages & gates view.
// Display only: the rules above (canTransition, exitGaps, deliveryRequirements) decide every move.

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
export type GateRow = {
  gate: GateKey;
  day: string | null;
  done: boolean;
  /** Blocks Kickoff and In Delivery until recorded (hardGates). */
  hard: boolean;
  planned: boolean;
  /** The FCP approval gate, met by a waiver instead of a date. */
  waived: boolean;
  /** Recorded while its stage is still ahead: the work is running ahead of the stage. */
  ahead: boolean;
  /** An FCP gate still open after the record moved past its stage (fcpTrailing). */
  trailing: boolean;
};
export type StepStatus = "done" | "current" | "upcoming";
export type StageStep = { stage: MainStage; status: StepStatus; gates: GateRow[] };

export type NextAction =
  /** The next gate to record in the current stage. */
  | { kind: "record"; gate: GateKey; stage: MainStage }
  /** A delivery requirement is missing and the next stage (or this one) needs it. */
  | { kind: "unblock"; gate: GateKey; stage: MainStage; requirement: DeliveryRequirement["key"] }
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
  /** What delivery needs, met or not. */
  delivery: DeliveryRequirement[];
  trailing: FcpTrailing | null;
};

/**
 * The record's path through the stages that apply to its segment, each with its applicable gates, and the next action.
 * `exitedFrom` is the main stage the record left for an exit (from its stage history); `dates` are the gate dates.
 */
export function stageProgression(record: Pick<StageRecord, "stage" | "segment" | "fcpWaivedOn"> & { exitedFrom?: Stage | null }, dates: GateDates): StageProgression {
  const exited = isMainStage(record.stage) ? null : record.exitedFrom && isMainStage(record.exitedFrom) ? record.exitedFrom : null;
  const anchor: MainStage | null = isMainStage(record.stage) ? record.stage : exited;
  const facts = { ...dates, stage: record.stage, segment: record.segment, fcpWaivedOn: record.fcpWaivedOn ?? null };
  const delivery = deliveryRequirements(facts);
  const trailing = fcpTrailing(facts);
  const hard = new Set(hardGates(record.segment));
  const approvalGate = fcpApprovalGate(record.segment);
  const waived = delivery[0].waived;
  const steps = applicableStages(record.segment).map(stage => {
    const status: StepStatus =
      anchor === null ? "upcoming" : record.stage === "complete" || stageOrder(stage) < stageOrder(anchor) ? "done" : stage === anchor ? "current" : "upcoming";
    const gates = STAGE_GATES[stage]
      .filter(gate => gateApplies(gate, record.segment))
      .map(gate => {
        const done = Boolean(dates[gate]);
        const gateWaived = waived && gate === approvalGate;
        return {
          gate,
          day: dates[gate] || null,
          done,
          hard: hard.has(gate),
          planned: PLANNED_GATES.has(gate),
          waived: gateWaived,
          ahead: done && status === "upcoming" && anchor !== null,
          trailing: !done && !gateWaived && trailing !== null && (gate === approvalGate || FCP_STEPS.has(gate)) && status === "done",
        };
      });
    return { stage, status, gates };
  });
  const exit = isMainStage(record.stage) ? null : { stage: record.stage as "refused" | "paused" | "lost", from: exited };
  return { steps, exit, next: nextAction(record, steps, delivery, trailing, exited), delivery, trailing };
}

/** The FCP gates before approval. With the segment's approval gate, they are what a trailing FCP still owes. */
const FCP_STEPS: ReadonlySet<GateKey> = new Set<GateKey>(["fcpDraftCreatedOn", "fcpSubmittedOn"]);

function nextAction(record: Pick<StageRecord, "stage" | "segment">, steps: StageStep[], delivery: DeliveryRequirement[], trailing: FcpTrailing | null, exited: MainStage | null): NextAction {
  if (record.stage === "complete") return { kind: "complete" };
  if (record.stage === "refused" || record.stage === "lost") return { kind: "closed", stage: record.stage };
  if (record.stage === "paused") return { kind: "resume", stage: exited };
  const stage = record.stage as MainStage;
  const next = nextStage({ stage, segment: record.segment });
  const unmet = delivery.find(requirement => !requirement.met);
  if (unmet && (requiresPo(stage) || (next && requiresPo(next)))) {
    // A trailing FCP that was never submitted is submitted first, then approved.
    const gate = unmet.key === "fcp_approval" && trailing ? trailing.gate : unmet.gate;
    return { kind: "unblock", gate, stage: requiresPo(stage) ? stage : next!, requirement: unmet.key };
  }
  const pending = steps.find(step => step.stage === stage)?.gates.find(gate => !gate.done && !gate.planned && !gate.waived);
  if (pending) return { kind: "record", gate: pending.gate, stage };
  return next ? { kind: "move", stage: next } : { kind: "complete" };
}
