import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DataMount, EmptyState, KpiCard, PageHeader, Pill, type Verdict } from "@/components/vsa/elements";
import { useShell } from "@/components/vsa/ShellContext";
import { ReportBuilder } from "@/components/vsa/ReportBuilder";
import { ReportChart } from "@/components/vsa/ReportChart";
import { downloadBase64, downloadText } from "@/lib/downloads";
import { trpc } from "@/lib/trpc";
import { todayIso } from "@/lib/vsa";
import { FIELD_BY_KEY, formatMeasure, measureLabel, PROPRIETARY_LEGEND, REPORT_PRESETS, reportCsv, runReport, type ReportConfig } from "@shared/vsaReports";
import { BarChart3, ChevronDown, ChevronUp, Download, FileSpreadsheet, Loader2, Save, SearchX, SlidersHorizontal, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Current = { kind: "preset"; id: string } | { kind: "saved"; id: number; ownerId: number };

function initialSelection(): Current {
  const params = new URLSearchParams(window.location.search);
  const saved = Number(params.get("report"));
  if (saved > 0) return { kind: "saved", id: saved, ownerId: 0 };
  const preset = params.get("preset");
  return { kind: "preset", id: REPORT_PRESETS.some(item => item.id === preset) ? preset! : REPORT_PRESETS[0].id };
}

/** Build, save, and export reports over the tracker. Every figure is computed by the shared report engine. */
export default function Reports() {
  const today = todayIso();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const list = trpc.tracker.list.useQuery({});
  const saved = trpc.reports.list.useQuery();
  const [current, setCurrent] = useState<Current>(initialSelection);
  const [name, setName] = useState(REPORT_PRESETS[0].name);
  const [config, setConfig] = useState<ReportConfig>(REPORT_PRESETS[0].config);
  const [dirty, setDirty] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(true);
  const [saveAs, setSaveAs] = useState<string | null>(null);
  const { openRecord } = useShell();

  // Load the chosen preset or saved report, and keep the URL shareable.
  useEffect(() => {
    if (current.kind === "preset") {
      const preset = REPORT_PRESETS.find(item => item.id === current.id) ?? REPORT_PRESETS[0];
      setName(preset.name);
      setConfig(preset.config);
      setDirty(false);
    } else if (saved.data) {
      const report = saved.data.find(item => item.id === current.id);
      if (!report) return void setCurrent({ kind: "preset", id: REPORT_PRESETS[0].id });
      setName(report.name);
      setConfig(report.config);
      setDirty(false);
      if (current.ownerId !== report.ownerId) setCurrent({ kind: "saved", id: report.id, ownerId: report.ownerId });
    }
    const url = new URL(window.location.href);
    url.search = current.kind === "preset" ? `?preset=${current.id}` : `?report=${current.id}`;
    window.history.replaceState({}, "", url);
  }, [current.kind, current.id, saved.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const source = useMemo(() => list.data ?? [], [list.data]);
  const result = useMemo(() => runReport(source, config, today), [source, config, today]);
  const canEditSaved = current.kind === "saved" && user && (current.ownerId === user.id || user.role === "admin");
  const description = current.kind === "preset" ? REPORT_PRESETS.find(item => item.id === current.id)?.description : `Saved report${saved.data?.find(item => item.id === current.id)?.ownerName ? ` by ${saved.data.find(item => item.id === current.id)!.ownerName}` : ""}.`;

  const save = trpc.reports.save.useMutation({
    onSuccess: async ({ id }, input) => {
      toast.success(`Saved "${input.name}"`);
      setSaveAs(null);
      setDirty(false);
      await utils.reports.list.invalidate();
      setCurrent({ kind: "saved", id, ownerId: user?.id ?? 0 });
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.reports.delete.useMutation({
    onSuccess: async () => { toast.success("Report deleted"); await utils.reports.list.invalidate(); setCurrent({ kind: "preset", id: REPORT_PRESETS[0].id }); },
    onError: error => toast.error(error.message),
  });
  const exportXlsx = trpc.reports.exportXlsx.useMutation({
    onSuccess: file => downloadBase64(file.filename, file.mime, file.base64),
    onError: error => toast.error(error.message),
  });

  const changeConfig = (next: ReportConfig) => { setConfig(next); setDirty(true); };
  const groupField = config.groupBy ? FIELD_BY_KEY.get(config.groupBy) : undefined;
  const filename = (extension: string) => `${name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "VSA-report"}-${today}.${extension}`;

  return (
    <>
      <main className="mx-auto max-w-[1600px] space-y-5 px-6 py-6">
        <PageHeader title={<span>{name}{dirty && <span className="ml-2 align-middle text-xs font-normal text-ink-muted">Unsaved changes</span>}</span>} sub={description ?? "Reports run on every record in the workspace."}>
          <select
            className="h-7 max-w-[320px] rounded-md border border-s200 bg-surface px-2 text-[13px] font-medium text-ink"
            aria-label="Choose a report"
            value={current.kind === "preset" ? `preset:${current.id}` : `saved:${current.id}`}
            onChange={event => {
              if (dirty && !window.confirm("Discard the unsaved changes to this report?")) return;
              const [kind, id] = event.target.value.split(":");
              setCurrent(kind === "preset" ? { kind: "preset", id } : { kind: "saved", id: Number(id), ownerId: 0 });
            }}
          >
            <optgroup label="Built-in">{REPORT_PRESETS.map(preset => <option key={preset.id} value={`preset:${preset.id}`}>{preset.name}</option>)}</optgroup>
            {saved.data && saved.data.length > 0 && <optgroup label="Saved">{saved.data.map(report => <option key={report.id} value={`saved:${report.id}`}>{report.name}</option>)}</optgroup>}
          </select>
          <Button variant="outline" size="sm" onClick={() => downloadText(filename("csv"), "text/csv;charset=utf-8", reportCsv(result, PROPRIETARY_LEGEND))} disabled={!result.rows.length}><Download className="size-4" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportXlsx.mutate({ name, config })} disabled={!result.rows.length || exportXlsx.isPending}>{exportXlsx.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />} Excel</Button>
          {canEditSaved && <Button variant="outline" size="sm" onClick={() => { if (window.confirm(`Delete the saved report "${name}"?`)) remove.mutate({ id: current.id }); }}><Trash2 className="size-4" /> Delete</Button>}
          {canEditSaved && <Button variant="outline" size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate({ id: current.id, name, config })}><Save className="size-4" /> Save</Button>}
          <Button size="sm" onClick={() => setSaveAs(current.kind === "preset" ? `${name} (copy)` : name)}><Save className="size-4" /> Save as</Button>
        </PageHeader>

        <section>
          <button type="button" className="mb-2 inline-flex items-center gap-2 text-[13px] font-medium text-ink" onClick={() => setBuilderOpen(open => !open)} aria-expanded={builderOpen}>
            <SlidersHorizontal className="size-4" /> Customize {builderOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          {builderOpen && <ReportBuilder config={config} onChange={changeConfig} />}
        </section>

        <DataMount id="reportResult" query={list} isEmpty={data => data.length === 0} empty={{ icon: BarChart3, title: "No engagements yet", sub: "Import the SharePoint VSA Pipeline List or create engagements in the Pipeline, then run reports here." }}>
          {() => result.rows.length === 0 ? (
            <EmptyState icon={SearchX} title="No engagements match this report" sub="Nothing passes these filters. Loosen a filter or include closed engagements." />
          ) : (
            <div className="space-y-5">
              <div className="kpi-grid">
                <KpiCard label="Engagements" value={result.rows.length} sub={config.includeClosed ? "Matching the filters, closed included" : "Open engagements matching the filters"} />
                {config.measures.filter(m => m.kind !== "count").map((m, index) => (
                  <KpiCard key={`${m.kind}-${m.field}-${index}`} label={measureLabel(m)} value={formatMeasure(m, result.totals[config.measures.indexOf(m)])} sub={m.field === "entitlementValue" && m.kind === "sum" ? "Each alternative-plan group counted once" : `Across ${result.rows.length} engagements with a value`} />
                ))}
              </div>

              {result.groups && groupField && (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <ReportChart groups={result.groups} measure={config.measures[0]} groupLabel={groupField.label} />
                  <div className="overflow-x-auto rounded-lg border border-s100 bg-surface">
                    {result.pivot ? (
                      <table className="tbl">
                        <thead><tr><th>{groupField.label} by {result.pivot.compare.label}</th>{result.pivot.columns.map(col => <th key={col.key} className="num">{col.label}</th>)}<th className="num">Total</th></tr></thead>
                        <tbody>{result.groups.map((group, index) => <tr key={group.key}><td className="font-semibold">{group.label}</td>{result.pivot!.cells[index].map((value, c) => <td key={c} className="num">{formatMeasure(config.measures[0], value)}</td>)}<td className="num font-semibold">{formatMeasure(config.measures[0], group.values[0])}</td></tr>)}</tbody>
                        <tfoot><tr><td>Total</td>{result.pivot.columnTotals.map((value, c) => <td key={c} className="num">{formatMeasure(config.measures[0], value)}</td>)}<td className="num">{formatMeasure(config.measures[0], result.totals[0])}</td></tr></tfoot>
                      </table>
                    ) : (
                      <table className="tbl">
                        <thead><tr><th>{groupField.label}</th>{config.measures.map((m, index) => <th key={index} className="num">{measureLabel(m)}</th>)}</tr></thead>
                        <tbody>{result.groups.map(group => <tr key={group.key}><td className="font-semibold">{group.label}</td>{group.values.map((value, index) => <td key={index} className="num">{formatMeasure(config.measures[index], value)}</td>)}</tr>)}</tbody>
                        <tfoot><tr><td>Total</td>{result.totals.map((value, index) => <td key={index} className="num">{formatMeasure(config.measures[index], value)}</td>)}</tr></tfoot>
                      </table>
                    )}
                    {result.pivot && <p className="px-3 py-2 text-[11px] text-ink-muted">Cells show {measureLabel(config.measures[0]).toLowerCase()}. Change the first measure to compare a different figure.</p>}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-s100 bg-surface">
                <table className="tbl">
                  <thead>
                    <tr>
                      {result.columns.map(field => {
                        const sorted = config.sort?.field === field.key ? config.sort.dir : null;
                        return (
                          <th key={field.key} className={field.type === "money" || field.type === "number" ? "num" : undefined} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}>
                            <button type="button" className="inline-flex items-center gap-1 uppercase" onClick={() => changeConfig({ ...config, sort: { field: field.key, dir: sorted === "asc" ? "desc" : "asc" } })}>
                              {field.label}{sorted === "asc" ? <ChevronUp className="size-3" /> : sorted === "desc" ? <ChevronDown className="size-3" /> : null}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, rowIndex) => (
                      <tr key={row.id} data-selectable tabIndex={0} onClick={() => openRecord(row.id)} onKeyDown={event => event.key === "Enter" && openRecord(row.id)}>
                        {result.columns.map((field, index) => {
                          const text = result.table[rowIndex][index];
                          // Expiry is a verdict, so it renders as a pill (word plus icon) rather than bare text.
                          if (field.key === "expiry") return <td key={field.key}><Pill verdict={field.get(row, today) as Verdict}>{text}</Pill></td>;
                          return <td key={field.key} className={field.type === "money" || field.type === "number" ? "num" : undefined}>{text || <span className="text-s300">—</span>}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-ink-muted">{result.rows.length} engagements. Select a row to open the record. Exports include the proprietary legend.</p>
            </div>
          )}
        </DataMount>
      </main>

      <Dialog open={saveAs !== null} onOpenChange={open => !open && setSaveAs(null)}>
        <DialogContent className="sm:max-w-md">
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (saveAs?.trim()) save.mutate({ name: saveAs.trim(), config }); }}>
            <DialogHeader>
              <p className="cta-eyebrow">Save report</p>
              <DialogTitle className="text-lg font-semibold tracking-tight">Save as a new report</DialogTitle>
              <DialogDescription>Saved reports are shared with everyone in the workspace. Only you or an admin can change or delete it.</DialogDescription>
            </DialogHeader>
            <Input autoFocus maxLength={120} value={saveAs ?? ""} onChange={event => setSaveAs(event.target.value)} aria-label="Report name" className="h-9 rounded-md" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaveAs(null)}>Cancel</Button>
              <Button type="submit" disabled={!saveAs?.trim() || save.isPending}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
