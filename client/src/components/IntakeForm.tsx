import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { completionPercent, type EngagementFields } from "@shared/fcp";
import { Check, Circle, ClipboardPaste, Flag } from "lucide-react";

const sections: Array<{
  id: string;
  title: string;
  track: string;
  description: string;
  fields: Array<{ key: keyof EngagementFields; label: string; type?: string; placeholder?: string }>;
}> = [
  {
    id: "track-a",
    track: "Track A",
    title: "Commercial & Entitlement",
    description: "Establish the clocks, funding, and subscription boundary that govern consumption.",
    fields: [
      { key: "customerName", label: "Customer name", placeholder: "Meridian Health" },
      { key: "cust", label: "Customer abbreviation", placeholder: "MH" },
      { key: "cityState", label: "City / state", placeholder: "Nashville, TN" },
      { key: "entitlement", label: "Entitlement", placeholder: "$0" },
      { key: "broadcomTokens", label: "Broadcom tokens", placeholder: "$0" },
      { key: "laborPool", label: "Labor pool", placeholder: "$0" },
      { key: "totalProgram", label: "Total program", placeholder: "$0" },
      { key: "termStart", label: "Term start", type: "date" },
      { key: "termEnd", label: "Term end", type: "date" },
      { key: "clockStart", label: "Commercial clock start", type: "date" },
      { key: "entitlementEndDate", label: "Entitlement end", type: "date" },
    ],
  },
  {
    id: "track-b",
    track: "Track B",
    title: "Platform & Infrastructure",
    description: "Capture the current estate, destination, hardware dependency, storage, and network services.",
    fields: [
      { key: "vmCount", label: "VM count", placeholder: "1200" },
      { key: "hostCount", label: "Host count", placeholder: "48" },
      { key: "clusterCount", label: "Cluster count", placeholder: "6" },
      { key: "siteCount", label: "Site count", placeholder: "3" },
      { key: "newDC", label: "Destination data center", placeholder: "Primary DC" },
      { key: "hardwareVendor", label: "Hardware vendor", placeholder: "Dell" },
      { key: "hardwareTLA", label: "Hardware TLA / quote", placeholder: "Quote or TLA reference" },
      { key: "tlaDate", label: "Hardware decision date", type: "date" },
      { key: "hardwareLeadMonths", label: "Hardware lead (months)", type: "number" },
      { key: "existingStorage", label: "Existing storage", placeholder: "PowerMax / Pure / vSAN" },
      { key: "loadBalancer", label: "Load balancer", placeholder: "F5 / Avi" },
      { key: "buildApproach", label: "Build approach", placeholder: "Parallel build / migration" },
    ],
  },
  {
    id: "track-c",
    track: "Track C",
    title: "Migration & Operations",
    description: "Sequence HCX mobility groups and front-load the operating model and automation.",
    fields: [
      { key: "kickoffDate", label: "Kickoff date", type: "date" },
      { key: "kickoffTime", label: "Kickoff time", type: "time" },
      { key: "source", label: "Discovery source", placeholder: "VSA workshop / customer notes" },
      { key: "laborPoolEnd", label: "Labor pool end", type: "date" },
      { key: "y1", label: "Year 1" },
      { key: "y2", label: "Year 2" },
      { key: "y3", label: "Year 3" },
      { key: "y4", label: "Year 4" },
    ],
  },
  {
    id: "track-d",
    track: "Track D",
    title: "Security & Resilience",
    description: "Define VDefend, DR, RPO/RTO, and compliance outcomes before migration execution.",
    fields: [
      { key: "drApproach", label: "DR approach", placeholder: "SRM / VLR / existing orchestration" },
      { key: "drVmCount", label: "DR VM count", placeholder: "600" },
      { key: "rpoTarget", label: "RPO target", placeholder: "4 hours" },
      { key: "rtoTarget", label: "RTO target", placeholder: "8 hours" },
    ],
  },
  {
    id: "track-e",
    track: "Track E",
    title: "Application Platform & Future State",
    description: "Only include Kubernetes, DSM, and app-platform work when scope and ownership are confirmed.",
    fields: [
      { key: "k8sSME", label: "Kubernetes SME / owner", placeholder: "Name or team" },
    ],
  },
];

function isComplete(value: unknown) {
  return typeof value === "boolean" ? value : Array.isArray(value) ? value.length > 0 : String(value ?? "").trim().length > 0;
}

export function IntakeForm({ fields, onChange }: { fields: EngagementFields; onChange: (fields: EngagementFields) => void }) {
  const set = <K extends keyof EngagementFields>(key: K, value: EngagementFields[K]) => onChange({ ...fields, [key]: value });
  const progress = completionPercent(fields);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#c8102e]">Guided discovery</p><h2 className="mt-1 text-xl font-semibold text-slate-950">VSA / VCF Tracks A–E</h2><p className="mt-1 text-sm text-slate-500">Complete what is known. Unconfirmed values remain explicit rather than being fabricated.</p></div>
          <div className="text-right"><strong className="text-2xl text-slate-950">{progress}%</strong><p className="text-xs text-slate-500">core fields</p></div>
        </div>
        <Progress className="mt-4 h-2" value={progress} />
      </div>

      <Accordion type="multiple" defaultValue={["notes", "track-a"]} className="space-y-3">
        <AccordionItem value="notes" className="rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
          <AccordionTrigger className="hover:no-underline"><div className="flex items-center gap-3 text-left"><div className="grid size-9 place-items-center rounded-xl bg-red-50 text-[#c8102e]"><ClipboardPaste className="size-4" /></div><div><div className="font-semibold">Paste discovery notes</div><div className="text-xs font-normal text-slate-500">Meeting notes, email excerpts, or a workshop recap</div></div></div></AccordionTrigger>
          <AccordionContent><Textarea value={fields.notes} onChange={event => set("notes", event.target.value)} className="min-h-44 resize-y bg-slate-50" placeholder="Paste raw discovery notes here. Draft Timeline will use these notes together with the structured fields below." /></AccordionContent>
        </AccordionItem>
        {sections.map(section => {
          const complete = section.fields.filter(field => isComplete(fields[field.key])).length;
          return (
            <AccordionItem key={section.id} value={section.id} className="rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
              <AccordionTrigger className="hover:no-underline"><div className="flex min-w-0 flex-1 items-center justify-between gap-4 pr-3 text-left"><div><div className="flex items-center gap-2"><Badge variant="outline" className="border-red-200 bg-red-50 text-[#a80d27]">{section.track}</Badge><span className="font-semibold">{section.title}</span></div><div className="mt-1 text-xs font-normal text-slate-500">{section.description}</div></div><div className="shrink-0 text-xs font-semibold text-slate-500">{complete}/{section.fields.length}</div></div></AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-4 pb-2 md:grid-cols-2 xl:grid-cols-3">
                  {section.fields.map(field => {
                    const raw = fields[field.key];
                    return <label key={String(field.key)} className="space-y-1.5 text-xs font-semibold text-slate-600"><span className="flex items-center gap-1.5">{isComplete(raw) ? <Check className="size-3.5 text-green-600" /> : <Circle className="size-3.5 text-slate-300" />}{field.label}</span><Input type={field.type || "text"} value={typeof raw === "number" || typeof raw === "string" ? raw : ""} placeholder={field.placeholder} onChange={event => set(field.key, (field.type === "number" ? Number(event.target.value) : event.target.value) as never)} /></label>;
                  })}
                </div>
                {section.id === "track-b" && <div className="mt-4 flex flex-wrap gap-5 rounded-xl bg-slate-50 p-4"><Toggle label="Net-new hardware" checked={fields.hardwareIsNetNew} onChange={value => set("hardwareIsNetNew", value)} /><label className="min-w-44 space-y-1 text-xs font-semibold text-slate-600">Storage decision<Select value={fields.storageDecision} onValueChange={value => set("storageDecision", value as EngagementFields["storageDecision"])}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="vSAN-ESA">vSAN ESA</SelectItem><SelectItem value="vSAN">vSAN</SelectItem><SelectItem value="external">External storage</SelectItem></SelectContent></Select></label></div>}
                {section.id === "track-c" && <div className="mt-4 flex flex-wrap gap-5 rounded-xl bg-slate-50 p-4"><Toggle label="VCF Operations" checked={fields.ariaOperationsInScope} onChange={value => set("ariaOperationsInScope", value)} /><Toggle label="VCF Automation" checked={fields.ariaAutomationInScope} onChange={value => set("ariaAutomationInScope", value)} /><Toggle label="Lifecycle management" checked={fields.lcmInScope} onChange={value => set("lcmInScope", value)} /></div>}
                {section.id === "track-d" && <div className="mt-4 flex flex-wrap gap-5 rounded-xl bg-slate-50 p-4"><Toggle label="DR in scope" checked={fields.drInScope} onChange={value => set("drInScope", value)} /><Toggle label="VDefend in scope" checked={fields.vdefendInScope} onChange={value => set("vdefendInScope", value)} /></div>}
                {section.id === "track-e" && <div className="mt-4 flex flex-wrap gap-5 rounded-xl bg-slate-50 p-4"><Toggle label="Kubernetes / VKS" checked={fields.k8sInScope} onChange={value => set("k8sInScope", value)} /><Toggle label="DSM" checked={fields.dsmInScope} onChange={value => set("dsmInScope", value)} /></div>}
              </AccordionContent>
            </AccordionItem>
          );
        })}
        <AccordionItem value="milestones" className="rounded-2xl border border-slate-200 bg-white px-4 shadow-sm">
          <AccordionTrigger className="hover:no-underline"><div className="flex items-center gap-3 text-left"><div className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-600"><Flag className="size-4" /></div><div><div className="font-semibold">Commercial milestones</div><div className="text-xs font-normal text-slate-500">Mark whether each checkpoint occurred and capture its date</div></div></div></AccordionTrigger>
          <AccordionContent><div className="space-y-2">{fields.milestones.map(milestone => <div key={milestone.id} className="grid items-center gap-3 rounded-xl bg-slate-50 p-3 md:grid-cols-[auto_1fr_180px]"><Checkbox checked={milestone.occurred} onCheckedChange={occurred => set("milestones", fields.milestones.map(item => item.id === milestone.id ? { ...item, occurred: Boolean(occurred) } : item))} /><span className="text-sm font-medium text-slate-700">{milestone.label}</span><Input type="date" value={milestone.date} onChange={event => set("milestones", fields.milestones.map(item => item.id === milestone.id ? { ...item, date: event.target.value } : item))} /></div>)}</div></AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Switch checked={checked} onCheckedChange={onChange} />{label}</label>;
}
