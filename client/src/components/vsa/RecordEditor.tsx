import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import type { TrackerRecord } from "@/lib/vsa";
import { FIELD_GROUPS, type FieldDef } from "@/lib/vsaLabels";
import { OPPORTUNITY_NUMBER_PATTERN, type TrackerPatch } from "@shared/vsaFields";
import { Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type FormValue = string | boolean;
type Form = Record<string, FormValue>;

const ALL_FIELDS = FIELD_GROUPS.flatMap(group => group.fields);

function toForm(record: TrackerRecord["record"]): Form {
  return Object.fromEntries(ALL_FIELDS.map(field => {
    const value = (record as Record<string, unknown>)[field.key];
    return [field.key, field.kind === "bool" ? Boolean(value) : value === null || value === undefined ? "" : String(value)];
  }));
}

/** Converts one form value to what the server stores, or returns an error message. */
function toPatchValue(field: FieldDef, value: FormValue): { value: unknown } | { error: string } {
  if (field.kind === "bool") return { value: Boolean(value) };
  const text = String(value).trim();
  if (!text) return field.required ? { error: "Required" } : { value: null };
  switch (field.kind) {
    case "money": {
      const digits = text.replace(/[$,\s]/g, "");
      return /^\d{1,12}(\.\d{1,2})?$/.test(digits) ? { value: Number(digits).toFixed(2) } : { error: "Use a dollar amount like 125000.00" };
    }
    case "int":
      return /^\d+$/.test(text) ? { value: Number(text) } : { error: "Use a whole number" };
    case "url":
      return /^https:\/\/\S+$/.test(text) ? { value: text } : { error: "Use an https:// link" };
    case "text":
      if (field.key === "opportunityNumber") return OPPORTUNITY_NUMBER_PATTERN.test(text.toUpperCase()) ? { value: text.toUpperCase() } : { error: "Use a C-OPP- number (AWC-OPP placeholders are not valid)" };
      return { value: text };
    default:
      return { value: text };
  }
}

/** Edits every tracker field directly. Saves only what changed, with the record's version so a stale save is refused. */
export function RecordEditor({ data }: { data: TrackerRecord }) {
  const { record } = data;
  const utils = trpc.useUtils();
  const original = useMemo(() => toForm(record), [record]);
  const [form, setForm] = useState<Form>(original);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { setForm(original); setErrors({}); }, [record.id, record.rowVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = ALL_FIELDS.filter(field => form[field.key] !== original[field.key]);
  const save = trpc.tracker.update.useMutation({
    onSuccess: async () => {
      toast.success("Saved");
      // An open FCP workspace re-reads the record so a rename reaches its title and customer name.
      await Promise.all([utils.tracker.get.invalidate({ id: record.id }), utils.tracker.list.invalidate(), utils.engagement.list.invalidate(), utils.engagement.get.invalidate({ id: record.id })]);
    },
    onError: error => toast.error(error.message),
  });

  function submit() {
    const patch: Record<string, unknown> = {};
    const nextErrors: Record<string, string> = {};
    for (const field of changed) {
      const result = toPatchValue(field, form[field.key]);
      if ("error" in result) nextErrors[field.key] = result.error;
      else patch[field.key] = result.value;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return void toast.error("Fix the highlighted fields before saving.");
    save.mutate({ id: record.id, rowVersion: record.rowVersion, patch: patch as TrackerPatch });
  }

  return (
    <form className="divide-y divide-s100" onSubmit={event => { event.preventDefault(); submit(); }}>
      {FIELD_GROUPS.map(group => (
        <fieldset key={group.title} className="space-y-3 bg-white px-5 py-4">
          <legend className="sr-only">{group.title}</legend>
          <p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-s500" aria-hidden>{group.title}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.fields.map(field => (
              <FieldInput key={field.key} field={field} value={form[field.key]} error={errors[field.key]} dirty={form[field.key] !== original[field.key]} onChange={value => setForm(current => ({ ...current, [field.key]: value }))} />
            ))}
          </div>
        </fieldset>
      ))}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-s100 bg-white px-5 py-3">
        <p className="text-xs text-ink-muted">{changed.length ? `${changed.length} unsaved ${changed.length === 1 ? "change" : "changes"}` : "No changes"}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!changed.length || save.isPending} onClick={() => { setForm(original); setErrors({}); }}>Discard</Button>
          <Button type="submit" size="sm" disabled={!changed.length || save.isPending}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save changes</Button>
        </div>
      </div>
    </form>
  );
}

function FieldInput({ field, value, error, dirty, onChange }: { field: FieldDef; value: FormValue; error?: string; dirty: boolean; onChange: (value: FormValue) => void }) {
  const id = `field-${field.key}`;
  const wide = field.kind === "textarea" || field.kind === "url";
  const control = (() => {
    switch (field.kind) {
      case "bool":
        return <label className="flex h-9 items-center gap-2 text-sm text-ink"><input id={id} type="checkbox" className="size-4 accent-[var(--cdw-red)]" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} /> Yes</label>;
      case "enum":
        return (
          <select id={id} className="h-9 w-full rounded-full border border-s200 bg-white px-3 text-sm text-ink" value={String(value)} onChange={event => onChange(event.target.value)}>
            <option value="">Not set</option>
            {Object.entries(field.options ?? {}).map(([option, label]) => <option key={option} value={option}>{label}</option>)}
          </select>
        );
      case "textarea":
        return <Textarea id={id} rows={3} className="rounded-xl" value={String(value)} onChange={event => onChange(event.target.value)} />;
      case "date":
        return <Input id={id} type="date" className="h-9 rounded-full" value={String(value)} onChange={event => onChange(event.target.value)} />;
      default:
        return <Input id={id} type="text" inputMode={field.kind === "money" || field.kind === "int" ? "decimal" : undefined} className="h-9 rounded-full" value={String(value)} onChange={event => onChange(event.target.value)} />;
    }
  })();
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-cool-8">
        {field.label}{field.required && <span aria-hidden>*</span>}{dirty && <span className="size-1.5 rounded-full bg-cdw-red" title="Changed" aria-label="Changed" />}
      </label>
      {control}
      {error ? <p className="mt-1 text-xs font-semibold text-state-blocked-text">{error}</p> : field.hint && <p className="mt-1 text-[11px] text-ink-muted">{field.hint}</p>}
    </div>
  );
}
