/**
 * Pure helpers for the tracker screens: role views, the expiry view, and the entitlement rollup.
 * Alternative plans that share one entitlement (same entitlementGroupId) are counted once, never summed.
 */
import type { AssignmentRole } from "./vsaFields";
import { isTerminal, type Segment, type Stage } from "./vsaStage";

export type VsaRole = "sales" | "architect" | "presales" | "pm" | "leadership";

/** The assignment roles each role view filters on. Leadership sees every record. */
export const ROLE_VIEW_ASSIGNMENTS: Record<VsaRole, AssignmentRole[] | null> = {
  sales: ["sales_rep", "account_manager"],
  architect: ["architect"],
  presales: ["presales"],
  pm: ["pm", "sr_consultant"],
  leadership: null,
};

export const ROLE_VIEW_LABELS: Record<VsaRole, string> = {
  sales: "Sales",
  architect: "Architect",
  presales: "Presales",
  pm: "PM",
  leadership: "Leadership",
};

type Assigned = { assignments: { role: AssignmentRole; userId: number | null }[] };

/** True when the record belongs in this user's role view. */
export function inRoleView(record: Assigned, userId: number, role: VsaRole | null): boolean {
  const roles = role ? ROLE_VIEW_ASSIGNMENTS[role] : null;
  if (!roles) return true;
  return record.assignments.some(assignment => assignment.userId === userId && roles.includes(assignment.role));
}

export function daysBetween(fromDay: string, toDay: string) {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
}

/** Money per the CDW written style: dollar sign, commas, double zeros. */
export function formatMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number(value));
}

export function formatDay(day: string | null | undefined) {
  if (!day) return "—";
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export type ExpiryVerdict = { pill: "stop" | "warn" | "ready" | "unknown"; label: string };

/** Window within which an approaching expiry is a warning. */
export const EXPIRY_WARNING_DAYS = 90;

export function expiryVerdict(deliveryWindowEnd: string | null, today: string): ExpiryVerdict & { daysLeft: number | null } {
  if (!deliveryWindowEnd) return { pill: "unknown", label: "No expiry date", daysLeft: null };
  const daysLeft = daysBetween(today, deliveryWindowEnd);
  if (daysLeft < 0) return { pill: "stop", label: "Expired", daysLeft };
  if (daysLeft <= EXPIRY_WARNING_DAYS) return { pill: "warn", label: "Expiring", daysLeft };
  return { pill: "ready", label: "In window", daysLeft };
}

export type ExpiryInput = {
  id: number;
  customerName: string;
  opportunityNumber: string | null;
  stage: Stage;
  segment: Segment | null;
  deliveryWindowEnd: string | null;
  entitlementValue: string | null;
  entitlementGroupId: number | null;
};

export type ExpiryRow = {
  /** "group:<id>" for alternative plans, "record:<id>" otherwise. */
  key: string;
  records: ExpiryInput[];
  customerName: string;
  deliveryWindowEnd: string | null;
  /** The shared entitlement, counted once. */
  entitlementValue: string | null;
  verdict: ExpiryVerdict & { daysLeft: number | null };
  notes: string[];
};

/**
 * One row per entitlement: a single record, or a group of alternative plans. Closed records (complete, refused, lost)
 * are left out. A group uses its earliest expiry, and its shared entitlement once.
 */
export function expiryRows(records: ExpiryInput[], today: string): ExpiryRow[] {
  const open = records.filter(record => !isTerminal(record.stage));
  const groups = new Map<string, ExpiryInput[]>();
  for (const record of open) {
    const key = record.entitlementGroupId !== null ? `group:${record.entitlementGroupId}` : `record:${record.id}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const rows: ExpiryRow[] = [];
  for (const [key, members] of Array.from(groups)) {
    const notes: string[] = [];
    const dates = members.map(member => member.deliveryWindowEnd).filter((day): day is string => Boolean(day)).sort();
    const values = Array.from(new Set(members.map(member => member.entitlementValue).filter((value): value is string => value !== null)));
    if (members.length > 1) notes.push(`${members.length} alternative plans share this entitlement; it is counted once`);
    if (values.length > 1) notes.push("The alternative plans record different VSA amounts; the largest is shown");
    if (new Set(dates).size > 1) notes.push("The alternative plans record different expiry dates; the earliest is shown");
    const deliveryWindowEnd = dates[0] ?? null;
    rows.push({
      key,
      records: members,
      customerName: Array.from(new Set(members.map(member => member.customerName))).join(" / "),
      deliveryWindowEnd,
      entitlementValue: values.length ? values.reduce((max, value) => (Number(value) > Number(max) ? value : max)) : null,
      verdict: expiryVerdict(deliveryWindowEnd, today),
      notes,
    });
  }
  // Soonest expiry first; records with no date last.
  return rows.sort((a, b) => (a.deliveryWindowEnd ?? "9999-12-31").localeCompare(b.deliveryWindowEnd ?? "9999-12-31") || a.customerName.localeCompare(b.customerName));
}

/** Total entitlement across rows, each entitlement once. Returns the total and how many rows had no amount. */
export function entitlementTotal(rows: ExpiryRow[]) {
  return rows.reduce(
    (sum, row) => (row.entitlementValue === null ? { ...sum, missing: sum.missing + 1 } : { ...sum, total: sum.total + Number(row.entitlementValue) }),
    { total: 0, missing: 0 },
  );
}
