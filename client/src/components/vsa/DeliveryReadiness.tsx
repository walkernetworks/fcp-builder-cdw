import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOperationalSettings } from "@/lib/settings";
import { trpc } from "@/lib/trpc";
import { todayIso, type TrackerRecord } from "@/lib/vsa";
import { cn } from "@/lib/utils";
import { GATE_DATES, type FcpWaiver, type GateKey } from "@shared/vsaFields";
import { authorizationCheck, type DeliveryRequirement, type StageProgression } from "@shared/vsaStage";
import { formatDay } from "@shared/vsaViews";
import { ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pill } from "./elements";

const DEFAULT_LABELS = Object.fromEntries(GATE_DATES.map(gate => [gate.key, gate.label])) as Record<GateKey, string>;
const PARTY_LABELS: Record<FcpWaiver["party"], string> = { pm: "PM", broadcom: "Broadcom" };
const REQUIREMENT_LABELS: Record<DeliveryRequirement["key"], string> = { fcp_approval: "FCP approval", work_plan: "Work plan accepted", po: "PO received" };

/**
 * What Kickoff and In Delivery need, in every segment: FCP approval (Broadcom's for Corporate and Strategic, the
 * customer's for Commercial, or a waiver), the customer's work plan acceptance, and the PO. Staffing has no gate.
 * The hours check compares the accepted work plan with the PO / work authorization.
 */
export function DeliveryReadiness({ data, progression }: { data: TrackerRecord; progression: StageProgression }) {
  const { gateLabels } = useOperationalSettings();
  const label = (gate: GateKey) => gateLabels[gate] ?? DEFAULT_LABELS[gate];
  const { record } = data;
  const met = progression.delivery.filter(requirement => requirement.met).length;
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-s100 rounded-md border border-s200">
        {progression.delivery.map(requirement => (
          <li key={requirement.key} className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-[13px]">
            <span className="min-w-0 flex-1">
              <span className="text-ink">{REQUIREMENT_LABELS[requirement.key]}</span>
              {requirement.key === "fcp_approval" && <span className="ml-1.5 text-xs text-ink-muted">{label(requirement.gate)}</span>}
            </span>
            <RequirementState requirement={requirement} day={(record as Record<string, unknown>)[requirement.gate] as string | null} waivedOn={record.fcpWaivedOn} />
            {requirement.key === "fcp_approval" && <WaiverControl data={data} />}
          </li>
        ))}
        {record.fcpWaivedOn && (
          <li className="px-3 py-2 text-xs text-ink-muted">
            Waived {formatDay(record.fcpWaivedOn)} by {record.fcpWaiverBy} ({record.fcpWaiverParty ? PARTY_LABELS[record.fcpWaiverParty] : "unknown"}). Said in: {record.fcpWaiverSource}.
            {data.waiverRecordedBy && <> Entered by {data.waiverRecordedBy}.</>} It stands in for FCP approval only, not the work plan or the PO.
          </li>
        )}
        <HoursCheck data={data} />
      </ul>
      <p className="text-xs text-ink-subtle">
        {met === 3 ? "Ready for delivery." : `${met} of 3 met.`} Kickoff and In Delivery can't be entered until all three are met. Staffing can start any time.
      </p>
    </div>
  );
}

function RequirementState({ requirement, day, waivedOn }: { requirement: DeliveryRequirement; day: string | null; waivedOn: string | null }) {
  if (requirement.waived) return <Pill verdict="ready">Waived {formatDay(waivedOn)}</Pill>;
  if (requirement.met) return <Pill verdict="ready">{formatDay(day)}</Pill>;
  return <Pill verdict="stop">{requirement.key === "po" ? "Not received" : "Not recorded"}</Pill>;
}

/** Records the waiver (who said it, which side, when, where) or removes it. */
function WaiverControl({ data }: { data: TrackerRecord }) {
  const { record } = data;
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const empty: FcpWaiver = { party: "pm", by: "", on: todayIso(), source: "" };
  const [draft, setDraft] = useState<FcpWaiver>(empty);
  const save = trpc.tracker.setFcpWaiver.useMutation({
    onSuccess: async (_result, input) => {
      toast.success(input.waiver ? "FCP waiver recorded" : "FCP waiver removed");
      setOpen(false);
      await Promise.all([utils.tracker.get.invalidate({ id: record.id }), utils.tracker.list.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });
  if (record.fcpWaivedOn) {
    return <Button size="sm" variant="ghost" className="h-7 text-state-blocked-text" disabled={save.isPending} onClick={() => save.mutate({ id: record.id, rowVersion: record.rowVersion, waiver: null })}>Remove waiver</Button>;
  }
  const ready = draft.by.trim() && draft.source.trim() && draft.on && draft.on <= todayIso();
  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); if (next) setDraft(empty); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7"><ShieldOff className="size-3.5" aria-hidden /> Record waiver</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <form className="space-y-2.5" onSubmit={event => { event.preventDefault(); if (ready) save.mutate({ id: record.id, rowVersion: record.rowVersion, waiver: { ...draft, by: draft.by.trim(), source: draft.source.trim() } }); }}>
          <div>
            <p className="text-[13px] font-medium text-ink">FCP waiver</p>
            <p className="text-xs text-ink-muted">The PM or Broadcom said FCP approval isn't required. It satisfies FCP approval only; the work plan and the PO are still needed.</p>
          </div>
          <label className="block space-y-1">
            <span className="field-label">Said by</span>
            <span className="flex gap-2">
              <select aria-label="Side" className="h-8 rounded-md border border-s200 bg-surface px-2 text-[13px] text-ink" value={draft.party} onChange={event => setDraft({ ...draft, party: event.target.value as FcpWaiver["party"] })}>
                {Object.entries(PARTY_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
              <Input aria-label="Name" value={draft.by} onChange={event => setDraft({ ...draft, by: event.target.value })} maxLength={120} placeholder="Name" className="h-8" />
            </span>
          </label>
          <label className="block space-y-1">
            <span className="field-label">Date</span>
            <Input type="date" value={draft.on} max={todayIso()} onChange={event => setDraft({ ...draft, on: event.target.value })} className="h-8" />
          </label>
          <label className="block space-y-1">
            <span className="field-label">Where it was said</span>
            <Input value={draft.source} onChange={event => setDraft({ ...draft, source: event.target.value })} maxLength={500} placeholder="e.g. Email to the PM, weekly sync notes" className="h-8" />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={!ready || save.isPending}>{save.isPending ? "Saving…" : "Record waiver"}</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

const hoursText = (value: number | null) => (value === null ? "" : String(value));

/** Work plan hours vs PO / work authorization hours, saved together. Matching hours clear the PO-before-work-plan flag. */
function HoursCheck({ data }: { data: TrackerRecord }) {
  const { record } = data;
  const utils = trpc.useUtils();
  const [workPlan, setWorkPlan] = useState(hoursText(record.workPlanHours));
  const [po, setPo] = useState(hoursText(record.poHours));
  useEffect(() => { setWorkPlan(hoursText(record.workPlanHours)); setPo(hoursText(record.poHours)); }, [record.id, record.workPlanHours, record.poHours]);
  const save = trpc.tracker.update.useMutation({
    onSuccess: async () => {
      toast.success("Hours saved");
      await Promise.all([utils.tracker.get.invalidate({ id: record.id }), utils.tracker.list.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });
  const parse = (text: string) => (text.trim() === "" ? null : /^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN);
  const next = { workPlanHours: parse(workPlan), poHours: parse(po) };
  const invalid = Number.isNaN(next.workPlanHours) || Number.isNaN(next.poHours);
  const changed = next.workPlanHours !== record.workPlanHours || next.poHours !== record.poHours;
  const check = authorizationCheck(record);
  const status =
    check?.key === "hours_mismatch" ? <Pill verdict="stop">Hours mismatch</Pill>
    : check?.key === "po_before_work_plan" ? <Pill verdict="warn">PO before work plan</Pill>
    : record.workPlanHours !== null && record.poHours !== null ? <Pill verdict="ready">Hours match</Pill>
    : null;
  return (
    <li className="space-y-1.5 px-3 py-2 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-ink">Hours check</span>
        {status}
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (!invalid && changed) save.mutate({ id: record.id, rowVersion: record.rowVersion, patch: next as { workPlanHours: number | null; poHours: number | null } }); }}>
        <label className="space-y-1">
          <span className="block text-xs text-ink-muted">Work plan hours</span>
          <Input inputMode="numeric" value={workPlan} onChange={event => setWorkPlan(event.target.value)} className={cn("h-8 w-32 tabular", Number.isNaN(next.workPlanHours) && "border-state-blocked")} aria-label="Work plan hours" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-ink-muted">PO / work authorization hours</span>
          <Input inputMode="numeric" value={po} onChange={event => setPo(event.target.value)} className={cn("h-8 w-32 tabular", Number.isNaN(next.poHours) && "border-state-blocked")} aria-label="PO / work authorization hours" />
        </label>
        <Button type="submit" size="sm" variant="outline" className="h-8" disabled={!changed || invalid || save.isPending}>{save.isPending ? "Saving…" : "Save hours"}</Button>
      </form>
      {check && <p className="text-xs text-ink-muted">{check.label}. A data-quality flag only; it blocks nothing.</p>}
    </li>
  );
}
