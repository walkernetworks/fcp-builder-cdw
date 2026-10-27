import { ReportJsonButton } from "@/components/CondensedReportPanel";
import { CustomerBriefImport } from "@/components/CustomerBriefImport";
import { DeliveryBriefing } from "@/components/DeliveryBriefing";
import { DeliverableCard, DeliveryPackageHeader, ExportPreferenceCard, ScopeAtGlance, StaffingSummary } from "@/components/fcp/workspaceParts";
import { PlanSetup } from "@/components/PlanSetup";
import { ReportContentEditor, type ReportSection } from "@/components/ReportContentEditor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { FcpRecordStrip, FcpVersionsSheet } from "@/components/vsa/FcpRecordPanels";
import { Chip, DataMount, EmptyState } from "@/components/vsa/elements";
import { useShell } from "@/components/vsa/ShellContext";
import { trpc } from "@/lib/trpc";
import { sectionFromSearch, type WorkspaceSection } from "@/lib/fcpWorkspaceRoutes";
import { useFcpEngagement } from "@/lib/useFcpEngagement";
import { isCommercialPlan } from "@shared/buildingBlocks";
import { HISTORY_REASON_LABEL, segmentWarning } from "@shared/fcpRecord";
import { SegmentReview } from "@/components/fcp/SegmentReview";
import { FundingSection } from "@/components/fcp/FundingSection";
import { ScopeSection } from "@/components/fcp/ScopeSection";
import { PlanEditor } from "@/components/fcp/PlanEditor";
import { IssuedRailList, IssuedVersionsList, IssuePanel, ReportFormatPicker } from "@/components/fcp/IssuedVersions";
import { defaultReportFormat, type ReportFormatChoice } from "@shared/reportFormat";
import { fundedFields, getFollowOnReadinessGuidance, type EngagementDocument } from "@shared/fcp";
import { openSources, STAGE_LABELS } from "@shared/vsaStage";
import { ArrowLeft, Copy, Download, Eye, FileCheck2, FileSpreadsheet, FileText, History, ListChecks, Loader2, LockKeyhole, MoreHorizontal, RefreshCw, Save, PanelRightClose, PanelRightOpen, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { toast } from "sonner";

type SectionStatus = "empty" | "partial" | "complete";

/** The eight sections, in the order a user works, each with what it is for. */
export const WORKSPACE_SECTIONS: Array<{ id: WorkspaceSection; label: string; why: string }> = [
  { id: "sources", label: "Sources", why: "What the plan is built from: the source checklist, and the Cowork brief that fills the facts and narrative in one step." },
  { id: "engagement", label: "Engagement", why: "Who the customer is and when the work runs. These print on the cover, the title band, and Key Dates." },
  { id: "funding", label: "Funding", why: "The entitlement or BSAS that pays for the plan. The entitlement value is the only dollar figure the customer sees." },
  { id: "estate", label: "Estate", why: "The current environment from RVTools (parsed in your browser; raw files never leave it), the compatibility posture, and the sizing answers." },
  { id: "scope", label: "Scope", why: "The outcomes the plan commits to, the delivery path, and the design profile and elements that follow from them." },
  { id: "plan", label: "Plan", why: "The work packages, their hours and windows, and the two timelines. What you see here is what prints." },
  { id: "narrative", label: "Narrative", why: "What we heard, the problems, open questions and items, people, and milestones, in the report's own headings." },
  { id: "review", label: "Review and issue", why: "Choose what the export includes, check the delivery package, and download the plan and the technical handoff." },
];

const NARRATIVE_SECTIONS: readonly ReportSection[] = ["heard", "problems", "questions", "people", "milestones", "open-items", "cover", "situation", "technical", "constraints", "asks"];
const STATUS_LABEL: Record<SectionStatus, string> = { empty: "Not started", partial: "In progress", complete: "Complete" };
const STATUS_DOT: Record<SectionStatus, string> = { empty: "border border-s300 bg-surface", partial: "bg-state-warn", complete: "bg-state-pass" };


function sectionStatus(section: WorkspaceSection, document: EngagementDocument, openSourceCount: number | null, sourceCount: number | null, segmentWarningOpen: boolean): SectionStatus | null {
  const f = document.fields;
  const report = document.report;
  const activities = document.adoptionTimeline.lanes.flatMap(lane => lane.bars).length;
  const level = (done: boolean, started: boolean): SectionStatus => (done ? "complete" : started ? "partial" : "empty");
  switch (section) {
    case "sources": return sourceCount === null ? null : level(sourceCount > 0 && openSourceCount === 0, openSourceCount !== sourceCount || report.briefVersion !== null);
    // An open segment warning keeps the section in progress until a person decides it.
    case "engagement": return level(Boolean(f.customerName && (f.plannedProjectStart || f.targetStart) && f.targetComplete) && !segmentWarningOpen, Boolean(f.customerName) || segmentWarningOpen);
    case "funding": return level(Boolean(fundedFields(f).entitlementStart && (f.fundingSource === "bsas" ? f.bsasHours : f.entitlementAmount)), Boolean(f.entitlementAmount || f.bsasHours || f.entitlementStart));
    case "estate": return level(Boolean(document.inventory.hosts && document.readiness.hardwarePlatforms.length), Boolean(document.inventory.hosts));
    case "scope": return level(Boolean(f.priorities.length && f.plannedImplementationStart), Boolean(f.priorities.length));
    case "plan": return level(activities > 2, activities > 0);
    case "narrative": return level(Boolean(report.whatWeHeard.length && report.personnel.length), Boolean(report.whatWeHeard.length || report.problems.length || report.openQuestions.length));
    case "review": return null;
  }
}

/** The FCP workspace for one engagement: sections on the left, the editor in the middle, the live FCP on the right. */
export default function FcpWorkspace() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return <NotAvailable />;
  return <Workspace key={id} id={id} />;
}

function Workspace({ id }: { id: number }) {
  const fcp = useFcpEngagement(id);
  const { openRecord } = useShell();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const record = trpc.tracker.get.useQuery({ id }, { enabled: Boolean(fcp.query.data) });
  const [section, setSectionState] = useState<WorkspaceSection>(() => sectionFromSearch(window.location.search));
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHidden, setPreviewHidden] = useState(readPreviewHidden);
  const hidePreview = (hidden: boolean) => { setPreviewHidden(hidden); writePreviewHidden(hidden); };
  const editorTop = useRef<HTMLDivElement>(null);
  const duplicate = trpc.engagement.duplicate.useMutation({ onSuccess: async row => { await utils.engagement.list.invalidate(); navigate(`/engagements/${row.id}/fcp`); toast.success("Engagement duplicated"); } });
  const remove = trpc.engagement.delete.useMutation({ onSuccess: async () => { await utils.engagement.list.invalidate(); navigate("/fcp"); toast.success("Engagement deleted"); } });

  const setSection = (next: WorkspaceSection) => {
    setSectionState(next);
    const url = new URL(window.location.href);
    url.searchParams.delete("stage");
    url.searchParams.set("section", next);
    window.history.replaceState({}, "", url);
    editorTop.current?.scrollIntoView({ block: "start" });
  };
  // Ctrl+S saves, as the header button does.
  const saveRef = useRef(fcp.saveNow);
  saveRef.current = fcp.saveNow;
  const canSave = !fcp.readOnly && fcp.hydrated;
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (canSave) saveRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSave]);

  const sources = record.data?.sources ?? null;
  const tracker = record.data?.record ?? null;
  // The customer format follows the tracker segment; a choice here changes it for this session's preview, exports and issue.
  const [formatChoice, setFormatChoice] = useState<ReportFormatChoice | null>(null);
  const reportFormat = formatChoice ?? defaultReportFormat(tracker?.segment);
  const setReportFormat = fcp.setReportFormat;
  useEffect(() => { if (record.data) setReportFormat(reportFormat); }, [record.data, reportFormat, setReportFormat]);
  const issueActions = { engagementId: id, title: fcp.title, document: fcp.document, readOnly: fcp.readOnly, saveDocument: fcp.saveDocument, reload: fcp.reload, segment: tracker?.segment ?? null, reportFormat };
  const segmentWarningText = tracker ? segmentWarning(tracker.segment, fcp.document.fields.commercialPlan, tracker.segmentReview ?? null) : null;
  const statuses = useMemo(() => {
    const open = sources ? openSources(sources).length : null;
    return Object.fromEntries(WORKSPACE_SECTIONS.map(item => [item.id, sectionStatus(item.id, fcp.document, open, sources ? sources.length : null, Boolean(segmentWarningText))])) as Record<WorkspaceSection, SectionStatus | null>;
  }, [fcp.document, sources, segmentWarningText]);

  if (fcp.query.isLoading) return <div className="grid min-h-[70vh] place-items-center"><Loader2 className="size-6 animate-spin text-cdw-red" /></div>;
  if (!fcp.query.data) return <NotAvailable />;

  const document = fcp.document;
  const active = WORKSPACE_SECTIONS.find(item => item.id === section) ?? WORKSPACE_SECTIONS[0];
  const empty = !document.fields.customerName && !document.inventory.hosts && document.report.briefVersion === null;
  const planOutput = { onExportPlanOutput: (format: "html" | "pdf") => void fcp.startExport(format, "plan-output"), exportingPlanOutput: fcp.activeExport?.documentType === "plan-output" && fcp.activeExport.format !== "xlsx" ? fcp.activeExport.format : null };
  const setup = { document, onChange: fcp.mutateDocument, ...planOutput };
  const saveLabel = fcp.readOnly ? "Read only" : fcp.lock.status === "pending" ? "Checking who is editing…" : fcp.saveState === "saving" ? "Saving…" : fcp.saveState === "unsaved" ? "Unsaved changes" : fcp.savedAt ? `Saved ${fcp.savedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "Saved";

  return (
    <div className="workspace-shell bg-s50">
      <header className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-s100 bg-surface px-4 py-2 md:px-6 xl:sticky xl:top-[92px] xl:z-20 xl:flex-nowrap">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="shrink-0"><Link href="/pipeline"><ArrowLeft className="size-4" /> Pipeline</Link></Button>
          <span className="h-6 w-px shrink-0 bg-s100" aria-hidden />
          <Input disabled={fcp.readOnly} className="h-8 min-w-0 max-w-[400px] border-transparent bg-transparent px-2 text-[15px] font-semibold shadow-none focus-visible:border-s200" value={fcp.title} onChange={event => fcp.renameTitle(event.target.value)} aria-label="Engagement title" />
          <span className="hidden min-w-0 truncate text-xs text-ink-muted lg:inline">{[document.fields.customerName, record.data?.record.opportunityNumber].filter(Boolean).join(" · ")}</span>
          {record.data && <Chip>{STAGE_LABELS[record.data.record.stage]}</Chip>}
          <Chip>Draft</Chip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden text-xs text-ink-muted sm:inline" aria-live="polite">{saveLabel}</span>
          <Button variant="outline" size="sm" onClick={() => openRecord(id)}><ListChecks className="size-4" /> Tracker details</Button>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}><History className="size-4" /> History</Button>
          <Button variant="outline" size="sm" disabled={fcp.saving || fcp.readOnly} onClick={fcp.saveNow}>{fcp.saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save</Button>
          <Button variant="outline" size="sm" disabled={fcp.readOnly} onClick={fcp.buildPlan}><RefreshCw className="size-4" /> {document.planAuthority === "manual" ? "Apply playbook template" : "Rebuild plans"}</Button>
          <Button size="sm" className="bg-cdw-red hover:bg-cdw-red-deep" disabled={Boolean(fcp.activeExport) || fcp.readOnly} onClick={() => void fcp.startExport("pdf")}>{fcp.activeExport?.documentType === "condensed-fcp" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Export PDF</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="icon-sm" aria-label="More actions"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => duplicate.mutate({ id })}><Copy className="size-4" /> Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-state-blocked-text" onSelect={() => { if (window.confirm("Delete this engagement? This cannot be undone.")) remove.mutate({ id }); }}><Trash2 className="size-4" /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {fcp.readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-state-warn/30 bg-state-warn-soft px-5 py-2.5" role="status">
          <p className="flex items-center gap-2 text-sm text-state-warn-text"><LockKeyhole className="size-4" /> <strong>{fcp.lock.holder ?? "Someone"} is editing this FCP</strong>{fcp.lock.since ? ` (since ${fcp.lock.since.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })})` : ""}. You can read it; changes, saving, and exports are off until they finish or you take over.</p>
          <Button variant="outline" size="sm" className="bg-surface" onClick={() => { if (window.confirm(`Take over editing from ${fcp.lock.holder ?? "the other editor"}? Their unsaved changes will be refused when they next save.`)) void fcp.takeOver(); }}>Take over editing</Button>
        </div>
      )}

      <div className={`mx-auto grid max-w-[1920px] gap-4 p-4 md:p-6 lg:grid-cols-[13rem_minmax(0,1fr)] ${previewHidden ? "" : "xl:grid-cols-[13rem_minmax(0,1fr)_minmax(0,40%)]"}`}>
        <SectionRail section={section} statuses={statuses} onSelect={setSection} engagementId={id} onOpenHistory={() => setHistoryOpen(true)} />

        <main ref={editorTop} className="min-w-0 scroll-mt-40 space-y-5">
          <header className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Section {WORKSPACE_SECTIONS.indexOf(active) + 1} of {WORKSPACE_SECTIONS.length}</p>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{active.label}</h1>
            <p className="max-w-3xl text-sm leading-6 text-ink-muted">{active.why}</p>
          </header>
          {empty && section !== "sources" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-s100 bg-surface p-4 text-sm text-s600">
              <span><strong className="text-ink">Start here: Sources.</strong> Import a Cowork brief or record what the plan is built from, then work down the sections.</span>
              <Button variant="outline" size="sm" onClick={() => setSection("sources")}>Go to Sources</Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className={previewHidden ? "" : "xl:hidden"} onClick={() => setPreviewOpen(true)}><Eye className="size-4" /> Preview the FCP</Button>
            {previewHidden && <Button variant="outline" size="sm" className="hidden xl:inline-flex" onClick={() => hidePreview(false)}><PanelRightOpen className="size-4" /> Show live preview</Button>}
          </div>
          <fieldset disabled={fcp.readOnly} className="min-w-0 space-y-5">
            {section === "sources" && <>
              <FcpRecordStrip engagementId={id} document={document} onOpenSources={() => openRecord(id, "sources")} />
              <CustomerBriefImport document={document} onChange={fcp.mutateDocument} />
            </>}
            {section === "engagement" && <>
              {tracker && <SegmentReview engagementId={id} document={document} segment={tracker.segment} segmentSource={tracker.segmentSource} review={tracker.segmentReview ?? null} readOnly={fcp.readOnly} saveDocument={fcp.saveDocument} />}
              <PlanSetup step="customer-details" {...setup} />
              <PlanSetup step="schedule" {...setup} />
            </>}
            {section === "funding" && <>
              <FundingSection engagementId={id} document={document} onChange={fcp.mutateDocument} tracker={tracker ? { poHours: tracker.poHours, poReceivedOn: tracker.poReceivedOn } : null} readOnly={fcp.readOnly} />
              <ReportContentEditor document={document} onChange={fcp.mutateDocument} sections={["licensing"]} />
            </>}
            {section === "estate" && <>
              <PlanSetup step="upload" {...setup} />
              <PlanSetup step="target-release" {...setup} />
              <PlanSetup step="review" {...setup} />
              <DeliveryBriefing document={document} />
              <ReportContentEditor document={document} onChange={fcp.mutateDocument} sections={["sizing", "environment"]} />
            </>}
            {section === "scope" && <>
              <ScopeAtGlance document={document} />
              {document.planAuthority === "manual" && <ManualPlanNotice onApply={fcp.buildPlan} />}
              <ScopeSection document={document} onChange={fcp.mutateDocument} />
            </>}
            {section === "plan" && <PlanSection document={document} onChange={fcp.mutateDocument} onRebuild={fcp.buildPlan} setup={setup} previewHtml={fcp.preview} />}
            {section === "narrative" && <ReportContentEditor document={document} onChange={fcp.mutateDocument} sections={NARRATIVE_SECTIONS} />}
            {section === "review" && <>
              {segmentWarningText && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-state-warn/30 bg-state-warn-soft p-4 text-sm" role="status">
                  <span className="text-state-warn-text"><strong>Needs a decision:</strong> {segmentWarningText}</span>
                  <Button variant="outline" size="sm" className="bg-surface" onClick={() => setSection("engagement")}>Decide in Engagement</Button>
                </div>
              )}
              <DeliveryPackageHeader document={document} />
              {tracker && <ReportFormatPicker segment={tracker.segment} value={reportFormat} overridden={formatChoice !== null && formatChoice !== defaultReportFormat(tracker.segment)} onChange={next => setFormatChoice(next === defaultReportFormat(tracker.segment) ? null : next)} />}
              <IssuePanel {...issueActions} />
              <IssuedVersionsList {...issueActions} />
              <section className="grid gap-3 rounded-lg border border-s100 bg-surface p-4 lg:grid-cols-2">
                <ExportPreferenceCard title="Compatibility summary in the FCP" description="Include the target-release compatibility posture in the FCP: hosts by decision, the top compatibility actions, and the planning considerations from RVTools. The detailed evidence stays in the Compatibility Delivery Handoff." checked={document.fields.exportPreferences.includeVcfReadiness} onCheckedChange={includeVcfReadiness => fcp.mutateDocument({ ...document, fields: { ...document.fields, exportPreferences: { ...document.fields.exportPreferences, includeVcfReadiness } } })} switchId="include-vcf-readiness-export" />
                <ExportPreferenceCard title="Delivery adoption timeline" description="Include the entitlement adoption timeline in the FCP so delivery leadership can align resources to the work-package windows. When it is off, the Two-Year Notional covers the whole plan from the project start." checked={document.fields.exportPreferences.includeOperationalTimeline} onCheckedChange={includeOperationalTimeline => fcp.mutateDocument({ ...document, fields: { ...document.fields, exportPreferences: { ...document.fields.exportPreferences, includeOperationalTimeline } } })} switchId="include-operational-timeline-export" />
              </section>
              <section className="grid gap-px overflow-hidden border border-s100 bg-s100 lg:grid-cols-2">
                <DeliverableCard title="Functional Consumption Plan" label="Draft export" description="The working FCP, marked DRAFT on every page: for internal review. To send the customer a copy, issue a version above and download it from Issued versions. Content checks run before every download." icon={FileCheck2} activeExport={fcp.activeExport} documentType="condensed-fcp" onExport={fcp.startExport} />
                <DeliverableCard title="Compatibility Delivery Handoff" label="Technical engineer evidence pack" description="Maintained-catalog host cohorts, release support, blockers, evidence gaps, owners, and the actions required before platform build." icon={ShieldCheck} activeExport={fcp.activeExport} documentType="plan-output" onExport={fcp.startExport} />
                {isCommercialPlan(document.fields) && <DeliverableCard title="Building Blocks Workbook" label="Commercial plan · VCF 9 Building Blocks" description="Every Building Blocks tool block with its category start date, status, projected dates, and dependencies taken from this plan. Out-of-scope blocks start hidden." icon={FileSpreadsheet} activeExport={fcp.activeExport} documentType="building-blocks" formats={["xlsx"]} onExport={fcp.startExport} />}
              </section>
              <ReportContentEditor document={document} onChange={fcp.mutateDocument} sections={["details"]} />
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-s100 bg-surface p-4">
                <div><p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Advanced</p><p className="mt-1 max-w-2xl text-xs leading-5 text-s400">The report content as JSON, checked before it is stored. Needed today only for the customer contacts list; every other field has a form in its section.</p></div>
                <ReportJsonButton document={document} onChange={fcp.mutateDocument} label="Edit report content (JSON)" />
              </section>
            </>}
          </fieldset>
        </main>

        {!previewHidden && (
          <aside className="hidden min-w-0 xl:block">
            <div className="sticky top-[150px] space-y-2">
              <PreviewFrame html={fcp.preview} pending={fcp.previewPending} checks={fcp.previewChecks} onExpand={() => setPreviewOpen(true)} onHide={() => hidePreview(true)} />
            </div>
          </aside>
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="h-[92vh] max-w-[min(1200px,96vw)] sm:max-w-[min(1200px,96vw)]">
          <DialogHeader>
            <DialogTitle>Functional Consumption Plan · draft</DialogTitle>
            <DialogDescription>The plan as it prints, updated as you edit. Drafts are marked “Draft, not for distribution”.</DialogDescription>
          </DialogHeader>
          {fcp.preview ? <iframe title="FCP preview, full size" srcDoc={fcp.preview} sandbox="allow-scripts" className="h-full w-full rounded-lg border border-s100 bg-surface" /> : <div className="grid h-full place-items-center"><Loader2 className="size-6 animate-spin text-cdw-red" /></div>}
        </DialogContent>
      </Dialog>
      <FcpVersionsSheet engagementId={id} open={historyOpen} onClose={() => setHistoryOpen(false)} readOnly={fcp.readOnly} onRestored={fcp.reload} />
    </div>
  );
}

function SectionRail({ section, statuses, onSelect, engagementId, onOpenHistory }: { section: WorkspaceSection; statuses: Record<WorkspaceSection, SectionStatus | null>; onSelect: (section: WorkspaceSection) => void; engagementId: number; onOpenHistory: () => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const index = WORKSPACE_SECTIONS.findIndex(item => item.id === section);
    const next = WORKSPACE_SECTIONS[(index + (event.key === "ArrowDown" ? 1 : WORKSPACE_SECTIONS.length - 1)) % WORKSPACE_SECTIONS.length];
    onSelect(next.id);
    (event.currentTarget.querySelector(`[data-section="${next.id}"]`) as HTMLButtonElement | null)?.focus();
  };
  return (
    <div className="min-w-0 space-y-4 lg:sticky lg:top-[150px] lg:self-start">
      <nav aria-label="FCP sections" className="rounded-lg border border-s100 bg-surface p-1.5 shadow-[var(--shadow-card)]" onKeyDown={onKeyDown}>
        <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Sections</p>
        <ol className="grid grid-cols-2 gap-0.5 sm:grid-cols-4 lg:grid-cols-1">
          {WORKSPACE_SECTIONS.map((item, index) => {
            const status = statuses[item.id];
            const current = item.id === section;
            return (
              <li key={item.id}>
                <button type="button" data-section={item.id} onClick={() => onSelect(item.id)} aria-current={current ? "step" : undefined} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${current ? "bg-surface-sunken font-semibold text-ink" : "text-ink-muted hover:bg-surface-sunken hover:text-ink"}`}>
                  <span className="tabular w-4 text-[11px] text-ink-subtle">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {status && <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} role="img" aria-label={STATUS_LABEL[status]} title={STATUS_LABEL[status]} />}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <IssuedRailList engagementId={engagementId} onOpen={() => onSelect("review")} />
      <HistoryList engagementId={engagementId} onOpenAll={onOpenHistory} />
    </div>
  );
}

/** Saved snapshots of the FCP, newest first. Not versions: "version" is kept for issued plans (Phase 3). */
function HistoryList({ engagementId, onOpenAll }: { engagementId: number; onOpenAll: () => void }) {
  const history = trpc.fcpRecord.versions.useQuery({ id: engagementId });
  const query = { ...history, data: history.data, error: history.error ? { message: history.error.message } : null };
  return (
    <section className="rounded-lg border border-s100 bg-surface p-1.5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between px-2 pb-1 pt-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">History</p>
        <button type="button" className="text-[11px] font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline" onClick={onOpenAll}>All history</button>
      </div>
      <DataMount id="fcpHistory" query={query} isEmpty={data => data.length === 0} empty={{ icon: History, title: "Nothing saved yet", sub: "A copy is kept when you save one, when the FCP goes for approval, and on every export." }}>
        {data => (
          <ol className="divide-y divide-s100">
            {data.slice(0, 5).map(entry => (
              <li key={entry.id} className="px-2 py-1.5">
                <p className="text-xs font-medium text-ink">{new Date(entry.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                <p className="truncate text-[11px] text-ink-muted">{HISTORY_REASON_LABEL[entry.reason]}{(entry.reason === "manual" || entry.reason === "decision") && entry.label ? `: ${entry.label}` : ""}{entry.createdByName ? ` · ${entry.createdByName}` : ""}</p>
              </li>
            ))}
          </ol>
        )}
      </DataMount>
    </section>
  );
}

// Whether the side preview is hidden is a per-viewer convenience: kept in this browser only, and the page works without it.
const PREVIEW_HIDDEN_KEY = "fcp.workspace.previewHidden";
function readPreviewHidden(): boolean {
  try { return window.localStorage.getItem(PREVIEW_HIDDEN_KEY) === "1"; } catch { return false; }
}
function writePreviewHidden(hidden: boolean) {
  try { if (hidden) window.localStorage.setItem(PREVIEW_HIDDEN_KEY, "1"); else window.localStorage.removeItem(PREVIEW_HIDDEN_KEY); } catch { /* storage unavailable: the choice lasts for this visit */ }
}

function PreviewFrame({ html, pending, checks, onExpand, onHide }: { html: string; pending: boolean; checks: string[]; onExpand: () => void; onHide: () => void }) {
  return (
    <div className="overflow-hidden rounded-lg border border-s100 bg-surface shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-s100 bg-s50 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-ink"><FileText className="size-4" /> Live preview <Chip>Draft</Chip>{pending && <Loader2 className="size-3.5 animate-spin text-ink-muted" aria-label="Updating" />}</div>
        <div className="flex gap-1.5"><Button variant="outline" size="sm" className="h-7" onClick={onExpand}><Eye className="size-3.5" /> Open full preview</Button><Button variant="ghost" size="sm" className="h-7" onClick={onHide} aria-label="Hide the live preview"><PanelRightClose className="size-3.5" /> Hide</Button></div>
      </div>
      {html ? <iframe title="Live FCP preview" srcDoc={html} sandbox="allow-scripts" className="h-[calc(100vh-230px)] min-h-[560px] w-full bg-surface" /> : <div className="grid h-[560px] place-items-center"><Loader2 className="size-6 animate-spin text-cdw-red" /></div>}
      {checks.length > 0 && <p className="border-t border-s100 bg-s50 px-3 py-2 text-[11px] leading-5 text-ink-muted">{checks.length} content check{checks.length === 1 ? "" : "s"} would stop the export. They are listed when you export.</p>}
    </div>
  );
}

function PlanSection({ document, onChange, onRebuild, setup, previewHtml }: { document: EngagementDocument; onChange: (document: EngagementDocument) => void; onRebuild: () => void; setup: Parameters<typeof PlanSetup>[0]; previewHtml: string }) {
  const followOnGuidance = useMemo(() => getFollowOnReadinessGuidance(document.fields, document.inventory), [document.fields, document.inventory]);
  return <>
    <StaffingSummary document={document} />
    {followOnGuidance.blocked && <section className="rounded-lg border border-state-warn/30 bg-state-warn-soft p-4"><p className="text-xs font-medium uppercase tracking-wide text-state-warn-text">Consumption plan inputs still needed</p><h3 className="mt-1 text-base font-semibold text-ink">{followOnGuidance.title}</h3><p className="mt-2 max-w-4xl text-sm leading-6 text-s600">{followOnGuidance.detail}</p></section>}
    <PlanEditor document={document} onChange={onChange} onRebuild={onRebuild} previewHtml={previewHtml} notes={<PlanSetup {...setup} step="notes" />} />
  </>;
}

function ManualPlanNotice({ onApply }: { onApply: () => void }): ReactNode {
  return <section className="border border-state-warn/30 bg-state-warn-soft p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-medium uppercase tracking-wide text-state-warn-text">Existing manual timeline is still active</p><h3 className="mt-1 text-lg font-semibold text-ink">The playbook packages above are a preview and have not replaced the saved plan.</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-s600">Apply the template when you are ready to replace both saved timeline views with the exact design, implementation, validation, adoption, and handoff packages generated from these inputs.</p></div><Button className="shrink-0" onClick={onApply}><RefreshCw className="size-4" /> Apply Playbook Template</Button></div></section>;
}

function NotAvailable() {
  return <div className="mx-auto max-w-2xl py-16"><EmptyState icon={FileText} title="This FCP is not available" sub="It may have been deleted, or it belongs to another workspace." action={<Button asChild size="sm"><Link href="/fcp">Choose an engagement</Link></Button>} /></div>;
}
