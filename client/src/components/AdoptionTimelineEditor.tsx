import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { applyTimelineGesture, normalizeActivityLabel, normalizeWorkstreamLabel, TIMELINE_COLORS, validateTimeline, type Timeline, type TimelineBar } from "@shared/fcp";
import { ArrowDown, ArrowUp, CalendarRange, Flag, GripVertical, Plus, Trash2 } from "lucide-react";
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

type Props = {
  timeline: Timeline;
  onChange: (timeline: Timeline) => void;
  title?: string;
  description?: string;
};

export function AdoptionTimelineEditor({
  timeline,
  onChange,
  title = "Adoption Timeline",
  description = "Drag activities to move them between timeline windows. Drag either edge to resize the duration.",
}: Props) {
  const [selected, setSelected] = useState<{ laneId: string; barId: string } | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const errors = useMemo(() => validateTimeline(timeline), [timeline]);
  const selectedLane = timeline.lanes.find(lane => lane.id === selected?.laneId);
  const selectedBar = selectedLane?.bars.find(bar => bar.id === selected?.barId);
  const workstreamWidth = 280;
  const columnWidth = timeline.cadence === "week" ? 112 : 88;
  const unitLabel = timeline.cadence === "week" ? "week" : "month";
  const unitLabelTitle = timeline.cadence === "week" ? "Week" : "Month";
  const canvasWidth = Math.max(1040, workstreamWidth + timeline.columns.length * columnWidth);

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
      if (announce) toast.error("That change would overlap another activity in this workstream.");
      return false;
    }
    changeLane(laneId, item => ({ ...item, bars: item.bars.map(bar => (bar.id === barId ? next : bar)) }));
    return true;
  };

  const beginDrag = (event: React.PointerEvent, laneId: string, activity: TimelineBar, mode: "move" | "start" | "end") => {
    event.preventDefault();
    event.stopPropagation();
    setSelected({ laneId, barId: activity.id });
    const row = rowRefs.current[laneId];
    if (!row) return;
    const startX = event.clientX;
    const start = activity.startCol;
    const end = activity.endCol;
    const windowWidth = row.getBoundingClientRect().width / timeline.columns.length;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = Math.round((moveEvent.clientX - startX) / windowWidth);
      if (!delta) return;
      const next = applyTimelineGesture(timeline, laneId, activity.id, mode, delta);
      if (next !== timeline) onChange(next);
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
    onChange({ ...timeline, lanes: [...timeline.lanes, { id: laneId, name: "New Workstream", bars: [] }] });
  };

  const addBar = (laneId: string) => {
    const lane = timeline.lanes.find(item => item.id === laneId);
    if (!lane) return;
    let startCol = 1;
    while (startCol <= timeline.columns.length && lane.bars.some(item => startCol < item.endCol && startCol + 1 > item.startCol)) startCol += 1;
    if (startCol > timeline.columns.length) return toast.error(`This workstream has no open ${unitLabel}. Add another workstream for concurrent activity.`);
    const next: TimelineBar = { id: id("activity"), startCol, endCol: startCol + 1, color: "blue", label: "Custom Plan", milestone: false, deferred: false };
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
          <div className="flex items-center gap-2"><CalendarRange className="size-5 text-[#c8102e]" /><h2 className="text-lg font-semibold text-slate-950">{title}</h2></div>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <Button variant="outline" onClick={addLane}><Plus className="size-4" /> Add Workstream</Button>
      </div>

      {errors.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{errors[0]}</div>}

      <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label={`${title} ${unitLabel} grid`}>
        <div style={{ width: canvasWidth }}>
          <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `${workstreamWidth}px repeat(${timeline.columns.length}, minmax(${columnWidth}px,1fr))` }}>
            <div className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Workstream</div>
            {timeline.columns.map((column, index) => <div key={`${column}-${index}`} className="border-l border-slate-200 px-2 py-3 text-center text-[11px] font-semibold leading-tight text-slate-600">{column}</div>)}
          </div>

          {timeline.lanes.map((lane, laneIndex) => (
            <div key={lane.id} className="grid min-h-[88px] border-b border-slate-100 last:border-b-0" style={{ gridTemplateColumns: `${workstreamWidth}px repeat(${timeline.columns.length}, minmax(${columnWidth}px,1fr))` }}>
              <div className="sticky left-0 z-10 flex flex-col justify-center gap-1 border-r border-slate-200 bg-white px-2 py-2 shadow-[6px_0_10px_-10px_rgba(15,23,42,.5)]">
                <div className="flex min-w-0 items-center gap-1">
                  <GripVertical className="size-4 shrink-0 text-slate-300" />
                  <Input value={lane.name} onChange={event => changeLane(lane.id, item => ({ ...item, name: event.target.value }))} onBlur={event => changeLane(lane.id, item => ({ ...item, name: normalizeWorkstreamLabel(event.target.value) }))} className="h-8 min-w-0 border-transparent bg-transparent px-1 text-xs font-semibold shadow-none focus-visible:border-slate-200" aria-label="Workstream name" />
                </div>
                <div className="flex justify-end">
                  <Button size="icon" variant="ghost" className="size-7" disabled={laneIndex === 0} onClick={() => moveLane(lane.id, -1)} aria-label="Move workstream up"><ArrowUp className="size-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="size-7" disabled={laneIndex === timeline.lanes.length - 1} onClick={() => moveLane(lane.id, 1)} aria-label="Move workstream down"><ArrowDown className="size-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="size-7" onClick={() => addBar(lane.id)} aria-label="Add activity"><Plus className="size-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="size-7 text-red-600" disabled={timeline.lanes.length === 1} onClick={() => onChange({ ...timeline, lanes: timeline.lanes.filter(item => item.id !== lane.id) })} aria-label="Delete workstream"><Trash2 className="size-3.5" /></Button>
                </div>
              </div>

              <div
                ref={node => { rowRefs.current[lane.id] = node; }}
                className="relative grid items-center bg-white"
                style={{
                  gridColumn: `2 / ${timeline.columns.length + 2}`,
                  gridTemplateColumns: `repeat(${timeline.columns.length}, minmax(${columnWidth}px,1fr))`,
                  backgroundImage: "linear-gradient(to right, transparent calc(100% - 1px), #e2e8f0 calc(100% - 1px))",
                  backgroundSize: `${100 / timeline.columns.length}% 100%`,
                }}
              >
                {lane.bars.map(activity => (
                  <div
                    key={activity.id}
                    className={cn("group relative z-[1] my-2 flex min-h-12 cursor-grab touch-none select-none items-center overflow-hidden rounded-lg border px-4 text-[11px] font-semibold leading-tight shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing", colorClasses[activity.color], selected?.barId === activity.id && "ring-2 ring-slate-950 ring-offset-2")}
                    style={{ gridColumn: `${activity.startCol} / ${activity.endCol}` }}
                    onClick={() => setSelected({ laneId: lane.id, barId: activity.id })}
                    onPointerDown={event => beginDrag(event, lane.id, activity, "move")}
                    title={`${activity.label}: ${timeline.columns[activity.startCol - 1]} to ${timeline.columns[Math.max(activity.startCol - 1, activity.endCol - 2)]}${activity.outcome ? `\nIntended outcome: ${activity.outcome}` : ""}${activity.dependsOn ? `\n${activity.dependsOn}` : ""}`}
                  >
                    <button className="absolute inset-y-0 left-0 w-3 cursor-ew-resize touch-none border-r border-black/10 bg-black/10 sm:w-2" onPointerDown={event => beginDrag(event, lane.id, activity, "start")} aria-label={`Resize ${activity.label} start`} />
                    <span className="truncate">{activity.milestone && "◆ "}{activity.label}</span>
                    <button className="absolute inset-y-0 right-0 w-3 cursor-ew-resize touch-none border-l border-black/10 bg-black/10 sm:w-2" onPointerDown={event => beginDrag(event, lane.id, activity, "end")} aria-label={`Resize ${activity.label} end`} />
                  </div>
                ))}
                {lane.bars.length === 0 && <button className="col-span-full m-3 rounded-lg border border-dashed border-slate-300 py-3 text-xs text-slate-500 hover:border-slate-500" onClick={() => addBar(lane.id)}>Add the First Activity</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedBar && selectedLane && (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto_auto] md:items-end">
          <label className="space-y-1 text-xs font-semibold text-slate-600">Activity Name<Input value={selectedBar.label} onChange={event => changeBar(selectedLane.id, selectedBar.id, { label: event.target.value })} onBlur={event => changeBar(selectedLane.id, selectedBar.id, { label: normalizeActivityLabel(event.target.value) })} /></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Start {unitLabelTitle}<Select value={String(selectedBar.startCol)} onValueChange={value => changeBar(selectedLane.id, selectedBar.id, { startCol: Number(value) }, true)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{timeline.columns.map((window, index) => <SelectItem key={`${window}-start-${index}`} value={String(index + 1)}>{window}</SelectItem>)}</SelectContent></Select></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">End {unitLabelTitle}<Select value={String(selectedBar.endCol)} onValueChange={value => changeBar(selectedLane.id, selectedBar.id, { endCol: Number(value) }, true)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{timeline.columns.map((window, index) => <SelectItem key={`${window}-end-${index}`} value={String(index + 2)}>{window}</SelectItem>)}</SelectContent></Select></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Color<Select value={selectedBar.color} onValueChange={color => changeBar(selectedLane.id, selectedBar.id, { color: color as TimelineBar["color"], deferred: color === "deferred" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TIMELINE_COLORS.map(color => <SelectItem key={color} value={color}>{color[0].toUpperCase() + color.slice(1)}</SelectItem>)}</SelectContent></Select></label>
          <Tooltip><TooltipTrigger asChild><label className="flex h-10 items-center gap-2 text-xs font-semibold text-slate-600"><Switch checked={selectedBar.milestone} onCheckedChange={milestone => changeBar(selectedLane.id, selectedBar.id, { milestone })} /><Flag className="size-4" /></label></TooltipTrigger><TooltipContent>Milestone Marker</TooltipContent></Tooltip>
          <Button variant="ghost" className="text-red-600" onClick={() => { changeLane(selectedLane.id, lane => ({ ...lane, bars: lane.bars.filter(bar => bar.id !== selectedBar.id) })); setSelected(null); }}><Trash2 className="size-4" /> Remove</Button>
          {selectedBar.outcome && <div className="md:col-span-full rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-950"><span className="font-semibold">Intended outcome:</span> {selectedBar.outcome}</div>}
          {selectedBar.dependsOn && <div className="md:col-span-full rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-950"><span className="font-semibold">Dependency or entry condition:</span> {selectedBar.dependsOn.replace(/^Enabled by Year 1:\s*/, "")}</div>}
        </div>
      )}
    </section>
  );
}
