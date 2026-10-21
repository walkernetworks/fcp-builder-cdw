import { BarChart3, CalendarClock, FileText, Inbox, LayoutDashboard, Rows3, TableProperties, Upload, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** The sidebar, the command palette, and the breadcrumbs all read this one list. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Tracker",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/pipeline", label: "Pipeline", icon: Rows3 },
      { href: "/expiry", label: "Expiry & Burndown", icon: CalendarClock },
      { href: "/queue", label: "My Queue", icon: Inbox },
      { href: "/records", label: "Records", icon: TableProperties },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/fcp", label: "FCP workspace", icon: FileText },
      { href: "/import", label: "Import", icon: Upload },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
];

export function activeNavItem(location: string): NavItem | undefined {
  const items = NAV_GROUPS.flatMap(group => group.items);
  return items.find(item => (item.href === "/" ? location === "/" : location === item.href || location.startsWith(`${item.href}/`)));
}

/** Display names for workspaces. The tracker has one (seeded by migration 0002); others show their number. */
export function workspaceName(workspaceId: number | undefined) {
  return workspaceId === 1 || workspaceId === undefined ? "CDW VSA" : `Workspace ${workspaceId}`;
}
