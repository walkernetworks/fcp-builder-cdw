import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { activeFilterCount, architectOf, attentionFor, BUILT_IN_VIEWS, EMPTY_FILTERS, loadSavedViews, storeSavedViews, type PipelineFilters, type SavedView, type Sort, type SortKey } from "@/lib/pipeline";
import { useOperationalSettings } from "@/lib/settings";
import { SEGMENT_LABELS, type TrackerRow } from "@/lib/vsa";
import { ENUM_LABELS } from "@/lib/vsaLabels";
import { STAGE_LABELS, type Segment, type Stage } from "@shared/vsaStage";
import { daysBetween, formatMoney } from "@shared/vsaViews";
import { staleness } from "@shared/vsaDashboard";
import { ArrowDown, ArrowUp, Bookmark, ChevronDown, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { AttentionPill, ExpiryCell, HealthPill, SegmentText, StageText } from "./cells";
import { Chip, EmptyState } from "./elements";

type Column = { key: SortKey; label: string; numeric?: boolean; className?: string };
const COLUMNS: Column[] = [
  { key: "customer", label: "Customer" },
  { key: "stage", label: "Stage" },
  { key: "segment", label: "Segment" },
  { key: "architect", label: "Architect" },
  { key: "days", label: "In stage", numeric: true },
  { key: "expiry", label: "Expiry", numeric: true },
  { key: "amount", label: "VSA amount", numeric: true },
  { key: "health", label: "Health" },
  { key: "flags", label: "Attention" },
];

/** A dense, sortable engagement table. Rows are keyboard-navigable: arrow keys move, Enter opens the record. */
export function EngagementTable({ rows, today, sort, onSortChange, onOpen, empty }: { rows: TrackerRow[]; today: string; sort: Sort; onSortChange: (sort: Sort) => void; onOpen: (id: number) => void; empty: ReactNode }) {
  const body = useRef<HTMLTableSectionElement>(null);
  const settings = useOperationalSettings();
  const toggleSort = (key: SortKey) => onSortChange(sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "amount" || key === "days" || key === "flags" ? "desc" : "asc" });

  function onRowKey(event: KeyboardEvent<HTMLTableRowElement>, id: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(id);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const sibling = (event.key === "ArrowDown" ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling) as HTMLElement | null;
      sibling?.focus();
    }
  }

  if (rows.length === 0) return <>{empty}</>;
  return (
    <div className="panel overflow-hidden">
      <Table className="tbl">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {COLUMNS.map(column => {
              const active = sort.key === column.key;
              return (
                <TableHead key={column.key} className={`${column.numeric ? "text-right" : ""} ${column.className ?? ""}`} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className={`sort-btn ${column.numeric ? "flex-row-reverse" : ""}`} data-active={active} onClick={() => toggleSort(column.key)}>
                    {column.label}
                    {active ? (sort.dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />) : <span className="size-3" aria-hidden />}
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody ref={body}>
          {rows.map(row => {
            const attention = attentionFor(row, today, settings);
            const days = daysBetween(row.stageEnteredOn, today);
            const stale = staleness(row, today, settings.staleAfterDays).stale;
            return (
              <TableRow key={row.id} data-selectable tabIndex={0} onClick={() => onOpen(row.id)} onKeyDown={event => onRowKey(event, row.id)} aria-label={`${row.customerName}, ${STAGE_LABELS[row.stage]}. Press Enter to open.`}>
                <TableCell className="max-w-[260px]">
                  <p className="truncate font-medium text-ink">{row.customerName}</p>
                  <p className="truncate text-xs text-ink-muted">{row.opportunityNumber ?? "No opportunity number"}</p>
                </TableCell>
                <TableCell><StageText stage={row.stage} /></TableCell>
                <TableCell><SegmentText segment={row.segment} /></TableCell>
                <TableCell className="max-w-[160px] truncate">{architectOf(row) ?? <span className="text-ink-subtle">Unassigned</span>}</TableCell>
                <TableCell className={`num ${stale ? "font-medium text-state-warn-text" : ""}`} title={stale ? "Past the stage's threshold" : undefined}>{days}d</TableCell>
                <TableCell className="num"><ExpiryCell day={row.deliveryWindowEnd} daysLeft={row.deliveryWindowEnd ? daysBetween(today, row.deliveryWindowEnd) : null} /></TableCell>
                <TableCell className="num">{row.entitlementValue === null ? <span className="text-ink-subtle">—</span> : formatMoney(row.entitlementValue)}</TableCell>
                <TableCell><HealthPill health={row.health} /></TableCell>
                <TableCell onClick={event => event.stopPropagation()}><AttentionPill attention={attention} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function MultiFilter<T extends string>({ label, options, selected, onChange }: { label: string; options: { value: T; label: string }[]; selected: T[]; onChange: (values: T[]) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={selected.length ? "border-s300 text-ink" : "text-ink-muted"}>
          {label}{selected.length > 0 && <span className="rounded-sm bg-surface-sunken px-1 text-[11px] font-semibold text-ink">{selected.length}</span>}
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-48 overflow-y-auto">
        {options.map(option => (
          <DropdownMenuCheckboxItem key={option.value} checked={selected.includes(option.value)} onSelect={event => event.preventDefault()} onCheckedChange={checked => onChange(checked ? [...selected, option.value] : selected.filter(value => value !== option.value))}>
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => onChange([])}>Clear {label.toLowerCase()}</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const FLAG_FILTER_LABELS: Partial<Record<NonNullable<PipelineFilters["flag"]>, string>> = {
  po_before_work_plan: "PO before work plan",
  hours_mismatch: "Hours mismatch",
};

/** Search, column filters, a flagged-only toggle, and saved views, in one row above the table or board. */
export function FilterBar({ rows, stages, filters, onChange, sort, onApplyView, scope, trailing }: {
  rows: TrackerRow[];
  stages: Stage[];
  filters: PipelineFilters;
  onChange: (filters: PipelineFilters) => void;
  sort: Sort;
  onApplyView: (view: SavedView) => void;
  scope: string;
  trailing?: ReactNode;
}) {
  const [views, setViews] = useState(() => loadSavedViews(scope));
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");
  const architects = useMemo(() => Array.from(new Set(rows.map(row => architectOf(row) ?? "Unassigned"))).sort((a, b) => (a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b))), [rows]);
  const count = activeFilterCount(filters);
  const set = <K extends keyof PipelineFilters>(key: K, value: PipelineFilters[K]) => onChange({ ...filters, [key]: value });

  function saveView() {
    const name = viewName.trim();
    if (!name) return;
    const next = [...views.filter(view => view.name !== name), { name, filters, sort }];
    setViews(next);
    setNaming(false);
    setViewName("");
    if (storeSavedViews(scope, next)) toast.success(`Saved view "${name}" in this browser`);
    else toast.error("This browser blocked saving the view");
  }

  function removeView(name: string) {
    const next = views.filter(view => view.name !== name);
    setViews(next);
    storeSavedViews(scope, next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle" aria-hidden />
        <Input value={filters.search} onChange={event => set("search", event.target.value)} placeholder="Filter customer, C-OPP, SER…" className="h-7 pl-8 text-[13px]" aria-label="Filter records" />
      </div>
      <MultiFilter label="Stage" options={stages.map(stage => ({ value: stage, label: STAGE_LABELS[stage] }))} selected={filters.stages} onChange={value => set("stages", value)} />
      <MultiFilter<Segment | "none"> label="Segment" options={[...(Object.keys(SEGMENT_LABELS) as Segment[]).map(value => ({ value, label: SEGMENT_LABELS[value] })), { value: "none", label: "Not set" }]} selected={filters.segments} onChange={value => set("segments", value)} />
      <MultiFilter label="Health" options={[...(Object.entries(ENUM_LABELS.health) as [NonNullable<TrackerRow["health"]>, string][]).map(([value, label]) => ({ value, label })), { value: "none" as const, label: "Not set" }]} selected={filters.health} onChange={value => set("health", value)} />
      <MultiFilter label="Architect" options={architects.map(name => ({ value: name, label: name }))} selected={filters.architects} onChange={value => set("architects", value)} />
      <Chip pressed={filters.flaggedOnly} onClick={() => set("flaggedOnly", !filters.flaggedOnly)}>Needs attention only</Chip>
      <Chip pressed={filters.fcpTrailing} onClick={() => set("fcpTrailing", !filters.fcpTrailing)} title="In staffing or later, FCP not approved or waived">FCP trailing</Chip>
      {filters.flag && <Chip pressed onClick={() => set("flag", null)} title="Remove this filter">{FLAG_FILTER_LABELS[filters.flag] ?? filters.flag} <X className="size-3" aria-hidden /></Chip>}
      {count > 0 && <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}><X className="size-3.5" /> Clear</Button>}
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm"><Bookmark className="size-3.5" /> Views{views.length > 0 && <span className="text-ink-muted">{views.length}</span>}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="text-xs font-normal text-ink-muted">Built in</DropdownMenuLabel>
            {BUILT_IN_VIEWS.map(view => <DropdownMenuItem key={view.name} onSelect={() => onApplyView(view)}>{view.name}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-ink-muted">Saved in this browser</DropdownMenuLabel>
            {views.length === 0 && <p className="px-2 pb-2 text-xs text-ink-subtle">No saved views yet.</p>}
            {views.map(view => (
              <DropdownMenuItem key={view.name} onSelect={() => onApplyView(view)} className="justify-between">
                <span className="truncate">{view.name}</span>
                <button type="button" className="rounded p-0.5 text-ink-subtle hover:text-ink" aria-label={`Delete view ${view.name}`} onClick={event => { event.stopPropagation(); event.preventDefault(); removeView(view.name); }}><Trash2 className="size-3.5" /></button>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Popover open={naming} onOpenChange={setNaming}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={count === 0} title={count === 0 ? "Set a filter first" : "Save these filters as a view"}><SlidersHorizontal className="size-3.5" /> Save view</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3">
            <form className="space-y-2" onSubmit={event => { event.preventDefault(); saveView(); }}>
              <label className="block space-y-1.5">
                <span className="field-label">View name</span>
                <Input autoFocus value={viewName} onChange={event => setViewName(event.target.value)} maxLength={60} placeholder="e.g. West corporate, no architect" className="h-8" />
              </label>
              <p className="text-[11px] text-ink-subtle">Saved in this browser only.</p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setNaming(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={!viewName.trim()}>Save</Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
        {trailing}
      </div>
    </div>
  );
}

export function NoMatches({ onClear }: { onClear: () => void }) {
  return <EmptyState icon={Search} title="Nothing matches these filters" sub="No records match the current search and filters." action={<Button variant="outline" size="sm" onClick={onClear}>Clear filters</Button>} />;
}
