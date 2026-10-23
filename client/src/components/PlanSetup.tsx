import { Button } from "@/components/ui/button";
import { Chip, Pill } from "@/components/vsa/elements";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DetailedAdoptionIntake } from "@/components/DetailedAdoptionIntake";
import { CompatibilityHandoffPanel, DECISION_VERDICT } from "@/components/CompatibilityHandoffPanel";
import { parseRvToolsFiles } from "@/lib/rvtools";
import { applyScheduleFieldPatch, assessReadiness, calculateEntitlementEndDate, effectivePlatformEdition, emptyInventory, isPlanOutcomeAvailable, withPlatformEdition, type PlatformEdition, getHclSchedulePath, refreshDerivedDocument, summarizeVcfCompatibility, type Capability, type EngagementDocument, type HardwarePlatformAssessment } from "@shared/fcp";
import { HCL_CATALOG_RELEASES, HCL_ESTATE_LIMITATION, HCL_EVALUATION_VERSION, HCL_OFFLINE_LIMITATION, hclFindingSeverityLabel, hclStatusLabel, summarizeHclFindings, type HclFinding } from "@shared/hcl";
import { Download, ExternalLink, FileSpreadsheet, HardDrive, Loader2, MonitorCog, RotateCcw, Server, ShieldCheck, Upload } from "lucide-react";
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
  // A BSAS-only deal plans on the BSAS term.
  "fundingSource",
  "bsasHours",
  "bsasStart",
  "bsasEnd",
  "plannedProjectStart",
  "plannedImplementationStart",
  "targetStart",
  "targetComplete",
  "adoptionCadence",
  "hardwareAvailability",
  "hardwareLeadWeeks",
  "priorities",
  "timelineNotes",
  "adoptionDetails",
  "compatibilityTargetRelease",
  // The segment decides whether a VVF edition choice applies.
  "customerSegment",
]);

type Props = {
  document: EngagementDocument;
  onChange: (document: EngagementDocument) => void;
  onExportPlanOutput: (format: "html" | "pdf") => void;
  exportingPlanOutput: "html" | "pdf" | null;
  /** "customer", "timeline" and "review" are the combined steps of the six-step page; the rest are single sections of the FCP workspace. */
  step?: "upload" | "customer" | "timeline" | "review" | "customer-details" | "funding" | "schedule" | "scope" | "target-release" | "notes";
};

export function PlanSetup({ document, onChange, onExportPlanOutput, exportingPlanOutput, step }: Props) {
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

  // Field groups, so the FCP workspace can place each in its own section; the combined steps render them in the original order.
  const customerFields = <>
            <Field label="Customer name" required><Input value={fields.customerName} onChange={event => updateFields({ customerName: event.target.value })} placeholder="Customer organization" /></Field>
            <Field label="CDW account / customer ID"><Input value={fields.accountId} onChange={event => updateFields({ accountId: event.target.value })} placeholder="Optional internal identifier" /></Field>
            <Field label="Primary location"><Input value={fields.location} onChange={event => updateFields({ location: event.target.value })} placeholder="City, state or region" /></Field>
            <Field label="Primary customer contact"><Input value={fields.primaryContact} onChange={event => updateFields({ primaryContact: event.target.value })} placeholder="Name or role" /></Field>
            <Field label="Customer segment" required hint="Commercial customers also get the Broadcom Building Blocks workbook in the delivery package."><Select value={fields.customerSegment} onValueChange={value => updateFields({ customerSegment: value as typeof fields.customerSegment })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unspecified">Not yet confirmed</SelectItem><SelectItem value="commercial">Commercial</SelectItem><SelectItem value="corporate">Corporate</SelectItem></SelectContent></Select></Field>
            {fields.customerSegment === "commercial" && <Field label="Platform edition" required hint={effectivePlatformEdition(fields) === "vvf" ? "VVF includes vCenter, VCF Operations, VKS, and vSAN. NSX, vDefend, VCF Automation, HCX, and Private AI need VCF and are left out of the plan." : "VCF includes NSX, VCF Automation, HCX, and Private AI Services. Choose VVF for a vSphere Foundation plan."}><Select value={fields.adoptionDetails.platformEdition} onValueChange={value => updateFields({ adoptionDetails: withPlatformEdition(fields.adoptionDetails, value as PlatformEdition) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="vcf">VMware Cloud Foundation (VCF)</SelectItem><SelectItem value="vvf">VMware vSphere Foundation (VVF)</SelectItem></SelectContent></Select></Field>}
  </>;
  const fundingFields = <>
            <Field label="Funding" required hint="Entitlement + BSAS: Broadcom Software Adoption Services fund follow-on work after the entitlement. BSAS only: the plan runs on BSAS hours and the BSAS term. BSAS is entered as hours and dates only, never its amount or rates."><Select value={fields.fundingSource} onValueChange={value => updateFields({ fundingSource: value as typeof fields.fundingSource })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="entitlement">Entitlement only</SelectItem><SelectItem value="entitlement-bsas">Entitlement + BSAS</SelectItem><SelectItem value="bsas">BSAS only</SelectItem></SelectContent></Select></Field>
            {fields.fundingSource !== "bsas" && <>
              <Field label="Entitlement amount (USD)" required hint="Total customer entitlement funds available for this term."><Input type="number" min={0} step="1000" value={fields.entitlementAmount || ""} onChange={event => updateFields({ entitlementAmount: Math.max(0, Number(event.target.value) || 0) })} placeholder="0" /></Field>
              <Field label="Reserve held back (%)" hint="Share of the entitlement kept out of the plan. Defaults to 8%; set 0 to remove it once the PO gives the exact figure. The plan never exceeds what is left; work that does not fit moves to the Two-Year Notional as follow-on."><Input type="number" min={0} max={50} step="1" value={fields.estimateInputs.reservePercent ?? ""} onChange={event => { const raw = event.target.value; const { reservePercent: _previous, ...rest } = fields.estimateInputs; updateFields({ estimateInputs: raw === "" ? rest : { ...rest, reservePercent: Math.min(50, Math.max(0, Number(raw) || 0)) } }); }} placeholder="8" /></Field>
              <Field label="Entitlement starts" required><Input type="date" value={fields.entitlementStart} onChange={event => updateFields({ entitlementStart: event.target.value })} /></Field>
              <Field label="Entitlement ends" required hint="Calculated as twelve calendar months after the entitlement start date."><Input type="date" value={calculateEntitlementEndDate(fields.entitlementStart) || fields.entitlementEnd} readOnly aria-readonly="true" className="bg-slate-50 text-slate-600" /></Field>
            </>}
            {fields.fundingSource !== "entitlement" && <>
              <Field label="BSAS hours" required hint="Hours from the BSAS quote. Never enter the BSAS amount or rates."><Input type="number" min={0} step="10" value={fields.bsasHours || ""} onChange={event => updateFields({ bsasHours: Math.min(100_000, Math.max(0, Number(event.target.value) || 0)) })} placeholder="0" /></Field>
              {fields.fundingSource === "bsas" && <Field label="Reserve held back (%)" hint="Share of the BSAS hours kept out of the plan. Defaults to 8%; set 0 to remove it. The plan never exceeds what is left; work that does not fit moves to the Two-Year Notional as follow-on."><Input type="number" min={0} max={50} step="1" value={fields.estimateInputs.reservePercent ?? ""} onChange={event => { const raw = event.target.value; const { reservePercent: _previous, ...rest } = fields.estimateInputs; updateFields({ estimateInputs: raw === "" ? rest : { ...rest, reservePercent: Math.min(50, Math.max(0, Number(raw) || 0)) } }); }} placeholder="8" /></Field>}
              <Field label="BSAS term starts" required={fields.fundingSource === "bsas"} hint={fields.fundingSource === "bsas" ? undefined : "Leave blank for the day after the entitlement ends."}><Input type="date" value={fields.bsasStart} onChange={event => updateFields({ bsasStart: event.target.value })} /></Field>
              <Field label="BSAS term ends" hint="Leave blank for twelve months after the BSAS start. BSAS hours not used by this date are forfeited."><Input type="date" value={fields.bsasEnd} onChange={event => updateFields({ bsasEnd: event.target.value })} /></Field>
            </>}
  </>;
  const releaseField = <>
            <Field label="Compatibility target release" required hint="The maintained catalog is evaluated against this release. Current ESXi versions remain derived from RVTools evidence."><Select value={fields.compatibilityTargetRelease} onValueChange={value => updateFields({ compatibilityTargetRelease: value as typeof fields.compatibilityTargetRelease })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{HCL_CATALOG_RELEASES.map(release => <SelectItem key={release} value={release}>{release}</SelectItem>)}</SelectContent></Select></Field>
  </>;
  const scheduleFields = <>
              <Field label="Planned project start" required hint="When design, mobilization, and delivery-baseline work begins. This is independent of the entitlement period."><Input type="date" value={fields.plannedProjectStart || fields.targetStart} onChange={event => updateFields({ plannedProjectStart: event.target.value })} /></Field>
              <Field label="Implementation services start" required hint="When management-domain build, upgrade, migration, and other implementation services are expected to begin. Use a later date when the customer is starting with design now."><Input type="date" min={fields.plannedProjectStart || fields.targetStart} value={fields.plannedImplementationStart || fields.plannedProjectStart || fields.targetStart} onChange={event => updateFields({ plannedImplementationStart: event.target.value })} /></Field>
              <Field label="Planned project completion" required><Input type="date" value={fields.targetComplete} onChange={event => updateFields({ targetComplete: event.target.value })} /></Field>
              <Field label="Execution schedule cadence" hint="Design starts at the planned project start; implementation activities begin at the implementation-services start. Monthly is best for a high-level plan."><Select value={fields.adoptionCadence} onValueChange={value => updateFields({ adoptionCadence: value as typeof fields.adoptionCadence })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="month">Calendar months</SelectItem><SelectItem value="week">Weekly windows</SelectItem></SelectContent></Select></Field>
  </>;
  const hardwareFields = <>
              <Field label="Hardware availability"><Select value={fields.hardwareAvailability} onValueChange={value => updateFields({ hardwareAvailability: value as typeof fields.hardwareAvailability })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="existing">Existing / available</SelectItem><SelectItem value="new">New procurement required</SelectItem><SelectItem value="unknown">Not yet known</SelectItem></SelectContent></Select></Field>
              {fields.hardwareAvailability === "new" && <Field label="Estimated lead time (weeks)"><Input type="number" min={0} max={104} value={fields.hardwareLeadWeeks || ""} onChange={event => updateFields({ hardwareLeadWeeks: Math.min(104, Math.max(0, Number(event.target.value) || 0)) })} /></Field>}
  </>;
  const deliveryStartNote = <>
            {fields.plannedProjectStart && fields.plannedImplementationStart && fields.plannedImplementationStart > fields.plannedProjectStart ? <div className="mt-5 rounded-lg border border-s200 bg-s50/70 px-4 py-3 text-sm leading-6 text-s600"><strong>Design-first plan:</strong> design and delivery-baseline work begins on {fields.plannedProjectStart}; implementation, upgrade, and migration services are held for {fields.plannedImplementationStart}. The generated Entitlement Notional will show that preparation gap rather than implying services start immediately.</div> : <div className="mt-5 rounded-lg border border-s100 bg-s50 px-4 py-3 text-sm leading-6 text-s600"><strong>Immediate implementation plan:</strong> design, mobilization, and implementation services currently share the planned project start. Move the implementation-services start later when the customer is not ready for build or migration work.</div>}
  </>;
  const outcomePicker = <>
            <div className="mt-7"><Label className="text-sm font-semibold">Which VCF outcomes should the plan prioritize?</Label><div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{capabilities.map(capability => { const checked = fields.priorities.includes(capability.value); const available = isPlanOutcomeAvailable(`${capability.value}:core`, effectivePlatformEdition(fields)); return <label key={capability.value} className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${available ? "cursor-pointer" : "cursor-not-allowed opacity-60"} ${checked && available ? "border-s600 bg-s600 text-white" : "border-s100 hover:bg-s50"}`}><Checkbox checked={checked} disabled={!available && !checked} className="mt-0.5" onCheckedChange={next => updateFields({ priorities: next ? [...fields.priorities, capability.value] : fields.priorities.filter(item => item !== capability.value) })} /><span><strong className="block text-sm">{capability.label}</strong><span className={`mt-1 block text-xs leading-5 ${checked && available ? "text-s200" : "text-s400"}`}>{available ? capability.description : "Requires VCF; not included with VVF."}</span></span></label>; })}</div></div>
  </>;
  const timelineNotesField = <>
            <Field label="Delivery Assumptions and Calendar Constraints" hint="Capture only material assumptions, fixed dates, customer responsibilities, blackout windows, or sequencing constraints."><Textarea className="mt-2 min-h-28" value={fields.timelineNotes} onChange={event => updateFields({ timelineNotes: event.target.value })} placeholder="Example: customer supplies DNS and IP allocations; production freeze in December; datacenter exit must finish by Q3." /></Field>
  </>;

  return (
    <div className="space-y-5">
      <Tabs value={step} defaultValue="upload" className="space-y-5">
        {!step && <TabsList className="grid h-auto w-full grid-cols-2 rounded-lg bg-surface p-1 shadow-sm lg:grid-cols-4">
          <TabsTrigger value="upload" className="rounded-lg py-2.5"><span className="mr-2 text-[11px] font-semibold text-cdw-red">01</span> Upload</TabsTrigger>
          <TabsTrigger value="customer" className="rounded-lg py-2.5"><span className="mr-2 text-[11px] font-semibold text-cdw-red">02</span> Customer</TabsTrigger>
          <TabsTrigger value="timeline" className="rounded-lg py-2.5"><span className="mr-2 text-[11px] font-semibold text-cdw-red">03</span> Adoption</TabsTrigger>
          <TabsTrigger value="review" className="rounded-lg py-2.5"><span className="mr-2 text-[11px] font-semibold text-cdw-red">04</span> Plan Output</TabsTrigger>
        </TabsList>}

        <TabsContent value="upload" className="space-y-5">
          <section className="rounded-lg border border-s100 bg-surface p-5 shadow-sm md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Current estate</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Drop in RVTools exports</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-s500">Select one or more XLSX exports together. Duplicate VMs, hosts, and datastores are reconciled using stable IDs when available.</p></div>{document.inventorySources.length > 0 && <Button variant="outline" size="sm" onClick={resetInventory}><RotateCcw className="size-4" /> Clear inventory</Button>}</div>
            <button type="button" className="mt-6 grid min-h-52 w-full place-items-center rounded-lg border-2 border-dashed border-s200 bg-s50 px-6 text-center transition-colors hover:border-cdw-red hover:bg-state-blocked/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cdw-red" onClick={() => inputRef.current?.click()} disabled={importing}>
              <span><span className="mx-auto grid size-14 place-items-center rounded-lg bg-s600 text-white">{importing ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}</span><strong className="mt-4 block text-base text-ink">{importing ? "Reading inventory…" : "Choose RVTools XLSX or CSV files"}</strong><span className="mt-1 block text-sm text-s400">Up to 20 files · 30 MB each · parsed only in this browser</span></span>
            </button>
            <input ref={inputRef} type="file" className="hidden" accept=".xlsx,.csv" multiple onChange={event => void importFiles(Array.from(event.target.files || []))} />
            {document.inventorySources.length > 0 && <div className="mt-5 grid gap-3 md:grid-cols-2">{document.inventorySources.map(source => <article key={source.id} className="rounded-lg border border-s100 p-4"><div className="flex items-start gap-3"><FileSpreadsheet className="mt-0.5 size-5 text-state-pass-text" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{source.filename}</p><p className="mt-1 text-xs text-s400">{(source.byteSize / 1024 / 1024).toFixed(1)} MB · {source.sheets.length} sheets</p>{source.warnings.map(warning => <p key={warning} className="mt-2 text-xs leading-5 text-state-warn-text">{warning}</p>)}</div></div></article>)}</div>}
          </section>
          <InventoryCards document={document} />
        </TabsContent>

        <TabsContent value="customer">
          <section className="rounded-lg border border-s100 bg-surface p-5 shadow-sm md:p-7"><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Minimum input</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Customer and funding</h2><p className="mt-2 text-sm text-s500">Only information that cannot be observed in RVTools is requested.</p><div className="mt-6 grid gap-5 md:grid-cols-2">
            {customerFields}
            {fundingFields}
            {releaseField}
          </div></section>
        </TabsContent>

        <TabsContent value="timeline">
          <section className="rounded-lg border border-s100 bg-surface p-5 shadow-sm md:p-7">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Adoption window</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Delivery Scope, Timing, and Outcomes</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-s500">Set the planned project start for design and mobilization, then set the implementation-services start for the month when platform build, upgrade, and migration work is expected to begin. For example, a customer can start design now and target March for implementation. Changing these dates or other confirmed inputs immediately refreshes the deterministic operational plan. The separate Notional remains monthly and runs from the planned project start through the calculated entitlement end.</p>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {scheduleFields}
              {hardwareFields}
            </div>
            {deliveryStartNote}
            {outcomePicker}
            <DetailedAdoptionIntake fields={fields} onPatch={updateFields} />
            {timelineNotesField}
          </section>
        </TabsContent>

        <TabsContent value="customer-details">
          <section className="rounded-lg border border-s100 bg-surface p-5 shadow-sm md:p-7"><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Who</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Customer</h2><div className="mt-6 grid gap-5 md:grid-cols-2">{customerFields}</div></section>
        </TabsContent>

        <TabsContent value="funding">
          <section className="rounded-lg border border-s100 bg-surface p-5 shadow-sm md:p-7"><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Funding</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Entitlement and BSAS</h2><div className="mt-6 grid gap-5 md:grid-cols-2">{fundingFields}</div></section>
        </TabsContent>

        <TabsContent value="schedule">
          <section className="rounded-lg border border-s100 bg-surface p-5 shadow-sm md:p-7"><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">When</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Schedule</h2><div className="mt-6 grid gap-5 md:grid-cols-2">{scheduleFields}</div>{deliveryStartNote}</section>
        </TabsContent>

        <TabsContent value="scope">
          <section className="rounded-lg border border-s100 bg-surface p-5 shadow-sm md:p-7"><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Scope</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Outcomes and delivery scope</h2><div className="mt-6 grid gap-5 md:grid-cols-2">{hardwareFields}</div>{outcomePicker}<DetailedAdoptionIntake fields={fields} onPatch={updateFields} /></section>
        </TabsContent>

        <TabsContent value="target-release">
          <section className="rounded-lg border border-s100 bg-surface p-5 shadow-sm md:p-7"><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Compatibility</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Target release</h2><div className="mt-6 grid gap-5 md:grid-cols-2">{releaseField}</div></section>
        </TabsContent>

        <TabsContent value="notes">
          <section className="rounded-lg border border-s100 bg-surface p-5 shadow-sm md:p-7">{timelineNotesField}</section>
        </TabsContent>

        <TabsContent value="review" className="space-y-5">
          {!step && <PlanOutputExportPanel onExport={onExportPlanOutput} exportingFormat={exportingPlanOutput} />}
          <InventoryCards document={document} />
          <section className="rounded-lg border border-s100 bg-surface p-5 shadow-sm md:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Current estate</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Compatibility delivery handoff</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-s500">Every imported host is reconciled to a release-specific catalog decision, evidence gap, and delivery action.</p></div><Chip>Maintained catalog</Chip></div><CompatibilityHandoffPanel platforms={document.readiness.hardwarePlatforms} estateHosts={document.inventory.hosts} /></section>
          <HclEstateFindings document={document} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}{required && <span className="ml-1 text-cdw-red">*</span>}</Label>{children}{hint && <p className="text-xs leading-5 text-s400">{hint}</p>}</div>;
}

function InventoryCards({ document }: { document: EngagementDocument }) {
  const inventory = document.inventory;
  const cards = [
    { label: "Virtual machines", value: inventory.vmCount, detail: `${inventory.poweredOnVms} powered on`, icon: MonitorCog },
    { label: "ESXi hosts", value: inventory.hosts, detail: inventory.esxiVersions.length ? `${inventory.esxiVersions.length} reported ESXi release${inventory.esxiVersions.length === 1 ? "" : "s"}` : "ESXi release not reported", icon: Server },
    { label: "Clusters", value: inventory.clusters, detail: `${inventory.datacenters} datacenters`, icon: HardDrive },
    { label: "Datastore capacity", value: inventory.datastoreCapacityTiB ? `${inventory.datastoreCapacityTiB} TiB` : 0, detail: `${inventory.datastoreUsedTiB} TiB used`, icon: ShieldCheck },
  ];
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(card => <article key={card.label} className="rounded-lg border border-s100 bg-surface p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-wide text-s400">{card.label}</p><card.icon className="size-4 text-s300" /></div><strong className="mt-3 block text-3xl tracking-tight text-ink">{card.value || "—"}</strong><p className="mt-1 text-xs text-s400">{card.detail}</p></article>)}</div>;
}

function PlanOutputExportPanel({ onExport, exportingFormat }: { onExport: (format: "html" | "pdf") => void; exportingFormat: "html" | "pdf" | null }) {
  return <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-cdw-red/20 bg-state-blocked/60 p-5 shadow-sm"><div><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Separate technical handoff</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">VCF compatibility delivery handoff</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-s500">Download the complete maintained-catalog evidence pack with estate reconciliation, release matrices, server models, confidence, evidence gaps, and owned delivery actions. It contains no adoption timeline and remains separate from the concise FCP report.</p></div><div className="flex gap-2"><Button variant="outline" size="sm" disabled={Boolean(exportingFormat)} onClick={() => onExport("html")}>{exportingFormat === "html" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} HTML</Button><Button size="sm" className="bg-cdw-red hover:bg-cdw-red-deep" disabled={Boolean(exportingFormat)} onClick={() => onExport("pdf")}>{exportingFormat === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} PDF</Button></div></section>;
}

function HostInventory({ platforms }: { platforms: HardwarePlatformAssessment[] }) {
  const cohorts = summarizeVcfCompatibility(platforms);
  const countHosts = (decision: "eligible" | "validation-required" | "action-required") => cohorts.filter(cohort => cohort.decision === decision).reduce((total, cohort) => total + cohort.hosts, 0);
  const schedulePath = !cohorts.length ? { label: "Unresolved", detail: "Collect vHost identity and HCL evidence before the platform path is released.", className: "border-s100 bg-s100 text-ink" } : countHosts("action-required") ? { label: "Red", detail: "One or more host models require remediation, an alternate path, or a procurement decision before platform build.", className: "border-state-blocked/30 bg-state-blocked-soft text-state-blocked-text" } : countHosts("validation-required") ? { label: "Yellow", detail: "One or more host models need validation before platform build. Delivery preparation can continue where the plan allows.", className: "border-state-warn/30 bg-state-warn-soft text-state-warn-text" } : { label: "Green", detail: "All observed server and CPU models have a pairing in the supplied offline ESXi 9.1 snapshot. Continue with configuration validation.", className: "border-state-pass/30 bg-state-pass-soft text-state-pass-text" };
  const snapshotCapturedAt = platforms[0]?.hcl.snapshotCapturedAt || "not reported";

  return <section className="mt-6 rounded-lg border border-s100 bg-s50/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Host inventory and compatibility evidence</p><h3 className="mt-1 text-base font-semibold text-ink">VCF 9.1 host-model summary</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-s500">Server models are summarized by observed server-and-CPU pairing so delivery decisions can be made without scanning every imported server row. Results are planning evidence, not a configuration certification.</p></div><a href="https://compatibilityguide.broadcom.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-s200 bg-surface px-3 py-2 text-xs font-semibold text-s600 transition-colors hover:bg-s100">Open configuration reference <ExternalLink className="size-3.5" /></a></div><div className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 ${schedulePath.className}`}><div><p className="text-[11px] font-medium uppercase tracking-wide">{HCL_EVALUATION_VERSION} delivery path</p><p className="mt-0.5 text-sm font-semibold">{schedulePath.label} path</p></div><p className="max-w-2xl text-xs leading-5">{schedulePath.detail}</p></div>{cohorts.length ? <><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><div className="rounded-lg border border-state-pass/30 bg-state-pass-soft px-3 py-2"><p className="text-[11px] font-medium uppercase tracking-wide text-state-pass-text">Eligible for next-stage validation</p><p className="mt-1 text-lg font-semibold text-state-pass-text">{countHosts("eligible")} host{countHosts("eligible") === 1 ? "" : "s"}</p></div><div className="rounded-lg border border-state-warn/30 bg-state-warn-soft px-3 py-2"><p className="text-[11px] font-medium uppercase tracking-wide text-state-warn-text">Validate before platform build</p><p className="mt-1 text-lg font-semibold text-state-warn-text">{countHosts("validation-required")} host{countHosts("validation-required") === 1 ? "" : "s"}</p></div><div className="rounded-lg border border-state-blocked/30 bg-state-blocked-soft px-3 py-2"><p className="text-[11px] font-medium uppercase tracking-wide text-state-blocked-text">Action required before build</p><p className="mt-1 text-lg font-semibold text-state-blocked-text">{countHosts("action-required")} host{countHosts("action-required") === 1 ? "" : "s"}</p></div></div><div className="mt-4 space-y-2">{cohorts.slice(0, 6).map(cohort => <article key={cohort.id} className="rounded-lg border border-s100 bg-surface px-3 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Pill verdict={DECISION_VERDICT[cohort.decision]}>{cohort.decisionLabel}</Pill><span className="text-xs text-s400">{cohort.hosts} host{cohort.hosts === 1 ? "" : "s"}</span></div><p className="mt-2 text-sm font-semibold text-ink">{cohort.vendor} {cohort.model}</p><p className="mt-1 text-xs text-s500">{cohort.cpuModel}</p><p className="mt-2 text-xs leading-5 text-s600">{cohort.reason}</p></div><p className="max-w-xs text-xs font-medium leading-5 text-s600">{cohort.nextAction}</p></div></article>)}</div>{cohorts.length > 6 && <p className="mt-3 text-xs text-s400">Showing the six largest or highest-action server models. The full evidence remains available below.</p>}<p className="mt-3 rounded-lg border border-s100 bg-surface px-3 py-2 text-[11px] leading-5 text-s400">Offline snapshot captured {snapshotCapturedAt}. {HCL_OFFLINE_LIMITATION}</p><details className="mt-4 rounded-lg border border-s100 bg-surface p-3"><summary className="cursor-pointer text-sm font-semibold text-ink">View full host-model evidence ({cohorts.length} pairing{cohorts.length === 1 ? "" : "s"})</summary><div className="mt-3 overflow-x-auto"><table className="tbl min-w-[960px] w-full"><thead className="text-[11px]"><tr><th className="px-3 py-2.5">Decision</th><th className="px-3 py-2.5">Observed platform / CPU</th><th className="px-3 py-2.5">Hosts</th><th className="px-3 py-2.5">Why</th><th className="px-3 py-2.5">Next step</th></tr></thead><tbody>{cohorts.map(cohort => <tr key={cohort.id} className="border-t border-s100 align-top"><td className="px-3 py-3"><Pill verdict={DECISION_VERDICT[cohort.decision]}>{cohort.decisionLabel}</Pill></td><td className="px-3 py-3"><p className="font-semibold text-ink">{cohort.vendor} {cohort.model}</p><p className="mt-1 text-s400">{cohort.cpuModel}</p></td><td className="px-3 py-3 text-s600">{cohort.hosts}</td><td className="px-3 py-3 leading-5 text-s600">{cohort.reason}{cohort.matchedModel && <><br /><span className="text-s400">Snapshot model: {cohort.matchedModel}{cohort.matchedCpuSeries ? ` · ${cohort.matchedCpuSeries}` : ""}</span></>}</td><td className="px-3 py-3 leading-5 font-medium text-s600">{cohort.nextAction}</td></tr>)}</tbody></table></div></details></> : <p className="mt-4 rounded-lg border border-dashed border-s200 bg-surface px-3 py-4 text-xs leading-5 text-s400">No usable host vendor and model data were found in the imported RVTools data.</p>}</section>;
}


function HclEstateFindings({ document }: { document: EngagementDocument }) {
  const assessment = document.readiness.hcl;
  const findings = assessment.findings;
  const blockers = findings.filter(finding => finding.severity === "BLOCKER");
  const warnings = findings.filter(finding => finding.severity === "WARNING");
  const advisories = findings.filter(finding => finding.severity === "ADVISORY");
  const findingSummaries = summarizeHclFindings(findings);
  const prioritySummaries = findingSummaries.filter(summary => summary.severity !== "INFO");
  const informationalSummaries = findingSummaries.filter(summary => summary.severity === "INFO");
  const path = document.readiness.hclSchedulePath || getHclSchedulePath(document.inventory);
  const pathStyle = {
    red: { label: "Red path", detail: "A release-blocking HCL finding needs a procurement, migration, or design decision before platform build.", className: "border-state-blocked/30 bg-state-blocked-soft text-state-blocked-text" },
    yellow: { label: "Yellow path", detail: "HCL remediation or verification work needs to be sequenced before platform build.", className: "border-state-warn/30 bg-state-warn-soft text-state-warn-text" },
    green: { label: "Green path", detail: "No blocker or warning was identified in the imported RVTools-observable evidence; explicit coverage gaps still remain.", className: "border-state-pass/30 bg-state-pass-soft text-state-pass-text" },
    unresolved: { label: "Unresolved", detail: "Import RVTools evidence to establish an estate-level HCL path.", className: "border-s100 bg-s100 text-ink" },
  }[path];
  const findingStyle = (severity: HclFinding["severity"]) => ({
    BLOCKER: "border-state-blocked/30 bg-state-blocked-soft text-state-blocked-text",
    WARNING: "border-state-warn/30 bg-state-warn-soft text-state-warn-text",
    ADVISORY: "border-s200 bg-s50 text-s600",
    INFO: "border-s100 bg-s100 text-s600",
  })[severity];

  return <section className="rounded-lg border border-s100 bg-surface p-5 shadow-sm md:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Estate scope</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">HCL 2.0 evidence and findings</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-s500">The HCL 2.0 precheck evaluates every available RVTools-observable evidence family and records the specific fields that could not be established from the import or supplied offline archive.</p>
      </div>
      <div className={`rounded-lg border px-4 py-3 ${pathStyle.className}`}>
        <p className="text-[11px] font-medium uppercase tracking-wide">Estate delivery path</p>
        <p className="mt-1 text-base font-semibold">{pathStyle.label}</p>
      </div>
    </div>

    <p className={`mt-4 rounded-lg border px-4 py-3 text-sm leading-6 ${pathStyle.className}`}>{pathStyle.detail}</p>

    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: "Blocker types", value: findingSummaries.filter(summary => summary.severity === "BLOCKER").length, className: "border-state-blocked/30 bg-state-blocked-soft text-state-blocked-text" },
        { label: "Warning types", value: findingSummaries.filter(summary => summary.severity === "WARNING").length, className: "border-state-warn/30 bg-state-warn-soft text-state-warn-text" },
        { label: "Advisory types", value: findingSummaries.filter(summary => summary.severity === "ADVISORY").length, className: "border-s200 bg-s50 text-s600" },
        { label: "Coverage gaps", value: assessment.coverageGaps.length, className: "border-s100 bg-s50 text-ink" },
      ].map(metric => <article key={metric.label} className={`rounded-lg border px-4 py-3 ${metric.className}`}><p className="text-[11px] font-medium uppercase tracking-wide">{metric.label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{metric.value}</p></article>)}
    </div>

    {findings.length ? <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-ink">Consolidated findings</h3><p className="mt-1 text-xs text-s400">{findingSummaries.length} distinct check type{findingSummaries.length === 1 ? "" : "s"} summarized from {findings.length} raw evidence entr{findings.length === 1 ? "y" : "ies"}.</p></div><span className="rounded-md border border-s100 bg-s50 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-s400">No per-host list by default</span></div>
      {prioritySummaries.map(summary => <article key={summary.id} className="rounded-lg border border-s100 bg-s50/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${findingStyle(summary.severity)}`}>{hclFindingSeverityLabel(summary.severity)}</span><span className="font-mono text-[11px] font-semibold text-s400">{summary.checkId}</span><span className="text-xs text-s400">{summary.affectedCount} affected {summary.scope === "host" ? "host" : summary.scope}{summary.affectedCount === 1 ? "" : "s"}</span></div><h4 className="mt-2 text-sm font-semibold text-ink">{summary.title}</h4><p className="mt-1 text-xs font-medium text-s500">{summary.subjects.slice(0, 4).join(" · ")}{summary.subjects.length > 4 ? ` · +${summary.subjects.length - 4} more` : ""}{summary.clusters.length ? ` · ${summary.clusters.length} cluster${summary.clusters.length === 1 ? "" : "s"}` : ""}</p></div><span className="rounded-md border border-s100 bg-surface px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-s400">{summary.scope}</span></div>
        <div className="mt-3 rounded-lg border border-s100 bg-surface p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-s400">Shared required action</p><p className="mt-1 text-xs leading-5 font-medium text-ink">{summary.remediation}</p></div>
        <details className="mt-3 rounded-lg border border-s100 bg-surface p-3"><summary className="cursor-pointer text-xs font-semibold text-s600">View {summary.findings.length} underlying evidence entr{summary.findings.length === 1 ? "y" : "ies"}</summary><div className="mt-3 space-y-2">{summary.findings.map(finding => <div key={`${finding.subject}-${finding.evidence}`} className="rounded-md border border-s100 bg-s50 p-2"><p className="text-xs font-semibold text-ink">{finding.subject}{finding.cluster ? ` · ${finding.cluster}` : ""}</p><p className="mt-1 text-xs leading-5 text-s500">{finding.evidence}</p>{finding.source && <p className="mt-1 text-[11px] text-s400">Source: {finding.source}</p>}</div>)}</div></details>
      </article>)}
      {informationalSummaries.length > 0 && <details className="rounded-lg border border-s100 bg-surface p-4"><summary className="cursor-pointer text-sm font-semibold text-ink">Informational findings ({informationalSummaries.length} check type{informationalSummaries.length === 1 ? "" : "s"})</summary><div className="mt-3 space-y-2">{informationalSummaries.map(summary => <article key={summary.id} className="rounded-lg border border-s100 bg-s50 p-3"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${findingStyle(summary.severity)}`}>{hclFindingSeverityLabel(summary.severity)}</span><span className="font-mono text-[11px] font-semibold text-s400">{summary.checkId}</span><span className="text-xs text-s400">{summary.affectedCount} affected {summary.scope}{summary.affectedCount === 1 ? "" : "s"}</span></div><p className="mt-2 text-sm font-semibold text-ink">{summary.title}</p><p className="mt-1 text-xs leading-5 text-s600">{summary.remediation}</p></article>)}</div></details>}
    </div> : <div className="mt-5 rounded-lg border border-dashed border-s200 bg-s50 px-4 py-5 text-sm leading-6 text-s500">No detailed estate rows are available yet. Upload the applicable RVTools tabs to evaluate the supported HCL 2.0 check families.</div>}

    <details className="mt-5 rounded-lg border border-s100 bg-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold text-ink">Coverage gaps and evidence still required ({assessment.coverageGaps.length})</summary>
      <p className="mt-2 max-w-4xl text-xs leading-5 text-s500">A coverage gap is not a passing result. It identifies a check family that was unavailable, empty, absent from the supplied offline archive, or cannot be established with RVTools data.</p>
      {assessment.coverageGaps.length ? <div className="mt-3 grid gap-2 lg:grid-cols-2">{assessment.coverageGaps.map(gap => <article key={`${gap.kind}-${gap.subject}`} className="rounded-lg border border-s100 bg-s50 p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-s400">{gap.kind.replace(/-/g, " ")}</p><p className="mt-1 text-xs font-semibold text-ink">{gap.subject}</p><p className="mt-1 text-xs leading-5 text-s500">{gap.impact}</p></article>)}</div> : <p className="mt-3 text-xs text-state-pass-text">No coverage gaps were recorded from the supplied estate evidence.</p>}
    </details>

    <p className="mt-4 rounded-lg border border-s100 bg-s50 px-4 py-3 text-[11px] leading-5 text-s500">{HCL_ESTATE_LIMITATION}</p>
  </section>;
}
