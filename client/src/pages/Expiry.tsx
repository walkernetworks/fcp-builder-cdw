import { useAuth } from "@/_core/hooks/useAuth";
import { AppShell } from "@/components/vsa/AppShell";
import { Chip, DataMount, EmptyState, KpiCard, Pill, SectionBar } from "@/components/vsa/elements";
import { RecordDrawer } from "@/components/vsa/RecordDrawer";
import { trpc } from "@/lib/trpc";
import { todayIso } from "@/lib/vsa";
import { STAGE_LABELS } from "@shared/vsaStage";
import { EXPIRY_WARNING_DAYS, entitlementTotal, expiryRows, formatDay, formatMoney, inRoleView, ROLE_VIEW_LABELS } from "@shared/vsaViews";
import { CalendarClock } from "lucide-react";
import { useMemo, useState } from "react";

/** Open entitlements by delivery window, each entitlement once. */
export default function Expiry() {
  const today = todayIso();
  const { user } = useAuth();
  const list = trpc.tracker.list.useQuery({});
  const [openId, setOpenId] = useState<number | null>(null);

  const rows = useMemo(() => expiryRows((list.data ?? []).filter(row => !user || inRoleView(row, user.id, user.vsaRole ?? null)), today), [list.data, user, today]);
  const money = entitlementTotal(rows);
  const count = (pill: string) => rows.filter(row => row.verdict.pill === pill).length;
  const roleLabel = user?.vsaRole ? `${ROLE_VIEW_LABELS[user.vsaRole]} view` : "All records";

  return (
    <AppShell>
      <main className="mx-auto max-w-[1400px] space-y-5 px-5 py-6">
        <SectionBar label={`Expiry · ${roleLabel}`} title="Delivery windows" />

        <div className="kpi-grid">
          <KpiCard label="Open entitlements" value={rows.length} sub="Open engagements; alternative plans for one entitlement are one row" />
          <KpiCard label="Entitlement at stake" value={formatMoney(money.total)} sub={`Sum of VSA amounts, each entitlement once${money.missing ? `; ${money.missing} without an amount` : ""}`} />
          <KpiCard label="Expired" value={count("stop")} sub="Delivery window end has passed" />
          <KpiCard label={`Within ${EXPIRY_WARNING_DAYS} days`} value={count("warn")} sub={`Delivery window ends in ${EXPIRY_WARNING_DAYS} days or fewer`} />
          <KpiCard label="No expiry date" value={count("unknown")} sub="VSA Expiration not recorded" />
        </div>

        <p className="callout-dark">
          <strong>Hours burned are not tracked yet.</strong> Consumption needs time entries, which are kept in Broadcom Clarity and do not reach this app. This view shows the time left in each delivery window and the entitlement at stake. It does not estimate burn.
        </p>

        <DataMount
          id="expiryTable"
          query={list}
          isEmpty={data => data.length === 0}
          empty={{ icon: CalendarClock, title: "No engagements yet", sub: "Import the SharePoint VSA Pipeline List to see delivery windows." }}
        >
          {() => rows.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No open entitlements in this view" sub="Every engagement in this view is Complete, Refused, or Lost, or none are assigned to you. Change the view in the header to see more." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-s100 bg-white">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Stage</th>
                    <th>Window ends</th>
                    <th className="num">Days left</th>
                    <th className="num">VSA amount</th>
                    <th>Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.key}>
                      <td>
                        {row.records.map(record => (
                          <button key={record.id} type="button" className="block text-left font-semibold text-ink hover:text-cdw-red" onClick={() => setOpenId(record.id)}>
                            {record.customerName}
                            <span className="ml-1 text-xs font-normal text-ink-muted">{record.opportunityNumber ?? "No opportunity number"}</span>
                          </button>
                        ))}
                        {row.notes.map(note => <p key={note} className="mt-1 text-xs text-ink-muted">{note}</p>)}
                      </td>
                      <td><div className="flex flex-wrap gap-1">{Array.from(new Set(row.records.map(record => record.stage))).map(stage => <Chip key={stage}>{STAGE_LABELS[stage]}</Chip>)}</div></td>
                      <td>{formatDay(row.deliveryWindowEnd)}</td>
                      <td className="num">{row.verdict.daysLeft ?? "—"}</td>
                      <td className="num">{formatMoney(row.entitlementValue)}</td>
                      <td><Pill verdict={row.verdict.pill}>{row.verdict.label}</Pill></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Total, each entitlement once</td>
                    <td className="num">{formatMoney(money.total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </DataMount>
      </main>
      <RecordDrawer id={openId} onClose={() => setOpenId(null)} />
    </AppShell>
  );
}
