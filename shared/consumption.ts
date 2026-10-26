import type { EngagementDocument } from "./fcp";

/** One point of the consumption history: hours consumed to date, as of a day. Pure. */
export type ConsumptionPoint = { asOf: string; consumedHours: number };

/**
 * The document with the hours consumed the FCP prints. A new entry replaces the printed figure only when it is at
 * least as recent as it, so recording an older correction never moves the burndown backwards in time. `force` applies
 * the entry regardless, for "use the latest entry".
 */
export function withLatestConsumption(document: EngagementDocument, point: ConsumptionPoint, force = false): EngagementDocument {
  const { entitlement } = document.report;
  if (!force && entitlement.consumedAsOf && point.asOf < entitlement.consumedAsOf) return document;
  if (entitlement.consumedAsOf === point.asOf && entitlement.hoursConsumed === point.consumedHours) return document;
  return { ...document, report: { ...document.report, entitlement: { ...entitlement, hoursConsumed: point.consumedHours, consumedAsOf: point.asOf } } };
}

/** Hours delivered between two points of the history; null when either end is missing. */
export function consumedBetween(before: ConsumptionPoint | null, after: ConsumptionPoint | null): { hours: number; asOf: string } | null {
  if (!after) return null;
  return { hours: Math.max(0, Math.round((after.consumedHours - (before?.consumedHours ?? 0)) * 100) / 100), asOf: after.asOf };
}
