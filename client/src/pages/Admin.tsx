import { useAuth } from "@/_core/hooks/useAuth";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AdminStatus } from "@/components/vsa/AdminStatus";
import { AdminUsers, useUsersSummary } from "@/components/vsa/AdminUsers";
import { AdminWorkflow } from "@/components/vsa/AdminWorkflow";
import { Chip, EmptyState, PageHeader } from "@/components/vsa/elements";
import { BellRing, KeyRound, PlugZap, ShieldCheck, SlidersHorizontal, Users, type LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import { useLocation, useSearch } from "wouter";

/**
 * The admin area: one collapsible section per concern. A later section is one more entry here. Every procedure behind
 * them is an adminProcedure, so the server refuses non-admins whatever this screen shows.
 */
type Section = { id: string; title: string; description: string; icon: LucideIcon; component: ComponentType; summary?: () => string | null; phase?: string };

const SECTIONS: Section[] = [
  { id: "users", title: "Users", description: "Who has signed in, and their role, role view, and workspace. Open a user to change their access.", icon: Users, component: AdminUsers, summary: useUsersSummary },
  { id: "workflow", title: "Workflow parameters", description: "Stale-stage thresholds, the work plan warning, expiry bands, and gate labels.", icon: SlidersHorizontal, component: AdminWorkflow },
  { id: "status", title: "System status", description: "Integration sources and feature flags, read-only.", icon: PlugZap, component: AdminStatus },
  { id: "capabilities", title: "Capabilities", description: "Capability roles alongside admin, such as data steward and IT approver.", icon: KeyRound, component: CapabilitiesPlaceholder, phase: "Phase 3" },
  { id: "notifications", title: "Notification rules", description: "Rules and templates for reminders and emails.", icon: BellRing, component: NotificationsPlaceholder, phase: "Phase 4" },
];

export default function Admin() {
  const { user, loading } = useAuth();
  const search = useSearch();
  const [, navigate] = useLocation();
  const requested = new URLSearchParams(search).get("section");
  const open = requested ? requested.split(",").filter(id => SECTIONS.some(section => section.id === id)) : ["users"];

  if (loading) return null;
  if (user?.role !== "admin") {
    return (
      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <EmptyState icon={ShieldCheck} title="Admins only" sub="Admin is open to users whose role is admin. Ask an admin if you need access." />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] space-y-5 px-6 py-6">
      <PageHeader title="Admin" sub="Users, workflow parameters, and system status. Every change is recorded against your name." />
      <Accordion type="multiple" value={open} onValueChange={value => navigate(`/admin?section=${value.join(",")}`, { replace: true })} className="space-y-3">
        {SECTIONS.map(section => <AdminSection key={section.id} section={section} />)}
      </Accordion>
    </main>
  );
}

function AdminSection({ section }: { section: Section }) {
  const summary = section.summary?.() ?? null;
  return (
    <AccordionItem value={section.id} className="panel border-b last:border-b">
      <AccordionTrigger className="items-center gap-3 px-4 py-3.5 hover:no-underline [&>svg]:translate-y-0">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-sunken text-ink-muted"><section.icon className="size-4" aria-hidden /></span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-ink">{section.title}</span>
            <span className="panel-sub block font-normal">{section.description}</span>
          </span>
        </span>
        {section.phase ? <Chip>{section.phase} · not built</Chip> : summary && <span className="shrink-0 text-xs font-normal text-ink-muted">{summary}</span>}
      </AccordionTrigger>
      <AccordionContent className="border-t border-s100 p-4">
        <section.component />
      </AccordionContent>
    </AccordionItem>
  );
}

function CapabilitiesPlaceholder() {
  return (
    <EmptyState
      icon={KeyRound}
      title="Capabilities arrive in Phase 3"
      sub="Capability roles such as data steward, automation admin, and IT approver will be granted here. Until then, role (user or admin) is the only permission."
    />
  );
}

function NotificationsPlaceholder() {
  return (
    <EmptyState
      icon={BellRing}
      title="Notification rules arrive in Phase 4"
      sub="Reminder rules and email templates come with the automation engine, in draft mode first. The app sends nothing today."
    />
  );
}
