import { ProvenancePill } from "@/components/fcp/Provenance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/vsa/elements";
import { trpc } from "@/lib/trpc";
import { withLatestConsumption, type ConsumptionPoint } from "@shared/consumption";
import type { EngagementDocument } from "@shared/fcp";
import { fundingProvenance } from "@shared/provenance";
import { History, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const hours = (value: number) => (Math.round(value * 100) / 100).toLocaleString("en-US");
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Hours consumed, as a history: anyone in the workspace records an entry, logged with who entered it. The latest
 * entry is what the FCP prints, through the document's hours consumed and its date, so the burndown moves on the next
 * export or issue without a re-issue. Append-only: a correction is a new entry.
 */
export function ConsumptionHistory({ engagementId, document, onChange, readOnly, bsasOnly }: { engagementId: number; document: EngagementDocument; onChange: (document: EngagementDocument) => void; readOnly: boolean; bsasOnly: boolean }) {
  const utils = trpc.useUtils();
  const entries = trpc.fcpRecord.consumption.useQuery({ id: engagementId });
  const add = trpc.fcpRecord.addConsumption.useMutation();
  const [draft, setDraft] = useState({ asOf: today(), hours: "", note: "" });
  const { entitlement } = document.report;
  const rows = entries.data ?? [];
  const latest: ConsumptionPoint | null = rows[0] ? { asOf: rows[0].asOf, consumedHours: rows[0].consumedHours } : null;
  const printsLatest = latest !== null && entitlement.consumedAsOf === latest.asOf && entitlement.hoursConsumed === latest.consumedHours;
  const legacy = rows.length === 0 && entitlement.hoursConsumed !== null && entitlement.consumedAsOf !== null;

  const record = async (point: ConsumptionPoint, note: string | null) => {
    try {
      await add.mutateAsync({ id: engagementId, asOf: point.asOf, consumedHours: point.consumedHours, note });
      await utils.fcpRecord.consumption.invalidate({ id: engagementId });
      onChange(withLatestConsumption(document, point));
      setDraft({ asOf: today(), hours: "", note: "" });
      toast.success("Consumption recorded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Consumption was not recorded");
    }
  };
  const draftHours = draft.hours === "" ? null : Number(draft.hours);
  const canAdd = !readOnly && !add.isPending && /^\d{4}-\d{2}-\d{2}$/.test(draft.asOf) && draftHours !== null && Number.isFinite(draftHours) && draftHours >= 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">{bsasOnly ? "BSAS hours consumed" : "Hours consumed"}: {entitlement.hoursConsumed === null ? "none recorded" : `${hours(entitlement.hoursConsumed)} as of ${entitlement.consumedAsOf ?? "an unknown date"}`}</p>
          <ProvenancePill provenance={fundingProvenance(document).hoursConsumed} />
        </div>
        {latest && !printsLatest && !readOnly && <Button variant="outline" size="sm" onClick={() => onChange(withLatestConsumption(document, latest, true))}>Use the latest entry ({hours(latest.consumedHours)} as of {latest.asOf})</Button>}
      </div>
      <p className="text-xs leading-5 text-s400">A different number from the entitled hours, from a different source: CDW's consumption records. The latest entry drives the burndown and weekly pace. Entries are never edited; record a new one to correct.</p>

      <div className="grid items-end gap-3 md:grid-cols-[10rem_10rem_minmax(0,1fr)_auto]">
        <div className="space-y-1"><Label htmlFor="consumption-as-of" className="text-xs">As of</Label><Input id="consumption-as-of" type="date" value={draft.asOf} onChange={event => setDraft({ ...draft, asOf: event.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="consumption-hours" className="text-xs">Hours consumed to date</Label><Input id="consumption-hours" type="number" min={0} step="0.5" value={draft.hours} onChange={event => setDraft({ ...draft, hours: event.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="consumption-note" className="text-xs">Note (optional)</Label><Input id="consumption-note" maxLength={2000} value={draft.note} placeholder="Where the figure comes from" onChange={event => setDraft({ ...draft, note: event.target.value })} /></div>
        <Button size="sm" disabled={!canAdd} onClick={() => void record({ asOf: draft.asOf, consumedHours: draftHours ?? 0 }, draft.note.trim() || null)}>{add.isPending && <Loader2 className="size-4 animate-spin" />} Record</Button>
      </div>

      {legacy && !readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-s100 bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
          <span>{hours(entitlement.hoursConsumed!)} hours as of {entitlement.consumedAsOf} were entered by hand before the history began.</span>
          <Button variant="outline" size="sm" className="h-7" onClick={() => void record({ asOf: entitlement.consumedAsOf!, consumedHours: entitlement.hoursConsumed! }, "Entered before the consumption history began")}>Record it as the first entry</Button>
        </div>
      )}

      <details className="rounded-lg border border-s100">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-ink"><History className="size-3.5 text-ink-muted" /> Consumption history ({rows.length})</summary>
        {entries.isLoading ? <p className="px-3 py-2 text-xs text-ink-muted">Loading…</p> : rows.length === 0 ? <div className="p-3"><EmptyState title="No consumption recorded yet" sub="Record the hours consumed to date as of a day; each entry is kept." /></div> : (
          <table className="tbl w-full text-xs">
            <thead><tr className="text-left text-[11px]"><th className="px-3 py-1.5">As of</th><th className="px-3 py-1.5 text-right">Hours</th><th className="px-3 py-1.5">Source</th><th className="px-3 py-1.5">Entered by</th><th className="px-3 py-1.5">Note</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.id} className="border-b border-s100"><td className="px-3 py-1.5 text-ink">{row.asOf}</td><td className="px-3 py-1.5 text-right tabular-nums text-ink">{hours(row.consumedHours)}</td><td className="px-3 py-1.5 text-ink-muted">{row.source === "manual" ? "Entered by hand" : "Salesforce"}</td><td className="px-3 py-1.5 text-ink-muted">{row.enteredByName ?? "—"} · {new Date(row.createdAt).toLocaleDateString("en-US")}</td><td className="px-3 py-1.5 text-ink-muted">{row.note ?? ""}</td></tr>)}</tbody>
          </table>
        )}
      </details>
    </div>
  );
}
