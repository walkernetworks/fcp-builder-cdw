import { AdoptionTimelineEditor } from "@/components/AdoptionTimelineEditor";
import { EntitlementTimelineWithHours, NotionalTimelineWithHours } from "@/components/WorkPackageHours";
import { DeliveryBriefing } from "@/components/DeliveryBriefing";
import { CondensedReportPanel } from "@/components/CondensedReportPanel";
import { CustomerBriefImport } from "@/components/CustomerBriefImport";
import { ReportContentEditor } from "@/components/ReportContentEditor";
import { PlanSetup } from "@/components/PlanSetup";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState as DesignEmptyState, HeroBand, HeroKpi, KpiCard, Pill, SectionBar } from "@/components/vsa/elements";
import { RecordDrawer, type DrawerTab } from "@/components/vsa/RecordDrawer";
import { FcpRecordStrip, FcpVersionsSheet } from "@/components/vsa/FcpRecordPanels";
import { useBuildLock } from "@/lib/useBuildLock";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { downloadServerAttachment } from "@/lib/downloads";
import { engagementExists, engagementIdFromSearch, reconcileSelectedEngagementId, shouldQuerySelectedEngagement } from "@/lib/engagementSelection";
import { trpc } from "@/lib/trpc";
import { isCommercialCustomer } from "@shared/buildingBlocks";
import { exportFilename, type ExportDocumentType } from "@shared/exportFilename";
import { createDefaultDocument, DELIVERY_ROLE_BY_WORKSTREAM, getFollowOnReadinessGuidance, migrateDocument, refreshDerivedDocument, summarizeDeliveryStaffing, synchronizeEntitlementNotionalFromOperational, type EngagementDocument } from "@shared/fcp";
import { ArrowLeft, ArrowRight, History, LockKeyhole, BriefcaseBusiness, CheckCircle2, ChevronDown, KanbanSquare, ListChecks, FileText, CalendarRange, ClipboardCheck, Coins, Copy, Download, FileCheck2, FileSpreadsheet, Layers3, Loader2, MoreHorizontal, PackageCheck, Plus, RefreshCw, Save, ShieldCheck, Trash2, UsersRound, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const DEFAULT_ENGAGEMENT_TITLE = "New FCP Engagement";
type ExportFormat = "html" | "pdf" | "xlsx";
type ActiveExport = { format: ExportFormat; documentType: ExportDocumentType } | null;
const EXPORT_DOCUMENT_LABELS: Record<ExportDocumentType, string> = { fcp: "FCP", "condensed-fcp": "Condensed FCP", "plan-output": "Compatibility handoff", "building-blocks": "Building Blocks workbook" };
type WorkspaceStage = "engagement" | "plan" | "staffing" | "technical" | "report" | "package";

export default function Home() {
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number | null>(() => engagementIdFromSearch(window.location.search));
  const [title, setTitle] = useState(DEFAULT_ENGAGEMENT_TITLE);
  const [newEngagementTitle, setNewEngagementTitle] = useState(DEFAULT_ENGAGEMENT_TITLE);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [fcpDocument, setFcpDocument] = useState<EngagementDocument>(() => createDefaultDocument());
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [previewHtml, setPreviewHtml] = useState("");
  const [activeExport, setActiveExport] = useState<ActiveExport>(null);
  const [workspaceStage, setWorkspaceStage] = useState<WorkspaceStage>(() => {
    const requested = new URLSearchParams(window.location.search).get("stage");
    return requested === "plan" || requested === "staffing" || requested === "technical" || requested === "report" || requested === "package" ? requested : "engagement";
  });
  const hydratedId = useRef<number | null>(null);
  const [trackerTab, setTrackerTab] = useState<DrawerTab | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  /** The customer name this workspace loaded or last saved; sent with saves so the server can tell an FCP edit from a stale copy. */
  const baseCustomerName = useRef<string | null>(null);
  const baseTitle = useRef<string | null>(null);

  const list = trpc.engagement.list.useQuery();
  const selectedIsListed = engagementExists(selectedId, list.data);
  const canReconcileSelection = list.isSuccess && !list.isFetching;
  const shouldQuerySelected = shouldQuerySelectedEngagement(selectedId, list.data, list.isFetching);
  const getInput = useMemo(() => ({ id: selectedId ?? 0 }), [selectedId]);
  // One editor per FCP: while someone else holds the build lock, this workspace is read-only.
  const buildLock = useBuildLock(selectedIsListed ? selectedId : null);
  const readOnly = buildLock.readOnly;
  const selected = trpc.engagement.get.useQuery(getInput, {
    enabled: shouldQuerySelected,
    retry: false,
  });
  const create = trpc.engagement.create.useMutation({
    onSuccess: async row => {
      await utils.engagement.list.invalidate();
      hydratedId.current = null;
      setTitle(row.title);
      setFcpDocument(createDefaultDocument());
      setDirty(false);
      setSaveState("saved");
      setSelectedId(row.id);
      setIsCreateDialogOpen(false);
      setNewEngagementTitle(DEFAULT_ENGAGEMENT_TITLE);
      toast.success(`Created ${row.title}`);
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.engagement.update.useMutation({
    onSuccess: async (row, sent) => {
      setDirty(false);
      setSaveState("saved");
      // The server may keep a customer name changed in the tracker; adopt it unless the name was edited here since this save.
      const savedName = row.data.fields.customerName;
      const sentName = (sent.data as EngagementDocument).fields.customerName;
      baseCustomerName.current = savedName;
      baseTitle.current = row.title;
      if (savedName !== sentName) setFcpDocument(current => (current.fields.customerName === sentName ? { ...current, fields: { ...current.fields, customerName: savedName } } : current));
      if (row.title !== sent.title) setTitle(current => (current === sent.title ? row.title : current));
      // A save can tick off sources (RVTools, brief, signed hours), so the record strip re-reads the checklist.
      await Promise.all([utils.engagement.list.invalidate(), utils.tracker.get.invalidate({ id: sent.id })]);
    },
    onError: error => {
      setSaveState("unsaved");
      toast.error(error.message);
      if (error.data?.code === "CONFLICT") void buildLock.refresh();
    },
  });
  const duplicate = trpc.engagement.duplicate.useMutation({ onSuccess: async row => { await utils.engagement.list.invalidate(); setSelectedId(row.id); toast.success("Engagement duplicated"); } });
  const remove = trpc.engagement.delete.useMutation({ onSuccess: async () => { setSelectedId(null); hydratedId.current = null; setFcpDocument(createDefaultDocument()); setTitle(DEFAULT_ENGAGEMENT_TITLE); await utils.engagement.list.invalidate(); toast.success("Engagement deleted"); } });
  const preview = trpc.document.preview.useMutation({ onSuccess: result => setPreviewHtml(result.html) });
  const downloadTicket = trpc.document.downloadTicket.useMutation();

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId === null) url.searchParams.delete("engagement"); else url.searchParams.set("engagement", String(selectedId));
    if (url.href !== window.location.href) window.history.replaceState({}, "", url);
  }, [selectedId]);
  useEffect(() => {
    if (!canReconcileSelection) return;
    const nextId = reconcileSelectedEngagementId(selectedId, list.data);
    if (nextId === selectedId) return;
    setSelectedId(nextId);
    hydratedId.current = null;
    if (nextId === null) {
      setTitle(DEFAULT_ENGAGEMENT_TITLE);
      setFcpDocument(createDefaultDocument());
      setDirty(false);
      setSaveState("saved");
      setPreviewHtml("");
    }
  }, [canReconcileSelection, list.data, selectedId]);
  useEffect(() => {
    if (selected.data !== null) return;
    setSelectedId(null);
    hydratedId.current = null;
    void utils.engagement.list.invalidate();
  }, [selected.data, utils.engagement.list]);
  useEffect(() => {
    if (!selected.data || hydratedId.current === selected.data.id) return;
    hydratedId.current = selected.data.id;
    const migratedDocument = migrateDocument(selected.data.data);
    const needsPersistence = JSON.stringify(migratedDocument) !== JSON.stringify(selected.data.data);
    setTitle(selected.data.title);
    baseTitle.current = selected.data.title;
    baseCustomerName.current = migratedDocument.fields.customerName;
    setFcpDocument(migratedDocument);
    setDirty(needsPersistence);
    setSaveState(needsPersistence ? "unsaved" : "saved");
  }, [selected.data]);
  // A rename made elsewhere (the record drawer, the import) reaches an open workspace, unless the name or title was edited here.
  useEffect(() => {
    if (!selected.data || hydratedId.current !== selected.data.id) return;
    const serverName = selected.data.data.fields.customerName;
    const serverTitle = selected.data.title;
    if (serverTitle !== baseTitle.current) {
      const previous = baseTitle.current;
      baseTitle.current = serverTitle;
      setTitle(current => (current === previous ? serverTitle : current));
    }
    if (serverName !== baseCustomerName.current) {
      const previous = baseCustomerName.current;
      baseCustomerName.current = serverName;
      setFcpDocument(current => (current.fields.customerName === previous ? { ...current, fields: { ...current.fields, customerName: serverName } } : current));
    }
  }, [selected.data]);
  // Autosave only while this person holds the build lock; before the lock answers, or while someone else holds it, nothing is sent.
  const holdsLock = buildLock.lock.status === "held";
  useEffect(() => {
    if (!selectedId || !dirty || !holdsLock) return;
    setSaveState("unsaved");
    const timer = window.setTimeout(() => { setSaveState("saving"); update.mutate({ id: selectedId, title, data: fcpDocument, baseCustomerName: baseCustomerName.current, baseTitle: baseTitle.current }); }, 1300);
    return () => window.clearTimeout(timer);
  }, [fcpDocument, title, selectedId, dirty, holdsLock]);
  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => preview.mutate({ title, data: fcpDocument }), 350);
    return () => window.clearTimeout(timer);
  }, [fcpDocument, title, selectedId]);

  const openCreateDialog = () => {
    if (create.isPending) return;
    setNewEngagementTitle(DEFAULT_ENGAGEMENT_TITLE);
    setIsCreateDialogOpen(true);
  };
  const submitNewEngagement = () => {
    const requestedTitle = newEngagementTitle.trim();
    if (!requestedTitle) {
      toast.error("Enter an engagement name to continue.");
      return;
    }
    create.mutate({ title: requestedTitle });
  };
  const canCreateEngagement = newEngagementTitle.trim().length > 0 && newEngagementTitle.trim().length <= 240;
  const followOnGuidance = useMemo(
    () => getFollowOnReadinessGuidance(fcpDocument.fields, fcpDocument.inventory),
    [fcpDocument.fields, fcpDocument.inventory],
  );
  const mutateDocument = (next: EngagementDocument) => {
    if (readOnly) return void toast.error(`${buildLock.lock.holder ?? "Someone"} is editing this FCP. Take over editing to make changes.`);
    setFcpDocument(next);
    setDirty(true);
  };
  const buildPlan = () => {
    if (fcpDocument.planAuthority === "manual" && !window.confirm("Apply the VCF 9.1 playbook template? This replaces the current manually edited Entitlement Adoption Timeline and Two-Year Notional with a newly generated plan from the confirmed pathway, design decisions, outcomes, dates, and hardware readiness.")) return;
    mutateDocument(refreshDerivedDocument(fcpDocument, { forceRebuild: true }));
    toast.success("VCF 9.1 playbook template applied to both planning views");
  };
  const saveNow = () => { if (!selectedId) return; setSaveState("saving"); update.mutate({ id: selectedId, title, data: fcpDocument, baseCustomerName: baseCustomerName.current, baseTitle: baseTitle.current }); };
  const startExport = async (format: ExportFormat, documentType: ExportDocumentType = "fcp") => {
    if (!selectedId || activeExport) return;

    setActiveExport({ format, documentType });
    try {
      setSaveState("saving");
      await update.mutateAsync({ id: selectedId, title, data: fcpDocument, baseCustomerName: baseCustomerName.current, baseTitle: baseTitle.current });
      const result = await downloadTicket.mutateAsync({ id: selectedId, format, documentType });
      const response = await fetch(result.url, { credentials: "same-origin" });
      const fallbackName = exportFilename(title, documentType, format);
      await downloadServerAttachment(response, format, fallbackName);
      toast.success(`${EXPORT_DOCUMENT_LABELS[documentType]} ${format.toUpperCase()} download started`);
    } catch (error) {
      console.error(`[Export] ${documentType} ${format.toUpperCase()} download failed`, error);
      toast.error(error instanceof Error ? error.message : `The ${format.toUpperCase()} download could not be started.`);
    } finally {
      setActiveExport(null);
    }
  };
  const planActivities = fcpDocument.adoptionTimeline.lanes.flatMap(lane => lane.bars);
  const stageDefinitions: Array<{ id: WorkspaceStage; step: string; label: string; summary: string; icon: typeof BriefcaseBusiness; complete: boolean }> = [
    { id: "engagement", step: "01", label: "Engagement", summary: "Copilot brief, entitlement, dates, and estate", icon: BriefcaseBusiness, complete: Boolean(fcpDocument.fields.customerName && fcpDocument.fields.entitlementStart && fcpDocument.fields.plannedProjectStart) },
    { id: "plan", step: "02", label: "Service Plan", summary: "Outcomes, work packages, and assumptions", icon: Layers3, complete: Boolean(fcpDocument.fields.priorities.length && fcpDocument.fields.plannedImplementationStart) },
    { id: "staffing", step: "03", label: "Entitlement Adoption Timeline", summary: "Resource roles, milestones, and delivery windows", icon: UsersRound, complete: planActivities.length > 2 },
    { id: "technical", step: "04", label: "Technical Handoff", summary: "Compatibility actions and evidence gaps", icon: ShieldCheck, complete: Boolean(fcpDocument.inventory.hosts && fcpDocument.readiness.hardwarePlatforms.length) },
    { id: "report", step: "05", label: "FCP Report Content", summary: "Hours, narrative, and personnel", icon: FileText, complete: Boolean(fcpDocument.report.entitlement.hours && fcpDocument.report.whatWeHeard.length && fcpDocument.report.personnel.length) },
    { id: "package", step: "06", label: "Delivery Package", summary: "Review, preview, and issue deliverables", icon: PackageCheck, complete: Boolean(fcpDocument.fields.customerName && planActivities.length) },
  ];
  const activeStage = stageDefinitions.find(stage => stage.id === workspaceStage) || stageDefinitions[0];
  const setStage = (stage: WorkspaceStage) => {
    setWorkspaceStage(stage);
    const url = new URL(window.location.href);
    if (stage === "engagement") url.searchParams.delete("stage"); else url.searchParams.set("stage", stage);
    window.history.replaceState({}, "", url);
  };

  if (list.isLoading) return <div className="grid min-h-[70vh] place-items-center"><Loader2 className="size-6 animate-spin text-cdw-red" /></div>;

  return (
    <>
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={open => {
          if (create.isPending) return;
          setIsCreateDialogOpen(open);
          if (!open) setNewEngagementTitle(DEFAULT_ENGAGEMENT_TITLE);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={event => { event.preventDefault(); submitNewEngagement(); }}>
            <DialogHeader>
              <DialogTitle>Name the engagement</DialogTitle>
              <DialogDescription>Give this functional consumption plan a clear customer or project name. You can edit it later from the workspace header.</DialogDescription>
            </DialogHeader>
            <div className="py-5">
              <label htmlFor="new-engagement-title" className="text-sm font-medium text-ink">Engagement name</label>
              <Input
                id="new-engagement-title"
                className="mt-2"
                value={newEngagementTitle}
                onChange={event => setNewEngagementTitle(event.target.value)}
                placeholder="For example, Meridian Health VCF Adoption"
                maxLength={240}
                autoFocus
                aria-describedby="new-engagement-title-help"
              />
              <p id="new-engagement-title-help" className="mt-2 text-xs text-s400">Use a recognizable customer, account, or project name.</p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={create.isPending}>Cancel</Button>
              <Button type="submit" className="bg-cdw-red hover:bg-cdw-red-deep" disabled={!canCreateEngagement || create.isPending}>
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create engagement
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <div className="workspace-shell bg-s50">
      <header className="rounded-xl flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-s100 bg-white px-5 py-2 xl:sticky xl:top-14 xl:z-30 xl:flex-nowrap">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="shrink-0"><Link href="/"><ArrowLeft className="size-4" /> Board</Link></Button>
          <span className="h-6 w-px shrink-0 bg-s100" aria-hidden />
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="shrink-0" aria-label="Switch engagement"><KanbanSquare className="size-4" /> Switch <ChevronDown className="size-3.5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[60vh] w-80 overflow-y-auto">
              {list.data?.length ? list.data.map(item => <DropdownMenuItem key={item.id} onSelect={() => { setSelectedId(item.id); hydratedId.current = null; }} className={selectedId === item.id ? "font-bold" : undefined}><span className="min-w-0"><span className="block truncate">{item.title}</span><span className="block truncate text-xs text-ink-muted">{item.customerName}</span></span></DropdownMenuItem>) : <DropdownMenuItem disabled>No engagements yet</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
          {selectedIsListed && <Input disabled={readOnly} className="h-8 min-w-0 max-w-[440px] border-transparent bg-transparent px-2 text-base font-bold shadow-none focus-visible:border-s200" value={title} onChange={event => { setTitle(event.target.value); setDirty(true); }} aria-label="Engagement title" />}
        </div>
        <div className="flex items-center gap-2">
          {selectedIsListed ? <>
            <span className="hidden text-xs text-ink-muted sm:inline" aria-live="polite">{readOnly ? "Read only" : buildLock.lock.status === "pending" ? "Checking who is editing…" : saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved changes" : "Saved"}</span>
            <Button variant="outline" size="sm" onClick={() => setTrackerTab("overview")}><ListChecks className="size-4" /> Tracker details</Button>
            <Button variant="outline" size="sm" onClick={() => setVersionsOpen(true)}><History className="size-4" /> Versions</Button>
            <Button variant="outline" size="sm" disabled={update.isPending || readOnly} onClick={saveNow}>{update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save</Button>
            <Button size="sm" disabled={readOnly} onClick={buildPlan}><RefreshCw className="size-4" /> {fcpDocument.planAuthority === "manual" ? "Apply playbook template" : "Rebuild plans"}</Button>
          </> : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" size="icon-sm" aria-label="More actions"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={openCreateDialog}><Plus className="size-4" /> New FCP</DropdownMenuItem>
              {selectedIsListed && <>
                <DropdownMenuItem onSelect={() => duplicate.mutate({ id: selectedId })}><Copy className="size-4" /> Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-state-blocked-text" onSelect={() => { if (window.confirm("Delete this engagement? This cannot be undone.")) remove.mutate({ id: selectedId }); }}><Trash2 className="size-4" /> Delete</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-state-warn/30 bg-state-warn-soft px-5 py-2.5" role="status">
          <p className="flex items-center gap-2 text-sm text-state-warn-text"><LockKeyhole className="size-4" /> <strong>{buildLock.lock.holder ?? "Someone"} is editing this FCP</strong>{buildLock.lock.since ? ` (since ${buildLock.lock.since.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })})` : ""}. You can read it; changes, saving, and exports are off until they finish or you take over.</p>
          <Button variant="outline" size="sm" className="bg-white" onClick={() => { if (window.confirm(`Take over editing from ${buildLock.lock.holder ?? "the other editor"}? Their unsaved changes will be refused when they next save.`)) void buildLock.takeOver().then(() => { hydratedId.current = null; void utils.engagement.get.invalidate(); }); }}>Take over editing</Button>
        </div>
      )}
      <div className="mx-auto max-w-[1600px]">
        <main className="min-w-0 p-4 md:p-6">
          {!selectedIsListed ? <NoSelection engagements={list.data ?? []} onSelect={id => { setSelectedId(id); hydratedId.current = null; }} onCreate={openCreateDialog} /> : selected.isLoading || !selected.data ? <div className="grid min-h-[65vh] place-items-center"><Loader2 className="size-6 animate-spin text-cdw-red" /></div> : (
            <div className="space-y-5">
              <EngagementCommandBar document={fcpDocument} title={title} onOpenPackage={() => setStage("package")} />
              <FcpRecordStrip engagementId={selectedId!} document={fcpDocument} onOpenSources={() => setTrackerTab("sources")} />
              <div className="space-y-5">
                <nav className="flex gap-1 overflow-x-auto rounded-xl border border-s100 bg-white p-1 shadow-[var(--shadow-card)]" aria-label="Consumption plan workflow">
                  {stageDefinitions.map(stage => <StageNavigationItem key={stage.id} stage={stage} active={workspaceStage === stage.id} onSelect={() => setStage(stage.id)} />)}
                </nav>
                <fieldset disabled={readOnly} className="min-w-0 space-y-5">
                  <StageHeader stage={activeStage} />
                  {workspaceStage === "engagement" && <div className="space-y-5"><CustomerBriefImport document={fcpDocument} onChange={mutateDocument} /><PlanSetup step="upload" document={fcpDocument} onChange={mutateDocument} onExportPlanOutput={format => void startExport(format, "plan-output")} exportingPlanOutput={activeExport?.documentType === "plan-output" && activeExport.format !== "xlsx" ? activeExport.format : null} /><PlanSetup step="customer" document={fcpDocument} onChange={mutateDocument} onExportPlanOutput={format => void startExport(format, "plan-output")} exportingPlanOutput={activeExport?.documentType === "plan-output" && activeExport.format !== "xlsx" ? activeExport.format : null} /><StageAdvance label="Continue to Service Plan" onClick={() => setStage("plan")} /></div>}
                  {workspaceStage === "plan" && <div className="space-y-5"><ScopeAtGlance document={fcpDocument} /><PlanSetup step="timeline" document={fcpDocument} onChange={mutateDocument} onExportPlanOutput={format => void startExport(format, "plan-output")} exportingPlanOutput={activeExport?.documentType === "plan-output" && activeExport.format !== "xlsx" ? activeExport.format : null} />{fcpDocument.planAuthority === "manual" && <section className="border border-state-warn/30 bg-state-warn-soft p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-state-warn-text">Existing manual timeline is still active</p><h3 className="mt-1 text-lg font-semibold text-ink">The playbook packages above are a preview and have not replaced the saved plan.</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-s600">Apply the template when you are ready to replace both saved timeline views with the exact design, implementation, validation, adoption, and handoff packages generated from these inputs.</p></div><Button className="shrink-0 bg-s600 hover:bg-ink" onClick={buildPlan}><RefreshCw className="size-4" /> Apply Playbook Template</Button></div></section>}<WorkPackageRegister document={fcpDocument} /><StageAdvance label="Open Entitlement Adoption Timeline" onClick={() => setStage("staffing")} /></div>}
                  {workspaceStage === "staffing" && <div className="space-y-4"><StaffingSummary document={fcpDocument} /><div className="rounded-xl border border-s100 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.16em] text-cdw-red">Delivery basis</p><p className="mt-2 max-w-5xl text-sm leading-6 text-s600">{fcpDocument.rationale}</p></div><Button variant="outline" size="sm" onClick={buildPlan}><RefreshCw className="size-4" /> {fcpDocument.planAuthority === "manual" ? "Apply Playbook Template" : "Rebuild Generated Plan"}</Button></div>{fcpDocument.fields.timelineNotes && <div className="mt-4 border-l-4 border-state-warn bg-state-warn-soft px-4 py-3 text-xs leading-5 text-state-warn-text"><strong>Calendar constraints:</strong> {fcpDocument.fields.timelineNotes}</div>}</div><Tabs defaultValue="adoption" className="space-y-4"><TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border border-s100 bg-white p-1"><TabsTrigger value="adoption" className="gap-2 rounded-none px-4 py-2"><UsersRound className="size-4" /> Entitlement Adoption Timeline</TabsTrigger><TabsTrigger value="two-year" className="gap-2 rounded-none px-4 py-2"><Workflow className="size-4" /> Two-Year Notional</TabsTrigger></TabsList><TabsContent value="adoption"><EntitlementTimelineWithHours document={fcpDocument} onChange={mutateDocument} onTimelineChange={adoptionTimeline => mutateDocument(synchronizeEntitlementNotionalFromOperational(fcpDocument, adoptionTimeline))} description={fcpDocument.adoptionTimeline.cadence === "week" ? "Use this weekly Entitlement Adoption Timeline to sequence work packages, coordinate delivery roles, and protect key milestones. Drag activities or their edges to refine the delivery windows." : "Use this monthly Entitlement Adoption Timeline to sequence work packages, coordinate delivery roles, and protect key milestones. Drag activities or their edges to refine the delivery windows."} /></TabsContent><TabsContent value="two-year" className="space-y-4">{followOnGuidance.blocked && <section className="border border-state-warn/30 bg-state-warn-soft p-4"><p className="text-xs font-bold uppercase tracking-wider text-state-warn-text">Consumption plan inputs still needed</p><h3 className="mt-1 text-base font-semibold text-ink">{followOnGuidance.title}</h3><p className="mt-2 max-w-4xl text-sm leading-6 text-s600">{followOnGuidance.detail}</p></section>}<NotionalTimelineWithHours document={fcpDocument} onChange={mutateDocument} description="This monthly view starts with design and mobilisation, preserves any intentional implementation delay, and extends the adoption roadmap through a full 24-month horizon." /></TabsContent></Tabs><StageAdvance label="Review Technical Handoff" onClick={() => setStage("technical")} /></div>}
                  {workspaceStage === "technical" && <div className="space-y-5"><PlanSetup step="review" document={fcpDocument} onChange={mutateDocument} onExportPlanOutput={format => void startExport(format, "plan-output")} exportingPlanOutput={activeExport?.documentType === "plan-output" && activeExport.format !== "xlsx" ? activeExport.format : null} /><DeliveryBriefing document={fcpDocument} /><StageAdvance label="Assemble Delivery Package" onClick={() => setStage("package")} /></div>}
                  {workspaceStage === "report" && <div className="space-y-5"><ReportContentEditor document={fcpDocument} onChange={mutateDocument} /></div>}
                  {workspaceStage === "package" && <div className="space-y-4"><DeliveryPackageHeader document={fcpDocument} /><CondensedReportPanel document={fcpDocument} onChange={mutateDocument} /><section className="rounded-xl grid gap-3 border border-s100 bg-white p-4 lg:grid-cols-2"><ExportPreferenceCard title="Compatibility summary in the FCP" description="Include the target-release compatibility posture in the FCP: hosts by decision, the top compatibility actions, and the planning considerations from RVTools. The detailed evidence stays in the Compatibility Delivery Handoff." checked={fcpDocument.fields.exportPreferences.includeVcfReadiness} onCheckedChange={includeVcfReadiness => mutateDocument({ ...fcpDocument, fields: { ...fcpDocument.fields, exportPreferences: { ...fcpDocument.fields.exportPreferences, includeVcfReadiness } } })} switchId="include-vcf-readiness-export" /><ExportPreferenceCard title="Delivery adoption timeline" description="Include the entitlement adoption timeline in the FCP so delivery leadership can align resources to the work-package windows. When it is off, the Two-Year Notional covers the whole plan from the project start." checked={fcpDocument.fields.exportPreferences.includeOperationalTimeline} onCheckedChange={includeOperationalTimeline => mutateDocument({ ...fcpDocument, fields: { ...fcpDocument.fields, exportPreferences: { ...fcpDocument.fields.exportPreferences, includeOperationalTimeline } } })} switchId="include-operational-timeline-export" /></section><section className="grid gap-px overflow-hidden border border-s100 bg-s100 lg:grid-cols-2"><DeliverableCard title="Condensed FCP" label="FCP 2.0 · for customer review" description="The Make Amazing Happen condensed plan: entitlement burndown, scoped effort, customer effort, design profile, timeline, and the adoption recommendation. Content checks run before every download." icon={FileCheck2} activeExport={activeExport} documentType="condensed-fcp" onExport={startExport} /><DeliverableCard title="Functional Consumption Plan" label="Customer plan + adoption schedule" description="High-level SOW-style consumption plan covering delivery context, work packages, entitlement-aligned sequencing, adoption timeline, assumptions, milestones, and customer outcomes." icon={FileCheck2} activeExport={activeExport} documentType="fcp" onExport={startExport} /><DeliverableCard title="Compatibility Delivery Handoff" label="Technical engineer evidence pack" description="Maintained-catalog host cohorts, release support, blockers, evidence gaps, owners, and the actions required before platform build." icon={ShieldCheck} activeExport={activeExport} documentType="plan-output" onExport={startExport} />{isCommercialCustomer(fcpDocument.fields) && <DeliverableCard title="Building Blocks Workbook" label="Commercial customer · VCF 9 Building Blocks" description="Every Building Blocks tool block with its category start date, status, projected dates, and dependencies taken from this plan. Out-of-scope blocks start hidden." icon={FileSpreadsheet} activeExport={activeExport} documentType="building-blocks" formats={["xlsx"]} onExport={startExport} />}</section><div className="overflow-hidden border border-s100 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-s100 bg-s50 px-4 py-3"><div className="flex items-center gap-2 text-xs font-semibold text-state-pass-text"><ClipboardCheck className="size-4" /> Delivery Package Preview</div><span className="text-xs text-s400">Auto-updating from the same plan source</span></div>{preview.isPending && !previewHtml ? <div className="grid h-[720px] place-items-center"><Loader2 className="size-6 animate-spin text-cdw-red" /></div> : <iframe title="Live FCP Preview" srcDoc={previewHtml} className="h-[calc(100vh-210px)] min-h-[720px] w-full bg-white" sandbox="allow-scripts" />}</div></div>}
                </fieldset>
              </div>
            </div>
          )}
        </main>
      </div>
      </div>
      <RecordDrawer id={trackerTab && selectedIsListed ? selectedId : null} initialTab={trackerTab ?? "overview"} onClose={() => setTrackerTab(null)} />
      {selectedIsListed && selectedId && <FcpVersionsSheet engagementId={selectedId} open={versionsOpen} onClose={() => setVersionsOpen(false)} readOnly={readOnly} onRestored={() => { hydratedId.current = null; void utils.engagement.get.invalidate({ id: selectedId }); void utils.tracker.get.invalidate({ id: selectedId }); }} />}
    </>
  );
}

function formatCurrency(value: number) {
  // CDW written style: money carries double zeros.
  return value ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value) : "Not entered";
}

function formatDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function EngagementCommandBar({ document, title, onOpenPackage }: { document: EngagementDocument; title: string; onOpenPackage: () => void }) {
  const f = document.fields;
  const manual = document.planAuthority === "manual";
  return (
    <HeroBand eyebrow={`Broadcom services entitlement work plan · ${manual ? "Manual plan in force" : "Generated plan"}`} head={title} lead="Build the customer work plan, align resource demand to the adoption schedule, close technical readiness items, and issue one delivery-ready package.">
      <HeroKpi label="Entitlement value" value={formatCurrency(f.entitlementAmount)} sub="Entered on the Engagement step" compact />
      <HeroKpi label="Entitlement term" value={`${formatDate(f.entitlementStart)} – ${formatDate(f.entitlementEnd)}`} sub="Start entered; end follows the term" compact />
      <HeroKpi label="Design starts" value={formatDate(f.plannedProjectStart || f.targetStart)} sub="Planned project start" compact />
      <HeroKpi label="Implementation starts" value={formatDate(f.plannedImplementationStart || f.plannedProjectStart)} sub="Falls back to the project start" compact />
      <div className="flex flex-col justify-between gap-3 sm:col-span-2 xl:col-span-4 xl:flex-row xl:items-center">
        <p className="text-xs opacity-85">Target platform: <strong>{f.compatibilityTargetRelease}</strong></p>
        <button type="button" onClick={onOpenPackage} className="inline-flex h-9 items-center gap-2 self-start rounded-full border border-white/70 px-4 text-sm font-bold text-white transition-colors hover:bg-white/10"><PackageCheck className="size-4" /> Open delivery package</button>
      </div>
    </HeroBand>
  );
}



function StageNavigationItem({ stage, active, onSelect }: { stage: { step: string; label: string; summary: string; icon: typeof BriefcaseBusiness; complete: boolean }; active: boolean; onSelect: () => void }) {
  const Icon = stage.icon;
  return (
    <button type="button" onClick={onSelect} aria-current={active ? "step" : undefined} title={stage.summary} className={`flex min-w-[150px] flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors ${active ? "bg-cdw-red text-white" : "text-s500 hover:bg-s50 hover:text-ink"}`}>
      <span className={`text-[10px] font-black tabular-nums tracking-[.14em] ${active ? "text-white/80" : "text-cdw-red"}`}>{stage.step}</span>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate text-sm font-bold">{stage.label}</span>
      {stage.complete && <CheckCircle2 className={`ml-auto size-4 shrink-0 ${active ? "text-white" : "text-state-pass"}`} aria-label="Complete" />}
    </button>
  );
}

function StageHeader({ stage }: { stage: { step: string; label: string; summary: string; icon: typeof BriefcaseBusiness; complete: boolean } }) {
  const descriptions: Record<string, string> = {
    Engagement: "Establish the funding envelope, service dates, customer context, target release, and the estate evidence that constrains delivery.",
    "Service Plan": "Translate customer priorities into a high-level SOW plan with delivery work packages, assumptions, dependencies, outcomes, and implementation timing.",
    "Entitlement Adoption Timeline": "Use the Entitlement Adoption Timeline as the primary drawdown schedule. Coordinate delivery roles, manage concurrent work packages, and protect key milestones.",
    "Technical Handoff": "Give delivery engineers a reconciled compatibility posture, evidence gaps, and owned actions before platform work is released.",
    "Delivery Package": "Review completeness, choose what belongs in the customer plan, preview the final source of truth, and issue both delivery artifacts.",
  };
  return (
    <header className="space-y-2">
      <SectionBar label={`Step ${stage.step} · Consumption plan workflow`} title={stage.label} />
      {descriptions[stage.label] && <p className="max-w-4xl text-sm leading-6 text-ink-muted">{descriptions[stage.label]}</p>}
    </header>
  );
}

function StageAdvance({ label, onClick }: { label: string; onClick: () => void }) {
  return <div className="flex justify-end border-t border-s100 pt-4"><Button onClick={onClick}>{label}<ArrowRight className="size-4" /></Button></div>;
}

function ScopeAtGlance({ document }: { document: EngagementDocument }) {
  const activities = document.adoptionTimeline.lanes.flatMap(lane => lane.bars);
  const selectedOutcomes = document.fields.priorities.map(priority => ({ operations: "Operations", automation: "Automation & Self-Service", networking: "VCF Networking & NSX", security: "Security", resilience: "Resilience", kubernetes: "Kubernetes", "private-ai": "Private AI" })[priority]);
  return (
    <section className="kpi-grid">
      <KpiCard label="SOW-level work plan" value={activities.length} sub="Generated work packages before manual refinement" />
      <KpiCard label="Selected outcomes" value={<span className="text-sm font-bold leading-6 tracking-normal">{selectedOutcomes.length ? selectedOutcomes.join(" · ") : "None yet"}</span>} sub={selectedOutcomes.length ? "From the customer priorities" : "Select customer outcomes below"} />
      <KpiCard label="Delivery window" value={<span className="text-sm font-bold tracking-normal">{formatDate(document.fields.plannedProjectStart)} – {formatDate(document.fields.targetComplete)}</span>} sub={`Implementation services target ${formatDate(document.fields.plannedImplementationStart || document.fields.plannedProjectStart)}`} />
    </section>
  );
}

function WorkPackageRegister({ document }: { document: EngagementDocument }) {
  const timeline = document.adoptionTimeline;
  const packages = timeline.lanes.flatMap(lane => lane.bars.map(activity => ({ lane, activity }))).sort((left, right) => left.activity.startCol - right.activity.startCol || left.activity.label.localeCompare(right.activity.label));
  return <section className="overflow-hidden rounded-xl border border-s100 bg-white shadow-[var(--shadow-card)]"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-s100 px-5 py-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-cdw-red">Draft scope register</p><h3 className="mt-1 text-lg font-semibold text-ink">High-level SOW work packages</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-s500">Each package carries a delivery role, planning window, intended outcome, and dependency context into staffing and the final delivery package.</p></div><span className="chip">{packages.length} packages</span></div><div className="overflow-x-auto"><table className="tbl min-w-[980px]"><thead><tr><th>Work package</th><th>Delivery role</th><th>Window</th><th>Outcome / acceptance direction</th><th>Dependencies and assumptions</th></tr></thead><tbody>{packages.map(({ lane, activity }) => <tr key={activity.id}><td><p className="font-semibold text-ink">{activity.label}</p><p className="mt-1 text-[11px] text-s400">{lane.category} · {lane.workstreamType}</p></td><td className="font-medium text-s600">{DELIVERY_ROLE_BY_WORKSTREAM[lane.workstreamType]}</td><td className="whitespace-nowrap text-s500">{timeline.columns[activity.startCol - 1] || `Window ${activity.startCol}`} – {timeline.columns[Math.max(activity.startCol - 1, activity.endCol - 2)] || `Window ${activity.endCol - 1}`}</td><td className="leading-5 text-s600">{activity.outcome || "Confirm the completion evidence and customer acceptance direction during delivery planning."}</td><td className="leading-5 text-s500">{activity.dependsOn || "Sequence against customer availability, approved change windows, and the work that must finish first."}</td></tr>)}</tbody></table></div><p className="border-t border-s100 bg-s50 px-4 py-3 text-[11px] leading-5 text-s400">This is a planning-level scope register, not a signed legal statement of work. Delivery leadership must validate effort, named resources, commercial rates, customer responsibilities, and formal acceptance criteria.</p></section>;
}

function StaffingSummary({ document }: { document: EngagementDocument }) {
  const timeline = document.adoptionTimeline;
  const staffing = summarizeDeliveryStaffing(timeline);
  return <section className="space-y-3"><div className="kpi-grid"><KpiCard label="Delivery roles" value={staffing.assignments.length} sub="Distinct roles across the adoption timeline" /><KpiCard label="Work packages" value={staffing.workPackageCount} sub="Activities on the Entitlement Adoption Timeline" /><KpiCard label="Peak concurrent packages" value={staffing.peakConcurrentPackages} sub="Most packages running in one window" /></div><div className="overflow-x-auto rounded-xl border border-s100 bg-white"><table className="tbl min-w-[720px]"><thead><tr><th>Delivery role</th><th>Workstream</th><th className="num">Packages</th><th>Delivery window</th></tr></thead><tbody>{staffing.assignments.map(item => <tr key={item.role}><td className="font-semibold text-ink">{item.role}</td><td className="text-s500">{item.workstreamType}</td><td className="num text-s500">{item.workPackages.length}</td><td className="text-s500">{item.startLabel} – {item.endLabel}</td></tr>)}</tbody></table></div><p className="text-[11px] leading-5 text-ink-muted">Role guidance supports delivery-resource planning. Delivery leadership should confirm named resources, effort, utilization, and regional availability before work begins.</p></section>;
}

function DeliveryPackageHeader({ document }: { document: EngagementDocument }) {
  const checks = [
    { label: "Customer and entitlement", ready: Boolean(document.fields.customerName && document.fields.entitlementStart) },
    { label: "Service scope", ready: document.fields.priorities.length > 0 },
    { label: "Entitlement adoption timeline", ready: document.adoptionTimeline.lanes.some(lane => lane.bars.length) },
    { label: "Technical evidence", ready: Boolean(document.inventory.hosts && document.readiness.hardwarePlatforms.length) },
  ];
  return <section className="rounded-xl border border-s100 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-cdw-red">Handoff control point</p><h3 className="mt-1 text-xl font-semibold text-ink">Delivery package readiness</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-s500">Both documents are generated from the same entitlement, service-plan, adoption-timeline, and compatibility source of truth.</p></div><Pill verdict={checks.every(check => check.ready) ? "ready" : "warn"}>{checks.filter(check => check.ready).length}/{checks.length} handoff areas ready</Pill></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{checks.map(check => <div key={check.label} className="flex items-center justify-between gap-2 rounded-lg border border-s100 bg-white px-3 py-2 text-xs font-semibold text-ink">{check.label}{check.ready ? <Pill verdict="ready">Ready</Pill> : <Pill verdict="warn">Missing</Pill>}</div>)}</div></section>;
}

function DeliverableCard({ title, label, description, icon: Icon, activeExport, documentType, formats = ["html", "pdf"], onExport }: { title: string; label: string; description: string; icon: typeof FileCheck2; activeExport: ActiveExport; documentType: ExportDocumentType; formats?: ExportFormat[]; onExport: (format: ExportFormat, documentType: ExportDocumentType) => Promise<void> }) {
  return <article className="bg-white p-5"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center bg-s600 text-white"><Icon className="size-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-cdw-red">{label}</p><h3 className="mt-1 text-lg font-semibold text-ink">{title}</h3><p className="mt-2 text-sm leading-6 text-s500">{description}</p></div></div><div className="mt-5 flex gap-2">{formats.map(format => <Button key={format} variant={format === "html" ? "outline" : "default"} size="sm" className={format === "html" ? undefined : "bg-cdw-red hover:bg-cdw-red-deep"} disabled={Boolean(activeExport)} onClick={() => void onExport(format, documentType)}>{activeExport?.format === format && activeExport.documentType === documentType ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} {format.toUpperCase()}</Button>)}</div></article>;
}

function ExportPreferenceCard({
  title,
  description,
  checked,
  onCheckedChange,
  switchId,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  switchId: string;
}) {
  return <div className="flex min-w-0 items-center justify-between gap-4 rounded-xl bg-s50 p-3"><div className="min-w-0"><p className="text-sm font-semibold text-ink">{title}</p><p className="mt-1 text-xs leading-5 text-s500">{description}</p></div><div className="flex shrink-0 items-center gap-3"><div className="text-right"><p className="text-sm font-semibold text-ink">{checked ? "Included" : "Omitted"}</p><p className="text-xs text-s400">HTML and PDF</p></div><Switch id={switchId} checked={checked} onCheckedChange={onCheckedChange} aria-label={`Include ${title} in HTML and PDF exports`} /></div></div>;
}

function NoSelection({ engagements, onSelect, onCreate }: { engagements: { id: number; title: string; customerName: string; updatedAt: Date | string }[]; onSelect: (id: number) => void; onCreate: () => void }) {
  if (!engagements.length) {
    return <div className="mx-auto max-w-2xl py-10"><DesignEmptyState icon={FileText} title="No FCPs yet" sub="Start an FCP here, or create an engagement on the board and open its FCP from the record." action={<Button size="sm" onClick={onCreate}><Plus className="size-4" /> New FCP</Button>} /></div>;
  }
  const recent = [...engagements].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 9);
  return (
    <div className="mx-auto max-w-5xl space-y-4 py-6">
      <SectionBar label="FCP workspace" title="Choose an engagement">
        <Button asChild variant="outline" size="sm"><Link href="/"><KanbanSquare className="size-4" /> Open the board</Link></Button>
        <Button size="sm" onClick={onCreate}><Plus className="size-4" /> New FCP</Button>
      </SectionBar>
      <p className="text-sm text-ink-muted">Recently updated. Every engagement is also on the board, where Open FCP brings you here.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recent.map(item => (
          <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="rounded-xl border border-s100 bg-white p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border-s300">
            <p className="font-bold text-ink">{item.title}</p>
            <p className="mt-0.5 text-xs text-ink-muted">{item.customerName}</p>
            <p className="mt-3 text-[11px] text-s400">Updated {new Date(item.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
          </button>
        ))}
      </div>
    </div>
  );
}





