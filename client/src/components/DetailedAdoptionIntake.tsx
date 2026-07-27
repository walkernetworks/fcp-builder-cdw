import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { appendIndustryDiscoveryPrompts, getIndustryDiscoveryReviewContent, industryDiscoveryPromptBlock, industryDiscoveryTemplates, removeIndustryDiscoveryPrompts } from "@shared/industryDiscovery";
import type { AdoptionDetails, Capability, IndustryTemplateId, MinimalFields, UpgradePath } from "@shared/fcp";

type DetailKey = "operations" | "automation" | "security" | "resilience" | "kubernetes" | "privateAi";

type DiscoveryGroup = {
  capability: Capability;
  key: DetailKey;
  title: string;
  prompt: string;
  options: Array<{ value: string; label: string; description: string }>;
};

const discoveryGroups: DiscoveryGroup[] = [
  {
    capability: "operations",
    key: "operations",
    title: "Operations outcomes",
    prompt: "Which operating-model capabilities should be designed first?",
    options: [
      { value: "lifecycle", label: "Lifecycle and certificates", description: "Lifecycle ownership, certificate, and password operations." },
      { value: "observability", label: "Health, logs, and diagnostics", description: "Operational health views and investigation workflows." },
      { value: "capacity-cost", label: "Capacity and cost", description: "Capacity, utilization, and cost visibility." },
      { value: "custom-dashboards", label: "Custom dashboards", description: "Role-specific dashboards, alerts, metrics, or management packs." },
      { value: "identity-certificates", label: "Identity operations", description: "Identity, certificate, and privileged access runbooks." },
      { value: "event-integration", label: "Event integration", description: "Incident, notification, or external event-management integration." },
    ],
  },
  {
    capability: "automation",
    key: "automation",
    title: "Automation outcomes",
    prompt: "What automation outcomes are meaningful for this customer?",
    options: [
      { value: "vm-self-service", label: "VM self-service", description: "Catalog patterns and governed VM consumption." },
      { value: "infrastructure-as-code", label: "Infrastructure as code", description: "Source-controlled infrastructure and reusable patterns." },
      { value: "day-2-automation", label: "Day-2 automation", description: "Lifecycle, configuration, and remediation automation." },
      { value: "governance", label: "Organization governance", description: "Projects, organizations, quotas, and policy guardrails." },
      { value: "application-provisioning", label: "Application provisioning", description: "Application-platform or service provisioning workflows." },
    ],
  },
  {
    capability: "security",
    key: "security",
    title: "Security outcomes",
    prompt: "Which security design outcomes should guide the plan?",
    options: [
      { value: "segmentation", label: "Segmentation", description: "Network segmentation and security policy design." },
      { value: "identity-rbac", label: "Identity and RBAC", description: "Access model, roles, and identity integration." },
      { value: "hardening-compliance", label: "Hardening and compliance", description: "Control objectives, hardening, and evidence design." },
    ],
  },
  {
    capability: "resilience",
    key: "resilience",
    title: "Resilience outcomes",
    prompt: "Which recovery outcomes should be planned?",
    options: [
      { value: "recovery-architecture", label: "Recovery architecture", description: "Recovery topology, priorities, and dependency design." },
      { value: "recovery-exercises", label: "Recovery exercises", description: "Runbooks, exercises, and measurable recovery objectives." },
      { value: "cyber-recovery", label: "Cyber recovery", description: "Isolated recovery, cyber recovery, and response objectives." },
    ],
  },
  {
    capability: "kubernetes",
    key: "kubernetes",
    title: "Kubernetes outcomes",
    prompt: "How should the application platform evolve after the core foundation?",
    options: [
      { value: "workload-domains", label: "Workload domains", description: "Workload-domain and Supervisor planning." },
      { value: "platform-operations", label: "Platform operations", description: "Cluster lifecycle and platform operating model." },
      { value: "developer-experience", label: "Developer experience", description: "Developer guardrails, access, and consumption patterns." },
    ],
  },
  {
    capability: "private-ai",
    key: "privateAi",
    title: "Private AI outcomes",
    prompt: "Which AI-platform discovery outcomes are in scope?",
    options: [
      { value: "gpu-capacity", label: "Capacity and GPU planning", description: "Capacity, GPU, and foundational platform planning." },
      { value: "ai-guardrails", label: "AI guardrails", description: "Access, data, and operational guardrail design." },
      { value: "pilot-onboarding", label: "Pilot onboarding", description: "A bounded private-AI pilot onboarding path." },
    ],
  },
];

const upgradeOptions: Array<{ value: UpgradePath; label: string; description: string }> = [
  { value: "undecided", label: "Undecided — scope and runbook first", description: "Keep Upgrade Services focused on confirmed scope, dependencies, and a runbook." },
  { value: "in-place", label: "In-place upgrade", description: "Plan a version upgrade of the current platform." },
  { value: "new-build", label: "New build / converge", description: "Plan a new foundation and controlled convergence path." },
  { value: "migration-waves", label: "Migration waves", description: "Plan dependencies, migration waves, and execution controls." },
  { value: "design-only", label: "Architecture and runbook only", description: "Create the target architecture and a future execution plan without committing delivery waves." },
];

type Props = {
  fields: MinimalFields;
  onPatch: (patch: Partial<MinimalFields>) => void;
};

export function DetailedAdoptionIntake({ fields, onPatch }: Props) {
  const details = fields.adoptionDetails;
  const { template, promptItems } = getIndustryDiscoveryReviewContent(details.industryTemplate);
  const templatePromptBlock = industryDiscoveryPromptBlock(details.industryTemplate);
  const hasTemplatePrompts = details.notes.includes(templatePromptBlock);

  const updateDetails = (patch: Partial<AdoptionDetails>) => onPatch({ adoptionDetails: { ...details, ...patch } });

  const setIndustryTemplate = (industryTemplate: IndustryTemplateId) => updateDetails({ industryTemplate });

  const addTemplatePromptsToNotes = () => updateDetails({ notes: appendIndustryDiscoveryPrompts(details.notes, details.industryTemplate) });
  const clearTemplatePromptsFromNotes = () => updateDetails({ notes: removeIndustryDiscoveryPrompts(details.notes, details.industryTemplate) });

  const toggleFocus = (group: DiscoveryGroup, value: string, checked: boolean) => {
    const selected = details[group.key] as string[];
    const nextDetails = { ...details, [group.key]: checked ? [...selected, value] : selected.filter(item => item !== value) } as AdoptionDetails;
    const priorities = fields.priorities.includes(group.capability) || !checked ? fields.priorities : [...fields.priorities, group.capability];
    onPatch({ priorities, adoptionDetails: nextDetails });
  };

  return (
    <section className="mt-7 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 md:p-5">
      <div className="max-w-3xl"><p className="text-xs font-black uppercase tracking-[.16em] text-[#c8102e]">Detailed discovery</p><h3 className="mt-1 text-lg font-semibold text-slate-950">Confirm the outcomes that should shape the plan</h3><p className="mt-2 text-sm leading-6 text-slate-600">These answers create more specific planning activities. Select only outcomes the customer has confirmed; unselected items are not assumed to be in scope.</p></div>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><Label className="text-sm font-semibold">Start from an industry discovery lens</Label><p className="mt-1 text-xs leading-5 text-slate-500">Templates guide the conversation only. They never select scope, priorities, or activities for the customer.</p></div><span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Reusable prompts</span></div>
        <Select value={details.industryTemplate} onValueChange={value => setIndustryTemplate(value as IndustryTemplateId)}>
          <SelectTrigger className="mt-3 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>{industryDiscoveryTemplates.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
        <p className="mt-2 text-xs leading-5 text-slate-500">{template.description}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{promptItems.map(item => <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-black uppercase tracking-[.14em] text-[#c8102e]">{item.ordinal} · {item.theme}</div><p className="mt-1 text-xs leading-5 text-slate-700">{item.question}</p></article>)}</div>
        <div className="mt-4 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={addTemplatePromptsToNotes} disabled={hasTemplatePrompts}>Add prompts to notes</Button>{hasTemplatePrompts ? <Button type="button" size="sm" variant="ghost" onClick={clearTemplatePromptsFromNotes}>Clear selected prompts</Button> : null}{details.industryTemplate !== "general-enterprise" ? <Button type="button" size="sm" variant="ghost" onClick={() => setIndustryTemplate("general-enterprise")}>Use general template</Button> : null}</div>
      </section>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <Label className="text-sm font-semibold">What is the intended upgrade path?</Label>
        <Select value={details.upgradePath} onValueChange={value => updateDetails({ upgradePath: value as UpgradePath })}>
          <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
          <SelectContent>{upgradeOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        <p className="mt-2 text-xs leading-5 text-slate-500">{upgradeOptions.find(option => option.value === details.upgradePath)?.description}</p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {discoveryGroups.map(group => <section key={group.key} className="rounded-xl border border-slate-200 bg-white p-4"><h4 className="text-sm font-semibold text-slate-950">{group.title}</h4><p className="mt-1 text-xs leading-5 text-slate-500">{group.prompt}</p><div className="mt-3 space-y-2.5">{group.options.map(option => { const checked = (details[group.key] as string[]).includes(option.value); return <label key={option.value} className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${checked ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 hover:bg-slate-50"}`}><Checkbox checked={checked} className="mt-0.5" onCheckedChange={next => toggleFocus(group, option.value, next === true)} /><span><span className="block text-xs font-semibold">{option.label}</span><span className={`mt-0.5 block text-xs leading-5 ${checked ? "text-slate-300" : "text-slate-500"}`}>{option.description}</span></span></label>; })}</div></section>)}
      </div>

      <div className="mt-5"><Label className="text-sm font-semibold">Customer-specific objectives or constraints</Label><Textarea className="mt-2 min-h-24 bg-white" value={details.notes} onChange={event => updateDetails({ notes: event.target.value })} placeholder="Capture confirmed desired outcomes, integration constraints, pilot scope, or decision owners. This is planning context, not an assumed commitment." /></div>
    </section>
  );
}
