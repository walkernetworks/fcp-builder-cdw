import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { HOURS_FILL_BAR_ID, HOURS_FILL_DEFAULT_LABEL, refreshDerivedDocument, type EngagementDocument, type MinimalFields } from "@shared/fcp";
import type { ScopedEffort } from "@shared/effort";
import { useEffect } from "react";

const hours = (value: number) => Math.round(value).toLocaleString("en-US");

/**
 * INTERNAL: fully staffing the entitlement. When the plan leaves entitlement hours unused after the reserve, it lists
 * scope that fits them (each priced as a whole plan rebuild) and offers a work package that takes up whatever is left.
 */
export function HoursFillPanel({ document, effort, onChange }: { document: EngagementDocument; effort: ScopedEffort | undefined; onChange: (document: EngagementDocument) => void }) {
  const fill = document.fields.hoursFill;
  const options = trpc.effort.fillOptions.useMutation();
  const { mutate } = options;
  const fit = effort?.internal.fit;
  const fillRow = effort?.workPackages.find(row => row.id === HOURS_FILL_BAR_ID);
  const active = document.fields.hoursModel === "v2" && Boolean(fit);
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => mutate({ data: document }), 600);
    return () => window.clearTimeout(timer);
  }, [active, document, mutate]);
  if (!active || !fit) return null;

  const setFields = (patch: Partial<MinimalFields>) => onChange(refreshDerivedDocument({ ...document, fields: { ...document.fields, ...patch } }));
  const setFill = (next: Partial<MinimalFields["hoursFill"]>) => setFields({ hoursFill: { ...fill, ...next } });
  const unused = options.data?.unusedHours ?? null;
  const fillHours = fillRow && !fillRow.deferred ? fillRow.total : 0;
  const stillUnused = Math.max(0, (unused ?? 0) - fillHours);

  return (
    <div className="space-y-3 rounded-lg border border-s100 bg-surface p-4 text-xs leading-5 text-ink">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-s500">Fully staff the entitlement · internal</span>
        {unused !== null && <span className="font-semibold">{unused < 1 ? "The plan uses every fillable hour" : `${hours(unused)} hours unused after the ${hours(fit.reserveHours)}-hour reserve`}</span>}
      </div>
      {options.isPending && !options.data && <p className="text-s500">Pricing the scope that would fit…</p>}
      {options.error && <p className="text-state-blocked-text">The fill options could not be priced: {options.error.message}</p>}

      {options.data && unused !== null && unused >= 1 && (
        <div>
          <p className="mb-1 font-semibold">Scope that fits the unused hours</p>
          {options.data.options.length ? (
            <ul className="divide-y divide-s100 rounded-lg border border-s100">
              {options.data.options.map(option => (
                <li key={option.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1"><b>{option.label}</b> <span className="text-s500">{option.detail}</span></span>
                  <span className="tabular-nums text-s600">+{hours(option.hours)} h</span>
                  <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setFields(option.patch)}>Add</Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-s50 px-3 py-2 text-s500">No outcome or depth tier on its own fits in {hours(unused)} hours.</p>
          )}
          {options.data.tooLarge > 0 && <p className="mt-1 text-s500">{options.data.tooLarge} more addition{options.data.tooLarge === 1 ? " needs" : "s need"} more hours than are left, so {options.data.tooLarge === 1 ? "it is" : "they are"} not listed.</p>}
        </div>
      )}

      <div className="space-y-2 rounded-lg bg-s50 p-3">
        {fill.enabled ? (
          <>
            <p>
              <b>{fill.label}</b> is on the timeline {fillRow?.adjusted ? <>with the <b>{hours(fillHours)} hours</b> set on the package.</> : <>and takes up whatever is left: <b>{hours(fillHours)} hours</b> now.</>}
              {fillRow?.adjusted && stillUnused >= 1 && <> {hours(stillUnused)} hours are still unused; clear the hours on the package to take them all.</>}
              {fillRow?.deferred && " It starts after the entitlement ends, so it carries no entitlement hours; move it into the window."}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1" htmlFor="hours-fill-label">
                <span className="text-[11px] font-medium uppercase tracking-wide text-s500">Work package name</span>
                <Input id="hours-fill-label" className="w-72 bg-surface" maxLength={120} defaultValue={fill.label} placeholder={HOURS_FILL_DEFAULT_LABEL} onBlur={event => { const label = event.target.value.trim() || HOURS_FILL_DEFAULT_LABEL; if (label !== fill.label) setFill({ label }); }} />
              </label>
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setFill({ enabled: false })}>Remove the package</Button>
            </div>
            <p className="text-s500">The name applies when the package is added; rename it on the timeline after that. Click it on the timeline to set its hours by role or move its window.</p>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1">{unused !== null && unused >= 1 ? <>Add a <b>{HOURS_FILL_DEFAULT_LABEL}</b> work package to take up the {hours(unused)} hours that are left, in the plan's role mix, from implementation start to the end of the entitlement. It follows the hours as the scope changes.</> : "When the scope leaves hours unused, a work package can take them up."}</p>
            <Button type="button" size="sm" className="h-8 text-xs" disabled={unused === null || unused < 1} onClick={() => setFill({ enabled: true })}>Fill the rest</Button>
          </div>
        )}
      </div>
    </div>
  );
}
