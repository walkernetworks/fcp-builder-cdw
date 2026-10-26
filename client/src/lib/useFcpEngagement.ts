import type { ActiveExport, ExportFormat } from "@/components/fcp/workspaceParts";
import { downloadServerAttachment } from "@/lib/downloads";
import { trpc } from "@/lib/trpc";
import { useBuildLock } from "@/lib/useBuildLock";
import { exportFilename, type ExportDocumentType } from "@shared/exportFilename";
import { createDefaultDocument, migrateDocument, refreshDerivedDocument, type EngagementDocument } from "@shared/fcp";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const EXPORT_DOCUMENT_LABELS: Record<ExportDocumentType, string> = { fcp: "FCP", "condensed-fcp": "FCP", "plan-output": "Compatibility handoff", "building-blocks": "Building Blocks workbook" };

/**
 * One engagement's FCP in the workspace: load (with the same migration exports apply), autosave while this person holds
 * the build lock, the live preview, and exports. The same behavior as the six-step page (pages/Home.tsx), for one
 * engagement chosen by the route instead of a picker.
 */
export function useFcpEngagement(id: number) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [document, setDocument] = useState<EngagementDocument>(() => createDefaultDocument());
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [preview, setPreview] = useState<{ html: string; checks: string[] } | null>(null);
  const [activeExport, setActiveExport] = useState<ActiveExport>(null);
  const hydratedId = useRef<number | null>(null);
  /** The customer name and title this workspace loaded or last saved; sent with saves so the server can tell an FCP edit from a stale copy. */
  const baseCustomerName = useRef<string | null>(null);
  const baseTitle = useRef<string | null>(null);

  const selected = trpc.engagement.get.useQuery({ id }, { retry: false });
  const found = Boolean(selected.data);
  // One editor per FCP: while someone else holds the build lock, this workspace is read-only.
  const buildLock = useBuildLock(found ? id : null);
  const readOnly = buildLock.readOnly;
  const holdsLock = buildLock.lock.status === "held";

  const update = trpc.engagement.update.useMutation({
    onSuccess: async (row, sent) => {
      setDirty(false);
      setSaveState("saved");
      setSavedAt(new Date());
      // The server may keep a customer name changed in the tracker; adopt it unless the name was edited here since this save.
      const savedName = row.data.fields.customerName;
      const sentName = (sent.data as EngagementDocument).fields.customerName;
      baseCustomerName.current = savedName;
      baseTitle.current = row.title;
      if (savedName !== sentName) setDocument(current => (current.fields.customerName === sentName ? { ...current, fields: { ...current.fields, customerName: savedName } } : current));
      if (row.title !== sent.title) setTitle(current => (current === sent.title ? row.title : current));
      // A save can tick off sources (RVTools, brief, signed hours), so the record strip re-reads the checklist.
      await Promise.all([utils.engagement.list.invalidate(), utils.tracker.get.invalidate({ id: sent.id }), utils.fcpRecord.versions.invalidate({ id: sent.id })]);
    },
    onError: error => {
      setSaveState("unsaved");
      toast.error(error.message);
      if (error.data?.code === "CONFLICT") void buildLock.refresh();
    },
  });
  const previewMutation = trpc.document.preview.useMutation({ onSuccess: result => setPreview(result) });
  const downloadTicket = trpc.document.downloadTicket.useMutation();

  useEffect(() => {
    if (!selected.data || hydratedId.current === selected.data.id) return;
    hydratedId.current = selected.data.id;
    const migrated = migrateDocument(selected.data.data);
    const needsPersistence = JSON.stringify(migrated) !== JSON.stringify(selected.data.data);
    setTitle(selected.data.title);
    baseTitle.current = selected.data.title;
    baseCustomerName.current = migrated.fields.customerName;
    setDocument(migrated);
    setDirty(needsPersistence);
    setSaveState(needsPersistence ? "unsaved" : "saved");
  }, [selected.data]);
  // A rename made elsewhere (the record drawer, the import) reaches an open workspace, unless the name or title was edited here.
  useEffect(() => {
    if (!selected.data || hydratedId.current !== selected.data.id) return;
    const serverName = selected.data.data.fields.customerName;
    const serverTitle = selected.data.title;
    if (serverTitle !== baseTitle.current) {
      const previous = baseTitle.current;
      baseTitle.current = serverTitle;
      setTitle(current => (current === previous ? serverTitle : current));
    }
    if (serverName !== baseCustomerName.current) {
      const previous = baseCustomerName.current;
      baseCustomerName.current = serverName;
      setDocument(current => (current.fields.customerName === previous ? { ...current, fields: { ...current.fields, customerName: serverName } } : current));
    }
  }, [selected.data]);
  // Autosave only while this person holds the build lock; before the lock answers, or while someone else holds it, nothing is sent.
  useEffect(() => {
    if (!found || !dirty || !holdsLock) return;
    setSaveState("unsaved");
    const timer = window.setTimeout(() => { setSaveState("saving"); update.mutate({ id, title, data: document, baseCustomerName: baseCustomerName.current, baseTitle: baseTitle.current }); }, 1300);
    return () => window.clearTimeout(timer);
  }, [document, title, id, found, dirty, holdsLock]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (hydratedId.current !== id) return;
    const timer = window.setTimeout(() => previewMutation.mutate({ title, data: document }), 350);
    return () => window.clearTimeout(timer);
  }, [document, title, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutateDocument = (next: EngagementDocument) => {
    if (readOnly) return void toast.error(`${buildLock.lock.holder ?? "Someone"} is editing this FCP. Take over editing to make changes.`);
    setDocument(next);
    setDirty(true);
  };
  const renameTitle = (next: string) => {
    if (readOnly) return;
    setTitle(next);
    setDirty(true);
  };
  const buildPlan = () => {
    if (document.planAuthority === "manual" && !window.confirm("Apply the VCF 9.1 playbook template? This replaces the current manually edited Entitlement Adoption Timeline and Two-Year Notional with a newly generated plan from the confirmed pathway, design decisions, outcomes, dates, and hardware readiness.")) return;
    mutateDocument(refreshDerivedDocument(document, { forceRebuild: true }));
    toast.success("VCF 9.1 playbook template applied to both planning views");
  };
  const saveNow = () => { setSaveState("saving"); update.mutate({ id, title, data: document, baseCustomerName: baseCustomerName.current, baseTitle: baseTitle.current }); };
  /** Applies a change and saves it now, for a step the server checks against the saved FCP. Rejects if the save fails. */
  const saveDocument = async (next: EngagementDocument) => {
    if (readOnly) throw new Error(`${buildLock.lock.holder ?? "Someone"} is editing this FCP.`);
    setDocument(next);
    setSaveState("saving");
    await update.mutateAsync({ id, title, data: next, baseCustomerName: baseCustomerName.current, baseTitle: baseTitle.current });
  };
  const startExport = async (format: ExportFormat, documentType: ExportDocumentType = "condensed-fcp") => {
    if (activeExport) return;
    setActiveExport({ format, documentType });
    try {
      setSaveState("saving");
      await update.mutateAsync({ id, title, data: document, baseCustomerName: baseCustomerName.current, baseTitle: baseTitle.current });
      const result = await downloadTicket.mutateAsync({ id, format, documentType });
      const response = await fetch(result.url, { credentials: "same-origin" });
      await downloadServerAttachment(response, format, exportFilename(title, documentType, format));
      toast.success(`${EXPORT_DOCUMENT_LABELS[documentType]} ${format.toUpperCase()} download started`);
    } catch (error) {
      console.error(`[Export] ${documentType} ${format.toUpperCase()} download failed`, error);
      toast.error(error instanceof Error ? error.message : `The ${format.toUpperCase()} download could not be started.`);
    } finally {
      setActiveExport(null);
    }
  };
  /** After a restore from history: load the restored FCP from the server. */
  const reload = () => {
    hydratedId.current = null;
    void utils.engagement.get.invalidate({ id });
    void utils.tracker.get.invalidate({ id });
  };
  const takeOver = () => buildLock.takeOver().then(reload);

  return {
    query: selected,
    hydrated: hydratedId.current === id && found,
    title, renameTitle,
    document, mutateDocument,
    saveState, savedAt, saving: update.isPending, saveNow, saveDocument,
    preview: preview?.html ?? "", previewChecks: preview?.checks ?? [], previewPending: previewMutation.isPending,
    activeExport, startExport,
    buildPlan, reload,
    lock: buildLock.lock, readOnly, takeOver,
  };
}
