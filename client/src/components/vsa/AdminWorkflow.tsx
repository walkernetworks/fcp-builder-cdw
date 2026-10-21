import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { applySettingChanges, DEFAULT_OPERATIONAL_SETTINGS, type AppSettingValue } from "@shared/appSettings";
import type { inferRouterOutputs } from "@trpc/server";
import { Code2, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../../server/routers";
import { dayOf } from "./AdminUsers";
import { Chip, DataMount, Panel } from "./elements";

type SettingsData = inferRouterOutputs<AppRouter>["admin"]["settings"]["list"];
type Setting = SettingsData["settings"][number];

/** A draft value as typed: days are numbers once parsed (NaN when blank), labels stay text. */
function parse(setting: Setting, text: string): AppSettingValue {
  if (setting.kind === "label") return text;
  return text.trim() === "" ? Number.NaN : Number(text);
}

/**
 * Workflow parameters: the thresholds behind stale stages, the work plan warning and the expiry bands, and the gate
 * display labels. Thresholds and labels only; the stage sequence and gate applicability stay in code.
 */
export function AdminWorkflow() {
  const list = trpc.admin.settings.list.useQuery();
  return (
    <div className="space-y-4">
      <p className="callout-dark flex items-start gap-2">
        <Code2 className="mt-0.5 size-3.5 shrink-0 text-ink-muted" aria-hidden />
        <span>
          <strong className="font-semibold">Thresholds and labels only.</strong> The stage sequence, and which gates apply to each segment, are defined in
          code (<code className="text-xs">shared/vsaStage.ts</code>). They change through a code and review update, not here.
        </span>
      </p>
      <DataMount id="admin-workflow" query={list} isEmpty={data => data.settings.length === 0} empty={{ icon: SlidersHorizontal, title: "No parameters", sub: "This build defines no workflow parameters." }}>
        {data => <WorkflowForm data={data} />}
      </DataMount>
    </div>
  );
}

function WorkflowForm({ data }: { data: SettingsData }) {
  const utils = trpc.useUtils();
  const saved = useMemo(() => Object.fromEntries(data.settings.map(setting => [setting.key, String(setting.value)])), [data]);
  const [draft, setDraft] = useState<Record<string, string>>(saved);
  useEffect(() => setDraft(saved), [saved]);

  const dirty = data.settings.filter(setting => draft[setting.key] !== saved[setting.key]);
  const changes = Object.fromEntries(dirty.map(setting => [setting.key, parse(setting, draft[setting.key])]));
  // The same validation the server runs, so a problem shows next to its field before saving.
  const check = applySettingChanges(DEFAULT_OPERATIONAL_SETTINGS, { ...Object.fromEntries(data.settings.map(setting => [setting.key, setting.value])), ...changes });
  const errors = check.ok ? {} : check.errors;

  const save = trpc.admin.settings.update.useMutation({
    onSuccess: async result => {
      toast.success(result.changed.length ? `Saved ${result.changed.length} ${result.changed.length === 1 ? "parameter" : "parameters"}` : "Nothing changed");
      await Promise.all([utils.admin.settings.list.invalidate(), utils.settings.operational.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      {data.groups.map(group => {
        const members = data.settings.filter(setting => setting.group === group.id);
        const labels = members[0]?.kind === "label";
        return (
          <Panel key={group.id} title={group.label} sub={group.description}>
            <div className="overflow-x-auto">
              {/* Fixed columns, so the groups line up. */}
              <table className="tbl table-fixed">
                <thead>
                  <tr>
                    <th className="w-[28%]">{group.id === "stale" ? "Stage" : labels ? "Gate" : "Parameter"}</th>
                    <th className="w-[320px]">{labels ? "Label" : "Days"}</th>
                    <th className="w-[22%]">Default</th>
                    <th className="pl-6">Last changed</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(setting => (
                    <SettingRow key={setting.key} setting={setting} value={draft[setting.key] ?? ""} error={errors[setting.key]} dirty={draft[setting.key] !== saved[setting.key]} onChange={value => setDraft({ ...draft, [setting.key]: value })} />
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-md border border-s100 bg-surface/95 px-4 py-3 backdrop-blur">
        <p className="mr-auto text-xs text-ink-muted">
          {dirty.length ? `${dirty.length} unsaved ${dirty.length === 1 ? "change" : "changes"}` : "Every screen uses these values. A parameter that is not stored uses its default."}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setDraft(saved)} disabled={!dirty.length || save.isPending}>Discard</Button>
        <Button size="sm" onClick={() => save.mutate({ values: changes })} disabled={!dirty.length || !check.ok || save.isPending}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function SettingRow({ setting, value, error, dirty, onChange }: { setting: Setting; value: string; error?: string; dirty: boolean; onChange: (value: string) => void }) {
  const id = `setting-${setting.key}`;
  const isLabel = setting.kind === "label";
  const isDefault = isLabel ? value.trim() === setting.defaultValue : Number(value) === setting.defaultValue;
  return (
    <tr>
      <td><label htmlFor={id} className="font-medium">{setting.label}</label></td>
      <td>
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type={isLabel ? "text" : "number"}
            inputMode={isLabel ? undefined : "numeric"}
            min={isLabel ? undefined : setting.min}
            max={isLabel ? undefined : setting.max}
            maxLength={isLabel ? setting.max : undefined}
            step={isLabel ? undefined : 1}
            value={value}
            onChange={event => onChange(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-help`}
            className={`h-8 ${isLabel ? "w-64" : "w-24 tabular"} ${dirty ? "border-s400" : ""}`}
          />
          {dirty && !error && <Chip>Edited</Chip>}
        </div>
        <p id={`${id}-help`} className={`mt-1 text-xs ${error ? "text-state-blocked-text" : "sr-only"}`}>
          {error ?? (isLabel ? `Up to ${setting.max} characters` : `${setting.min} to ${setting.max} days`)}
        </p>
      </td>
      <td className="text-ink-muted">
        {isDefault ? <span className={isLabel ? "" : "tabular"}>{String(setting.defaultValue)}</span> : (
          <button type="button" className="text-left underline-offset-2 hover:text-ink hover:underline" onClick={() => onChange(String(setting.defaultValue))} title="Use the default">
            {String(setting.defaultValue)}
          </button>
        )}
        {!isLabel && <span className="ml-1.5 text-xs text-ink-subtle">({setting.min} to {setting.max})</span>}
      </td>
      <td className="whitespace-nowrap pl-6 text-xs text-ink-muted">
        {setting.updatedByName ? `${dayOf(setting.updatedAt)} · ${setting.updatedByName}` : setting.stored ? "Seeded from the code default" : <span className="text-ink-subtle">Not stored · default applies</span>}
      </td>
    </tr>
  );
}
