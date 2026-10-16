import { AdoptionTimelineEditor } from "@/components/AdoptionTimelineEditor";
import { EntitlementTimelineWithHours, NotionalTimelineWithHours } from "@/components/WorkPackageHours";
import { DeliveryBriefing } from "@/components/DeliveryBriefing";
import { CondensedReportPanel } from "@/components/CondensedReportPanel";
import { CustomerBriefImport } from "@/components/CustomerBriefImport";
import { ReportContentEditor } from "@/components/ReportContentEditor";
import { PlanSetup } from "@/components/PlanSetup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { downloadServerAttachment } from "@/lib/downloads";
import { engagementExists, engagementIdFromSearch, reconcileSelectedEngagementId, shouldQuerySelectedEngagement } from "@/lib/engagementSelection";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { isCommercialCustomer } from "@shared/buildingBlocks";
import { exportFilename, type ExportDocumentType } from "@shared/exportFilename";
import { createDefaultDocument, DELIVERY_ROLE_BY_WORKSTREAM, getFollowOnReadinessGuidance, migrateDocument, refreshDerivedDocument, summarizeDeliveryStaffing, synchronizeEntitlementNotionalFromOperational, type EngagementDocument } from "@shared/fcp";
import { ArrowRight, BriefcaseBusiness, FileText, CalendarRange, ClipboardCheck, Coins, Copy, Download, FileCheck2, FileSpreadsheet, Layers3, Loader2, MoreHorizontal, PackageCheck, Plus, RefreshCw, Save, ShieldCheck, Trash2, Upload, UsersRound, Workflow } from "lucide-react";
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

  const list = trpc.engagement.list.useQuery();
  const selectedIsListed = engagementExists(selectedId, list.data);
  const canReconcileSelection = list.isSuccess && !list.isFetching;
  const shouldQuerySelected = shouldQuerySelectedEngagement(selectedId, list.data, list.isFetching);
  const getInput = useMemo(() => ({ id: selectedId ?? 0 }), [selectedId]);
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
  const update = trpc.engagement.update.useMutation({ onSuccess: async () => { setDirty(false); setSaveState("saved"); await utils.engagement.list.invalidate(); }, onError: error => { setSaveState("unsaved"); toast.error(error.message); } });
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
    setFcpDocument(migratedDocument);
    setDirty(needsPersistence);
    setSaveState(needsPersistence ? "unsaved" : "saved");
  }, [selected.data]);
  useEffect(() => {
    if (!selectedId || !dirty) return;
    setSaveState("unsaved");
    const timer = window.setTimeout(() => { setSaveState("saving"); update.mutate({ id: selectedId, title, data: fcpDocument }); }, 1300);
    return () => window.clearTimeout(timer);
  }, [fcpDocument, title, selectedId, dirty]);
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
  const mutateDocument = (next: EngagementDocument) => { setFcpDocument(next); setDirty(true); };
  const buildPlan = () => {
    if (fcpDocument.planAuthority === "manual" && !window.confirm("Apply the VCF 9.1 playbook template? This replaces the current manually edited Entitlement Adoption Timeline and Two-Year Notional with a newly generated plan from the confirmed pathway, design decisions, outcomes, dates, and hardware readiness.")) return;
    mutateDocument(refreshDerivedDocument(fcpDocument, { forceRebuild: true }));
    toast.success("VCF 9.1 playbook template applied to both planning views");
  };
  const saveNow = () => { if (!selectedId) return; setSaveState("saving"); update.mutate({ id: selectedId, title, data: fcpDocument }); };
  const startExport = async (format: ExportFormat, documentType: ExportDocumentType = "fcp") => {
    if (!selectedId || activeExport) return;

    setActiveExport({ format, documentType });
    try {
      setSaveState("saving");
      await update.mutateAsync({ id: selectedId, title, data: fcpDocument });
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

  if (list.isLoading) return <div className="grid min-h-[70vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#c8102e]" /></div>;

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
              <label htmlFor="new-engagement-title" className="text-sm font-medium text-slate-900">Engagement name</label>
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
              <p id="new-engagement-title-help" className="mt-2 text-xs text-slate-500">Use a recognizable customer, account, or project name.</p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={create.isPending}>Cancel</Button>
              <Button type="submit" className="bg-[#c8102e] hover:bg-[#a80d27]" disabled={!canCreateEngagement || create.isPending}>
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create engagement
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <div className="workspace-shell min-h-screen bg-[#f4f6f8]">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 xl:sticky xl:top-0 xl:z-30 xl:h-16 xl:flex-nowrap">
        <div className="flex min-w-0 items-center gap-3"><div className="rounded-md bg-[#c8102e] px-2.5 py-1 text-sm font-black tracking-[-0.08em] text-white">CDW</div><Separator orientation="vertical" className="h-7" /><div className="min-w-0"><div className="flex items-center gap-2"><Input className="h-8 max-w-[440px] border-transparent bg-transparent px-1 text-base font-semibold shadow-none focus-visible:border-slate-200" value={title} onChange={event => { setTitle(event.target.value); setDirty(true); }} aria-label="Engagement title" /><Badge variant="outline" className="hidden md:inline-flex">Internal</Badge></div><p className="px-1 text-xs text-slate-500">Services Entitlement Work Plan &amp; Delivery Handoff</p></div></div>
        <div className="flex items-center gap-2"><Button asChild variant="ghost" size="sm"><Link href="/import"><Upload className="size-4" /> Import pipeline</Link></Button>{selectedIsListed ? <><span className="hidden text-xs text-slate-500 sm:inline">{saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved Changes" : "Saved"}</span><Button variant="outline" size="sm" disabled={update.isPending} onClick={saveNow}>{update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save</Button><Button size="sm" className="bg-[#c8102e] hover:bg-[#a80d27]" onClick={buildPlan}><RefreshCw className="size-4" /> {fcpDocument.planAuthority === "manual" ? "Apply Playbook Template" : "Rebuild Plans"}</Button></> : <Button size="sm" className="bg-[#c8102e] hover:bg-[#a80d27]" onClick={openCreateDialog}><Plus className="size-4" /> New Engagement</Button>}</div>
      </header>

      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 xl:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-white xl:sticky xl:top-16 xl:z-20 xl:flex xl:h-[calc(100vh-4rem)] xl:flex-col xl:self-start xl:border-b-0 xl:border-r"><div className="flex items-center justify-between px-4 py-3 xl:py-4"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Workspace</p><h2 className="text-sm font-semibold text-slate-900">Engagements</h2></div><Button size="icon" className="size-9 bg-slate-950 hover:bg-slate-800" onClick={openCreateDialog} aria-label="Create engagement"><Plus className="size-4" /></Button></div><ScrollArea className="h-[96px] xl:h-auto xl:min-h-0 xl:flex-1"><div className="flex gap-2 px-2 pb-3 xl:block xl:space-y-1 xl:pb-4">{list.data?.map(item => <button key={item.id} className={`group w-[230px] shrink-0 rounded-xl px-3 py-3 text-left transition-colors xl:w-full ${selectedId === item.id ? "bg-slate-950 text-white" : "hover:bg-slate-100"}`} onClick={() => { setSelectedId(item.id); hydratedId.current = null; }}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.title}</p><p className={`mt-1 truncate text-xs ${selectedId === item.id ? "text-slate-300" : "text-slate-500"}`}>{item.customerName}</p></div><MoreHorizontal className="size-4 shrink-0 opacity-50" /></div><div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-400"><span>{item.status}</span><span>{new Date(item.updatedAt).toLocaleDateString()}</span></div></button>)}</div></ScrollArea>{selectedIsListed && <div className="hidden grid-cols-2 gap-2 border-t border-slate-200 p-3 xl:grid"><Button variant="outline" size="sm" onClick={() => duplicate.mutate({ id: selectedId })}><Copy className="size-3.5" /> Duplicate</Button><Button variant="ghost" size="sm" className="text-red-600" onClick={() => { if (window.confirm("Delete this engagement? This cannot be undone.")) remove.mutate({ id: selectedId }); }}><Trash2 className="size-3.5" /> Delete</Button></div>}</aside>

        <main className="min-w-0 p-4 md:p-6">
          {!selectedIsListed ? <EmptyState onCreate={openCreateDialog} /> : selected.isLoading || !selected.data ? <div className="grid min-h-[65vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#c8102e]" /></div> : (
            <div className="space-y-5">
              <EngagementCommandBar document={fcpDocument} title={title} onOpenPackage={() => setStage("package")} />
              <div className="grid gap-5 2xl:grid-cols-[280px_minmax(0,1fr)]">
                <nav className="grid grid-cols-2 gap-2 sm:grid-cols-5 2xl:sticky 2xl:top-[84px] 2xl:block 2xl:self-start" aria-label="Consumption plan workflow">
                  {stageDefinitions.map(stage => <StageNavigationItem key={stage.id} stage={stage} active={workspaceStage === stage.id} onSelect={() => setStage(stage.id)} />)}
                </nav>
                <div className="min-w-0 space-y-5">
                  <StageHeader stage={activeStage} />
                  {workspaceStage === "engagement" && <div className="space-y-5"><CustomerBriefImport document={fcpDocument} onChange={mutateDocument} /><PlanSetup step="upload" document={fcpDocument} onChange={mutateDocument} onExportPlanOutput={format => void startExport(format, "plan-output")} exportingPlanOutput={activeExport?.documentType === "plan-output" && activeExport.format !== "xlsx" ? activeExport.format : null} /><PlanSetup step="customer" document={fcpDocument} onChange={mutateDocument} onExportPlanOutput={format => void startExport(format, "plan-output")} exportingPlanOutput={activeExport?.documentType === "plan-output" && activeExport.format !== "xlsx" ? activeExport.format : null} /><StageAdvance label="Continue to Service Plan" onClick={() => setStage("plan")} /></div>}
                  {workspaceStage === "plan" && <div className="space-y-5"><ScopeAtGlance document={fcpDocument} /><PlanSetup step="timeline" document={fcpDocument} onChange={mutateDocument} onExportPlanOutput={format => void startExport(format, "plan-output")} exportingPlanOutput={activeExport?.documentType === "plan-output" && activeExport.format !== "xlsx" ? activeExport.format : null} />{fcpDocument.planAuthority === "manual" && <section className="border border-amber-300 bg-amber-50 p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[.16em] text-amber-800">Existing manual timeline is still active</p><h3 className="mt-1 text-lg font-semibold text-slate-950">The playbook packages above are a preview and have not replaced the saved plan.</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">Apply the template when you are ready to replace both saved timeline views with the exact design, implementation, validation, adoption, and handoff packages generated from these inputs.</p></div><Button className="shrink-0 bg-[#10233f] hover:bg-[#07182d]" onClick={buildPlan}><RefreshCw className="size-4" /> Apply Playbook Template</Button></div></section>}<WorkPackageRegister document={fcpDocument} /><StageAdvance label="Open Entitlement Adoption Timeline" onClick={() => setStage("staffing")} /></div>}
                  {workspaceStage === "staffing" && <div className="space-y-4"><StaffingSummary document={fcpDocument} /><div className="border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#c8102e]">Delivery basis</p><p className="mt-2 max-w-5xl text-sm leading-6 text-slate-700">{fcpDocument.rationale}</p></div><Button variant="outline" size="sm" onClick={buildPlan}><RefreshCw className="size-4" /> {fcpDocument.planAuthority === "manual" ? "Apply Playbook Template" : "Rebuild Generated Plan"}</Button></div>{fcpDocument.fields.timelineNotes && <div className="mt-4 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950"><strong>Calendar constraints:</strong> {fcpDocument.fields.timelineNotes}</div>}</div><Tabs defaultValue="adoption" className="space-y-4"><TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border border-slate-200 bg-white p-1"><TabsTrigger value="adoption" className="gap-2 rounded-none px-4 py-2"><UsersRound className="size-4" /> Entitlement Adoption Timeline</TabsTrigger><TabsTrigger value="two-year" className="gap-2 rounded-none px-4 py-2"><Workflow className="size-4" /> Two-Year Notional</TabsTrigger></TabsList><TabsContent value="adoption"><EntitlementTimelineWithHours document={fcpDocument} onChange={mutateDocument} onTimelineChange={adoptionTimeline => mutateDocument(synchronizeEntitlementNotionalFromOperational(fcpDocument, adoptionTimeline))} description={fcpDocument.adoptionTimeline.cadence === "week" ? "Use this weekly Entitlement Adoption Timeline to sequence work packages, coordinate delivery roles, and protect key milestones. Drag activities or their edges to refine the delivery windows." : "Use this monthly Entitlement Adoption Timeline to sequence work packages, coordinate delivery roles, and protect key milestones. Drag activities or their edges to refine the delivery windows."} /></TabsContent><TabsContent value="two-year" className="space-y-4">{followOnGuidance.blocked && <section className="border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-amber-800">Consumption plan inputs still needed</p><h3 className="mt-1 text-base font-semibold text-slate-950">{followOnGuidance.title}</h3><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">{followOnGuidance.detail}</p></section>}<NotionalTimelineWithHours document={fcpDocument} onChange={mutateDocument} description="This monthly view starts with design and mobilisation, preserves any intentional implementation delay, and extends the adoption roadmap through a full 24-month horizon." /></TabsContent></Tabs><StageAdvance label="Review Technical Handoff" onClick={() => setStage("technical")} /></div>}
                  {workspaceStage === "technical" && <div className="space-y-5"><PlanSetup step="review" document={fcpDocument} onChange={mutateDocument} onExportPlanOutput={format => void startExport(format, "plan-output")} exportingPlanOutput={activeExport?.documentType === "plan-output" && activeExport.format !== "xlsx" ? activeExport.format : null} /><DeliveryBriefing document={fcpDocument} /><StageAdvance label="Assemble Delivery Package" onClick={() => setStage("package")} /></div>}
                  {workspaceStage === "report" && <div className="space-y-5"><ReportContentEditor document={fcpDocument} onChange={mutateDocument} /></div>}
                  {workspaceStage === "package" && <div className="space-y-4"><DeliveryPackageHeader document={fcpDocument} /><CondensedReportPanel document={fcpDocument} onChange={mutateDocument} /><section className="grid gap-3 border border-slate-200 bg-white p-4 lg:grid-cols-2"><ExportPreferenceCard title="Compatibility summary in the FCP" description="Include the target-release compatibility posture in the FCP: hosts by decision, the top compatibility actions, and the planning considerations from RVTools. The detailed evidence stays in the Compatibility Delivery Handoff." checked={fcpDocument.fields.exportPreferences.includeVcfReadiness} onCheckedChange={includeVcfReadiness => mutateDocument({ ...fcpDocument, fields: { ...fcpDocument.fields, exportPreferences: { ...fcpDocument.fields.exportPreferences, includeVcfReadiness } } })} switchId="include-vcf-readiness-export" /><ExportPreferenceCard title="Delivery adoption timeline" description="Include the entitlement adoption timeline in the FCP so delivery leadership can align resources to the work-package windows. When it is off, the Two-Year Notional covers the whole plan from the project start." checked={fcpDocument.fields.exportPreferences.includeOperationalTimeline} onCheckedChange={includeOperationalTimeline => mutateDocument({ ...fcpDocument, fields: { ...fcpDocument.fields, exportPreferences: { ...fcpDocument.fields.exportPreferences, includeOperationalTimeline } } })} switchId="include-operational-timeline-export" /></section><section className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 lg:grid-cols-2"><DeliverableCard title="Condensed FCP" label="FCP 2.0 · for customer review" description="The Make Amazing Happen condensed plan: entitlement burndown, scoped effort, customer effort, design profile, timeline, and the adoption recommendation. Content checks run before every download." icon={FileCheck2} activeExport={activeExport} documentType="condensed-fcp" onExport={startExport} /><DeliverableCard title="Functional Consumption Plan" label="Customer plan + adoption schedule" description="High-level SOW-style consumption plan covering delivery context, work packages, entitlement-aligned sequencing, adoption timeline, assumptions, milestones, and customer outcomes." icon={FileCheck2} activeExport={activeExport} documentType="fcp" onExport={startExport} /><DeliverableCard title="Compatibility Delivery Handoff" label="Technical engineer evidence pack" description="Maintained-catalog host cohorts, release support, blockers, evidence gaps, owners, and the actions required before platform build." icon={ShieldCheck} activeExport={activeExport} documentType="plan-output" onExport={startExport} />{isCommercialCustomer(fcpDocument.fields) && <DeliverableCard title="Building Blocks Workbook" label="Commercial customer · VCF 9 Building Blocks" description="Every Building Blocks tool block with its category start date, status, projected dates, and dependencies taken from this plan. Out-of-scope blocks start hidden." icon={FileSpreadsheet} activeExport={activeExport} documentType="building-blocks" formats={["xlsx"]} onExport={startExport} />}</section><div className="overflow-hidden border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3"><div className="flex items-center gap-2 text-xs font-semibold text-emerald-700"><ClipboardCheck className="size-4" /> Delivery Package Preview</div><span className="text-xs text-slate-500">Auto-updating from the same plan source</span></div>{preview.isPending && !previewHtml ? <div className="grid h-[720px] place-items-center"><Loader2 className="size-6 animate-spin text-[#c8102e]" /></div> : <iframe title="Live FCP Preview" srcDoc={previewHtml} className="h-[calc(100vh-210px)] min-h-[720px] w-full bg-white" sandbox="allow-scripts" />}</div></div>}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
      </div>
    </>
  );
}

function formatCurrency(value: number) {
  return value ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value) : "Not entered";
}

function formatDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function EngagementCommandBar({ document, title, onOpenPackage }: { document: EngagementDocument; title: string; onOpenPackage: () => void }) {
  const f = document.fields;
  return <section className="overflow-hidden border border-[#10233f] bg-[#07182d] text-white shadow-[0_18px_48px_rgba(7,24,45,.16)]"><div className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6"><div><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-black uppercase tracking-[.18em] text-red-300">Broadcom Services Entitlement Work Plan</span><span className={`border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${document.planAuthority === "manual" ? "border-amber-300/40 bg-amber-300/10 text-amber-200" : "border-emerald-300/40 bg-emerald-300/10 text-emerald-200"}`}>{document.planAuthority === "manual" ? "Authoritative manual plan" : "Generated plan"}</span></div><h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">Build the customer work plan, align resource demand to the adoption schedule, close technical readiness items, and issue one delivery-ready package.</p></div><Button className="w-full bg-[#c8102e] hover:bg-[#a80d27] lg:w-auto" onClick={onOpenPackage}><PackageCheck className="size-4" /> Open Delivery Package</Button></div><div className="flex overflow-x-auto border-t border-white/10 bg-white/[.035] sm:grid sm:grid-cols-2 xl:grid-cols-5"><CommandFact label="Entitlement value" value={formatCurrency(f.entitlementAmount)} icon={Coins} /><CommandFact label="Entitlement term" value={`${formatDate(f.entitlementStart)} – ${formatDate(f.entitlementEnd)}`} icon={CalendarRange} /><CommandFact label="Design starts" value={formatDate(f.plannedProjectStart || f.targetStart)} icon={BriefcaseBusiness} /><CommandFact label="Implementation starts" value={formatDate(f.plannedImplementationStart || f.plannedProjectStart)} icon={Workflow} /><CommandFact label="Target platform" value={f.compatibilityTargetRelease} icon={ShieldCheck} /></div></section>;
}

function CommandFact({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Coins }) {
  return <div className="flex min-w-[185px] shrink-0 items-start gap-3 border-r border-white/10 px-4 py-3 sm:min-w-0 last:border-r-0"><Icon className="mt-0.5 size-4 shrink-0 text-red-300" /><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[.14em] text-slate-400">{label}</p><p className="mt-1 truncate text-xs font-semibold text-white" title={value}>{value}</p></div></div>;
}

function StageNavigationItem({ stage, active, onSelect }: { stage: { step: string; label: string; summary: string; icon: typeof BriefcaseBusiness; complete: boolean }; active: boolean; onSelect: () => void }) {
  const Icon = stage.icon;
  return <button type="button" onClick={onSelect} className={`group relative min-w-0 border px-3 py-3 text-left transition-[background-color,border-color,color,transform] duration-150 active:scale-[.98] 2xl:mb-2 2xl:w-full ${active ? "border-[#10233f] bg-[#10233f] text-white" : "border-slate-200 bg-white text-slate-800 hover:border-slate-400"}`}><div className="flex items-center gap-2"><span className={`text-[9px] font-black tracking-[.16em] ${active ? "text-red-300" : "text-[#c8102e]"}`}>{stage.step}</span><Icon className={`size-4 ${active ? "text-white" : "text-slate-400"}`} /><span className="truncate text-xs font-semibold sm:text-sm">{stage.label}</span><span className={`ml-auto size-2 shrink-0 rounded-full ${stage.complete ? "bg-emerald-400" : active ? "bg-red-300" : "bg-slate-300"}`} /></div><p className={`mt-2 hidden text-[11px] leading-4 2xl:block ${active ? "text-slate-300" : "text-slate-500"}`}>{stage.summary}</p></button>;
}

function StageHeader({ stage }: { stage: { step: string; label: string; summary: string; icon: typeof BriefcaseBusiness; complete: boolean } }) {
  const descriptions: Record<string, string> = {
    Engagement: "Establish the funding envelope, service dates, customer context, target release, and the estate evidence that constrains delivery.",
    "Service Plan": "Translate customer priorities into a high-level SOW plan with delivery work packages, assumptions, dependencies, outcomes, and implementation timing.",
    "Entitlement Adoption Timeline": "Use the Entitlement Adoption Timeline as the primary drawdown schedule. Coordinate delivery roles, manage concurrent work packages, and protect key milestones.",
    "Technical Handoff": "Give delivery engineers a reconciled compatibility posture, evidence gaps, and owned actions before platform work is released.",
    "Delivery Package": "Review completeness, choose what belongs in the customer plan, preview the final source of truth, and issue both delivery artifacts.",
  };
  return <header className="border-b border-slate-300 bg-white px-5 py-5"><div className="flex items-center gap-3"><span className="text-xs font-black tracking-[.18em] text-[#c8102e]">{stage.step}</span><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Consumption plan workflow</p><h2 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-950">{stage.label}</h2></div></div><p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">{descriptions[stage.label]}</p></header>;
}

function StageAdvance({ label, onClick }: { label: string; onClick: () => void }) {
  return <div className="flex justify-end border-t border-slate-200 pt-4"><Button className="bg-[#10233f] hover:bg-[#07182d]" onClick={onClick}>{label}<ArrowRight className="size-4" /></Button></div>;
}

function ScopeAtGlance({ document }: { document: EngagementDocument }) {
  const activities = document.adoptionTimeline.lanes.flatMap(lane => lane.bars);
  const selectedOutcomes = document.fields.priorities.map(priority => ({ operations: "Operations", automation: "Automation & Self-Service", networking: "VCF Networking & NSX", security: "Security", resilience: "Resilience", kubernetes: "Kubernetes", "private-ai": "Private AI" })[priority]);
  return <section className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 md:grid-cols-3"><div className="bg-[#10233f] p-5 text-white"><p className="text-[10px] font-black uppercase tracking-[.16em] text-red-300">SOW-level work plan</p><strong className="mt-2 block text-3xl">{activities.length}</strong><p className="mt-1 text-xs leading-5 text-slate-300">generated work packages before manual refinement</p></div><div className="bg-white p-5"><p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">Selected outcomes</p><p className="mt-3 text-sm font-semibold leading-6 text-slate-900">{selectedOutcomes.length ? selectedOutcomes.join(" · ") : "Select customer outcomes below"}</p></div><div className="bg-white p-5"><p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">Delivery window</p><p className="mt-3 text-sm font-semibold text-slate-900">{formatDate(document.fields.plannedProjectStart)} – {formatDate(document.fields.targetComplete)}</p><p className="mt-1 text-xs leading-5 text-slate-500">Implementation services target {formatDate(document.fields.plannedImplementationStart || document.fields.plannedProjectStart)}.</p></div></section>;
}

function WorkPackageRegister({ document }: { document: EngagementDocument }) {
  const timeline = document.adoptionTimeline;
  const packages = timeline.lanes.flatMap(lane => lane.bars.map(activity => ({ lane, activity }))).sort((left, right) => left.activity.startCol - right.activity.startCol || left.activity.label.localeCompare(right.activity.label));
  return <section className="border border-slate-200 bg-white"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#c8102e]">Draft scope register</p><h3 className="mt-1 text-lg font-semibold text-slate-950">High-level SOW work packages</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Each package carries a delivery role, planning window, intended outcome, and dependency context into staffing and the final delivery package.</p></div><span className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{packages.length} packages</span></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[.12em] text-slate-500"><tr><th className="px-4 py-3">Work package</th><th className="px-4 py-3">Delivery role</th><th className="px-4 py-3">Window</th><th className="px-4 py-3">Outcome / acceptance direction</th><th className="px-4 py-3">Dependencies and assumptions</th></tr></thead><tbody>{packages.map(({ lane, activity }) => <tr key={activity.id} className="border-t border-slate-100 align-top"><td className="px-4 py-3"><p className="font-semibold text-slate-950">{activity.label}</p><p className="mt-1 text-[11px] text-slate-500">{lane.category} · {lane.workstreamType}</p></td><td className="px-4 py-3 font-medium text-slate-700">{DELIVERY_ROLE_BY_WORKSTREAM[lane.workstreamType]}</td><td className="whitespace-nowrap px-4 py-3 text-slate-600">{timeline.columns[activity.startCol - 1] || `Window ${activity.startCol}`} – {timeline.columns[Math.max(activity.startCol - 1, activity.endCol - 2)] || `Window ${activity.endCol - 1}`}</td><td className="px-4 py-3 leading-5 text-slate-700">{activity.outcome || "Confirm the completion evidence and customer acceptance direction during delivery planning."}</td><td className="px-4 py-3 leading-5 text-slate-600">{activity.dependsOn || "Sequence against customer availability, approved change windows, and the work that must finish first."}</td></tr>)}</tbody></table></div><p className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-500">This is a planning-level scope register, not a signed legal statement of work. Delivery leadership must validate effort, named resources, commercial rates, customer responsibilities, and formal acceptance criteria.</p></section>;
}

function StaffingSummary({ document }: { document: EngagementDocument }) {
  const timeline = document.adoptionTimeline;
  const staffing = summarizeDeliveryStaffing(timeline);
  return <section className="border border-slate-200 bg-white"><div className="grid gap-px bg-slate-200 sm:grid-cols-3"><div className="bg-white p-4"><p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">Delivery roles</p><strong className="mt-2 block text-2xl text-slate-950">{staffing.assignments.length}</strong></div><div className="bg-white p-4"><p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">Work packages</p><strong className="mt-2 block text-2xl text-slate-950">{staffing.workPackageCount}</strong></div><div className="bg-white p-4"><p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">Peak concurrent packages</p><strong className="mt-2 block text-2xl text-slate-950">{staffing.peakConcurrentPackages}</strong></div></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="border-y border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-[.12em] text-slate-500"><tr><th className="px-4 py-3">Delivery role</th><th className="px-4 py-3">Workstream</th><th className="px-4 py-3">Packages</th><th className="px-4 py-3">Delivery window</th></tr></thead><tbody>{staffing.assignments.map(item => <tr key={item.role} className="border-b border-slate-100"><td className="px-4 py-3 font-semibold text-slate-900">{item.role}</td><td className="px-4 py-3 text-slate-600">{item.workstreamType}</td><td className="px-4 py-3 text-slate-600">{item.workPackages.length}</td><td className="px-4 py-3 text-slate-600">{item.startLabel} – {item.endLabel}</td></tr>)}</tbody></table></div><p className="px-4 py-3 text-[11px] leading-5 text-slate-500">Role guidance supports delivery-resource planning. Delivery leadership should confirm named resources, effort, utilization, and regional availability before work begins.</p></section>;
}

function DeliveryPackageHeader({ document }: { document: EngagementDocument }) {
  const checks = [
    { label: "Customer and entitlement", ready: Boolean(document.fields.customerName && document.fields.entitlementStart) },
    { label: "Service scope", ready: document.fields.priorities.length > 0 },
    { label: "Entitlement adoption timeline", ready: document.adoptionTimeline.lanes.some(lane => lane.bars.length) },
    { label: "Technical evidence", ready: Boolean(document.inventory.hosts && document.readiness.hardwarePlatforms.length) },
  ];
  return <section className="border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#c8102e]">Handoff control point</p><h3 className="mt-1 text-xl font-semibold text-slate-950">Delivery package readiness</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Both documents are generated from the same entitlement, service-plan, adoption-timeline, and compatibility source of truth.</p></div><span className={`border px-3 py-2 text-xs font-bold uppercase tracking-wide ${checks.every(check => check.ready) ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{checks.filter(check => check.ready).length}/{checks.length} handoff areas ready</span></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{checks.map(check => <div key={check.label} className={`flex items-center gap-2 border px-3 py-2 text-xs font-semibold ${check.ready ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{check.ready ? <ClipboardCheck className="size-4" /> : <FileSpreadsheet className="size-4" />}{check.label}</div>)}</div></section>;
}

function DeliverableCard({ title, label, description, icon: Icon, activeExport, documentType, formats = ["html", "pdf"], onExport }: { title: string; label: string; description: string; icon: typeof FileCheck2; activeExport: ActiveExport; documentType: ExportDocumentType; formats?: ExportFormat[]; onExport: (format: ExportFormat, documentType: ExportDocumentType) => Promise<void> }) {
  return <article className="bg-white p-5"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center bg-[#10233f] text-white"><Icon className="size-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#c8102e]">{label}</p><h3 className="mt-1 text-lg font-semibold text-slate-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></div></div><div className="mt-5 flex gap-2">{formats.map(format => <Button key={format} variant={format === "html" ? "outline" : "default"} size="sm" className={format === "html" ? undefined : "bg-[#c8102e] hover:bg-[#a80d27]"} disabled={Boolean(activeExport)} onClick={() => void onExport(format, documentType)}>{activeExport?.format === format && activeExport.documentType === documentType ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} {format.toUpperCase()}</Button>)}</div></article>;
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
  return <div className="flex min-w-0 items-center justify-between gap-4 rounded-xl bg-slate-50 p-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-950">{title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{description}</p></div><div className="flex shrink-0 items-center gap-3"><div className="text-right"><p className="text-sm font-semibold text-slate-900">{checked ? "Included" : "Omitted"}</p><p className="text-xs text-slate-500">HTML and PDF</p></div><Switch id={switchId} checked={checked} onCheckedChange={onCheckedChange} aria-label={`Include ${title} in HTML and PDF exports`} /></div></div>;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return <div className="mx-auto grid min-h-[70vh] max-w-6xl items-center gap-8 py-8 lg:grid-cols-[1.05fr_.95fr]"><div><div className="inline-flex items-center gap-2 border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold uppercase tracking-[.14em] text-[#9f0b24]"><CalendarRange className="size-3.5" /> CDW Entitlement Delivery Workspace</div><h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight text-slate-950">Turn services entitlement into a staffable delivery work plan.</h1><p className="mt-4 max-w-xl text-base leading-7 text-slate-600">Define the funding window and customer outcomes, shape high-level SOW work packages, align delivery roles to the adoption schedule, resolve technical readiness items, and issue one coherent handoff package.</p><Button size="lg" className="mt-7 bg-[#c8102e] px-6 hover:bg-[#a80d27]" onClick={onCreate}><Plus className="size-4" /> Create First Engagement <ArrowRight className="size-4" /></Button><div className="mt-10 grid gap-3 sm:grid-cols-3"><StarterStep number="01" title="Plan Consumption" text="Confirm entitlement, outcomes, scope, and timing." icon={Coins} /><StarterStep number="02" title="Plan Delivery" text="Align roles, milestones, and concurrent work packages." icon={UsersRound} /><StarterStep number="03" title="Issue Handoff" text="Package the customer plan and technical evidence." icon={PackageCheck} /></div></div><div className="relative overflow-hidden border border-slate-200 bg-[#0b1f37] p-6 text-white shadow-2xl"><div className="absolute -right-20 -top-20 size-56 rounded-full bg-[#c8102e]/30 blur-3xl" /><div className="relative flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-red-300">End-to-End Engagement</p><p className="mt-1 text-lg font-semibold">From funding envelope to delivery mobilization</p></div><Workflow className="size-5 text-red-300" /></div><div className="relative mt-8 space-y-4"><FlowRow title="Engagement" text="Entitlement, customer, estate" /><FlowRow title="Service Plan" text="Work packages and assumptions" /><FlowRow title="Adoption Timeline" text="Roles, windows, and milestones" /><FlowRow title="Delivery Package" text="FCP and technical handoff" /></div><div className="relative mt-6 border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">One source of truth drives the editable timeline, staffing guidance, customer consumption plan, and compatibility delivery handoff.</div></div></div>;
}

function StarterStep({ number, title, text, icon: Icon }: { number: string; title: string; text: string; icon: typeof FileSpreadsheet }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-[10px] font-black tracking-[.18em] text-[#c8102e]">{number}</span><Icon className="size-4 text-slate-400" /></div><h3 className="mt-2 text-sm font-semibold text-slate-900">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>;
}

function FlowRow({ title, text }: { title: string; text: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3"><span className="text-sm font-semibold">{title}</span><span className="text-right text-xs text-slate-300">{text}</span></div>;
}
