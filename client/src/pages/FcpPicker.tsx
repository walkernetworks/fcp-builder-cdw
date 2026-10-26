import { NoSelection } from "@/components/fcp/workspaceParts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Redirect, useLocation } from "wouter";
import { toast } from "sonner";
import { workspaceUrlFor } from "@/lib/fcpWorkspaceRoutes";

const DEFAULT_ENGAGEMENT_TITLE = "New FCP Engagement";

/** `/fcp`: choose an engagement or start a new FCP. Old links (`/fcp?engagement=<id>&stage=<step>`) go to that engagement's workspace. */
export default function FcpPicker() {
  const target = workspaceUrlFor(window.location.search);
  if (target) return <Redirect to={target} replace />;
  return <Picker />;
}

function Picker() {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newEngagementTitle, setNewEngagementTitle] = useState(DEFAULT_ENGAGEMENT_TITLE);
  const list = trpc.engagement.list.useQuery();
  const create = trpc.engagement.create.useMutation({
    onSuccess: async row => {
      await utils.engagement.list.invalidate();
      setIsCreateDialogOpen(false);
      toast.success(`Created ${row.title}`);
      navigate(`/engagements/${row.id}/fcp`);
    },
    onError: error => toast.error(error.message),
  });
  const openCreateDialog = () => {
    if (create.isPending) return;
    setNewEngagementTitle(DEFAULT_ENGAGEMENT_TITLE);
    setIsCreateDialogOpen(true);
  };
  const submitNewEngagement = () => {
    const requestedTitle = newEngagementTitle.trim();
    if (!requestedTitle) {
      toast.error("Enter an engagement name to continue.");
      return;
    }
    create.mutate({ title: requestedTitle });
  };
  const canCreateEngagement = newEngagementTitle.trim().length > 0 && newEngagementTitle.trim().length <= 240;

  if (list.isLoading) return <div className="grid min-h-[70vh] place-items-center"><Loader2 className="size-6 animate-spin text-cdw-red" /></div>;

  return (
    <div className="workspace-shell bg-s50 px-4 md:px-6">
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={open => {
          if (create.isPending) return;
          setIsCreateDialogOpen(open);
          if (!open) setNewEngagementTitle(DEFAULT_ENGAGEMENT_TITLE);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={event => { event.preventDefault(); submitNewEngagement(); }}>
            <DialogHeader>
              <DialogTitle>Name the engagement</DialogTitle>
              <DialogDescription>Give this functional consumption plan a clear customer or project name. You can edit it later from the workspace header.</DialogDescription>
            </DialogHeader>
            <div className="py-5">
              <label htmlFor="new-engagement-title" className="text-sm font-medium text-ink">Engagement name</label>
              <Input
                id="new-engagement-title"
                className="mt-2"
                value={newEngagementTitle}
                onChange={event => setNewEngagementTitle(event.target.value)}
                placeholder="For example, Meridian Health VCF Adoption"
                maxLength={240}
                autoFocus
                aria-describedby="new-engagement-title-help"
              />
              <p id="new-engagement-title-help" className="mt-2 text-xs text-s400">Use a recognizable customer, account, or project name.</p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={create.isPending}>Cancel</Button>
              <Button type="submit" disabled={!canCreateEngagement || create.isPending}>
                {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create engagement
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <NoSelection engagements={list.data ?? []} onSelect={id => navigate(`/engagements/${id}/fcp`)} onCreate={openCreateDialog} />
    </div>
  );
}
