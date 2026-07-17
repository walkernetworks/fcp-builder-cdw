import { GanttEditor } from "@/components/GanttEditor";
import { PlanSetup } from "@/components/PlanSetup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { createDefaultDocument, migrateDocument, refreshDerivedDocument, type EngagementDocument } from "@shared/fcp";
import { ArrowRight, Copy, Download, FileSpreadsheet, Loader2, LockKeyhole, MoreHorizontal, Plus, RefreshCw, Save, ShieldCheck, Trash2, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

function downloadText(filename: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadBase64(filename: string, mime: string, base64: string) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [title, setTitle] = useState("New FCP engagement");
  const [fcpDocument, setFcpDocument] = useState<EngagementDocument>(() => createDefaultDocument());
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [previewHtml, setPreviewHtml] = useState("");
  const hydratedId = useRef<number | null>(null);

  const list = trpc.engagement.list.useQuery();
  const getInput = useMemo(() => ({ id: selectedId || 0 }), [selectedId]);
  const selected = trpc.engagement.get.useQuery(getInput, { enabled: Boolean(selectedId) });
  const create = trpc.engagement.create.useMutation({ onSuccess: async row => { await utils.engagement.list.invalidate(); setSelectedId(row.id); toast.success("Engagement created"); } });
  const update = trpc.engagement.update.useMutation({ onSuccess: async () => { setDirty(false); setSaveState("saved"); await utils.engagement.list.invalidate(); }, onError: error => { setSaveState("unsaved"); toast.error(error.message); } });
  const duplicate = trpc.engagement.duplicate.useMutation({ onSuccess: async row => { await utils.engagement.list.invalidate(); setSelectedId(row.id); toast.success("Engagement duplicated"); } });
  const remove = trpc.engagement.delete.useMutation({ onSuccess: async () => { setSelectedId(null); hydratedId.current = null; setFcpDocument(createDefaultDocument()); setTitle("New FCP engagement"); await utils.engagement.list.invalidate(); toast.success("Engagement deleted"); } });
  const preview = trpc.document.preview.useMutation({ onSuccess: result => setPreviewHtml(result.html) });
  const htmlExport = trpc.document.html.useMutation({ onSuccess: result => downloadText(result.filename, result.mime, result.content), onError: error => toast.error(error.message) });
  const pdfExport = trpc.document.pdf.useMutation({ onSuccess: result => downloadBase64(result.filename, result.mime, result.base64), onError: error => toast.error(error.message) });

  useEffect(() => { if (!selectedId && list.data?.length) setSelectedId(list.data[0].id); }, [list.data, selectedId]);
  useEffect(() => {
    if (!selected.data || hydratedId.current === selected.data.id) return;
    hydratedId.current = selected.data.id;
    setTitle(selected.data.title);
    setFcpDocument(migrateDocument(selected.data.data));
    setDirty(false);
    setSaveState("saved");
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

  const mutateDocument = (next: EngagementDocument) => { setFcpDocument(next); setDirty(true); };
  const buildPlan = () => { mutateDocument(refreshDerivedDocument(fcpDocument)); toast.success("Deterministic plan rebuilt from confirmed inputs"); };
  const saveNow = () => { if (!selectedId) return; setSaveState("saving"); update.mutate({ id: selectedId, title, data: fcpDocument }); };

  if (list.isLoading) return <div className="grid min-h-[70vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#c8102e]" /></div>;

  return (
    <div className="workspace-shell -m-4 min-h-[calc(100vh-1rem)] bg-[#f4f6f8]">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex min-w-0 items-center gap-3"><div className="rounded-md bg-[#c8102e] px-2.5 py-1 text-sm font-black tracking-[-0.08em] text-white">CDW</div><Separator orientation="vertical" className="h-7" /><div className="min-w-0"><div className="flex items-center gap-2"><Input className="h-8 max-w-[440px] border-transparent bg-transparent px-1 text-base font-semibold shadow-none focus-visible:border-slate-200" value={title} onChange={event => { setTitle(event.target.value); setDirty(true); }} aria-label="Engagement title" /><Badge variant="outline" className="hidden md:inline-flex">Internal</Badge></div><p className="px-1 text-xs text-slate-500">Offline-first Functional Consumption Plan</p></div></div>
        <div className="flex items-center gap-2">{selectedId ? <><span className="hidden text-xs text-slate-500 sm:inline">{saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved changes" : "Saved"}</span><Button variant="outline" size="sm" disabled={update.isPending} onClick={saveNow}>{update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save</Button><Button size="sm" className="bg-[#c8102e] hover:bg-[#a80d27]" onClick={buildPlan}><RefreshCw className="size-4" /> Rebuild plan</Button></> : <Button size="sm" className="bg-[#c8102e] hover:bg-[#a80d27]" onClick={() => create.mutate({ title: "New FCP engagement" })}><Plus className="size-4" /> New engagement</Button>}</div>
      </header>

      <div className="grid min-h-[calc(100vh-64px)] grid-cols-1 xl:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="border-r border-slate-200 bg-white xl:min-h-[calc(100vh-64px)]"><div className="flex items-center justify-between px-4 py-4"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Workspace</p><h2 className="text-sm font-semibold text-slate-900">Engagements</h2></div><Button size="icon" className="size-9 bg-slate-950 hover:bg-slate-800" onClick={() => create.mutate({ title: "New FCP engagement" })} aria-label="Create engagement"><Plus className="size-4" /></Button></div><ScrollArea className={`${(list.data?.length || 0) > 2 ? "h-[260px]" : (list.data?.length || 0) === 2 ? "h-[184px]" : (list.data?.length || 0) === 1 ? "h-[92px]" : "h-0"} xl:h-[calc(100vh-140px)]`}><div className="space-y-1 px-2 pb-4">{list.data?.map(item => <button key={item.id} className={`group w-full rounded-xl px-3 py-3 text-left transition-colors ${selectedId === item.id ? "bg-slate-950 text-white" : "hover:bg-slate-100"}`} onClick={() => { setSelectedId(item.id); hydratedId.current = null; }}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.title}</p><p className={`mt-1 truncate text-xs ${selectedId === item.id ? "text-slate-300" : "text-slate-500"}`}>{item.customerName}</p></div><MoreHorizontal className="size-4 shrink-0 opacity-50" /></div><div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-400"><span>{item.status}</span><span>{new Date(item.updatedAt).toLocaleDateString()}</span></div></button>)}</div></ScrollArea>{selectedId && <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-3"><Button variant="outline" size="sm" onClick={() => duplicate.mutate({ id: selectedId })}><Copy className="size-3.5" /> Duplicate</Button><Button variant="ghost" size="sm" className="text-red-600" onClick={() => { if (window.confirm("Delete this engagement? This cannot be undone.")) remove.mutate({ id: selectedId }); }}><Trash2 className="size-3.5" /> Delete</Button></div>}</aside>

        <main className="min-w-0 p-4 md:p-6">
          {!selectedId ? <EmptyState onCreate={() => create.mutate({ title: "New FCP engagement" })} /> : selected.isLoading ? <div className="grid min-h-[65vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#c8102e]" /></div> : (
            <Tabs defaultValue="setup" className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><TabsList className="h-11 rounded-xl bg-white p-1 shadow-sm"><TabsTrigger value="setup" className="rounded-lg px-5">Plan setup</TabsTrigger><TabsTrigger value="timeline" className="rounded-lg px-5">Timeline</TabsTrigger><TabsTrigger value="preview" className="rounded-lg px-5">Review & export</TabsTrigger></TabsList><div className="flex gap-2"><Button variant="outline" size="sm" disabled={htmlExport.isPending} onClick={() => htmlExport.mutate({ title, data: fcpDocument })}><Download className="size-4" /> HTML</Button><Button variant="outline" size="sm" disabled={pdfExport.isPending} onClick={() => pdfExport.mutate({ title, data: fcpDocument })}>{pdfExport.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} PDF</Button></div></div>
              <TabsContent value="setup"><PlanSetup document={fcpDocument} onChange={mutateDocument} /></TabsContent>
              <TabsContent value="timeline" className="space-y-4"><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[#c8102e]">Deterministic rationale</p><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">{fcpDocument.rationale}</p></div><Button variant="outline" size="sm" onClick={buildPlan}><RefreshCw className="size-4" /> Reset to recommendation</Button></div>{fcpDocument.fields.timelineNotes && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>SA constraints:</strong> {fcpDocument.fields.timelineNotes}</div>}</div><GanttEditor timeline={fcpDocument.timeline} onChange={timeline => mutateDocument({ ...fcpDocument, timeline })} /></TabsContent>
              <TabsContent value="preview"><div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"><div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2"><div className="flex items-center gap-2 text-xs font-semibold text-emerald-700"><ShieldCheck className="size-4" /> No AI-generated content</div><span className="text-xs text-slate-500">Live FCP preview</span><span className="text-xs text-slate-400">Auto-updating</span></div>{preview.isPending && !previewHtml ? <div className="grid h-[720px] place-items-center"><Loader2 className="size-6 animate-spin text-[#c8102e]" /></div> : <iframe title="Live FCP preview" srcDoc={previewHtml} className="h-[calc(100vh-190px)] min-h-[720px] w-full bg-white" sandbox="allow-scripts" />}</div></TabsContent>
            </Tabs>
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return <div className="mx-auto grid min-h-[70vh] max-w-6xl items-center gap-8 py-8 lg:grid-cols-[1.05fr_.95fr]"><div><div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[.14em] text-emerald-800"><LockKeyhole className="size-3.5" /> No AI or internet egress</div><h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight text-slate-950">Upload inventory. Confirm five things. Build the plan.</h1><p className="mt-4 max-w-xl text-base leading-7 text-slate-600">RVTools provides the estate facts. The SA confirms the customer, entitlement, target window, hardware timing, and desired VCF outcomes. The app uses transparent local rules to build an editable plan.</p><Button size="lg" className="mt-7 bg-[#c8102e] px-6 hover:bg-[#a80d27]" onClick={onCreate}><Plus className="size-4" /> Create first engagement <ArrowRight className="size-4" /></Button><div className="mt-10 grid gap-3 sm:grid-cols-3"><StarterStep number="01" title="Upload" text="Parse one or more RVTools exports in the browser." icon={FileSpreadsheet} /><StarterStep number="02" title="Confirm" text="Enter only customer, entitlement, dates, and outcomes." icon={ShieldCheck} /><StarterStep number="03" title="Adjust" text="Edit the deterministic timeline, preview, and export." icon={Workflow} /></div></div><div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[#0b1f37] p-6 text-white shadow-2xl"><div className="absolute -right-20 -top-20 size-56 rounded-full bg-[#c8102e]/30 blur-3xl" /><div className="relative flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-red-300">Security posture</p><p className="mt-1 text-lg font-semibold">Browser-local inventory parsing</p></div><ShieldCheck className="size-5 text-red-300" /></div><div className="relative mt-8 space-y-4"><FlowRow title="RVTools workbook" text="Opened in your browser" /><FlowRow title="Raw VM and host names" text="Never sent to the server" /><FlowRow title="Derived summary" text="Saved inside the deployment boundary" /><FlowRow title="Timeline" text="Built with visible deterministic rules" /></div><div className="relative mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">No LLM endpoint. No public AI. No customer inventory egress.</div></div></div>;
}

function StarterStep({ number, title, text, icon: Icon }: { number: string; title: string; text: string; icon: typeof FileSpreadsheet }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-[10px] font-black tracking-[.18em] text-[#c8102e]">{number}</span><Icon className="size-4 text-slate-400" /></div><h3 className="mt-2 text-sm font-semibold text-slate-900">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div>;
}

function FlowRow({ title, text }: { title: string; text: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3"><span className="text-sm font-semibold">{title}</span><span className="text-right text-xs text-slate-300">{text}</span></div>;
}
