import { DaysLeft, SegmentText } from "@/components/vsa/cells";
import { Chip, DataMount, EmptyState, KpiCard, PageHeader, Panel } from "@/components/vsa/elements";
import { useShell } from "@/components/vsa/ShellContext";
import { openRows } from "@/lib/pipeline";
import { trpc } from "@/lib/trpc";
import { todayIso } from "@/lib/vsa";
import { expiryBand, expiryBandTotals, expiryByMonth, EXPIRY_BANDS, type ExpiryBand } from "@shared/vsaDashboard";
import { STAGE_LABELS } from "@shared/vsaStage";
import { entitlementTotal, expiryRows, formatDay, formatMoney, type ExpiryRow } from "@shared/vsaViews";
import { CalendarClock, Hourglass } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Window = "all" | "expired" | "d30" | "d90" | "none";
const WINDOWS: { id: Window; label: string; match: (band: ExpiryBand) => boolean }[] = [
  { id: "all", label: "All open", match: () => true },
  { id: "expired", label: "Expired", match: band => band === "expired" },
  { id: "d30", label: "Within 30 days", match: band => band === "d30" },
  { id: "d90", label: "Within 90 days", match: band => band === "d30" || band === "d60" || band === "d90" },
  { id: "none", label: "No expiry date", match: band => band === "none" },
];

/** Risk bands use the soft state colors with a solid edge; bands with no risk stay neutral. Each bar is labeled, so color is never alone. */
const BAND_FILL: Record<string, { fill: string; stroke: string }> = {
  stop: { fill: "var(--state-blocked-soft)", stroke: "var(--state-blocked)" },
  warn: { fill: "var(--state-warn-soft)", stroke: "var(--state-warn)" },
  none: { fill: "var(--surface-sunken)", stroke: "var(--s300)" },
  unknown: { fill: "var(--surface)", stroke: "var(--s200)" },
};

const tooltipStyle = { borderRadius: 6, border: "1px solid var(--s100)", background: "var(--surface)", color: "var(--ink)", fontSize: 12, boxShadow: "var(--shadow-pop)" };
const axisTick = { fill: "var(--ink-muted)", fontSize: 11 };

/** The analytical view: every open entitlement by time to expiry, the VSA amount at stake, and (once recorded) the hours. */
export default function Expiry() {
  const today = todayIso();
  const { openRecord } = useShell();
  const list = trpc.tracker.list.useQuery({});
  const [windowId, setWindowId] = useState<Window>("all");

  const data = useMemo(() => {
    const rows = expiryRows(openRows(list.data ?? []), today);
    const bands = expiryBandTotals(rows);
    const band = (key: ExpiryBand) => bands.find(item => item.key === key)!;
    return {
      rows,
      bands,
      months: expiryByMonth(rows, today, 12),
      money: entitlementTotal(rows),
      expired: band("expired"),
      d30: band("d30"),
      d90: { count: band("d60").count + band("d90").count, amount: band("d60").amount + band("d90").amount },
    };
  }, [list.data, today]);

  const visible = data.rows.filter(row => WINDOWS.find(item => item.id === windowId)!.match(expiryBand(row.verdict.daysLeft)));

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-6">
      <PageHeader title="Expiry & Burndown" sub="Open entitlements by time to expiry. Alternative plans share one entitlement and count once." />
      <DataMount id="expiry" query={list} isEmpty={rows => rows.length === 0} empty={{ icon: CalendarClock, title: "No engagements yet", sub: "Import the pipeline to see expiry and burndown." }} className="space-y-6">
        {() => (
          <>
            <section className="kpi-grid" aria-label="Expiry figures">
              <KpiCard label="Open entitlements" value={data.rows.length} sub={`${formatMoney(data.money.total)} in VSA amounts${data.money.missing ? ` · ${data.money.missing} without an amount` : ""}`} />
              <KpiCard label="Expired" value={data.expired.count} keyMetric={data.expired.count > 0} sub={`${formatMoney(data.expired.amount)} past the delivery window`} onClick={() => setWindowId("expired")} />
              <KpiCard label="Within 30 days" value={data.d30.count} sub={`${formatMoney(data.d30.amount)} expiring`} onClick={() => setWindowId("d30")} />
              <KpiCard label="31 to 90 days" value={data.d90.count} sub={`${formatMoney(data.d90.amount)} expiring`} onClick={() => setWindowId("d90")} />
              <KpiCard label="Hours remaining" value={<span className="text-ink-subtle">—</span>} sub="No hours recorded yet" />
            </section>

            <div className="grid gap-4 xl:grid-cols-3">
              <Panel title="Entitlements by days to expiry" sub="Count per band" bodyClassName="p-4">
                <div className="h-[240px]" role="img" aria-label={`Entitlements by days to expiry: ${data.bands.map(band => `${band.label} ${band.count}`).join(", ")}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.bands} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }} barCategoryGap={6}>
                      <CartesianGrid horizontal={false} stroke="var(--s100)" />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={axisTick} />
                      <YAxis type="category" dataKey="label" width={104} tickLine={false} axisLine={false} tick={{ ...axisTick, fill: "var(--ink)" }} interval={0} />
                      <Tooltip cursor={{ fill: "var(--surface-sunken)" }} contentStyle={tooltipStyle} formatter={(value: number, _name, item) => [`${value} · ${formatMoney(item.payload.amount)}`, "Entitlements"]} />
                      <Bar dataKey="count" maxBarSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                        {data.bands.map(band => <Cell key={band.key} fill={BAND_FILL[band.risk].fill} stroke={BAND_FILL[band.risk].stroke} strokeWidth={1} />)}
                        <LabelList dataKey="count" position="right" fill="var(--ink)" fontSize={11} fontWeight={600} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="VSA amount expiring by month" sub="Next 12 months, from the VSA expiration date" bodyClassName="p-4">
                <div className="h-[240px]" role="img" aria-label={`VSA amount expiring by month: ${data.months.map(month => `${month.label} ${formatMoney(month.amount)}`).join(", ")}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.months} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap={4}>
                      <CartesianGrid vertical={false} stroke="var(--s100)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--s200)" }} tick={axisTick} interval={0} tickFormatter={(label: string) => (label.startsWith("Jan") || label === data.months[0].label ? label.replace(" ", " ’") : label.split(" ")[0])} />
                      <YAxis tickLine={false} axisLine={false} tick={axisTick} width={48} tickFormatter={value => (Number(value) >= 1000 ? `$${Math.round(Number(value) / 1000)}k` : `$${value}`)} />
                      <Tooltip cursor={{ fill: "var(--surface-sunken)" }} contentStyle={tooltipStyle} labelStyle={{ color: "var(--ink-muted)" }} formatter={(value: number, _name, item) => [`${formatMoney(value)} · ${item.payload.count} ${item.payload.count === 1 ? "entitlement" : "entitlements"}`, "Expiring"]} />
                      <Bar dataKey="amount" fill="var(--chart-bar)" maxBarSize={22} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="Hours remaining and required pace" sub="Weekly pace and FTE needed to finish before expiry" bodyClassName="p-4">
                <div className="grid h-[240px] place-items-center">
                  <EmptyState icon={Hourglass} title="No hours recorded yet" sub="Records don't carry planned or delivered hours yet. Once they do, this shows hours remaining, the weekly pace needed before expiry, and the FTE that pace takes." />
                </div>
              </Panel>
            </div>

            <Panel
              title="Entitlements by risk"
              sub="Soonest expiry first. Select a row to open the record."
              actions={<div className="flex flex-wrap gap-1.5">{WINDOWS.map(item => <Chip key={item.id} pressed={windowId === item.id} onClick={() => setWindowId(item.id)}>{item.label}</Chip>)}</div>}
            >
              {visible.length === 0 ? (
                <div className="p-4"><EmptyState icon={CalendarClock} title="No entitlements in this window" sub="Choose another window above." /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Customer</th><th>Stage</th><th>Segment</th><th className="num">Expires</th><th className="num">Days left</th><th className="num">VSA amount</th>
                        <th className="num">Hours left</th><th className="num">Weekly pace</th><th className="num">FTE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(row => <RiskRow key={row.key} row={row} onOpen={() => openRecord(row.records[0].id)} />)}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={5}>{visible.length} {visible.length === 1 ? "entitlement" : "entitlements"}</td>
                        <td className="num">{formatMoney(entitlementTotal(visible).total)}</td>
                        <td colSpan={3} className="text-right text-xs font-normal text-ink-subtle">Hours columns fill in once hours are recorded</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Panel>
          </>
        )}
      </DataMount>
    </main>
  );
}

function RiskRow({ row, onOpen }: { row: ExpiryRow; onOpen: () => void }) {
  const risk = EXPIRY_BANDS.find(band => band.key === expiryBand(row.verdict.daysLeft))!.risk;
  const first = row.records[0];
  return (
    <tr className={risk === "stop" ? "risk-stop" : risk === "warn" ? "risk-warn" : undefined} data-selectable tabIndex={0} onClick={onOpen} onKeyDown={event => event.key === "Enter" && onOpen()} title={row.notes.join("\n") || undefined}>
      <td className="max-w-[280px]">
        <p className="truncate font-medium">{row.customerName}</p>
        <p className="truncate text-xs text-ink-muted">{row.records.length > 1 ? `${row.records.length} alternative plans` : first.opportunityNumber ?? "No opportunity number"}</p>
      </td>
      <td className="whitespace-nowrap">{STAGE_LABELS[first.stage]}</td>
      <td><SegmentText segment={first.segment} /></td>
      <td className="num whitespace-nowrap">{formatDay(row.deliveryWindowEnd)}</td>
      <td className="num"><DaysLeft daysLeft={row.verdict.daysLeft} /></td>
      <td className="num">{formatMoney(row.entitlementValue)}</td>
      <td className="num text-ink-subtle">—</td>
      <td className="num text-ink-subtle">—</td>
      <td className="num text-ink-subtle">—</td>
    </tr>
  );
}
