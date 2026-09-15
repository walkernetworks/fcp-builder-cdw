import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { applyTimelineGesture, applyWorkstreamPresentation, colorForWorkstreamType, DELIVERY_ROLE_BY_WORKSTREAM, FIXED_GANTT_CATEGORIES, normalizeActivityLabel, validateTimeline, WORKSTREAM_TYPES, WORKSTREAM_TYPE_COLORS, type Timeline, type TimelineBar } from "@shared/fcp";
import { CalendarRange, Flag, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const colorClasses: Record<string, string> = {
  slate: "bg-slate-700 text-white border-slate-800",
  blue: "bg-[#315b8a] text-white border-[#25476d]",
  teal: "bg-[#2f736e] text-white border-[#235752]",
  amber: "bg-[#d99a1f] text-slate-950 border-[#b87912]",
  red: "bg-[#b42339] text-white border-[#8f1b2c]",
  green: "bg-[#2d6a4f] text-white border-[#21503b]",
  gate: "bg-[#6b4f8a] text-white border-[#513a6c]",
  deferred: "bg-slate-200 text-slate-600 border-slate-400 border-dashed",
};

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type Props = {
  timeline: Timeline;
  onChange: (timeline: Timeline) => void;
  title?: string;
  description?: string;
};

type TimelineLane = Timeline["lanes"][number];
type CategoryActivity = { lane: TimelineLane; activity: TimelineBar; track: number };

const workstreamDefaultsByCategory: Record<TimelineLane["category"], TimelineLane["workstreamType"][]> = {
  "Program Management & Governance": ["Governance", "Operating Model / Platform"],
  "Modernize Infrastructure": ["Infrastructure Build", "Migration Waves", "Operating Model / Platform"],
  Operations: ["Operating Model / Platform", "Governance"],
  "Modernize Cloud": ["Consume / Handover", "Migration Waves"],
  "Modernize Security & Resilience": ["Security & Resiliency", "Operating Model / Platform"],
};

function layoutCategoryActivities(lanes: TimelineLane[]): CategoryActivity[] {
  const trackEnds: number[] = [];
  return lanes
    .flatMap(lane => lane.bars.map(activity => ({ lane, activity })))
    .sort((left, right) => left.activity.startCol - right.activity.startCol || left.activity.endCol - right.activity.endCol || left.activity.label.localeCompare(right.activity.label))
    .map(item => {
      const availableTrack = trackEnds.findIndex(endCol => endCol <= item.activity.startCol);
      const track = availableTrack === -1 ? trackEnds.length : availableTrack;
      trackEnds[track] = item.activity.endCol;
      return { ...item, track };
    });
}

export function AdoptionTimelineEditor({
  timeline,
  onChange,
  title = "Adoption Timeline",
  description = "Use the five delivery categories to coordinate staffable work packages. Each workstream carries a lead resource role, and packages may overlap when delivery can proceed concurrently. Drag a package to move it and drag either edge to resize its staffing window.",
}: Props) {
  const [selected, setSelected] = useState<{ laneId: string; barId: string } | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const errors = useMemo(() => validateTimeline(timeline), [timeline]);
  const selectedLane = timeline.lanes.find(lane => lane.id === selected?.laneId);
  const selectedBar = selectedLane?.bars.find(bar => bar.id === selected?.barId);
  const workstreamWidth = 240;
  const columnWidth = timeline.cadence === "week" ? 112 : 88;
  const unitLabel = timeline.cadence === "week" ? "week" : "month";
  const unitLabelTitle = timeline.cadence === "week" ? "Week" : "Month";
  const canvasWidth = Math.max(1040, workstreamWidth + timeline.columns.length * columnWidth);
  const categoryGroups = useMemo(() => {
    const groups = new Map<TimelineLane["category"], TimelineLane[]>(FIXED_GANTT_CATEGORIES.map(category => [category, []]));
    timeline.lanes.forEach(lane => {
      const existing = groups.get(lane.category);
      if (existing) existing.push(lane);
    });
    return FIXED_GANTT_CATEGORIES.map(category => {
      const lanes = groups.get(category) || [];
      const activities = layoutCategoryActivities(lanes);
      return { category, lanes, activities, trackCount: Math.max(1, ...activities.map(item => item.track + 1)) };
    });
  }, [timeline.lanes]);

  const changeLane = (laneId: string, updater: (lane: TimelineLane) => TimelineLane) => {
    onChange(applyWorkstreamPresentation({ ...timeline, lanes: timeline.lanes.map(lane => (lane.id === laneId ? updater(lane) : lane)) }));
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
    changeLane(laneId, item => ({ ...item, bars: item.bars.map(bar => (bar.id === barId ? next : bar)) }));
    return true;
  };

  const beginDrag = (event: React.PointerEvent, laneId: string, activity: TimelineBar, mode: "move" | "start" | "end", category: TimelineLane["category"]) => {
    event.preventDefault();
    event.stopPropagation();
    setSelected({ laneId, barId: activity.id });
    const row = rowRefs.current[category];
    if (!row) return;
    const startX = event.clientX;
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

  const addLane = (category: TimelineLane["category"] = "Program Management & Governance") => {
    const laneId = id("lane");
    const barId = id("activity");
    const represented = new Set(timeline.lanes.filter(lane => lane.category === category).map(lane => lane.workstreamType));
    const workstreamType = workstreamDefaultsByCategory[category].find(type => !represented.has(type)) || WORKSTREAM_TYPES.find(type => !represented.has(type)) || "Governance";
    const next: TimelineLane = {
      id: laneId,
      name: workstreamType,
      category,
      workstreamType,
      bars: [{ id: barId, startCol: 1, endCol: 2, color: colorForWorkstreamType(workstreamType), label: "Custom Work Package", milestone: false, deferred: false }],
    };
    onChange(applyWorkstreamPresentation({ ...timeline, lanes: [...timeline.lanes, next] }));
    setSelected({ laneId, barId });
  };

  const moveBarToWorkstream = (laneId: string, barId: string, workstreamType: TimelineLane["workstreamType"]) => {
    const sourceLane = timeline.lanes.find(lane => lane.id === laneId);
    const sourceBar = sourceLane?.bars.find(bar => bar.id === barId);
    if (!sourceLane || !sourceBar || sourceLane.workstreamType === workstreamType) return;

    const existingTarget = timeline.lanes.find(lane => lane.category === sourceLane.category && lane.workstreamType === workstreamType);
    const targetLaneId = existingTarget?.id || id("lane");
    const movedBar: TimelineBar = { ...sourceBar, color: colorForWorkstreamType(workstreamType) };
    const nextLanes = timeline.lanes
      .map(lane => {
        if (lane.id === sourceLane.id) return { ...lane, bars: lane.bars.filter(bar => bar.id !== barId) };
        if (lane.id === existingTarget?.id) return { ...lane, bars: [...lane.bars, movedBar] };
        return lane;
      })
      .filter(lane => lane.id === existingTarget?.id || lane.id !== sourceLane.id || lane.bars.length > 0);

    if (!existingTarget) {
      nextLanes.push({ id: targetLaneId, name: workstreamType, category: sourceLane.category, workstreamType, bars: [movedBar] });
    }
    onChange(applyWorkstreamPresentation({ ...timeline, lanes: nextLanes }));
    setSelected({ laneId: targetLaneId, barId });
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><CalendarRange className="size-5 text-[#c8102e]" /><h2 className="text-lg font-semibold text-slate-950">{title}</h2></div>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Delivery workstream color legend"><span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Delivery workstream key</span>{WORKSTREAM_TYPES.map(type => <span key={type} title={`Lead role: ${DELIVERY_ROLE_BY_WORKSTREAM[type]}`} className={cn("inline-flex items-center gap-1 border px-2 py-1 text-[10px] font-semibold", colorClasses[WORKSTREAM_TYPE_COLORS[type]])}><span className="size-2 rounded-full border border-current/25 bg-current/35" />{type}</span>)}</div>
        </div>
        <Button variant="outline" onClick={() => addLane()}><Plus className="size-4" /> Add Work Package</Button>
      </div>

      {errors.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{errors[0]}</div>}

      <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label={`${title} ${unitLabel} grid`}>
        <div style={{ width: canvasWidth }}>
          <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `${workstreamWidth}px repeat(${timeline.columns.length}, minmax(${columnWidth}px,1fr))` }}>
            <div className="sticky left-0 z-20 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Delivery category</div>
            {timeline.columns.map((column, index) => <div key={`${column}-${index}`} className="border-l border-slate-200 px-2 py-3 text-center text-[11px] font-semibold leading-tight text-slate-600">{column}</div>)}
          </div>

          {categoryGroups.map(group => (
            <div key={group.category} className="grid border-b border-slate-200 last:border-b-0" style={{ gridTemplateColumns: `${workstreamWidth}px repeat(${timeline.columns.length}, minmax(${columnWidth}px,1fr))` }}>
              <div className="sticky left-0 z-10 flex min-h-full items-center justify-between gap-2 border-r border-slate-200 bg-slate-50 px-4 py-3 shadow-[6px_0_10px_-10px_rgba(15,23,42,.5)]">
                <div className="min-w-0 space-y-1.5"><strong className="block text-sm font-bold leading-snug text-slate-800">{group.category}</strong><div className="flex flex-wrap gap-1">{group.lanes.filter(lane => lane.bars.length > 0).map(lane => <span key={lane.id} title={`Lead role: ${DELIVERY_ROLE_BY_WORKSTREAM[lane.workstreamType]}`} className={cn("border px-1.5 py-0.5 text-[9px] font-bold leading-none", colorClasses[WORKSTREAM_TYPE_COLORS[lane.workstreamType]])}>{lane.workstreamType}</span>)}</div></div>
                <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="size-7 shrink-0 text-slate-500" onClick={() => addLane(group.category)} aria-label={`Add work package to ${group.category}`}><Plus className="size-3.5" /></Button></TooltipTrigger><TooltipContent>Add work package</TooltipContent></Tooltip>
              </div>

              <div
                ref={node => { rowRefs.current[group.category] = node; }}
                className="relative grid bg-white"
                style={{
                  gridColumn: `2 / ${timeline.columns.length + 2}`,
                  gridTemplateColumns: `repeat(${timeline.columns.length}, minmax(${columnWidth}px,1fr))`,
                  gridTemplateRows: `repeat(${group.trackCount}, minmax(52px, 1fr))`,
                  minHeight: Math.max(84, group.trackCount * 58 + 12),
                  backgroundImage: "linear-gradient(to right, transparent calc(100% - 1px), #e2e8f0 calc(100% - 1px))",
                  backgroundSize: `${100 / timeline.columns.length}% 100%`,
                }}
              >
                {group.activities.map(({ lane, activity, track }) => (
                  <div
                    key={activity.id}
                    className={cn("group relative z-[1] m-1.5 flex min-h-10 cursor-grab touch-none select-none items-center overflow-hidden rounded-lg border px-4 text-[11px] font-semibold leading-tight shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing", colorClasses[activity.color], selected?.barId === activity.id && "ring-2 ring-slate-950 ring-offset-2")}
                    style={{ gridColumn: `${activity.startCol} / ${activity.endCol}`, gridRow: track + 1 }}
                    onClick={() => setSelected({ laneId: lane.id, barId: activity.id })}
                    onPointerDown={event => beginDrag(event, lane.id, activity, "move", group.category)}
                    aria-label={`${lane.workstreamType}: ${activity.label}. Lead role ${DELIVERY_ROLE_BY_WORKSTREAM[lane.workstreamType]}. ${timeline.columns[activity.startCol - 1]} to ${timeline.columns[Math.max(activity.startCol - 1, activity.endCol - 2)]}`}
                    title={`${lane.workstreamType}: ${activity.label}\nLead role: ${DELIVERY_ROLE_BY_WORKSTREAM[lane.workstreamType]}\n${timeline.columns[activity.startCol - 1]} to ${timeline.columns[Math.max(activity.startCol - 1, activity.endCol - 2)]}${activity.outcome ? `\nIntended outcome: ${activity.outcome}` : ""}${activity.dependsOn ? `\n${activity.dependsOn}` : ""}`}
                  >
                    <button className="absolute inset-y-0 left-0 w-3 cursor-ew-resize touch-none border-r border-black/10 bg-black/10 sm:w-2" onPointerDown={event => beginDrag(event, lane.id, activity, "start", group.category)} aria-label={`Resize ${activity.label} start`} />
                    <span className="truncate">{activity.milestone && "◆ "}{activity.label}</span>
                    <button className="absolute inset-y-0 right-0 w-3 cursor-ew-resize touch-none border-l border-black/10 bg-black/10 sm:w-2" onPointerDown={event => beginDrag(event, lane.id, activity, "end", group.category)} aria-label={`Resize ${activity.label} end`} />
                  </div>
                ))}
                {group.activities.length === 0 && <button className="col-span-full m-3 border border-dashed border-slate-300 py-3 text-xs text-slate-500 hover:border-slate-500" onClick={() => addLane(group.category)}>Add the First Work Package</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedBar && selectedLane && (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto_auto] lg:items-end">
          <label className="space-y-1 text-xs font-semibold text-slate-600">Work Package Name<Input value={selectedBar.label} onChange={event => changeBar(selectedLane.id, selectedBar.id, { label: event.target.value })} onBlur={event => changeBar(selectedLane.id, selectedBar.id, { label: normalizeActivityLabel(event.target.value) })} /></label>
          <div className="space-y-1 text-xs font-semibold text-slate-600"><span>Category</span><div className="flex h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700" aria-label="Fixed category">{selectedLane.category}</div></div>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Delivery Workstream<Select value={selectedLane.workstreamType} onValueChange={workstreamType => moveBarToWorkstream(selectedLane.id, selectedBar.id, workstreamType as TimelineLane["workstreamType"])}><SelectTrigger className={cn("text-xs font-semibold", colorClasses[WORKSTREAM_TYPE_COLORS[selectedLane.workstreamType]])}><SelectValue /></SelectTrigger><SelectContent>{WORKSTREAM_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select><span className="block text-[10px] font-normal leading-tight text-slate-500">Lead role: {DELIVERY_ROLE_BY_WORKSTREAM[selectedLane.workstreamType]}</span></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">Start {unitLabelTitle}<Select value={String(selectedBar.startCol)} onValueChange={value => changeBar(selectedLane.id, selectedBar.id, { startCol: Number(value) }, true)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{timeline.columns.map((window, index) => <SelectItem key={`${window}-start-${index}`} value={String(index + 1)}>{window}</SelectItem>)}</SelectContent></Select></label>
          <label className="space-y-1 text-xs font-semibold text-slate-600">End {unitLabelTitle}<Select value={String(selectedBar.endCol)} onValueChange={value => changeBar(selectedLane.id, selectedBar.id, { endCol: Number(value) }, true)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{timeline.columns.map((window, index) => <SelectItem key={`${window}-end-${index}`} value={String(index + 2)}>{window}</SelectItem>)}</SelectContent></Select></label>
          <Tooltip><TooltipTrigger asChild><label className="flex h-10 items-center gap-2 text-xs font-semibold text-slate-600"><Switch checked={selectedBar.milestone} onCheckedChange={milestone => changeBar(selectedLane.id, selectedBar.id, { milestone })} /><Flag className="size-4" /></label></TooltipTrigger><TooltipContent>Milestone Marker</TooltipContent></Tooltip>
          <Button variant="ghost" className="text-red-600" onClick={() => { changeLane(selectedLane.id, lane => ({ ...lane, bars: lane.bars.filter(bar => bar.id !== selectedBar.id) })); setSelected(null); }}><Trash2 className="size-4" /> Remove</Button>
          {selectedBar.outcome && <div className="lg:col-span-full rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-950"><span className="font-semibold">Intended outcome:</span> {selectedBar.outcome}</div>}
          {selectedBar.dependsOn && <div className="lg:col-span-full rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-950"><span className="font-semibold">Delivery context and sequence:</span> {selectedBar.dependsOn}</div>}
        </div>
      )}
    </section>
  );
}
