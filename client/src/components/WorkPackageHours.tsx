import { trpc } from "@/lib/trpc";
import { FIXED_GANTT_CATEGORIES, type EngagementDocument } from "@shared/fcp";
import { formatWindow, type ScopedEffort, type WorkPackageEffort } from "@shared/effort";
import { useEffect } from "react";

const DEFERRED: Record<NonNullable<WorkPackageEffort["deferred"]>, string> = {
  "not funded": "Beyond the entitlement hours",
  "after the entitlement window": "Starts after the entitlement ends",
};

const NOTE: Record<NonNullable<WorkPackageEffort["note"]>, string> = {
  "customer-owned": "Customer-owned",
  checkpoint: "Checkpoint",
  "not in the scoped hours": "No hours scoped",
};

/**
 * The scoped hours spread over the adoption timeline: each work package with its window, lead delivery
 * role, and hours by role. Recalculated as the timeline changes; the Condensed FCP prints the same table.
 */
export function WorkPackageHours({ document }: { document: EngagementDocument }) {
  const effort = trpc.effort.scoped.useMutation();
  const { mutate } = effort;
  useEffect(() => {
    const timer = window.setTimeout(() => mutate({ data: document }), 400);
    return () => window.clearTimeout(timer);
  }, [document, mutate]);
  const data = effort.data;
  return (
    <section className="border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[.16em] text-[#c8102e]">Hours by work package</p>
      <p className="mt-2 max-w-4xl text-xs leading-5 text-slate-600">
        The scoped hours placed on this timeline: each work package's share of its catalog line, by role, in the window shown above. Moving or resizing a work package moves its hours. Work the entitlement cannot carry moves to the Two-Year Notional, after the entitlement ends. The Condensed FCP and the Delivery Package show this same table.
        {data?.source === "assignments" && <b className="text-slate-800"> Signed resource assignments are entered ({data.totals.total.toLocaleString("en-US")} hours), so the report shows those instead.</b>}
      </p>
      {data ? <div className="mt-4"><WorkPackageTable effort={data} /></div> : <p className="mt-4 text-xs text-slate-500">Calculating…</p>}
    </section>
  );
}

/** The work-package hours table: the rows the Condensed FCP prints, plus work with no entitlement hours. */
export function WorkPackageTable({ effort }: { effort: ScopedEffort }) {
  const rows = effort.workPackages;
  const funded = rows.filter(row => row.total > 0);
  const totals = funded.reduce((sum, row) => ({ architect: sum.architect + row.architect, srConsultant: sum.srConsultant + row.srConsultant, projectManager: sum.projectManager + row.projectManager, total: sum.total + row.total }), { architect: 0, srConsultant: 0, projectManager: 0, total: 0 });
  const inWindow = rows.filter(row => !row.deferred);
  const groups = [
    ...[...FIXED_GANTT_CATEGORIES, null].map(category => ({ title: category ?? "Not on the timeline", rows: inWindow.filter(row => row.category === category) })),
    { title: "After the entitlement window (Two-Year Notional)", rows: rows.filter(row => row.deferred) },
  ].filter(group => group.rows.length);
  const numberCell = (value: number, muted: boolean) => <td className={`px-2 py-1.5 text-right tabular-nums ${muted ? "text-slate-400" : "text-slate-800"}`}>{muted ? "—" : value.toLocaleString("en-US")}</td>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <th className="px-2 py-1.5">Work package</th><th className="px-2 py-1.5">Window</th><th className="px-2 py-1.5">Lead delivery role</th>
            <th className="px-2 py-1.5 text-right">Architect</th><th className="px-2 py-1.5 text-right">Sr. Consultant</th><th className="px-2 py-1.5 text-right">Sr. PM</th><th className="px-2 py-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => [
            <tr key={`group-${group.title}`}><td colSpan={7} className="bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">{group.title}</td></tr>,
            ...group.rows.map(row => {
              const muted = row.total === 0;
              const tag = row.deferred ? DEFERRED[row.deferred] : row.note ? NOTE[row.note] : null;
              return (
                <tr key={row.id} className="border-b border-slate-100 align-top">
                  <td className={`px-2 py-1.5 font-semibold ${muted ? "text-slate-400" : "text-slate-900"}`}>{row.label}{tag && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">{tag}</span>}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">{row.deferred ? "After the entitlement" : row.start && row.end ? formatWindow(row.start, row.end) : "—"}</td>
                  <td className="px-2 py-1.5 text-slate-600">{row.leadRole || "—"}</td>
                  {numberCell(row.architect, muted)}{numberCell(row.srConsultant, muted)}{numberCell(row.projectManager, muted)}{numberCell(row.total, muted)}
                </tr>
              );
            }),
          ])}
          <tr className="border-t-2 border-slate-900 font-bold text-slate-950">
            <td className="px-2 py-1.5" colSpan={3}>Total CDW-delivered hours</td>
            {numberCell(totals.architect, false)}{numberCell(totals.srConsultant, false)}{numberCell(totals.projectManager, false)}{numberCell(totals.total, false)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
