import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { downloadText } from "@/lib/downloads";
import { trpc } from "@/lib/trpc";
import type { EngagementDocument } from "@shared/fcp";
import { hoursSource } from "@shared/fcpRecord";
import { openSources, STAGE_LABELS } from "@shared/vsaStage";
import { Download, Eye, History, ListChecks, Loader2, RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Chip, DataMount, Pill } from "./elements";

/** The record the FCP belongs to: its stage, FCP Draft readiness (the source checklist), and where the hours come from. */
export function FcpRecordStrip({ engagementId, document, onOpenSources }: { engagementId: number; document: EngagementDocument; onOpenSources: () => void }) {
  const record = trpc.tracker.get.useQuery({ id: engagementId });
  const hours = hoursSource(document);
  const query = { ...record, data: record.data ?? undefined, error: record.error ? { message: record.error.message } : null };
  return (
    <DataMount id="fcpRecordStrip" query={query} empty={{ title: "No tracker record", sub: "This FCP has no tracker record yet." }}>
      {data => {
        const required = data.sources.filter(source => source.required);
        const open = openSources(data.sources);
        return (
          <section className="grid gap-3 rounded-lg border border-s100 bg-surface p-4 shadow-[var(--shadow-card)] lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-cool-8">Stage</p>
              <Chip>{STAGE_LABELS[data.record.stage]}</Chip>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:border-l lg:border-s100 lg:pl-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-cool-8">FCP Draft readiness</p>
              {open.length === 0 ? <Pill verdict="ready">{required.length} of {required.length} sources in</Pill> : <Pill verdict="warn" title={open.map(item => item.label).join(", ")}>{required.length - open.length} of {required.length} sources in</Pill>}
              {open.length > 0 && <span className="text-xs text-ink-muted">Open: {open.map(item => item.label).join(", ")}</span>}
              <Button variant="outline" size="sm" className="h-7" onClick={onOpenSources}><ListChecks className="size-3.5" /> Sources</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:border-l lg:border-s100 lg:pl-4" title={hours.detail}>
              <p className="text-[11px] font-medium uppercase tracking-wide text-cool-8">Hours source</p>
              {hours.kind === "signed-assignment" ? <Pill verdict="go">Signed RA · {hours.hours?.toLocaleString("en-US")} hours</Pill> : <Chip>{hours.label}</Chip>}
            </div>
          </section>
        );
      }}
    </DataMount>
  );
}

/**
 * FCP history: saved copies (on request, on submission, on export), with preview, download, and restore. These are
 * saves, not versions: the save counter is never shown, and "version" is kept for issued plans.
 */
export function FcpVersionsSheet({ engagementId, open, onClose, readOnly, onRestored }: { engagementId: number; open: boolean; onClose: () => void; readOnly: boolean; onRestored: () => void }) {
  const utils = trpc.useUtils();
  const versions = trpc.fcpRecord.versions.useQuery({ id: engagementId }, { enabled: open });
  const [label, setLabel] = useState("");
  const [previewId, setPreviewId] = useState<number | null>(null);
  const save = trpc.fcpRecord.saveVersion.useMutation({
    onSuccess: async result => { setLabel(""); toast.success("Saved to history"); await utils.fcpRecord.versions.invalidate({ id: engagementId }); },
    onError: error => toast.error(error.message),
  });
  const restore = trpc.fcpRecord.restoreVersion.useMutation({
    onSuccess: async () => { toast.success("Restored. The FCP as it was before is kept in history."); await utils.fcpRecord.versions.invalidate({ id: engagementId }); onRestored(); },
    onError: error => toast.error(error.message),
  });
  const html = trpc.document.html.useMutation({ onError: error => toast.error(error.message) });
  const query = { ...versions, data: versions.data, error: versions.error ? { message: versions.error.message } : null };

  async function download(versionId: number) {
    const version = await utils.fcpRecord.version.fetch({ id: engagementId, versionId });
    const file = await html.mutateAsync({ title: version.title, data: version.data });
    downloadText(file.filename.replace(/\.html$/, `-saved-${savedStamp(version.createdAt)}.html`), file.mime, file.content);
  }

  return (
    <Sheet open={open} onOpenChange={value => !value && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-s50 p-0 sm:max-w-[520px]">
        <SheetHeader className="bg-surface px-5 pb-4 pt-6">
          <p className="cta-eyebrow">FCP history</p>
          <SheetTitle className="text-xl font-semibold tracking-tight text-ink">History</SheetTitle>
          <SheetDescription className="text-xs text-ink-muted">A copy is kept when you save one, when the FCP leaves FCP Draft for approval, and on every FCP export. Restoring keeps the current FCP in history first.</SheetDescription>
        </SheetHeader>
        <form className="flex gap-2 border-t border-s100 bg-surface px-5 py-3" onSubmit={event => { event.preventDefault(); if (label.trim()) save.mutate({ id: engagementId, label: label.trim() }); }}>
          <Input value={label} onChange={event => setLabel(event.target.value)} maxLength={160} placeholder="Name this save, e.g. Sent to customer for review" className="h-9 rounded-md" aria-label="Name for this save" />
          <Button type="submit" size="sm" className="h-9 shrink-0" disabled={!label.trim() || save.isPending}><Save className="size-4" /> Save to history</Button>
        </form>
        <DataMount id="fcpVersions" query={query} isEmpty={data => data.length === 0} empty={{ icon: History, title: "Nothing saved yet", sub: "Save one above. A copy is also kept when the FCP goes for approval and when it is exported." }} className="border-t border-s100">
          {data => (
            <ol className="divide-y divide-s100">
              {data.map(version => (
                <li key={version.id} className="space-y-2 bg-surface px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{version.label}</p>
                      <p className="text-xs text-ink-muted">{new Date(version.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}{version.createdByName ? ` · ${version.createdByName}` : ""}</p>
                    </div>
                    <Chip>{{ manual: "Saved", submitted: "Submitted", export: "Exported", restore: "Before restore" }[version.reason]}</Chip>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="h-7" onClick={() => setPreviewId(version.id)}><Eye className="size-3.5" /> Preview</Button>
                    <Button variant="outline" size="sm" className="h-7" disabled={html.isPending} onClick={() => void download(version.id)}><Download className="size-3.5" /> HTML</Button>
                    <Button variant="outline" size="sm" className="h-7" disabled={readOnly || restore.isPending} title={readOnly ? "Someone else is editing this FCP" : undefined} onClick={() => { if (window.confirm(`Restore the FCP as it was saved on ${savedWhen(version.createdAt)}? The FCP as it is now is kept in history first.`)) restore.mutate({ id: engagementId, versionId: version.id }); }}><RotateCcw className="size-3.5" /> Restore</Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </DataMount>
      </SheetContent>
      <VersionPreview engagementId={engagementId} versionId={previewId} onClose={() => setPreviewId(null)} />
    </Sheet>
  );
}

const savedWhen = (at: Date | string) => new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
/** A file-name-safe save time, e.g. 2026-10-23-1405. */
const savedStamp = (at: Date | string) => { const d = new Date(at); const pad = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`; };

function VersionPreview({ engagementId, versionId, onClose }: { engagementId: number; versionId: number | null; onClose: () => void }) {
  const version = trpc.fcpRecord.version.useQuery({ id: engagementId, versionId: versionId ?? 0 }, { enabled: versionId !== null });
  const render = trpc.document.preview.useMutation();
  const [html, setHtml] = useState<{ id: number; html: string } | null>(null);
  const loaded = version.data && versionId !== null && version.data.id === versionId ? version.data : null;
  useEffect(() => {
    if (!loaded || html?.id === loaded.id) return;
    render.mutate({ title: loaded.title, data: loaded.data }, { onSuccess: result => setHtml({ id: loaded.id, html: result.html }) });
  }, [loaded?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={versionId !== null} onOpenChange={value => !value && onClose()}>
      <DialogContent className="h-[85vh] max-w-5xl sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{version.data ? `Saved ${savedWhen(version.data.createdAt)}: ${version.data.label}` : "Saved FCP"}</DialogTitle>
          <DialogDescription>How the FCP read at this version. Read only.</DialogDescription>
        </DialogHeader>
        {html?.id === versionId ? <iframe title="Saved FCP preview" sandbox="" srcDoc={html.html} className="h-full w-full rounded-lg border border-s100 bg-surface" /> : <div className="grid h-full place-items-center"><Loader2 className="size-6 animate-spin text-cdw-red" /></div>}
      </DialogContent>
    </Dialog>
  );
}
