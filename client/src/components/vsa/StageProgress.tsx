import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOperationalSettings } from "@/lib/settings";
import { todayIso } from "@/lib/vsa";
import { cn } from "@/lib/utils";
import type { GateKey } from "@shared/vsaFields";
import { GATE_DATES } from "@shared/vsaFields";
import { STAGE_LABELS, type GateRow, type NextAction, type StageProgression, type StageStep } from "@shared/vsaStage";
import { formatDay } from "@shared/vsaViews";
import { ArrowRight, Check, ChevronDown, CircleDot, Lock, Pencil, PauseCircle, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Chip, Pill } from "./elements";

/** Saves one gate date now (null clears it). Comes from the record form, so other unsaved edits survive. */
export type SaveGate = (gate: GateKey, day: string | null, message: string) => void;

const DEFAULT_LABELS = Object.fromEntries(GATE_DATES.map(gate => [gate.key, gate.label])) as Record<GateKey, string>;

function useGateLabel() {
  const { gateLabels } = useOperationalSettings();
  return (gate: GateKey) => gateLabels[gate] ?? DEFAULT_LABELS[gate];
}

/** "YYYY-MM-DD" <-> a local Date, for the calendar. Business dates have no time zone. */
const toDate = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
};
const toDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** The next action: the next gate to record, what unblocks the next stage, or the move the record is ready for. */
export function NextActionCallout({ progression, onSave, saving, onSuggestMove }: { progression: StageProgression; onSave: SaveGate; saving: boolean; onSuggestMove: (stage: StageStep["stage"]) => void }) {
  const label = useGateLabel();
  const next: NextAction = progression.next;
  const row = (gate: GateKey) => progression.steps.flatMap(step => step.gates).find(item => item.gate === gate);
  let body: ReactNode;
  let action: ReactNode = null;
  let tone = "callout-dark";
  switch (next.kind) {
    case "record":
      body = <><strong className="font-semibold">Next: record {label(next.gate)}.</strong> It is the open gate in {STAGE_LABELS[next.stage]}.</>;
      action = <MarkDone gate={row(next.gate)!} onSave={onSave} saving={saving} />;
      break;
    case "unblock": {
      const trailing = next.requirement === "fcp_approval" ? progression.trailing : null;
      tone = trailing?.severity === "warn" ? "callout-amber" : "callout-red";
      const why =
        next.requirement === "po" ? `${STAGE_LABELS[next.stage]} can't start without the PO.`
        : next.requirement === "work_plan" ? `${STAGE_LABELS[next.stage]} can't start until the customer accepts the work plan.`
        : `${STAGE_LABELS[next.stage]} can't start until the FCP is approved, or the PM or Broadcom waives it.`;
      body = trailing
        ? <><strong className="font-semibold">FCP trailing.</strong> Staffing is ahead of the FCP. Next for the FCP: record {label(next.gate)}. {why}</>
        : <><strong className="font-semibold">Next: record {label(next.gate)}.</strong> {why}</>;
      action = <MarkDone gate={row(next.gate)!} onSave={onSave} saving={saving} />;
      break;
    }
    case "move":
      body = <><strong className="font-semibold">Gates recorded.</strong> Next: move to {STAGE_LABELS[next.stage]}.</>;
      action = <Button size="sm" variant="outline" onClick={() => onSuggestMove(next.stage)}>Move to {STAGE_LABELS[next.stage]} <ArrowRight className="size-3.5" aria-hidden /></Button>;
      break;
    case "resume":
      body = <><strong className="font-semibold">Paused.</strong> {next.stage ? `Resume to ${STAGE_LABELS[next.stage]} with Move stage.` : "Resume with Move stage; a resume to a different stage needs a note."}</>;
      if (next.stage && next.stage !== "paused" && next.stage !== "refused" && next.stage !== "lost") {
        const stage = next.stage;
        action = <Button size="sm" variant="outline" onClick={() => onSuggestMove(stage as StageStep["stage"])}>Resume <ArrowRight className="size-3.5" aria-hidden /></Button>;
      }
      break;
    case "closed":
      body = <><strong className="font-semibold">Closed as {STAGE_LABELS[next.stage]}.</strong> Reopening it is a stage move with a note.</>;
      break;
    case "complete":
      body = <><strong className="font-semibold">Complete.</strong> Every stage is done.</>;
      break;
  }
  return (
    <div className={cn(tone, "flex flex-wrap items-center gap-x-3 gap-y-2")}>
      <p className="min-w-0 flex-1">{body}</p>
      {action}
    </div>
  );
}

/** The stages that apply to this record's segment as a vertical stepper, each with its gates. */
export function StageStepper({ progression, stageEnteredOn, onSave, saving }: { progression: StageProgression; stageEnteredOn: string; onSave: SaveGate; saving: boolean }) {
  const { steps, exit } = progression;
  return (
    <ol className="relative" aria-label="Stages">
      {steps.map((step, index) => (
        <StepItem key={step.stage} step={step} last={index === steps.length - 1} exitHere={exit && exit.from === step.stage ? exit.stage : null} stageEnteredOn={stageEnteredOn} trailingTone={progression.trailing?.severity ?? null} onSave={onSave} saving={saving} />
      ))}
      {exit && !exit.from && (
        <li className="mt-2 flex items-center gap-2 text-[13px] text-ink-muted"><ExitIcon stage={exit.stage} /> {STAGE_LABELS[exit.stage]}; the stage it left from isn't in the history.</li>
      )}
    </ol>
  );
}

function ExitIcon({ stage }: { stage: "refused" | "paused" | "lost" }) {
  return stage === "paused" ? <PauseCircle className="size-4 text-state-warn" aria-hidden /> : <XCircle className="size-4 text-ink-muted" aria-hidden />;
}

function StepItem({ step, last, exitHere, stageEnteredOn, trailingTone, onSave, saving }: { step: StageStep; last: boolean; exitHere: "refused" | "paused" | "lost" | null; stageEnteredOn: string; trailingTone: "stop" | "warn" | null; onSave: SaveGate; saving: boolean }) {
  const current = step.status === "current";
  const done = step.status === "done";
  const recorded = step.gates.filter(gate => gate.done && !gate.planned).length;
  const counted = step.gates.filter(gate => !gate.planned).length;
  return (
    <li className="relative grid grid-cols-[24px_1fr] gap-x-3 pb-3 last:pb-0" aria-current={current ? "step" : undefined}>
      {!last && <span aria-hidden className={cn("absolute left-[11px] top-6 bottom-0 w-px", done ? "bg-ink-muted" : "bg-s100")} />}
      <span aria-hidden className={cn(
        "relative z-[1] mt-0.5 grid size-6 place-items-center rounded-full border text-[11px]",
        done && "border-ink-muted bg-ink-muted text-surface",
        current && !exitHere && "border-cdw-red bg-surface text-cdw-red-text shadow-[0_0_0_3px_var(--accent-soft)]",
        current && exitHere && "border-s300 bg-surface text-ink-muted",
        step.status === "upcoming" && "border-s200 bg-surface text-ink-subtle",
      )}>
        {done ? <Check className="size-3.5" /> : current ? (exitHere ? <ExitIcon stage={exitHere} /> : <CircleDot className="size-3.5" />) : null}
      </span>
      <div className={cn("min-w-0", step.status === "upcoming" && "opacity-70")}>
        <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-[13px]", current ? "font-semibold text-ink" : done ? "font-medium text-ink" : "text-ink-muted")}>{STAGE_LABELS[step.stage]}</span>
          {current && !exitHere && <Chip>Current · since {formatDay(stageEnteredOn)}</Chip>}
          {exitHere && <Chip>{STAGE_LABELS[exitHere]} from here</Chip>}
          {counted > 0 && <span className="ml-auto text-xs text-ink-subtle tabular">{recorded} of {counted}</span>}
        </div>
        {step.gates.length > 0 ? (
          <ul className={cn("mt-1 divide-y divide-s100 rounded-md border", current ? "border-s200 bg-surface" : "border-s100 bg-surface")}>
            {step.gates.map(gate => <GateItem key={gate.gate} gate={gate} stepStatus={step.status} trailingTone={trailingTone} onSave={onSave} saving={saving} />)}
          </ul>
        ) : (
          step.stage !== "complete" && <p className="text-xs text-ink-subtle">No gate date. Move on when the work is done.</p>
        )}
      </div>
    </li>
  );
}

function GateItem({ gate, stepStatus, trailingTone, onSave, saving }: { gate: GateRow; stepStatus: StageStep["status"]; trailingTone: "stop" | "warn" | null; onSave: SaveGate; saving: boolean }) {
  const label = useGateLabel();
  const name = label(gate.gate);
  return (
    <li className={cn("flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5", gate.hard && (gate.done || gate.waived ? "border-l-2 border-l-s300" : "border-l-2 border-l-state-blocked bg-state-blocked-soft/40"))}>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[13px]">
        {gate.hard && <Lock className={cn("size-3.5 shrink-0", gate.done || gate.waived ? "text-ink-subtle" : "text-state-blocked-text")} aria-hidden />}
        <span className={cn("truncate", gate.done ? "text-ink" : "text-ink-muted")}>{name}</span>
        {gate.hard && !gate.done && !gate.waived && <span className="whitespace-nowrap text-xs text-state-blocked-text">Required for Kickoff and In Delivery</span>}
        {gate.planned && <Chip>Planned date</Chip>}
        {gate.ahead && <Chip title="Recorded before the record reached this stage">Recorded ahead</Chip>}
        {gate.waived && !gate.done && <Pill verdict="ready">FCP waived</Pill>}
      </span>
      {gate.done ? (
        <span className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[13px] text-ink tabular">{!gate.planned && <Check className="size-3.5 text-state-pass-text" aria-label="Done" />}{formatDay(gate.day)}</span>
          <DatePopover gate={gate} name={name} onSave={onSave} saving={saving} trigger={<Button variant="ghost" size="icon" className="size-7" aria-label={`Change ${name} date`} title="Change date"><Pencil className="size-3.5" /></Button>} />
        </span>
      ) : gate.planned ? (
        <span className="flex items-center gap-2">
          <span className="text-xs text-ink-subtle">Not set</span>
          <DatePopover gate={gate} name={name} onSave={onSave} saving={saving} trigger={<Button variant="outline" size="sm" className="h-7">Set date</Button>} />
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {gate.trailing ? <span className={cn("text-xs font-medium", trailingTone === "stop" ? "text-state-blocked-text" : "text-state-warn-text")}>Trailing</span>
            : gate.waived ? null
            : gate.hard ? <Pill verdict="stop">{gate.gate === "poReceivedOn" ? "Not received" : "Not recorded"}</Pill>
            : <span className={cn("text-xs", stepStatus === "done" ? "text-state-warn-text" : "text-ink-subtle")}>{stepStatus === "done" ? "Not recorded" : "Pending"}</span>}
          <MarkDone gate={gate} onSave={onSave} saving={saving} />
        </span>
      )}
    </li>
  );
}

/** One click records today; the arrow opens a calendar to pick or backdate. */
function MarkDone({ gate, onSave, saving }: { gate: GateRow; onSave: SaveGate; saving: boolean }) {
  const label = useGateLabel();
  const name = label(gate.gate);
  const today = todayIso();
  return (
    <span className="inline-flex">
      <Button size="sm" variant="outline" className="h-7 rounded-r-none border-r-0" disabled={saving} onClick={() => onSave(gate.gate, today, `${name} recorded for ${formatDay(today)}`)}>
        <Check className="size-3.5" aria-hidden /> Mark done
      </Button>
      <DatePopover gate={gate} name={name} onSave={onSave} saving={saving} trigger={<Button size="sm" variant="outline" className="h-7 rounded-l-none px-1.5" aria-label={`Pick a date for ${name}`} title="Pick or backdate"><ChevronDown className="size-3.5" /></Button>} />
    </span>
  );
}

/** A calendar for one gate. Events can't be dated in the future; a planned date can. A recorded gate can be cleared. */
function DatePopover({ gate, name, onSave, saving, trigger }: { gate: GateRow; name: string; onSave: SaveGate; saving: boolean; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const today = todayIso();
  const save = (day: string | null, message: string) => {
    onSave(gate.gate, day, message);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="border-b border-s100 px-3 py-2">
          <p className="text-[13px] font-medium text-ink">{name}</p>
          <p className="text-xs text-ink-muted">{gate.planned ? "Pick the planned date." : "Pick the day it happened. Today or earlier."}</p>
        </div>
        <Calendar
          mode="single"
          selected={gate.day ? toDate(gate.day) : undefined}
          defaultMonth={gate.day ? toDate(gate.day) : toDate(today)}
          disabled={gate.planned ? undefined : { after: toDate(today) }}
          onSelect={date => date && save(toDay(date), `${name} set to ${formatDay(toDay(date))}`)}
        />
        <div className="flex items-center justify-between gap-2 border-t border-s100 px-3 py-2">
          {!gate.planned ? <Button size="sm" variant="ghost" disabled={saving} onClick={() => save(today, `${name} recorded for ${formatDay(today)}`)}>Today</Button> : <span />}
          {gate.done && <Button size="sm" variant="ghost" className="text-state-blocked-text" disabled={saving} onClick={() => save(null, `${name} cleared`)}>{gate.planned ? "Clear date" : "Mark not done"}</Button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

