import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EmptyState as DesignEmptyState, HeroBand, HeroKpi, KpiCard, Pill, SectionBar } from "@/components/vsa/elements";
import { type ExportDocumentType } from "@shared/exportFilename";
import { fundedFields, DELIVERY_ROLE_BY_WORKSTREAM, summarizeDeliveryStaffing, type EngagementDocument } from "@shared/fcp";
import { estateSizeFlag } from "@shared/estateSize";
import { internalOpenItems, termEndAssumed } from "@shared/reportView";
import { ArrowRight, Download, FileCheck2, FileText, Loader2, PackageCheck, Plus, Rows3 } from "lucide-react";
import { Link } from "wouter";

/** Presentational parts of the FCP workspace, shared by the workspace page and the retired six-step page (Home). */

export type ExportFormat = "html" | "pdf" | "xlsx";
export type ActiveExport = { format: ExportFormat; documentType: ExportDocumentType } | null;

export function formatCurrency(value: number) {
  // CDW written style: money carries double zeros.
  return value ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value) : "Not entered";
}

export function formatDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

export function EngagementCommandBar({ document, title, onOpenPackage }: { document: EngagementDocument; title: string; onOpenPackage: () => void }) {
  const f = document.fields;
  const manual = document.planAuthority === "manual";
  return (
    <HeroBand eyebrow={`Broadcom services entitlement work plan · ${manual ? "Manual plan in force" : "Generated plan"}`} head={title} lead="Build the customer work plan, align resource demand to the adoption schedule, close technical readiness items, and issue one delivery-ready package.">
      {f.fundingSource === "bsas"
        ? <><HeroKpi label="BSAS hours" value={f.bsasHours ? `${f.bsasHours.toLocaleString("en-US")} hrs` : "—"} sub="BSAS only · entered on the Engagement step" compact /><HeroKpi label="BSAS term" value={`${formatDate(fundedFields(f).entitlementStart)} – ${formatDate(fundedFields(f).entitlementEnd)}`} sub="End defaults to twelve months" compact /></>
        : <><HeroKpi label="Entitlement value" value={formatCurrency(f.entitlementAmount)} sub={f.fundingSource === "entitlement-bsas" ? `Plus ${f.bsasHours ? f.bsasHours.toLocaleString("en-US") : "—"} BSAS hours after the entitlement` : "Entered on the Engagement step"} compact /><HeroKpi label="Entitlement term" value={`${formatDate(f.entitlementStart)} – ${formatDate(f.entitlementEnd)}`} sub="Start entered; end follows the term" compact /></>}
      <HeroKpi label="Design starts" value={formatDate(f.plannedProjectStart || f.targetStart)} sub="Planned project start" compact />
      <HeroKpi label="Implementation starts" value={formatDate(f.plannedImplementationStart || f.plannedProjectStart)} sub="Falls back to the project start" compact />
      <div className="flex flex-col justify-between gap-3 sm:col-span-2 xl:col-span-4 xl:flex-row xl:items-center">
        <p className="text-xs text-ink-muted">Target platform: <strong className="font-medium text-ink">{f.compatibilityTargetRelease}</strong></p>
        <Button variant="outline" size="sm" onClick={onOpenPackage} className="self-start"><PackageCheck className="size-4" /> Open delivery package</Button>
      </div>
    </HeroBand>
  );
}

export function StageAdvance({ label, onClick }: { label: string; onClick: () => void }) {
  return <div className="flex justify-end border-t border-s100 pt-4"><Button onClick={onClick}>{label}<ArrowRight className="size-4" /></Button></div>;
}

export function ScopeAtGlance({ document }: { document: EngagementDocument }) {
  const activities = document.adoptionTimeline.lanes.flatMap(lane => lane.bars);
  const selectedOutcomes = document.fields.priorities.map(priority => ({ operations: "Operations", automation: "Automation & Self-Service", networking: "VCF Networking & NSX", security: "Security", resilience: "Resilience", kubernetes: "Kubernetes", "private-ai": "Private AI" })[priority]);
  return (
    <section className="kpi-grid">
      <KpiCard label="SOW-level work plan" value={activities.length} sub="Generated work packages before manual refinement" />
      <KpiCard label="Selected outcomes" value={<span className="text-sm font-semibold leading-6 tracking-normal">{selectedOutcomes.length ? selectedOutcomes.join(" · ") : "None yet"}</span>} sub={selectedOutcomes.length ? "From the customer priorities" : "Select customer outcomes below"} />
      <KpiCard label="Delivery window" value={<span className="text-sm font-semibold tracking-normal">{formatDate(document.fields.plannedProjectStart)} – {formatDate(document.fields.targetComplete)}</span>} sub={`Implementation services target ${formatDate(document.fields.plannedImplementationStart || document.fields.plannedProjectStart)}`} />
    </section>
  );
}

export function WorkPackageRegister({ document }: { document: EngagementDocument }) {
  const timeline = document.adoptionTimeline;
  const packages = timeline.lanes.flatMap(lane => lane.bars.map(activity => ({ lane, activity }))).sort((left, right) => left.activity.startCol - right.activity.startCol || left.activity.label.localeCompare(right.activity.label));
  return <section className="overflow-hidden rounded-lg border border-s100 bg-surface shadow-[var(--shadow-card)]"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-s100 px-5 py-4"><div><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Draft scope register</p><h3 className="mt-1 text-lg font-semibold text-ink">High-level SOW work packages</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-s500">Each package carries a delivery role, planning window, intended outcome, and dependency context into staffing and the final delivery package.</p></div><span className="chip">{packages.length} packages</span></div><div className="overflow-x-auto"><table className="tbl min-w-[980px]"><thead><tr><th>Work package</th><th>Delivery role</th><th>Window</th><th>Outcome / acceptance direction</th><th>Dependencies and assumptions</th></tr></thead><tbody>{packages.map(({ lane, activity }) => <tr key={activity.id}><td><p className="font-semibold text-ink">{activity.label}</p><p className="mt-1 text-[11px] text-s400">{lane.category} · {lane.workstreamType}</p></td><td className="font-medium text-s600">{DELIVERY_ROLE_BY_WORKSTREAM[lane.workstreamType]}</td><td className="whitespace-nowrap text-s500">{timeline.columns[activity.startCol - 1] || `Window ${activity.startCol}`} – {timeline.columns[Math.max(activity.startCol - 1, activity.endCol - 2)] || `Window ${activity.endCol - 1}`}</td><td className="leading-5 text-s600">{activity.outcome || "Confirm the completion evidence and customer acceptance direction during delivery planning."}</td><td className="leading-5 text-s500">{activity.dependsOn || "Sequence against customer availability, approved change windows, and the work that must finish first."}</td></tr>)}</tbody></table></div><p className="border-t border-s100 bg-s50 px-4 py-3 text-[11px] leading-5 text-s400">This is a planning-level scope register, not a signed legal statement of work. Delivery leadership must validate effort, named resources, commercial rates, customer responsibilities, and formal acceptance criteria.</p></section>;
}

export function StaffingSummary({ document }: { document: EngagementDocument }) {
  const timeline = document.adoptionTimeline;
  const staffing = summarizeDeliveryStaffing(timeline);
  return <section className="space-y-3"><div className="kpi-grid"><KpiCard label="Delivery roles" value={staffing.assignments.length} sub="Distinct roles across the adoption timeline" /><KpiCard label="Work packages" value={staffing.workPackageCount} sub="Activities on the Entitlement Adoption Timeline" /><KpiCard label="Peak concurrent packages" value={staffing.peakConcurrentPackages} sub="Most packages running in one window" /></div><div className="overflow-x-auto rounded-lg border border-s100 bg-surface"><table className="tbl min-w-[720px]"><thead><tr><th>Delivery role</th><th>Workstream</th><th className="num">Packages</th><th>Delivery window</th></tr></thead><tbody>{staffing.assignments.map(item => <tr key={item.role}><td className="font-semibold text-ink">{item.role}</td><td className="text-s500">{item.workstreamType}</td><td className="num text-s500">{item.workPackages.length}</td><td className="text-s500">{item.startLabel} – {item.endLabel}</td></tr>)}</tbody></table></div><p className="text-[11px] leading-5 text-ink-muted">Role guidance supports delivery-resource planning. Delivery leadership should confirm named resources, effort, utilization, and regional availability before work begins.</p></section>;
}

export function DeliveryPackageHeader({ document }: { document: EngagementDocument }) {
  const checks = [
    { label: document.fields.fundingSource === "bsas" ? "Customer and BSAS" : "Customer and entitlement", ready: Boolean(document.fields.customerName && fundedFields(document.fields).entitlementStart) },
    { label: "Service scope", ready: document.fields.priorities.length > 0 },
    { label: "Entitlement adoption timeline", ready: document.adoptionTimeline.lanes.some(lane => lane.bars.length) },
    { label: "Technical evidence", ready: Boolean(document.inventory.hosts && document.readiness.hardwarePlatforms.length) },
    // The account team's item, not the customer's: the hours behind the burndown come from the signed resource assignments.
    { label: "Entitled hours from signed assignments", ready: Boolean(document.report.entitlement.hours || document.report.resourceAssignments.length || (document.fields.fundingSource === "bsas" && document.fields.bsasHours)) },
    // Our own record to confirm; the customer documents mark the date "to be confirmed" until it is.
    { label: document.fields.fundingSource === "bsas" ? "BSAS end date confirmed" : "Entitlement end date confirmed", ready: !termEndAssumed(document) },
    // Our own planning input: without a host count the design hours assume a full design (shared/estateSize.ts).
    { label: "Estate size stated", ready: !estateSizeFlag(document) },
  ];
  const sizeFlag = estateSizeFlag(document);
  // Open items owned only by CDW or Broadcom are about our own records: the customer documents leave them out.
  const internal = internalOpenItems(document.report.openItems, document);
  return <section className="rounded-lg border border-s100 bg-surface p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Handoff control point</p><h3 className="mt-1 text-xl font-semibold text-ink">Delivery package readiness</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-s500">Both documents are generated from the same entitlement, service-plan, adoption-timeline, and compatibility source of truth.</p></div><Pill verdict={checks.every(check => check.ready) ? "ready" : "warn"}>{checks.filter(check => check.ready).length}/{checks.length} handoff areas ready</Pill></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{checks.map(check => <div key={check.label} className="flex items-center justify-between gap-2 rounded-lg border border-s100 bg-surface px-3 py-2 text-xs font-semibold text-ink">{check.label}{check.ready ? <Pill verdict="ready">Ready</Pill> : <Pill verdict="warn">Missing</Pill>}</div>)}</div>{(internal.length > 0 || sizeFlag) && <div className="mt-4 border-t border-s100 pt-3"><p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Internal items, not printed in customer documents</p><ul className="mt-2 space-y-1 text-xs text-ink">{sizeFlag && <li><span className="font-semibold">{sizeFlag}</span> <span className="text-s500">· set Small estate in the planner inputs, or import RVTools</span></li>}{internal.map(row => <li key={row.item}><span className="font-semibold">{row.item}</span> <span className="text-s500">· {row.owner}{row.gates ? ` · gates ${row.gates}` : ""}</span></li>)}</ul></div>}</section>;
}

export function DeliverableCard({ title, label, description, icon: Icon, activeExport, documentType, formats = ["html", "pdf"], onExport }: { title: string; label: string; description: string; icon: typeof FileCheck2; activeExport: ActiveExport; documentType: ExportDocumentType; formats?: ExportFormat[]; onExport: (format: ExportFormat, documentType: ExportDocumentType) => Promise<void> }) {
  return <article className="bg-surface p-5"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center bg-s600 text-white"><Icon className="size-5" /></div><div><p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p><h3 className="mt-1 text-lg font-semibold text-ink">{title}</h3><p className="mt-2 text-sm leading-6 text-s500">{description}</p></div></div><div className="mt-5 flex gap-2">{formats.map(format => <Button key={format} variant={format === "html" ? "outline" : "default"} size="sm" className={format === "html" ? undefined : "bg-cdw-red hover:bg-cdw-red-deep"} disabled={Boolean(activeExport)} onClick={() => void onExport(format, documentType)}>{activeExport?.format === format && activeExport.documentType === documentType ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} {format.toUpperCase()}</Button>)}</div></article>;
}

export function ExportPreferenceCard({
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
  return <div className="flex min-w-0 items-center justify-between gap-4 rounded-lg bg-s50 p-3"><div className="min-w-0"><p className="text-sm font-semibold text-ink">{title}</p><p className="mt-1 text-xs leading-5 text-s500">{description}</p></div><div className="flex shrink-0 items-center gap-3"><div className="text-right"><p className="text-sm font-semibold text-ink">{checked ? "Included" : "Omitted"}</p><p className="text-xs text-s400">HTML and PDF</p></div><Switch id={switchId} checked={checked} onCheckedChange={onCheckedChange} aria-label={`Include ${title} in HTML and PDF exports`} /></div></div>;
}

export function NoSelection({ engagements, onSelect, onCreate }: { engagements: { id: number; title: string; customerName: string; updatedAt: Date | string }[]; onSelect: (id: number) => void; onCreate: () => void }) {
  if (!engagements.length) {
    return <div className="mx-auto max-w-2xl py-10"><DesignEmptyState icon={FileText} title="No FCPs yet" sub="Start an FCP here, or create an engagement on the board and open its FCP from the record." action={<Button size="sm" onClick={onCreate}><Plus className="size-4" /> New FCP</Button>} /></div>;
  }
  const recent = [...engagements].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 9);
  return (
    <div className="mx-auto max-w-5xl space-y-4 py-6">
      <SectionBar label="FCP workspace" title="Choose an engagement">
        <Button asChild variant="outline" size="sm"><Link href="/pipeline"><Rows3 className="size-4" /> Open the pipeline</Link></Button>
        <Button size="sm" onClick={onCreate}><Plus className="size-4" /> New FCP</Button>
      </SectionBar>
      <p className="text-sm text-ink-muted">Recently updated. Every engagement is also on the board, where Open FCP brings you here.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recent.map(item => (
          <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="rounded-lg border border-s100 bg-surface p-4 text-left shadow-[var(--shadow-card)] transition-colors hover:border-s300">
            <p className="font-semibold text-ink">{item.title}</p>
            <p className="mt-0.5 text-xs text-ink-muted">{item.customerName}</p>
            <p className="mt-3 text-[11px] text-s400">Updated {new Date(item.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
