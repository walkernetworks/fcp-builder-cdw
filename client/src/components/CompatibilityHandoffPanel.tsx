import { Badge } from "@/components/ui/badge";
import { summarizeCompatibilityHandoff, type HardwarePlatformAssessment, type VcfCompatibilityCohort } from "@shared/fcp";
import { ExternalLink } from "lucide-react";

const decisionStyle = {
  eligible: "border-emerald-200 bg-emerald-50 text-emerald-800",
  "validation-required": "border-amber-200 bg-amber-50 text-amber-800",
  "action-required": "border-red-200 bg-red-50 text-red-800",
} as const;

const evidenceStateLabels: Record<VcfCompatibilityCohort["evidenceState"], string> = {
  "verified-supported": "Verified supported",
  "verified-not-listed": "Target release not listed",
  "explicit-exclusion": "Explicit release exclusion",
  "cpu-evidence-required": "CPU evidence required",
  "identity-confirmation-required": "Identity confirmation required",
  "catalog-record-required": "Catalog record required",
  "source-refresh-required": "Catalog refresh required",
  "conflicting-evidence": "Conflicting evidence",
};

function releaseStyle(status: VcfCompatibilityCohort["releaseEvidence"][number]["status"]): string {
  if (status === "listed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "model-listed-cpu-unverified") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "unresolved") return "border-slate-300 bg-white text-slate-600";
  return "border-slate-200 bg-slate-100 text-slate-600";
}

function CohortEvidence({ cohort }: { cohort: VcfCompatibilityCohort }) {
  return <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={decisionStyle[cohort.decision]}>{cohort.decisionLabel}</Badge>
          <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">{evidenceStateLabels[cohort.evidenceState]}</Badge>
          <span className="text-xs text-slate-500">{cohort.evidenceConfidence} confidence · {cohort.hosts} host{cohort.hosts === 1 ? "" : "s"}</span>
        </div>
        <h5 className="mt-3 text-sm font-semibold text-slate-950">{cohort.vendor} {cohort.model}</h5>
        <p className="mt-1 text-xs text-slate-600">{cohort.cpuModel}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{cohort.releaseEvidence.map(release => <span key={release.release} className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${releaseStyle(release.status)}`}>{release.release}: {release.status.replace(/-/g, " ")}</span>)}</div>
      </div>
      <div className="max-w-lg text-xs leading-5 text-slate-700"><p>{cohort.reason}</p><p className="mt-2 font-semibold text-slate-900">{cohort.nextAction}</p></div>
    </div>
    <div className="mt-4 grid gap-3 border-t border-slate-200 pt-3 md:grid-cols-3">
      <p className="text-[11px] leading-5 text-slate-600"><strong>Catalog identity</strong><br />{cohort.matchedModel || "No deterministic model"}{cohort.matchedCpuSeries ? ` · ${cohort.matchedCpuSeries}` : ""}</p>
      <p className="text-[11px] leading-5 text-slate-600"><strong>Observed estate</strong><br />{cohort.observedEsxiVersions.map(item => `${item.version}: ${item.hosts}`).join("; ") || "ESXi version unavailable"}<br />{cohort.clusterMembership.map(item => `${item.name}: ${item.hosts}`).join("; ") || "Cluster correlation unavailable"}</p>
      <p className="text-[11px] leading-5 text-slate-600"><strong>Delivery evidence still required</strong><br />{cohort.requiredEvidence.join("; ")}</p>
    </div>
  </article>;
}

export function CompatibilityHandoffPanel({ platforms, estateHosts }: { platforms: HardwarePlatformAssessment[]; estateHosts: number }) {
  const handoff = summarizeCompatibilityHandoff(platforms, estateHosts);

  return <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-black uppercase tracking-[.14em] text-cdw-red">Presales-to-delivery evidence</p><h3 className="mt-1 text-base font-semibold text-slate-950">{handoff.targetRelease} estate posture</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">The maintained catalog establishes server-and-CPU release evidence. Configuration components, firmware, drivers, OEM image, storage, vSAN, and topology remain explicit delivery checks.</p></div>
      <a href={handoff.catalog.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100">Open authoritative catalog <ExternalLink className="size-3.5" /></a>
    </div>

    <div className={`mt-4 rounded-lg border px-4 py-3 ${handoff.allHostsAccountedFor ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider">Estate reconciliation</p><p className="mt-1 text-sm font-semibold">{handoff.assessedHosts} of {handoff.estateHosts} imported hosts accounted for</p></div><Badge variant="outline" className={handoff.allHostsAccountedFor ? "border-emerald-300 bg-white/70 text-emerald-800" : "border-red-300 bg-white/70 text-red-800"}>{handoff.allHostsAccountedFor ? "Reconciled" : `${handoff.unaccountedHosts} unaccounted`}</Badge></div>
    </div>

    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {[{ label: "Target release listed", value: handoff.supportedHosts, className: "border-emerald-200 bg-emerald-50 text-emerald-950", labelClassName: "text-emerald-800" }, { label: "Blocked / not listed", value: handoff.blockedHosts, className: "border-red-200 bg-red-50 text-red-950", labelClassName: "text-red-800" }, { label: "Evidence required", value: handoff.unresolvedHosts, className: "border-amber-200 bg-amber-50 text-amber-950", labelClassName: "text-amber-800" }].map(metric => <article key={metric.label} className={`rounded-lg border px-3 py-3 ${metric.className}`}><p className={`text-[10px] font-black uppercase tracking-wider ${metric.labelClassName}`}>{metric.label}</p><p className="mt-1 text-xl font-semibold">{metric.value}</p><p className="text-xs">hosts</p></article>)}
      <article className="rounded-lg border border-slate-200 bg-white px-3 py-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Maintained catalog</p><p className="mt-1 text-sm font-semibold text-slate-950">{handoff.catalog.id}</p><p className="mt-1 text-xs text-slate-500">{handoff.catalog.reportedCount.toLocaleString()} records · {handoff.catalog.vendorCount} vendors · {handoff.catalog.releaseScope.join(" / ")}</p></article>
    </div>

    {handoff.actions.length > 0 && <div className="mt-5"><div className="flex flex-wrap items-end justify-between gap-2"><div><h4 className="text-sm font-semibold text-slate-950">Delivery action register</h4><p className="mt-1 text-xs text-slate-500">Actions are consolidated across server models and ordered by impact on platform build.</p></div><span className="text-xs text-slate-500">{handoff.actions.length} action{handoff.actions.length === 1 ? "" : "s"}</span></div><div className="mt-3 grid gap-2 lg:grid-cols-2">{handoff.actions.slice(0, 6).map(action => <article key={action.id} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={action.priority === "blocker" ? "border-red-200 bg-red-50 text-red-800" : action.priority === "required" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}>{action.priority}</Badge><span className="text-xs text-slate-500">{action.affectedHosts} host{action.affectedHosts === 1 ? "" : "s"}</span></div><p className="mt-2 text-xs font-semibold leading-5 text-slate-900">{action.title}</p><p className="mt-2 text-[11px] leading-5 text-slate-600"><strong>Owner:</strong> {action.owner}<br /><strong>Done when:</strong> {action.gateCondition}</p></article>)}</div></div>}

    <details className="mt-5 rounded-lg border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-900">View complete server model evidence register ({handoff.cohorts.length})</summary><div className="mt-3 space-y-2">{handoff.cohorts.map(cohort => <CohortEvidence key={cohort.id} cohort={cohort} />)}</div></details>
  </section>;
}
