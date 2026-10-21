import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DataMount, EmptyState, PageHeader } from "@/components/vsa/elements";
import { EngagementTable, FilterBar, NoMatches } from "@/components/vsa/EngagementTable";
import { PipelineBoard } from "@/components/vsa/PipelineBoard";
import { useShell } from "@/components/vsa/ShellContext";
import { applyFilters, EMPTY_FILTERS, openRows, sortRows, type PipelineFilters, type Sort } from "@/lib/pipeline";
import { trpc } from "@/lib/trpc";
import { todayIso } from "@/lib/vsa";
import { MAIN_STAGES, STAGES, type Stage } from "@shared/vsaStage";
import { Columns3, Plus, Rows3, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";

const OPEN_STAGES: Stage[] = [...MAIN_STAGES.filter(stage => stage !== "complete"), "paused"];

/** Filters can arrive in the URL from the Overview tiles: ?segment=none, ?flagged=1, ?stage=fcp_draft. */
function filtersFromUrl(search: string): PipelineFilters {
  const params = new URLSearchParams(search);
  const stage = params.get("stage") as Stage | null;
  return {
    ...EMPTY_FILTERS,
    segments: params.get("segment") === "none" ? ["none"] : [],
    flaggedOnly: params.get("flagged") === "1",
    stages: stage && (STAGES as readonly string[]).includes(stage) ? [stage] : [],
  };
}

/**
 * The working list. `scope` "open" is the Pipeline (open records, with the board as a secondary view); "all" is Records
 * (every record, closed included, table only).
 */
export function RecordList({ scope }: { scope: "open" | "all" }) {
  const today = todayIso();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const { openRecord, newEngagement } = useShell();
  const list = trpc.tracker.list.useQuery({});
  const [filters, setFilters] = useState<PipelineFilters>(() => filtersFromUrl(search));
  const [sort, setSort] = useState<Sort>(scope === "open" ? { key: "stage", dir: "asc" } : { key: "customer", dir: "asc" });
  const [view, setView] = useState<"table" | "board">(scope === "open" && params.get("view") === "board" ? "board" : "table");

  const base = useMemo(() => (scope === "open" ? openRows(list.data ?? []) : list.data ?? []), [list.data, scope]);
  const rows = useMemo(() => sortRows(applyFilters(base, filters, today), sort, today), [base, filters, sort, today]);
  const stages = scope === "open" ? OPEN_STAGES : [...STAGES];
  const title = scope === "open" ? "Pipeline" : "Records";
  const sub = list.data ? (scope === "open" ? `${base.length} open engagements` : `${base.length} records, closed included`) + (rows.length !== base.length ? ` · ${rows.length} shown` : "") : "Loading…";

  return (
    <main className="mx-auto max-w-[1600px] space-y-4 px-6 py-6">
      <PageHeader title={title} sub={sub}>
        {scope === "open" && (
          <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={value => value && setView(value as "table" | "board")} aria-label="Layout">
            <ToggleGroupItem value="table" aria-label="Table" className="gap-1.5 px-2.5 text-xs"><Rows3 className="size-3.5" /> Table</ToggleGroupItem>
            <ToggleGroupItem value="board" aria-label="Board" className="gap-1.5 px-2.5 text-xs"><Columns3 className="size-3.5" /> Board</ToggleGroupItem>
          </ToggleGroup>
        )}
        <Button onClick={newEngagement}><Plus className="size-4" /> New engagement</Button>
      </PageHeader>
      <FilterBar rows={base} stages={stages} filters={filters} onChange={setFilters} sort={sort} scope={scope} onApplyView={saved => { setFilters(saved.filters); setSort(saved.sort); }} />
      <DataMount
        id={scope === "open" ? "pipelineTable" : "recordsTable"}
        query={list}
        isEmpty={data => data.length === 0}
        empty={{ title: "No engagements yet", sub: "Import the SharePoint VSA Pipeline List, or create an engagement, to fill the tracker.", action: <Link href="/import" className="btn-primary inline-flex h-7 items-center gap-1.5 px-2.5 text-xs"><Upload className="size-3.5" /> Import pipeline</Link> }}
      >
        {() =>
          view === "board" ? (
            rows.length === 0 ? <NoMatches onClear={() => setFilters(EMPTY_FILTERS)} /> : <PipelineBoard rows={rows} columns={filters.stages.length ? OPEN_STAGES.filter(stage => filters.stages.includes(stage)) : OPEN_STAGES} onOpen={id => openRecord(id)} />
          ) : (
            <EngagementTable rows={rows} today={today} sort={sort} onSortChange={setSort} onOpen={id => openRecord(id)} empty={base.length === 0 ? <EmptyState title={scope === "open" ? "No open engagements" : "No records"} sub="Every engagement is closed." /> : <NoMatches onClear={() => setFilters(EMPTY_FILTERS)} />} />
          )
        }
      </DataMount>
    </main>
  );
}

export default function Pipeline() {
  return <RecordList scope="open" />;
}

export function Records() {
  return <RecordList scope="all" />;
}
