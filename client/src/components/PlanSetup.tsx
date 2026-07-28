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
import { HCL_OFFLINE_LIMITATION, hclStatusLabel } from "@shared/hcl";
import { ExternalLink, FileSpreadsheet, HardDrive, Loader2, MonitorCog, RotateCcw, Server, ShieldCheck, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const capabilities: Array<{ value: Capability; label: string; description: string }> = [
  { value: "operations", label: "Operations", description: "Health, capacity, lifecycle and fleet operations" },
  { value: "automation", label: "Automation & self-service", description: "Governed infrastructure consumption" },
  { value: "networking", label: "VCF networking & NSX", description: "Physical fabric, NSX edge and overlay, routing, and network operations" },
  { value: "security", label: "Security", description: "Segmentation, policy and hardening" },
  { value: "resilience", label: "Resilience", description: "Recovery architecture and exercises" },
  { value: "kubernetes", label: "Kubernetes", description: "Modern application platform consumption" },
  { value: "private-ai", label: "Private AI", description: "AI-ready infrastructure after platform planning and design" },
];

const derivedPlanInputFields = new Set<keyof EngagementDocument["fields"]>([
  "entitledCores",
  "entitlementAmount",
  "entitlementStart",
  "entitlementEnd",
  "targetStart",
  "targetComplete",
  "adoptionCadence",
  "hardwareAvailability",
  "hardwareLeadWeeks",
  "priorities",
  "timelineNotes",
  "adoptionDetails",
]);

type Props = { document: EngagementDocument; onChange: (document: EngagementDocument) => void };

export function PlanSetup({ document, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const fields = document.fields;

  const updateFields = (patch: Partial<typeof fields>) => {
    const nextFields = applyScheduleFieldPatch(fields, patch);
    const nextDocument = { ...document, fields: nextFields, readiness: assessReadiness(nextFields, document.inventory, document.inventorySources.flatMap(source => source.warnings)) };
    const changesDerivedPlan = Object.keys(patch).some(field => derivedPlanInputFields.has(field as keyof EngagementDocument["fields"]));
    onChange(changesDerivedPlan ? refreshDerivedDocument(nextDocument) : nextDocument);
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
    const empty = { ...document.inventory, sourceCount: 0, datacenters: 0, clusters: 0, clusterProfiles: [], hosts: 0, physicalCores: 0, vmCount: 0, poweredOnVms: 0, poweredOffVms: 0, vCpu: 0, vmMemoryGiB: 0, datastoreCount: 0, datastoreCapacityTiB: 0, datastoreUsedTiB: 0, snapshotCount: 0, maintenanceHosts: 0, disconnectedHosts: 0, highCpuHosts: 0, highMemoryHosts: 0, overcommittedDatastores: 0, hostModels: [], esxiVersions: [], guestOperatingSystems: [] };
    onChange({ ...document, inventorySources: [], inventory: empty, readiness: assessReadiness(fields, empty) });
  };

  return (
    <div className="space-y-5">
      <Tabs defaultValue="upload" className="space-y-5">
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl bg-white p-1 shadow-sm lg:grid-cols-4">
          <TabsTrigger value="upload" className="rounded-lg py-2.5"><span className="mr-2 text-[10px] font-black text-[#c8102e]">01</span> Upload</TabsTrigger>
          <TabsTrigger value="customer" className="rounded-lg py-2.5"><span className="mr-2 text-[10px] font-black text-[#c8102e]">02</span> Customer</TabsTrigger>
          <TabsTrigger value="timeline" className="rounded-lg py-2.5"><span className="mr-2 text-[10px] font-black text-[#c8102e]">03</span> Adoption</TabsTrigger>
          <TabsTrigger value="review" className="rounded-lg py-2.5"><span className="mr-2 text-[10px] font-black text-[#c8102e]">04</span> Plan Output</TabsTrigger>
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
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Use weekly execution windows when a phase needs to begin in the middle of a month. Changing schedule inputs, confirmed outcomes, implementation path, customer constraints, timeline notes, or industry lens immediately refreshes the deterministic operational plan. The separate two-year outlook remains intentionally monthly and strategic.</p>
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
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[#c8102e]">Current estate</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Observed host inventory</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Grouped host, software, cluster, and memory fields imported from RVTools.</p></div><Badge variant="outline" className="border-slate-300">RVTools source</Badge></div><HostInventory platforms={document.readiness.hardwarePlatforms} /></section>
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

function HostInventory({ platforms }: { platforms: HardwarePlatformAssessment[] }) {
  const normalizeHostGroupText = (input: string) => input.trim().replace(/\s+/g, " ");
  type HclCheck = {
    status: HardwarePlatformAssessment["hcl"]["status"];
    hosts: number;
    cpuSeries: string;
    matchedPartnerName: string;
    matchedModel: string;
    detailUrl: string;
    detail: string;
    nextAction: string;
    modelMatchMethod: HardwarePlatformAssessment["hcl"]["modelMatchMethod"];
    candidateModels: HardwarePlatformAssessment["hcl"]["candidateModels"];
  };
  const groups = new Map<string, {
    vendor: string;
    model: string;
    hosts: number;
    physicalCores: number;
    cpuModels: Set<string>;
    esxiVersions: Map<string, number>;
    clusters: Map<string, number>;
    minimumMemoryGiB: number | null;
    maximumMemoryGiB: number | null;
    statuses: Set<HardwarePlatformAssessment["status"]>;
    hclChecks: Map<string, HclCheck>;
  }>();

  for (const platform of platforms) {
    const vendor = normalizeHostGroupText(platform.vendor) || "Unknown vendor";
    const model = normalizeHostGroupText(platform.model) || "Unknown model";
    const key = `${vendor}::${model}`.toLowerCase();
    const group = groups.get(key) || {
      vendor,
      model,
      hosts: 0,
      physicalCores: 0,
      cpuModels: new Set<string>(),
      esxiVersions: new Map<string, number>(),
      clusters: new Map<string, number>(),
      minimumMemoryGiB: null,
      maximumMemoryGiB: null,
      statuses: new Set<HardwarePlatformAssessment["status"]>(),
      hclChecks: new Map<string, HclCheck>(),
    };
    group.hosts += platform.hosts;
    group.physicalCores += platform.physicalCores;
    if (platform.cpuModel && platform.cpuModel !== "Unknown CPU") group.cpuModels.add(platform.cpuModel);
    for (const version of platform.esxiVersions) group.esxiVersions.set(version.version, (group.esxiVersions.get(version.version) || 0) + version.hosts);
    for (const cluster of platform.clusterMembership) group.clusters.set(cluster.name, (group.clusters.get(cluster.name) || 0) + cluster.hosts);
    if (platform.minimumMemoryGiB > 0) {
      group.minimumMemoryGiB = group.minimumMemoryGiB === null ? platform.minimumMemoryGiB : Math.min(group.minimumMemoryGiB, platform.minimumMemoryGiB);
      group.maximumMemoryGiB = Math.max(group.maximumMemoryGiB || 0, platform.maximumMemoryGiB || platform.minimumMemoryGiB);
    }
    group.statuses.add(platform.status);
    const hclKey = [platform.hcl.status, platform.hcl.matchedCpuSeries, platform.hcl.matchedPartnerName, platform.hcl.matchedModel, platform.hcl.detailUrl].join("|");
    const hclCheck = group.hclChecks.get(hclKey) || {
      status: platform.hcl.status,
      hosts: 0,
      cpuSeries: platform.hcl.matchedCpuSeries,
      matchedPartnerName: platform.hcl.matchedPartnerName,
      matchedModel: platform.hcl.matchedModel,
      detailUrl: platform.hcl.detailUrl,
      detail: platform.hcl.detail,
      nextAction: platform.hcl.nextAction,
      modelMatchMethod: platform.hcl.modelMatchMethod,
      candidateModels: platform.hcl.candidateModels,
    };
    hclCheck.hosts += platform.hosts;
    group.hclChecks.set(hclKey, hclCheck);
    groups.set(key, group);
  }

  const rows = Array.from(groups.values()).sort((left, right) => right.hosts - left.hosts || left.model.localeCompare(right.model));
  const hclCounts = platforms.reduce<Record<HardwarePlatformAssessment["hcl"]["status"], number>>((counts, platform) => {
    counts[platform.hcl.status] += platform.hosts;
    return counts;
  }, { supported: 0, "supported-cpu-unverified": 0, review: 0, "cpu-not-certified": 0, "not-supported": 0, unknown: 0 });
  const snapshotCapturedAt = platforms[0]?.hcl.snapshotCapturedAt || "not reported";
  const badgeClass = (status: HardwarePlatformAssessment["hcl"]["status"]) => ({
    supported: "border-emerald-200 bg-emerald-50 text-emerald-800",
    "supported-cpu-unverified": "border-amber-200 bg-amber-50 text-amber-800",
    review: "border-amber-200 bg-amber-50 text-amber-800",
    "cpu-not-certified": "border-red-200 bg-red-50 text-red-800",
    "not-supported": "border-red-200 bg-red-50 text-red-800",
    unknown: "border-slate-200 bg-slate-100 text-slate-700",
  })[status];
  const deliveryContext = (statuses: Set<HardwarePlatformAssessment["status"]>) => {
    if (statuses.has("upgrade-required")) return "Plan refresh or exception work before platform services.";
    if (statuses.has("unavailable")) return "Capture the missing server and CPU details from the source estate.";
    return "Use the observed model and configuration details in delivery design.";
  };

  return <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.14em] text-[#c8102e]">Host inventory and compatibility evidence</p><h3 className="mt-1 text-base font-semibold text-slate-950">VCF 9.1 server HCL precheck</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">Each consolidated vHost cohort is checked locally against the supplied offline ESXi 9.1 server snapshot using vendor, model, and CPU-series evidence. Results are planning evidence, not a configuration certification.</p></div><a href="https://compatibilityguide.broadcom.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100">Open configuration reference <ExternalLink className="size-3.5" /></a></div>{rows.length ? <><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Snapshot-supported pairing</p><p className="mt-1 text-lg font-semibold text-emerald-950">{hclCounts.supported} host{hclCounts.supported === 1 ? "" : "s"}</p></div><div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"><p className="text-[10px] font-black uppercase tracking-wider text-amber-800">Need confirmation</p><p className="mt-1 text-lg font-semibold text-amber-950">{hclCounts["supported-cpu-unverified"] + hclCounts.review + hclCounts.unknown} host{hclCounts["supported-cpu-unverified"] + hclCounts.review + hclCounts.unknown === 1 ? "" : "s"}</p></div><div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"><p className="text-[10px] font-black uppercase tracking-wider text-red-800">CPU or release not listed</p><p className="mt-1 text-lg font-semibold text-red-950">{hclCounts["cpu-not-certified"] + hclCounts["not-supported"]} host{hclCounts["cpu-not-certified"] + hclCounts["not-supported"] === 1 ? "" : "s"}</p></div></div><p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5 text-slate-500">Offline snapshot captured {snapshotCapturedAt}. {HCL_OFFLINE_LIMITATION}</p><div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="min-w-[1280px] w-full text-left text-xs"><thead className="bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2.5">Observed host group</th><th className="px-3 py-2.5">Estate</th><th className="px-3 py-2.5">Reported ESXi</th><th className="px-3 py-2.5">Cluster / memory</th><th className="px-3 py-2.5">HCL server + CPU evidence</th><th className="px-3 py-2.5">Delivery context</th></tr></thead><tbody>{rows.map(group => { const esxiEvidence = Array.from(group.esxiVersions.entries()).map(([version, hosts]) => `${version}: ${hosts}`).join("; ") || "Not reported"; const clusterEvidence = Array.from(group.clusters.entries()).map(([name, hosts]) => `${name}: ${hosts}`).join("; ") || "Not reported"; const memoryEvidence = group.minimumMemoryGiB !== null ? `${group.minimumMemoryGiB.toLocaleString()}–${(group.maximumMemoryGiB || group.minimumMemoryGiB).toLocaleString()} GiB per host` : "Not reported"; const cpuEvidence = Array.from(group.cpuModels).join("; ") || "CPU model not reported"; const checks = Array.from(group.hclChecks.values()); return <tr key={`${group.vendor}-${group.model}`} className="border-t border-slate-100 align-top"><td className="px-3 py-3"><p className="font-semibold text-slate-900">{group.vendor} {group.model}</p><p className="mt-1 text-slate-500">{cpuEvidence}</p></td><td className="px-3 py-3 text-slate-700">{group.hosts} host{group.hosts === 1 ? "" : "s"}<br /><span className="text-slate-500">{group.physicalCores.toLocaleString()} cores</span></td><td className="px-3 py-3 leading-5 text-slate-700">{esxiEvidence}</td><td className="px-3 py-3 leading-5 text-slate-700">{clusterEvidence}<br /><span className="text-slate-500">{memoryEvidence}</span></td><td className="min-w-80 px-3 py-3"><div className="space-y-2">{checks.map(check => <div key={`${check.status}-${check.cpuSeries}-${check.detailUrl}`} className="rounded-md border border-slate-200 bg-slate-50 p-2"><div className="flex flex-wrap items-center gap-1.5"><Badge variant="outline" className={badgeClass(check.status)}>{hclStatusLabel(check.status)}</Badge><span className="text-[11px] text-slate-500">{check.hosts} host{check.hosts === 1 ? "" : "s"} · {check.modelMatchMethod} model match</span></div><p className="mt-1 text-[11px] leading-4 text-slate-700">{check.matchedPartnerName && check.matchedModel ? `${check.matchedPartnerName} ${check.matchedModel}` : "No deterministic HCL model match"}{check.cpuSeries ? ` · ${check.cpuSeries}` : ""}</p>{check.detailUrl && <a href={check.detailUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[#a20f25] hover:underline">Open matched HCL record <ExternalLink className="size-3" /></a>}<details className="mt-1"><summary className="cursor-pointer text-[11px] font-semibold text-slate-600 hover:text-slate-950">Evidence and next action</summary><p className="mt-1 leading-4 text-slate-600">{check.detail}</p>{check.candidateModels.length > 0 && <p className="mt-1 leading-4 text-slate-600">Candidate models: {check.candidateModels.map(candidate => `${candidate.partnerName} ${candidate.model}`).join("; ")}.</p>}<p className="mt-1 leading-4 font-medium text-slate-700">{check.nextAction}</p></details></div>)}</div></td><td className="px-3 py-3 leading-5 text-slate-700">{deliveryContext(group.statuses)}</td></tr>; })}</tbody></table></div></> : <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-xs leading-5 text-slate-500">No usable host vendor and model data were found in the imported RVTools data.</p>}</section>;
}
