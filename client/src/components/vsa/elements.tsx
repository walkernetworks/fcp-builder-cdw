/**
 * CDW design system elements for the application surface (cdw-report-design references/elements.md).
 * Class names match the design vocabulary; styles live in index.css under "Element set".
 */
import logoSvg from "@/assets/brand/cdw-logo-currentcolor.svg?raw";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, CircleHelp, Inbox, OctagonX, RefreshCw, Wrench, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** The official mark, with its registered symbol. Inherits `color`; never redrawn. */
export function CdwLogo({ className, label = "CDW" }: { className?: string; label?: string }) {
  return <span className={cn("cdw-logo block", className)} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: logoSvg }} />;
}

/** The orbit: the mark as a low-opacity graphic behind a red field. */
export function Orbit() {
  return <span aria-hidden className="mah-orbit" dangerouslySetInnerHTML={{ __html: logoSvg }} />;
}

export type Verdict = "go" | "ready" | "warn" | "stop" | "refresh" | "remediate" | "unknown";
const VERDICT_ICON: Record<Verdict, LucideIcon> = { go: CheckCircle2, ready: CheckCircle2, warn: AlertTriangle, stop: OctagonX, refresh: RefreshCw, remediate: Wrench, unknown: CircleHelp };

/** A verdict: always a word and an icon, never color alone. */
export function Pill({ verdict, children, title }: { verdict: Verdict; children: ReactNode; title?: string }) {
  const Icon = VERDICT_ICON[verdict];
  return (
    <span className={`pill pill-${verdict}`} title={title}>
      <Icon className="size-3" aria-hidden /> {children}
    </span>
  );
}

/** A label or a filter. Neutral; never colored by state. */
export function Chip({ children, pressed, onClick, title }: { children: ReactNode; pressed?: boolean; onClick?: () => void; title?: string }) {
  if (onClick) return <button type="button" className="chip" aria-pressed={pressed ?? false} onClick={onClick} title={title}>{children}</button>;
  return <span className="chip" title={title}>{children}</span>;
}

export function EmptyState({ icon: Icon = Inbox, title, sub, action }: { icon?: LucideIcon; title: string; sub: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="es-icon"><Icon className="size-4" aria-hidden /></span>
      <p className="es-title">{title}</p>
      <p className="es-sub">{sub}</p>
      {action && <div className="es-cta mt-1">{action}</div>}
    </div>
  );
}

/** A headline number with its basis. `sub` states how the figure was derived. */
export function KpiCard({ label, value, sub }: { label: string; value: ReactNode; sub: ReactNode }) {
  return (
    <div className="kpi-card">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      <p className="kpi-sub">{sub}</p>
    </div>
  );
}

export function HeroKpi({ label, value, sub, compact }: { label: string; value: ReactNode; sub: ReactNode; compact?: boolean }) {
  return (
    <div className="hero-kpi-tile">
      <p className="hero-kpi-label">{label}</p>
      <p className={cn("hero-kpi-value", compact && "text-base leading-snug")}>{value}</p>
      <p className="hero-kpi-sub">{sub}</p>
    </div>
  );
}

/** The red anchor field: eyebrow, headline, lead, and KPI tiles, with the orbit behind. */
export function HeroBand({ eyebrow, head, lead, children }: { eyebrow: string; head: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <section className="hero-band">
      <Orbit />
      <p className="mah-eyebrow">{eyebrow}</p>
      <h1 className="mah-head mt-2">{head}</h1>
      {lead && <p className="mah-lead mt-2">{lead}</p>}
      {children && <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>}
    </section>
  );
}

export function SectionBar({ label, title, children }: { label: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="section-bar">
      <div>
        <p className="sec-label">{label}</p>
        <h2 className="sec-title">{title}</h2>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

type QueryLike<T> = { data: T | undefined; isLoading: boolean; error: { message: string } | null; refetch: () => unknown };

/**
 * A data mount. Every mount renders exactly one of loading, error, empty, or ready, and says which in `data-state`,
 * so a mount that rendered nothing is detectable (see the audit in AppShell).
 */
export function DataMount<T>({ id, query, isEmpty, empty, children, className }: {
  id: string;
  query: QueryLike<T>;
  isEmpty?: (data: T) => boolean;
  empty: { icon?: LucideIcon; title: string; sub: string; action?: ReactNode };
  children: (data: T) => ReactNode;
  className?: string;
}) {
  const state = query.isLoading ? "loading" : query.error ? "error" : query.data === undefined || (isEmpty?.(query.data) ?? false) ? "empty" : "ready";
  return (
    <div id={id} data-tile-mount data-state={state} className={className}>
      {state === "loading" && <div className="h-28 animate-pulse rounded-xl bg-s100/60" aria-label="Loading" />}
      {state === "error" && <EmptyState icon={OctagonX} title="Could not load" sub={query.error!.message} action={<Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry</Button>} />}
      {state === "empty" && <EmptyState {...empty} />}
      {state === "ready" && children(query.data as T)}
    </div>
  );
}
