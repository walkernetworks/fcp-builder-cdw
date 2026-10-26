/**
 * The app's design elements (docs/VSA-TRACKER-UI.md). Class names match the design vocabulary; styles live in index.css
 * under "Element set".
 */
import logoSvg from "@/assets/brand/cdw-logo-currentcolor.svg?raw";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, CircleHelp, Inbox, OctagonX, RefreshCw, Wrench, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** The official mark, with its registered symbol. Inherits `color`; never redrawn. */
export function CdwLogo({ className, label = "CDW" }: { className?: string; label?: string }) {
  return <span className={cn("cdw-logo block", className)} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: logoSvg }} />;
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

/**
 * A stat tile: tiny label, big number, and one line that states its basis or its change. `keyMetric` gives the number
 * the accent; use it for at most one tile per row. `onClick` makes the tile a link to the records behind it.
 */
export function KpiCard({ label, value, sub, keyMetric, onClick, icon: Icon }: { label: string; value: ReactNode; sub: ReactNode; keyMetric?: boolean; onClick?: () => void; icon?: LucideIcon }) {
  const body = (
    <>
      <p className="kpi-label flex items-center gap-1.5">{Icon && <Icon className="size-3.5" aria-hidden />}{label}</p>
      <p className="kpi-value" data-key={keyMetric ? "true" : undefined}>{value}</p>
      <p className="kpi-sub">{sub}</p>
    </>
  );
  if (onClick) return <button type="button" onClick={onClick} className="kpi-card flex flex-col items-stretch justify-start text-left transition-colors hover:border-s200 hover:bg-surface-sunken/40">{body}</button>;
  return <div className="kpi-card">{body}</div>;
}

/** The top of every screen: title, one line of context, and the screen's actions on the right. */
export function PageHeader({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub mt-1">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** A bordered panel with a header row: title, optional context, and actions. */
export function Panel({ title, sub, actions, children, className, bodyClassName }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("panel flex min-w-0 flex-col", className)}>
      <header className="panel-head">
        <div className="min-w-0">
          <h2 className="panel-title">{title}</h2>
          {sub && <p className="panel-sub mt-0.5">{sub}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>
    </section>
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

/** A neutral header panel: eyebrow, headline, lead, and figure tiles. The FCP workspace uses it for the work plan. */
export function HeroBand({ eyebrow, head, lead, children }: { eyebrow: string; head: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <section className="hero-band">
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
      {state === "loading" && (
        <div className="space-y-2 p-1" aria-label="Loading" role="status">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
      {state === "error" && <EmptyState icon={OctagonX} title="Could not load" sub={query.error!.message} action={<Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry</Button>} />}
      {state === "empty" && <EmptyState {...empty} />}
      {state === "ready" && children(query.data as T)}
    </div>
  );
}
