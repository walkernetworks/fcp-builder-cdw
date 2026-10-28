import type { ScopedEffort } from "../shared/effort";
import { computeChangeSummary, type ChangeSummary } from "../shared/fcpChangeSummary";
import { migrateDocument, type EngagementDocument } from "../shared/fcp";
import { deliveredNotes } from "../shared/consumption";
import { defaultReportFormat, fundingProblem, needsBroadcomSignature, reportFormatOption, type IssueContext, type ReportFormat, type ReportFormatChoice } from "../shared/reportFormat";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import * as db from "./db";
import { scopedEffortForDocument } from "./rateCard";
import type { Viewer } from "./visibility";

/**
 * Why the customer FCP may not go to the customer: the content checks, and the entitlement window costing more than
 * the entitlement value (unless the plan is flagged under-funded). The same gate for exports and for issuing.
 */
export function condensedReleaseFailures(html: string, document: EngagementDocument, effort: ScopedEffort, format?: ReportFormat): string[] {
  const failures = checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount, bsasOnly: document.fields.fundingSource === "bsas", format });
  // The entitlement window never goes over the entitlement value. Under v2 only protected, design and pinned work
  // can keep it over once the squeeze has run; that plan is flagged under-funded in the document and still exports.
  if (effort.internal.cost?.status === "over" && !effort.internal.fit?.underFunded) failures.push("The entitlement window costs more than the entitlement value. Reduce hours or move work to the Two-Year Notional on the Entitlement Adoption Timeline step.");
  return failures;
}

/**
 * Key order, undefined fields and generated-at stamps do not matter: a stored JSON snapshot and a freshly built object
 * compare by their data (the document's readiness list is stamped with the time it was generated).
 */
const canonical = (value: unknown): string => JSON.stringify(JSON.parse(JSON.stringify(value ?? null)), (key, item) => (key === "generatedAt" ? undefined : item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))) : item));
export const sameData = (left: unknown, right: unknown) => canonical(left) === canonical(right);

export type PreparedIssue = {
  title: string;
  document: EngagementDocument;
  effort: ScopedEffort;
  html: string;
  failures: string[];
  /** The plan's hours do not reconcile with its funding: issuing needs a logged reason. Internal wording. */
  fundingProblem: string | null;
  /** The format the customer receives, from the tracker segment unless the issue overrides it. */
  reportFormat: ReportFormatChoice;
  changeSummary: ChangeSummary;
  /** Nothing changed since the current issued version. */
  unchanged: boolean;
  basedOn: { id: number; issueNumber: number } | null;
  /** What the Standard's document control and acceptance block were rendered with; stored on the version at issue. */
  issueContext: IssueContext | null;
};

/**
 * The next issue as it would be: the saved FCP, migrated as on load, rendered without the draft mark in the customer's
 * format with the next issue number, checked, and compared with the current issued version. Writes nothing.
 */
export async function prepareIssue(viewer: Viewer, engagementId: number, options: { today?: string; reportFormat?: ReportFormatChoice } = {}): Promise<PreparedIssue | undefined> {
  const row = await db.getEngagement(viewer, engagementId);
  if (!row) return undefined;
  const today = options.today;
  const issuedOn = today ?? new Date().toISOString().slice(0, 10);
  const document = migrateDocument(row.data);
  const effort = scopedEffortForDocument(document, today);
  const reportFormat = options.reportFormat ?? defaultReportFormat(row.segment);
  const format = reportFormatOption(reportFormat);
  const latest = await db.getLatestIssuedVersion(viewer, engagementId);
  const notes = format ? await recordDeliveredNotes(viewer, engagementId, document) : [];
  // What the document control and acceptance block say beyond the data is captured here, at issue time, from the version
  // this issue supersedes, and stored with the version. It is never recomputed, so an approval recorded on the previous
  // version later does not rewrite an issued version.
  const issueContext: IssueContext | null = format
    ? { supersedes: latest && latest.issueNumber !== null ? { issueNumber: latest.issueNumber, broadcomApprovedOn: latest.broadcomApprovedOn ?? null, customerApprovedOn: latest.customerApprovedOn ?? null } : null, broadcomSignature: needsBroadcomSignature(row.segment) }
    : null;
  const html = renderCondensedFcpHtml(row.title, document, { effort, ...(today ? { today } : {}), ...(format ? { format, version: { issueNumber: (latest?.issueNumber ?? 0) + 1, issuedOn }, deliveredNotes: notes, ...(format === "standard" && issueContext ? { ...(issueContext.supersedes ? { supersedes: issueContext.supersedes } : {}), broadcomSignature: issueContext.broadcomSignature } : {}) } : {}) });
  const previous = latest && latest.issueNumber !== null && latest.effortSnapshot ? { document: latest.data, effort: latest.effortSnapshot, issueNumber: latest.issueNumber } : null;
  const changeSummary = computeChangeSummary(previous, { document, effort });
  // Unchanged means the data is the same as the current issue's stored snapshots, in the same format. Not the rendered
  // pages: a renderer change, or an approval recorded since, never makes an issued version look changed.
  const unchanged = Boolean(previous) && (latest!.reportFormat ?? null) === (format ?? null) && sameData(migrateDocument(latest!.data), document) && sameData(latest!.effortSnapshot, effort);
  return {
    title: row.title,
    document,
    effort,
    html,
    failures: condensedReleaseFailures(html, document, effort, format),
    fundingProblem: fundingProblem(document, effort, today),
    reportFormat,
    changeSummary,
    unchanged,
    basedOn: latest && latest.issueNumber !== null ? { id: latest.id, issueNumber: latest.issueNumber } : null,
    issueContext,
  };
}

/** The consumption entries' notes behind the delivered hours the FCP prints, for its "Delivered to date" row. */
export async function recordDeliveredNotes(viewer: Viewer, engagementId: number, document: EngagementDocument): Promise<string[]> {
  return deliveredNotes((await db.listConsumptionEntries(viewer, engagementId)) ?? [], document.report.entitlement.consumedAsOf);
}

export type IssuedComparison = {
  from: { id: number; issueNumber: number; issuedAt: Date | null; html: string };
  to: { id: number; issueNumber: number; issuedAt: Date | null; html: string };
  changeSummary: ChangeSummary;
};

/**
 * Two issued versions side by side: the change summary from the earlier to the later, computed from their stored
 * snapshots, and the HTML each was issued as. Undefined when either is not an issued version of this visible record.
 * Writes nothing.
 */
export async function compareIssued(viewer: Viewer, engagementId: number, versionIds: [number, number]): Promise<IssuedComparison | undefined> {
  const loaded = await Promise.all(versionIds.map(versionId => db.getIssuedVersion(viewer, engagementId, versionId)));
  if (loaded.some(version => !version || version.issueNumber === null || !version.effortSnapshot || version.renderedHtml === null)) return undefined;
  const [earlier, later] = (loaded as NonNullable<(typeof loaded)[number]>[]).sort((a, b) => a.issueNumber! - b.issueNumber!);
  const side = (version: typeof earlier) => ({ id: version.id, issueNumber: version.issueNumber!, issuedAt: version.issuedAt, html: version.renderedHtml! });
  return {
    from: side(earlier),
    to: side(later),
    changeSummary: computeChangeSummary({ document: earlier.data, effort: earlier.effortSnapshot!, issueNumber: earlier.issueNumber }, { document: later.data, effort: later.effortSnapshot! }),
  };
}
