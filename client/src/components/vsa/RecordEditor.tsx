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

/**
 * The record's editable tracker fields as one form: per-field dirty tracking, validation, and a save that sends only
 * what changed with the record's version, so a stale save is refused. The drawer holds one instance above its tabs,
 * so edits survive switching tabs and every field has one place it is edited.
 */
export function useRecordForm(record: TrackerRecord["record"]) {
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

  return {
    form,
    original,
    errors,
    changed,
    pending: save.isPending,
    setField: (key: string, value: FormValue) => setForm(current => ({ ...current, [key]: value })),
    discard: () => { setForm(original); setErrors({}); },
    submit,
  };
}

export type RecordForm = ReturnType<typeof useRecordForm>;

/** One editable field, wired to the shared form. */
export function RecordField({ form, field, compact }: { form: RecordForm; field: FieldDef; compact?: boolean }) {
  return <FieldInput field={field} value={form.form[field.key]} error={form.errors[field.key]} dirty={form.form[field.key] !== form.original[field.key]} compact={compact} onChange={value => form.setField(field.key, value)} />;
}

/** Field groups as labeled sections that read like the record, with values that happen to be editable. */
export function RecordFieldGroups({ form, groups }: { form: RecordForm; groups: { title: string; fields: FieldDef[] }[] }) {
  return (
    <>
      {groups.map(group => (
        <fieldset key={group.title} className="space-y-3 border-t border-s100 px-6 py-4">
          <legend className="sr-only">{group.title}</legend>
          <p className="field-label" aria-hidden>{group.title}</p>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-3">
            {group.fields.map(field => <RecordField key={field.key} form={form} field={field} />)}
          </div>
        </fieldset>
      ))}
    </>
  );
}

/** Sticky at the bottom of the drawer while anything is unsaved, on whichever tab holds the change. */
export function RecordSaveBar({ form }: { form: RecordForm }) {
  if (!form.changed.length) return null;
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-s100 bg-surface/95 px-6 py-3 backdrop-blur">
      <p className="text-xs text-ink-muted">{form.changed.length} unsaved {form.changed.length === 1 ? "change" : "changes"}</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={form.pending} onClick={form.discard}>Discard</Button>
        <Button type="button" size="sm" disabled={form.pending} onClick={form.submit}>{form.pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save changes</Button>
      </div>
    </div>
  );
}

function FieldInput({ field, value, error, dirty, compact, onChange }: { field: FieldDef; value: FormValue; error?: string; dirty: boolean; compact?: boolean; onChange: (value: FormValue) => void }) {
  const id = `field-${field.key}`;
  const wide = !compact && (field.kind === "textarea" || field.kind === "url");
  const box = "h-8 w-full rounded-md border border-s100 bg-surface px-2.5 text-[13px] text-ink shadow-none transition-colors hover:border-s200 focus-visible:border-s300";
  const control = (() => {
    switch (field.kind) {
      case "bool":
        return <label className="flex h-8 items-center gap-2 text-[13px] text-ink"><input id={id} type="checkbox" className="size-4 accent-[var(--cdw-red)]" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} /> Yes</label>;
      case "enum":
        return (
          <select id={id} className={box} value={String(value)} onChange={event => onChange(event.target.value)}>
            <option value="">Not set</option>
            {Object.entries(field.options ?? {}).map(([option, label]) => <option key={option} value={option}>{label}</option>)}
          </select>
        );
      case "textarea":
        return <Textarea id={id} rows={3} className="min-h-0 rounded-md border-s100 px-2.5 text-[13px] shadow-none hover:border-s200" value={String(value)} onChange={event => onChange(event.target.value)} />;
      case "date":
        return <Input id={id} type="date" className={compact ? `${box} w-[150px]` : box} value={String(value)} onChange={event => onChange(event.target.value)} />;
      default:
        return <Input id={id} type="text" inputMode={field.kind === "money" || field.kind === "int" ? "decimal" : undefined} className={box} value={String(value)} onChange={event => onChange(event.target.value)} />;
    }
  })();
  if (compact) {
    return (
      <span className="block">
        <label htmlFor={id} className="sr-only">{field.label}</label>
        {control}
        {error && <span className="mt-1 block text-xs font-medium text-state-blocked-text">{error}</span>}
      </span>
    );
  }
  return (
    <div className={wide ? "sm:col-span-3" : undefined}>
      <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-xs text-ink-muted">
        {field.label}{field.required && <span aria-hidden>*</span>}{dirty && <span className="size-1.5 rounded-full bg-cdw-red" title="Changed" aria-label="Changed" />}
      </label>
      {control}
      {error ? <p className="mt-1 text-xs font-medium text-state-blocked-text">{error}</p> : field.hint && <p className="mt-1 text-[11px] text-ink-subtle">{field.hint}</p>}
    </div>
  );
}
