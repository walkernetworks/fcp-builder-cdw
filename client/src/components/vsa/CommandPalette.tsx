import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { trpc } from "@/lib/trpc";
import { STAGE_LABELS } from "@shared/vsaStage";
import { Building2, Moon, Plus, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { NAV_GROUPS } from "./navigation";
import { useShell } from "./ShellContext";

/** Cmd-K / Ctrl-K: jump to a screen, open any record by customer, opportunity, or SER number, or run an action. */
export function CommandPalette() {
  const { commandOpen: open, setCommandOpen: setOpen, openRecord, newEngagement } = useShell();
  const [, navigate] = useLocation();
  const { resolvedTheme, setTheme } = useTheme();
  const list = trpc.tracker.list.useQuery({}, { enabled: open, staleTime: 30_000 });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Jump to a screen or a record" className="sm:max-w-xl">
      <CommandInput placeholder="Search records, screens, and actions…" />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>{list.isLoading ? "Loading records…" : "No matches."}</CommandEmpty>
        <CommandGroup heading="Records">
          {(list.data ?? []).slice(0, 400).map(row => (
            <CommandItem key={row.id} value={`${row.customerName} ${row.opportunityNumber ?? ""} ${row.serNumber ?? ""} #${row.id}`} onSelect={() => run(() => openRecord(row.id))}>
              <Building2 className="text-ink-muted" />
              <span className="truncate">{row.customerName}</span>
              <span className="truncate text-xs text-ink-muted">{row.opportunityNumber ?? ""}</span>
              <CommandShortcut className="tracking-normal">{STAGE_LABELS[row.stage]}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          {NAV_GROUPS.flatMap(group => group.items).map(item => (
            <CommandItem key={item.href} value={`Go to ${item.label}`} onSelect={() => run(() => navigate(item.href))}>
              <item.icon className="text-ink-muted" /> {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="New engagement" onSelect={() => run(newEngagement)}><Plus className="text-ink-muted" /> New engagement</CommandItem>
          <CommandItem value="Toggle dark mode theme" onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
            {resolvedTheme === "dark" ? <Sun className="text-ink-muted" /> : <Moon className="text-ink-muted" />} Switch to {resolvedTheme === "dark" ? "light" : "dark"} mode
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
