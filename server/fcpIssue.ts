import type { ScopedEffort } from "../shared/effort";
import { computeChangeSummary, isEmptyChange, type ChangeSummary } from "../shared/fcpChangeSummary";
import { migrateDocument, type EngagementDocument } from "../shared/fcp";
import { deliveredNotes } from "../shared/consumption";
import { defaultReportFormat, fundingProblem, needsBroadcomSignature, reportFormatOption, type ReportFormat, type ReportFormatChoice } from "../shared/reportFormat";
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
  // The Standard's document control prints the superseded version's recorded approvals.
  const issued = format === "standard" ? (await db.listIssuedVersions(viewer, engagementId)) ?? [] : [];
  const supersedes = (issueNumber: number) => {
    const prior = issued.find(item => item.issueNumber === issueNumber - 1);
    return prior ? { supersedes: { issueNumber: issueNumber - 1, broadcomApprovedOn: prior.broadcomApprovedOn ?? null, customerApprovedOn: prior.customerApprovedOn ?? null } } : {};
  };
  const render = (version: { issueNumber: number; issuedOn: string }) => renderCondensedFcpHtml(row.title, document, { effort, ...(today ? { today } : {}), ...(format ? { format, version, deliveredNotes: notes, ...(format === "standard" ? { ...supersedes(version.issueNumber), broadcomSignature: needsBroadcomSignature(row.segment) } : {}) } : {}) });
  const html = render({ issueNumber: (latest?.issueNumber ?? 0) + 1, issuedOn });
  const previous = latest && latest.issueNumber !== null && latest.effortSnapshot ? { document: latest.data, effort: latest.effortSnapshot, issueNumber: latest.issueNumber } : null;
  const changeSummary = computeChangeSummary(previous, { document, effort });
  // Unchanged means the customer would receive the same pages: rendered as the current issue was, number and date included.
  const asIssued = latest && latest.issueNumber !== null && latest.issuedAt && (latest.reportFormat ?? null) === (format ?? null) ? render({ issueNumber: latest.issueNumber, issuedOn: latest.issuedAt.toISOString().slice(0, 10) }) : null;
  return {
    title: row.title,
    document,
    effort,
    html,
    failures: condensedReleaseFailures(html, document, effort, format),
    fundingProblem: fundingProblem(document, effort, today),
    reportFormat,
    changeSummary,
    unchanged: Boolean(previous) && isEmptyChange(changeSummary) && asIssued !== null && latest?.renderedHtml === asIssued,
    basedOn: latest && latest.issueNumber !== null ? { id: latest.id, issueNumber: latest.issueNumber } : null,
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
