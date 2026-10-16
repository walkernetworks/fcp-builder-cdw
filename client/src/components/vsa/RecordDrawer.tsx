import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { SEGMENT_LABELS, todayIso, type TrackerRecord } from "@/lib/vsa";
import type { SourceItemStatus } from "@shared/vsaFields";
import { canTransition, customerApprovalItems, STAGE_LABELS, STAGES, stageWarnings, type Stage } from "@shared/vsaStage";
import { expiryVerdict, formatDay, formatMoney } from "@shared/vsaViews";
import { ArrowRight, ExternalLink, FileText, History, ListChecks, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { Chip, DataMount, Pill, type Verdict } from "./elements";

const SOURCE_VERDICT: Record<SourceItemStatus, { verdict: Verdict; label: string }> = {
  needed: { verdict: "warn", label: "Needed" },
  requested: { verdict: "refresh", label: "Requested" },
  received: { verdict: "ready", label: "Received" },
  verified: { verdict: "go", label: "Verified" },
  waived: { verdict: "unknown", label: "Waived" },
};

const ROLE_LABELS: Record<string, string> = { sales_rep: "Sales rep", account_manager: "Account manager", presales: "Presales", architect: "Architect", pm: "PM", sr_consultant: "Sr. consultant", broadcom_ad: "Broadcom AD" };

/** Right-side detail for one engagement. Esc and the backdrop close it; focus returns to the card that opened it. */
export function RecordDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const record = trpc.tracker.get.useQuery({ id: id ?? 0 }, { enabled: id !== null });
  const query = { ...record, data: record.data ?? undefined, error: record.error ? { message: record.error.message } : null };
  return (
    <Sheet open={id !== null} onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-s50 p-0 sm:max-w-[560px]">
        {!record.data && <SheetTitle className="sr-only">Engagement details</SheetTitle>}
        <DataMount id="recordDrawer" query={query} empty={{ title: "Engagement not found", sub: "It may have been deleted, or it belongs to another workspace." }} className="min-h-full">
          {data => <RecordDetail data={data} />}
        </DataMount>
      </SheetContent>
    </Sheet>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof History; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-s100 bg-white px-5 py-4">
      <h3 className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.14em] text-s500"><Icon className="size-3.5" aria-hidden /> {title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-cool-8">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{children}</dd>
    </div>
  );
}

function RecordDetail({ data }: { data: TrackerRecord }) {
  const today = todayIso();
  const { record, events, sources, assignments } = data;
  const warnings = stageWarnings(record, today);
  const expiry = expiryVerdict(record.deliveryWindowEnd, today);
  const approvals = customerApprovalItems(record);

  return (
    <div>
      <SheetHeader className="space-y-1 bg-white px-5 pb-4 pt-6">
        <p className="cta-eyebrow">{STAGE_LABELS[record.stage]}</p>
        <SheetTitle className="text-xl font-black tracking-tight text-ink">{record.customerName}</SheetTitle>
        <SheetDescription className="text-xs text-ink-muted">
          {record.opportunityNumber ?? "No opportunity number"}{record.serNumber ? ` · ${record.serNumber}` : ""}{record.salesforceCustomerId ? ` · Customer ID ${record.salesforceCustomerId}` : ""}
        </SheetDescription>
        <div className="flex flex-wrap gap-1 pt-1">
          {record.segment ? <Chip>{SEGMENT_LABELS[record.segment]}</Chip> : <Pill verdict="warn">Segment not set</Pill>}
          {record.entitlementGroupId !== null && <Chip title="Alternative plans for one entitlement; counted once">Plan group {record.entitlementGroupId}</Chip>}
          <Pill verdict={expiry.pill}>{expiry.label}{expiry.daysLeft !== null && expiry.daysLeft >= 0 ? ` · ${expiry.daysLeft} days` : ""}</Pill>
        </div>
      </SheetHeader>

      {warnings.length > 0 && (
        <div className="space-y-1 border-t border-s100 bg-white px-5 py-3">
          {warnings.map(warning => <p key={warning} className="callout-red">{warning}</p>)}
        </div>
      )}

      <Section icon={ListChecks} title="Key facts">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Fact label="VSA amount">{formatMoney(record.entitlementValue)}</Fact>
          <Fact label="Delivery window ends">{formatDay(record.deliveryWindowEnd)}</Fact>
          <Fact label="PO received">{formatDay(record.poReceivedOn)}</Fact>
          <Fact label="Customer kickoff">{formatDay(record.ckomOn)}</Fact>
          <Fact label="FCP submitted">{formatDay(record.fcpSubmittedOn)}</Fact>
          <Fact label="In stage since">{formatDay(record.stageEnteredOn)}</Fact>
        </dl>
        {record.nextSteps && <p className="callout-dark whitespace-pre-line">{record.nextSteps}</p>}
        {record.clientFolderUrl && <a href={record.clientFolderUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-semibold text-cdw-red hover:underline">Client folder <ExternalLink className="size-3" /></a>}
      </Section>

      <Section icon={UsersRound} title="Customer approval">
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-center justify-between gap-2">FCP approval {approvals.fcp.acceptedOn ? <Pill verdict="ready">Accepted {formatDay(approvals.fcp.acceptedOn)}</Pill> : <Pill verdict="warn">Not accepted</Pill>}</li>
          {approvals.workPlan ? (
            <li className="flex items-center justify-between gap-2">Broadcom work plan {approvals.workPlan.acceptedOn ? <Pill verdict="ready">Accepted {formatDay(approvals.workPlan.acceptedOn)}</Pill> : approvals.workPlan.sentOn ? <Pill verdict="warn">Sent {formatDay(approvals.workPlan.sentOn)}, not accepted</Pill> : <Pill verdict="warn">Not sent</Pill>}</li>
          ) : (
            <li className="text-xs text-ink-muted">Commercial customers have no work plan step.</li>
          )}
        </ul>
      </Section>

      <MoveStage data={data} />

      <Section icon={History} title="Stage history">
        <ol className="space-y-1.5 text-sm">
          {[...events].reverse().map(event => (
            <li key={event.id} className="flex items-start justify-between gap-3">
              <span>{event.fromStage ? `${STAGE_LABELS[event.fromStage]} → ` : ""}<strong>{STAGE_LABELS[event.toStage]}</strong>{event.note && <span className="block text-xs text-ink-muted">{event.note}</span>}</span>
              <span className="shrink-0 text-xs text-ink-muted">{formatDay(event.effectiveOn)} · {event.source}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section icon={ListChecks} title="Sources">
        {sources.length === 0 ? <p className="text-xs text-ink-muted">No sources listed.</p> : (
          <ul className="space-y-1.5 text-sm">
            {sources.map(source => <li key={source.id} className="flex items-center justify-between gap-2"><span>{source.label}{!source.required && <span className="text-xs text-ink-muted"> (optional)</span>}</span><Pill verdict={SOURCE_VERDICT[source.status].verdict}>{SOURCE_VERDICT[source.status].label}</Pill></li>)}
          </ul>
        )}
      </Section>

      <Section icon={UsersRound} title="People">
        {assignments.length === 0 ? <p className="text-xs text-ink-muted">No one assigned.</p> : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {assignments.map(assignment => <Fact key={assignment.id} label={ROLE_LABELS[assignment.role] ?? assignment.role}>{assignment.displayName}{assignment.broadcomEmail && <span className="block text-xs text-ink-muted">{assignment.broadcomEmail}</span>}</Fact>)}
          </dl>
        )}
      </Section>

      <div className="border-t border-s100 bg-white px-5 py-4">
        <Button asChild variant="outline" size="sm"><Link href={`/fcp?engagement=${record.id}`}><FileText className="size-4" /> Open FCP</Link></Button>
      </div>
    </div>
  );
}

function MoveStage({ data }: { data: TrackerRecord }) {
  const { record, sources, events } = data;
  const utils = trpc.useUtils();
  const [to, setTo] = useState<Stage | "">("");
  const [effectiveOn, setEffectiveOn] = useState(todayIso());
  const [note, setNote] = useState("");
  useEffect(() => { setTo(""); setNote(""); setEffectiveOn(todayIso()); }, [record.id, record.stage]);

  const pausedFrom = record.stage === "paused" ? ([...events].reverse().find(event => event.toStage === "paused")?.fromStage ?? null) : null;
  const check = useMemo(() => (to ? canTransition({ ...record, sourceItems: sources, pausedFrom }, to) : null), [to, record, sources, pausedFrom]);
  const move = trpc.tracker.transition.useMutation({
    onSuccess: async result => {
      toast.success(result.warnings.length ? `Moved to ${STAGE_LABELS[to as Stage]}. Still open: ${result.warnings.join("; ")}` : `Moved to ${STAGE_LABELS[to as Stage]}`);
      await Promise.all([utils.tracker.get.invalidate({ id: record.id }), utils.tracker.list.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });

  return (
    <Section icon={ArrowRight} title="Move stage">
      <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
        <select className="h-9 rounded-full border border-s200 bg-white px-3 text-sm" value={to} onChange={event => setTo(event.target.value as Stage)} aria-label="New stage">
          <option value="">Choose a stage…</option>
          {STAGES.filter(stage => stage !== record.stage).map(stage => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
        </select>
        <Input type="date" value={effectiveOn} max={todayIso()} min={record.stageEnteredOn} onChange={event => setEffectiveOn(event.target.value)} className="h-9 rounded-full" aria-label="Date of the stage change" />
      </div>
      {check && (
        <div className="space-y-1">
          {check.hardBlock && <p className="callout-red"><Pill verdict="stop">Blocked</Pill> {check.hardBlock}</p>}
          {!check.hardBlock && check.warnings.map(warning => <p key={warning} className="text-xs"><Pill verdict="warn">Open</Pill> {warning}</p>)}
          {!check.hardBlock && check.noteRequired && <p className="text-xs text-ink-muted">This move skips, reverses, or reopens a stage, so it needs a note.</p>}
        </div>
      )}
      {check && !check.hardBlock && <Textarea value={note} onChange={event => setNote(event.target.value)} placeholder={check.noteRequired ? "Why (required)" : "Note (optional)"} rows={2} className="rounded-xl" />}
      <Button
        size="sm"
        disabled={!to || !check || Boolean(check.hardBlock) || (check.noteRequired && !note.trim()) || move.isPending}
        onClick={() => to && move.mutate({ id: record.id, rowVersion: record.rowVersion, to, effectiveOn, note: note.trim() || undefined })}
      >
        Move to {to ? STAGE_LABELS[to] : "stage"}
      </Button>
    </Section>
  );
}
