import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ADMIN_USER_FIELDS, USER_ROLE_LABELS, type AdminUserField, type AdminUserPatchInput } from "@shared/adminUsers";
import { formatDay, ROLE_VIEW_LABELS } from "@shared/vsaViews";
import type { inferRouterOutputs } from "@trpc/server";
import { Pencil, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../../server/routers";
import { Chip, DataMount, Panel } from "./elements";
import { workspaceName } from "./navigation";

type UsersData = inferRouterOutputs<AppRouter>["admin"]["users"]["list"];
type AdminUser = UsersData["users"][number];
type Draft = Record<AdminUserField, string>;

const selectClass = "h-8 w-full min-w-[120px] rounded-md border border-s200 bg-surface px-2 text-[13px] text-ink";
const dayOf = (value: Date | string | null) => (value ? formatDay(new Date(value).toISOString().slice(0, 10)) : "—");

function draftOf(user: AdminUser): Draft {
  return { role: user.role, vsaRole: user.vsaRole ?? "", workspaceId: String(user.workspaceId) };
}

/** Only the fields that changed, typed for `admin.users.update`. */
function patchOf(user: AdminUser, draft: Draft): AdminUserPatchInput {
  const before = draftOf(user);
  const patch: AdminUserPatchInput = {};
  if (draft.role !== before.role) patch.role = draft.role as AdminUserPatchInput["role"];
  if (draft.vsaRole !== before.vsaRole) patch.vsaRole = (draft.vsaRole || null) as AdminUserPatchInput["vsaRole"];
  if (draft.workspaceId !== before.workspaceId) patch.workspaceId = Number(draft.workspaceId);
  return patch;
}

/** Users: everyone who has signed in, with their permission, role view, and workspace. One row is edited at a time. */
export function AdminUsers() {
  const list = trpc.admin.users.list.useQuery();
  const admins = list.data?.users.filter(user => user.role === "admin").length ?? 0;
  return (
    <Panel title="Users" sub={list.data ? `${list.data.users.length} ${list.data.users.length === 1 ? "user" : "users"} · ${admins} ${admins === 1 ? "admin" : "admins"}. People appear here after their first sign-in.` : "People appear here after their first sign-in."}>
      <DataMount id="admin-users" query={list} isEmpty={data => data.users.length === 0} empty={{ icon: Users, title: "No users yet", sub: "Users appear after they first sign in through CDW single sign-on." }}>
        {data => <UserTable data={data} admins={admins} />}
      </DataMount>
    </Panel>
  );
}

function UserTable({ data, admins }: { data: UsersData; admins: number }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Name</th>
            {ADMIN_USER_FIELDS.map(field => <th key={field.key} title={field.hint}>{field.label}</th>)}
            <th className="num">Last sign-in</th>
            <th>Last changed</th>
            <th className="w-[1%]"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {data.users.map(user => (
            <UserRow key={user.id} user={user} workspaces={data.workspaces} admins={admins} editing={editingId === user.id} onEdit={() => setEditingId(user.id)} onDone={() => setEditingId(null)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({ user, workspaces, admins, editing, onEdit, onDone }: { user: AdminUser; workspaces: UsersData["workspaces"]; admins: number; editing: boolean; onEdit: () => void; onDone: () => void }) {
  const { user: me } = useAuth();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<Draft>(() => draftOf(user));
  const update = trpc.admin.users.update.useMutation({
    onSuccess: async () => {
      toast.success(`Saved ${user.name ?? user.email ?? "user"}`);
      onDone();
      await Promise.all([utils.admin.users.list.invalidate(), utils.auth.me.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });
  const isMe = me?.id === user.id;
  const patch = patchOf(user, draft);
  const changed = Object.keys(patch).length;
  // The server refuses this too; saying so here saves a round trip.
  const lastAdmin = user.role === "admin" && draft.role === "user" && admins <= 1;
  const losesAccess = isMe && draft.role === "user" && !lastAdmin;

  const start = () => {
    setDraft(draftOf(user));
    onEdit();
  };
  const workspaceOptions = workspaces.map(workspace => ({ value: String(workspace.id), label: workspace.name || workspaceName(workspace.id) }));
  const display: Record<AdminUserField, string> = {
    role: USER_ROLE_LABELS[user.role],
    vsaRole: user.vsaRole ? ROLE_VIEW_LABELS[user.vsaRole] : "—",
    workspaceId: workspaceOptions.find(option => option.value === String(user.workspaceId))?.label ?? workspaceName(user.workspaceId),
  };

  return (
    <tr data-editing={editing || undefined} className={editing ? "bg-surface-sunken/60" : undefined}>
      <td className="max-w-[260px]">
        <p className="flex items-center gap-1.5 truncate font-medium">{user.name ?? "No name"}{isMe && <Chip>You</Chip>}</p>
        <p className="truncate text-xs text-ink-muted">{user.email ?? "No email"}</p>
      </td>
      {ADMIN_USER_FIELDS.map(field => (
        <td key={field.key}>
          {editing ? (
            <select
              aria-label={`${field.label} for ${user.name ?? user.email ?? "user"}`}
              className={selectClass}
              value={draft[field.key]}
              onChange={event => setDraft({ ...draft, [field.key]: event.target.value })}
            >
              {field.key === "vsaRole" && <option value="">None</option>}
              {(field.key === "workspaceId" ? workspaceOptions : field.options ?? []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ) : field.key === "role" && user.role === "admin" ? (
            <Chip>{display.role}</Chip>
          ) : (
            <span className={display[field.key] === "—" ? "text-ink-subtle" : undefined}>{display[field.key]}</span>
          )}
        </td>
      ))}
      <td className="num whitespace-nowrap">{dayOf(user.lastSignedIn)}</td>
      <td className="whitespace-nowrap text-xs text-ink-muted">{user.updatedByName ? `${dayOf(user.updatedAt)} · ${user.updatedByName}` : <span className="text-ink-subtle">Not changed here</span>}</td>
      <td className="whitespace-nowrap">
        {editing ? (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={onDone} disabled={update.isPending}>Cancel</Button>
              <Button size="sm" onClick={() => update.mutate({ id: user.id, patch })} disabled={!changed || lastAdmin || update.isPending}>
                {update.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
            {lastAdmin && <p className="max-w-[220px] text-right text-xs text-state-blocked-text">The only admin. Make someone else an admin first.</p>}
            {losesAccess && <p className="max-w-[220px] text-right text-xs text-state-warn-text">You will lose access to Admin.</p>}
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={start} aria-label={`Edit ${user.name ?? user.email ?? "user"}`}>
            <Pencil className="size-3.5" aria-hidden /> Edit
          </Button>
        )}
      </td>
    </tr>
  );
}
