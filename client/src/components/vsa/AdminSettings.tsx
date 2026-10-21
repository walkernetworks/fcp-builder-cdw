import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { applySettingChanges, DEFAULT_OPERATIONAL_SETTINGS } from "@shared/appSettings";
import { formatDay } from "@shared/vsaViews";
import type { inferRouterOutputs } from "@trpc/server";
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../../server/routers";
import { Chip, DataMount, Panel } from "./elements";

type SettingsData = inferRouterOutputs<AppRouter>["admin"]["settings"]["list"];
type Setting = SettingsData["settings"][number];

const dayOf = (value: Date | string | null) => (value ? formatDay(new Date(value).toISOString().slice(0, 10)) : "—");

/** Operational settings: the thresholds behind stale stages, the work plan warning, and the expiry bands. */
export function AdminSettings() {
  const list = trpc.admin.settings.list.useQuery();
  return (
    <DataMount id="admin-settings" query={list} isEmpty={data => data.settings.length === 0} empty={{ icon: SlidersHorizontal, title: "No settings", sub: "This build defines no operational settings." }}>
      {data => <SettingsForm data={data} />}
    </DataMount>
  );
}

function SettingsForm({ data }: { data: SettingsData }) {
  const utils = trpc.useUtils();
  const saved = useMemo(() => Object.fromEntries(data.settings.map(setting => [setting.key, String(setting.value)])), [data]);
  const [draft, setDraft] = useState<Record<string, string>>(saved);
  useEffect(() => setDraft(saved), [saved]);

  const dirty = data.settings.filter(setting => draft[setting.key] !== saved[setting.key]);
  // The same validation the server runs, so problems show next to the field before saving.
  const changes = Object.fromEntries(dirty.map(setting => [setting.key, draft[setting.key].trim() === "" ? Number.NaN : Number(draft[setting.key])]));
  const check = applySettingChanges(DEFAULT_OPERATIONAL_SETTINGS, { ...Object.fromEntries(data.settings.map(setting => [setting.key, setting.value])), ...changes });
  const errors = check.ok ? {} : check.errors;

  const save = trpc.admin.settings.update.useMutation({
    onSuccess: async result => {
      toast.success(result.changed.length ? `Saved ${result.changed.length} ${result.changed.length === 1 ? "setting" : "settings"}` : "Nothing changed");
      await Promise.all([utils.admin.settings.list.invalidate(), utils.settings.operational.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      {data.groups.map(group => (
        <Panel key={group.id} title={group.label} sub={group.description}>
          <div className="overflow-x-auto">
            {/* Fixed columns, so the three groups line up. */}
            <table className="tbl table-fixed">
              <thead>
                <tr>
                  <th className="w-[30%]">{group.id === "stale" ? "Stage" : "Setting"}</th>
                  <th className="w-[200px]">Days</th>
                  <th className="num w-[100px]">Default</th>
                  <th className="num w-[130px]">Allowed</th>
                  <th className="pl-8">Last changed</th>
                </tr>
              </thead>
              <tbody>
                {data.settings.filter(setting => setting.group === group.id).map(setting => (
                  <SettingRow key={setting.key} setting={setting} value={draft[setting.key] ?? ""} error={errors[setting.key]} dirty={draft[setting.key] !== saved[setting.key]} onChange={value => setDraft({ ...draft, [setting.key]: value })} />
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-s100 bg-s50/95 py-3 backdrop-blur">
        <p className="mr-auto text-xs text-ink-muted">
          {dirty.length ? `${dirty.length} unsaved ${dirty.length === 1 ? "change" : "changes"}` : "Every screen uses these values. A value that is not stored uses its default."}
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
  return (
    <tr>
      <td><label htmlFor={id} className="font-medium">{setting.label}</label></td>
      <td>
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={setting.min}
            max={setting.max}
            step={1}
            value={value}
            onChange={event => onChange(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={`h-8 w-24 tabular ${dirty ? "border-s400" : ""}`}
          />
          {dirty && !error && <Chip>Edited</Chip>}
        </div>
        {error && <p id={`${id}-error`} className="mt-1 text-xs text-state-blocked-text">{error}</p>}
      </td>
      <td className="num">
        {Number(value) === setting.defaultValue ? setting.defaultValue : (
          <button type="button" className="text-ink-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => onChange(String(setting.defaultValue))} title="Use the default">
            {setting.defaultValue}
          </button>
        )}
      </td>
      <td className="num text-ink-muted">{setting.min} to {setting.max}</td>
      <td className="whitespace-nowrap pl-8 text-xs text-ink-muted">
        {setting.updatedByName ? `${dayOf(setting.updatedAt)} · ${setting.updatedByName}` : setting.stored ? "Seeded from the code default" : <span className="text-ink-subtle">Not stored · default applies</span>}
      </td>
    </tr>
  );
}
