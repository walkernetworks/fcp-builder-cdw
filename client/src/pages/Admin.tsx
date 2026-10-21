import { useAuth } from "@/_core/hooks/useAuth";
import { AdminSettings } from "@/components/vsa/AdminSettings";
import { AdminStatus } from "@/components/vsa/AdminStatus";
import { AdminUsers } from "@/components/vsa/AdminUsers";
import { EmptyState, PageHeader } from "@/components/vsa/elements";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck } from "lucide-react";
import type { ComponentType } from "react";
import { useLocation, useSearch } from "wouter";

/**
 * The admin area's sections. A later section (for example capabilities) is one more entry. Every procedure behind
 * them is an adminProcedure, so the server refuses non-admins whatever this screen shows.
 */
const SECTIONS: { id: string; label: string; sub: string; component: ComponentType }[] = [
  { id: "users", label: "Users", sub: "Who can sign in, their role, role view, and workspace.", component: AdminUsers },
  { id: "settings", label: "Settings", sub: "Operational thresholds every screen uses.", component: AdminSettings },
  { id: "status", label: "System status", sub: "Integration seams and feature flags, read-only.", component: AdminStatus },
];

export default function Admin() {
  const { user, loading } = useAuth();
  const search = useSearch();
  const [, navigate] = useLocation();
  const requested = new URLSearchParams(search).get("tab");
  const tab = SECTIONS.some(section => section.id === requested) ? requested! : SECTIONS[0].id;

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
      <PageHeader title="Admin" sub="Users, operational settings, and system status. Every change is recorded against your name." />
      <Tabs value={tab} onValueChange={value => navigate(`/admin?tab=${value}`, { replace: true })} className="gap-4">
        <TabsList className="h-10 w-full justify-start gap-0 overflow-x-auto rounded-none border-b border-s100 bg-transparent p-0">
          {SECTIONS.map(section => (
            <TabsTrigger key={section.id} value={section.id} className="h-10 flex-none rounded-none border-0 border-b-2 border-transparent px-3 text-[13px] font-medium text-ink-muted shadow-none data-[state=active]:border-cdw-red data-[state=active]:bg-transparent data-[state=active]:text-ink data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent">
              {section.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SECTIONS.map(section => (
          <TabsContent key={section.id} value={section.id} className="mt-0 space-y-3">
            <p className="page-sub">{section.sub}</p>
            <section.component />
          </TabsContent>
        ))}
      </Tabs>
    </main>
  );
}
