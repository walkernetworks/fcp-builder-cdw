import { useAuth } from "@/_core/hooks/useAuth";
import { CdwLogo, Orbit } from "@/components/vsa/elements";
import { Loader2, LockKeyhole } from "lucide-react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-s50"><div className="flex items-center gap-3 text-sm font-semibold text-ink-muted"><Loader2 className="size-5 animate-spin text-cdw-red" /> Establishing secure session…</div></div>;
  }

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-s50 px-6">
        <section className="hero-band w-full max-w-md p-8">
          <Orbit />
          <div className="flex items-center justify-between">
            <CdwLogo className="w-[72px] text-white" />
            <span className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] opacity-85"><LockKeyhole className="size-3.5" /> Protected</span>
          </div>
          <p className="mah-eyebrow mt-12">VSA Tracker</p>
          <h1 className="mah-head mt-2">Sign in through CDW single sign-on.</h1>
          <p className="mah-lead mt-4">No signed-in identity reached the app. Open it through the CDW single sign-on address, which signs you in before the app loads.</p>
          <p className="mt-6 text-[11px] opacity-80">No local passwords · Session protected · Internal use</p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
