import { Input } from "@/components/ui/input";
import type { ScopedEffort } from "@shared/effort";
import { estimateInputsSchema, type EngagementDocument, type EstimateInputs, type HoursModel } from "@shared/fcp";

const hours = (value: number) => Math.round(value).toLocaleString("en-US");
const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const monthLabel = (month: string) => new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));

const BUCKETS: Array<["E1" | "E2" | "F" | "C", string, string]> = [
  ["E1", "Entitlement core", "Discovery, design, the pathway spine, dated waves and Operations Tier 1"],
  ["E2", "Entitlement depth", "Selected outcomes, remaining waves and depth tiers, in priority order"],
  ["F", "Follow-on entitlement", "Year two; depends on a future VCF purchase or renewal with entitlement"],
  ["C", "Customer-funded", "Work the customer wants this year beyond the entitlement, through CDW"],
];
const CORE_STEP: Record<number, string> = { 1: "Discovery", 2: "Design", 3: "Pathway build or upgrade", 4: "Dated migration waves", 5: "Operations Tier 1" };
const editable = new Set(Object.keys(estimateInputsSchema.shape));

/**
 * INTERNAL: the v2 entitlement fit for the planner. Buckets with hours and dollars, the rate assumption, the
 * burn-down, displaced work, guardrail flags and every defaulted input. None of this is printed in a document
 * with rates or dollars; the Condensed FCP shows the buckets in hours only.
 */
export function EntitlementFitPanel({ document, effort, onChange }: { document: EngagementDocument; effort: ScopedEffort | undefined; onChange: (document: EngagementDocument) => void }) {
  const model = document.fields.hoursModel;
  const inputs = document.fields.estimateInputs;
  const setModel = (hoursModel: HoursModel) => onChange({ ...document, fields: { ...document.fields, hoursModel } });
  const setInput = (key: keyof EstimateInputs, value: EstimateInputs[keyof EstimateInputs] | undefined) => {
    const next = { ...inputs, [key]: value } as EstimateInputs;
    if (value === undefined) delete next[key];
    onChange({ ...document, fields: { ...document.fields, estimateInputs: next } });
  };
  const fit = effort?.internal.fit;
  const money = effort?.internal.money;
  const pass1 = effort?.internal.pass1;

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-800">
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1" htmlFor="hours-model">
          <span className="text-[10px] font-black uppercase tracking-[.14em] text-slate-600">Hours model</span>
          <select id="hours-model" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" value={model} onChange={event => setModel(event.target.value as HoursModel)}>
            <option value="v1">v1: host brackets</option>
            <option value="v2">v2: topology formulas with entitlement fit</option>
          </select>
        </label>
        {model === "v2" && (
          <>
            <label className="grid gap-1" htmlFor="blended-rate">
              <span className="text-[10px] font-black uppercase tracking-[.14em] text-slate-600">Blended rate override ($/hr)</span>
              <Input id="blended-rate" type="number" min={1} className="w-40 bg-white" value={inputs.blendedRate ?? ""} placeholder={money && money.rateSource === "rate card" ? String(Math.round(money.blendedRate)) : "rate card"} onChange={event => setInput("blendedRate", event.target.value ? Number(event.target.value) : undefined)} />
            </label>
            <label className="grid gap-1" htmlFor="months-remaining">
              <span className="text-[10px] font-black uppercase tracking-[.14em] text-slate-600">Months remaining</span>
              <Input id="months-remaining" type="number" min={1} max={36} className="w-28 bg-white" value={inputs.monthsRemaining ?? ""} placeholder={fit ? String(fit.monthsRemaining) : ""} onChange={event => setInput("monthsRemaining", event.target.value ? Number(event.target.value) : undefined)} />
            </label>
          </>
        )}
      </div>
      {model === "v2" && !effort && <p className="text-slate-500">Calculating…</p>}
      {model === "v2" && effort && !fit && <p>No entitlement value or entitled hours yet, so the full scope is shown with no fit. Add the entitlement value on the Engagement step.</p>}

      {fit && (
        <>
          {fit.underFunded && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 font-semibold text-red-950">
              Under-funded: the core work needs {hours(fit.coreRequiredHours)} hours, {hours(fit.underFunded.gapHours)} more than the {hours(fit.fillableHours)} fillable hours
              {money ? ` (${dollars(fit.underFunded.gapHours * money.blendedRate)} at ${dollars(money.blendedRate)}/hr)` : ""}. The plan keeps the whole core and nothing else; raise the entitlement or change the pathway.
            </p>
          )}
          {fit.underFunded && (
            <div className="overflow-x-auto">
              <p className="mb-1 font-semibold">Core work by line (what has to fit first)</p>
              <table className="w-full min-w-[420px] border-collapse">
                <thead><tr className="text-left text-[10px] uppercase tracking-[.1em] text-slate-500"><th className="py-1 pr-2">Line</th><th className="py-1 pr-2 text-right">Hours</th><th className="py-1">Fill step</th></tr></thead>
                <tbody>{fit.coreByLine.map(row => <tr key={row.code} className="border-t border-slate-200"><td className="py-1 pr-2"><b>{row.code}</b> {row.line}</td><td className="py-1 pr-2 text-right tabular-nums">{hours(row.loaded)}</td><td className="py-1">{CORE_STEP[row.step] ?? row.step}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead><tr className="text-left text-[10px] uppercase tracking-[.1em] text-slate-500"><th className="py-1 pr-2">Bucket</th><th className="py-1 pr-2">What goes here</th><th className="py-1 pr-2 text-right">Hours</th><th className="py-1 text-right">Dollars</th></tr></thead>
              <tbody>
                {BUCKETS.map(([key, name, detail]) => (
                  <tr key={key} className="border-t border-slate-200"><td className="py-1 pr-2 font-semibold">{key} {name}</td><td className="py-1 pr-2 text-slate-600">{detail}</td><td className="py-1 pr-2 text-right tabular-nums">{hours(fit.buckets[key])}</td><td className="py-1 text-right tabular-nums">{money ? dollars(money.buckets[key]) : ""}</td></tr>
                ))}
                <tr className="border-t border-slate-200"><td className="py-1 pr-2 font-semibold">Reserve</td><td className="py-1 pr-2 text-slate-600">Held back until month 6 for overrun</td><td className="py-1 pr-2 text-right tabular-nums">{hours(fit.reserveHours)}</td><td className="py-1 text-right tabular-nums">{money ? dollars(money.buckets.reserve) : ""}</td></tr>
                <tr className="border-t border-slate-200"><td className="py-1 pr-2 font-semibold">Entitlement remaining</td><td className="py-1 pr-2 text-slate-600">Fillable hours left after the fill</td><td className="py-1 pr-2 text-right tabular-nums">{hours(fit.entitlementRemaining)}</td><td className="py-1 text-right tabular-nums">{money ? dollars(fit.entitlementRemaining * money.blendedRate) : ""}</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            Entitlement: <b>{hours(fit.entitlementHours)} hours</b>
            {money && <> at <b>{dollars(money.blendedRate)}/hr</b> ({money.rateSource})</>}
            {effort.internal.envelopeSource === "entitled hours" && " (the signed entitled hours)"}. Fillable after the 8% reserve: {hours(fit.fillableHours)}. Core (E1) needs {hours(fit.coreRequiredHours)} against the fillable {hours(fit.fillableHours)}.
            Required burn: {hours(fit.requiredMonthlyBurn)} hours a month over {fit.monthsRemaining} month{fit.monthsRemaining === 1 ? "" : "s"}.
          </p>
          {fit.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-amber-900">{fit.warnings.map(item => <li key={item}>{item}</li>)}</ul>}
          <ul className="list-disc space-y-1 pl-5 text-slate-700">{fit.notes.map(item => <li key={item}>{item}</li>)}</ul>

          {fit.notFunded.length > 0 && (
            <div className="overflow-x-auto">
              <p className="mb-1 font-semibold">Not funded in this window</p>
              <table className="w-full min-w-[560px] border-collapse">
                <thead><tr className="text-left text-[10px] uppercase tracking-[.1em] text-slate-500"><th className="py-1 pr-2">Line</th><th className="py-1 pr-2">Units</th><th className="py-1 pr-2 text-right">Hours</th><th className="py-1 pr-2">Bucket</th><th className="py-1">Reason</th></tr></thead>
                <tbody>{fit.notFunded.map(row => <tr key={`${row.code}-${row.bucket}`} className="border-t border-slate-200"><td className="py-1 pr-2 font-semibold">{row.line}</td><td className="py-1 pr-2 text-slate-600">{row.label}</td><td className="py-1 pr-2 text-right tabular-nums">{hours(row.loaded)}</td><td className="py-1 pr-2">{row.bucket}</td><td className="py-1">{row.reason}</td></tr>)}</tbody>
              </table>
            </div>
          )}

          {fit.burndown.length > 0 && (
            <div className="overflow-x-auto">
              <p className="mb-1 font-semibold">Burn-down</p>
              <table className="w-full min-w-[420px] border-collapse">
                <thead><tr className="text-left text-[10px] uppercase tracking-[.1em] text-slate-500"><th className="py-1 pr-2">Month</th><th className="py-1 pr-2 text-right">Target used</th><th className="py-1 text-right">Actual used</th></tr></thead>
                <tbody>{fit.burndown.map(row => <tr key={row.month} className="border-t border-slate-200"><td className="py-1 pr-2">{monthLabel(row.month)}</td><td className="py-1 pr-2 text-right tabular-nums">{hours(row.target)}</td><td className="py-1 text-right tabular-nums">{row.actual === null ? "" : hours(row.actual)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </>
      )}

      {model === "v2" && pass1 && (
        <>
          <div className="overflow-x-auto">
            <p className="mb-1 font-semibold">Scope by line (Pass 1, before the fit)</p>
            <table className="w-full min-w-[560px] border-collapse">
              <thead><tr className="text-left text-[10px] uppercase tracking-[.1em] text-slate-500"><th className="py-1 pr-2">Line</th><th className="py-1 pr-2 text-right">Base</th><th className="py-1 pr-2 text-right">Depth</th><th className="py-1">Drivers</th></tr></thead>
              <tbody>{pass1.lines.map(line => <tr key={line.code} className="border-t border-slate-200"><td className="py-1 pr-2"><b>{line.code}</b> {line.name}{line.designOnly ? " (design only)" : ""}</td><td className="py-1 pr-2 text-right tabular-nums">{line.computedBase.toFixed(1)}</td><td className="py-1 pr-2 text-right tabular-nums">x{line.depthMultiplier}</td><td className="py-1 text-slate-600">{Object.entries(line.drivers).map(([key, value]) => `${key} ${typeof value === "number" ? Math.round(value * 100) / 100 : value}`).join(", ")}</td></tr>)}</tbody>
            </table>
            <p className="mt-1 text-slate-600">Project management: {hours(pass1.pm)} hours ({pass1.pmFloorApplied ? "the floor" : "15% of technical hours"}).</p>
          </div>
          <div>
            <p className="mb-1 font-semibold">Assumptions (defaults the estimate used; set a value to replace one)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {pass1.assumptions.map(item => {
                const key = item.key as keyof EstimateInputs;
                const canEdit = editable.has(item.key);
                return (
                  <label key={item.key} className="grid gap-0.5 rounded-lg border border-slate-200 bg-white p-2" htmlFor={`assumption-${item.key}`}>
                    <span className="font-semibold">{item.label}</span>
                    <span className="text-slate-500">{item.source}</span>
                    {!canEdit ? <span>{String(item.value)} (from RVTools or the brief when known)</span>
                      : typeof item.value === "boolean" ? <select id={`assumption-${item.key}`} className="w-28 rounded-md border border-slate-300 px-2 py-1" value={String(inputs[key] ?? item.value)} onChange={event => setInput(key, event.target.value === "true")}><option value="false">No</option><option value="true">Yes</option></select>
                      : typeof item.value === "string" ? <select id={`assumption-${item.key}`} className="w-40 rounded-md border border-slate-300 px-2 py-1" value={String(inputs[key] ?? item.value)} onChange={event => setInput(key, event.target.value as EstimateInputs["transitGateway"])}><option value="distributed">Distributed</option><option value="centralized">Centralized</option></select>
                      : <Input id={`assumption-${item.key}`} type="number" min={0} className="w-28" value={inputs[key] === undefined ? "" : String(inputs[key])} placeholder={String(item.value)} onChange={event => setInput(key, event.target.value === "" ? undefined : Math.max(0, Math.round(Number(event.target.value))))} />}
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
