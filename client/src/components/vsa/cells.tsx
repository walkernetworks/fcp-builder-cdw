import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { attentionFor } from "@/lib/pipeline";
import { SEGMENT_LABELS, type TrackerRow } from "@/lib/vsa";
import { expiryBand, EXPIRY_BANDS } from "@shared/vsaDashboard";
import { STAGE_LABELS, type Stage } from "@shared/vsaStage";
import { formatDay } from "@shared/vsaViews";
import { Pill, type Verdict } from "./elements";

const HEALTH_VERDICT: Record<NonNullable<TrackerRow["health"]>, { verdict: Verdict; label: string }> = {
  green: { verdict: "go", label: "Green" },
  yellow: { verdict: "warn", label: "Yellow" },
  red: { verdict: "stop", label: "Red" },
};

export function HealthPill({ health }: { health: TrackerRow["health"] }) {
  if (!health) return <span className="text-ink-subtle">—</span>;
  const { verdict, label } = HEALTH_VERDICT[health];
  return <Pill verdict={verdict}>{label}</Pill>;
}

export function SegmentText({ segment }: { segment: TrackerRow["segment"] }) {
  return segment ? <span>{SEGMENT_LABELS[segment]}</span> : <Pill verdict="warn">Not set</Pill>;
}

/** Stage name, kept on one line. */
export function StageText({ stage }: { stage: Stage }) {
  return <span className="whitespace-nowrap">{STAGE_LABELS[stage]}</span>;
}

/** Days left as a verdict pill inside 90 days (and when expired); a plain number beyond. */
export function DaysLeft({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft === null) return <span className="text-ink-subtle">—</span>;
  const band = EXPIRY_BANDS.find(item => item.key === expiryBand(daysLeft))!;
  if (band.risk === "stop") return <Pill verdict="stop">{daysLeft < 0 ? `Expired ${-daysLeft}d ago` : `${daysLeft}d`}</Pill>;
  if (band.risk === "warn") return <Pill verdict="warn">{daysLeft}d</Pill>;
  return <span className="tabular text-ink-muted">{daysLeft}d</span>;
}

export function ExpiryCell({ day, daysLeft }: { day: string | null; daysLeft: number | null }) {
  if (!day) return <span className="text-ink-subtle">—</span>;
  return (
    <span className="flex items-center justify-end gap-2 whitespace-nowrap">
      <span className="tabular">{formatDay(day)}</span>
      <DaysLeft daysLeft={daysLeft} />
    </span>
  );
}

/** One pill for everything that needs attention, with the full list on hover and focus. */
export function AttentionPill({ attention }: { attention: ReturnType<typeof attentionFor> }) {
  if (attention.count === 0) return <span className="text-ink-subtle">—</span>;
  const lines = [...attention.flags.map(flag => flag.label), ...(attention.stale.stale ? [`${attention.stale.days} days in stage (over ${attention.stale.threshold})`] : []), ...attention.warnings];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-sm focus-visible:outline-2" aria-label={lines.join("; ")}>
          <Pill verdict="warn">{attention.count} {attention.count === 1 ? "issue" : "issues"}</Pill>
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs">
        <ul className="space-y-0.5 text-xs">{lines.map(line => <li key={line}>{line}</li>)}</ul>
      </TooltipContent>
    </Tooltip>
  );
}
