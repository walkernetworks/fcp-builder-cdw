import { useAuth } from "@/_core/hooks/useAuth";
import { DataMount, EmptyState, PageHeader } from "@/components/vsa/elements";
import { EngagementTable, FilterBar, NoMatches } from "@/components/vsa/EngagementTable";
import { useShell } from "@/components/vsa/ShellContext";
import { applyFilters, attentionFor, EMPTY_FILTERS, sortRows, type PipelineFilters, type Sort } from "@/lib/pipeline";
import { trpc } from "@/lib/trpc";
import { todayIso, type TrackerRow } from "@/lib/vsa";
import { inQueue, QUEUES, type QueueId } from "@shared/vsaDashboard";
import { MAIN_STAGES, type Stage } from "@shared/vsaStage";
import type { VsaRole } from "@shared/vsaViews";
import { Inbox } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearch } from "wouter";

const OPEN_STAGES: Stage[] = [...MAIN_STAGES.filter(stage => stage !== "complete"), "paused"];

/** The queue a user lands on: their default role view, or Awaiting my action. Leadership lands on Needs attention. */
function defaultQueue(role: VsaRole | null | undefined): QueueId {
  if (!role) return "awaiting";
  return role === "leadership" ? "attention" : role;
}

/** Role queues: built-in saved filters on assignments, with the usual filters and sorting on top. */
export default function Queue() {
  const today = todayIso();
  const { user } = useAuth();
  const { openRecord } = useShell();
  const requested = new URLSearchParams(useSearch()).get("q") as QueueId | null;
  const [queue, setQueue] = useState<QueueId>(requested && QUEUES.some(item => item.id === requested) ? requested : defaultQueue(user?.vsaRole));
  const [filters, setFilters] = useState<PipelineFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<Sort>({ key: "expiry", dir: "asc" });
  const list = trpc.tracker.list.useQuery({});

  const needsAttention = (row: TrackerRow) => attentionFor(row, today).count > 0;
  const counts = useMemo(() => Object.fromEntries(QUEUES.map(item => [item.id, (list.data ?? []).filter(row => user && inQueue(row, item.id, user.id, record => needsAttention(record as TrackerRow))).length])), [list.data, user, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = useMemo(() => (list.data ?? []).filter(row => user && inQueue(row, queue, user.id, record => needsAttention(record as TrackerRow))), [list.data, user, queue, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => sortRows(applyFilters(base, filters, today), sort, today), [base, filters, sort, today]);
  const current = QUEUES.find(item => item.id === queue)!;

  return (
    <main className="mx-auto max-w-[1600px] space-y-4 px-6 py-6">
      <PageHeader title="My Queue" sub="Records that need you, by role. Your default queue is set in the account menu." />
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Queues" className="panel h-fit p-1.5">
          <ul className="space-y-0.5">
            {QUEUES.map(item => (
              <li key={item.id}>
                <button type="button" onClick={() => setQueue(item.id)} aria-current={queue === item.id ? "true" : undefined} title={item.description}
                  className={`flex h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-[13px] ${queue === item.id ? "bg-surface-sunken font-medium text-ink" : "text-ink-muted hover:bg-surface-sunken hover:text-ink"}`}>
                  <span className="truncate">{item.label}</span>
                  <span className="tabular text-xs text-ink-subtle">{list.data ? counts[item.id] : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{current.label}</h2>
            <p className="text-xs text-ink-muted">{current.description}</p>
          </div>
          <FilterBar rows={base} stages={OPEN_STAGES} filters={filters} onChange={setFilters} sort={sort} scope={`queue-${queue}`} key={queue} onApplyView={saved => { setFilters(saved.filters); setSort(saved.sort); }} />
          <DataMount id="queueTable" query={list} empty={{ icon: Inbox, title: "No records", sub: "The tracker has no records yet." }}>
            {() => (
              <EngagementTable rows={rows} today={today} sort={sort} onSortChange={setSort} onOpen={id => openRecord(id)}
                empty={base.length === 0 ? <EmptyState icon={Inbox} title="Nothing in this queue" sub={queue === "attention" ? "No open record has a flag, a stale stage, or a stage warning." : "No open record has you in this role. Assignments are set on a record's People tab."} /> : <NoMatches onClear={() => setFilters(EMPTY_FILTERS)} />} />
            )}
          </DataMount>
        </div>
      </div>
    </main>
  );
}
