import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { todayIso } from "@/lib/vsa";
import { STAGE_LABELS, type Stage } from "@shared/vsaStage";
import { useEffect, useState } from "react";
import { Pill } from "./elements";

export type PendingMove = { id: number; customerName: string; rowVersion: number; stageEnteredOn: string; from: Stage; to: Stage; warnings: string[]; noteRequired: boolean };

/** Asks for the date and note a dropped card needs before its stage changes. */
export function StageMoveDialog({ move, pending, onCancel, onConfirm }: { move: PendingMove | null; pending: boolean; onCancel: () => void; onConfirm: (effectiveOn: string, note: string) => void }) {
  const [effectiveOn, setEffectiveOn] = useState(todayIso());
  const [note, setNote] = useState("");
  useEffect(() => { setEffectiveOn(todayIso()); setNote(""); }, [move?.id, move?.to]);
  return (
    <Dialog open={move !== null} onOpenChange={open => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        {move && (
          <form onSubmit={event => { event.preventDefault(); onConfirm(effectiveOn, note.trim()); }} className="space-y-4">
            <DialogHeader>
              <p className="cta-eyebrow">Move stage</p>
              <DialogTitle className="text-lg font-semibold tracking-tight">{move.customerName}</DialogTitle>
              <DialogDescription>{STAGE_LABELS[move.from]} → <strong className="text-ink">{STAGE_LABELS[move.to]}</strong></DialogDescription>
            </DialogHeader>
            {move.warnings.length > 0 && <div className="space-y-1">{move.warnings.map(warning => <p key={warning} className="text-xs"><Pill verdict="warn">Open</Pill> {warning}</p>)}</div>}
            <label className="block text-[11px] font-medium uppercase tracking-wide text-cool-8">
              Date of the change
              <Input type="date" required value={effectiveOn} min={move.stageEnteredOn} max={todayIso()} onChange={event => setEffectiveOn(event.target.value)} className="mt-1 h-9 rounded-md" />
            </label>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-cool-8">
              {move.noteRequired ? "Why (required: this skips, reverses, or reopens a stage)" : "Note (optional)"}
              <Textarea value={note} onChange={event => setNote(event.target.value)} rows={3} className="mt-1 rounded-lg normal-case tracking-normal" required={move.noteRequired} />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
              <Button type="submit" disabled={pending || (move.noteRequired && !note.trim())}>Move to {STAGE_LABELS[move.to]}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
