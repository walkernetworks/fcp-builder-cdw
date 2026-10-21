import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { dayOf } from "@/components/vsa/AdminUsers";
import { Chip, DataMount, EmptyState, PageHeader, Panel } from "@/components/vsa/elements";
import { workspaceName } from "@/components/vsa/navigation";
import { useShell } from "@/components/vsa/ShellContext";
import { ROLE_LABELS } from "@/lib/vsaLabels";
import { trpc } from "@/lib/trpc";
import { ADMIN_USER_FIELDS, USER_ROLE_LABELS, type AdminUserField, type AdminUserPatchInput } from "@shared/adminUsers";
import { STAGE_LABELS } from "@shared/vsaStage";
import { ROLE_VIEW_LABELS } from "@shared/vsaViews";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowLeft, Briefcase, History, Pencil, ShieldCheck, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Link, useParams } from "wouter";
import type { AppRouter } from "../../../server/routers";

type Profile = inferRouterOutputs<AppRouter>["admin"]["users"]["get"];
type Draft = Record<AdminUserField, string>;

const selectClass = "h-8 w-full max-w-[260px] rounded-md border border-s200 bg-surface px-2 text-[13px] text-ink";

function draftOf(user: Profile["user"]): Draft {
  return { role: user.role, vsaRole: user.vsaRole ?? "", workspaceId: String(user.workspaceId) };
}

/** Only the fields that changed, typed for `admin.users.update`. */
function patchOf(user: Profile["user"], draft: Draft): AdminUserPatchInput {
  const before = draftOf(user);
  const patch: AdminUserPatchInput = {};
  if (draft.role !== before.role) patch.role = draft.role as AdminUserPatchInput["role"];
  if (draft.vsaRole !== before.vsaRole) patch.vsaRole = (draft.vsaRole || null) as AdminUserPatchInput["vsaRole"];
  if (draft.workspaceId !== before.workspaceId) patch.workspaceId = Number(draft.workspaceId);
  return patch;
}

/** /admin/users/:id: one user's access, the record assignments they hold, and their recent activity. Admins only. */
export default function AdminUserProfile() {
  const { user: me, loading } = useAuth();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const isAdmin = me?.role === "admin";
  const profile = trpc.admin.users.get.useQuery({ id }, { enabled: isAdmin && Number.isInteger(id) && id > 0, retry: false });

  if (loading) return null;
  return (
    <main className="mx-auto max-w-[1600px] space-y-5 px-6 py-6">
      <Link href="/admin?section=users" className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden /> All users
      </Link>
      {!isAdmin ? (
        <EmptyState icon={ShieldCheck} title="Admins only" sub="User profiles are open to users whose role is admin. Ask an admin if you need access." />
      ) : (
        <DataMount id="admin-user-profile" query={profile} empty={{ icon: UserRound, title: "User not found", sub: "This user does not exist. Go back to the list." }} className="space-y-5">
          {data => <ProfileBody data={data} />}
        </DataMount>
      )}
    </main>
  );
}

function ProfileBody({ data }: { data: Profile }) {
  const { user: me } = useAuth();
  const { user } = data;
  const isMe = me?.id === user.id;
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">{user.name ?? "No name"}{user.role === "admin" && <Chip>Admin</Chip>}{isMe && <Chip>You</Chip>}</span>}
        sub={`${user.email ?? "No email"} · First signed in ${dayOf(user.createdAt)}`}
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <AccessPanel data={data} isMe={isMe} />
        <div className="space-y-5">
          <AssignmentsPanel data={data} />
          <ActivityPanel data={data} />
        </div>
      </div>
    </>
  );
}

function AccessPanel({ data, isMe }: { data: Profile; isMe: boolean }) {
  const { user, workspaces } = data;
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(user));
  const adminCount = trpc.admin.users.list.useQuery(undefined, { enabled: editing }).data?.users.filter(item => item.role === "admin").length;
  const update = trpc.admin.users.update.useMutation({
    onSuccess: async () => {
      toast.success(`Saved ${user.name ?? user.email ?? "user"}`);
      setEditing(false);
      await Promise.all([utils.admin.users.get.invalidate({ id: user.id }), utils.admin.users.list.invalidate(), utils.auth.me.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });

  const patch = patchOf(user, draft);
  const changed = Object.keys(patch).length;
  // The server enforces this inside a locked transaction; saying so here saves a round trip.
  const lastAdmin = user.role === "admin" && draft.role === "user" && adminCount !== undefined && adminCount <= 1;
  const losesAccess = isMe && user.role === "admin" && draft.role === "user" && !lastAdmin;
  const workspaceOptions = workspaces.map(workspace => ({ value: String(workspace.id), label: workspace.name || workspaceName(workspace.id) }));
  const display: Record<AdminUserField, ReactNode> = {
    role: USER_ROLE_LABELS[user.role],
    vsaRole: user.vsaRole ? ROLE_VIEW_LABELS[user.vsaRole] : <span className="text-ink-subtle">None</span>,
    workspaceId: workspaceOptions.find(option => option.value === String(user.workspaceId))?.label ?? workspaceName(user.workspaceId),
  };

  const start = () => {
    setDraft(draftOf(user));
    setEditing(true);
  };

  return (
    <Panel
      title="Access"
      sub="Role is the permission. Role view only picks the default queue."
      actions={editing ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={update.isPending}>Cancel</Button>
          <Button size="sm" onClick={() => update.mutate({ id: user.id, patch })} disabled={!changed || lastAdmin || update.isPending}>{update.isPending ? "Saving…" : "Save"}</Button>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={start}><Pencil className="size-3.5" aria-hidden /> Edit access</Button>
      )}
    >
      <dl className="divide-y divide-s100 text-[13px]">
        {ADMIN_USER_FIELDS.map(field => (
          <Fact key={field.key} label={field.label} hint={editing ? field.hint : undefined}>
            {editing ? (
              <select aria-label={field.label} className={selectClass} value={draft[field.key]} onChange={event => setDraft({ ...draft, [field.key]: event.target.value })} data-changed={draft[field.key] !== draftOf(user)[field.key] || undefined}>
                {field.key === "vsaRole" && <option value="">None</option>}
                {(field.key === "workspaceId" ? workspaceOptions : field.options ?? []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : (
              display[field.key]
            )}
          </Fact>
        ))}
        <Fact label="Last sign-in">{dayOf(user.lastSignedIn)}</Fact>
        <Fact label="Last changed">{user.updatedByName ? `${dayOf(user.updatedAt)} by ${user.updatedByName}` : <span className="text-ink-subtle">Not changed here</span>}</Fact>
      </dl>
      {editing && (lastAdmin || losesAccess || changed > 0) && (
        <div className="border-t border-s100 px-4 py-3 text-xs">
          {lastAdmin && <p className="text-state-blocked-text">This is the only admin. Make someone else an admin first, so the app is never left without one.</p>}
          {losesAccess && <p className="text-state-warn-text">You will lose access to Admin when you save.</p>}
          {!lastAdmin && changed > 0 && <p className="text-ink-muted">{changed} {changed === 1 ? "change" : "changes"}, recorded against your name when saved.</p>}
        </div>
      )}
    </Panel>
  );
}

function AssignmentsPanel({ data }: { data: Profile }) {
  const { openRecord } = useShell();
  return (
    <Panel title="Record assignments" sub={data.assignments.length ? `${data.assignments.length} on records you can see. Select one to open it.` : "Roles this person holds on records."}>
      {data.assignments.length === 0 ? (
        <div className="p-4"><EmptyState icon={Briefcase} title="No assignments" sub="This person holds no role on a record you can see. Roles are set on a record's People tab." /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Customer</th><th>Role</th><th>Stage</th></tr></thead>
            <tbody>
              {data.assignments.map(item => (
                <tr key={`${item.recordId}-${item.role}`} data-selectable tabIndex={0} onClick={() => openRecord(item.recordId)} onKeyDown={event => event.key === "Enter" && openRecord(item.recordId)}>
                  <td className="max-w-[280px]">
                    <p className="truncate font-medium">{item.customerName}</p>
                    <p className="truncate text-xs text-ink-muted">{item.opportunityNumber ?? "No opportunity number"}</p>
                  </td>
                  <td>{ROLE_LABELS[item.role] ?? item.role}</td>
                  <td className="whitespace-nowrap">{STAGE_LABELS[item.stage]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function ActivityPanel({ data }: { data: Profile }) {
  const { openRecord } = useShell();
  return (
    <Panel title="Recent activity" sub="Stage moves, FCP versions saved, and admin changes, newest first.">
      {data.activity.length === 0 ? (
        <div className="p-4"><EmptyState icon={History} title="No activity yet" sub="Stage moves, saved FCP versions, and admin changes appear here." /></div>
      ) : (
        <ol className="vtl px-4 py-3">
          {data.activity.map((item, index) => (
            <li key={`${item.kind}-${index}`} className="vtl-item">
              <span className="vtl-dot" data-done="true" data-current={index === 0 ? "true" : undefined} aria-hidden />
              <span className="text-[13px] text-ink">
                {item.text}
                {item.recordId !== null && (
                  <button type="button" className="mt-0.5 block text-left text-xs text-ink-muted hover:text-ink hover:underline" onClick={() => openRecord(item.recordId!)}>{item.customerName}</button>
                )}
              </span>
              <span className="tabular text-right text-xs text-ink-muted">{dayOf(item.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Fact({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] items-center gap-3 px-4 py-2.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-ink">
        {children}
        {hint && <p className="mt-1 text-xs text-ink-subtle">{hint}</p>}
      </dd>
    </div>
  );
}
