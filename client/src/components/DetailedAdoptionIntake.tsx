import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { appendIndustryDiscoveryPrompts, getIndustryDiscoveryReviewContent, industryDiscoveryPromptBlock, industryDiscoveryTemplates, removeIndustryDiscoveryPrompts } from "@shared/industryDiscovery";
import { effectivePlatformEdition, FIXED_GANTT_CATEGORIES, getVcfComponentDesignOwnership, getVcfPlaybookPlan, getVcfPlaybookWorkPackageOwnership, isPlanOutcomeAvailable, planOutcomeLabel, playbookPlanForFields, resolvePlanOutcomes, VVF_DELIVERY_PATHS, type AdoptionDepth, type AdoptionDetails, type Capability, type DomainTopology, type IndustryTemplateId, type MinimalFields, type PrincipalStorage, type UpgradePath } from "@shared/fcp";

type DetailKey = "operations" | "automation" | "networking" | "security" | "resilience" | "kubernetes" | "privateAi";

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
      { value: "data-services", label: "Data Services Manager", description: "Self-service PostgreSQL, MySQL, and SQL Server databases. Data Services add-on." },
    ],
  },
  {
    capability: "networking",
    key: "networking",
    title: "Networking and load-balancing outcomes",
    prompt: "Which networking, NSX, and load-balancing outcomes should be planned independently from security services?",
    options: [
      { value: "physical-fabric", label: "Physical fabric, VLANs, and MTU", description: "Transport VLANs, MTU, routing handoffs, and physical-fabric dependencies." },
      { value: "edge-cluster-routing", label: "NSX Edge Cluster and routing", description: "Edge node placement, north-south routing, and external connectivity." },
      { value: "overlay-transport", label: "NSX overlay transport", description: "Transport zones, host connectivity, and overlay network rollout." },
      { value: "vpc", label: "VCF VPCs and transit gateway", description: "Self-service VPC networking. Needs the overlay and an Edge cluster (or the VCF 9.1 distributed transit gateway)." },
      { value: "load-balancing", label: "Avi Load Balancer", description: "L4–L7 load balancing and VKS ingress. Avi add-on for VCF and VVF." },
      { value: "network-operations", label: "Networking and NSX operating model", description: "Network ownership, lifecycle, troubleshooting, and service handover." },
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
      { value: "ids-ips", label: "Distributed IDS/IPS", description: "East-west threat detection and prevention. vDefend ATP add-on." },
      { value: "malware-prevention", label: "Malware prevention and sandboxing", description: "File analysis on protected hosts. Needs the Security Services Platform." },
      { value: "identity-firewall", label: "Identity-aware firewall", description: "User- and group-based rules from Active Directory." },
      { value: "security-intelligence", label: "Security Intelligence", description: "Traffic visualization and policy recommendations. Needs the Security Services Platform." },
      { value: "waf", label: "Web application firewall", description: "Layer-7 WAF for published applications. Needs Avi Load Balancer." },
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
      { value: "cyber-recovery", label: "On-premises cyber recovery", description: "Isolated clean-room recovery on vSAN ESA. Advanced Cyber Compliance add-on." },
      { value: "cloud-cyber-recovery", label: "Cloud cyber recovery", description: "Isolated recovery environment in the cloud with VMware Live Recovery. Subscription add-on." },
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
  { value: "undecided", label: "Pathway decision required", description: "Generate the requirements and decision register first; do not imply implementation until the pathway is approved." },
  { value: "in-place", label: "In-place upgrade", description: "Upgrade supported existing vSphere in place, validate each wave, and bring the accepted platform under VCF management." },
  { value: "converge", label: "Converge existing vCenter", description: "Convert a healthy existing vCenter and cluster into the VCF management domain." },
  { value: "import-workload-domain", label: "Import as workload domain", description: "Import a complete existing vCenter and all of its clusters into an established VCF instance." },
  { value: "greenfield", label: "Greenfield with staging hardware", description: "Build a new VCF foundation on separately funded hardware, then migrate workloads in controlled waves." },
  { value: "hybrid", label: "Hybrid / multiple pathways", description: "Assign the correct pathway to each estate cohort and coordinate them through one decision register and execution plan." },
  { value: "design-only", label: "Architecture and implementation-ready design", description: "Deliver the complete requirements, decisions, logical/physical design, runbook, and acceptance package without execution." },
];

const topologyOptions: Array<{ value: DomainTopology; label: string }> = [
  { value: "undecided", label: "Topology decision required" },
  { value: "standard", label: "Standard — separate management and workload domains" },
  { value: "consolidated", label: "Consolidated — management and workloads share the management domain" },
];

const storageOptions: Array<{ value: PrincipalStorage; label: string }> = [
  { value: "undecided", label: "Storage decision required" },
  { value: "vsan", label: "vSAN" },
  { value: "nfs-v3", label: "NFS v3" },
  { value: "vmfs-fc", label: "VMFS on Fibre Channel" },
  { value: "other-existing", label: "Other existing storage — validate workflow" },
];

const depthOptions: Array<{ value: AdoptionDepth; label: string; description: string }> = [
  { value: "not-selected", label: "Not selected", description: "No delivery depth is committed." },
  { value: "tier-1", label: "Tier 1 · Deployed", description: "Installed and functional with baseline configuration." },
  { value: "tier-2", label: "Tier 2 · Operationalized", description: "Used by the platform team with customer-specific workflows and controls." },
  { value: "tier-3", label: "Tier 3 · Business consumption", description: "Changes how infrastructure is consumed and requires durable product or policy ownership." },
];

const componentDesignTitles: Record<Capability, string> = {
  operations: "VCF Operations Design",
  automation: "Automation and Self-Service Design",
  networking: "NSX Networking Design",
  security: "vDefend Security Design",
  resilience: "Recovery and Resilience Design",
  kubernetes: "VKS Platform Design",
  "private-ai": "Private AI Design",
};

const softPrerequisiteOptions = [
  { value: "dns-ntp", label: "DNS, NTP, and core services", description: "Validate required shared services before platform build." },
  { value: "ip-pools", label: "Management and workload IP pools", description: "Reserve and validate addressing independently of hardware delivery." },
  { value: "tor-switch-design", label: "ToR switch design and ports", description: "Finalize physical-fabric port design and readiness in parallel with provisioning." },
] as const;

type Props = {
  fields: MinimalFields;
  onPatch: (patch: Partial<MinimalFields>) => void;
};

export function DetailedAdoptionIntake({ fields, onPatch }: Props) {
  const details = fields.adoptionDetails;
  const edition = effectivePlatformEdition(fields);
  const playbookPlan = playbookPlanForFields(fields);
  const resolved = resolvePlanOutcomes(fields);
  const requiredByFor = (key: string) => resolved.outcomes.find(outcome => outcome.key === key)?.requiredBy ?? [];
  const pathwayOptions = edition === "vvf"
    ? upgradeOptions.filter(option => VVF_DELIVERY_PATHS.includes(option.value as (typeof VVF_DELIVERY_PATHS)[number])).map(option => ({ ...option, label: getVcfPlaybookPlan(option.value, "vvf").label, description: getVcfPlaybookPlan(option.value, "vvf").description }))
    : upgradeOptions;
  const { template, promptItems } = getIndustryDiscoveryReviewContent(details.industryTemplate);
  const templatePromptBlock = industryDiscoveryPromptBlock(details.industryTemplate);
  const hasTemplatePrompts = details.notes.includes(templatePromptBlock);
  const selectedFocusCount = discoveryGroups.reduce((total, group) => total + (details[group.key] as string[]).length, 0);
  const categoryPlacement = FIXED_GANTT_CATEGORIES.map(category => ({
    category,
    items: [
      ...[...playbookPlan.designPackages, ...playbookPlan.implementationPackages]
        .map(item => ({ label: item.title, ownership: getVcfPlaybookWorkPackageOwnership(playbookPlan.path, item) })),
      ...fields.priorities.map(capability => ({
        label: componentDesignTitles[capability],
        ownership: getVcfComponentDesignOwnership(capability),
      })),
    ].filter(item => item.ownership.category === category),
  })).filter(group => group.items.length > 0);

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
    <section className="mt-7 border border-slate-200 bg-slate-50/70 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-3xl"><p className="text-xs font-black uppercase tracking-[.16em] text-[#c8102e]">Work package design</p><h3 className="mt-1 text-lg font-semibold text-slate-950">Shape the high-level SOW plan</h3><p className="mt-2 text-sm leading-6 text-slate-600">Confirm the delivery path, outcomes, assumptions, and prerequisites that should become delivery work packages. Unselected work is not assumed to be in scope.</p></div><div className="border border-slate-200 bg-white px-4 py-2 text-right"><p className="text-[9px] font-black uppercase tracking-[.14em] text-slate-500">Detailed outcomes selected</p><p className="mt-1 text-xl font-semibold text-slate-950">{selectedFocusCount}</p></div></div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_.9fr]"><div className="border border-slate-200 bg-white p-4">{fields.customerSegment === "commercial" && <p className="mb-3 text-xs leading-5 text-slate-500"><strong className="text-slate-700">Platform edition:</strong> {edition === "vvf" ? "VMware vSphere Foundation (VVF)" : "VMware Cloud Foundation (VCF)"} · change it on the Customer step.</p>}<Label className="text-sm font-semibold">{edition === "vvf" ? "VVF" : "VCF"} adoption pathway</Label><Select value={playbookPlan.path} onValueChange={value => updateDetails({ upgradePath: value as UpgradePath })}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{pathwayOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select><p className="mt-2 text-xs leading-5 text-slate-500">{pathwayOptions.find(option => option.value === playbookPlan.path)?.description || playbookPlan.description}</p><div className="mt-4 grid gap-3 md:grid-cols-2"><div><Label className="text-xs font-semibold">Domain topology</Label><Select value={details.domainTopology} onValueChange={value => updateDetails({ domainTopology: value as DomainTopology })}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{topologyOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div><div><Label className="text-xs font-semibold">Principal storage</Label><Select value={details.principalStorage} onValueChange={value => updateDetails({ principalStorage: value as PrincipalStorage })}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{storageOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div></div></div><div className="border border-slate-200 bg-white p-4"><Label className="text-sm font-semibold">Customer outcome and assumption summary</Label><Textarea className="mt-2 min-h-32 bg-white" value={details.notes} onChange={event => updateDetails({ notes: event.target.value })} placeholder="Capture confirmed desired outcomes, scope boundaries, integration constraints, pilot assumptions, decision owners, or customer responsibilities." /></div></div>

      <section className="mt-4 overflow-hidden border border-[#10233f] bg-white"><div className="bg-[#10233f] px-4 py-4 text-white"><p className="text-[10px] font-black uppercase tracking-[.16em] text-red-300">Generated from the selected pathway</p><div className="mt-1 flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-lg font-semibold">{playbookPlan.label}</h4><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-300">{playbookPlan.description}</p></div><span className="border border-white/20 px-3 py-1 text-xs font-semibold">{playbookPlan.designPackages.length} design · {playbookPlan.implementationPackages.length} implementation</span></div></div><div className="grid gap-px bg-slate-200 lg:grid-cols-2"><div className="bg-white p-4"><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#c8102e]">Design deliverables</p><div className="mt-3 space-y-3">{playbookPlan.designPackages.map((item, index) => <article key={item.id} className="border-l-2 border-[#10233f] pl-3"><p className="text-xs font-semibold text-slate-950">{index + 1}. {item.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{item.outcome}</p><p className="mt-1 text-[11px] leading-4 text-slate-500"><strong>Accepted when:</strong> {item.acceptance}</p></article>)}</div></div><div className="bg-white p-4"><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#c8102e]">Implementation and adoption</p>{playbookPlan.implementationPackages.length ? <div className="mt-3 space-y-3">{playbookPlan.implementationPackages.map((item, index) => <article key={item.id} className="border-l-2 border-[#c8102e] pl-3"><p className="text-xs font-semibold text-slate-950">{index + 1}. {item.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{item.outcome}</p><p className="mt-1 text-[11px] leading-4 text-slate-500"><strong>Starts after:</strong> {item.dependsOn}</p></article>)}</div> : <p className="mt-3 text-xs leading-5 text-slate-600">No implementation work is generated until the pathway is selected or execution is explicitly included.</p>}</div></div><div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600"><strong>Decision inputs:</strong> {playbookPlan.decisions.join(" · ")}</div></section>

      <section className="mt-4 border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#c8102e]">Timeline category placement</p><h4 className="mt-1 text-sm font-semibold text-slate-950">Where the generated packages will appear</h4></div><p className="max-w-xl text-xs leading-5 text-slate-500">Infrastructure architecture and upgrade delivery are owned by Modernize Infrastructure. Operations is reserved for the operating model, lifecycle, observability, and service handoff.</p></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{categoryPlacement.map(group => <article key={group.category} className="border border-slate-200 bg-slate-50 p-3"><h5 className="text-xs font-bold text-slate-950">{group.category}</h5><div className="mt-2 space-y-1.5">{group.items.map((item, index) => <div key={`${group.category}-${item.label}-${index}`} className="flex items-start justify-between gap-3 border-t border-slate-200 pt-1.5 first:border-t-0 first:pt-0"><span className="text-[11px] leading-4 text-slate-700">{item.label}</span><span className="shrink-0 text-[9px] font-bold uppercase tracking-[.08em] text-[#315b8a]">{item.ownership.workstreamType}</span></div>)}</div></article>)}</div></section>

      <Accordion type="multiple" className="mt-5 border border-slate-200 bg-white px-4">
        <AccordionItem value="depth"><AccordionTrigger className="text-sm font-semibold">Component adoption depth <span className="ml-2 text-xs font-normal text-slate-500">controls entitlement drawdown</span></AccordionTrigger><AccordionContent><p className="pb-3 text-xs leading-5 text-slate-500">Select how far each confirmed component should be taken. Deployment alone is Tier 1; operational adoption is Tier 2; business-consumption outcomes are Tier 3 and require durable customer ownership.</p><div className="grid gap-3 pb-4 md:grid-cols-2 xl:grid-cols-3">{([
          ["operations", "VCF Operations"],
          ["automation", "VCF Automation"],
          ["networkingSecurity", "VCF Networking & vDefend"],
          ["kubernetesAi", "VKS & Private AI"],
          ["efficiency", "Efficiency features"],
        ] as const).map(([key, label]) => <div key={key} className="border border-slate-200 bg-slate-50 p-3"><Label className="text-xs font-semibold">{label}</Label><Select value={details.componentDepths[key]} onValueChange={value => updateDetails({ componentDepths: { ...details.componentDepths, [key]: value as AdoptionDepth } })}><SelectTrigger className="mt-2 bg-white"><SelectValue /></SelectTrigger><SelectContent>{depthOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select><p className="mt-2 text-[11px] leading-4 text-slate-500">{depthOptions.find(option => option.value === details.componentDepths[key])?.description}</p></div>)}</div></AccordionContent></AccordionItem>
      </Accordion>

      <Accordion type="multiple" defaultValue={["outcomes"]} className="mt-4 border border-slate-200 bg-white px-4">
        <AccordionItem value="outcomes"><AccordionTrigger className="text-sm font-semibold">Detailed service outcomes <span className="ml-2 text-xs font-normal text-slate-500">{selectedFocusCount} selected</span></AccordionTrigger><AccordionContent><div className="grid gap-4 pb-4 lg:grid-cols-2">{discoveryGroups.map(group => <section key={group.key} className="border border-slate-200 bg-slate-50/50 p-4"><h4 className="text-sm font-semibold text-slate-950">{group.title}</h4><p className="mt-1 text-xs leading-5 text-slate-500">{group.prompt}</p><div className="mt-3 space-y-2">{group.options.map(option => { const key = `${group.capability}:${option.value}`; const checked = (details[group.key] as string[]).includes(option.value); const available = isPlanOutcomeAvailable(key, edition); const requiredBy = checked ? [] : requiredByFor(key); return <label key={option.value} className={`flex gap-3 border p-3 transition-colors ${available ? "cursor-pointer" : "cursor-not-allowed opacity-60"} ${checked && available ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white hover:bg-slate-50"}`}><Checkbox checked={checked} disabled={!available && !checked} className="mt-0.5" onCheckedChange={next => toggleFocus(group, option.value, next === true)} /><span><span className="block text-xs font-semibold">{option.label}{!available && <span className="ml-2 border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Requires VCF</span>}</span><span className={`mt-0.5 block text-xs leading-5 ${checked && available ? "text-slate-300" : "text-slate-500"}`}>{option.description}</span>{checked && !available && <span className="mt-1 block text-[11px] font-semibold text-amber-700">Left out of the VVF plan.</span>}{requiredBy.length > 0 && <span className="mt-1 block text-[11px] font-semibold text-[#315b8a]">Added as a prerequisite for {requiredBy.map(item => planOutcomeLabel(item, edition)).join("; ")}.</span>}</span></label>; })}</div></section>)}</div></AccordionContent></AccordionItem>
        <AccordionItem value="prerequisites"><AccordionTrigger className="text-sm font-semibold">Infrastructure prerequisites <span className="ml-2 text-xs font-normal text-slate-500">{details.softPrerequisites.length} confirmed</span></AccordionTrigger><AccordionContent><p className="pb-3 text-xs leading-5 text-slate-500">Select only confirmed site-readiness prerequisites. They run alongside the HCL review (or Red-path procurement) and must close before platform build begins.</p><div className="grid gap-2 pb-4 lg:grid-cols-3">{softPrerequisiteOptions.map(option => { const checked = details.softPrerequisites.includes(option.value); return <label key={option.value} className={`flex cursor-pointer gap-3 border p-3 transition-colors ${checked ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 hover:bg-slate-50"}`}><Checkbox checked={checked} className="mt-0.5" onCheckedChange={next => updateDetails({ softPrerequisites: next === true ? [...details.softPrerequisites, option.value] : details.softPrerequisites.filter(item => item !== option.value) })} /><span><span className="block text-xs font-semibold">{option.label}</span><span className={`mt-0.5 block text-xs leading-5 ${checked ? "text-slate-300" : "text-slate-500"}`}>{option.description}</span></span></label>; })}</div></AccordionContent></AccordionItem>
        <AccordionItem value="discovery"><AccordionTrigger className="text-sm font-semibold">Industry discovery prompts <span className="ml-2 text-xs font-normal text-slate-500">conversation aid only</span></AccordionTrigger><AccordionContent><div className="pb-4"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div><Label className="text-sm font-semibold">Industry discovery lens</Label><p className="mt-1 text-xs leading-5 text-slate-500">Templates guide the conversation and never select scope, priorities, or work packages.</p></div><span className="w-fit border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Reusable prompts</span></div><Select value={details.industryTemplate} onValueChange={value => setIndustryTemplate(value as IndustryTemplateId)}><SelectTrigger className="mt-3 bg-white"><SelectValue /></SelectTrigger><SelectContent>{industryDiscoveryTemplates.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select><p className="mt-2 text-xs leading-5 text-slate-500">{template.description}</p><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{promptItems.map(item => <article key={item.id} className="border border-slate-200 bg-slate-50 p-3"><div className="text-[10px] font-black uppercase tracking-[.14em] text-[#c8102e]">{item.ordinal} · {item.theme}</div><p className="mt-1 text-xs leading-5 text-slate-700">{item.question}</p></article>)}</div><div className="mt-4 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={addTemplatePromptsToNotes} disabled={hasTemplatePrompts}>Add prompts to assumptions</Button>{hasTemplatePrompts ? <Button type="button" size="sm" variant="ghost" onClick={clearTemplatePromptsFromNotes}>Clear selected prompts</Button> : null}{details.industryTemplate !== "general-enterprise" ? <Button type="button" size="sm" variant="ghost" onClick={() => setIndustryTemplate("general-enterprise")}>Use general template</Button> : null}</div></div></AccordionContent></AccordionItem>
      </Accordion>
    </section>
  );
}
