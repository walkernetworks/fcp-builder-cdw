import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ROLE_VIEW_LABELS, type VsaRole } from "@shared/vsaViews";
import { CalendarClock, FileText, KanbanSquare, Upload } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { CdwLogo } from "./elements";

const NAV = [
  { href: "/", label: "Board", icon: KanbanSquare },
  { href: "/expiry", label: "Expiry", icon: CalendarClock },
  { href: "/fcp", label: "FCP workspace", icon: FileText },
  { href: "/import", label: "Import", icon: Upload },
] as const;

export const PROPRIETARY_LEGEND = "CDW — Proprietary and confidential. Copying restricted.";

/** App chrome for every signed-in view: logo, navigation, role view, and the proprietary legend. */
export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const setRole = trpc.auth.setVsaRole.useMutation({ onSuccess: () => utils.auth.me.invalidate(), onError: error => toast.error(error.message) });

  // Every data mount must declare its state; one that rendered nothing is a defect, so say so loudly in development.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const timer = window.setTimeout(() => {
      const silent = Array.from(document.querySelectorAll("[data-tile-mount]:not([data-state])"));
      if (silent.length) console.error("TILE AUDIT FAILED: mounts without data-state", silent.map(element => element.id));
    }, 1500);
    return () => window.clearTimeout(timer);
  });

  return (
    <div className="flex min-h-screen flex-col bg-s50">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-5 border-b border-s100 bg-white px-5">
        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="VSA Tracker home">
          <CdwLogo className="w-[52px] text-cdw-red" />
          <span className="hidden border-l border-s100 pl-3 text-sm font-extrabold tracking-tight text-ink sm:inline">VSA Tracker</span>
        </Link>
        <nav className="flex h-full items-stretch gap-5 overflow-x-auto" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href} className="nav-link" aria-current={active ? "page" : undefined}>
                <Icon className="size-4" aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <label className="hidden items-center gap-2 text-xs font-semibold text-ink-muted md:flex">
            View
            <select
              className="h-8 rounded-full border border-s200 bg-white px-3 text-xs font-semibold text-ink"
              value={user?.vsaRole ?? ""}
              onChange={event => setRole.mutate({ vsaRole: (event.target.value || null) as VsaRole | null })}
              disabled={setRole.isPending}
            >
              <option value="">All records</option>
              {(Object.keys(ROLE_VIEW_LABELS) as VsaRole[]).map(role => <option key={role} value={role}>{ROLE_VIEW_LABELS[role]}</option>)}
            </select>
          </label>
          <span className="hidden max-w-[180px] truncate text-xs font-semibold text-ink lg:inline">{user?.name}</span>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-s100 bg-white px-5 py-3">
        <p className="proprietary-legend">{PROPRIETARY_LEGEND}</p>
      </footer>
    </div>
  );
}
