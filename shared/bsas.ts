import type { ReportContent } from "./report";

/**
 * Broadcom Software Adoption Services (BSAS) planning. Pure, and hours only: BSAS funds work the entitlement cannot
 * carry (the follow-on scope), inside its own term. The entitlement is always spent first, because follow-on work is
 * by definition what falls after the entitlement window or past what the entitlement funds. BSAS hours that no work
 * draws on inside the term are forfeited.
 */

export type BsasTerm = {
  hours: number;
  termStart: string;
  termEnd: string;
  /** The start was not stated, so it is the day after the entitlement ends. */
  startAssumed: boolean;
  /** The end was not stated, so it is twelve months after the BSAS start. */
  endAssumed: boolean;
};

/** One follow-on work package: its hours and planned window (ISO dates, null when it is not on the timeline). */
export type FollowOnWork = { id: string; label: string; hours: number; start: string | null; end: string | null };

export type BsasAllocation = {
  term: BsasTerm;
  /** Follow-on work in start order, with the whole BSAS hours each draws (0 when it falls outside the term or BSAS is used up). */
  rows: Array<FollowOnWork & { bsasHours: number }>;
  /** BSAS hours planned inside the term. */
  plannedHours: number;
  /** BSAS hours no planned work draws on before the term ends; they are lost. */
  forfeitedHours: number;
  /** Follow-on hours BSAS does not cover, which still need a future purchase. */
  unfundedHours: number;
};

const DAY = 86_400_000;
const parse = (value: string | null | undefined): number | null => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
};
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
function addMonths(time: number, months: number): number {
  const date = new Date(time);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date.getUTCDate(), lastDay));
}

/** The BSAS term with its defaults filled in, or null when the deal has no BSAS hours or no start can be placed. */
export function bsasTerm(report: Pick<ReportContent, "bsas">, entitlementEnd: string | null): BsasTerm | null {
  const bsas = report.bsas;
  if (!bsas || !bsas.hours || bsas.hours <= 0) return null;
  const statedStart = parse(bsas.termStart);
  const entitlementEndTime = parse(entitlementEnd);
  const start = statedStart ?? (entitlementEndTime === null ? null : entitlementEndTime + DAY);
  if (start === null) return null;
  const statedEnd = parse(bsas.termEnd);
  const end = statedEnd !== null && statedEnd >= start ? statedEnd : addMonths(start, 12) - DAY;
  return { hours: bsas.hours, termStart: iso(start), termEnd: iso(end), startAssumed: statedStart === null, endAssumed: statedEnd === null || statedEnd < start };
}

/**
 * Draws follow-on work on BSAS in start order. Only the share of a work package's window that falls inside the BSAS
 * term can use BSAS; a work package with no window is placed at the BSAS start. Whole hours, so the tables foot.
 */
export function allocateBsas(term: BsasTerm, work: FollowOnWork[]): BsasAllocation {
  const termStart = parse(term.termStart)!;
  const termEnd = parse(term.termEnd)! + DAY;
  let remaining = Math.round(term.hours);
  const ordered = work.map((row, index) => ({ row, index })).sort((left, right) => (left.row.start ?? term.termStart).localeCompare(right.row.start ?? term.termStart) || left.index - right.index).map(item => item.row);
  const rows = ordered.map(row => {
    const start = parse(row.start);
    const end = parse(row.end);
    let eligible = row.hours;
    if (start !== null) {
      const finish = Math.max(start, end ?? start) + DAY;
      const inside = Math.max(0, Math.min(finish, termEnd) - Math.max(start, termStart));
      eligible = row.hours * (inside / (finish - start));
    }
    const bsasHours = Math.max(0, Math.min(remaining, Math.round(eligible)));
    remaining -= bsasHours;
    return { ...row, bsasHours };
  });
  const plannedHours = rows.reduce((sum, row) => sum + row.bsasHours, 0);
  const followOnHours = rows.reduce((sum, row) => sum + Math.round(row.hours), 0);
  return { term, rows, plannedHours, forfeitedHours: Math.round(term.hours) - plannedHours, unfundedHours: Math.max(0, followOnHours - plannedHours) };
}
