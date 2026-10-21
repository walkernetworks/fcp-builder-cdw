import { useAuth } from "@/_core/hooks/useAuth";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger } from "@/components/ui/sidebar";
import { trpc } from "@/lib/trpc";
import { ROLE_VIEW_LABELS, type VsaRole } from "@shared/vsaViews";
import { ChevronsUpDown, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { CommandPalette } from "./CommandPalette";
import { CdwLogo } from "./elements";
import { activeNavItem, NAV_GROUPS, navGroupsFor, workspaceName } from "./navigation";
import { ShellProvider, useShell } from "./ShellContext";

export const PROPRIETARY_LEGEND = "CDW — Proprietary and confidential. Copying restricted.";
const SIDEBAR_KEY = "vsa.sidebarOpen";

function readSidebarOpen() {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) !== "false";
  } catch {
    return true;
  }
}

/** App chrome for every signed-in view: sidebar, top bar (search, workspace, theme, user), breadcrumbs, and the proprietary legend. */
export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(readSidebarOpen);
  const onOpenChange = (value: boolean) => {
    setOpen(value);
    try {
      window.localStorage.setItem(SIDEBAR_KEY, String(value));
    } catch {
      // A blocked store only means the sidebar forgets its state.
    }
  };

  // Every data mount must declare its state; one that rendered nothing is a defect, so say so loudly in development.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const timer = window.setTimeout(() => {
      const silent = Array.from(document.querySelectorAll("[data-tile-mount]:not([data-state])"));
      if (silent.length) console.error("TILE AUDIT FAILED: mounts without data-state", silent.map(element => element.id));
    }, 1500);
    return () => window.clearTimeout(timer);
  });

  return (
    <ShellProvider>
      <SidebarProvider open={open} onOpenChange={onOpenChange}>
        <AppSidebar />
        <SidebarInset className="min-w-0 bg-s50">
          <TopBar />
          <div className="flex-1">{children}</div>
          <footer className="border-t border-s100 px-6 py-3">
            <p className="proprietary-legend">{PROPRIETARY_LEGEND}</p>
          </footer>
        </SidebarInset>
        <CommandPalette />
      </SidebarProvider>
    </ShellProvider>
  );
}

function AppSidebar() {
  const { user } = useAuth();
  const [location] = useLocation();
  const active = activeNavItem(location);
  return (
    <Sidebar collapsible="icon" className="border-r border-s100">
      <SidebarHeader className="h-14 justify-center border-b border-s100 px-3">
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden" aria-label="VSA Tracker home">
          <CdwLogo className="w-[40px] shrink-0 text-cdw-red group-data-[collapsible=icon]:w-[30px]" />
          <span className="truncate border-l border-s100 pl-2.5 text-[13px] font-semibold text-ink group-data-[collapsible=icon]:hidden">VSA Tracker</span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0 py-2">
        {navGroupsFor(user?.role).map(group => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel className="h-7 text-[11px] font-medium text-ink-subtle">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(item => {
                  const isActive = active?.href === item.href;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label} className="relative h-8 text-[13px] text-ink-muted data-[active=true]:font-medium data-[active=true]:text-ink">
                        <Link href={item.href} aria-current={isActive ? "page" : undefined}>
                          {isActive && <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-cdw-red" />}
                          <item.icon className={isActive ? "text-cdw-red-text" : undefined} />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-s100 p-2">
        <p className="px-2 text-[11px] text-ink-subtle group-data-[collapsible=icon]:hidden">Standalone. Data moves in and out only as files.</p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function TopBar() {
  const { user } = useAuth();
  const { setCommandOpen } = useShell();
  const { resolvedTheme, setTheme } = useTheme();
  const [location] = useLocation();
  const page = activeNavItem(location);
  const group = NAV_GROUPS.find(item => item.items.includes(page!));
  const dark = resolvedTheme === "dark";
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="sticky top-0 z-30 border-b border-s100 bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="flex h-14 items-center gap-3 px-4">
        <SidebarTrigger className="text-ink-muted" />
        <span className="h-5 w-px bg-s100" aria-hidden />
        <span className="hidden truncate text-[13px] font-medium text-ink sm:inline">{workspaceName(user?.workspaceId)}</span>
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="ml-auto flex h-8 w-full max-w-[360px] items-center gap-2 rounded-md border border-s100 bg-s50 px-2.5 text-left text-[13px] text-ink-subtle hover:border-s200 sm:ml-6"
          aria-label="Search records, screens, and actions"
        >
          <Search className="size-3.5" aria-hidden />
          <span className="flex-1 truncate">Search records and screens</span>
          <Kbd className="hidden sm:inline-flex">{mac ? "⌘" : "Ctrl"} K</Kbd>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <UserMenu />
        </div>
      </div>
      <div className="flex h-9 items-center border-t border-s100 px-6">
        <Breadcrumb>
          <BreadcrumbList className="text-xs">
            <BreadcrumbItem>{workspaceName(user?.workspaceId)}</BreadcrumbItem>
            {group && <><BreadcrumbSeparator /><BreadcrumbItem>{group.label}</BreadcrumbItem></>}
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage className="font-medium">{page?.label ?? "Not found"}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}

function UserMenu() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const setRole = trpc.auth.setVsaRole.useMutation({ onSuccess: () => utils.auth.me.invalidate(), onError: error => toast.error(error.message) });
  const initials = (user?.name ?? "?").split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-8 items-center gap-2 rounded-md px-1.5 text-left hover:bg-surface-sunken" aria-label="Account and default queue">
          <span className="grid size-6 place-items-center rounded-full bg-s600 text-[11px] font-semibold text-surface">{initials}</span>
          <span className="hidden max-w-[160px] truncate text-[13px] font-medium text-ink lg:inline">{user?.name}</span>
          <ChevronsUpDown className="hidden size-3.5 text-ink-subtle lg:inline" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="text-[13px] font-medium text-ink">{user?.name}</p>
          <p className="truncate text-xs text-ink-muted">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-ink-muted">Default queue in My Queue</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={user?.vsaRole ?? ""} onValueChange={value => setRole.mutate({ vsaRole: (value || null) as VsaRole | null })}>
          <DropdownMenuRadioItem value="">Awaiting my action</DropdownMenuRadioItem>
          {(Object.keys(ROLE_VIEW_LABELS) as VsaRole[]).map(role => <DropdownMenuRadioItem key={role} value={role}>{ROLE_VIEW_LABELS[role]}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11px] text-ink-subtle">Signed in through CDW single sign-on</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
