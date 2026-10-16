import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { RecordDrawer, type DrawerTab } from "./RecordDrawer";

type Shell = {
  /** Opens the record drawer on any screen. */
  openRecord: (id: number, tab?: DrawerTab) => void;
  /** Opens the New engagement dialog; the new record opens on its Details tab. */
  newEngagement: () => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
};

const ShellContext = createContext<Shell | null>(null);

export function useShell() {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell must be used inside AppShell");
  return shell;
}

/** One record drawer and one New engagement dialog for the whole app, so every screen opens records the same way. */
export function ShellProvider({ children }: { children: ReactNode }) {
  const [record, setRecord] = useState<{ id: number; tab: DrawerTab } | null>(null);
  const [creating, setCreating] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const openRecord = useCallback((id: number, tab: DrawerTab = "overview") => setRecord({ id, tab }), []);
  const newEngagement = useCallback(() => setCreating(true), []);
  const value = useMemo(() => ({ openRecord, newEngagement, commandOpen, setCommandOpen }), [openRecord, newEngagement, commandOpen]);
  return (
    <ShellContext.Provider value={value}>
      {children}
      <RecordDrawer id={record?.id ?? null} initialTab={record?.tab} onClose={() => setRecord(null)} />
      <NewEngagementDialog open={creating} onClose={() => setCreating(false)} onCreated={id => openRecord(id, "details")} />
    </ShellContext.Provider>
  );
}

function NewEngagementDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const [customer, setCustomer] = useState("");
  const utils = trpc.useUtils();
  const create = trpc.tracker.create.useMutation({
    onSuccess: async (created, input) => {
      onClose();
      setCustomer("");
      toast.success(`${input.customerName} created in Intake`);
      await utils.tracker.list.invalidate();
      onCreated(created.id);
    },
    onError: error => toast.error(error.message),
  });
  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (customer.trim()) create.mutate({ customerName: customer.trim() }); }}>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">New engagement</DialogTitle>
            <DialogDescription>It starts in Intake. Fill in the rest on the Details tab.</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1.5">
            <span className="field-label">Customer name</span>
            <Input autoFocus value={customer} onChange={event => setCustomer(event.target.value)} maxLength={240} className="h-9" />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!customer.trim() || create.isPending}>Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
