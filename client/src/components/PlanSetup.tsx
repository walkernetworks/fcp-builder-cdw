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
import { applyScheduleFieldPatch, assessReadiness, calculateEntitlementEndDate, emptyInventory, getHclSchedulePath, refreshDerivedDocument, type Capability, type EngagementDocument, type HardwarePlatformAssessment } from "@shared/fcp";
import { HCL_ESTATE_LIMITATION, HCL_EVALUATION_VERSION, HCL_OFFLINE_LIMITATION, hclFindingSeverityLabel, hclStatusLabel, type HclFinding } from "@shared/hcl";
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
  "entitlementAmount",
  "entitlementStart",
  "entitlementEnd",
  "plannedProjectStart",
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
    const changesDerivedPlan = Object.keys(patch).some(field => derivedPlanInputFields.has(field as keyof EngagementDocument["fields"]));
    if (changesDerivedPlan) {
      // Rebuild once: refreshDerivedDocument calculates readiness and the full plan together.
      onChange(refreshDerivedDocument({ ...document, fields: nextFields }));
      return;
    }
    onChange({ ...document, fields: nextFields, readiness: assessReadiness(nextFields, document.inventory, document.inventorySources.flatMap(source => source.warnings)) });
  };

  const importFiles = async (files: File[]) => {
    if (!files.length) return;
    setImporting(true);
    try {
      const result = await parseRvToolsFiles(files);
      const readiness = assessReadiness(fields, result.summary, result.sources.flatMap(source => source.warnings));
      onChange(refreshDerivedDocument({ ...document, inventorySources: result.sources, inventory: result.summary, readiness }));
      toast.success(`${result.sources.length} RVTools export${result.sources.length === 1 ? "" : "s"} parsed locally`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The RVTools export could not be parsed.");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const resetInventory = () => {
    const empty = emptyInventory();
    onChange(refreshDerivedDocument({ ...document, inventorySources: [], inventory: empty, readiness: assessReadiness(fields, empty) }));
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
            <Field label="Entitlement amount (USD)" required hint="Total customer entitlement funds available for this term."><Input type="number" min={0} step="1000" value={fields.entitlementAmount || ""} onChange={event => updateFields({ entitlementAmount: Math.max(0, Number(event.target.value) || 0) })} placeholder="0" /></Field>
            <Field label="Entitlement starts" required><Input type="date" value={fields.entitlementStart} onChange={event => updateFields({ entitlementStart: event.target.value })} /></Field>
            <Field label="Entitlement ends" required hint="Calculated as twelve calendar months after the entitlement start date."><Input type="date" value={calculateEntitlementEndDate(fields.entitlementStart) || fields.entitlementEnd} readOnly aria-readonly="true" className="bg-slate-50 text-slate-600" /></Field>
          </div></section>
        </TabsContent>

        <TabsContent value="timeline">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <p className="text-xs font-black uppercase tracking-[.16em] text-[#c8102e]">Adoption window</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Adoption Timeline and Outcomes</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Use weekly execution windows when a phase needs to begin in the middle of a month. Changing schedule inputs, confirmed outcomes, implementation path, customer constraints, timeline notes, or industry lens immediately refreshes the deterministic operational plan. The separate Notional remains monthly and runs from the planned project start through the calculated entitlement end.</p>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Field label="Planned project start" required hint="This controls the operational delivery timeline and is independent of the entitlement period."><Input type="date" value={fields.plannedProjectStart || fields.targetStart} onChange={event => updateFields({ plannedProjectStart: event.target.value })} /></Field>
              <Field label="Planned project completion" required><Input type="date" value={fields.targetComplete} onChange={event => updateFields({ targetComplete: event.target.value })} /></Field>
              <Field label="Execution schedule cadence" hint="Weekly windows begin on the planned project start date; monthly is best for a high-level execution plan."><Select value={fields.adoptionCadence} onValueChange={value => updateFields({ adoptionCadence: value as typeof fields.adoptionCadence })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">Calendar months</SelectItem><SelectItem value="week">Weekly windows</SelectItem></SelectContent></Select></Field>
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
          <HclEstateFindings document={document} />
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
    { label: "ESXi hosts", value: inventory.hosts, detail: inventory.esxiVersions.length ? `${inventory.esxiVersions.length} reported ESXi release${inventory.esxiVersions.length === 1 ? "" : "s"}` : "ESXi release not reported", icon: Server },
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
  const needsConfirmation = hclCounts["supported-cpu-unverified"] + hclCounts.review + hclCounts.unknown;
  const blockingCount = hclCounts["cpu-not-certified"] + hclCounts["not-supported"];
  const schedulePath = !rows.length ? { label: "Unresolved", detail: "Collect vHost identity and HCL evidence before the platform path is released.", className: "border-slate-200 bg-slate-100 text-slate-800" } : blockingCount ? { label: "Red", detail: "Procurement or greenfield provisioning buffer is required before the HCL gate.", className: "border-red-200 bg-red-50 text-red-800" } : needsConfirmation ? { label: "Yellow", detail: "Remediation and verification buffer is required before the HCL gate.", className: "border-amber-200 bg-amber-50 text-amber-800" } : { label: "Green", detail: "The delivery baseline can proceed to the HCL gate with remaining configuration validation.", className: "border-emerald-200 bg-emerald-50 text-emerald-800" };
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

  return <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.14em] text-[#c8102e]">Host inventory and compatibility evidence</p><h3 className="mt-1 text-base font-semibold text-slate-950">VCF 9.1 server HCL precheck</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">Each consolidated vHost cohort is checked locally against the supplied offline ESXi 9.1 server snapshot using vendor, model, and CPU-series evidence. Results are planning evidence, not a configuration certification.</p></div><a href="https://compatibilityguide.broadcom.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100">Open configuration reference <ExternalLink className="size-3.5" /></a></div><div className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 ${schedulePath.className}`}><div><p className="text-[10px] font-black uppercase tracking-wider">{HCL_EVALUATION_VERSION} delivery path</p><p className="mt-0.5 text-sm font-semibold">{schedulePath.label} path</p></div><p className="max-w-2xl text-xs leading-5">{schedulePath.detail}</p></div>{rows.length ? <><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Snapshot-supported pairing</p><p className="mt-1 text-lg font-semibold text-emerald-950">{hclCounts.supported} host{hclCounts.supported === 1 ? "" : "s"}</p></div><div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"><p className="text-[10px] font-black uppercase tracking-wider text-amber-800">Need confirmation</p><p className="mt-1 text-lg font-semibold text-amber-950">{hclCounts["supported-cpu-unverified"] + hclCounts.review + hclCounts.unknown} host{hclCounts["supported-cpu-unverified"] + hclCounts.review + hclCounts.unknown === 1 ? "" : "s"}</p></div><div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"><p className="text-[10px] font-black uppercase tracking-wider text-red-800">CPU or release not listed</p><p className="mt-1 text-lg font-semibold text-red-950">{hclCounts["cpu-not-certified"] + hclCounts["not-supported"]} host{hclCounts["cpu-not-certified"] + hclCounts["not-supported"] === 1 ? "" : "s"}</p></div></div><p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5 text-slate-500">Offline snapshot captured {snapshotCapturedAt}. {HCL_OFFLINE_LIMITATION}</p><div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="min-w-[1280px] w-full text-left text-xs"><thead className="bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2.5">Observed host group</th><th className="px-3 py-2.5">Estate</th><th className="px-3 py-2.5">Reported ESXi</th><th className="px-3 py-2.5">Cluster / memory</th><th className="px-3 py-2.5">HCL server + CPU evidence</th><th className="px-3 py-2.5">Delivery context</th></tr></thead><tbody>{rows.map(group => { const esxiEvidence = Array.from(group.esxiVersions.entries()).map(([version, hosts]) => `${version}: ${hosts}`).join("; ") || "Not reported"; const clusterEvidence = Array.from(group.clusters.entries()).map(([name, hosts]) => `${name}: ${hosts}`).join("; ") || "Not reported"; const memoryEvidence = group.minimumMemoryGiB !== null ? `${group.minimumMemoryGiB.toLocaleString()}–${(group.maximumMemoryGiB || group.minimumMemoryGiB).toLocaleString()} GiB per host` : "Not reported"; const cpuEvidence = Array.from(group.cpuModels).join("; ") || "CPU model not reported"; const checks = Array.from(group.hclChecks.values()); return <tr key={`${group.vendor}-${group.model}`} className="border-t border-slate-100 align-top"><td className="px-3 py-3"><p className="font-semibold text-slate-900">{group.vendor} {group.model}</p><p className="mt-1 text-slate-500">{cpuEvidence}</p></td><td className="px-3 py-3 text-slate-700">{group.hosts} host{group.hosts === 1 ? "" : "s"}</td><td className="px-3 py-3 leading-5 text-slate-700">{esxiEvidence}</td><td className="px-3 py-3 leading-5 text-slate-700">{clusterEvidence}<br /><span className="text-slate-500">{memoryEvidence}</span></td><td className="min-w-80 px-3 py-3"><div className="space-y-2">{checks.map(check => <div key={`${check.status}-${check.cpuSeries}-${check.detailUrl}`} className="rounded-md border border-slate-200 bg-slate-50 p-2"><div className="flex flex-wrap items-center gap-1.5"><Badge variant="outline" className={badgeClass(check.status)}>{hclStatusLabel(check.status)}</Badge><span className="text-[11px] text-slate-500">{check.hosts} host{check.hosts === 1 ? "" : "s"} · {check.modelMatchMethod} model match</span></div><p className="mt-1 text-[11px] leading-4 text-slate-700">{check.matchedPartnerName && check.matchedModel ? `${check.matchedPartnerName} ${check.matchedModel}` : "No deterministic HCL model match"}{check.cpuSeries ? ` · ${check.cpuSeries}` : ""}</p>{check.detailUrl && <a href={check.detailUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[#a20f25] hover:underline">Open matched HCL record <ExternalLink className="size-3" /></a>}<details className="mt-1"><summary className="cursor-pointer text-[11px] font-semibold text-slate-600 hover:text-slate-950">Evidence and next action</summary><p className="mt-1 leading-4 text-slate-600">{check.detail}</p>{check.candidateModels.length > 0 && <p className="mt-1 leading-4 text-slate-600">Candidate models: {check.candidateModels.map(candidate => `${candidate.partnerName} ${candidate.model}`).join("; ")}.</p>}<p className="mt-1 leading-4 font-medium text-slate-700">{check.nextAction}</p></details></div>)}</div></td><td className="px-3 py-3 leading-5 text-slate-700">{deliveryContext(group.statuses)}</td></tr>; })}</tbody></table></div></> : <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-xs leading-5 text-slate-500">No usable host vendor and model data were found in the imported RVTools data.</p>}</section>;
}


function HclEstateFindings({ document }: { document: EngagementDocument }) {
  const assessment = document.readiness.hcl;
  const findings = assessment.findings;
  const blockers = findings.filter(finding => finding.severity === "BLOCKER");
  const warnings = findings.filter(finding => finding.severity === "WARNING");
  const advisories = findings.filter(finding => finding.severity === "ADVISORY");
  const information = findings.filter(finding => finding.severity === "INFO");
  const path = document.readiness.hclSchedulePath || getHclSchedulePath(document.inventory);
  const pathStyle = {
    red: { label: "Red path", detail: "A release-blocking HCL finding needs a procurement, migration, or design decision before the platform gate.", className: "border-red-200 bg-red-50 text-red-900" },
    yellow: { label: "Yellow path", detail: "HCL remediation or verification work needs to be sequenced before the platform gate.", className: "border-amber-200 bg-amber-50 text-amber-900" },
    green: { label: "Green path", detail: "No blocker or warning was identified in the imported RVTools-observable evidence; explicit coverage gaps still remain.", className: "border-emerald-200 bg-emerald-50 text-emerald-900" },
    unresolved: { label: "Unresolved", detail: "Import RVTools evidence to establish an estate-level HCL path.", className: "border-slate-200 bg-slate-100 text-slate-800" },
  }[path];
  const findingStyle = (severity: HclFinding["severity"]) => ({
    BLOCKER: "border-red-200 bg-red-50 text-red-800",
    WARNING: "border-amber-200 bg-amber-50 text-amber-800",
    ADVISORY: "border-blue-200 bg-blue-50 text-blue-800",
    INFO: "border-slate-200 bg-slate-100 text-slate-700",
  })[severity];

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[.16em] text-[#c8102e]">Estate scope</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">HCL 2.0 evidence and findings</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">The HCL 2.0 precheck evaluates every available RVTools-observable evidence family and records the specific fields that could not be established from the import or supplied offline archive.</p>
      </div>
      <div className={`rounded-xl border px-4 py-3 ${pathStyle.className}`}>
        <p className="text-[10px] font-black uppercase tracking-wider">Estate delivery path</p>
        <p className="mt-1 text-base font-semibold">{pathStyle.label}</p>
      </div>
    </div>

    <p className={`mt-4 rounded-xl border px-4 py-3 text-sm leading-6 ${pathStyle.className}`}>{pathStyle.detail}</p>

    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Blockers", value: blockers.length, className: "border-red-200 bg-red-50 text-red-900" },
        { label: "Warnings", value: warnings.length, className: "border-amber-200 bg-amber-50 text-amber-900" },
        { label: "Advisories", value: advisories.length, className: "border-blue-200 bg-blue-50 text-blue-900" },
        { label: "Coverage gaps", value: assessment.coverageGaps.length, className: "border-slate-200 bg-slate-50 text-slate-900" },
      ].map(metric => <article key={metric.label} className={`rounded-xl border px-4 py-3 ${metric.className}`}><p className="text-[10px] font-black uppercase tracking-wider">{metric.label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{metric.value}</p></article>)}
    </div>

    {findings.length ? <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-950">Observed findings</h3><p className="text-xs text-slate-500">{findings.length} item{findings.length === 1 ? "" : "s"} derived from imported evidence</p></div>
      {findings.map(finding => <article key={`${finding.checkId}-${finding.subject}-${finding.evidence}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${findingStyle(finding.severity)}`}>{hclFindingSeverityLabel(finding.severity)}</span><span className="font-mono text-[11px] font-semibold text-slate-500">{finding.checkId}</span></div><h4 className="mt-2 text-sm font-semibold text-slate-950">{finding.title}</h4><p className="mt-1 text-xs font-medium text-slate-600">{finding.subject}{finding.cluster ? ` · ${finding.cluster}` : ""}</p></div>
          <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{finding.scope}</span>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2"><div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Observed evidence</p><p className="mt-1 text-xs leading-5 text-slate-700">{finding.evidence}</p>{finding.source && <p className="mt-2 text-[11px] leading-4 text-slate-500">Source: {finding.source}</p>}</div><div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Required action</p><p className="mt-1 text-xs leading-5 font-medium text-slate-800">{finding.remediation}</p></div></div>
      </article>)}
    </div> : <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-600">No detailed estate rows are available yet. Upload the applicable RVTools tabs to evaluate the supported HCL 2.0 check families.</div>}

    <details className="mt-5 rounded-xl border border-slate-200 bg-white p-4" open={assessment.coverageGaps.length > 0}>
      <summary className="cursor-pointer text-sm font-semibold text-slate-950">Coverage gaps and evidence still required ({assessment.coverageGaps.length})</summary>
      <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-600">A coverage gap is not a passing result. It identifies a check family that was unavailable, empty, absent from the supplied offline archive, or cannot be established with RVTools data.</p>
      {assessment.coverageGaps.length ? <div className="mt-3 grid gap-2 lg:grid-cols-2">{assessment.coverageGaps.map(gap => <article key={`${gap.kind}-${gap.subject}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{gap.kind.replace(/-/g, " ")}</p><p className="mt-1 text-xs font-semibold text-slate-800">{gap.subject}</p><p className="mt-1 text-xs leading-5 text-slate-600">{gap.impact}</p></article>)}</div> : <p className="mt-3 text-xs text-emerald-700">No coverage gaps were recorded from the supplied estate evidence.</p>}
    </details>

    <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-600">{HCL_ESTATE_LIMITATION}</p>
  </section>;
}
