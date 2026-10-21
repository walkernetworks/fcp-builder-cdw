import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { USER_ROLE_LABELS } from "@shared/adminUsers";
import { formatDay, ROLE_VIEW_LABELS } from "@shared/vsaViews";
import type { inferRouterOutputs } from "@trpc/server";
import { ChevronRight, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
import type { AppRouter } from "../../../../server/routers";
import { Chip, DataMount } from "./elements";
import { workspaceName } from "./navigation";

type UsersData = inferRouterOutputs<AppRouter>["admin"]["users"]["list"];

export const dayOf = (value: Date | string | null | undefined) => (value ? formatDay(new Date(value).toISOString().slice(0, 10)) : "—");
export const profileHref = (id: number) => `/admin/users/${id}`;

/** Users: everyone who has signed in. Read-only here; a user's access is edited on their profile, so each field has one edit surface. */
export function AdminUsers() {
  const list = trpc.admin.users.list.useQuery();
  return (
    <DataMount id="admin-users" query={list} isEmpty={data => data.users.length === 0} empty={{ icon: Users, title: "No users yet", sub: "Users appear after they first sign in through CDW single sign-on." }}>
      {data => <UserTable data={data} />}
    </DataMount>
  );
}

/** One-line summary for the section header. */
export function useUsersSummary() {
  const list = trpc.admin.users.list.useQuery();
  if (!list.data) return null;
  const admins = list.data.users.filter(user => user.role === "admin").length;
  return `${list.data.users.length} ${list.data.users.length === 1 ? "user" : "users"} · ${admins} ${admins === 1 ? "admin" : "admins"}`;
}

function UserTable({ data }: { data: UsersData }) {
  const { user: me } = useAuth();
  const [, navigate] = useLocation();
  const workspace = (id: number) => data.workspaces.find(item => item.id === id)?.name || workspaceName(id);
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Role view</th>
            <th>Workspace</th>
            <th className="num">Last sign-in</th>
            <th>Last changed</th>
            <th className="w-[1%]"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {data.users.map(user => {
            const open = () => navigate(profileHref(user.id));
            return (
              <tr key={user.id} data-selectable tabIndex={0} onClick={open} onKeyDown={event => event.key === "Enter" && open()}>
                <td className="max-w-[280px]">
                  <p className="flex items-center gap-1.5 truncate">
                    <Link href={profileHref(user.id)} className="font-medium text-ink hover:underline" onClick={event => event.stopPropagation()}>{user.name ?? "No name"}</Link>
                    {me?.id === user.id && <Chip>You</Chip>}
                  </p>
                  <p className="truncate text-xs text-ink-muted">{user.email ?? "No email"}</p>
                </td>
                <td>{user.role === "admin" ? <Chip>{USER_ROLE_LABELS.admin}</Chip> : USER_ROLE_LABELS.user}</td>
                <td>{user.vsaRole ? ROLE_VIEW_LABELS[user.vsaRole] : <span className="text-ink-subtle">—</span>}</td>
                <td>{workspace(user.workspaceId)}</td>
                <td className="num whitespace-nowrap">{dayOf(user.lastSignedIn)}</td>
                <td className="whitespace-nowrap text-xs text-ink-muted">{user.updatedByName ? `${dayOf(user.updatedAt)} · ${user.updatedByName}` : <span className="text-ink-subtle">Not changed here</span>}</td>
                <td><ChevronRight className="size-4 text-ink-subtle" aria-hidden /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
