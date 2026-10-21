/**
 * Pure helpers for the dashboard screens: who a record is waiting on, stale stages, data-quality flags, expiry bands,
 * stage counts, the role queues, and the hours burndown math. No I/O; the client and tests share them.
 */
import { OPPORTUNITY_NUMBER_PATTERN, type AssignmentRole } from "./vsaFields";
import { daysBetween, ROLE_VIEW_ASSIGNMENTS, type ExpiryRow, type VsaRole } from "./vsaViews";
import { isTerminal, MAIN_STAGES, stageOrder, type Segment, type Stage } from "./vsaStage";

/** The roles that own the next step in each stage. Paused and closed records wait on nobody. */
export const STAGE_OWNERS: Record<Stage, AssignmentRole[]> = {
  intake: ["sales_rep", "account_manager", "presales"],
  broadcom_request: ["presales", "sales_rep"],
  discovery: ["architect", "presales"],
  fcp_draft: ["architect"],
  broadcom_approval: ["architect", "presales"],
  customer_approval: ["sales_rep", "account_manager", "architect"],
  ra_staffing: ["pm", "sr_consultant"],
  kickoff: ["pm"],
  in_delivery: ["pm", "sr_consultant"],
  complete: [],
  refused: [],
  paused: [],
  lost: [],
};

const SALES_ROLES: AssignmentRole[] = ["sales_rep", "account_manager"];

type Assignment = { role: AssignmentRole; userId: number | null; displayName?: string };
export type DashboardRecord = {
  id: number;
  customerName: string;
  opportunityNumber: string | null;
  stage: Stage;
  stageEnteredOn: string;
  segment: Segment | null;
  waitingOn: "sales" | "customer" | "broadcom" | "cdw_internal" | null;
  entitlementValue: string | null;
  deliveryWindowEnd: string | null;
  assignments: Assignment[];
};

/**
 * True when the record is waiting on this user: it is open, not waiting on the customer or Broadcom, and the user holds
 * a role that owns the stage's next step (or a sales role when the record says it is waiting on sales).
 */
export function awaitingAction(record: Pick<DashboardRecord, "stage" | "waitingOn" | "assignments">, userId: number): boolean {
  if (record.waitingOn === "customer" || record.waitingOn === "broadcom") return false;
  const owners = record.waitingOn === "sales" ? SALES_ROLES : STAGE_OWNERS[record.stage];
  return record.assignments.some(assignment => assignment.userId === userId && owners.includes(assignment.role));
}

/** Days a record may sit in a stage before it counts as stale. Delivery runs for months, so it has no threshold. */
export const STALE_AFTER_DAYS: Partial<Record<Stage, number>> = {
  intake: 7,
  broadcom_request: 14,
  discovery: 21,
  fcp_draft: 21,
  broadcom_approval: 14,
  customer_approval: 21,
  ra_staffing: 14,
  kickoff: 14,
  paused: 60,
};

export function staleness(record: Pick<DashboardRecord, "stage" | "stageEnteredOn">, today: string) {
  const days = daysBetween(record.stageEnteredOn, today);
  const threshold = STALE_AFTER_DAYS[record.stage] ?? null;
  return { days, threshold, stale: threshold !== null && days > threshold };
}

export type QualityFlag = { key: "segment" | "opportunity" | "placeholder_opportunity" | "amount" | "expiry" | "architect"; label: string };

/** Missing or malformed data that makes a record hard to report on. Closed records are not flagged. */
export function dataQualityFlags(record: DashboardRecord): QualityFlag[] {
  if (isTerminal(record.stage)) return [];
  const flags: QualityFlag[] = [];
  if (!record.segment) flags.push({ key: "segment", label: "No segment" });
  if (!record.opportunityNumber) flags.push({ key: "opportunity", label: "No opportunity number" });
  else if (!OPPORTUNITY_NUMBER_PATTERN.test(record.opportunityNumber)) flags.push({ key: "placeholder_opportunity", label: "Opportunity number is not C-OPP" });
  if (record.entitlementValue === null) flags.push({ key: "amount", label: "No VSA amount" });
  if (!record.deliveryWindowEnd) flags.push({ key: "expiry", label: "No expiry date" });
  if (stageOrder(record.stage) > stageOrder("broadcom_request") && record.stage !== "paused" && !record.assignments.some(assignment => assignment.role === "architect")) {
    flags.push({ key: "architect", label: "No architect" });
  }
  return flags;
}

export const EXPIRY_BANDS = [
  { key: "expired", label: "Expired", risk: "stop" },
  { key: "d30", label: "0 to 30 days", risk: "stop" },
  { key: "d60", label: "31 to 60 days", risk: "warn" },
  { key: "d90", label: "61 to 90 days", risk: "warn" },
  { key: "d180", label: "91 to 180 days", risk: "none" },
  { key: "later", label: "Over 180 days", risk: "none" },
  { key: "none", label: "No expiry date", risk: "unknown" },
] as const;
export type ExpiryBand = (typeof EXPIRY_BANDS)[number]["key"];

export function expiryBand(daysLeft: number | null): ExpiryBand {
  if (daysLeft === null) return "none";
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 30) return "d30";
  if (daysLeft <= 60) return "d60";
  if (daysLeft <= 90) return "d90";
  if (daysLeft <= 180) return "d180";
  return "later";
}

/** Entitlements per expiry band, with the VSA amount in each (each entitlement once). */
export function expiryBandTotals(rows: ExpiryRow[]) {
  return EXPIRY_BANDS.map(band => {
    const members = rows.filter(row => expiryBand(row.verdict.daysLeft) === band.key);
    return { ...band, count: members.length, amount: members.reduce((sum, row) => sum + Number(row.entitlementValue ?? 0), 0) };
  });
}

/** VSA amount expiring in each of the next `months` calendar months (UTC), starting with the current month. Expired rows are left out. */
export function expiryByMonth(rows: ExpiryRow[], today: string, months = 12) {
  const [year, month] = today.split("-").map(Number);
  const buckets = Array.from({ length: months }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    const key = date.toISOString().slice(0, 7);
    return { key, label: date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }), count: 0, amount: 0 };
  });
  for (const row of rows) {
    if (!row.deliveryWindowEnd || row.deliveryWindowEnd < today) continue;
    const bucket = buckets.find(item => item.key === row.deliveryWindowEnd!.slice(0, 7));
    if (!bucket) continue;
    bucket.count += 1;
    bucket.amount += Number(row.entitlementValue ?? 0);
  }
  return buckets;
}

/** Open records per main stage (Complete left out), in stage order, plus Paused. */
export function stageCounts(records: Pick<DashboardRecord, "stage">[]) {
  const stages: Stage[] = [...MAIN_STAGES.filter(stage => stage !== "complete"), "paused"];
  return stages.map(stage => ({ stage, count: records.filter(record => record.stage === stage).length }));
}

/** Role queues: saved filters that every user has. `role` queues match the record's assignments for that role view. */
export type QueueId = "awaiting" | "assigned" | VsaRole | "attention";
export const QUEUES: { id: QueueId; label: string; description: string }[] = [
  { id: "awaiting", label: "Awaiting my action", description: "Open records where you own the next step and nobody outside CDW is holding it" },
  { id: "assigned", label: "Assigned to me", description: "Open records with you in any role" },
  { id: "architect", label: "As architect", description: "Open records where you are the architect" },
  { id: "pm", label: "As PM", description: "Open records where you are the PM or senior consultant" },
  { id: "sales", label: "As sales", description: "Open records where you are the sales rep or account manager" },
  { id: "presales", label: "As presales", description: "Open records where you are presales" },
  { id: "attention", label: "Needs attention", description: "Open records with a data-quality flag, a stale stage, or a stage warning" },
];

export function inQueue(record: DashboardRecord, queue: QueueId, userId: number, needsAttention: (record: DashboardRecord) => boolean): boolean {
  if (isTerminal(record.stage)) return false;
  if (queue === "awaiting") return awaitingAction(record, userId);
  if (queue === "assigned") return record.assignments.some(assignment => assignment.userId === userId);
  if (queue === "attention") return needsAttention(record);
  const roles = ROLE_VIEW_ASSIGNMENTS[queue];
  if (!roles) return true;
  return record.assignments.some(assignment => assignment.userId === userId && roles.includes(assignment.role));
}

/** A standard delivery week, for turning a weekly hours pace into FTE. */
export const HOURS_PER_FTE_WEEK = 40;

/**
 * Hours that must be delivered each week to use the remaining hours before expiry. Null when hours are not recorded,
 * the entitlement has expired, or nothing remains.
 */
export function requiredWeeklyPace(hoursRemaining: number | null, daysLeft: number | null): number | null {
  if (hoursRemaining === null || daysLeft === null || daysLeft <= 0 || hoursRemaining <= 0) return null;
  return hoursRemaining / Math.max(daysLeft / 7, 1);
}

export function fteForPace(weeklyPace: number | null): number | null {
  return weeklyPace === null ? null : weeklyPace / HOURS_PER_FTE_WEEK;
}
