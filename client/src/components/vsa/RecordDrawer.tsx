import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useOperationalSettings } from "@/lib/settings";
import { SEGMENT_LABELS, todayIso, type TrackerRecord } from "@/lib/vsa";
import { FIELD_GROUPS } from "@/lib/vsaLabels";
import { buildLockState } from "@shared/fcpRecord";
import { staleness } from "@shared/vsaDashboard";
import { authorizationCheck, canTransition, customerApprovalItems, fcpTrailing, isMainStage, openSources, requiresBroadcomApproval, STAGE_LABELS, stageProgression, STAGES, stageWarnings, type GateDates, type Stage } from "@shared/vsaStage";
import { expiryVerdict, formatDay, formatMoney } from "@shared/vsaViews";
import { ExternalLink, File, FileText, Folder, FolderOpen, History, Link2, Lock } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { HealthPill } from "./cells";
import { Chip, DataMount, EmptyState, Pill } from "./elements";
import { RecordFieldGroups, RecordSaveBar, useRecordForm, type RecordForm } from "./RecordEditor";
import { PeopleEditor, SourcesEditor } from "./RecordPeopleSources";
import { DeliveryReadiness } from "./DeliveryReadiness";
import { NextActionCallout, StageStepper, type SaveGate } from "./StageProgress";

/** Right-side detail for one engagement. Esc and the backdrop close it; focus returns to whatever opened it. */
export type DrawerTab = "overview" | "stage" | "sources" | "people" | "files" | "fcp";

export function RecordDrawer({ id, onClose, initialTab = "overview" }: { id: number | null; onClose: () => void; initialTab?: DrawerTab }) {
  const record = trpc.tracker.get.useQuery({ id: id ?? 0 }, { enabled: id !== null });
  const query = { ...record, data: record.data ?? undefined, error: record.error ? { message: record.error.message } : null };
  return (
    <Sheet open={id !== null} onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-surface p-0 sm:max-w-[720px]">
        {!record.data && <SheetTitle className="sr-only">Engagement details</SheetTitle>}
        <DataMount id="recordDrawer" query={query} empty={{ title: "Engagement not found", sub: "It may have been deleted, or it belongs to another workspace." }} className="min-h-full">
          {data => <RecordDetail key={`${data.record.id}-${initialTab}`} data={data} initialTab={initialTab} />}
        </DataMount>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children, actions, id }: { title: string; children: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <section id={id} className="space-y-3 border-t border-s100 px-6 py-4 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="field-label">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-ink">{children}</dd>
    </div>
  );
}

function RecordDetail({ data, initialTab }: { data: TrackerRecord; initialTab: DrawerTab }) {
  const today = todayIso();
  const settings = useOperationalSettings();
  const { record, sources, assignments } = data;
  const warnings = stageWarnings({ ...record, sourceItems: sources }, today, settings.workPlanStaleDays);
  const expiry = expiryVerdict(record.deliveryWindowEnd, today);
  const stale = staleness(record, today, settings.staleAfterDays);
  const approvals = customerApprovalItems(record);
  const trailing = fcpTrailing(record);
  const authorization = authorizationCheck(record);
  const form = useRecordForm(record);

  return (
    <div>
      <SheetHeader className="gap-1 px-6 pb-4 pt-6">
        <p className="text-xs text-ink-muted">{STAGE_LABELS[record.stage]} · {stale.days} {stale.days === 1 ? "day" : "days"} in stage</p>
        <SheetTitle className="pr-8 text-lg font-semibold tracking-tight text-ink">{record.customerName}</SheetTitle>
        <SheetDescription className="text-xs text-ink-muted">
          {record.opportunityNumber ?? "No opportunity number"}{record.serNumber ? ` · ${record.serNumber}` : ""}{record.salesforceCustomerId ? ` · Customer ID ${record.salesforceCustomerId}` : ""}
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          {record.segment ? <Chip>{SEGMENT_LABELS[record.segment]}</Chip> : <Pill verdict="warn">Segment not set</Pill>}
          {record.entitlementGroupId !== null && <Chip title="Alternative plans for one entitlement; counted once">Plan group {record.entitlementGroupId}</Chip>}
          <Pill verdict={expiry.pill}>{expiry.label}{expiry.daysLeft !== null && expiry.daysLeft >= 0 ? ` · ${expiry.daysLeft} days` : ""}</Pill>
          {record.health && <HealthPill health={record.health} />}
          {stale.stale && <Pill verdict="warn">Stale · over {stale.threshold} days</Pill>}
          {trailing && <Pill verdict={trailing.severity} title={trailing.label}>FCP trailing</Pill>}
          {authorization && <Pill verdict={authorization.key === "hours_mismatch" ? "stop" : "warn"} title={authorization.label}>{authorization.key === "hours_mismatch" ? "Hours mismatch" : "PO before work plan"}</Pill>}
        </div>
      </SheetHeader>

      <Tabs defaultValue={initialTab} className="gap-0">
        <TabsList className="h-10 w-full justify-start gap-0 overflow-x-auto rounded-none border-y border-s100 bg-surface px-4 py-0">
          {([
            ["overview", "Overview"],
            ["stage", "Stage & gates"],
            ["sources", `Sources (${sources.length})`],
            ["people", `People (${assignments.length})`],
            ["files", "Files"],
            ["fcp", "FCP"],
          ] as const).map(([value, label]) => (
            <TabsTrigger key={value} value={value} className="h-10 flex-none rounded-none border-0 border-b-2 border-transparent px-3 text-[13px] font-medium text-ink-muted shadow-none data-[state=active]:border-cdw-red data-[state=active]:text-ink data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          {warnings.length > 0 && (
            <Section title="Open items">
              <ul className="space-y-1">{warnings.map(warning => <li key={warning} className="callout-red text-[13px]">{warning}</li>)}</ul>
            </Section>
          )}
          <Section title="Customer approval">
            <ul className="divide-y divide-s100 rounded-md border border-s100">
              <li className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">FCP approval {approvals.fcp.acceptedOn ? <Pill verdict="ready">Accepted {formatDay(approvals.fcp.acceptedOn)}</Pill> : <Pill verdict="warn">Not accepted</Pill>}</li>
              {approvals.workPlan ? (
                <li className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">Broadcom work plan {approvals.workPlan.acceptedOn ? <Pill verdict="ready">Accepted {formatDay(approvals.workPlan.acceptedOn)}</Pill> : approvals.workPlan.sentOn ? <Pill verdict="warn">Sent {formatDay(approvals.workPlan.sentOn)}, not accepted</Pill> : <Pill verdict="warn">Not sent</Pill>}</li>
              ) : (
                <li className="px-3 py-2 text-xs text-ink-muted">Commercial customers have no work plan step.</li>
              )}
            </ul>
            <p className="text-[11px] text-ink-subtle">From the gate dates on Stage &amp; gates.</p>
          </Section>
          <RecordFieldGroups form={form} groups={OVERVIEW_GROUPS} />
        </TabsContent>

        <TabsContent value="stage" className="mt-0"><StageAndGates data={data} form={form} /></TabsContent>
        <TabsContent value="sources" className="mt-0"><SourcesEditor data={data} /></TabsContent>
        <TabsContent value="people" className="mt-0"><PeopleEditor data={data} /></TabsContent>
        <TabsContent value="files" className="mt-0"><FilesTab data={data} /></TabsContent>
        <TabsContent value="fcp" className="mt-0"><FcpTab data={data} /></TabsContent>
      </Tabs>
      <RecordSaveBar form={form} />
    </div>
  );
}

const GATE_FIELDS = FIELD_GROUPS.find(group => group.title === "Gate dates")!.fields;
/** Overview edits the record-level fields. Gate dates and the hours check are edited on Stage & gates, so each field has one edit surface. */
const OVERVIEW_GROUPS = FIELD_GROUPS.filter(group => group.title !== "Gate dates" && group.title !== "Hours check");

/**
 * The stages that apply to the record's segment as a stepper, each with its gates; the next action; Move stage; and the
 * stage history. Gates save one at a time (Mark done), through tracker.update, like any field edit.
 */
function StageAndGates({ data, form }: { data: TrackerRecord; form: RecordForm }) {
  const { record, events } = data;
  const [moveTo, setMoveTo] = useState<Stage | "">("");
  // For an exit, the main stage it left from: the stage history's latest move into the current stage.
  const exitedFrom = isMainStage(record.stage) ? null : ([...events].reverse().find(event => event.toStage === record.stage)?.fromStage ?? null);
  const dates = Object.fromEntries(GATE_FIELDS.map(field => [field.key, (form.form[field.key] as string) || null])) as GateDates;
  const progression = stageProgression({ stage: record.stage, segment: record.segment, fcpWaivedOn: record.fcpWaivedOn, exitedFrom }, dates);
  const saveGate: SaveGate = (gate, day, message) => form.saveField(gate, day, message);
  const suggestMove = (stage: Stage) => {
    setMoveTo(stage);
    document.getElementById("move-stage")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return (
    <>
      <Section title="Next action">
        <NextActionCallout progression={progression} onSave={saveGate} saving={form.savingField} onSuggestMove={suggestMove} />
      </Section>
      <Section title="Before delivery">
        <DeliveryReadiness data={data} progression={progression} />
      </Section>
      <Section title={`Stages · ${record.segment ? SEGMENT_LABELS[record.segment] : "segment not set"}`} actions={!requiresBroadcomApproval(record.segment) ? <span className="text-xs text-ink-subtle">No Broadcom Approval for Commercial</span> : undefined}>
        <StageStepper progression={progression} stageEnteredOn={record.stageEnteredOn} onSave={saveGate} saving={form.savingField} />
        <p className="text-xs text-ink-subtle">The stage sequence and which gates apply to each segment are set in code. Gate labels are set in Admin.</p>
      </Section>
      <MoveStage data={data} to={moveTo} setTo={setMoveTo} />
      <Section title="Stage history">
        {events.length === 0 ? <EmptyState icon={History} title="No stage changes yet" sub="Moves appear here with their dates and notes." /> : (
          <ol className="vtl">
            {[...events].reverse().map((event, index) => (
              <li key={event.id} className="vtl-item">
                <span className="vtl-dot" data-done="true" data-current={index === 0 ? "true" : undefined} aria-hidden />
                <span className="text-[13px] text-ink">
                  {event.fromStage ? <span className="text-ink-muted">{STAGE_LABELS[event.fromStage]} → </span> : null}<span className="font-medium">{STAGE_LABELS[event.toStage]}</span>
                  {event.note && <span className="mt-0.5 block text-xs text-ink-muted">{event.note}</span>}
                </span>
                <span className="text-right text-xs text-ink-muted"><span className="tabular block text-[13px] text-ink">{formatDay(event.effectiveOn)}</span>{event.source}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

function MoveStage({ data, to, setTo }: { data: TrackerRecord; to: Stage | ""; setTo: (stage: Stage | "") => void }) {
  const { record, sources, events } = data;
  const utils = trpc.useUtils();
  const [effectiveOn, setEffectiveOn] = useState(todayIso());
  const [note, setNote] = useState("");
  useEffect(() => { setTo(""); setNote(""); setEffectiveOn(todayIso()); }, [record.id, record.stage]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <Section title="Move stage" id="move-stage">
      <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
        <select className="h-8 rounded-md border border-s200 bg-surface px-2.5 text-[13px] text-ink" value={to} onChange={event => setTo(event.target.value as Stage)} aria-label="New stage">
          <option value="">Choose a stage…</option>
          {STAGES.filter(stage => stage !== record.stage).map(stage => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
        </select>
        <Input type="date" value={effectiveOn} max={todayIso()} min={record.stageEnteredOn} onChange={event => setEffectiveOn(event.target.value)} className="h-8" aria-label="Date of the stage change" />
        <Button
          disabled={!to || !check || Boolean(check.hardBlock) || (check.noteRequired && !note.trim()) || move.isPending}
          onClick={() => to && move.mutate({ id: record.id, rowVersion: record.rowVersion, to, effectiveOn, note: note.trim() || undefined })}
        >
          Move
        </Button>
      </div>
      {check && (
        <div className="space-y-1">
          {check.hardBlock && <p className="callout-red"><Pill verdict="stop">Blocked</Pill> {check.hardBlock}</p>}
          {!check.hardBlock && check.warnings.map(warning => <p key={warning} className="flex items-center gap-2 text-xs"><Pill verdict="warn">Open</Pill> {warning}</p>)}
          {!check.hardBlock && check.noteRequired && <p className="text-xs text-ink-muted">This move skips, reverses, or reopens a stage, so it needs a note.</p>}
        </div>
      )}
      {check && !check.hardBlock && <Textarea value={note} onChange={event => setNote(event.target.value)} placeholder={check.noteRequired ? "Why (required)" : "Note (optional)"} rows={2} />}
    </Section>
  );
}

/** The FCP behind the record: readiness, who is editing, its dates, and the latest versions. */
function FcpTab({ data }: { data: TrackerRecord }) {
  const { record, sources } = data;
  const { user } = useAuth();
  const versions = trpc.fcpRecord.versions.useQuery({ id: record.id });
  const required = sources.filter(source => source.required);
  const open = openSources(sources);
  const lock = buildLockState({ userId: record.buildLockUserId, at: record.buildLockAt }, user?.id ?? 0, Date.now());
  const versionsQuery = { ...versions, data: versions.data, error: versions.error ? { message: versions.error.message } : null };
  return (
    <>
      <Section title="FCP" actions={<Button asChild size="sm"><Link href={`/fcp?engagement=${record.id}`}><FileText className="size-3.5" /> Open FCP workspace</Link></Button>}>
        <p className="text-[13px] font-medium text-ink">{record.title}</p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Fact label="Draft readiness">{open.length === 0 ? `${required.length} of ${required.length} sources in` : `${required.length - open.length} of ${required.length} sources in`}</Fact>
          <Fact label="Editing now">{lock === "free" ? "Nobody" : lock === "mine" ? "You" : <span className="inline-flex items-center gap-1"><Lock className="size-3" /> Someone else</span>}</Fact>
          <Fact label="Draft created">{formatDay(record.fcpDraftCreatedOn)}</Fact>
          <Fact label="Submitted">{formatDay(record.fcpSubmittedOn)}</Fact>
          <Fact label="Broadcom accepted">{requiresBroadcomApproval(record.segment) ? formatDay(record.fcpBroadcomAcceptedOn) : "Not needed"}</Fact>
          <Fact label="Customer accepted">{formatDay(record.fcpCustomerAcceptedOn)}</Fact>
        </dl>
        {open.length > 0 && <p className="text-xs text-ink-muted">Not received yet: {open.map(item => item.label).join(", ")}</p>}
      </Section>
      <Section title="Recent history">
        <DataMount id="drawerVersions" query={versionsQuery} isEmpty={list => list.length === 0} empty={{ icon: History, title: "Nothing saved yet", sub: "A copy is kept on request, when the FCP goes for approval, and on every export." }}>
          {list => (
            <ol className="divide-y divide-s100 rounded-md border border-s100">
              {list.slice(0, 6).map(version => (
                <li key={version.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ink">{version.label}</span>
                    <span className="block text-xs text-ink-muted">{new Date(version.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{version.createdByName ? ` · ${version.createdByName}` : ""}</span>
                  </span>
                  <Chip>{{ manual: "Saved", submitted: "Submitted", export: "Exported", restore: "Before restore" }[version.reason]}</Chip>
                </li>
              ))}
            </ol>
          )}
        </DataMount>
      </Section>
    </>
  );
}

const FILE_ICON = { folder: Folder, file: File, link: Link2 } as const;

/** The client folder and the files the record refers to, as links out. Read-only: nothing is uploaded, fetched, or stored. */
function FilesTab({ data }: { data: TrackerRecord }) {
  const { record } = data;
  const files = trpc.tracker.files.useQuery({ id: record.id });
  const query = { ...files, data: files.data, error: files.error ? { message: files.error.message } : null };
  const folder = files.data?.find(file => file.kind === "folder" && file.name === "Client folder");
  const others = (files.data ?? []).filter(file => file !== folder);
  let host = "";
  try {
    host = folder ? new URL(folder.url).host : "";
  } catch {
    host = "";
  }
  return (
    <>
      <Section title="Client folder">
        <DataMount id="recordFiles" query={query} isEmpty={() => !folder} empty={{ icon: FolderOpen, title: "No client folder linked", sub: "Add the SharePoint folder link on the Overview (Client folder link). Files are listed as links; nothing is uploaded or stored here." }}>
          {() => (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-s100 bg-surface-sunken px-4 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md border border-s100 bg-surface text-ink-muted"><FolderOpen className="size-4" aria-hidden /></span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">Client folder</span>
                  <span className="block truncate text-xs text-ink-muted" title={folder!.url}>{host || folder!.url}</span>
                </span>
              </span>
              <Button asChild>
                <a href={folder!.url} target="_blank" rel="noreferrer noopener"><FolderOpen className="size-4" /> Open client folder <ExternalLink className="size-3.5" /></a>
              </Button>
            </div>
          )}
        </DataMount>
      </Section>
      <Section title={`Files${files.data ? ` · ${others.length}` : ""}`}>
        {files.data && others.length === 0 ? (
          <p className="text-xs text-ink-muted">No file references yet. File names, folder paths, and links recorded on the Sources tab appear here.</p>
        ) : (
          <ul className="divide-y divide-s100 rounded-md border border-s100">
            {others.map(file => {
              const Icon = FILE_ICON[file.kind ?? "link"];
              return (
                <li key={`${file.url}-${file.name}`}>
                  <a href={file.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-3 px-3 py-2 hover:bg-surface-sunken">
                    <Icon className="size-4 shrink-0 text-ink-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{file.name}</span>
                      <span className="block text-xs text-ink-muted">{file.kind === "link" ? "Link" : file.kind === "folder" ? "Folder, in the client folder" : "File, in the client folder"}{file.modifiedOn ? ` · received ${formatDay(file.modifiedOn)}` : ""}</span>
                    </span>
                    <ExternalLink className="size-3.5 shrink-0 text-ink-subtle" aria-label="Opens in a new tab" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[11px] text-ink-subtle">Links open in your browser. The tracker lists files; it never uploads, downloads, or stores them.</p>
      </Section>
    </>
  );
}
