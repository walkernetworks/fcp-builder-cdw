import { AdoptionTimelineEditor } from "@/components/AdoptionTimelineEditor";
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
import { engagementExists, reconcileSelectedEngagementId, shouldQuerySelectedEngagement } from "@/lib/engagementSelection";
import { trpc } from "@/lib/trpc";
import { createDefaultDocument, getFollowOnReadinessGuidance, migrateDocument, refreshDerivedDocument, type EngagementDocument } from "@shared/fcp";
import { ArrowRight, CalendarRange, Copy, Download, FileSpreadsheet, Loader2, MoreHorizontal, Plus, RefreshCw, Save, ShieldCheck, Trash2, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const DEFAULT_ENGAGEMENT_TITLE = "New FCP Engagement";

export default function Home() {
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState(DEFAULT_ENGAGEMENT_TITLE);
  const [newEngagementTitle, setNewEngagementTitle] = useState(DEFAULT_ENGAGEMENT_TITLE);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [fcpDocument, setFcpDocument] = useState<EngagementDocument>(() => createDefaultDocument());
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [previewHtml, setPreviewHtml] = useState("");
  const [exportingFormat, setExportingFormat] = useState<"html" | "pdf" | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<"setup" | "timeline" | "preview">(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    return requested === "timeline" || requested === "preview" ? requested : "setup";
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
  const buildPlan = () => { mutateDocument(refreshDerivedDocument(fcpDocument)); toast.success("Adoption plans rebuilt from the confirmed inputs"); };
  const saveNow = () => { if (!selectedId) return; setSaveState("saving"); update.mutate({ id: selectedId, title, data: fcpDocument }); };
  const startExport = async (format: "html" | "pdf") => {
    if (!selectedId || exportingFormat) return;

    setExportingFormat(format);
    try {
      setSaveState("saving");
      await update.mutateAsync({ id: selectedId, title, data: fcpDocument });
      const result = await downloadTicket.mutateAsync({ id: selectedId, format });
      const response = await fetch(result.url, { credentials: "same-origin" });
      await downloadServerAttachment(response, format, `${title || "FCP"}.${format}`);
      toast.success(`${format.toUpperCase()} download started`);
    } catch (error) {
      console.error(`[Export] ${format.toUpperCase()} download failed`, error);
      toast.error(error instanceof Error ? error.message : `The ${format.toUpperCase()} download could not be started.`);
    } finally {
      setExportingFormat(null);
    }
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
      <div className="workspace-shell -m-4 min-h-[calc(100vh-1rem)] bg-[#f4f6f8]">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex min-w-0 items-center gap-3"><div className="rounded-md bg-[#c8102e] px-2.5 py-1 text-sm font-black tracking-[-0.08em] text-white">CDW</div><Separator orientation="vertical" className="h-7" /><div className="min-w-0"><div className="flex items-center gap-2"><Input className="h-8 max-w-[440px] border-transparent bg-transparent px-1 text-base font-semibold shadow-none focus-visible:border-slate-200" value={title} onChange={event => { setTitle(event.target.value); setDirty(true); }} aria-label="Engagement title" /><Badge variant="outline" className="hidden md:inline-flex">Internal</Badge></div><p className="px-1 text-xs text-slate-500">Functional Consumption Plan Builder</p></div></div>
        <div className="flex items-center gap-2">{selectedIsListed ? <><span className="hidden text-xs text-slate-500 sm:inline">{saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved Changes" : "Saved"}</span><Button variant="outline" size="sm" disabled={update.isPending} onClick={saveNow}>{update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save</Button><Button size="sm" className="bg-[#c8102e] hover:bg-[#a80d27]" onClick={buildPlan}><RefreshCw className="size-4" /> Rebuild Plans</Button></> : <Button size="sm" className="bg-[#c8102e] hover:bg-[#a80d27]" onClick={openCreateDialog}><Plus className="size-4" /> New Engagement</Button>}</div>
      </header>

      <div className="grid min-h-[calc(100vh-64px)] grid-cols-1 xl:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="border-r border-slate-200 bg-white xl:min-h-[calc(100vh-64px)]"><div className="flex items-center justify-between px-4 py-4"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Workspace</p><h2 className="text-sm font-semibold text-slate-900">Engagements</h2></div><Button size="icon" className="size-9 bg-slate-950 hover:bg-slate-800" onClick={openCreateDialog} aria-label="Create engagement"><Plus className="size-4" /></Button></div><ScrollArea className={`${(list.data?.length || 0) > 2 ? "h-[260px]" : (list.data?.length || 0) === 2 ? "h-[184px]" : (list.data?.length || 0) === 1 ? "h-[92px]" : "h-0"} xl:h-[calc(100vh-140px)]`}><div className="space-y-1 px-2 pb-4">{list.data?.map(item => <button key={item.id} className={`group w-full rounded-xl px-3 py-3 text-left transition-colors ${selectedId === item.id ? "bg-slate-950 text-white" : "hover:bg-slate-100"}`} onClick={() => { setSelectedId(item.id); hydratedId.current = null; }}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.title}</p><p className={`mt-1 truncate text-xs ${selectedId === item.id ? "text-slate-300" : "text-slate-500"}`}>{item.customerName}</p></div><MoreHorizontal className="size-4 shrink-0 opacity-50" /></div><div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-400"><span>{item.status}</span><span>{new Date(item.updatedAt).toLocaleDateString()}</span></div></button>)}</div></ScrollArea>{selectedIsListed && <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-3"><Button variant="outline" size="sm" onClick={() => duplicate.mutate({ id: selectedId })}><Copy className="size-3.5" /> Duplicate</Button><Button variant="ghost" size="sm" className="text-red-600" onClick={() => { if (window.confirm("Delete this engagement? This cannot be undone.")) remove.mutate({ id: selectedId }); }}><Trash2 className="size-3.5" /> Delete</Button></div>}</aside>

        <main className="min-w-0 p-4 md:p-6">
          {!selectedIsListed ? <EmptyState onCreate={openCreateDialog} /> : selected.isLoading || !selected.data ? <div className="grid min-h-[65vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#c8102e]" /></div> : (
            <Tabs value={workspaceTab} onValueChange={value => { const next = value as "setup" | "timeline" | "preview"; setWorkspaceTab(next); const url = new URL(window.location.href); if (next === "setup") url.searchParams.delete("tab"); else url.searchParams.set("tab", next); window.history.replaceState({}, "", url); }} className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><TabsList className="h-11 rounded-xl bg-white p-1 shadow-sm"><TabsTrigger value="setup" className="rounded-lg px-5">Plan Setup</TabsTrigger><TabsTrigger value="timeline" className="rounded-lg px-5">Adoption Timelines</TabsTrigger><TabsTrigger value="preview" className="rounded-lg px-5">Export</TabsTrigger></TabsList><div className="flex gap-2"><Button variant="outline" size="sm" disabled={Boolean(exportingFormat)} onClick={() => void startExport("html")}>{exportingFormat === "html" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} HTML</Button><Button variant="outline" size="sm" disabled={Boolean(exportingFormat)} onClick={() => void startExport("pdf")}>{exportingFormat === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} PDF</Button></div></div>

              <TabsContent value="setup"><PlanSetup document={fcpDocument} onChange={mutateDocument} /></TabsContent>

              <TabsContent value="timeline" className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[#c8102e]">Plan Basis</p><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">{fcpDocument.rationale}</p></div><Button variant="outline" size="sm" onClick={buildPlan}><RefreshCw className="size-4" /> Reset Both Plans</Button></div>{fcpDocument.fields.timelineNotes && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>Timeline Constraints:</strong> {fcpDocument.fields.timelineNotes}</div>}</div>
                <Tabs defaultValue="two-year" className="space-y-4">
                  <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl bg-white p-1 shadow-sm"><TabsTrigger value="two-year" className="gap-2 rounded-lg px-4 py-2"><Workflow className="size-4" /><span className="sm:hidden">Notional</span><span className="hidden sm:inline">Entitlement Notional</span></TabsTrigger><TabsTrigger value="adoption" className="gap-2 rounded-lg px-4 py-2"><CalendarRange className="size-4" /> Operational Adoption Timeline</TabsTrigger></TabsList>
                  <TabsContent value="two-year" className="space-y-4">{followOnGuidance.blocked && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-amber-800">Follow-On Plan Inputs</p><h3 className="mt-1 text-base font-semibold text-slate-950">{followOnGuidance.title}</h3><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">{followOnGuidance.detail}</p><div className="mt-3 border-t border-amber-200 pt-3"><p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Next actions</p><ul className="mt-2 space-y-1.5 text-sm leading-5 text-slate-700">{followOnGuidance.actions.map(action => <li key={action} className="flex gap-2"><span className="text-amber-700">•</span><span>{action}</span></li>)}</ul></div></section>}<AdoptionTimelineEditor timeline={fcpDocument.twoYearPlan} onChange={twoYearPlan => mutateDocument({ ...fcpDocument, twoYearPlan })} title="Entitlement Notional" description="This monthly Notional begins on the planned project start date and ends on the calculated entitlement end date. It retains only selected delivery, governance, lifecycle, handover, and expansion work that fits within the entitlement period. Every item remains editable and is a planning recommendation, not a service commitment." /></TabsContent>
                  <TabsContent value="adoption"><AdoptionTimelineEditor timeline={fcpDocument.adoptionTimeline} onChange={adoptionTimeline => mutateDocument({ ...fcpDocument, adoptionTimeline })} title="Operational Adoption Timeline" description={fcpDocument.adoptionTimeline.cadence === "week" ? "This two-year operational view begins on the planned project start date and uses weekly execution windows. Drag activities or their edges to refine the schedule." : "This two-year operational view begins on the planned project start date and uses calendar-month execution windows. Drag activities or their edges to refine the schedule."} /></TabsContent>
                </Tabs>
              </TabsContent>

              <TabsContent value="preview" className="space-y-4"><section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div><p className="text-xs font-bold uppercase tracking-wider text-[#c8102e]">Export contents</p><h2 className="mt-1 text-base font-semibold text-slate-950">VCF 9.1 readiness</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Include the detailed RVTools-backed VCF 9.1 readiness and host-inventory section in HTML and PDF exports. Turning this off leaves the customer synopsis, footprint, scope, and timelines intact.</p></div><div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2"><div className="text-right"><p className="text-sm font-semibold text-slate-900">{fcpDocument.fields.exportPreferences.includeVcfReadiness ? "Included" : "Omitted"}</p><p className="text-xs text-slate-500">HTML and PDF</p></div><Switch id="include-vcf-readiness-export" checked={fcpDocument.fields.exportPreferences.includeVcfReadiness} onCheckedChange={includeVcfReadiness => mutateDocument({ ...fcpDocument, fields: { ...fcpDocument.fields, exportPreferences: { includeVcfReadiness } } })} aria-label="Include VCF 9.1 readiness in HTML and PDF exports" /></div></section><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"><div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2"><div className="flex items-center gap-2 text-xs font-semibold text-emerald-700"><ShieldCheck className="size-4" /> Internal Engagement Workspace</div><span className="text-xs text-slate-500">Live FCP Preview</span><span className="text-xs text-slate-400">Auto-Updating</span></div>{preview.isPending && !previewHtml ? <div className="grid h-[720px] place-items-center"><Loader2 className="size-6 animate-spin text-[#c8102e]" /></div> : <iframe title="Live FCP Preview" srcDoc={previewHtml} className="h-[calc(100vh-190px)] min-h-[720px] w-full bg-white" sandbox="allow-scripts" />}</div></TabsContent>
            </Tabs>
          )}
        </main>
      </div>
      </div>
    </>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return <div className="mx-auto grid min-h-[70vh] max-w-6xl items-center gap-8 py-8 lg:grid-cols-[1.05fr_.95fr]"><div><div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold uppercase tracking-[.14em] text-[#9f0b24]"><CalendarRange className="size-3.5" /> CDW FCP Workspace</div><h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight text-slate-950">Upload inventory. Confirm the entitlement. Shape the adoption plan.</h1><p className="mt-4 max-w-xl text-base leading-7 text-slate-600">RVTools provides the estate facts. The SA confirms the customer, entitlement, planned project start, and desired outcomes—then adjusts independently typed workstreams directly on the calendar.</p><Button size="lg" className="mt-7 bg-[#c8102e] px-6 hover:bg-[#a80d27]" onClick={onCreate}><Plus className="size-4" /> Create First Engagement <ArrowRight className="size-4" /></Button><div className="mt-10 grid gap-3 sm:grid-cols-3"><StarterStep number="01" title="Upload" text="Add one or more RVTools exports." icon={FileSpreadsheet} /><StarterStep number="02" title="Confirm" text="Enter customer, entitlement value, term, and outcomes." icon={ShieldCheck} /><StarterStep number="03" title="Shape" text="Drag and resize activities across calendar months." icon={Workflow} /></div></div><div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[#0b1f37] p-6 text-white shadow-2xl"><div className="absolute -right-20 -top-20 size-56 rounded-full bg-[#c8102e]/30 blur-3xl" /><div className="relative flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-red-300">Engagement Flow</p><p className="mt-1 text-lg font-semibold">From estate facts to an editable plan</p></div><Workflow className="size-5 text-red-300" /></div><div className="relative mt-8 space-y-4"><FlowRow title="RVTools Exports" text="Estate details" /><FlowRow title="Customer Entitlement" text="Amount and term" /><FlowRow title="Entitlement Notional" text="Entitlement start through entitlement end" /><FlowRow title="Operational Timeline" text="Two years from planned project start" /></div><div className="relative mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">The operational timeline and entitlement-aligned Notional remain easy to rename, move, resize, add to, and export as the engagement changes.</div></div></div>;
}

function StarterStep({ number, title, text, icon: Icon }: { number: string; title: string; text: string; icon: typeof FileSpreadsheet }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-[10px] font-black tracking-[.18em] text-[#c8102e]">{number}</span><Icon className="size-4 text-slate-400" /></div><h3 className="mt-2 text-sm font-semibold text-slate-900">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>;
}

function FlowRow({ title, text }: { title: string; text: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3"><span className="text-sm font-semibold">{title}</span><span className="text-right text-xs text-slate-300">{text}</span></div>;
}
