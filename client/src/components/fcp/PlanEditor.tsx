import { InternalPanel, ProvenancePill } from "@/components/fcp/Provenance";
import { EntitlementFitPanel } from "@/components/EntitlementFitPanel";
import { HoursFillPanel } from "@/components/HoursFillPanel";
import { generatedRowsFor, ReportContentEditor, RowTable } from "@/components/ReportContentEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Chip, EmptyState, Panel, Pill } from "@/components/vsa/elements";
import { AssignmentsInForce, CostMeter, EntitlementTimelineWithHours, NotionalTimelineWithHours, useScopedEffort } from "@/components/WorkPackageHours";
import { isMovedToFollowOn, packageSettings, resetRoleHours, setFollowOn, setOwner, setRoleHours, setWindow, windowColumns } from "@/lib/planEdits";
import type { RoleHours, ScopedEffort, WorkPackageEffort } from "@shared/effort";
import { formatWindow } from "@shared/effort";
import { FIXED_GANTT_CATEGORIES, synchronizeEntitlementNotionalFromOperational, type EngagementDocument } from "@shared/fcp";
import { packageHoursProvenance, planBsasAllocation, planBuckets, windowProvenance } from "@shared/planView";
import { fundingProvenance } from "@shared/provenance";
import { generateReport } from "@shared/reportView";
import { CalendarRange, Loader2, RotateCcw } from "lucide-react";
import { useMemo, type ReactNode } from "react";

const hours = (value: number) => Math.round(value).toLocaleString("en-US");
const ROLES: Array<[keyof RoleHours, string]> = [["architect", "Architect"], ["srConsultant", "Sr. Consultant"], ["projectManager", "Sr. PM"]];
const DEFERRED: Record<NonNullable<WorkPackageEffort["deferred"]>, string> = {
  "not funded": "Beyond the entitlement hours",
  "after the entitlement window": "Starts after the entitlement ends",
  "over budget": "Over the entitlement value",
  "planned for later": "Moved to follow-on",
};
const NOTE: Record<NonNullable<WorkPackageEffort["note"]>, string> = { "customer-owned": "Customer-owned", checkpoint: "Checkpoint", "not in the scoped hours": "No hours scoped", merged: "Merged into the pathway package" };

/**
 * The Plan section (design 5.6): the engine generates the plan and the architect shapes it here. Above the table, the
 * hours source, the buckets and the BSAS allocation (all print, in hours); the fit check sits in the locked panel.
 * Below it, the timelines exactly as the FCP draws them. UI only: every edit goes through the paths the timeline
 * editor and the hours editor already use.
 */
export function PlanEditor({ document, onChange, onRebuild, previewHtml, notes }: { document: EngagementDocument; onChange: (document: EngagementDocument) => void; onRebuild: () => void; previewHtml: string; notes: ReactNode }) {
  const effort = useScopedEffort(document);
  const generated = useMemo(() => generateReport(document), [document]);
  return (
    <div className="space-y-4">
      <Panel title="Delivery basis" sub="Why the plan is shaped the way it is, from the pathway and the inputs." actions={<Button variant="outline" size="sm" onClick={onRebuild}><RotateCcw className="size-4" /> {document.planAuthority === "manual" ? "Apply playbook template" : "Rebuild generated plan"}</Button>} bodyClassName="space-y-3 p-4">
        <p className="max-w-5xl text-sm leading-6 text-s600">{document.rationale}</p>
        <ProvenancePill provenance={windowProvenance(document)} />
        {notes}
      </Panel>

      {!effort ? <p className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Calculating hours…</p> : <>
        <HoursOverview document={document} effort={effort} onChange={onChange} />
        <InternalPanel title="Entitlement fit" sub="The fit check, the gap and the risk band against the entitlement value, with the rate it assumes. Used to plan; none of it prints.">
          <div className="space-y-3">
            {effort.internal.cost && <CostMeter cost={effort.internal.cost} hours={effort.totals.total} assignments={effort.source === "assignments"} fit={effort.internal.fit} />}
            <HoursFillPanel document={document} effort={effort} onChange={onChange} />
            <EntitlementFitPanel document={document} effort={effort} onChange={onChange} />
          </div>
        </InternalPanel>
        <WorkPackagesTable document={document} effort={effort} onChange={onChange} />
      </>}

      <Panel title="Timelines as the FCP draws them" sub="The entitlement window and the Two-Year Notional, from the same renderer as the report, so what you see is what prints." bodyClassName="p-0">
        <PrintedTimelines html={previewHtml} />
      </Panel>

      <details className="rounded-lg border border-s100 bg-surface">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-ink"><CalendarRange className="size-4 text-ink-muted" /> Edit activities on the timeline</summary>
        <div className="space-y-4 border-t border-s100 p-4">
          <p className="text-xs leading-5 text-ink-muted">Drag activities or their edges, add or remove activities. Any change here makes the plan hand-edited.</p>
          <EntitlementTimelineWithHours document={document} onChange={onChange} onTimelineChange={adoptionTimeline => onChange(synchronizeEntitlementNotionalFromOperational(document, adoptionTimeline))} description="The Entitlement Adoption Timeline." />
          <NotionalTimelineWithHours document={document} onChange={onChange} description="The Two-Year Notional, through a full 24-month horizon." />
        </div>
      </details>

      <Panel title="Customer-owned work" sub="Work the customer's team runs themselves, drawn as grey lanes on the timeline (for example the remaining migration waves after the proving wave)." bodyClassName="p-4">
        <RowTable rows={document.report.customerOwnedWork} columns={[{ key: "label", label: "Work", width: "50%" }, { key: "start", label: "Start month", type: "month" }, { key: "end", label: "End month", type: "month" }]} blank={{ label: "", start: "", end: "" }} addLabel="Add work" onChange={rows => onChange({ ...document, report: { ...document.report, customerOwnedWork: rows } })} generated={generatedRowsFor(document, generated, "customerOwnedWork", onChange)} />
      </Panel>
    </div>
  );
}

function HoursOverview({ document, effort, onChange }: { document: EngagementDocument; effort: ScopedEffort; onChange: (document: EngagementDocument) => void }) {
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
          <Pill verdict={effort.source === "assignments" ? "ready" : "warn"}>{effort.source === "assignments" ? "Signed resource assignments" : "Estimated from this plan"}</Pill>
          <span className="text-xs text-ink-muted">{effort.source === "assignments" ? "The FCP prints the signed hours by workstream; the packages below still shape the timeline." : "The FCP prints the hours below until signed resource assignments are entered, and says they are an estimate."}</span>
        </div>
        <AssignmentsInForce document={document} effort={effort} onChange={onChange} />
        <ReportContentEditor document={document} onChange={onChange} sections={["assignments"]} />
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

function WorkPackagesTable({ document, effort, onChange }: { document: EngagementDocument; effort: ScopedEffort; onChange: (document: EngagementDocument) => void }) {
  const rows = effort.workPackages;
  const columns = document.adoptionTimeline.columns;
  const groups = [
    ...[...FIXED_GANTT_CATEGORIES, null].map(category => ({ title: category ?? "Not on the timeline", rows: rows.filter(row => !row.deferred && row.category === category) })),
    { title: "Follow-on: after the entitlement (Two-Year Notional)", rows: rows.filter(row => row.deferred) },
  ].filter(group => group.rows.length);
  const window = windowProvenance(document);

  return (
    <Panel title="Work packages" sub="One row per work package, under the five categories the FCP prints. Type hours to replace the baseline; clear a field to go back to it. Moving a package to follow-on is recorded as a scope move and the FCP explains it." bodyClassName="p-0">
      {rows.length === 0 ? <div className="p-4"><EmptyState title="No work packages yet" sub="Set the delivery motion and the capabilities in Scope, and the plan generates its packages." /></div> : (
        <div className="overflow-x-auto">
          <table className="tbl w-full text-xs">
            <thead>
              <tr className="text-left text-[11px]">
                <th className="px-3 py-2">Work package</th><th className="px-2 py-2">Window <span className="sr-only">({window.source})</span></th><th className="px-2 py-2">Lead role</th>
                {ROLES.map(([role, label]) => <th key={role} className="px-2 py-2 text-right">{label}</th>)}
                <th className="px-2 py-2 text-right">Total</th><th className="px-2 py-2">Owned by</th><th className="px-3 py-2">Follow-on</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(group => [
                <tr key={`group-${group.title}`}><td colSpan={9} className="bg-surface-sunken px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">{group.title}</td></tr>,
                ...group.rows.map(row => <PackageRow key={row.id} document={document} effort={effort} row={row} columns={columns} onChange={onChange} />),
              ])}
            </tbody>
          </table>
          <p className="border-t border-s100 px-3 py-2 text-[11px] text-ink-muted">Windows: <ProvenancePill provenance={window} /></p>
        </div>
      )}
    </Panel>
  );
}

function PackageRow({ document, effort, row, columns, onChange }: { document: EngagementDocument; effort: ScopedEffort; row: WorkPackageEffort; columns: string[]; onChange: (document: EngagementDocument) => void }) {
  const settings = packageSettings(document, row.id);
  const shown = row.followOn ?? row;
  const cdw = row.owner === "cdw";
  const tag = row.deferred ? DEFERRED[row.deferred] : row.note ? NOTE[row.note] : null;
  const span = !row.deferred ? windowColumns(document, row.id) : null;
  const provenance = packageHoursProvenance(row, effort.source);
  return (
    <tr className="border-b border-s100 align-top">
      <td className="min-w-[16rem] px-3 py-2">
        <p className="font-medium text-ink">{row.label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {tag && <Chip>{tag}</Chip>}
          <ProvenancePill provenance={provenance} />
          {row.adjusted && cdw && <button type="button" className="inline-flex items-center gap-1 text-[11px] font-medium text-ink underline-offset-2 hover:underline" onClick={() => onChange(resetRoleHours(document, row.id))}><RotateCcw className="size-3" /> Baseline</button>}
        </div>
        {row.notes?.map(note => <p key={note} className="mt-1 text-[11px] leading-4 text-ink-muted">{note}</p>)}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-ink-muted">
        {span && columns.length ? (
          <div className="flex items-center gap-1">
            <ColumnSelect label={`${row.label} starts`} columns={columns} value={span.first} max={columns.length} onChange={first => onChange(setWindow(document, row.id, first, Math.max(first, span.last)))} />
            <span>–</span>
            <ColumnSelect label={`${row.label} ends`} columns={columns} value={span.last} min={span.first} max={columns.length} onChange={last => onChange(setWindow(document, row.id, span.first, last))} />
          </div>
        ) : row.deferred ? "After the entitlement" : row.start && row.end ? formatWindow(row.start, row.end) : "—"}
      </td>
      <td className="px-2 py-2 text-ink-muted">{row.leadRole || "—"}</td>
      {ROLES.map(([role, label]) => (
        <td key={role} className="px-2 py-2 text-right">
          {cdw ? <Input aria-label={`${row.label}: ${label} hours`} type="number" min={0} className="ml-auto h-8 w-20 bg-surface text-right text-xs tabular-nums" value={settings[role] ?? ""} placeholder={String(Math.round(row.followOn ? row.followOn[role] : row.baseline[role]))} onChange={event => onChange(setRoleHours(document, row.id, role, event.target.value === "" ? null : Number(event.target.value)))} /> : <span className="text-s300">—</span>}
        </td>
      ))}
      <td className="px-2 py-2 text-right font-medium tabular-nums text-ink">{shown.total ? hours(shown.total) : "—"}</td>
      <td className="px-2 py-2">
        <Select value={settings.owner} onValueChange={value => onChange(setOwner(document, row.id, value as typeof settings.owner))}>
          <SelectTrigger aria-label={`${row.label} owned by`} className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="auto">Default ({row.owner === "cdw" ? "CDW" : row.owner === "customer" ? "Customer" : "Checkpoint"})</SelectItem><SelectItem value="cdw">CDW</SelectItem><SelectItem value="customer">Customer</SelectItem><SelectItem value="checkpoint">Checkpoint</SelectItem></SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2">
        {cdw ? <Switch checked={isMovedToFollowOn(row)} onCheckedChange={on => onChange(setFollowOn(document, row.id, on))} aria-label={`Move ${row.label} to follow-on`} /> : <span className="text-s300">—</span>}
      </td>
    </tr>
  );
}

function ColumnSelect({ label, columns, value, min = 1, max, onChange }: { label: string; columns: string[]; value: number; min?: number; max: number; onChange: (column: number) => void }) {
  return (
    <Select value={String(value)} onValueChange={next => onChange(Number(next))}>
      <SelectTrigger aria-label={label} className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>{columns.slice(0, max).map((column, index) => index + 1 >= min && <SelectItem key={column + index} value={String(index + 1)}>{column}</SelectItem>)}</SelectContent>
    </Select>
  );
}

/** The timeline sheets out of the rendered FCP itself, with its styles, so the drawing is the printed one. */
export function printedTimelineDocument(html: string): string | null {
  if (!html) return null;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const sheets = Array.from(parsed.querySelectorAll("section.tl-sheet")).map(sheet => sheet.outerHTML).join("");
  if (!sheets) return "";
  const styles = Array.from(parsed.querySelectorAll("style")).map(style => style.outerHTML).join("");
  return `<!doctype html><html><head><meta charset="utf-8">${styles}</head><body>${sheets}</body></html>`;
}

function PrintedTimelines({ html }: { html: string }) {
  const doc = useMemo(() => printedTimelineDocument(html), [html]);
  if (doc === null) return <div className="grid h-40 place-items-center"><Loader2 className="size-5 animate-spin text-ink-muted" /></div>;
  if (!doc) return <div className="p-4"><EmptyState title="No timeline to draw yet" sub="The timelines appear once the plan has work packages." /></div>;
  return <iframe title="Timelines as printed" srcDoc={doc} sandbox="" className="h-[900px] w-full bg-surface" />;
}
