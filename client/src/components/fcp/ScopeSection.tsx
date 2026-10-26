import { depthOptions, discoveryGroups, softPrerequisiteOptions, storageOptions, topologyOptions, upgradeOptions } from "@/components/DetailedAdoptionIntake";
import { generatedRowsFor, RowTable } from "@/components/ReportContentEditor";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Chip, Panel, Pill } from "@/components/vsa/elements";
import { withFieldPatch } from "@/lib/fieldPatch";
import { focusesOf, isDeclined, isInScope, setCapabilityInScope, setDeclined, setFocus } from "@/lib/scopeEdits";
import { effectivePlatformEdition, getVcfPlaybookPlan, isPlanOutcomeAvailable, planOutcomeLabel, playbookPlanForFields, resolvePlanOutcomes, VVF_DELIVERY_PATHS, type AdoptionDepth, type AdoptionDetails, type Capability, type DomainTopology, type EngagementDocument, type PlanOutcomeKey, type PrincipalStorage, type UpgradePath, type VcfPlaybookWorkPackage } from "@shared/fcp";
import { industryDiscoveryTemplates } from "@shared/industryDiscovery";
import { generateReport } from "@shared/reportView";
import { useMemo } from "react";

type DepthKey = keyof AdoptionDetails["componentDepths"];

/** The seven workstreams the discovery guide walks, in its order, each with its card name and depth tier. */
const CARDS: Array<{ capability: Capability; name: string; depth: DepthKey | null; depthShared?: string }> = [
  { capability: "operations", name: "Operations", depth: "operations" },
  { capability: "automation", name: "Automation", depth: "automation" },
  { capability: "networking", name: "VCF networking (NSX)", depth: "networkingSecurity", depthShared: "Security" },
  { capability: "security", name: "Security", depth: "networkingSecurity", depthShared: "VCF networking" },
  { capability: "resilience", name: "Resilience and DR", depth: null },
  { capability: "kubernetes", name: "Kubernetes", depth: "kubernetesAi", depthShared: "Private AI" },
  { capability: "private-ai", name: "Private AI", depth: "kubernetesAi", depthShared: "Kubernetes" },
];

/** Platform outcomes belong to the card whose work needs them. */
const outcomeCapability = (key: PlanOutcomeKey): string => (key === "platform:nsx" ? "networking" : key === "platform:ssp" ? "security" : key.split(":")[0]);

const PROFILE_FIELDS = [["consumption", "Consumption"], ["physicalSite", "Physical site configuration"], ["availability", "Availability"], ["isolation", "Isolation"], ["recoverability", "Recoverability"], ["expansion", "Expansion"]] as const;

/**
 * The Scope section (design 5.5), in the order the discovery call runs: delivery motion and pathway, one card per
 * workstream, then the design profile and elements. UI only: it edits the same fields the plan generator already
 * reads, so an untouched record renders exactly as before.
 */
export function ScopeSection({ document, onChange }: { document: EngagementDocument; onChange: (document: EngagementDocument) => void }) {
  const { fields, report } = document;
  const details = fields.adoptionDetails;
  const edition = effectivePlatformEdition(fields);
  const playbook = playbookPlanForFields(fields);
  const resolved = useMemo(() => resolvePlanOutcomes(fields), [fields]);
  const generated = useMemo(() => generateReport(document), [document]);
  const patch = (next: Partial<EngagementDocument["fields"]>) => onChange(withFieldPatch(document, next));
  const patchDetails = (next: Partial<AdoptionDetails>) => patch({ adoptionDetails: { ...details, ...next } });
  const setReport = <K extends keyof EngagementDocument["report"]>(key: K, value: EngagementDocument["report"][K]) => onChange({ ...document, report: { ...report, [key]: value } });

  const motions = edition === "vvf"
    ? upgradeOptions.filter(option => VVF_DELIVERY_PATHS.includes(option.value as (typeof VVF_DELIVERY_PATHS)[number])).map(option => ({ ...option, label: getVcfPlaybookPlan(option.value, "vvf").label }))
    : upgradeOptions;

  const groupFor = (capability: Capability) => discoveryGroups.find(group => group.capability === capability)!;
  const inScope = (capability: Capability) => isInScope(document, capability);
  const declined = (name: string) => isDeclined(document, name);
  /** Outcomes of this card the plan carries only because another outcome needs them. */
  const pulledIn = (capability: Capability) => resolved.outcomes.filter(outcome => outcome.requiredBy.length > 0 && outcomeCapability(outcome.key) === capability);

  return (
    <div className="space-y-4">
      <Panel title="Delivery motion and pathway" sub="How the platform gets to VCF 9.1. The pathway decides the design and implementation packages below, which is what selecting it commits to." bodyClassName="space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="scope-motion">Delivery motion<span className="ml-1 text-cdw-red">*</span></Label>
            <Select value={playbook.path} onValueChange={value => patchDetails({ upgradePath: value as UpgradePath })}>
              <SelectTrigger id="scope-motion"><SelectValue /></SelectTrigger>
              <SelectContent>{motions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs leading-5 text-s400">{motions.find(option => option.value === playbook.path)?.description ?? playbook.description}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scope-topology">Domain topology</Label>
            <Select value={details.domainTopology} onValueChange={value => patchDetails({ domainTopology: value as DomainTopology })}>
              <SelectTrigger id="scope-topology"><SelectValue /></SelectTrigger>
              <SelectContent>{topologyOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scope-storage">Principal storage</Label>
            <Select value={details.principalStorage} onValueChange={value => patchDetails({ principalStorage: value as PrincipalStorage })}>
              <SelectTrigger id="scope-storage"><SelectValue /></SelectTrigger>
              <SelectContent>{storageOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="scope-hardware">Hardware availability</Label>
            <Select value={fields.hardwareAvailability} onValueChange={value => patch({ hardwareAvailability: value as typeof fields.hardwareAvailability })}>
              <SelectTrigger id="scope-hardware"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="existing">Existing / available</SelectItem><SelectItem value="new">New procurement required</SelectItem><SelectItem value="unknown">Not yet known</SelectItem></SelectContent>
            </Select>
          </div>
          {fields.hardwareAvailability === "new" && (
            <div className="space-y-1.5">
              <Label htmlFor="scope-lead">Estimated lead time (weeks)</Label>
              <Input id="scope-lead" type="number" min={0} max={104} value={fields.hardwareLeadWeeks || ""} onChange={event => patch({ hardwareLeadWeeks: Math.min(104, Math.max(0, Number(event.target.value) || 0)) })} />
            </div>
          )}
        </div>
        <div className="rounded-lg border border-s100">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-s100 bg-surface-sunken px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">VCF 9.1 pathway</p>
              <h3 className="text-base font-semibold text-ink">{playbook.label}</h3>
              <p className="mt-0.5 max-w-3xl text-xs leading-5 text-ink-muted">{playbook.description}</p>
            </div>
            <Chip>{playbook.designPackages.length} design · {playbook.implementationPackages.length} implementation</Chip>
          </div>
          <div className="grid gap-px bg-s100 lg:grid-cols-2">
            <PackageList title="Design packages" items={playbook.designPackages} />
            <PackageList title="Implementation packages" items={playbook.implementationPackages} empty="No implementation is generated until the pathway is decided, or for a design-only plan." />
          </div>
        </div>
      </Panel>

      <Panel title="Capabilities" sub="One card per workstream the discovery call walks. Turn on what the customer wants; an off card stays out of the plan, and can be noted as not requested so the FCP says so." bodyClassName="grid gap-3 p-4 lg:grid-cols-2">
        {CARDS.map(card => {
          const group = groupFor(card.capability);
          const on = inScope(card.capability);
          const available = isPlanOutcomeAvailable(`${card.capability}:core`, edition);
          const pulled = pulledIn(card.capability);
          const includedFor = pulled.length > 0 && (
            <ul className="space-y-0.5 text-xs leading-5 text-ink-muted">
              {pulled.map(outcome => <li key={outcome.key}><strong className="font-medium text-ink">{planOutcomeLabel(outcome.key, edition)}</strong> included for: {outcome.requiredBy.map(key => planOutcomeLabel(key, edition)).join(", ")}</li>)}
            </ul>
          );
          if (!on) {
            return (
              <section key={card.capability} className="flex flex-col gap-2 rounded-lg border border-s100 bg-surface px-4 py-3" aria-label={`${card.name}, not in scope`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <Switch checked={false} disabled={!available} onCheckedChange={next => onChange(setCapabilityInScope(document, card.capability, card.name, next))} aria-label={`${card.name} in scope`} />
                    <span className="text-sm font-medium text-ink">{card.name}</span>
                    <span className="text-xs text-ink-muted">{available ? "Not in scope" : "Requires VCF; not included with VVF"}</span>
                    {details.followOnOnly.includes(card.capability) && <Chip title="Planned in the Two-Year Notional; never draws on the entitlement">Follow-on</Chip>}
                  </div>
                  {available && <Chip pressed={declined(card.name)} onClick={() => onChange(setDeclined(document, card.name, !declined(card.name)))} title="Printed in the FCP as not requested">{declined(card.name) ? "Not requested ✓" : "Mark not requested"}</Chip>}
                </div>
                {includedFor}
              </section>
            );
          }
          return (
            <section key={card.capability} className="space-y-3 rounded-lg border border-s300 bg-surface p-4" aria-label={`${card.name}, in scope`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Switch checked onCheckedChange={next => onChange(setCapabilityInScope(document, card.capability, card.name, next))} aria-label={`${card.name} in scope`} />
                  <h3 className="text-sm font-semibold text-ink">{card.name}</h3>
                </div>
                <Pill verdict="ready">In scope</Pill>
              </div>
              {card.depth && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <DepthSelect label={`Depth${card.depthShared ? ` (shared with ${card.depthShared})` : ""}`} value={details.componentDepths[card.depth]} onChange={value => patchDetails({ componentDepths: { ...details.componentDepths, [card.depth!]: value } })} />
                  {card.capability === "operations" && <DepthSelect label="Efficiency features depth" value={details.componentDepths.efficiency} onChange={value => patchDetails({ componentDepths: { ...details.componentDepths, efficiency: value } })} />}
                </div>
              )}
              <fieldset>
                <legend className="text-xs font-medium text-ink">{group.prompt}</legend>
                <div className="mt-2 grid gap-1.5">
                  {group.options.map(option => {
                    const key = `${card.capability}:${option.value}`;
                    const optionAvailable = isPlanOutcomeAvailable(key, edition);
                    const checked = focusesOf(document, card.capability).includes(option.value);
                    return (
                      <label key={option.value} className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-xs ${optionAvailable ? "cursor-pointer hover:bg-surface-sunken" : "cursor-not-allowed opacity-60"}`}>
                        <Checkbox className="mt-0.5" checked={checked} disabled={!optionAvailable && !checked} onCheckedChange={next => onChange(setFocus(document, card.capability, option.value, next === true))} />
                        <span><strong className="font-medium text-ink">{option.label}</strong> <span className="text-ink-muted">{optionAvailable ? option.description : "Requires VCF; not included with VVF."}</span></span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {includedFor}
            </section>
          );
        })}
      </Panel>

      <Panel title="Design profile" sub="Six short statements the FCP prints as the VCF Design Profile. Grey text is generated from the plan and prints as shown; type to replace it, clear to go back." bodyClassName="space-y-3 p-4">
        {playbook.decisions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            <span>Decisions this pathway settles in design:</span>
            {playbook.decisions.map(decision => <Chip key={decision}>{decision}</Chip>)}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {PROFILE_FIELDS.map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`profile-${key}`} className="text-xs">{label}</Label>
              <Textarea id={`profile-${key}`} className="min-h-16 bg-surface text-xs" value={report.designProfile[key] ?? ""} placeholder={generated.designProfile[key]} onChange={event => setReport("designProfile", { ...report.designProfile, [key]: event.target.value || null })} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Design elements" sub="Per component: the requirement, the recommendation, and a gate when something must happen first. A row you add for a component replaces the generated one." bodyClassName="p-4">
        <RowTable
          rows={report.designElements}
          columns={[{ key: "component", label: "Component", width: "16%" }, { key: "requirement", label: "Requirement", type: "longtext" }, { key: "recommendation", label: "Recommendation", type: "longtext" }, { key: "gate", label: "Gate", width: "18%" }]}
          blank={{ component: "", requirement: "", recommendation: "", gate: null }}
          addLabel="Add design element"
          onChange={rows => setReport("designElements", rows)}
          generated={generatedRowsFor(document, generated, "designElements", onChange)}
        />
      </Panel>

      <Panel title="Site prerequisites and notes" sub="Confirmed site-readiness work runs alongside the hardware review and must close before the platform build. Notes stay internal to the plan." bodyClassName="grid gap-4 p-4 lg:grid-cols-2">
        <fieldset>
          <legend className="text-xs font-medium text-ink">Confirmed prerequisites</legend>
          <div className="mt-2 grid gap-1.5">
            {softPrerequisiteOptions.map(option => {
              const checked = details.softPrerequisites.includes(option.value);
              return (
                <label key={option.value} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-surface-sunken">
                  <Checkbox className="mt-0.5" checked={checked} onCheckedChange={next => patchDetails({ softPrerequisites: next === true ? [...details.softPrerequisites, option.value] : details.softPrerequisites.filter(item => item !== option.value) })} />
                  <span><strong className="font-medium text-ink">{option.label}</strong> <span className="text-ink-muted">{option.description}</span></span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="scope-industry" className="text-xs">Industry discovery lens</Label>
            <Select value={details.industryTemplate} onValueChange={value => patchDetails({ industryTemplate: value as AdoptionDetails["industryTemplate"] })}>
              <SelectTrigger id="scope-industry"><SelectValue /></SelectTrigger>
              <SelectContent>{industryDiscoveryTemplates.map(template => <SelectItem key={template.id} value={template.id}>{template.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="scope-notes" className="text-xs">Outcomes and assumptions</Label>
            <Textarea id="scope-notes" className="min-h-24 bg-surface text-xs" value={details.notes} onChange={event => patchDetails({ notes: event.target.value })} placeholder="Confirmed outcomes, scope boundaries, integration constraints, pilot assumptions, decision owners, or customer responsibilities." />
          </div>
        </div>
      </Panel>

      <details className="rounded-lg border border-s100 bg-surface px-4 py-2 text-xs">
        <summary className="cursor-pointer text-ink-muted">View document source (for debugging)</summary>
        <pre className="mt-2 max-h-80 overflow-auto rounded bg-surface-sunken p-3 text-[11px] leading-4 text-ink">{JSON.stringify({ priorities: fields.priorities, adoptionDetails: details, declined: report.declined, designProfile: report.designProfile, designElements: report.designElements }, null, 2)}</pre>
      </details>
    </div>
  );
}

function PackageList({ title, items, empty }: { title: string; items: VcfPlaybookWorkPackage[]; empty?: string }) {
  return (
    <div className="bg-surface p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{title}</p>
      {items.length ? (
        <ol className="mt-2 space-y-2.5">
          {items.map((item, index) => (
            <li key={item.id} className="border-l-2 border-s300 pl-3">
              <p className="text-xs font-semibold text-ink">{index + 1}. {item.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-s500">{item.outcome}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-s400"><strong>Accepted when:</strong> {item.acceptance}</p>
            </li>
          ))}
        </ol>
      ) : <p className="mt-2 text-xs leading-5 text-s500">{empty}</p>}
    </div>
  );
}

function DepthSelect({ label, value, onChange }: { label: string; value: AdoptionDepth; onChange: (value: AdoptionDepth) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={next => onChange(next as AdoptionDepth)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{depthOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
