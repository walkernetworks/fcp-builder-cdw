import { attentionFor, architectOf } from "@/lib/pipeline";
import { trpc } from "@/lib/trpc";
import { SEGMENT_LABELS, todayIso, type TrackerRow } from "@/lib/vsa";
import { STAGE_LABELS, canTransition, type Stage } from "@shared/vsaStage";
import { daysBetween, formatMoney } from "@shared/vsaViews";
import { useState, type DragEvent } from "react";
import { toast } from "sonner";
import { HealthPill } from "./cells";
import { Pill } from "./elements";
import { StageMoveDialog, type PendingMove } from "./StageMoveDialog";

/**
 * The pipeline as columns: a secondary view next to the table. Compact cards, quiet headers with counts, and status as
 * small pills. Dragging a card to another column moves its stage through the same rules as Move stage; it is optional.
 */
export function PipelineBoard({ rows, columns, onOpen }: { rows: TrackerRow[]; columns: Stage[]; onOpen: (id: number) => void }) {
  const today = todayIso();
  const utils = trpc.useUtils();
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const transition = trpc.tracker.transition.useMutation({
    onSuccess: async (result, input) => {
      toast.success(result.warnings.length ? `Moved to ${STAGE_LABELS[input.to]}. Still open: ${result.warnings.join("; ")}` : `Moved to ${STAGE_LABELS[input.to]}`);
      setPendingMove(null);
      await Promise.all([utils.tracker.list.invalidate(), utils.tracker.get.invalidate({ id: input.id })]);
    },
    onError: error => toast.error(error.message),
  });

  const dragged = draggedId !== null ? rows.find(row => row.id === draggedId) : undefined;
  /** The move a drop would make, checked against the shared stage rules (the server checks again, with the source checklist). */
  const checkDrop = (row: TrackerRow, to: Stage) => (row.stage === to ? null : canTransition(row, to));

  function drop(row: TrackerRow, to: Stage) {
    const check = checkDrop(row, to);
    if (!check) return;
    if (check.hardBlock) return void toast.error(check.hardBlock);
    if (check.noteRequired) return setPendingMove({ id: row.id, customerName: row.customerName, rowVersion: row.rowVersion, stageEnteredOn: row.stageEnteredOn, from: row.stage, to, warnings: check.warnings, noteRequired: true });
    transition.mutate({ id: row.id, rowVersion: row.rowVersion, to, effectiveOn: today });
  }

  const columnDrag = (stage: Stage) => ({
    onDragOver: (event: DragEvent) => {
      if (!dragged || dragged.stage === stage) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = checkDrop(dragged, stage)?.hardBlock ? "none" : "move";
      if (overStage !== stage) setOverStage(stage);
    },
    onDragLeave: (event: DragEvent) => {
      if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) setOverStage(current => (current === stage ? null : current));
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setOverStage(null);
      if (dragged) drop(dragged, stage);
      setDraggedId(null);
    },
  });

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-3">
        {columns.map(stage => {
          const cards = rows.filter(row => row.stage === stage);
          const check = dragged ? checkDrop(dragged, stage) : null;
          const dropState = !dragged || dragged.stage === stage ? "" : check?.hardBlock ? "opacity-40" : overStage === stage ? "bg-surface-sunken outline outline-1 outline-s300" : "";
          return (
            <section key={stage} {...columnDrag(stage)} className={`flex w-[248px] shrink-0 flex-col rounded-md transition-[background-color,opacity] ${dropState}`} aria-label={STAGE_LABELS[stage]} title={check?.hardBlock ?? undefined}>
              <header className="flex items-center justify-between border-b border-s100 px-1 pb-2">
                <h2 className="text-[13px] font-medium text-ink">{STAGE_LABELS[stage]}</h2>
                <span className="tabular text-xs text-ink-muted">{cards.length}</span>
              </header>
              <div className="flex flex-1 flex-col gap-1.5 py-2">
                {cards.length === 0 ? <p className="px-1 py-4 text-xs text-ink-subtle">None</p> : cards.map(row => (
                  <BoardCard key={row.id} row={row} today={today} dragging={draggedId === row.id} onOpen={() => onOpen(row.id)} onDragStart={() => setDraggedId(row.id)} onDragEnd={() => { setDraggedId(null); setOverStage(null); }} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <StageMoveDialog
        move={pendingMove}
        pending={transition.isPending}
        onCancel={() => setPendingMove(null)}
        onConfirm={(effectiveOn, note) => pendingMove && transition.mutate({ id: pendingMove.id, rowVersion: pendingMove.rowVersion, to: pendingMove.to, effectiveOn, note: note || undefined })}
      />
    </>
  );
}

function BoardCard({ row, today, dragging, onOpen, onDragStart, onDragEnd }: { row: TrackerRow; today: string; dragging: boolean; onOpen: () => void; onDragStart: () => void; onDragEnd: () => void }) {
  const attention = attentionFor(row, today);
  const noPo = attention.warnings.some(warning => warning.startsWith("In a delivery stage"));
  const days = daysBetween(row.stageEnteredOn, today);
  const architect = architectOf(row);
  return (
    <button
      type="button"
      draggable
      onClick={onOpen}
      onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(row.id)); onDragStart(); }}
      onDragEnd={onDragEnd}
      aria-label={`${row.customerName}, ${STAGE_LABELS[row.stage]}. Open details; drag to another stage to move it.`}
      className={`rounded-md border border-s100 bg-surface px-2.5 py-2 text-left shadow-[var(--shadow-card)] transition-colors hover:border-s200 focus-visible:border-cdw-red ${dragging ? "opacity-40" : ""}`}
    >
      <p className="truncate text-[13px] font-medium text-ink">{row.customerName}</p>
      <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-ink-muted">
        <span className="truncate">{[row.segment ? SEGMENT_LABELS[row.segment] : null, architect].filter(Boolean).join(" · ") || "Unassigned"}</span>
        <span className={`tabular shrink-0 ${attention.stale.stale ? "text-state-warn-text" : ""}`}>{days}d</span>
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="tabular text-xs text-ink">{formatMoney(row.entitlementValue)}</span>
        <span className="flex items-center gap-1">
          {noPo && <Pill verdict="stop">No PO</Pill>}
          {!noPo && attention.count > 0 && <Pill verdict="warn" title={[...attention.flags.map(flag => flag.label), ...attention.warnings].join("\n")}>{attention.count}</Pill>}
          {row.health && <HealthPill health={row.health} />}
        </span>
      </div>
    </button>
  );
}
