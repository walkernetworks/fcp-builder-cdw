import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import type { TrackerRecord } from "@/lib/vsa";
import { ROLE_LABELS, SOURCE_KIND_LABELS, SOURCE_STATUS_LABELS } from "@/lib/vsaLabels";
import { ASSIGNMENT_ROLES, SOURCE_ITEM_KINDS, SOURCE_ITEM_STATUSES, type AssignmentRole, type SourceItemKind, type SourceItemStatus } from "@shared/vsaFields";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const selectClass = "h-9 w-full rounded-md border border-s200 bg-surface px-3 text-sm text-ink";
const isEmail = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** One row per role: name, CDW email (links the person when they sign in), and Broadcom email. */
export function PeopleEditor({ data }: { data: TrackerRecord }) {
  return (
    <div className="divide-y divide-s100">
      {ASSIGNMENT_ROLES.map(role => <PersonRow key={role} recordId={data.record.id} role={role} current={data.assignments.find(assignment => assignment.role === role)} />)}
    </div>
  );
}

function PersonRow({ recordId, role, current }: { recordId: number; role: AssignmentRole; current?: TrackerRecord["assignments"][number] }) {
  const utils = trpc.useUtils();
  const initial = { displayName: current?.displayName ?? "", email: current?.email ?? "", broadcomEmail: current?.broadcomEmail ?? "" };
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [current?.displayName, current?.email, current?.broadcomEmail]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => Promise.all([utils.tracker.get.invalidate({ id: recordId }), utils.tracker.list.invalidate()]);
  const save = trpc.tracker.setAssignment.useMutation({ onSuccess: async () => { toast.success(`${ROLE_LABELS[role]} saved`); await refresh(); }, onError: error => toast.error(error.message) });
  const remove = trpc.tracker.removeAssignment.useMutation({ onSuccess: async () => { toast.success(`${ROLE_LABELS[role]} removed`); await refresh(); }, onError: error => toast.error(error.message) });
  const dirty = form.displayName !== initial.displayName || form.email !== initial.email || form.broadcomEmail !== initial.broadcomEmail;
  const emailProblem = !isEmail(form.email.trim()) || !isEmail(form.broadcomEmail.trim());

  return (
    <div className="space-y-2 bg-surface px-5 py-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-s500">{ROLE_LABELS[role]}</p>
        {current?.userId && <span className="chip">Signed-in user</span>}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input aria-label={`${ROLE_LABELS[role]} name`} placeholder="Name" className="h-9 rounded-md" value={form.displayName} onChange={event => setForm({ ...form, displayName: event.target.value })} />
        <Input aria-label={`${ROLE_LABELS[role]} CDW email`} placeholder="CDW email" className="h-9 rounded-md" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />
        <Input aria-label={`${ROLE_LABELS[role]} Broadcom email`} placeholder="Broadcom email" className="h-9 rounded-md" value={form.broadcomEmail} onChange={event => setForm({ ...form, broadcomEmail: event.target.value })} />
      </div>
      {emailProblem && <p className="text-xs font-semibold text-state-blocked-text">Enter a valid email address, or leave it empty.</p>}
      <div className="flex justify-end gap-2">
        {current && <Button type="button" variant="outline" size="sm" disabled={remove.isPending} onClick={() => { if (window.confirm(`Remove the ${ROLE_LABELS[role]} from this engagement?`)) remove.mutate({ id: recordId, role }); }}><Trash2 className="size-3.5" /> Remove</Button>}
        <Button type="button" size="sm" disabled={!dirty || !form.displayName.trim() || emailProblem || save.isPending} onClick={() => save.mutate({ id: recordId, role, displayName: form.displayName.trim(), email: form.email.trim() || null, broadcomEmail: form.broadcomEmail.trim() || null })}>Save</Button>
      </div>
    </div>
  );
}

/** The source checklist: status, dates, and where each input is kept. A waived source needs a note. */
export function SourcesEditor({ data }: { data: TrackerRecord }) {
  const utils = trpc.useUtils();
  const [kind, setKind] = useState<SourceItemKind>("other");
  const [label, setLabel] = useState("");
  const add = trpc.tracker.addSource.useMutation({
    onSuccess: async () => { setLabel(""); toast.success("Source added"); await utils.tracker.get.invalidate({ id: data.record.id }); },
    onError: error => toast.error(error.message),
  });
  return (
    <div className="divide-y divide-s100">
      {data.sources.length === 0 && <p className="bg-surface px-5 py-4 text-sm text-ink-muted">No sources listed. Add the inputs this FCP is built from.</p>}
      {data.sources.map(source => <SourceRow key={source.id} recordId={data.record.id} source={source} />)}
      <div className="space-y-2 bg-surface px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-s500">Add a source</p>
        <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
          <select aria-label="Source kind" className={selectClass} value={kind} onChange={event => setKind(event.target.value as SourceItemKind)}>
            {SOURCE_ITEM_KINDS.map(option => <option key={option} value={option}>{SOURCE_KIND_LABELS[option]}</option>)}
          </select>
          <Input aria-label="Source label" placeholder="What it is" className="h-9 rounded-md" value={label} onChange={event => setLabel(event.target.value)} />
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={!label.trim() || add.isPending} onClick={() => add.mutate({ id: data.record.id, item: { kind, label: label.trim() } })}><Plus className="size-4" /> Add</Button>
        </div>
      </div>
    </div>
  );
}

function SourceRow({ recordId, source }: { recordId: number; source: TrackerRecord["sources"][number] }) {
  const utils = trpc.useUtils();
  const initial = { status: source.status, receivedOn: source.receivedOn ?? "", reference: source.reference ?? "", note: source.note ?? "" };
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [source.status, source.receivedOn, source.reference, source.note]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => utils.tracker.get.invalidate({ id: recordId });
  const save = trpc.tracker.updateSource.useMutation({ onSuccess: async () => { toast.success(`${source.label} saved`); await refresh(); }, onError: error => toast.error(error.message) });
  const remove = trpc.tracker.deleteSource.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const needsNote = form.status === "waived" && !form.note.trim();

  return (
    <div className="space-y-2 bg-surface px-5 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{source.label}<span className="ml-2 text-xs font-normal text-ink-muted">{SOURCE_KIND_LABELS[source.kind]}{source.required ? "" : " · optional"}</span></p>
        <button type="button" className="text-xs font-semibold text-ink-muted hover:text-state-blocked-text" onClick={() => { if (window.confirm(`Remove "${source.label}" from the checklist?`)) remove.mutate({ id: recordId, itemId: source.id }); }}>Remove</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[150px_150px_1fr]">
        <select aria-label={`${source.label} status`} className={selectClass} value={form.status} onChange={event => setForm({ ...form, status: event.target.value as SourceItemStatus })}>
          {SOURCE_ITEM_STATUSES.map(option => <option key={option} value={option}>{SOURCE_STATUS_LABELS[option]}</option>)}
        </select>
        <Input aria-label={`${source.label} received date`} type="date" className="h-9 rounded-md" value={form.receivedOn} onChange={event => setForm({ ...form, receivedOn: event.target.value })} />
        <Input aria-label={`${source.label} reference`} placeholder="File name or folder path" className="h-9 rounded-md" value={form.reference} onChange={event => setForm({ ...form, reference: event.target.value })} />
      </div>
      <Input aria-label={`${source.label} note`} placeholder={form.status === "waived" ? "Why it is waived (required)" : "Note"} className="h-9 rounded-md" value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} />
      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={!dirty || needsNote || save.isPending} onClick={() => save.mutate({ id: recordId, itemId: source.id, patch: { status: form.status, receivedOn: form.receivedOn || null, reference: form.reference.trim() || null, note: form.note.trim() || null } })}>Save</Button>
      </div>
    </div>
  );
}
