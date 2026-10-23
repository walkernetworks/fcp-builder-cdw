import type { ScopedEffort } from "../shared/effort";
import { computeChangeSummary, isEmptyChange, type ChangeSummary } from "../shared/fcpChangeSummary";
import { migrateDocument, type EngagementDocument } from "../shared/fcp";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import * as db from "./db";
import { scopedEffortForDocument } from "./rateCard";
import type { Viewer } from "./visibility";

/**
 * Why a Condensed FCP may not go to the customer: the content checks, and the entitlement window costing more than the
 * entitlement value (unless the plan is flagged under-funded). The same gate for exports and for issuing.
 */
export function condensedReleaseFailures(html: string, document: EngagementDocument, effort: ScopedEffort): string[] {
  const failures = checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount, bsasOnly: document.fields.fundingSource === "bsas" });
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
  changeSummary: ChangeSummary;
  /** Nothing changed since the current issued version. */
  unchanged: boolean;
  basedOn: { id: number; issueNumber: number } | null;
};

/**
 * The next issue as it would be: the saved FCP, migrated as on load, rendered without the draft mark, checked, and
 * compared with the current issued version. Writes nothing.
 */
export async function prepareIssue(viewer: Viewer, engagementId: number, today?: string): Promise<PreparedIssue | undefined> {
  const row = await db.getEngagement(viewer, engagementId);
  if (!row) return undefined;
  const document = migrateDocument(row.data);
  const effort = scopedEffortForDocument(document, today);
  const html = renderCondensedFcpHtml(row.title, document, { effort, ...(today ? { today } : {}) });
  const latest = await db.getLatestIssuedVersion(viewer, engagementId);
  const previous = latest && latest.issueNumber !== null && latest.effortSnapshot ? { document: latest.data, effort: latest.effortSnapshot, issueNumber: latest.issueNumber } : null;
  const changeSummary = computeChangeSummary(previous, { document, effort });
  return {
    title: row.title,
    document,
    effort,
    html,
    failures: condensedReleaseFailures(html, document, effort),
    changeSummary,
    unchanged: Boolean(previous) && isEmptyChange(changeSummary) && latest?.renderedHtml === html,
    basedOn: latest && latest.issueNumber !== null ? { id: latest.id, issueNumber: latest.issueNumber } : null,
  };
}
