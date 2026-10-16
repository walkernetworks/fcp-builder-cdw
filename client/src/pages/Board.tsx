import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/vsa/AppShell";
import { Chip, DataMount, EmptyState, HeroBand, HeroKpi, Pill } from "@/components/vsa/elements";
import { RecordDrawer, type DrawerTab } from "@/components/vsa/RecordDrawer";
import { StageMoveDialog, type PendingMove } from "@/components/vsa/StageMoveDialog";
import { trpc } from "@/lib/trpc";
import { SEGMENT_LABELS, todayIso, type TrackerRow } from "@/lib/vsa";
import { MAIN_STAGES, STAGE_LABELS, canTransition, isTerminal, stageWarnings, type Segment, type Stage } from "@shared/vsaStage";
import { daysBetween, entitlementTotal, expiryRows, formatMoney, inRoleView, ROLE_VIEW_LABELS } from "@shared/vsaViews";
import { GripVertical, KanbanSquare, Plus, Search, Upload } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type SegmentFilter = Segment | "none" | "all";
const OPEN_COLUMNS: Stage[] = [...MAIN_STAGES.filter(stage => stage !== "complete"), "paused"];
const CLOSED_COLUMNS: Stage[] = ["complete", "refused", "lost"];
const DELIVERY_STAGES: ReadonlySet<Stage> = new Set<Stage>(["kickoff", "in_delivery"]);

/** The tracker home: every engagement by stage, filtered by the signed-in user's role view. */
export default function Board() {
  const today = todayIso();
  const { user } = useAuth();
  const list = trpc.tracker.list.useQuery({});
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [showClosed, setShowClosed] = useState(false);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("overview");
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [creating, setCreating] = useState(false);
  const [newCustomer, setNewCustomer] = useState("");
  const utils = trpc.useUtils();

  const transition = trpc.tracker.transition.useMutation({
    onSuccess: async (result, input) => {
      toast.success(result.warnings.length ? `Moved to ${STAGE_LABELS[input.to]}. Still open: ${result.warnings.join("; ")}` : `Moved to ${STAGE_LABELS[input.to]}`);
      setPendingMove(null);
      await Promise.all([utils.tracker.list.invalidate(), utils.tracker.get.invalidate({ id: input.id })]);
    },
    onError: error => toast.error(error.message),
  });
  const create = trpc.tracker.create.useMutation({
    onSuccess: async created => {
      setCreating(false);
      setNewCustomer("");
      await utils.tracker.list.invalidate();
      openRecord(created.id, "details");
    },
    onError: error => toast.error(error.message),
  });

  function openRecord(id: number, tab: DrawerTab = "overview") {
    setDrawerTab(tab);
    setOpenId(id);
  }

  const dragged = draggedId !== null ? list.data?.find(row => row.id === draggedId) : undefined;
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

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (list.data ?? []).filter(row =>
      (!user || inRoleView(row, user.id, user.vsaRole ?? null)) &&
      (segment === "all" || (segment === "none" ? !row.segment : row.segment === segment)) &&
      (!term || [row.customerName, row.opportunityNumber, row.serNumber, row.salesforceCustomerId].some(value => value?.toLowerCase().includes(term))),
    );
  }, [list.data, user, segment, search]);

  const metrics = useMemo(() => {
    const open = visible.filter(row => !isTerminal(row.stage));
    const rows = expiryRows(open, today);
    const money = entitlementTotal(rows);
    return {
      open: open.length,
      entitlements: rows.length,
      money,
      expiring: rows.filter(row => row.verdict.pill === "warn" || row.verdict.pill === "stop").length,
      attention: open.filter(row => stageWarnings(row, today).length).length,
    };
  }, [visible, today]);

  const roleLabel = user?.vsaRole ? `${ROLE_VIEW_LABELS[user.vsaRole]} view` : "All records";
  const columns = showClosed ? [...OPEN_COLUMNS, ...CLOSED_COLUMNS] : OPEN_COLUMNS;

  return (
    <AppShell>
      <main className="mx-auto max-w-[1600px] space-y-5 px-5 py-6">
        <HeroBand
          eyebrow={`VSA pipeline · ${roleLabel}`}
          head={`${metrics.open} open engagements`}
          lead="Every VSA engagement from intake to delivery. Drag a card to move its stage, or select it to see and edit its details."
        >
          <HeroKpi label="Open" value={metrics.open} sub="Engagements not Complete, Refused, or Lost" />
          <HeroKpi label="Entitlement in flight" value={formatMoney(metrics.money.total)} sub={`VSA amounts on ${metrics.entitlements} open entitlements; alternative plans counted once${metrics.money.missing ? `; ${metrics.money.missing} without an amount` : ""}`} />
          <HeroKpi label="Expiring within 90 days" value={metrics.expiring} sub="Delivery window ends within 90 days or has passed" />
          <HeroKpi label="Need attention" value={metrics.attention} sub="Missing a segment, PO, or work plan acceptance for their stage" />
        </HeroBand>

        <section className="flex flex-wrap items-center gap-2">
          <Chip pressed={segment === "all"} onClick={() => setSegment("all")}>All segments</Chip>
          {(Object.keys(SEGMENT_LABELS) as Segment[]).map(value => <Chip key={value} pressed={segment === value} onClick={() => setSegment(value)}>{SEGMENT_LABELS[value]}</Chip>)}
          <Chip pressed={segment === "none"} onClick={() => setSegment("none")}>Segment not set</Chip>
          <span className="mx-1 h-5 w-px bg-s200" aria-hidden />
          <Chip pressed={showClosed} onClick={() => setShowClosed(value => !value)}>Show closed</Chip>
          <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-s400" aria-hidden />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search customer, C-OPP, SER" className="h-9 rounded-full pl-9" aria-label="Search engagements" />
          </div>
          <Button className="h-9 shrink-0" onClick={() => setCreating(true)}><Plus className="size-4" /> New engagement</Button>
          </div>
        </section>

        <DataMount
          id="boardColumns"
          query={list}
          isEmpty={rows => rows.length === 0}
          empty={{ icon: KanbanSquare, title: "No engagements yet", sub: "Import the SharePoint VSA Pipeline List, or start an FCP, to put engagements on the board.", action: <Link href="/import" className="btn-pill-primary inline-flex h-8 items-center gap-1.5 px-3.5 text-sm"><Upload className="size-4" /> Import pipeline</Link> }}
        >
          {() => visible.length === 0 ? (
            <EmptyState icon={Search} title="Nothing matches these filters" sub={`No engagements match the current segment, search, or ${roleLabel.toLowerCase()}. Clear a filter or change the view in the header.`} />
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-3">
              {columns.map(stage => {
                const cards = visible.filter(row => row.stage === stage);
                const check = dragged ? checkDrop(dragged, stage) : null;
                const dropState = !dragged || dragged.stage === stage ? "" : check?.hardBlock ? "opacity-50" : overStage === stage ? "border-cdw-red ring-2 ring-cdw-red/25" : "border-dashed border-s300";
                return (
                  <section key={stage} {...columnDrag(stage)} className={`flex w-[268px] shrink-0 flex-col rounded-xl border border-s100 bg-white transition-[border-color,box-shadow,opacity] ${dropState}`} aria-label={STAGE_LABELS[stage]} title={check?.hardBlock ?? undefined}>
                    <header className="flex items-center justify-between border-b border-s100 px-3 py-2.5">
                      <h2 className="text-xs font-extrabold uppercase tracking-[.12em] text-s500">{STAGE_LABELS[stage]}</h2>
                      <span className="chip">{cards.length}</span>
                    </header>
                    <div className="flex flex-1 flex-col gap-2 p-2">
                      {cards.length === 0 ? <p className="px-2 py-6 text-center text-xs text-s400">None</p> : cards.map(row => <BoardCard key={row.id} row={row} today={today} dragging={draggedId === row.id} onOpen={() => openRecord(row.id)} onDragStart={() => setDraggedId(row.id)} onDragEnd={() => { setDraggedId(null); setOverStage(null); }} />)}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </DataMount>
      </main>
      <RecordDrawer id={openId} initialTab={drawerTab} onClose={() => setOpenId(null)} />
      <StageMoveDialog
        move={pendingMove}
        pending={transition.isPending}
        onCancel={() => setPendingMove(null)}
        onConfirm={(effectiveOn, note) => pendingMove && transition.mutate({ id: pendingMove.id, rowVersion: pendingMove.rowVersion, to: pendingMove.to, effectiveOn, note: note || undefined })}
      />
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (newCustomer.trim()) create.mutate({ customerName: newCustomer.trim() }); }}>
            <DialogHeader>
              <p className="cta-eyebrow">New engagement</p>
              <DialogTitle className="text-lg font-black tracking-tight">Start a VSA engagement</DialogTitle>
              <DialogDescription>It starts in Intake. Fill in the rest on the Details tab.</DialogDescription>
            </DialogHeader>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-cool-8">
              Customer name
              <Input autoFocus value={newCustomer} onChange={event => setNewCustomer(event.target.value)} maxLength={240} className="mt-1 h-9 rounded-full normal-case tracking-normal" />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
              <Button type="submit" disabled={!newCustomer.trim() || create.isPending}>Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

/** Card pills carry a short word; the full warning is in the pill's title and in the drawer. */
function shortWarning(warning: string) {
  if (warning === "Segment not set") return "No segment";
  if (warning.startsWith("Commercial customers skip")) return "Skips approval";
  if (warning.startsWith("Work plan sent")) return "Work plan stale";
  return "Check";
}

function BoardCard({ row, today, dragging, onOpen, onDragStart, onDragEnd }: { row: TrackerRow; today: string; dragging: boolean; onOpen: () => void; onDragStart: () => void; onDragEnd: () => void }) {
  const warnings = stageWarnings(row, today);
  const blocking = warnings.filter(warning => warning.startsWith("In a delivery stage"));
  const others = warnings.filter(warning => !blocking.includes(warning));
  const days = daysBetween(row.stageEnteredOn, today);
  const architect = row.assignments.find(assignment => assignment.role === "architect");
  return (
    <button
      type="button"
      draggable
      onClick={onOpen}
      onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(row.id)); onDragStart(); }}
      onDragEnd={onDragEnd}
      aria-label={`${row.customerName}, ${STAGE_LABELS[row.stage]}. Open details; drag to another stage to move it.`}
      className={`group cursor-grab rounded-lg border border-s100 bg-white p-3 text-left shadow-[var(--shadow-card)] transition-[border-color,opacity] hover:border-s300 focus-visible:border-cdw-red active:cursor-grabbing ${dragging ? "opacity-40" : ""}`}
    >
      <p className="flex items-start justify-between gap-2 text-sm font-bold leading-snug text-ink">{row.customerName}<GripVertical className="mt-0.5 size-3.5 shrink-0 text-s300 group-hover:text-s400" aria-hidden /></p>
      <p className="mt-0.5 text-xs text-ink-muted">{row.opportunityNumber ?? "No opportunity number"}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {row.segment && <Chip>{SEGMENT_LABELS[row.segment]}</Chip>}
        <Chip title={`In ${STAGE_LABELS[row.stage]} since ${row.stageEnteredOn}`}>{days} {days === 1 ? "day" : "days"} in stage</Chip>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-2 text-[11px]">
        <dt className="text-s400">VSA amount</dt>
        <dd className="num font-semibold text-ink">{formatMoney(row.entitlementValue)}</dd>
        {architect && <><dt className="text-s400">Architect</dt><dd className="truncate text-right text-ink">{architect.displayName}</dd></>}
      </dl>
      {warnings.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {blocking.map(warning => <Pill key={warning} verdict="stop" title={warning}>No PO</Pill>)}
          {others.slice(0, 1).map(warning => <Pill key={warning} verdict="warn" title={warning}>{shortWarning(warning)}</Pill>)}
          {others.length > 1 && <Pill verdict="warn" title={others.slice(1).join("\n")}>+{others.length - 1}</Pill>}
        </div>
      )}
      {DELIVERY_STAGES.has(row.stage) && row.poReceivedOn && <p className="mt-2 text-[11px] text-ink-muted">PO received {row.poReceivedOn}</p>}
    </button>
  );
}
