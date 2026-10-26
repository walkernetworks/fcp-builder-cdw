import { useAuth } from "@/_core/hooks/useAuth";
import { CdwLogo } from "@/components/vsa/elements";
import { Loader2, LockKeyhole } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-s50"><div className="flex items-center gap-3 text-sm font-semibold text-ink-muted"><Loader2 className="size-4 animate-spin text-ink-muted" /> Establishing secure session…</div></div>;
  }

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-s50 px-6">
        <section className="panel w-full max-w-sm p-8">
          <div className="flex items-center justify-between">
            <CdwLogo className="w-[56px] text-cdw-red" />
            <span className="chip"><LockKeyhole className="size-3" aria-hidden /> Protected</span>
          </div>
          <p className="mt-10 text-xs font-medium text-ink-muted">VSA Tracker</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">Sign in through CDW single sign-on</h1>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">No signed-in identity reached the app. Open it through the CDW single sign-on address, which signs you in before the app loads.</p>
          <p className="mt-6 border-t border-s100 pt-4 text-[11px] text-ink-subtle">No local passwords · Session protected · Internal use</p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
