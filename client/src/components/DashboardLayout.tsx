import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { Loader2, LockKeyhole } from "lucide-react";
import { getOAuthHandoffUrl, MANUS_SIGN_IN_LABEL } from "@/lib/auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const signInHandoff = typeof window === "undefined" ? null : getOAuthHandoffUrl({
    currentOrigin: window.location.origin,
    configuredAppOrigin: import.meta.env.VITE_APP_ORIGIN,
    currentPath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
  });

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-slate-950"><div className="flex items-center gap-3 text-sm text-slate-300"><Loader2 className="size-5 animate-spin text-[#ef233c]" /> Establishing secure session…</div></div>;
  }

  if (!user) {
    return (
      <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#0b1f37] px-6 text-white">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="absolute -right-28 -top-28 size-[420px] rounded-full bg-[#c8102e]/25 blur-3xl" />
        <section className="relative w-full max-w-md rounded-3xl border border-white/15 bg-white/[0.08] p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between"><div className="rounded-md bg-[#c8102e] px-3 py-1.5 text-lg font-black tracking-[-0.08em]">CDW</div><div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-300"><LockKeyhole className="size-3.5" /> Protected</div></div>
          <p className="mt-12 text-xs font-bold uppercase tracking-[0.2em] text-red-300">Functional Consumption Plan</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Build governed FCPs in one secure workspace.</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">{signInHandoff ? "This temporary preview will open the approved FCP address before sign-in so the session callback stays on the allowed domain." : "Sign in with your Manus account to open the FCP workspace and manage customer-ready plans."}</p>
          <Button size="lg" className="mt-8 w-full bg-[#c8102e] text-white hover:bg-[#a80d27]" onClick={() => startLogin()}>{signInHandoff ? "Continue to secure sign in" : MANUS_SIGN_IN_LABEL}</Button>
          <p className="mt-4 text-center text-[11px] text-slate-400">No local passwords · Session protected · Internal use</p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
