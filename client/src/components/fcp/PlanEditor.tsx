import { InternalPanel, ProvenancePill } from "@/components/fcp/Provenance";
import { EntitlementFitPanel } from "@/components/EntitlementFitPanel";
import { HoursFillPanel } from "@/components/HoursFillPanel";
import { generatedRowsFor, RowTable } from "@/components/ReportContentEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Chip, EmptyState, Panel, Pill } from "@/components/vsa/elements";
import { CostMeter, EntitlementTimelineWithHours, NotionalTimelineWithHours, useScopedEffort } from "@/components/WorkPackageHours";
import { trpc } from "@/lib/trpc";
import { bringInPreview, laterReason, planSummary, type PlanSummary } from "@shared/planSummary";
import { bringIntoEntitlement, packageSettings, resetRoleHours, setFollowOn, setOwner, setRoleHours } from "@/lib/planEdits";
import type { RoleHours, ScopedEffort, WorkPackageEffort } from "@shared/effort";
import { formatWindow } from "@shared/effort";
import { FIXED_GANTT_CATEGORIES, synchronizeEntitlementNotionalFromOperational, type EngagementDocument } from "@shared/fcp";
import { planBsasAllocation, planBuckets, windowProvenance } from "@shared/planView";
import { fundingProvenance } from "@shared/provenance";
import { generateReport } from "@shared/reportView";
import { Calculator, ChevronDown, ChevronRight, Loader2, RotateCcw } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

const hours = (value: number) => Math.round(value).toLocaleString("en-US");
const ROLES: Array<[keyof RoleHours, string]> = [["architect", "Architect"], ["srConsultant", "Sr. Consultant"], ["projectManager", "Sr. PM"]];

/**
 * The Plan section: the answer first (does it fit, and what moves to year two), then the packages in this entitlement,
 * the packages in year two, and one timeline. How the hours were worked out sits in one collapsed drawer. UI only:
 * every edit goes through the paths the timeline editor and the hours editor already use.
 */
export function PlanEditor({ document, onChange, onRebuild, previewHtml: _previewHtml, notes }: { document: EngagementDocument; onChange: (document: EngagementDocument) => void; onRebuild: () => void; previewHtml: string; notes: ReactNode }) {
  const effort = useScopedEffort(document);
  const generated = useMemo(() => generateReport(document), [document]);
  const summary = useMemo(() => (effort ? planSummary(document, effort, new Date().toISOString().slice(0, 10)) : null), [document, effort]);
  const [view, setView] = useState<"entitlement" | "two-year">("entitlement");
  if (!effort || !summary) return <p className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Calculating hours…</p>;
  return (
    <div className="space-y-4">
      <PlanAnswer summary={summary} onRebuild={onRebuild} manual={document.planAuthority === "manual"} />

      <Panel title="In this entitlement" sub="What CDW delivers with the entitlement hours, in order. Click a package to change its hours or who runs it." bodyClassName="p-0">
        {summary.inWindow.length ? <PackageList rows={summary.inWindow} document={document} effort={effort} onChange={onChange} mode="entitlement" /> : <div className="p-4"><EmptyState title="Nothing fits in this entitlement yet" sub="The hours left are smaller than the next whole package. Everything is listed in year two." /></div>}
      </Panel>

      <Panel title="Year two and on" sub="Work the entitlement cannot carry, with its estimated hours. It needs a renewal with services, a services purchase, or BSAS hours." bodyClassName="p-0">
        {summary.later.length ? <PackageList rows={summary.later} document={document} effort={effort} onChange={onChange} mode="later" /> : <div className="p-4"><EmptyState title="Nothing moves to year two" sub="Every requested package fits in this entitlement." /></div>}
      </Panel>

      <Panel title="Timeline" sub="Drag a package or its edges to move it. Grey bars are run by the customer." actions={
        <div className="flex gap-1" role="tablist" aria-label="Timeline view">
          <Chip pressed={view === "entitlement"} onClick={() => setView("entitlement")}>This entitlement</Chip>
          <Chip pressed={view === "two-year"} onClick={() => setView("two-year")}>Two years</Chip>
        </div>
      } bodyClassName="p-4">
        {view === "entitlement"
          ? <EntitlementTimelineWithHours bare document={document} onChange={onChange} onTimelineChange={adoptionTimeline => onChange(synchronizeEntitlementNotionalFromOperational(document, adoptionTimeline))} description="This entitlement." />
          : <NotionalTimelineWithHours document={document} onChange={onChange} description="This entitlement and the year after it." />}
      </Panel>

      <details className="rounded-lg border border-s100 bg-surface">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-ink"><Calculator className="size-4 text-ink-muted" /> How the hours were worked out</summary>
        <div className="space-y-4 border-t border-s100 p-4">
          <div className="space-y-2">
            <p className="max-w-5xl text-sm leading-6 text-s600">{document.rationale}</p>
            <ProvenancePill provenance={windowProvenance(document)} />
            {notes}
          </div>
          <HoursOverview document={document} effort={effort} />
          <InternalPanel title="Entitlement fit" sub="The fit check, the cost against the entitlement value, and scope that would use spare hours. Used to plan; none of it prints.">
            <div className="space-y-3">
              {effort.internal.cost && <CostMeter cost={effort.internal.cost} hours={effort.totals.total} fit={effort.internal.fit} />}
              <HoursFillPanel document={document} effort={effort} onChange={onChange} />
              <EntitlementFitPanel document={document} effort={effort} onChange={onChange} />
            </div>
          </InternalPanel>
          <Panel title="Customer-run work" sub="Work the customer's team runs themselves, drawn as grey bars on the timeline." bodyClassName="p-4">
            <RowTable rows={document.report.customerOwnedWork} columns={[{ key: "label", label: "Work", width: "50%" }, { key: "start", label: "Start month", type: "month" }, { key: "end", label: "End month", type: "month" }]} blank={{ label: "", start: "", end: "" }} addLabel="Add work" onChange={rows => onChange({ ...document, report: { ...document.report, customerOwnedWork: rows } })} generated={generatedRowsFor(document, generated, "customerOwnedWork", onChange)} />
          </Panel>
        </div>
      </details>
    </div>
  );
}

/** The answer: the hours, in one line, and whether everything fits. */
function PlanAnswer({ summary, onRebuild, manual }: { summary: PlanSummary; onRebuild: () => void; manual: boolean }) {
  const verdict = summary.status === "fits" ? "go" : summary.status === "moves" ? "warn" : "stop";
  return (
    <section className="rounded-lg border border-s100 bg-surface p-4 shadow-sm" aria-label="Plan summary">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-ink">
            {summary.entitled !== null && <span><b className="text-lg tabular-nums">{hours(summary.entitled)}</b> entitlement hours</span>}
            {summary.delivered > 0 && <span><b className="tabular-nums">{hours(summary.delivered)}</b> delivered</span>}
            <span><b className="tabular-nums">{hours(summary.planned)}</b> planned</span>
            {summary.held > 0 && <span><b className="tabular-nums">{hours(summary.held)}</b> held for change requests</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2"><Pill verdict={verdict}>{summary.status === "fits" ? "Fits" : summary.status === "moves" ? "Some work in year two" : "Needs a decision"}</Pill><span className="text-sm text-ink">{summary.headline}</span></div>
          {summary.problem && <p className="max-w-4xl text-xs leading-5 text-state-blocked-text">{summary.problem}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={onRebuild}><RotateCcw className="size-4" /> {manual ? "Apply playbook template" : "Rebuild plan"}</Button>
      </div>
    </section>
  );
}

/** One list of packages: this entitlement (grouped by category) or year two. A row opens to its hours by role. */
function PackageList({ rows, document, effort, onChange, mode }: { rows: WorkPackageEffort[]; document: EngagementDocument; effort: ScopedEffort; onChange: (document: EngagementDocument) => void; mode: "entitlement" | "later" }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = mode === "entitlement"
    ? [...FIXED_GANTT_CATEGORIES, null].map(category => ({ title: category ?? "Other", rows: rows.filter(row => row.category === category) })).filter(group => group.rows.length)
    : [{ title: null, rows }];
  const total = rows.reduce((sum, row) => sum + (mode === "later" ? row.followOn?.total ?? 0 : row.total), 0);
  return (
    <table className="tbl w-full text-sm">
      <thead><tr className="text-left text-[11px]"><th className="px-3 py-2">Package</th><th className="px-2 py-2">{mode === "later" ? "Why" : "Month"}</th><th className="px-2 py-2">Run by</th><th className="px-2 py-2 text-right">Hours</th><th className="px-3 py-2"><span className="sr-only">Action</span></th></tr></thead>
      <tbody>
        {groups.map(group => [
          group.title ? <tr key={`g-${group.title}`}><td colSpan={5} className="bg-surface-sunken px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">{group.title}</td></tr> : null,
          ...group.rows.map(row => <PackageRowView key={row.id} row={row} document={document} effort={effort} onChange={onChange} mode={mode} open={open === row.id} onToggle={() => setOpen(open === row.id ? null : row.id)} />),
        ])}
        <tr className="font-semibold text-ink"><td className="px-3 py-2" colSpan={3}>{mode === "later" ? "Total in year two" : "Total CDW hours in this entitlement"}</td><td className="px-2 py-2 text-right tabular-nums">{hours(total)}</td><td /></tr>
      </tbody>
    </table>
  );
}

function PackageRowView({ row, document, effort, onChange, mode, open, onToggle }: { row: WorkPackageEffort; document: EngagementDocument; effort: ScopedEffort; onChange: (document: EngagementDocument) => void; mode: "entitlement" | "later"; open: boolean; onToggle: () => void }) {
  const cdw = row.owner === "cdw";
  const shown = mode === "later" ? row.followOn ?? row : row;
  const settings = packageSettings(document, row.id);
  return (
    <>
      <tr className="cursor-pointer border-b border-s100 align-top hover:bg-surface-sunken" onClick={onToggle} aria-expanded={open}>
        <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 font-medium text-ink">{open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}{row.label}</span>{row.adjusted && cdw && <span className="ml-2"><Chip>Hours changed</Chip></span>}</td>
        <td className="whitespace-nowrap px-2 py-2 text-ink-muted">{mode === "later" ? laterReason(row) : row.start && row.end ? formatWindow(row.start, row.end) : "—"}</td>
        <td className="px-2 py-2 text-ink-muted">{row.owner === "customer" ? "Customer" : "CDW"}</td>
        <td className="px-2 py-2 text-right tabular-nums text-ink">{cdw && shown.total ? hours(shown.total) : "—"}</td>
        <td className="px-3 py-2 text-right" onClick={event => event.stopPropagation()}>
          {cdw && mode === "entitlement" && <Button variant="ghost" size="sm" onClick={() => onChange(setFollowOn(document, row.id, true))}>Move to year two</Button>}
          {cdw && mode === "later" && row.deferred !== "after the entitlement window" && <BringIn document={document} effort={effort} row={row} onChange={onChange} />}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-s100 bg-surface-sunken">
          <td colSpan={5} className="px-3 py-3">
            {row.detail?.outcome && <p className="mb-3 max-w-4xl text-xs leading-5 text-ink-muted">{row.detail.outcome}</p>}
            {cdw ? (
              <div className="flex flex-wrap items-end gap-3">
                {ROLES.map(([role, label]) => (
                  <label key={role} className="text-xs text-ink-muted">{label}
                    <Input aria-label={`${row.label}: ${label} hours`} type="number" min={0} className="mt-1 h-8 w-24 bg-surface text-right text-xs tabular-nums" value={settings[role] ?? ""} placeholder={String(Math.round(row.followOn ? row.followOn[role] : row.baseline[role]))} onChange={event => onChange(setRoleHours(document, row.id, role, event.target.value === "" ? null : Number(event.target.value)))} />
                  </label>
                ))}
                {row.adjusted && <Button variant="ghost" size="sm" onClick={() => onChange(resetRoleHours(document, row.id))}><RotateCcw className="size-3.5" /> Back to the estimate</Button>}
                {mode === "later" && row.deferred === "planned for later" && <Button variant="ghost" size="sm" onClick={() => onChange(setFollowOn(document, row.id, false))}>Undo move</Button>}
              </div>
            ) : <p className="text-xs text-ink-muted">Run by the customer; it carries no CDW hours.</p>}
            <div className="mt-3 flex items-center gap-2 text-xs text-ink-muted">Run by
              <Select value={settings.owner} onValueChange={value => onChange(setOwner(document, row.id, value as typeof settings.owner))}>
                <SelectTrigger aria-label={`${row.label} run by`} className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="auto">Default ({row.owner === "cdw" ? "CDW" : row.owner === "customer" ? "Customer" : "Checkpoint"})</SelectItem><SelectItem value="cdw">CDW</SelectItem><SelectItem value="customer">Customer</SelectItem></SelectContent>
              </Select>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** "Bring into this entitlement": shows what would move out to make room, and applies it only on confirm. */
function BringIn({ document, effort, row, onChange }: { document: EngagementDocument; effort: ScopedEffort; row: WorkPackageEffort; onChange: (document: EngagementDocument) => void }) {
  const preview = trpc.effort.scoped.useMutation();
  const [asked, setAsked] = useState(false);
  const candidate = useMemo(() => bringIntoEntitlement(document, row.id), [document, row.id]);
  const result = preview.data ? bringInPreview(effort, preview.data, row.id) : null;
  if (!asked) return <Button variant="outline" size="sm" onClick={() => { setAsked(true); preview.mutate({ data: candidate }); }}>Bring into this entitlement</Button>;
  return (
    <div className="ml-auto max-w-sm space-y-2 text-left text-xs leading-5" role="status">
      {!result ? <p className="flex items-center gap-1.5 text-ink-muted"><Loader2 className="size-3.5 animate-spin" /> Checking what would move…</p>
        : result.fits ? <>
          <p className="text-ink">{result.movesOut.length ? <>To make room, these move to year two: {result.movesOut.map(item => `${item.label} (${hours(item.hours)} h)`).join("; ")}.</> : "It fits without moving anything else."}</p>
          <div className="flex gap-2"><Button size="sm" onClick={() => { onChange(candidate); setAsked(false); }}>Bring it in</Button><Button variant="ghost" size="sm" onClick={() => setAsked(false)}>Cancel</Button></div>
        </>
        : <>
          <p className="text-ink">{result.reason}</p>
          <Button variant="ghost" size="sm" onClick={() => setAsked(false)}>OK</Button>
        </>}
    </div>
  );
}

function HoursOverview({ document, effort }: { document: EngagementDocument; effort: ScopedEffort }) {
  const buckets = planBuckets(document, effort);
  const bsas = planBsasAllocation(document, effort);
  const funding = fundingProvenance(document);
  const fit = effort.internal.fit;
  const total = buckets.reduce((sum, bucket) => sum + bucket.hours, 0);
  return (
    <Panel title="Hours" sub="These print in the FCP, in hours only: where the hours come from, the scope by bucket, and what BSAS funds." bodyClassName="space-y-5 p-4">
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Hours source</p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <Pill verdict="warn">Estimated from this plan</Pill>
          <span className="text-xs text-ink-muted">The FCP prints the hours below, estimated by role from the work packages and fitted into the entitlement.</span>
        </div>
      </div>

      {buckets.length > 0 ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Scope by bucket</p>
          <table className="tbl mt-2 w-full text-xs">
            <thead><tr className="text-left text-[11px]"><th className="px-2 py-1.5">Bucket</th><th className="px-2 py-1.5">What it covers</th><th className="px-2 py-1.5 text-right">Hours</th></tr></thead>
            <tbody>
              {buckets.map(bucket => <tr key={bucket.key} className="border-b border-s100"><td className="px-2 py-1.5 font-medium text-ink">{bucket.name}</td><td className="px-2 py-1.5 text-ink-muted">{bucket.covers}</td><td className="px-2 py-1.5 text-right tabular-nums text-ink">{hours(bucket.hours)}</td></tr>)}
              <tr className="font-semibold text-ink"><td className="px-2 py-1.5" colSpan={2}>Total scope</td><td className="px-2 py-1.5 text-right tabular-nums">{hours(total)}</td></tr>
            </tbody>
          </table>
          <div className="mt-1.5"><ProvenancePill provenance={{ state: "assumed", source: "Placed by the entitlement fit, in order of priority" }} /></div>
          {fit?.underFunded && <p className="mt-2 rounded-lg border border-state-blocked/30 bg-state-blocked-soft px-3 py-2 text-xs leading-5 text-state-blocked-text" role="status"><strong>Under-funded:</strong> the work that stays in the entitlement needs {hours(fit.underFunded.gapHours)} hours more than it funds, and the full scope needs {hours(fit.underFunded.fullScopeGapHours)} more. Design work never moves, so the FCP will not export until it fits. Change the scope, not the estimate.</p>}
          {(fit?.scopeMoves?.length ?? 0) > 0 && <p className="mt-2 text-xs leading-5 text-ink-muted"><strong className="font-medium text-ink">Moved out of the entitlement:</strong> {fit!.scopeMoves!.map(move => `${move.label} (${hours(move.hours)} h, ${move.reason})`).join("; ")}.</p>}
        </div>
      ) : <p className="text-xs text-ink-muted">Scope by bucket prints with the v2 hours model; this plan uses the earlier model.</p>}

      {bsas && (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">BSAS allocation</p>
          <dl className="mt-2 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-xs text-ink-muted">Available</dt><dd className="text-ink">{hours(bsas.term.hours)} hours, {bsas.term.termStart} to {bsas.term.termEnd}</dd><dd className="mt-1 space-y-1"><ProvenancePill provenance={funding.bsasStart} /><ProvenancePill provenance={funding.bsasEnd} /></dd></div>
            <div><dt className="text-xs text-ink-muted">Planned inside the term</dt><dd className="text-ink">{hours(bsas.plannedHours)} hours</dd></div>
            <div><dt className="text-xs text-ink-muted">Forfeited at the term end</dt><dd className={bsas.forfeitedHours ? "font-medium text-state-warn-text" : "text-ink"}>{hours(bsas.forfeitedHours)} hours</dd></div>
            <div><dt className="text-xs text-ink-muted">Follow-on BSAS does not cover</dt><dd className="text-ink">{hours(bsas.unfundedHours)} hours</dd></div>
          </dl>
          {bsas.rows.length === 0 && <p className="mt-2 text-xs text-ink-muted">No follow-on work is planned yet, so none of the BSAS hours are drawn.</p>}
        </div>
      )}
    </Panel>
  );
}
