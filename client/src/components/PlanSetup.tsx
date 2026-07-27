import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DetailedAdoptionIntake } from "@/components/DetailedAdoptionIntake";
import { parseRvToolsFiles } from "@/lib/rvtools";
import { applyScheduleFieldPatch, assessReadiness, refreshDerivedDocument, type Capability, type EngagementDocument, type HardwarePlatformAssessment } from "@shared/fcp";
import { AlertCircle, CheckCircle2, ExternalLink, FileSpreadsheet, HardDrive, Info, Loader2, MonitorCog, RotateCcw, Server, ShieldCheck, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const capabilities: Array<{ value: Capability; label: string; description: string }> = [
  { value: "operations", label: "Operations", description: "Health, capacity, lifecycle and fleet operations" },
  { value: "automation", label: "Automation & self-service", description: "Governed infrastructure consumption" },
  { value: "security", label: "Security", description: "Segmentation, policy and hardening" },
  { value: "resilience", label: "Resilience", description: "Recovery architecture and exercises" },
  { value: "kubernetes", label: "Kubernetes", description: "Modern application platform consumption" },
  { value: "private-ai", label: "Private AI", description: "AI-ready infrastructure after platform planning and design" },
];

const scheduleInputFields = new Set<keyof EngagementDocument["fields"]>([
  "entitlementStart",
  "entitlementEnd",
  "targetStart",
  "targetComplete",
  "adoptionCadence",
]);

type Props = { document: EngagementDocument; onChange: (document: EngagementDocument) => void };

export function PlanSetup({ document, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const fields = document.fields;

  const updateFields = (patch: Partial<typeof fields>) => {
    const nextFields = applyScheduleFieldPatch(fields, patch);
    const nextDocument = { ...document, fields: nextFields, readiness: assessReadiness(nextFields, document.inventory, document.inventorySources.flatMap(source => source.warnings)) };
    const changesSchedule = Object.keys(patch).some(field => scheduleInputFields.has(field as keyof EngagementDocument["fields"]));
    onChange(changesSchedule ? refreshDerivedDocument(nextDocument) : nextDocument);
  };

  const importFiles = async (files: File[]) => {
    if (!files.length) return;
    setImporting(true);
    try {
      const result = await parseRvToolsFiles(files);
      const readiness = assessReadiness(fields, result.summary, result.sources.flatMap(source => source.warnings));
      onChange({ ...document, inventorySources: result.sources, inventory: result.summary, readiness });
      toast.success(`${result.sources.length} RVTools export${result.sources.length === 1 ? "" : "s"} parsed locally`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The RVTools export could not be parsed.");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const resetInventory = () => {
    const empty = { ...document.inventory, sourceCount: 0, datacenters: 0, clusters: 0, hosts: 0, physicalCores: 0, vmCount: 0, poweredOnVms: 0, poweredOffVms: 0, vCpu: 0, vmMemoryGiB: 0, datastoreCount: 0, datastoreCapacityTiB: 0, datastoreUsedTiB: 0, snapshotCount: 0, maintenanceHosts: 0, disconnectedHosts: 0, highCpuHosts: 0, highMemoryHosts: 0, overcommittedDatastores: 0, hostModels: [], esxiVersions: [], guestOperatingSystems: [] };
    onChange({ ...document, inventorySources: [], inventory: empty, readiness: assessReadiness(fields, empty) });
  };

  return (
    <div className="space-y-5">
      <Tabs defaultValue="upload" className="space-y-5">
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl bg-white p-1 shadow-sm lg:grid-cols-4">
          <TabsTrigger value="upload" className="rounded-lg py-2.5"><span className="mr-2 text-[10px] font-black text-[#c8102e]">01</span> Upload</TabsTrigger>
          <TabsTrigger value="customer" className="rounded-lg py-2.5"><span className="mr-2 text-[10px] font-black text-[#c8102e]">02</span> Customer</TabsTrigger>
          <TabsTrigger value="timeline" className="rounded-lg py-2.5"><span className="mr-2 text-[10px] font-black text-[#c8102e]">03</span> Adoption</TabsTrigger>
          <TabsTrigger value="review" className="rounded-lg py-2.5"><span className="mr-2 text-[10px] font-black text-[#c8102e]">04</span> Review</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#c8102e]">Current estate</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Drop in RVTools exports</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Select one or more XLSX exports together. Duplicate VMs, hosts, and datastores are reconciled using stable IDs when available.</p></div>{document.inventorySources.length > 0 && <Button variant="outline" size="sm" onClick={resetInventory}><RotateCcw className="size-4" /> Clear inventory</Button>}</div>
            <button type="button" className="mt-6 grid min-h-52 w-full place-items-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 text-center transition-colors hover:border-[#c8102e] hover:bg-red-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8102e]" onClick={() => inputRef.current?.click()} disabled={importing}>
              <span><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-slate-950 text-white">{importing ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}</span><strong className="mt-4 block text-base text-slate-950">{importing ? "Reading inventory…" : "Choose RVTools XLSX or CSV files"}</strong><span className="mt-1 block text-sm text-slate-500">Up to 20 files · 30 MB each · parsed only in this browser</span></span>
            </button>
            <input ref={inputRef} type="file" className="hidden" accept=".xlsx,.csv" multiple onChange={event => void importFiles(Array.from(event.target.files || []))} />
            {document.inventorySources.length > 0 && <div className="mt-5 grid gap-3 md:grid-cols-2">{document.inventorySources.map(source => <article key={source.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start gap-3"><FileSpreadsheet className="mt-0.5 size-5 text-emerald-700" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{source.filename}</p><p className="mt-1 text-xs text-slate-500">{(source.byteSize / 1024 / 1024).toFixed(1)} MB · {source.sheets.length} sheets</p>{source.warnings.map(warning => <p key={warning} className="mt-2 text-xs leading-5 text-amber-700">{warning}</p>)}</div></div></article>)}</div>}
          </section>
          <InventoryCards document={document} />
        </TabsContent>

        <TabsContent value="customer">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7"><p className="text-xs font-black uppercase tracking-[.16em] text-[#c8102e]">Minimum input</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Customer and entitlement</h2><p className="mt-2 text-sm text-slate-600">Only information that cannot be observed in RVTools is requested.</p><div className="mt-6 grid gap-5 md:grid-cols-2">
            <Field label="Customer name" required><Input value={fields.customerName} onChange={event => updateFields({ customerName: event.target.value })} placeholder="Customer organization" /></Field>
            <Field label="CDW account / customer ID"><Input value={fields.accountId} onChange={event => updateFields({ accountId: event.target.value })} placeholder="Optional internal identifier" /></Field>
            <Field label="Primary location"><Input value={fields.location} onChange={event => updateFields({ location: event.target.value })} placeholder="City, state or region" /></Field>
            <Field label="Primary customer contact"><Input value={fields.primaryContact} onChange={event => updateFields({ primaryContact: event.target.value })} placeholder="Name or role" /></Field>
            <Field label="Entitled physical cores" required hint="Compared with observed RVTools physical cores."><Input type="number" min={0} value={fields.entitledCores || ""} onChange={event => updateFields({ entitledCores: Math.max(0, Number(event.target.value) || 0) })} placeholder="0" /></Field>
            <Field label="Entitlement amount (USD)" required hint="Total customer entitlement funds available for this term."><Input type="number" min={0} step="1000" value={fields.entitlementAmount || ""} onChange={event => updateFields({ entitlementAmount: Math.max(0, Number(event.target.value) || 0) })} placeholder="0" /></Field>
            <Field label="Entitlement starts" required><Input type="date" value={fields.entitlementStart} onChange={event => updateFields({ entitlementStart: event.target.value })} /></Field>
            <Field label="Entitlement ends" required><Input type="date" value={fields.entitlementEnd} onChange={event => updateFields({ entitlementEnd: event.target.value })} /></Field>
          </div></section>
        </TabsContent>

        <TabsContent value="timeline">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <p className="text-xs font-black uppercase tracking-[.16em] text-[#c8102e]">Adoption window</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Adoption Timeline and Outcomes</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Use weekly execution windows when a phase needs to begin in the middle of a month. Changing the start date, completion date, linked entitlement dates, or cadence automatically reflows the generated operational plan. The separate two-year outlook remains intentionally monthly and strategic.</p>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field label="Target start" required><Input type="date" value={fields.targetStart} onChange={event => updateFields({ targetStart: event.target.value })} /></Field>
              <Field label="Target completion" required><Input type="date" value={fields.targetComplete} onChange={event => updateFields({ targetComplete: event.target.value })} /></Field>
              <Field label="Execution schedule cadence" hint="Weekly windows begin on the target-start date; monthly is best for a high-level execution plan."><Select value={fields.adoptionCadence} onValueChange={value => updateFields({ adoptionCadence: value as typeof fields.adoptionCadence })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">Calendar months</SelectItem><SelectItem value="week">Weekly windows</SelectItem></SelectContent></Select></Field>
              <Field label="Hardware availability"><Select value={fields.hardwareAvailability} onValueChange={value => updateFields({ hardwareAvailability: value as typeof fields.hardwareAvailability })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="existing">Existing / available</SelectItem><SelectItem value="new">New procurement required</SelectItem><SelectItem value="unknown">Not yet known</SelectItem></SelectContent></Select></Field>
              {fields.hardwareAvailability === "new" && <Field label="Estimated lead time (weeks)"><Input type="number" min={0} max={104} value={fields.hardwareLeadWeeks || ""} onChange={event => updateFields({ hardwareLeadWeeks: Math.min(104, Math.max(0, Number(event.target.value) || 0)) })} /></Field>}
            </div>
            <div className="mt-7"><Label className="text-sm font-semibold">Which VCF outcomes should the plan prioritize?</Label><div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{capabilities.map(capability => { const checked = fields.priorities.includes(capability.value); return <label key={capability.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${checked ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 hover:bg-slate-50"}`}><Checkbox checked={checked} className="mt-0.5" onCheckedChange={next => updateFields({ priorities: next ? [...fields.priorities, capability.value] : fields.priorities.filter(item => item !== capability.value) })} /><span><strong className="block text-sm">{capability.label}</strong><span className={`mt-1 block text-xs leading-5 ${checked ? "text-slate-300" : "text-slate-500"}`}>{capability.description}</span></span></label>; })}</div></div>
            <DetailedAdoptionIntake fields={fields} onPatch={updateFields} />
            <Field label="Adoption Timeline Notes" hint="Only exceptions, fixed dates, blackout windows, or sequencing constraints."><Textarea className="mt-2 min-h-28" value={fields.timelineNotes} onChange={event => updateFields({ timelineNotes: event.target.value })} placeholder="Example: production freeze in December; datacenter exit must finish by Q3." /></Field>
          </section>
        </TabsContent>

        <TabsContent value="review" className="space-y-5">
          <InventoryCards document={document} />
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#c8102e]">VCF 9.1</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Inventory-Informed Planning Considerations</h2></div><Badge variant="outline" className="border-slate-300">Planning View</Badge></div><div className="mt-6 grid gap-3 md:grid-cols-2">{document.readiness.items.map(item => <ReadinessCard key={item.id} item={item} />)}</div><HardwarePlatformPrecheck platforms={document.readiness.hardwarePlatforms} /><div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600"><strong className="text-slate-900">Planning boundary:</strong> {document.readiness.disclaimer}</div></section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}{required && <span className="ml-1 text-[#c8102e]">*</span>}</Label>{children}{hint && <p className="text-xs leading-5 text-slate-500">{hint}</p>}</div>;
}

function InventoryCards({ document }: { document: EngagementDocument }) {
  const inventory = document.inventory;
  const cards = [
    { label: "Virtual machines", value: inventory.vmCount, detail: `${inventory.poweredOnVms} powered on`, icon: MonitorCog },
    { label: "ESXi hosts", value: inventory.hosts, detail: `${inventory.physicalCores} physical cores`, icon: Server },
    { label: "Clusters", value: inventory.clusters, detail: `${inventory.datacenters} datacenters`, icon: HardDrive },
    { label: "Datastore capacity", value: inventory.datastoreCapacityTiB ? `${inventory.datastoreCapacityTiB} TiB` : 0, detail: `${inventory.datastoreUsedTiB} TiB used`, icon: ShieldCheck },
  ];
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(card => <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{card.label}</p><card.icon className="size-4 text-slate-400" /></div><strong className="mt-3 block text-3xl tracking-tight text-slate-950">{card.value || "—"}</strong><p className="mt-1 text-xs text-slate-500">{card.detail}</p></article>)}</div>;
}

function HardwarePlatformPrecheck({ platforms }: { platforms: HardwarePlatformAssessment[] }) {
  const statusStyles: Record<HardwarePlatformAssessment["status"], string> = {
    candidate: "border-blue-200 bg-blue-50 text-blue-800",
    "upgrade-required": "border-amber-200 bg-amber-50 text-amber-800",
    "review-required": "border-slate-200 bg-slate-50 text-slate-700",
    unavailable: "border-slate-200 bg-slate-50 text-slate-500",
  };
  const statusLabels: Record<HardwarePlatformAssessment["status"], string> = {
    candidate: "Candidate",
    "upgrade-required": "Upgrade required",
    "review-required": "Review required",
    unavailable: "Evidence unavailable",
  };

  return <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.14em] text-[#c8102e]">Hardware compatibility</p><h3 className="mt-1 text-base font-semibold text-slate-950">VCF 9.1 platform precheck</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">Observed platforms are grouped into one delivery-owned compatibility assessment. Use the cohort evidence to prioritize configuration checks, remediation decisions, and missing evidence; RVTools alone does not certify an exact server configuration.</p></div><a href="https://compatibilityguide.broadcom.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100">Open Broadcom guide <ExternalLink className="size-3.5" /></a></div>{platforms.length ? <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="min-w-[980px] w-full text-left text-xs"><thead className="bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2.5">Observed platform</th><th className="px-3 py-2.5">Estate</th><th className="px-3 py-2.5">Observed ESXi</th><th className="px-3 py-2.5">VCF 9.1 precheck</th><th className="px-3 py-2.5">Compatibility assessment action</th></tr></thead><tbody>{platforms.map(platform => { const esxiEvidence = platform.esxiVersions.map(item => `${item.version}: ${item.hosts}`).join("; ") || "Not available"; const correlation = platform.esxiCorrelation === "per-platform" ? "Correlated to the same RVTools host rows" : platform.esxiCorrelation === "estate-wide" ? "Estate-wide evidence; not uniquely correlated" : "Unavailable in RVTools host rows"; return <tr key={platform.id} className="border-t border-slate-100 align-top"><td className="px-3 py-3"><p className="font-semibold text-slate-900">{platform.vendor} {platform.model}</p><p className="mt-1 text-slate-500">{platform.cpuModel}</p></td><td className="px-3 py-3 text-slate-700">{platform.hosts} host{platform.hosts === 1 ? "" : "s"}<br /><span className="text-slate-500">{platform.physicalCores.toLocaleString()} cores</span></td><td className="px-3 py-3 leading-5 text-slate-700">{esxiEvidence}<br /><span className="text-slate-500">{correlation}</span></td><td className="px-3 py-3"><Badge variant="outline" className={`border ${statusStyles[platform.status]}`}>{statusLabels[platform.status]}</Badge><p className="mt-2 max-w-sm leading-5 text-slate-600">{platform.detail}</p></td><td className="px-3 py-3 leading-5 text-slate-700">{platform.nextAction}</td></tr>; })}</tbody></table></div> : <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-xs leading-5 text-slate-500">No usable host vendor and model rows were found in the imported RVTools data. Upload a vHost export to build the compatibility precheck.</p>}</section>;
}

function ReadinessCard({ item }: { item: EngagementDocument["readiness"]["items"][number] }) {
  const styles = item.status === "good" ? "border-emerald-200 bg-emerald-50" : item.status === "attention" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50";
  const Icon = item.status === "good" ? CheckCircle2 : item.status === "attention" ? AlertCircle : Info;
  return <article className={`rounded-xl border p-4 ${styles}`}><div className="flex items-start gap-3"><Icon className={`mt-0.5 size-5 shrink-0 ${item.status === "good" ? "text-emerald-700" : item.status === "attention" ? "text-amber-700" : "text-slate-500"}`} /><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-950">{item.title}</h3><Badge variant="outline" className="h-5 text-[9px] uppercase">{item.status}</Badge></div><p className="mt-1 text-xs leading-5 text-slate-700">{item.detail}</p><p className="mt-2 text-[11px] leading-5 text-slate-500">{item.evidence}</p></div></div></article>;
}
