import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Chip, EmptyState, Panel, Pill } from "@/components/vsa/elements";
import { downloadServerAttachment } from "@/lib/downloads";
import { trpc } from "@/lib/trpc";
import type { ChangeSummary } from "@shared/fcpChangeSummary";
import { issuedFilename } from "@shared/exportFilename";
import type { EngagementDocument } from "@shared/fcp";
import { defaultReportFormat, REPORT_FORMAT_CHOICES, REPORT_FORMAT_LABELS, type ReportFormatChoice } from "@shared/reportFormat";
import { SEGMENT_NAMES } from "@shared/fcpRecord";
import { requiresBroadcomApproval, type Segment } from "@shared/vsaStage";
import { Columns2, Download, FileCheck2, Loader2, RotateCcw, Send } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

const hours = (value: number) => Math.round(value).toLocaleString("en-US");
const signed = (value: number) => `${value > 0 ? "+" : ""}${hours(value)}`;
const today = () => new Date().toISOString().slice(0, 10);
const when = (value: Date | string | null) => (value ? new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—");
const PACKAGE_CHANGE: Record<ChangeSummary["packages"][number]["change"], string> = { added: "Added", removed: "Removed", "to-follow-on": "Moved to follow-on", "from-follow-on": "Brought back from follow-on", hours: "Hours changed" };

type IssueActions = {
  engagementId: number;
  title: string;
  document: EngagementDocument;
  readOnly: boolean;
  /** Saves the working FCP now, so the issue is of exactly what is on screen. */
  saveDocument: (document: EngagementDocument) => Promise<void>;
  /** Reloads the working FCP from the server after a revise. */
  reload: () => void;
  segment: Segment | null;
  /** The customer format the issue renders in. */
  reportFormat: ReportFormatChoice;
};

const FORMAT_DESCRIPTIONS: Record<ReportFormatChoice, string> = {
  summary: "Two pages: the plan with work packages and hours, then the timeline, key dates and what the customer owes.",
  standard: "Seven pages for Corporate and Strategic: cover, summary, scope and architecture, work packages with acceptance, timeline, roadmap and how we work together.",
  full: "The long report, as before the formats.",
};

/**
 * Which customer format the preview, the draft export and the issue use. It follows the tracker segment; a choice
 * here applies to this session only, and the issued version records the format the customer received.
 */
export function ReportFormatPicker({ segment, value, overridden, onChange }: { segment: Segment | null; value: ReportFormatChoice; overridden: boolean; onChange: (choice: ReportFormatChoice) => void }) {
  const fallback = defaultReportFormat(segment);
  return (
    <Panel title="Customer format" sub={`${segment ? `${SEGMENT_NAMES[segment]} segment` : "No tracker segment"}: ${REPORT_FORMAT_LABELS[fallback]} by default. The preview, the draft export and the next issue use the format chosen here.`} bodyClassName="space-y-2 p-4">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Customer format">
        {REPORT_FORMAT_CHOICES.map(choice => (
          <Button key={choice} role="radio" aria-checked={value === choice} variant={value === choice ? "default" : "outline"} size="sm" onClick={() => onChange(choice)}>{REPORT_FORMAT_LABELS[choice]}{choice === fallback ? " (default)" : ""}</Button>
        ))}
      </div>
      <p className="text-xs text-ink-muted">{FORMAT_DESCRIPTIONS[value]}{overridden ? " Changed from the segment default for this session." : ""}</p>
    </Panel>
  );
}

/**
 * Issuing (docs/FCP-WORKSPACE.md section 13): the working FCP is the draft and every export of it carries the draft
 * mark. Issuing stores it as the next numbered version, exactly as rendered, with the change summary against the one
 * before; that version is what the customer receives, and it never changes.
 */
export function IssuePanel({ engagementId, document, readOnly, saveDocument, reload, reportFormat }: IssueActions) {
  const utils = trpc.useUtils();
  const issued = trpc.fcpRecord.issued.useQuery({ id: engagementId });
  const preview = trpc.fcpRecord.issuePreview.useMutation();
  const issue = trpc.fcpRecord.issue.useMutation();
  const revise = trpc.fcpRecord.revise.useMutation();
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [override, setOverride] = useState("");
  const versions = issued.data?.versions ?? [];
  const current = versions.find(version => version.status === "issued");
  const next = (versions[0]?.issueNumber ?? 0) + 1;
  const refresh = () => Promise.all([utils.fcpRecord.issued.invalidate({ id: engagementId }), utils.fcpRecord.versions.invalidate({ id: engagementId }), utils.tracker.get.invalidate({ id: engagementId })]);

  const check = async () => {
    try {
      await saveDocument(document);
      await preview.mutateAsync({ id: engagementId, reportFormat });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The changes could not be checked");
    }
  };
  const doIssue = async () => {
    try {
      await saveDocument(document);
      const result = await issue.mutateAsync({ id: engagementId, label: label.trim(), revisionNote: note.trim() || null, reportFormat, fundingOverride: override.trim() || null });
      setLabel("");
      setNote("");
      setOverride("");
      preview.reset();
      await refresh();
      toast.success(`Issue ${result.issueNumber} recorded. Download it from the list below to send it.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The FCP was not issued");
    }
  };
  const doRevise = async () => {
    if (!current || !window.confirm(`Start the next revision from issue ${current.issueNumber}? The working FCP is saved to History first, then replaced by issue ${current.issueNumber} as the customer received it.`)) return;
    try {
      await revise.mutateAsync({ id: engagementId });
      await refresh();
      reload();
      toast.success(`The working FCP now starts from issue ${current.issueNumber}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The revision could not be started");
    }
  };
  // A check made in another format no longer describes the issue.
  const result = preview.data && preview.data.reportFormat === reportFormat ? preview.data : undefined;
  const needsOverride = Boolean(result?.fundingProblem) && !override.trim();
  const busy = issue.isPending || preview.isPending || revise.isPending;

  return (
    <Panel
      title={current ? `Issue ${next}` : "Issue the first version"}
      sub={current ? `Issue ${current.issueNumber} is what the customer holds. The working FCP is the draft of issue ${next}, and every export of it carries the draft mark.` : "Until a version is issued, every export carries the draft mark. Issuing stores the FCP exactly as rendered, numbered, so it can always be downloaded again unchanged."}
      actions={current && issued.data?.changedSinceIssue ? <Button variant="outline" size="sm" disabled={readOnly || busy} onClick={() => void doRevise()}><RotateCcw className="size-4" /> Start over from issue {current.issueNumber}</Button> : undefined}
      bodyClassName="space-y-4 p-4"
    >
      {current && issued.data?.changedSinceIssue === false && <p className="text-xs text-ink-muted">No changes since issue {current.issueNumber}.</p>}
      <div className="grid gap-3 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="space-y-1"><Label htmlFor="issue-label" className="text-xs">Label (internal)</Label><Input id="issue-label" maxLength={160} value={label} placeholder={current ? "Post-wave-1 re-issue" : "Initial plan"} onChange={event => setLabel(event.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="issue-note" className="text-xs">Revision note (for the customer)</Label><Textarea id="issue-note" maxLength={2000} className="min-h-16 bg-surface text-xs" value={note} placeholder={current ? "What this revision changes, in a sentence or two." : "Optional for a first issue."} onChange={event => setNote(event.target.value)} /></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={readOnly || busy} onClick={() => void check()}>{preview.isPending && <Loader2 className="size-4 animate-spin" />} Check and show the changes</Button>
        <Button size="sm" disabled={readOnly || busy || !result || result.failures.length > 0 || result.unchanged || needsOverride} onClick={() => void doIssue()}>{issue.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Issue {next}</Button>
      </div>
      {!result && <p className="text-xs text-ink-muted">Check first: it saves the FCP, runs the same content checks as an export in the {REPORT_FORMAT_LABELS[reportFormat]} format, and shows what changed since the last issue.</p>}
      {result?.fundingProblem && (
        <div className="space-y-2 rounded-lg border border-state-warn/30 bg-state-warn-soft p-3 text-xs" role="status">
          <p className="text-state-warn-text"><strong>The hours do not reconcile.</strong> {result.fundingProblem} The customer document never shows the gap. Fix the plan, or give the reason to issue it as it is; the reason is kept on the issued version.</p>
          <Textarea aria-label="Reason to issue anyway" maxLength={2000} className="min-h-14 bg-surface text-xs" value={override} placeholder="Why this plan is issued before its hours reconcile (internal)." onChange={event => setOverride(event.target.value)} />
        </div>
      )}
      {result && result.failures.length > 0 && (
        <div className="rounded-lg border border-state-blocked/30 bg-state-blocked-soft p-3 text-xs text-state-blocked-text" role="status">
          <p className="font-semibold">Fix these before issuing:</p>
          <ul className="mt-1 list-disc pl-5">{result.failures.map(failure => <li key={failure}>{failure}</li>)}</ul>
        </div>
      )}
      {result && result.unchanged && <p className="text-xs text-ink-muted">Nothing has changed since issue {result.basedOnIssue}, so there is nothing to issue.</p>}
      {result?.hoursNote && <p className="text-xs text-ink-muted">{result.hoursNote}</p>}
      {result && result.failures.length === 0 && !result.unchanged && <ChangeSummaryView summary={result.changeSummary} />}
    </Panel>
  );
}

/** Every issued version, newest first: download exactly as issued, and record approvals on the current one. */
export function IssuedVersionsList({ engagementId, title, readOnly, segment }: IssueActions) {
  const issued = trpc.fcpRecord.issued.useQuery({ id: engagementId });
  const ticket = trpc.fcpRecord.issuedDownloadTicket.useMutation();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const versions = issued.data?.versions ?? [];

  const download = async (versionId: number, issueNumber: number, format: "html" | "pdf") => {
    setDownloading(`${versionId}-${format}`);
    try {
      const { url } = await ticket.mutateAsync({ id: engagementId, versionId, format });
      const response = await fetch(url, { credentials: "same-origin" });
      await downloadServerAttachment(response, format, issuedFilename(title, issueNumber, format));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The download could not be started");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Panel title="Issued versions" sub="What the customer received, numbered. Superseded versions stay downloadable exactly as they were issued." actions={versions.length >= 2 ? <Button variant="outline" size="sm" onClick={() => setComparing(true)}><Columns2 className="size-4" /> Compare</Button> : undefined} bodyClassName="p-0">
      {issued.isLoading ? <p className="p-4 text-xs text-ink-muted">Loading…</p> : versions.length === 0 ? <div className="p-4"><EmptyState icon={FileCheck2} title="Nothing issued yet" sub="Issue the first version above when the FCP is ready for the customer." /></div> : (
        <ul className="divide-y divide-s100">
          {versions.map(version => (
            <li key={version.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">Issue {version.issueNumber} {version.status === "issued" ? <Pill verdict="ready">Current</Pill> : <Pill verdict="unknown">Superseded</Pill>}{version.label && version.label !== `Issue ${version.issueNumber}` && <Chip>{version.label}</Chip>}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">Issued {when(version.issuedAt)} by {version.issuedByName ?? "—"} · {version.reportFormat === "summary" ? "Summary" : version.reportFormat === "standard" ? "Standard" : "Full report"}</p>
                  {version.fundingOverrideNote && <p className="mt-1 max-w-3xl text-xs leading-5 text-state-warn-text">Issued before its hours reconciled: {version.fundingOverrideNote}</p>}
                  {version.revisionNote && <p className="mt-1 max-w-3xl text-xs leading-5 text-ink">“{version.revisionNote}”</p>}
                </div>
                <div className="flex gap-1.5">
                  {(["html", "pdf"] as const).map(format => <Button key={format} variant="outline" size="sm" className="h-7" disabled={downloading !== null} onClick={() => void download(version.id, version.issueNumber!, format)}>{downloading === `${version.id}-${format}` ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} {format.toUpperCase()}</Button>)}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Approval engagementId={engagementId} versionId={version.id} party="broadcom" title="Broadcom approval" on={version.broadcomApprovedOn} approver={version.broadcomApproverName} by={version.broadcomApprovedByName} note={version.broadcomApprovalNote} canRecord={version.status === "issued" && !readOnly} notNeeded={!requiresBroadcomApproval(segment)} />
                <Approval engagementId={engagementId} versionId={version.id} party="customer" title="Customer approval" on={version.customerApprovedOn} approver={version.customerApproverName} by={version.customerApprovedByName} note={version.customerApprovalNote} canRecord={version.status === "issued" && !readOnly} notNeeded={false} />
              </div>
              {version.changeSummary && version.changeSummary.basedOnIssue !== null && (
                <details className="rounded-lg border border-s100">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink">Changes since issue {version.changeSummary.basedOnIssue}</summary>
                  <div className="border-t border-s100 p-3"><ChangeSummaryView summary={version.changeSummary} /></div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {comparing && <CompareIssued engagementId={engagementId} versions={versions} onClose={() => setComparing(false)} />}
    </Panel>
  );
}

/** Two issued versions: the change summary from the earlier to the later, and both reports as issued. Read only. */
function CompareIssued({ engagementId, versions, onClose }: { engagementId: number; versions: Array<{ id: number; issueNumber: number | null }>; onClose: () => void }) {
  // Newest first: compare the current issue with the one before it unless the user picks others.
  const [pair, setPair] = useState<[number, number]>([versions[1].id, versions[0].id]);
  const same = pair[0] === pair[1];
  const comparison = trpc.fcpRecord.compareIssued.useQuery({ id: engagementId, versionIds: pair }, { enabled: !same });
  const data = comparison.data;
  const picker = (index: 0 | 1, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`compare-${index}`} className="text-[11px]">{label}</Label>
      <select id={`compare-${index}`} className="h-8 rounded-md border border-s200 bg-surface px-2 text-sm text-ink" value={pair[index]} onChange={event => { const next = [...pair] as [number, number]; next[index] = Number(event.target.value); setPair(next); }}>
        {versions.map(version => <option key={version.id} value={version.id}>Issue {version.issueNumber}</option>)}
      </select>
    </div>
  );
  return (
    <Dialog open onOpenChange={value => !value && onClose()}>
      <DialogContent className="flex h-[94vh] max-w-[min(1600px,97vw)] flex-col sm:max-w-[min(1600px,97vw)]">
        <DialogHeader>
          <DialogTitle>Compare issued versions</DialogTitle>
          <DialogDescription>What changed between two issues, and both as the customer received them. Read only.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">{picker(0, "Compare")}{picker(1, "With")}</div>
        {same ? <p className="text-xs text-ink-muted">Pick two different issues.</p>
          : comparison.error ? <p className="text-xs text-state-blocked-text">{comparison.error.message}</p>
          : !data ? <div className="grid flex-1 place-items-center"><Loader2 className="size-6 animate-spin text-cdw-red" /></div>
          : <>
            <details open className="max-h-[30vh] shrink-0 overflow-auto rounded-lg border border-s100">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink">Changes from issue {data.from.issueNumber} to issue {data.to.issueNumber}</summary>
              <div className="border-t border-s100 p-3"><ChangeSummaryView summary={data.changeSummary} heading={`Issue ${data.from.issueNumber} → issue ${data.to.issueNumber}`} /></div>
            </details>
            <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-2">
              {[data.from, data.to].map(side => (
                <div key={side.id} className="flex min-h-0 flex-col gap-1">
                  <p className="text-xs font-medium text-ink">Issue {side.issueNumber} <span className="font-normal text-ink-muted">· issued {when(side.issuedAt)}</span></p>
                  <iframe title={`Issue ${side.issueNumber} as issued`} sandbox="" srcDoc={side.html} className="min-h-0 w-full flex-1 rounded-lg border border-s100 bg-surface" />
                </div>
              ))}
            </div>
          </>}
      </DialogContent>
    </Dialog>
  );
}

function Approval({ engagementId, versionId, party, title, on, approver, by, note, canRecord, notNeeded }: { engagementId: number; versionId: number; party: "broadcom" | "customer"; title: string; on: string | null; approver: string | null; by: string | null; note: string | null; canRecord: boolean; notNeeded: boolean }) {
  const utils = trpc.useUtils();
  const record = trpc.fcpRecord.recordApproval.useMutation();
  const [draft, setDraft] = useState({ on: today(), approverName: "", note: "" });
  const save = async () => {
    try {
      await record.mutateAsync({ id: engagementId, versionId, party, on: draft.on, approverName: draft.approverName.trim(), note: draft.note.trim() || null });
      await Promise.all([utils.fcpRecord.issued.invalidate({ id: engagementId }), utils.tracker.get.invalidate({ id: engagementId })]);
      toast.success(`${title} recorded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `${title} was not recorded`);
    }
  };
  let body: ReactNode;
  if (on) body = <p className="text-xs text-ink"><Pill verdict="ready">Approved</Pill> <span className="ml-1">{on}{approver && <> · approved by {approver}</>} · recorded by {by ?? "—"}</span>{note && <span className="mt-1 block text-ink-muted">{note}</span>}</p>;
  else if (notNeeded) body = <p className="text-xs text-ink-muted">Not needed for a Commercial engagement.</p>;
  else if (!canRecord) body = <p className="text-xs text-ink-muted">Not recorded.</p>;
  else body = (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1"><Label htmlFor={`approval-${party}-${versionId}`} className="text-[11px]">Approved on</Label><Input id={`approval-${party}-${versionId}`} type="date" max={today()} className="h-8 w-40" value={draft.on} onChange={event => setDraft({ ...draft, on: event.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor={`approver-${party}-${versionId}`} className="text-[11px]">Approved by</Label><Input id={`approver-${party}-${versionId}`} className="h-8 w-48" maxLength={160} placeholder="Name and role" value={draft.approverName} onChange={event => setDraft({ ...draft, approverName: event.target.value })} /></div>
      <Input aria-label={`${title} note`} className="h-8 min-w-0 flex-1" maxLength={2000} placeholder="Note (optional): how it was given" value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} />
      <Button size="sm" className="h-8" disabled={record.isPending || !/^\d{4}-\d{2}-\d{2}$/.test(draft.on) || !draft.approverName.trim()} onClick={() => void save()}>{record.isPending && <Loader2 className="size-4 animate-spin" />} Record</Button>
    </div>
  );
  return <div className="rounded-lg border border-s100 p-3"><p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">{title}</p>{body}</div>;
}

/** The computed changes, in hours and dates. Read-only: the revision note is where the wording goes. */
export function ChangeSummaryView({ summary, heading }: { summary: ChangeSummary; heading?: string }) {
  if (summary.basedOnIssue === null) return <p className="text-xs text-ink-muted">First issue: there is nothing earlier to compare with. Entitlement hours {hours(summary.entitlementHours.after)}; follow-on {hours(summary.followOnHours.after)}.</p>;
  const rows: Array<[string, ReactNode]> = [];
  if (summary.packages.length) rows.push(["Work packages", <ul className="space-y-0.5">{summary.packages.map(item => <li key={item.id}><strong className="font-medium text-ink">{item.label}</strong>: {PACKAGE_CHANGE[item.change]}{item.change === "hours" || item.change === "added" || item.change === "removed" || item.change === "to-follow-on" || item.change === "from-follow-on" ? ` (${hours(item.hoursBefore)} → ${hours(item.hoursAfter)} h, ${signed(item.hoursAfter - item.hoursBefore)})` : ""}</li>)}</ul>]);
  rows.push(["Entitlement hours", `${hours(summary.entitlementHours.before)} → ${hours(summary.entitlementHours.after)} (${signed(summary.entitlementHours.after - summary.entitlementHours.before)})`]);
  if (summary.followOnHours.before !== summary.followOnHours.after) rows.push(["Follow-on hours", `${hours(summary.followOnHours.before)} → ${hours(summary.followOnHours.after)} (${signed(summary.followOnHours.after - summary.followOnHours.before)})`]);
  if (summary.windows.length) rows.push(["Windows", <ul className="space-y-0.5">{summary.windows.map(item => <li key={item.id}><strong className="font-medium text-ink">{item.label}</strong>: {item.before ? `${item.before.start} – ${item.before.end}` : "—"} → {item.after ? `${item.after.start} – ${item.after.end}` : "—"}</li>)}</ul>]);
  if (summary.dates.length) rows.push(["Key dates", <ul className="space-y-0.5">{summary.dates.map(item => <li key={item.key}>{item.label}: {item.before ?? "not set"} → {item.after ?? "not set"}</li>)}</ul>]);
  if (summary.outcomesOn.length) rows.push(["Outcomes added", summary.outcomesOn.join("; ")]);
  if (summary.outcomesOff.length) rows.push(["Outcomes removed", summary.outcomesOff.join("; ")]);
  if (summary.depths.length) rows.push(["Depth", summary.depths.map(item => `${item.area}: ${item.before} → ${item.after}`).join("; ")]);
  if (summary.consumption) rows.push(["Consumption", `${hours(summary.consumption.hours)} hours delivered, as of ${summary.consumption.asOf}`]);
  return (
    <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="col-span-full text-[11px] font-medium uppercase tracking-wide text-ink-muted">{heading ?? `Since issue ${summary.basedOnIssue}`}</dt>
      {rows.map(([term, value]) => [<dt key={`${term}-t`} className="text-ink-muted">{term}</dt>, <dd key={`${term}-d`} className="text-ink">{value}</dd>])}
    </dl>
  );
}

/** The rail's short list of issued versions, above History. */
export function IssuedRailList({ engagementId, onOpen }: { engagementId: number; onOpen: () => void }) {
  const issued = trpc.fcpRecord.issued.useQuery({ id: engagementId });
  const versions = issued.data?.versions ?? [];
  return (
    <section className="rounded-lg border border-s100 bg-surface p-1.5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Issued</p>
        <button type="button" className="text-[11px] font-medium text-ink underline-offset-2 hover:underline" onClick={onOpen}>Open</button>
      </div>
      {versions.length === 0 ? <p className="px-2 pb-1.5 text-xs text-ink-muted">Nothing issued yet{issued.data ? "" : "…"}</p> : (
        <ol className="space-y-0.5">
          {versions.slice(0, 4).map(version => (
            <li key={version.id}><button type="button" onClick={onOpen} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-[13px] hover:bg-surface-sunken"><span className="text-ink">Issue {version.issueNumber}</span><span className="text-[11px] text-ink-muted">{version.status === "issued" ? "Current" : "Superseded"}</span></button></li>
          ))}
        </ol>
      )}
    </section>
  );
}
