import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TIMELINE_COLORS, validateTimeline, type Timeline, type TimelineBar } from "@shared/fcp";
import { ArrowDown, ArrowUp, Flag, GripVertical, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const colorClasses: Record<string, string> = {
  slate: "bg-slate-700 text-white border-slate-800",
  blue: "bg-blue-600 text-white border-blue-700",
  teal: "bg-teal-700 text-white border-teal-800",
  amber: "bg-amber-400 text-slate-950 border-amber-500",
  red: "bg-[#c8102e] text-white border-[#9f0b24]",
  green: "bg-green-700 text-white border-green-800",
  gate: "bg-violet-700 text-white border-violet-800",
  deferred: "bg-slate-200 text-slate-600 border-slate-400 border-dashed",
};

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function overlaps(candidate: TimelineBar, other: TimelineBar) {
  return candidate.startCol < other.endCol && candidate.endCol > other.startCol;
}

export function GanttEditor({ timeline, onChange }: { timeline: Timeline; onChange: (timeline: Timeline) => void }) {
  const [selected, setSelected] = useState<{ laneId: string; barId: string } | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const errors = useMemo(() => validateTimeline(timeline), [timeline]);
  const selectedLane = timeline.lanes.find(lane => lane.id === selected?.laneId);
  const selectedBar = selectedLane?.bars.find(bar => bar.id === selected?.barId);

  const changeLane = (laneId: string, updater: (lane: Timeline["lanes"][number]) => Timeline["lanes"][number]) => {
    onChange({ ...timeline, lanes: timeline.lanes.map(lane => (lane.id === laneId ? updater(lane) : lane)) });
  };

  const changeBar = (laneId: string, barId: string, patch: Partial<TimelineBar>, announce = false) => {
    const lane = timeline.lanes.find(item => item.id === laneId);
    const current = lane?.bars.find(item => item.id === barId);
    if (!lane || !current) return false;
    const maxEnd = timeline.columns.length + 1;
    const next: TimelineBar = {
      ...current,
      ...patch,
      startCol: Math.max(1, Math.min(maxEnd - 1, patch.startCol ?? current.startCol)),
      endCol: Math.max(2, Math.min(maxEnd, patch.endCol ?? current.endCol)),
    };
    if (next.endCol <= next.startCol) return false;
    if (lane.bars.some(item => item.id !== barId && overlaps(next, item))) {
      if (announce) toast.error("That change would overlap another bar in this lane.");
      return false;
    }
    changeLane(laneId, item => ({ ...item, bars: item.bars.map(bar => (bar.id === barId ? next : bar)) }));
    return true;
  };

  const beginDrag = (event: React.PointerEvent, laneId: string, bar: TimelineBar, mode: "move" | "start" | "end") => {
    event.preventDefault();
    event.stopPropagation();
    setSelected({ laneId, barId: bar.id });
    const row = rowRefs.current[laneId];
    if (!row) return;
    const startX = event.clientX;
    const start = bar.startCol;
    const end = bar.endCol;
    const width = row.getBoundingClientRect().width / timeline.columns.length;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = Math.round((moveEvent.clientX - startX) / width);
      if (!delta) return;
      if (mode === "move") changeBar(laneId, bar.id, { startCol: start + delta, endCol: end + delta });
      if (mode === "start") changeBar(laneId, bar.id, { startCol: start + delta });
      if (mode === "end") changeBar(laneId, bar.id, { endCol: end + delta });
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  };

  const addLane = () => {
    const laneId = id("lane");
    onChange({ ...timeline, lanes: [...timeline.lanes, { id: laneId, name: "New workstream", bars: [] }] });
  };

  const addBar = (laneId: string) => {
    const lane = timeline.lanes.find(item => item.id === laneId);
    if (!lane) return;
    let startCol = 1;
    while (startCol <= timeline.columns.length && lane.bars.some(item => startCol < item.endCol && startCol + 1 > item.startCol)) startCol += 1;
    if (startCol > timeline.columns.length) return toast.error("This lane has no open stage. Add a lane for concurrent work.");
    const next = { id: id("bar"), startCol, endCol: startCol + 1, color: "blue" as const, label: "New activity", milestone: false, deferred: false };
    changeLane(laneId, item => ({ ...item, bars: [...item.bars, next] }));
    setSelected({ laneId, barId: next.id });
  };

  const moveLane = (laneId: string, direction: -1 | 1) => {
    const index = timeline.lanes.findIndex(lane => lane.id === laneId);
    const target = index + direction;
    if (target < 0 || target >= timeline.lanes.length) return;
    const lanes = [...timeline.lanes];
    [lanes[index], lanes[target]] = [lanes[target], lanes[index]];
    onChange({ ...timeline, lanes });
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Adoption timeline</h2>
          <p className="text-sm text-slate-500">Drag bars to move; use the edge handles to resize. Concurrent work belongs on separate lanes.</p>
        </div>
        <Button variant="outline" onClick={addLane}><Plus className="size-4" /> Add lane</Button>
      </div>
      {errors.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{errors[0]}</div>}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="min-w-[980px]">
          <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `220px repeat(${timeline.columns.length}, minmax(92px,1fr))` }}>
            <div className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Workstream</div>
            {timeline.columns.map((column, index) => <div key={`${column}-${index}`} className="border-l border-slate-200 px-2 py-3 text-center text-[11px] font-semibold leading-tight text-slate-600">{column}</div>)}
          </div>
          {timeline.lanes.map((lane, laneIndex) => (
            <div key={lane.id} className="grid min-h-[76px] border-b border-slate-100 last:border-b-0" style={{ gridTemplateColumns: `220px repeat(${timeline.columns.length}, minmax(92px,1fr))` }}>
              <div className="group flex items-center gap-1 border-r border-slate-200 bg-white px-2 py-2">
                <GripVertical className="size-4 shrink-0 text-slate-300" />
                <Input value={lane.name} onChange={event => changeLane(lane.id, item => ({ ...item, name: event.target.value }))} className="h-9 border-transparent bg-transparent px-1 text-xs font-semibold shadow-none focus-visible:border-slate-200" aria-label="Lane name" />
                <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                  <Button size="icon" variant="ghost" className="size-7" disabled={laneIndex === 0} onClick={() => moveLane(lane.id, -1)} aria-label="Move lane up"><ArrowUp className="size-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="size-7" disabled={laneIndex === timeline.lanes.length - 1} onClick={() => moveLane(lane.id, 1)} aria-label="Move lane down"><ArrowDown className="size-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="size-7" onClick={() => addBar(lane.id)} aria-label="Add activity"><Plus className="size-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="size-7 text-red-600" disabled={timeline.lanes.length === 1} onClick={() => onChange({ ...timeline, lanes: timeline.lanes.filter(item => item.id !== lane.id) })} aria-label="Delete lane"><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
              <div ref={node => { rowRefs.current[lane.id] = node; }} className="timeline-row relative grid items-center gap-0 bg-white" style={{ gridColumn: `2 / ${timeline.columns.length + 2}`, gridTemplateColumns: `repeat(${timeline.columns.length}, minmax(92px,1fr))` }}>
                {lane.bars.map(bar => (
                  <div key={bar.id} className={cn("group relative z-[1] my-2 flex min-h-12 cursor-grab select-none items-center overflow-hidden rounded-lg border px-3 text-[11px] font-semibold leading-tight shadow-sm transition-shadow hover:shadow-md", colorClasses[bar.color], selected?.barId === bar.id && "ring-2 ring-slate-950 ring-offset-2")} style={{ gridColumn: `${bar.startCol} / ${bar.endCol}` }} onClick={() => setSelected({ laneId: lane.id, barId: bar.id })} onPointerDown={event => beginDrag(event, lane.id, bar, "move")}>
                    <button className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-black/10 opacity-0 group-hover:opacity-100" onPointerDown={event => beginDrag(event, lane.id, bar, "start")} aria-label="Resize start" />
                    <span className="truncate">{bar.milestone && "◆ "}{bar.label}</span>
                    <button className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-black/10 opacity-0 group-hover:opacity-100" onPointerDown={event => beginDrag(event, lane.id, bar, "end")} aria-label="Resize end" />
                  </div>
                ))}
                {lane.bars.length === 0 && <button className="col-span-full m-3 rounded-lg border border-dashed border-slate-300 py-3 text-xs text-slate-500 hover:border-slate-500" onClick={() => addBar(lane.id)}>Add the first activity</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {selectedBar && selectedLane && (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[2fr_1fr_1fr_auto_auto_auto] md:items-end">
          <label className="space-y-1 text-xs font-semibold text-slate-600">Activity label<Input value={selectedBar.label} onChange={event => changeBar(selectedLane.id, selectedBar.id, { label: event.target.value })} /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Start stage<Input type="number" min={1} max={timeline.columns.length} value={selectedBar.startCol} onChange={event => changeBar(selectedLane.id, selectedBar.id, { startCol: Number(event.target.value) }, true)} /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">End boundary<Input type="number" min={2} max={timeline.columns.length + 1} value={selectedBar.endCol} onChange={event => changeBar(selectedLane.id, selectedBar.id, { endCol: Number(event.target.value) }, true)} /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Legend<Select value={selectedBar.color} onValueChange={color => changeBar(selectedLane.id, selectedBar.id, { color: color as TimelineBar["color"], deferred: color === "deferred" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIMELINE_COLORS.map(color => <SelectItem key={color} value={color}>{color[0].toUpperCase() + color.slice(1)}</SelectItem>)}</SelectContent></Select></label>
          <Tooltip><TooltipTrigger asChild><label className="flex h-10 items-center gap-2 text-xs font-semibold text-slate-600"><Switch checked={selectedBar.milestone} onCheckedChange={milestone => changeBar(selectedLane.id, selectedBar.id, { milestone })} /><Flag className="size-4" /></label></TooltipTrigger><TooltipContent>Milestone marker</TooltipContent></Tooltip>
          <Button variant="ghost" className="text-red-600" onClick={() => { changeLane(selectedLane.id, lane => ({ ...lane, bars: lane.bars.filter(bar => bar.id !== selectedBar.id) })); setSelected(null); }}><Trash2 className="size-4" /> Remove</Button>
        </div>
      )}
    </section>
  );
}
