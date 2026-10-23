import { Pill, type Verdict } from "@/components/vsa/elements";
import type { Provenance, ProvenanceState } from "@shared/provenance";
import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";

const VERDICT: Record<ProvenanceState, Verdict> = { confirmed: "ready", assumed: "warn", unknown: "unknown" };
const WORD: Record<ProvenanceState, string> = { confirmed: "Confirmed", assumed: "Assumed", unknown: "Unknown" };

/** Where a value comes from: confirmed, assumed (with the rule it uses), or unknown. An assumed value can be confirmed in place. */
export function ProvenancePill({ provenance, onConfirm, disabled }: { provenance: Provenance; onConfirm?: () => void; disabled?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
      <Pill verdict={VERDICT[provenance.state]} title={provenance.source}>{WORD[provenance.state]}</Pill>
      <span>{provenance.source}</span>
      {provenance.state === "assumed" && onConfirm && (
        <button type="button" disabled={disabled} className="font-medium text-ink underline-offset-2 hover:underline disabled:opacity-50" onClick={onConfirm}>Confirm</button>
      )}
    </span>
  );
}

/**
 * Values that never print: a visibly separate panel with a lock and an "Internal" tag, so nobody has to wonder whether
 * a number reaches the customer. The FCP renderer never reads what is shown here.
 */
export function InternalPanel({ title, sub, children }: { title: string; sub: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-dashed border-s300 bg-surface-sunken p-4" aria-label={`${title} (internal, never prints)`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><LockKeyhole className="size-4 text-ink-muted" aria-hidden /> {title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-ink-muted">{sub}</p>
        </div>
        <span className="chip"><LockKeyhole className="size-3" aria-hidden /> Internal · never prints</span>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
