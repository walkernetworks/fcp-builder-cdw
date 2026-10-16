import { Input } from "@/components/ui/input";
import { FIELD_BY_KEY, REPORT_FIELDS, measureLabel, type ReportConfig, type ReportField, type ReportFilter, type ReportMeasure } from "@shared/vsaReports";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import type { ReactNode } from "react";
import { Chip } from "./elements";

const selectClass = "h-8 rounded-full border border-s200 bg-white px-3 text-xs font-semibold text-ink";
const GROUPS = Array.from(new Set(REPORT_FIELDS.map(field => field.group)));

function FieldSelect({ value, onChange, placeholder, fields, allowNone }: { value: string; onChange: (key: string) => void; placeholder: string; fields: ReportField[]; allowNone?: boolean }) {
  return (
    <select className={selectClass} value={value} onChange={event => onChange(event.target.value)} aria-label={placeholder}>
      <option value="">{allowNone ? "None" : placeholder}</option>
      {GROUPS.map(group => {
        const options = fields.filter(field => field.group === group);
        return options.length ? <optgroup key={group} label={group}>{options.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}</optgroup> : null;
      })}
    </select>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-s100 py-3 first:border-t-0 sm:grid-cols-[140px_1fr] sm:items-start">
      <p className="pt-1.5 text-[11px] font-extrabold uppercase tracking-[.14em] text-s500">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Defaults for a newly added filter, by field type. */
function newFilter(field: ReportField): ReportFilter {
  if (field.type === "bool") return { field: field.key, op: "is", value: true };
  if (field.labels) return { field: field.key, op: "in", values: [] };
  if (field.type === "text") return { field: field.key, op: "contains", text: "" };
  return { field: field.key, op: "between", from: null, to: null };
}

/** Columns, filters, grouping and comparison, measures, and sort for a report. */
export function ReportBuilder({ config, onChange }: { config: ReportConfig; onChange: (config: ReportConfig) => void }) {
  const set = (patch: Partial<ReportConfig>) => onChange({ ...config, ...patch });
  const dimensions = REPORT_FIELDS.filter(field => field.dimension);
  const numeric = REPORT_FIELDS.filter(field => field.type === "number" || field.type === "money");

  const moveColumn = (index: number, delta: number) => {
    const columns = [...config.columns];
    const [moved] = columns.splice(index, 1);
    columns.splice(Math.max(0, Math.min(columns.length, index + delta)), 0, moved);
    set({ columns });
  };
  const updateFilter = (index: number, filter: ReportFilter) => set({ filters: config.filters.map((current, i) => (i === index ? filter : current)) });

  return (
    <div className="rounded-xl border border-s100 bg-white px-4 py-1 shadow-[var(--shadow-card)]">
      <Row label="Columns">
        {config.columns.map((key, index) => (
          <span key={key} className="chip gap-1 pr-1">
            <button type="button" className="rounded-full p-0.5 hover:bg-s100 disabled:opacity-30" disabled={index === 0} onClick={() => moveColumn(index, -1)} aria-label={`Move ${FIELD_BY_KEY.get(key)?.label} left`}><ArrowLeft className="size-3" /></button>
            {FIELD_BY_KEY.get(key)?.label}
            <button type="button" className="rounded-full p-0.5 hover:bg-s100 disabled:opacity-30" disabled={index === config.columns.length - 1} onClick={() => moveColumn(index, 1)} aria-label={`Move ${FIELD_BY_KEY.get(key)?.label} right`}><ArrowRight className="size-3" /></button>
            <button type="button" className="rounded-full p-0.5 hover:bg-s100 disabled:opacity-30" disabled={config.columns.length === 1} onClick={() => set({ columns: config.columns.filter(column => column !== key) })} aria-label={`Remove ${FIELD_BY_KEY.get(key)?.label}`}><X className="size-3" /></button>
          </span>
        ))}
        <FieldSelect value="" placeholder="Add a column…" fields={REPORT_FIELDS.filter(field => !config.columns.includes(field.key))} onChange={key => key && set({ columns: [...config.columns, key] })} />
      </Row>

      <Row label="Filters">
        {config.filters.map((filter, index) => {
          const field = FIELD_BY_KEY.get(filter.field)!;
          return (
            <span key={`${filter.field}-${index}`} className="flex flex-wrap items-center gap-1.5 rounded-xl border border-s200 bg-s50 py-1 pl-3 pr-1 text-xs">
              <strong className="font-bold text-ink">{field.label}</strong>
              <select className={selectClass} value={filter.op} aria-label={`${field.label} condition`} onChange={event => {
                const op = event.target.value as ReportFilter["op"];
                updateFilter(index, op === "empty" || op === "notEmpty" ? { field: field.key, op } : newFilter(field));
              }}>
                {field.type === "bool" ? <option value="is">is</option> : field.labels ? <option value="in">is any of</option> : field.type === "text" ? <option value="contains">contains</option> : <option value="between">between</option>}
                <option value="empty">is empty</option>
                <option value="notEmpty">has a value</option>
              </select>
              {filter.op === "is" && <select className={selectClass} value={String(filter.value)} onChange={event => updateFilter(index, { ...filter, value: event.target.value === "true" })} aria-label={`${field.label} value`}><option value="true">Yes</option><option value="false">No</option></select>}
              {filter.op === "contains" && <Input className="h-8 w-40 rounded-full text-xs" value={filter.text} onChange={event => updateFilter(index, { ...filter, text: event.target.value })} aria-label={`${field.label} text`} />}
              {filter.op === "between" && (
                <>
                  <Input type={field.type === "date" ? "date" : "number"} className="h-8 w-36 rounded-full text-xs" value={filter.from ?? ""} onChange={event => updateFilter(index, { ...filter, from: event.target.value || null })} aria-label={`${field.label} from`} />
                  <span className="text-ink-muted">and</span>
                  <Input type={field.type === "date" ? "date" : "number"} className="h-8 w-36 rounded-full text-xs" value={filter.to ?? ""} onChange={event => updateFilter(index, { ...filter, to: event.target.value || null })} aria-label={`${field.label} to`} />
                </>
              )}
              {filter.op === "in" && field.labels && (
                <span className="flex flex-wrap gap-1">
                  {[...Object.entries(field.labels), ["", "Not set"] as const].map(([value, name]) => (
                    <Chip key={value} pressed={filter.values.includes(value)} onClick={() => updateFilter(index, { ...filter, values: filter.values.includes(value) ? filter.values.filter(v => v !== value) : [...filter.values, value] })}>{name}</Chip>
                  ))}
                </span>
              )}
              <button type="button" className="rounded-full p-1 hover:bg-s100" onClick={() => set({ filters: config.filters.filter((_, i) => i !== index) })} aria-label={`Remove the ${field.label} filter`}><X className="size-3.5" /></button>
            </span>
          );
        })}
        <FieldSelect value="" placeholder="Add a filter…" fields={REPORT_FIELDS} onChange={key => key && set({ filters: [...config.filters, newFilter(FIELD_BY_KEY.get(key)!)] })} />
        <Chip pressed={config.includeClosed} onClick={() => set({ includeClosed: !config.includeClosed })}>Include Complete, Refused, and Lost</Chip>
      </Row>

      <Row label="Group and compare">
        <span className="text-xs text-ink-muted">Group by</span>
        <FieldSelect value={config.groupBy ?? ""} placeholder="Group by" allowNone fields={dimensions} onChange={key => set({ groupBy: key || null, compareBy: key ? config.compareBy : null })} />
        <span className="text-xs text-ink-muted">compared across</span>
        <FieldSelect value={config.compareBy ?? ""} placeholder="Compare across" allowNone fields={dimensions.filter(field => field.key !== config.groupBy)} onChange={key => set({ compareBy: key || null })} />
        {!config.groupBy && <span className="text-xs text-ink-muted">Choose a grouping to see totals by group and a chart.</span>}
      </Row>

      <Row label="Measures">
        {config.measures.map((m, index) => (
          <span key={`${m.kind}-${m.field}-${index}`} className="chip gap-1 pr-1">
            {measureLabel(m)}
            <button type="button" className="rounded-full p-0.5 hover:bg-s100 disabled:opacity-30" disabled={config.measures.length === 1} onClick={() => set({ measures: config.measures.filter((_, i) => i !== index) })} aria-label={`Remove ${measureLabel(m)}`}><X className="size-3" /></button>
          </span>
        ))}
        <select className={selectClass} value="" aria-label="Add a measure" onChange={event => {
          if (!event.target.value) return;
          const [kind, field] = event.target.value.split(":") as [ReportMeasure["kind"], string];
          set({ measures: [...config.measures, { kind, field: field || null }] });
        }}>
          <option value="">Add a measure…</option>
          {!config.measures.some(m => m.kind === "count") && <option value="count:">Count of engagements</option>}
          {(["sum", "avg", "min", "max"] as const).map(kind => (
            <optgroup key={kind} label={{ sum: "Total", avg: "Average", min: "Lowest", max: "Highest" }[kind]}>
              {numeric.map(field => <option key={field.key} value={`${kind}:${field.key}`}>{field.label}</option>)}
            </optgroup>
          ))}
        </select>
        <span className="text-xs text-ink-muted">Totals of VSA amount count each alternative-plan group once.</span>
      </Row>

      <Row label="Sort">
        <FieldSelect value={config.sort?.field ?? ""} placeholder="Sort by" allowNone fields={REPORT_FIELDS} onChange={key => set({ sort: key ? { field: key, dir: config.sort?.dir ?? "asc" } : null })} />
        {config.sort && (
          <select className={selectClass} value={config.sort.dir} onChange={event => set({ sort: { field: config.sort!.field, dir: event.target.value as "asc" | "desc" } })} aria-label="Sort direction">
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        )}
      </Row>
    </div>
  );
}
