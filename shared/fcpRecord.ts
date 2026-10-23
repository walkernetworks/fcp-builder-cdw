/**
 * Phase 4: the FCP workspace per record. Pure rules for the source checklist the FCP fills in, the hours source,
 * and the build lock. docs/VSA-TRACKER-DATA-MODEL.md section 13.
 */
import type { EngagementDocument } from "./fcp";
import type { SourceItemKind, SourceItemStatus } from "./vsaFields";
import type { Segment } from "./vsaStage";

// ---------------------------------------------------------------------------------------------------------------------
// Source checklist evidence

export type SourceItemState = { id: number; kind: SourceItemKind; status: SourceItemStatus; reference: string | null };
export type SourceItemUpdate = { id: number; status: "received"; receivedOn: string; reference: string; note: string };

const dayOf = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null);

/** Hours from the signed Broadcom resource assignment, or null when none is recorded. */
export function signedAssignmentHours(document: EngagementDocument): number | null {
  const rows = document.report?.resourceAssignments ?? [];
  const total = rows.reduce((sum, row) => sum + row.architect + row.srConsultant + row.projectManager + (row.seniorArchitect ?? 0) + (row.offshoreProjectManager ?? 0), 0);
  return total > 0 ? total : null;
}

function briefImported(document: EngagementDocument) {
  const report = document.report;
  if (!report) return false;
  return report.whatWeHeard.length > 0 || report.personnel.length > 0 || report.openQuestions.length > 0 || report.sources.length > 0;
}

/**
 * Source items the FCP document now evidences. Only items still needed or requested move, and only to received:
 * a person's verified or waived decision is never changed, and nothing moves backward.
 */
export function sourceUpdatesFromDocument(document: EngagementDocument, items: SourceItemState[], today: string): SourceItemUpdate[] {
  const updates: SourceItemUpdate[] = [];
  const open = (kind: SourceItemKind) => items.filter(item => item.kind === kind && (item.status === "needed" || item.status === "requested"));

  const files = document.inventorySources ?? [];
  if (files.length) {
    const latest = files.map(file => dayOf(file.importedAt)).filter((day): day is string => Boolean(day)).sort().pop() ?? today;
    for (const item of open("rvtools")) updates.push({ id: item.id, status: "received", receivedOn: latest, reference: files.map(file => file.filename).join(", ").slice(0, 1024), note: "Received when RVTools was imported into the FCP (aggregates only; the files stay in the browser)." });
  }
  if (briefImported(document)) {
    const titles = (document.report?.sources ?? []).map(source => source.title).filter(Boolean).join(", ");
    for (const item of open("customer_brief")) updates.push({ id: item.id, status: "received", receivedOn: today, reference: (titles || "Copilot customer brief").slice(0, 1024), note: "Received when the customer brief was imported into the FCP." });
  }
  const signed = signedAssignmentHours(document);
  if (signed !== null) {
    for (const item of open("hours_source")) updates.push({ id: item.id, status: "received", receivedOn: today, reference: `Signed resource assignment: ${signed.toLocaleString("en-US")} hours`, note: "Received when signed resource-assignment hours were entered in the FCP." });
  }
  return updates;
}

// ---------------------------------------------------------------------------------------------------------------------
// Hours source

export type HoursSource = { kind: "signed-assignment" | "catalog-estimate" | "bracket-estimate"; label: string; detail: string; hours: number | null };

/** Where the plan's hours come from. A signed resource assignment replaces the calculated estimate. */
export function hoursSource(document: EngagementDocument): HoursSource {
  const signed = signedAssignmentHours(document);
  if (signed !== null) return { kind: "signed-assignment", label: "Signed resource assignment", detail: "Hours by role from the signed Broadcom work plan. They replace the calculated estimate in the report.", hours: signed };
  if (document.fields.hoursModel === "v1") return { kind: "bracket-estimate", label: "Estimate: host brackets (hours model v1)", detail: "Calculated from host-count brackets. Replace it with the signed resource assignment when Broadcom issues the RA.", hours: null };
  return { kind: "catalog-estimate", label: "Estimate: services catalog (hours model v2)", detail: "Calculated from the services catalog for this plan's topology. Replace it with the signed resource assignment when Broadcom issues the RA.", hours: null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Build lock

/** The holder renews the lock every minute; a lock not renewed for this long is treated as released. */
export const BUILD_LOCK_HEARTBEAT_MS = 60_000;
export const BUILD_LOCK_STALE_MS = 3 * 60_000;

export type LockState = "free" | "mine" | "other";

export function buildLockState(lock: { userId: number | null; at: Date | string | null }, viewerId: number, now: number): LockState {
  if (lock.userId === null || lock.at === null) return "free";
  if (now - new Date(lock.at).getTime() > BUILD_LOCK_STALE_MS) return "free";
  return lock.userId === viewerId ? "mine" : "other";
}

// ---------------------------------------------------------------------------------------------------------------------
// Deal segment and plan type. The tracker segment (`engagements.segment`) is the deal segment; the FCP's
// `commercialPlan` is a plan input a person sets. Neither is ever copied over the other on an existing record.
// docs/FCP-WORKSPACE.md section 8.2.

/**
 * Whether a stored FCP is built as Commercial, read from its saved fields without parsing the whole document. A
 * document saved before `commercialPlan` existed reads as `migrateDocument` derives it: Commercial when its segment was.
 */
export function storedCommercialPlan(commercialPlan: unknown, customerSegment: unknown): boolean {
  return typeof commercialPlan === "boolean" ? commercialPlan : customerSegment === "commercial";
}

/** The tracker segment and the plan type disagree. An unset tracker segment has nothing to disagree with. */
export function segmentDisagrees(segment: Segment | null, commercialPlan: boolean): boolean {
  if (!segment) return false;
  return (segment === "commercial") !== commercialPlan;
}

export type SegmentChoice = "match-tracker" | "keep-plan";
/** A person's decision on a segment mismatch, stored on the record (`engagements.segmentReview`). */
export type SegmentReview = { segment: Segment; commercialPlan: boolean; choice: SegmentChoice; byUserId: number; byName: string | null; at: string };

export const SEGMENT_NAMES: Record<Segment, string> = { corporate: "Corporate", strategic: "Strategic", commercial: "Commercial" };
const planName = (commercialPlan: boolean) => (commercialPlan ? "Commercial" : "Standard");

/**
 * The readiness warning for a tracker segment that disagrees with the plan type, or null. A person's decision on
 * exactly this pair silences it; a change to either side raises it again. The system never resolves it.
 */
export function segmentWarning(segment: Segment | null, commercialPlan: boolean, review: SegmentReview | null): string | null {
  if (!segment || !segmentDisagrees(segment, commercialPlan)) return null;
  if (review && review.segment === segment && review.commercialPlan === commercialPlan) return null;
  return `Tracker segment is ${SEGMENT_NAMES[segment]}; this plan is built as ${planName(commercialPlan)}.`;
}

/** The plan type that matches a tracker segment. */
export function commercialPlanForSegment(segment: Segment): boolean {
  return segment === "commercial";
}

/** The History label for a decision. */
export function segmentDecisionLabel(segment: Segment, commercialPlan: boolean, choice: SegmentChoice): string {
  return choice === "match-tracker"
    ? `Segment decision: plan changed to ${planName(commercialPlan)} to match the tracker segment (${SEGMENT_NAMES[segment]})`
    : `Segment decision: plan kept as ${planName(commercialPlan)}; tracker segment is ${SEGMENT_NAMES[segment]}`;
}

/** The History chip for each reason a copy was kept. */
export const HISTORY_REASON_LABEL = { manual: "Saved", submitted: "Submitted", export: "Exported", restore: "Before restore", decision: "Decision" } as const;
