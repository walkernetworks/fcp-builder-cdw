import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DaysLeft } from "@/components/vsa/cells";
import { DataMount, EmptyState, KpiCard, PageHeader, Panel, Pill } from "@/components/vsa/elements";
import { useShell } from "@/components/vsa/ShellContext";
import { attentionFor, openRows } from "@/lib/pipeline";
import { trpc } from "@/lib/trpc";
import { todayIso } from "@/lib/vsa";
import { awaitingAction, stageCounts } from "@shared/vsaDashboard";
import { STAGE_LABELS } from "@shared/vsaStage";
import { daysBetween, entitlementTotal, expiryRows, formatDay, formatMoney } from "@shared/vsaViews";
import { CheckCircle2, LayoutDashboard, Plus } from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation } from "wouter";

const AT_RISK_ROWS = 8;
const ATTENTION_ROWS = 8;

/** The landing page: the portfolio at a glance, what is at risk, and what needs attention. */
export default function Overview() {
  const today = todayIso();
  const { user } = useAuth();
  const { openRecord, newEngagement } = useShell();
  const [, navigate] = useLocation();
  const list = trpc.tracker.list.useQuery({});

  const data = useMemo(() => {
    const rows = list.data ?? [];
    const open = openRows(rows);
    const entitlements = expiryRows(open, today);
    const within30 = entitlements.filter(row => row.verdict.daysLeft !== null && row.verdict.daysLeft >= 0 && row.verdict.daysLeft <= 30);
    const expired = entitlements.filter(row => row.verdict.daysLeft !== null && row.verdict.daysLeft < 0);
    const within90 = entitlements.filter(row => row.verdict.daysLeft !== null && row.verdict.daysLeft >= 0 && row.verdict.daysLeft <= 90);
    const recent = rows.filter(row => daysBetween(new Date(row.createdAt).toISOString().slice(0, 10), today) <= 30);
    const attention = open.map(row => ({ row, attention: attentionFor(row, today) })).filter(item => item.attention.count > 0).sort((a, b) => b.attention.count - a.attention.count || a.row.customerName.localeCompare(b.row.customerName));
    return {
      open,
      money: entitlementTotal(entitlements),
      within30,
      expired,
      within90,
      recent,
      awaiting: user ? open.filter(row => awaitingAction(row, user.id)) : [],
      unsegmented: open.filter(row => !row.segment),
      atRisk: entitlements.filter(row => row.verdict.daysLeft !== null).slice(0, AT_RISK_ROWS),
      attention,
      stale: attention.filter(item => item.attention.stale.stale).length,
      flagged: attention.filter(item => item.attention.flags.length).length,
      stages: stageCounts(open),
    };
  }, [list.data, today, user]);

  const maxStage = Math.max(1, ...data.stages.map(item => item.count));

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-6">
      <PageHeader title="Overview" sub={`Portfolio as of ${formatDay(today)}`}>
        <Button onClick={newEngagement}><Plus className="size-4" /> New engagement</Button>
      </PageHeader>

      <DataMount
        id="overview"
        query={list}
        isEmpty={rows => rows.length === 0}
        empty={{ icon: LayoutDashboard, title: "No engagements yet", sub: "Import the SharePoint VSA Pipeline List, or create an engagement, and the overview fills in.", action: <Link href="/import" className="btn-primary inline-flex h-7 items-center px-2.5 text-xs">Import pipeline</Link> }}
        className="space-y-6"
      >
        {() => (
          <>
            <section className="kpi-grid" aria-label="Key figures">
              <KpiCard label="Open engagements" value={data.open.length} sub={`${data.recent.length} added in the last 30 days`} onClick={() => navigate("/pipeline")} />
              <KpiCard label="Portfolio hours remaining" value={<span className="text-ink-subtle">—</span>} sub="No hours recorded yet" />
              <KpiCard label="Expiring within 30 days" value={data.within30.length} keyMetric={data.within30.length > 0} sub={`${data.expired.length} already expired · ${data.within90.length} within 90 days`} onClick={() => navigate("/expiry")} />
              <KpiCard label="Awaiting my action" value={data.awaiting.length} sub="Open records where you own the next step" onClick={() => navigate("/queue?q=awaiting")} />
              <KpiCard label="Unsegmented" value={data.unsegmented.length} sub="Open records with no segment" onClick={() => navigate("/pipeline?segment=none")} />
            </section>

            <div className="grid gap-4 xl:grid-cols-3">
              <Panel
                className="xl:col-span-2"
                title="At risk"
                sub="Open entitlements nearest expiry. Alternative plans count once."
                actions={<Button variant="outline" size="sm" asChild><Link href="/expiry">Expiry & Burndown</Link></Button>}
              >
                {data.atRisk.length === 0 ? (
                  <div className="p-4"><EmptyState icon={CheckCircle2} title="No expiry dates" sub="No open record has a VSA expiration date yet." /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="tbl">
                      <thead>
                        <tr><th>Customer</th><th>Stage</th><th className="num">Expires</th><th className="num">Days left</th><th className="num">VSA amount</th><th className="num" title="Hours left, and the weekly pace needed before expiry">Hours · pace</th></tr>
                      </thead>
                      <tbody>
                        {data.atRisk.map(row => (
                          <tr key={row.key} data-selectable tabIndex={0} onClick={() => openRecord(row.records[0].id)} onKeyDown={event => event.key === "Enter" && openRecord(row.records[0].id)}>
                            <td className="max-w-[260px] truncate font-medium">{row.customerName}{row.records.length > 1 && <span className="ml-1.5 text-xs font-normal text-ink-muted">{row.records.length} plans</span>}</td>
                            <td className="whitespace-nowrap text-ink-muted">{STAGE_LABELS[row.records[0].stage]}</td>
                            <td className="num whitespace-nowrap">{formatDay(row.deliveryWindowEnd)}</td>
                            <td className="num"><DaysLeft daysLeft={row.verdict.daysLeft} /></td>
                            <td className="num">{formatMoney(row.entitlementValue)}</td>
                            <td className="num text-ink-subtle">—</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="border-t border-s100 px-3 py-2 text-[11px] text-ink-subtle">Hours left and weekly pace fill in once hours are recorded on records.</p>
                  </div>
                )}
              </Panel>

              <Panel title="Pipeline by stage" sub={`${data.open.length} open`} actions={<Button variant="outline" size="sm" asChild><Link href="/pipeline?view=board">Board</Link></Button>}>
                <ol className="space-y-0.5 p-2">
                  {data.stages.map(({ stage, count }) => (
                    <li key={stage}>
                      <Link href={`/pipeline?stage=${stage}`} className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 hover:bg-surface-sunken">
                        <span className="truncate text-[13px] text-ink">{STAGE_LABELS[stage]}</span>
                        <span className="tabular text-right text-[13px] font-medium text-ink">{count}</span>
                        <span className="hbar col-span-2" aria-hidden><span style={{ width: `${(count / maxStage) * 100}%` }} /></span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <Panel
                className="xl:col-span-2"
                title="Needs attention"
                sub="Data-quality flags, stages past their threshold, and stage warnings"
                actions={<Button variant="outline" size="sm" asChild><Link href="/queue?q=attention">See all {data.attention.length}</Link></Button>}
              >
                {data.attention.length === 0 ? (
                  <div className="p-4"><EmptyState icon={CheckCircle2} title="Nothing needs attention" sub="Every open record has its data and is inside its stage's time." /></div>
                ) : (
                  <ul className="divide-y divide-s100">
                    {data.attention.slice(0, ATTENTION_ROWS).map(({ row, attention }) => (
                      <li key={row.id}>
                        <button type="button" onClick={() => openRecord(row.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-left hover:bg-surface-sunken">
                          <span className="min-w-[180px] flex-1">
                            <span className="block truncate text-[13px] font-medium text-ink">{row.customerName}</span>
                            <span className="block text-xs text-ink-muted">{STAGE_LABELS[row.stage]} · {attention.stale.days} days in stage</span>
                          </span>
                          <span className="flex flex-wrap justify-end gap-1">
                            {attention.stale.stale && <Pill verdict="warn">Stale {attention.stale.days}d</Pill>}
                            {sourcesPill(attention.warnings)}
                            {attention.warnings.filter(warning => !warning.startsWith("Source not received")).map(warning => <Pill key={warning} verdict={warning.startsWith("In a delivery stage") ? "stop" : "warn"} title={warning}>{shortWarning(warning)}</Pill>)}
                            {attention.flags.map(flag => <Pill key={flag.key} verdict="unknown">{flag.label}</Pill>)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Data quality" sub="Open records">
                <ul className="divide-y divide-s100">
                  <QualityRow label="Missing segment" count={data.unsegmented.length} href="/pipeline?segment=none" />
                  <QualityRow label="With any data-quality flag" count={data.flagged} href="/pipeline?flagged=1" />
                  <QualityRow label="Past their stage's threshold" count={data.stale} href="/queue?q=attention" />
                  <QualityRow label="Without a VSA amount" count={data.money.missing} href="/expiry" />
                </ul>
              </Panel>
            </div>
          </>
        )}
      </DataMount>
    </main>
  );
}

function QualityRow({ label, count, href }: { label: string; count: number; href: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between px-4 py-2.5 text-[13px] hover:bg-surface-sunken">
        <span className="text-ink-muted">{label}</span>
        <span className={`tabular font-medium ${count ? "text-ink" : "text-ink-subtle"}`}>{count}</span>
      </Link>
    </li>
  );
}

/** FCP Draft sources still open, as one pill with the list on hover. */
function sourcesPill(warnings: string[]) {
  const open = warnings.filter(warning => warning.startsWith("Source not received")).map(warning => warning.replace("Source not received: ", ""));
  return open.length ? <Pill verdict="warn" title={`Not received: ${open.join(", ")}`}>{open.length} {open.length === 1 ? "source" : "sources"} open</Pill> : null;
}

/** Pills carry a short phrase; the full warning is the pill's title and is in the record. */
function shortWarning(warning: string) {
  if (warning.startsWith("Commercial customers skip")) return "Skips approval";
  if (warning.startsWith("Work plan sent")) return "Work plan stale";
  if (warning.startsWith("In a delivery stage")) return "No PO";
  return "Check";
}
