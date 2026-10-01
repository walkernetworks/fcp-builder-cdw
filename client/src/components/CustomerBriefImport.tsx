import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { applyCustomerBrief, type BriefImportResult } from "@shared/briefImport";
import { COPILOT_BRIEF_PROMPT } from "@shared/briefPrompt";
import type { EngagementDocument } from "@shared/fcp";
import { ClipboardCopy, FileJson, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type Props = {
  document: EngagementDocument;
  onChange: (document: EngagementDocument) => void;
};

function List({ title, items, tone }: { title: string; items: string[]; tone: "slate" | "amber" | "blue" }) {
  if (!items.length) return null;
  const colors = { slate: "border-slate-200 bg-slate-50 text-slate-800", amber: "border-amber-200 bg-amber-50 text-amber-900", blue: "border-blue-200 bg-blue-50 text-blue-950" }[tone];
  return (
    <section className={`rounded-xl border p-3 ${colors}`}>
      <p className="text-xs font-bold uppercase tracking-wide">{title} ({items.length})</p>
      <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs leading-5">{items.map(item => <li key={item}>{item}</li>)}</ul>
    </section>
  );
}

/** Imports the customer brief (JSON from Copilot) in the browser, with a preview before anything is applied. */
export function CustomerBriefImport({ document, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ filename: string; result: BriefImportResult } | null>(null);
  const report = document.report;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      setPreview({ filename: file.name, result: applyCustomerBrief(document, parsed) });
    } catch {
      toast.error(`${file.name} is not valid JSON.`);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(COPILOT_BRIEF_PROMPT);
      toast.success("Copilot prompt copied. Paste it into Copilot with the customer's notes, then save the JSON it returns and choose it here.");
    } catch {
      toast.error("The prompt could not be copied; copy it from docs/COPILOT-BRIEF-PROMPT.md instead.");
    }
  };

  const apply = () => {
    if (!preview?.result.ok) return;
    onChange(preview.result.document);
    toast.success("Customer brief applied");
    setPreview(null);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-[#c8102e]">Customer brief</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Import the Copilot customer brief</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">A JSON file of call notes and questionnaire answers. Planning answers fill the plan inputs; what we heard, open questions, personnel and milestones fill the Condensed FCP. Read in this browser; nothing is applied until you confirm.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void copyPrompt()}><ClipboardCopy className="size-4" /> Copy Copilot prompt</Button>
          <Button variant="outline" onClick={() => inputRef.current?.click()}><Upload className="size-4" /> Choose brief JSON</Button>
        </div>
      </div>
      <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={event => void readFile(event.target.files?.[0])} />
      {report.briefVersion !== null && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 p-4">
          <FileJson className="mt-0.5 size-5 text-emerald-700" />
          <p className="text-sm text-slate-700">
            Brief imported {report.importedAt ? new Date(report.importedAt).toLocaleString() : ""}{report.asOf ? ` · notes as of ${report.asOf}` : ""}.
            {" "}{report.whatWeHeard.length} heard · {report.openQuestions.length} open questions · {report.openItems.length} open items · {report.personnel.length} personnel rows · {report.milestonesToDate.length} milestones.
          </p>
        </div>
      )}

      <Dialog open={preview !== null} onOpenChange={open => { if (!open) setPreview(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.result.ok ? "Review the customer brief" : "This brief cannot be imported"}</DialogTitle>
            <DialogDescription>{preview?.filename}{preview?.result.error ? ` — ${preview.result.error}` : ""}</DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto">
              <List title="Changes" items={preview.result.changes} tone="slate" />
              <List title="Wording mapped to allowed values" items={preview.result.coerced} tone="blue" />
              <List title="Not used" items={preview.result.warnings} tone="amber" />
              <List title="Missing — will show as open items" items={preview.result.missing} tone="amber" />
              {preview.result.ok && <p className="text-xs leading-5 text-slate-500">RVTools inventory is never changed. A plan you have edited by hand keeps its timelines; an unedited plan is rebuilt from the new inputs.</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
            <Button onClick={apply} disabled={!preview?.result.ok}>Apply brief</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
