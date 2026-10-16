import { useAuth } from "@/_core/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/vsa/AppShell";
import { Chip, DataMount, EmptyState, HeroBand, HeroKpi, Pill } from "@/components/vsa/elements";
import { RecordDrawer } from "@/components/vsa/RecordDrawer";
import { trpc } from "@/lib/trpc";
import { SEGMENT_LABELS, todayIso, type TrackerRow } from "@/lib/vsa";
import { MAIN_STAGES, STAGE_LABELS, isTerminal, stageWarnings, type Segment, type Stage } from "@shared/vsaStage";
import { daysBetween, entitlementTotal, expiryRows, formatMoney, inRoleView, ROLE_VIEW_LABELS } from "@shared/vsaViews";
import { KanbanSquare, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
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
          lead="Every VSA engagement from intake to delivery. Select a card to see its gates, history, and sources, or to move its stage."
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
          <div className="relative ml-auto w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-s400" aria-hidden />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search customer, C-OPP, SER" className="h-9 rounded-full pl-9" aria-label="Search engagements" />
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
                return (
                  <section key={stage} className="flex w-[268px] shrink-0 flex-col rounded-xl border border-s100 bg-white" aria-label={STAGE_LABELS[stage]}>
                    <header className="flex items-center justify-between border-b border-s100 px-3 py-2.5">
                      <h2 className="text-xs font-extrabold uppercase tracking-[.12em] text-s500">{STAGE_LABELS[stage]}</h2>
                      <span className="chip">{cards.length}</span>
                    </header>
                    <div className="flex flex-1 flex-col gap-2 p-2">
                      {cards.length === 0 ? <p className="px-2 py-6 text-center text-xs text-s400">None</p> : cards.map(row => <BoardCard key={row.id} row={row} today={today} onOpen={() => setOpenId(row.id)} />)}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </DataMount>
      </main>
      <RecordDrawer id={openId} onClose={() => setOpenId(null)} />
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

function BoardCard({ row, today, onOpen }: { row: TrackerRow; today: string; onOpen: () => void }) {
  const warnings = stageWarnings(row, today);
  const blocking = warnings.filter(warning => warning.startsWith("In a delivery stage"));
  const others = warnings.filter(warning => !blocking.includes(warning));
  const days = daysBetween(row.stageEnteredOn, today);
  const architect = row.assignments.find(assignment => assignment.role === "architect");
  return (
    <button type="button" onClick={onOpen} className="rounded-lg border border-s100 bg-white p-3 text-left shadow-[var(--shadow-card)] transition-colors hover:border-s300 focus-visible:border-cdw-red">
      <p className="text-sm font-bold leading-snug text-ink">{row.customerName}</p>
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
