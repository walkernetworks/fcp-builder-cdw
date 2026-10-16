import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EngagementDocument } from "@shared/fcp";
import type { ReportContent } from "@shared/report";
import { generateReport, visibleGenerated, type GeneratedReport, type GeneratedRow, type GeneratedSection } from "@shared/reportView";
import { CircleCheck, CircleDashed, EyeOff, PenLine, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, type ReactNode } from "react";

type Props = {
  document: EngagementDocument;
  onChange: (document: EngagementDocument) => void;
};

type ColumnType = "text" | "longtext" | "number" | "date" | "month" | "list";
type Column<Row> = { key: keyof Row & string; label: string; type?: ColumnType; width?: string; placeholder?: string };

const numberOrNull = (value: string) => (value.trim() === "" ? null : Math.max(0, Number(value)));
const listToText = (value: string[]) => value.join(", ");
const textToList = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs font-semibold text-s600">{label}</Label>{children}{hint && <p className="text-[11px] leading-4 text-s400">{hint}</p>}</div>;
}

function YesNo({ value, onChange }: { value: boolean | null; onChange: (value: boolean | null) => void }) {
  return (
    <Select value={value === null ? "unknown" : value ? "yes" : "no"} onValueChange={next => onChange(next === "unknown" ? null : next === "yes")}>
      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="unknown">Not confirmed</SelectItem><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
    </Select>
  );
}

type GeneratedProps<Row> = {
  generated: Array<GeneratedRow<Row>>;
  hiddenCount: number;
  onOverride: (item: GeneratedRow<Row>) => void;
  onHide: (key: string) => void;
  onRestore: () => void;
};

function GeneratedActions({ onOverride, onHide }: { onOverride: () => void; onHide: () => void }) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onOverride}><PenLine className="size-3.5" /> Override</Button>
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onHide}><EyeOff className="size-3.5" /> Hide</Button>
    </div>
  );
}

function RestoreHidden({ count, onRestore }: { count: number; onRestore: () => void }) {
  if (!count) return null;
  return <Button type="button" variant="ghost" size="sm" className="text-xs text-s500" onClick={onRestore}><RotateCcw className="size-3.5" /> Restore {count} hidden</Button>;
}

const FROM_PLAN = <span className="mr-2 inline-block rounded bg-s100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-s500">From the plan</span>;

/** A list of lines; generated lines appear first and can be overridden or hidden. */
function TextList({ items, onChange, placeholder, generated }: { items: string[]; onChange: (items: string[]) => void; placeholder: string; generated?: GeneratedProps<string> }) {
  return (
    <div className="space-y-2">
      {generated?.generated.map(item => (
        <div key={item.key} className="flex items-center gap-2 rounded-md border border-s100 bg-s50 px-3 py-1.5 text-xs text-s600">
          <span className="flex-1">{FROM_PLAN}{item.row}</span>
          <GeneratedActions onOverride={() => generated.onOverride(item)} onHide={() => generated.onHide(item.key)} />
        </div>
      ))}
      {items.map((item, index) => (
        <div key={index} className="flex gap-2">
          <Input className="bg-white" value={item} placeholder={placeholder} onChange={event => onChange(items.map((current, position) => (position === index ? event.target.value : current)))} />
          <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => onChange(items.filter((_, position) => position !== index))}><Trash2 className="size-4" /></Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ""])}><Plus className="size-4" /> Add line</Button>
        {generated && <RestoreHidden count={generated.hiddenCount} onRestore={generated.onRestore} />}
      </div>
    </div>
  );
}

/** An editable table of rows; generated rows appear first, read-only, and can be overridden or hidden. */
function RowTable<Row extends Record<string, unknown>>({ rows, columns, blank, onChange, addLabel, generated }: { rows: Row[]; columns: Array<Column<Row>>; blank: Row; onChange: (rows: Row[]) => void; addLabel: string; generated?: GeneratedProps<Row> }) {
  const update = (index: number, key: keyof Row, value: unknown) => onChange(rows.map((row, position) => (position === index ? { ...row, [key]: value } : row)));
  const display = (value: unknown) => (Array.isArray(value) ? (value.length ? value.join(", ") : "to be named") : value === null || value === undefined || value === "" ? "—" : String(value));
  const cell = (row: Row, index: number, column: Column<Row>) => {
    const value = row[column.key];
    const common = { className: "bg-white text-xs", placeholder: column.placeholder ?? column.label, "aria-label": column.label };
    switch (column.type) {
      case "longtext": return <Textarea {...common} className="min-h-16 bg-white text-xs" value={String(value ?? "")} onChange={event => update(index, column.key, event.target.value)} />;
      case "number": return <Input {...common} type="number" min={0} value={value === null || value === undefined ? "" : String(value)} onChange={event => update(index, column.key, numberOrNull(event.target.value) ?? 0)} />;
      case "date": return <Input {...common} type="date" value={String(value ?? "")} onChange={event => update(index, column.key, event.target.value)} />;
      case "month": return <Input {...common} type="month" value={String(value ?? "").slice(0, 7)} onChange={event => update(index, column.key, event.target.value)} />;
      case "list": return <Input {...common} placeholder={`${column.label} (comma separated)`} value={listToText((value as string[]) ?? [])} onChange={event => update(index, column.key, textToList(event.target.value))} />;
      default: return <Input {...common} value={String(value ?? "")} onChange={event => update(index, column.key, event.target.value === "" && column.key === "gate" ? null : event.target.value)} />;
    }
  };
  const anyRows = rows.length > 0 || (generated?.generated.length ?? 0) > 0;
  return (
    <div className="space-y-2">
      {anyRows && (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1 text-xs">
            <thead><tr>{columns.map(column => <th key={column.key} className="px-1 text-left text-[10px] font-bold uppercase tracking-wide text-s400" style={{ width: column.width }}>{column.label}</th>)}<th className="w-10" /></tr></thead>
            <tbody>
              {generated?.generated.map(item => (
                <tr key={item.key} className="align-top text-s600">
                  {columns.map((column, position) => <td key={column.key} className="rounded-sm bg-s50 px-2 py-1.5">{position === 0 && FROM_PLAN}{display(item.row[column.key])}</td>)}
                  <td className="bg-s50"><GeneratedActions onOverride={() => generated.onOverride(item)} onHide={() => generated.onHide(item.key)} /></td>
                </tr>
              ))}
              {rows.map((row, index) => (
                <tr key={index} className="align-top">
                  {columns.map(column => <td key={column.key} className="px-1">{cell(row, index, column)}</td>)}
                  <td><Button type="button" variant="ghost" size="icon" aria-label="Remove row" onClick={() => onChange(rows.filter((_, position) => position !== index))}><Trash2 className="size-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { ...blank }])}><Plus className="size-4" /> {addLabel}</Button>
        {generated && <RestoreHidden count={generated.hiddenCount} onRestore={generated.onRestore} />}
      </div>
    </div>
  );
}

function Section({ value, title, heading, filled, hint, children }: { value: string; title: string; heading?: string; filled?: boolean; hint: string; children: ReactNode }) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="text-sm font-semibold">
        <span className="flex items-center gap-2">
          {filled === undefined ? null : filled ? <CircleCheck className="size-4 text-state-pass-text" /> : <CircleDashed className="size-4 text-state-warn-text" />}
          {title}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <p className="pb-3 text-xs leading-5 text-s400">{hint}{heading ? <span className="mt-1 block text-[11px] text-s300">In the report as “{heading}”.</span> : null}</p>
        <div className="pb-4">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}

function Group({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="mt-6">
      <p className="text-[10px] font-black uppercase tracking-[.16em] text-s400">{title}</p>
      <p className="mt-1 text-xs leading-5 text-s400">{description}</p>
      {children}
    </div>
  );
}

/**
 * Every Condensed FCP input as a form. Content the app generates from the plan is shown in place and can be
 * kept, overridden, or hidden; the report prints exactly what this form shows.
 */
export function ReportContentEditor({ document, onChange }: Props) {
  const report = document.report;
  const generated = useMemo(() => generateReport(document), [document]);
  const set = <K extends keyof ReportContent>(key: K, value: ReportContent[K]) => onChange({ ...document, report: { ...report, [key]: value } });
  const setEntitlement = (patch: Partial<ReportContent["entitlement"]>) => set("entitlement", { ...report.entitlement, ...patch });
  const setDiscovery = (patch: Partial<ReportContent["discovery"]>) => set("discovery", { ...report.discovery, ...patch });
  const textInput = (value: string | null, onValue: (value: string | null) => void, placeholder = "") => <Input className="bg-white" value={value ?? ""} placeholder={placeholder} onChange={event => onValue(event.target.value === "" ? null : event.target.value)} />;
  const numberInput = (value: number | null, onValue: (value: number | null) => void, placeholder = "") => <Input className="bg-white" type="number" min={0} value={value ?? ""} placeholder={placeholder} onChange={event => onValue(numberOrNull(event.target.value))} />;
  const dateInput = (value: string | null, onValue: (value: string | null) => void) => <Input className="bg-white" type="date" value={value ?? ""} onChange={event => onValue(event.target.value || null)} />;

  /** Wiring for a section the app partly generates: override copies the row into the planner's rows and hides the original. */
  function generatedFor<S extends GeneratedSection>(section: S): GeneratedProps<GeneratedReport[S][number]["row"]> {
    const all = generated[section] as Array<GeneratedRow<any>>;
    const hidden = new Set(report.hiddenGenerated);
    return {
      generated: visibleGenerated(document, generated, section) as Array<GeneratedRow<any>>,
      hiddenCount: all.filter(item => hidden.has(item.key)).length,
      onOverride: item => onChange({ ...document, report: { ...report, [section]: [...(report[section] as unknown[]), structuredClone(item.row)], hiddenGenerated: Array.from(new Set([...report.hiddenGenerated, item.key])) } }),
      onHide: key => set("hiddenGenerated", Array.from(new Set([...report.hiddenGenerated, key]))),
      onRestore: () => set("hiddenGenerated", report.hiddenGenerated.filter(key => !all.some(item => item.key === key))),
    };
  }

  const missing = [
    !report.entitlement.hours && "Entitled hours",
    report.entitlement.hours && report.entitlement.hoursConsumed === null && "Hours consumed to date",
    !report.whatWeHeard.some(item => item.component.trim()) && "Customer positions (what we heard)",
    !report.problems.some(item => item.problem.trim()) && "Customer problems",
    !report.openQuestions.some(item => item.question.trim()) && "Open questions",
    !report.personnel.some(item => item.cdw.length || item.customer.length) && "Named people by work stream",
    !report.milestonesToDate.some(item => item.date && item.event.trim()) && "Milestones to date",
    !report.headline && "Cover headline",
  ].filter((item): item is string => Boolean(item));

  return (
    <section className="rounded-xl border border-s100 bg-white p-5">
      <p className="text-[10px] font-black uppercase tracking-[.16em] text-cdw-red">Condensed FCP content</p>
      <h3 className="mt-1 text-lg font-semibold text-ink">Report content</h3>
      <p className="mt-1 max-w-3xl text-xs leading-5 text-s400">Fill this in by hand, or import a Copilot brief above to pre-fill it. Grey rows marked “From the plan” are generated and print as shown; override or hide any of them. A section with nothing in it is left out of the report, never printed as a placeholder. Changes save automatically.</p>
      <div className={`mt-4 rounded-xl border p-3 text-xs ${missing.length ? "border-state-warn/30 bg-state-warn-soft text-state-warn-text" : "border-state-pass/30 bg-state-pass-soft text-state-pass-text"}`}>
        {missing.length ? <><b>Not captured yet, so left out of the report:</b> {missing.join(" · ")}</> : <b>Everything the report needs from the customer is filled in.</b>}
      </div>

      <Group title="From the customer" description="What only a conversation with the customer can provide.">
        <Accordion type="multiple" defaultValue={["entitlement", "heard"]} className="border-t border-s100">
          <Section value="entitlement" title="Entitlement hours" filled={Boolean(report.entitlement.hours && report.entitlement.hoursConsumed !== null)} hint="From the signed resource assignments and the latest consumption record. These drive the KPI tiles, burndown and weekly pace. The entitlement value and start date are on the Engagement step.">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Entitled hours">{numberInput(report.entitlement.hours, value => setEntitlement({ hours: value }))}</Field>
              <Field label="Hours consumed">{numberInput(report.entitlement.hoursConsumed, value => setEntitlement({ hoursConsumed: value }))}</Field>
              <Field label="Consumed as of">{dateInput(report.entitlement.consumedAsOf, value => setEntitlement({ consumedAsOf: value }))}</Field>
            </div>
          </Section>

          <Section value="heard" title="Customer positions" heading="What we heard, and what we have built to" filled={report.whatWeHeard.length > 0} hint="For each area (goal, build path, storage, networking, DR, add-ons): what the customer said, in their words, and how this plan responds.">
            <RowTable rows={report.whatWeHeard} columns={[{ key: "component", label: "Area", width: "16%", placeholder: "Storage" }, { key: "customerPosition", label: "What the customer said", type: "longtext", placeholder: "Keep the existing array" }, { key: "whereItLands", label: "How the plan responds", type: "longtext", placeholder: "Fibre Channel stays principal storage" }]} blank={{ component: "", customerPosition: "", whereItLands: "" }} addLabel="Add position" onChange={rows => set("whatWeHeard", rows)} />
          </Section>

          <Section value="problems" title="Customer problems" heading="Customer Problems" filled={report.problems.length > 0} hint="The operational problems the customer named, each with what in the plan solves it.">
            <RowTable rows={report.problems} columns={[{ key: "problem", label: "Problem", type: "longtext" }, { key: "addressedBy", label: "Solved by", type: "longtext" }]} blank={{ problem: "", addressedBy: "" }} addLabel="Add problem" onChange={rows => set("problems", rows)} />
          </Section>

          <Section value="questions" title="Open questions" heading="Open Questions" filled={report.openQuestions.length > 0} hint="Scope decisions still open, and why the answer is needed now.">
            <RowTable rows={report.openQuestions} columns={[{ key: "question", label: "Question", type: "longtext" }, { key: "whyNow", label: "Why it matters now", type: "longtext" }]} blank={{ question: "", whyNow: "" }} addLabel="Add question" onChange={rows => set("openQuestions", rows)} />
          </Section>

          <Section value="people" title="People by work stream" heading="Target Personnel by Work Stream" filled={report.personnel.some(item => item.cdw.length || item.customer.length)} hint="The work streams come from the scoped hours. Override a row to add names (comma separated). Work streams with nobody named are left out, and the section is left out until someone is named.">
            <RowTable rows={report.personnel} columns={[{ key: "workstream", label: "Work stream", width: "28%" }, { key: "cdw", label: "CDW", type: "list" }, { key: "broadcom", label: "Broadcom", type: "list" }, { key: "customer", label: "Customer", type: "list" }]} blank={{ workstream: "", cdw: [], broadcom: [], customer: [] }} addLabel="Add work stream" onChange={rows => set("personnel", rows)} generated={generatedFor("personnel")} />
          </Section>

          <Section value="milestones" title="Milestones to date" heading="Engagement Milestones to Date" filled={report.milestonesToDate.length > 0} hint="What has already happened, with dates: discovery sessions, assessment delivered, kickoff.">
            <RowTable rows={report.milestonesToDate} columns={[{ key: "date", label: "Date", type: "date", width: "16%" }, { key: "event", label: "Event", width: "28%" }, { key: "detail", label: "Detail" }]} blank={{ date: "", event: "", detail: "" }} addLabel="Add milestone" onChange={rows => set("milestonesToDate", rows)} generated={generatedFor("milestonesToDate")} />
          </Section>

          <Section value="open-items" title="Open items" heading="Open Items" filled={report.openItems.length > 0} hint="Everything still outstanding, what it holds up, and who owns it.">
            <RowTable rows={report.openItems} columns={[{ key: "item", label: "Item", type: "longtext" }, { key: "gates", label: "Holds up" }, { key: "owner", label: "Owner", width: "20%" }]} blank={{ item: "", gates: "", owner: "" }} addLabel="Add open item" onChange={rows => set("openItems", rows)} generated={generatedFor("openItems")} />
          </Section>

          <Section value="cover" title="Cover headline" filled={Boolean(report.headline)} hint={'One line that starts "Amazing happens when" and states the customer\'s outcome in their terms.'}>
            {textInput(report.headline, value => set("headline", value), generated.headline)}
          </Section>
        </Accordion>
      </Group>

      <Group title="Generated from the plan" description="Already filled in from the plan, RVTools and the entitlement. Review it; add rows, override, or hide as needed.">
        <Accordion type="multiple" className="border-t border-s100">
          <Section value="situation" title="Situation" heading="Situation" hint="Estate facts from RVTools, plus anything RVTools cannot show (new sites, refreshes, deadlines).">
            <TextList items={report.situation} onChange={items => set("situation", items)} placeholder="DR site being built: 8 new hosts and a replicated array" generated={generatedFor("situation")} />
          </Section>

          <Section value="profile" title="Design profile" heading="VCF Design Profile" hint="The grey text is generated from the plan and prints as shown. Type to replace it; clear the field to go back to the generated text.">
            <div className="grid gap-3 md:grid-cols-2">
              {([["consumption", "Consumption"], ["physicalSite", "Physical site configuration"], ["availability", "Availability"], ["isolation", "Isolation"], ["recoverability", "Recoverability"], ["expansion", "Expansion"]] as const).map(([key, label]) => (
                <Field key={key} label={label}><Textarea className="min-h-16 bg-white text-xs" value={report.designProfile[key] ?? ""} placeholder={generated.designProfile[key]} onChange={event => set("designProfile", { ...report.designProfile, [key]: event.target.value || null })} /></Field>
              ))}
            </div>
          </Section>

          <Section value="elements" title="Design elements" heading="Design Elements — Requirements & Recommendations" hint="Per component: the requirement, the recommendation, and a gate when something must happen first. A row you add with the same component replaces the generated one.">
            <RowTable rows={report.designElements} columns={[{ key: "component", label: "Component", width: "16%" }, { key: "requirement", label: "Requirement", type: "longtext" }, { key: "recommendation", label: "Recommendation", type: "longtext" }, { key: "gate", label: "Gate", width: "18%" }]} blank={{ component: "", requirement: "", recommendation: "", gate: null }} addLabel="Add design element" onChange={rows => set("designElements", rows)} generated={generatedFor("designElements")} />
          </Section>

          <Section value="technical" title="Technical items to confirm" heading="The technical items to confirm early" hint="Version minimums and platform constraints, with the VCF documentation reference.">
            <RowTable rows={report.technicalItems} columns={[{ key: "item", label: "Item", type: "longtext" }, { key: "reference", label: "Reference", width: "35%" }]} blank={{ item: "", reference: "" }} addLabel="Add item" onChange={rows => set("technicalItems", rows)} generated={generatedFor("technicalItems")} />
          </Section>

          <Section value="constraints" title="Sequencing constraints" heading="Sequencing Constraints" hint="What forces the order of work. Platform and entitlement constraints come from the plan; add calendar constraints such as site dates or change freezes.">
            <RowTable rows={report.constraints} columns={[{ key: "constraint", label: "Constraint", type: "longtext" }, { key: "imposedBy", label: "Imposed by", width: "18%" }, { key: "effect", label: "Effect on the order", type: "longtext" }]} blank={{ constraint: "", imposedBy: "", effect: "" }} addLabel="Add constraint" onChange={rows => set("constraints", rows)} generated={generatedFor("constraints")} />
          </Section>

          <Section value="asks" title="Asks of the customer's team" heading="Customer Team Commitments" hint="The effort range comes from the customer effort estimate; add decisions, access and remediation the customer owns.">
            <TextList items={report.customerAsks} onChange={items => set("customerAsks", items)} placeholder="Decisions by November: hosts for the build, DR policy direction" generated={generatedFor("customerAsks")} />
          </Section>

          <Section value="customer-work" title="Customer-owned work" hint="Work the customer's team runs themselves, drawn as grey lanes on the timeline (for example the remaining migration waves after the proving wave).">
            <RowTable rows={report.customerOwnedWork} columns={[{ key: "label", label: "Work", width: "50%" }, { key: "start", label: "Start month", type: "month" }, { key: "end", label: "End month", type: "month" }]} blank={{ label: "", start: "", end: "" }} addLabel="Add work" onChange={rows => set("customerOwnedWork", rows)} generated={generatedFor("customerOwnedWork")} />
          </Section>
        </Accordion>
      </Group>

      <Group title="Estate, discovery and details" description="Optional. Each answer is used only where this plan makes it matter: in the design elements, constraints and open items of the report, and in the Technical Handoff for the delivery team.">
        <Accordion type="multiple" className="border-t border-s100">
          <Section value="sizing" title="Sizing inputs" hint="Used for the hours estimate. Blank values fall back to RVTools.">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Prior VCF assessment delivered" hint="Yes leaves design discovery out of the hours."><YesNo value={report.discovery.assessmentCompleted} onChange={value => setDiscovery({ assessmentCompleted: value })} /></Field>
              <Field label="ESX hosts">{numberInput(report.discovery.esxHosts, value => setDiscovery({ esxHosts: value }), document.inventory.hosts ? `${document.inventory.hosts} from RVTools` : "")}</Field>
              <Field label="Data centers">{numberInput(report.discovery.datacenters, value => setDiscovery({ datacenters: value }), document.inventory.datacenters ? `${document.inventory.datacenters} from RVTools` : "")}</Field>
              <Field label="vCenters" hint="Import paths scope one import per vCenter.">{numberInput(report.discovery.vcenters, value => setDiscovery({ vcenters: value }))}</Field>
              <Field label="VCF instances to deploy">{numberInput(report.discovery.vcfInstances, value => setDiscovery({ vcfInstances: value }), "1")}</Field>
              <Field label="Edge sites" hint="Adds an edge-site design element.">{numberInput(report.discovery.edgeSites, value => setDiscovery({ edgeSites: value }))}</Field>
            </div>
          </Section>

          <Section value="environment" title="Current environment" hint="What is running today. Feeds design elements where the plan touches it, and the delivery briefing in the Technical Handoff.">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Current platform">{textInput(report.discovery.currentPlatform, value => setDiscovery({ currentPlatform: value }), "vSphere 7.0 U3, vCenter 7")}</Field>
              <Field label="Enhanced Linked Mode" hint="On a convergence path, adds the split as a constraint."><YesNo value={report.discovery.enhancedLinkedMode} onChange={value => setDiscovery({ enhancedLinkedMode: value })} /></Field>
              <Field label="Server vendor" hint="Sets the vLCM vendor add-on when the plan builds.">{textInput(report.discovery.serverVendor, value => setDiscovery({ serverVendor: value }), "Dell")}</Field>
              <Field label="Storage">{textInput(report.discovery.storage, value => setDiscovery({ storage: value }), "Pure FlashArray over FC")}</Field>
              <Field label="Networking">{textInput(report.discovery.networking, value => setDiscovery({ networking: value }), "Cisco Nexus, VLAN-backed")}</Field>
              <Field label="Jumbo frames" hint="With overlay networking in scope, changes the MTU gate. Mixed when some switches run them and others do not.">
                <Select value={report.discovery.jumboFrames === null ? "unknown" : report.discovery.jumboFrames === "mixed" ? "mixed" : report.discovery.jumboFrames ? "yes" : "no"} onValueChange={next => setDiscovery({ jumboFrames: next === "unknown" ? null : next === "mixed" ? "mixed" : next === "yes" })}>
                  <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="unknown">Not confirmed</SelectItem><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem><SelectItem value="mixed">Mixed</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="Backup" hint="When workloads move, adds a backup support gate.">{textInput(report.discovery.backup, value => setDiscovery({ backup: value }), "Veeam")}</Field>
              <Field label="Disaster recovery" hint="With resilience in scope, adds a DR design element.">{textInput(report.discovery.drSolution, value => setDiscovery({ drSolution: value }), "Zerto")}</Field>
              <Field label="Security tooling" hint="With security in scope, adds a design element.">{textInput(report.discovery.securityTooling, value => setDiscovery({ securityTooling: value }), "CrowdStrike, Palo Alto")}</Field>
              <Field label="Container platform" hint="With Kubernetes in scope, adds a design element.">{textInput(report.discovery.containerPlatform, value => setDiscovery({ containerPlatform: value }), "OpenShift")}</Field>
              <Field label="Public cloud (comma separated)"><Input className="bg-white" value={listToText(report.discovery.hyperscalers)} onChange={event => setDiscovery({ hyperscalers: textToList(event.target.value) })} /></Field>
            </div>
          </Section>

          <Section value="licensing" title="Licensing" hint="Licensed cores are compared with what the hosts require; a renewal date becomes a sequencing constraint; purchased add-ons outside the plan become open items.">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="VCF licensed"><YesNo value={report.discovery.vcfLicensed} onChange={value => setDiscovery({ vcfLicensed: value })} /></Field>
              <Field label="Licensed VCF cores">{numberInput(report.discovery.licensedCores, value => setDiscovery({ licensedCores: value }))}</Field>
              <Field label="Subscription renewal">{dateInput(report.discovery.renewalDate, value => setDiscovery({ renewalDate: value }))}</Field>
              <Field label="Add-ons purchased (comma separated)"><Input className="bg-white" value={listToText(report.discovery.addOnsPurchased)} placeholder="VCF Operations for networks, vDefend" onChange={event => setDiscovery({ addOnsPurchased: textToList(event.target.value) })} /></Field>
              <Field label="Not requested (comma separated)" hint="Shown where a category has no work, e.g. Kubernetes, Private AI."><Input className="bg-white" value={listToText(report.declined)} onChange={event => set("declined", textToList(event.target.value))} /></Field>
            </div>
          </Section>

          <Section value="assignments" title="Signed resource assignments" heading="Scoped Effort" hint={`Once the resource assignments are signed, enter the hours here; they replace the hours calculated from the plan. Total entered: ${report.resourceAssignments.reduce((total, row) => total + row.architect + row.srConsultant + row.projectManager, 0)} hours.`}>
            <RowTable rows={report.resourceAssignments} columns={[{ key: "workstream", label: "Work stream", width: "40%" }, { key: "architect", label: "Architect", type: "number" }, { key: "srConsultant", label: "Sr. Consultant", type: "number" }, { key: "projectManager", label: "Sr. Project Manager", type: "number" }, { key: "seniorArchitect", label: "Sr. Architect", type: "number" }, { key: "offshoreProjectManager", label: "Offshore PM", type: "number" }]} blank={{ workstream: "", architect: 0, srConsultant: 0, projectManager: 0, seniorArchitect: 0, offshoreProjectManager: 0 }} addLabel="Add work stream" onChange={rows => set("resourceAssignments", rows)} />
          </Section>

          <Section value="details" title="Revision and sources" hint="The revision note and the documents cited in the footer. The delivery model appears in the title band.">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Delivery model">{textInput(report.deliveryModel, value => set("deliveryModel", value), "CDW")}</Field>
              <Field label="Content current as of">{dateInput(report.asOf, value => set("asOf", value))}</Field>
              <Field label="Revision note">{textInput(report.revision, value => set("revision", value), "What this revision was built from")}</Field>
            </div>
            <div className="mt-3">
              <RowTable rows={report.sources.map(source => ({ ...source, date: source.date ?? "" }))} columns={[{ key: "title", label: "Source document", width: "70%" }, { key: "date", label: "Date", type: "date" }]} blank={{ title: "", date: "" }} addLabel="Add source" onChange={rows => set("sources", rows.map(row => ({ title: row.title, date: row.date || null })))} />
            </div>
          </Section>
        </Accordion>
      </Group>
    </section>
  );
}
