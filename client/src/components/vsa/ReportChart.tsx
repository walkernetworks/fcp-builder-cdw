import { formatMeasure, measureLabel, type Bucket, type ReportMeasure } from "@shared/vsaReports";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const MAX_BARS = 20;

/**
 * One measure by group as horizontal bars. A single series in CDW Red (the validated palette slot), so the title names
 * what is plotted and no legend is needed. Comparisons across a second dimension use the pivot table, not colored series.
 */
export function ReportChart({ groups, measure, groupLabel }: { groups: Bucket[]; measure: ReportMeasure; groupLabel: string }) {
  const data = groups.slice(0, MAX_BARS).map(group => ({ label: group.label, value: group.values[0] ?? 0, display: formatMeasure(measure, group.values[0] ?? null) }));
  const height = data.length * 34 + 36;
  return (
    <figure className="rounded-xl border border-s100 bg-white p-4 shadow-[var(--shadow-card)]">
      <figcaption className="mb-2">
        <p className="text-sm font-extrabold text-ink">{measureLabel(measure)} by {groupLabel}</p>
        {groups.length > MAX_BARS && <p className="text-xs text-ink-muted">Showing the first {MAX_BARS} of {groups.length} groups. The table below has all of them.</p>}
      </figcaption>
      <div style={{ height }} role="img" aria-label={`${measureLabel(measure)} by ${groupLabel}: ${data.map(item => `${item.label} ${item.display}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 96, bottom: 4, left: 8 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke="var(--s100)" strokeWidth={1} />
            <XAxis type="number" allowDecimals={measure.kind !== "count"} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} tickFormatter={value => formatMeasure(measure, Number(value))} />
            <YAxis type="category" dataKey="label" width={180} tickLine={false} axisLine={{ stroke: "var(--s200)" }} tick={{ fill: "var(--ink)", fontSize: 12 }} interval={0} />
            <Tooltip cursor={{ fill: "var(--s50)" }} formatter={(value: number) => [formatMeasure(measure, Number(value)), measureLabel(measure)]} contentStyle={{ borderRadius: 10, border: "1px solid var(--s200)", fontSize: 12 }} />
            <Bar dataKey="value" fill="var(--cdw-red)" maxBarSize={24} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList dataKey="display" position="right" style={{ fill: "var(--ink)", fontSize: 11, fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
