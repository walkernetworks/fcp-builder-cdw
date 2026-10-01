import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EngagementDocument } from "@shared/fcp";
import type { ReportContent } from "@shared/report";
import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

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
  return <div className="space-y-1"><Label className="text-xs font-semibold text-slate-700">{label}</Label>{children}{hint && <p className="text-[11px] leading-4 text-slate-500">{hint}</p>}</div>;
}

function YesNo({ value, onChange }: { value: boolean | null; onChange: (value: boolean | null) => void }) {
  return (
    <Select value={value === null ? "unknown" : value ? "yes" : "no"} onValueChange={next => onChange(next === "unknown" ? null : next === "yes")}>
      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="unknown">Not confirmed</SelectItem><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
    </Select>
  );
}

/** A list of free-text lines (situation bullets, customer asks). */
function TextList({ items, onChange, placeholder }: { items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex gap-2">
          <Input className="bg-white" value={item} placeholder={placeholder} onChange={event => onChange(items.map((current, position) => (position === index ? event.target.value : current)))} />
          <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => onChange(items.filter((_, position) => position !== index))}><Trash2 className="size-4" /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ""])}><Plus className="size-4" /> Add line</Button>
    </div>
  );
}

/** An editable table of rows with add and remove. */
function RowTable<Row extends Record<string, unknown>>({ rows, columns, blank, onChange, addLabel }: { rows: Row[]; columns: Array<Column<Row>>; blank: Row; onChange: (rows: Row[]) => void; addLabel: string }) {
  const update = (index: number, key: keyof Row, value: unknown) => onChange(rows.map((row, position) => (position === index ? { ...row, [key]: value } : row)));
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
  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1 text-xs">
            <thead><tr>{columns.map(column => <th key={column.key} className="px-1 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500" style={{ width: column.width }}>{column.label}</th>)}<th className="w-10" /></tr></thead>
            <tbody>
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
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { ...blank }])}><Plus className="size-4" /> {addLabel}</Button>
    </div>
  );
}

function Section({ value, title, count, hint, children }: { value: string; title: string; count?: number; hint: string; children: ReactNode }) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="text-sm font-semibold">
        <span className="flex items-center gap-2">{title}{count !== undefined && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${count ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{count ? count : "empty"}</span>}</span>
      </AccordionTrigger>
      <AccordionContent><p className="pb-3 text-xs leading-5 text-slate-500">{hint}</p><div className="pb-4">{children}</div></AccordionContent>
    </AccordionItem>
  );
}

/** Every Condensed FCP section as a form, so the report can be completed by hand with or without a Copilot brief. */
export function ReportContentEditor({ document, onChange }: Props) {
  const report = document.report;
  const set = <K extends keyof ReportContent>(key: K, value: ReportContent[K]) => onChange({ ...document, report: { ...report, [key]: value } });
  const setEntitlement = (patch: Partial<ReportContent["entitlement"]>) => set("entitlement", { ...report.entitlement, ...patch });
  const setDiscovery = (patch: Partial<ReportContent["discovery"]>) => set("discovery", { ...report.discovery, ...patch });
  const setProfile = (patch: Partial<ReportContent["designProfile"]>) => set("designProfile", { ...report.designProfile, ...patch });
  const discovery = report.discovery;
  const textInput = (value: string | null, onValue: (value: string | null) => void, placeholder = "") => <Input className="bg-white" value={value ?? ""} placeholder={placeholder} onChange={event => onValue(event.target.value === "" ? null : event.target.value)} />;
  const numberInput = (value: number | null, onValue: (value: number | null) => void) => <Input className="bg-white" type="number" min={0} value={value ?? ""} onChange={event => onValue(numberOrNull(event.target.value))} />;
  const dateInput = (value: string | null, onValue: (value: string | null) => void) => <Input className="bg-white" type="date" value={value ?? ""} onChange={event => onValue(event.target.value || null)} />;
  const assignmentTotal = report.resourceAssignments.reduce((total, row) => total + row.architect + row.srConsultant + row.projectManager, 0);

  return (
    <section className="border border-slate-200 bg-white p-5">
      <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#c8102e]">Condensed FCP content</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">Report content</h3>
      <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Everything the Condensed FCP needs beyond the plan. Fill it in by hand, or import a Copilot brief above to pre-fill it and then correct anything here. Changes save automatically; rows left incomplete are not shown in the report.</p>

      <Accordion type="multiple" defaultValue={["cover", "entitlement"]} className="mt-4 border-t border-slate-200">
        <Section value="cover" title="Cover and delivery" hint="The cover line, the delivery model shown in the title band, the date the content is current to, and the revision note.">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Cover headline" hint={'Starts "Amazing happens when" and states the customer\'s outcome.'}>{textInput(report.headline, value => set("headline", value), "Amazing happens when …")}</Field>
            <Field label="Delivery model">{textInput(report.deliveryModel, value => set("deliveryModel", value), "CDW + Broadcom")}</Field>
            <Field label="Content current as of">{dateInput(report.asOf, value => set("asOf", value))}</Field>
            <Field label="Revision note" hint="What this revision was built from and the newest source date.">{textInput(report.revision, value => set("revision", value))}</Field>
          </div>
        </Section>

        <Section value="entitlement" title="Entitlement hours and consumption" count={report.entitlement.hours ? 1 : 0} hint="The entitlement value and start date are on the Engagement step. Entitled hours come from the signed resource assignments; consumed hours from the latest consumption record. These drive the KPI tiles, burndown and pace.">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Entitled hours">{numberInput(report.entitlement.hours, value => setEntitlement({ hours: value }))}</Field>
            <Field label="Hours consumed">{numberInput(report.entitlement.hoursConsumed, value => setEntitlement({ hoursConsumed: value }))}</Field>
            <Field label="Consumed as of">{dateInput(report.entitlement.consumedAsOf, value => setEntitlement({ consumedAsOf: value }))}</Field>
            <Field label="Term start (if different)" hint="Leave blank to use the engagement's entitlement start.">{dateInput(report.entitlement.termStart, value => setEntitlement({ termStart: value }))}</Field>
            <Field label="Term end (if different)" hint="Leave blank to use start + 12 months.">{dateInput(report.entitlement.termEnd, value => setEntitlement({ termEnd: value }))}</Field>
            <div />
            <Field label="Approved extension to" hint="Only an approved extension moves the expiry.">{dateInput(report.entitlement.extensionTo, value => setEntitlement({ extensionTo: value }))}</Field>
            <Field label="Extension approved by" hint="Required with the extension date.">{textInput(report.entitlement.extensionApprovedBy, value => setEntitlement({ extensionApprovedBy: value }))}</Field>
          </div>
        </Section>

        <Section value="discovery" title="Discovery answers" hint="Questionnaire answers that RVTools cannot show. Host and site counts here are used for sizing when no RVTools export is loaded.">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Prior VCF assessment delivered" hint="Yes skips design discovery in the hours."><YesNo value={discovery.assessmentCompleted} onChange={value => setDiscovery({ assessmentCompleted: value })} /></Field>
            <Field label="VCF licensed"><YesNo value={discovery.vcfLicensed} onChange={value => setDiscovery({ vcfLicensed: value })} /></Field>
            <Field label="Enhanced Linked Mode in use"><YesNo value={discovery.enhancedLinkedMode} onChange={value => setDiscovery({ enhancedLinkedMode: value })} /></Field>
            <Field label="Current VMware core count">{numberInput(discovery.coreCount, value => setDiscovery({ coreCount: value }))}</Field>
            <Field label="Licensed VCF cores">{numberInput(discovery.licensedCores, value => setDiscovery({ licensedCores: value }))}</Field>
            <Field label="Renewal date">{dateInput(discovery.renewalDate, value => setDiscovery({ renewalDate: value }))}</Field>
            <Field label="Current platform and version">{textInput(discovery.currentPlatform, value => setDiscovery({ currentPlatform: value }), "vSphere 8.0.3")}</Field>
            <Field label="Networking (NSX, vDS, combination)">{textInput(discovery.networking, value => setDiscovery({ networking: value }))}</Field>
            <Field label="Jumbo frames enabled"><YesNo value={discovery.jumboFrames} onChange={value => setDiscovery({ jumboFrames: value })} /></Field>
            <Field label="vCenters">{numberInput(discovery.vcenters, value => setDiscovery({ vcenters: value }))}</Field>
            <Field label="Data centers">{numberInput(discovery.datacenters, value => setDiscovery({ datacenters: value }))}</Field>
            <Field label="Edge sites">{numberInput(discovery.edgeSites, value => setDiscovery({ edgeSites: value }))}</Field>
            <Field label="ESX hosts">{numberInput(discovery.esxHosts, value => setDiscovery({ esxHosts: value }))}</Field>
            <Field label="VCF instances to deploy" hint="Blank means one.">{numberInput(discovery.vcfInstances, value => setDiscovery({ vcfInstances: value }))}</Field>
            <Field label="Storage">{textInput(discovery.storage, value => setDiscovery({ storage: value }), "vSAN, FC, NFS, iSCSI")}</Field>
            <Field label="Server hardware vendor">{textInput(discovery.serverVendor, value => setDiscovery({ serverVendor: value }))}</Field>
            <Field label="Container platform">{textInput(discovery.containerPlatform, value => setDiscovery({ containerPlatform: value }))}</Field>
            <Field label="Security tooling">{textInput(discovery.securityTooling, value => setDiscovery({ securityTooling: value }))}</Field>
            <Field label="DR solution">{textInput(discovery.drSolution, value => setDiscovery({ drSolution: value }))}</Field>
            <Field label="Backup solution">{textInput(discovery.backup, value => setDiscovery({ backup: value }))}</Field>
            <Field label="Hyperscalers (comma separated)"><Input className="bg-white" value={listToText(discovery.hyperscalers)} onChange={event => setDiscovery({ hyperscalers: textToList(event.target.value) })} /></Field>
            <Field label="Add-ons already purchased (comma separated)"><Input className="bg-white" value={listToText(discovery.addOnsPurchased)} onChange={event => setDiscovery({ addOnsPurchased: textToList(event.target.value) })} /></Field>
            <Field label="Not requested (comma separated)" hint="Shown where a category has no work, e.g. Kubernetes, Private AI."><Input className="bg-white" value={listToText(report.declined)} onChange={event => set("declined", textToList(event.target.value))} /></Field>
          </div>
        </Section>

        <Section value="situation" title="Situation" count={report.situation.length} hint="Facts about the estate and context that RVTools cannot show. RVTools facts (hosts, VMs, versions, VM hardware) are added automatically.">
          <TextList items={report.situation} onChange={items => set("situation", items)} placeholder="DR site being built: 8 new hosts and a replicated array" />
        </Section>

        <Section value="contacts" title="Contacts" count={report.contacts.customer.length + report.contacts.cdw.length + report.contacts.broadcom.length} hint="People involved on each side, with roles.">
          {(["customer", "cdw", "broadcom"] as const).map(side => (
            <div key={side} className="mb-3">
              <p className="mb-1 text-xs font-semibold text-slate-700">{side === "customer" ? document.fields.customerName || "Customer" : side === "cdw" ? "CDW" : "Broadcom"}</p>
              <RowTable rows={report.contacts[side]} columns={[{ key: "name", label: "Name" }, { key: "role", label: "Role" }]} blank={{ name: "", role: "" }} addLabel="Add contact" onChange={rows => set("contacts", { ...report.contacts, [side]: rows })} />
            </div>
          ))}
        </Section>

        <Section value="personnel" title="Target personnel by work stream" count={report.personnel.length} hint="Named people per work stream. Names are comma separated; empty cells show as 'to be named'.">
          <RowTable rows={report.personnel} columns={[{ key: "workstream", label: "Work stream", width: "28%" }, { key: "cdw", label: "CDW", type: "list" }, { key: "broadcom", label: "Broadcom", type: "list" }, { key: "customer", label: "Customer", type: "list" }]} blank={{ workstream: "", cdw: [], broadcom: [], customer: [] }} addLabel="Add work stream" onChange={rows => set("personnel", rows)} />
        </Section>

        <Section value="assignments" title="Resource assignments (signed hours)" count={report.resourceAssignments.length} hint={`When present, these replace the calculated Scoped Effort in the report. Total: ${assignmentTotal} hours. Use "Use calculated hours as assignments" on the Delivery Package to start from the plan.`}>
          <RowTable rows={report.resourceAssignments} columns={[{ key: "workstream", label: "Work stream", width: "40%" }, { key: "architect", label: "Architect", type: "number" }, { key: "srConsultant", label: "Sr. Consultant", type: "number" }, { key: "projectManager", label: "Sr. Project Manager", type: "number" }]} blank={{ workstream: "", architect: 0, srConsultant: 0, projectManager: 0 }} addLabel="Add work stream" onChange={rows => set("resourceAssignments", rows)} />
        </Section>

        <Section value="profile" title="Design profile" count={Object.values(report.designProfile).filter(Boolean).length} hint="One sentence per category. Leave a category blank to use the text generated from the plan.">
          <div className="grid gap-3 md:grid-cols-2">
            {([["consumption", "Consumption"], ["physicalSite", "Physical site configuration"], ["availability", "Availability"], ["isolation", "Isolation"], ["recoverability", "Recoverability"], ["expansion", "Expansion"]] as const).map(([key, label]) => (
              <Field key={key} label={label}><Textarea className="min-h-16 bg-white text-xs" value={report.designProfile[key] ?? ""} placeholder="Generated from the plan when blank" onChange={event => setProfile({ [key]: event.target.value || null })} /></Field>
            ))}
          </div>
        </Section>

        <Section value="elements" title="Design elements" count={report.designElements.length} hint="Per component: the requirement, the recommendation for this customer, and a gate when something must happen first. Storage, networking, licensing and workload items are also generated from the plan unless you add the same component here.">
          <RowTable rows={report.designElements} columns={[{ key: "component", label: "Component", width: "16%" }, { key: "requirement", label: "Requirement", type: "longtext" }, { key: "recommendation", label: "Recommendation", type: "longtext" }, { key: "gate", label: "Gate", width: "18%" }]} blank={{ component: "", requirement: "", recommendation: "", gate: null }} addLabel="Add design element" onChange={rows => set("designElements", rows)} />
        </Section>

        <Section value="heard" title="What we heard, and what we have built to" count={report.whatWeHeard.length} hint="What the customer said about each component, in their words, and where it lands in this plan.">
          <RowTable rows={report.whatWeHeard} columns={[{ key: "component", label: "Component", width: "16%" }, { key: "customerPosition", label: "Customer position", type: "longtext" }, { key: "whereItLands", label: "Where it lands", type: "longtext" }]} blank={{ component: "", customerPosition: "", whereItLands: "" }} addLabel="Add row" onChange={rows => set("whatWeHeard", rows)} />
        </Section>

        <Section value="problems" title="The problems worth solving first" count={report.problems.length} hint="Operational problems the customer named, each with the capability that addresses it.">
          <RowTable rows={report.problems} columns={[{ key: "problem", label: "Problem", type: "longtext" }, { key: "addressedBy", label: "Addressed by", type: "longtext" }]} blank={{ problem: "", addressedBy: "" }} addLabel="Add problem" onChange={rows => set("problems", rows)} />
        </Section>

        <Section value="questions" title="The open questions" count={report.openQuestions.length} hint="Scope decisions still open, with why the answer is needed now.">
          <RowTable rows={report.openQuestions} columns={[{ key: "question", label: "Question", type: "longtext" }, { key: "whyNow", label: "Why we are asking now", type: "longtext" }]} blank={{ question: "", whyNow: "" }} addLabel="Add question" onChange={rows => set("openQuestions", rows)} />
        </Section>

        <Section value="technical" title="The technical items to confirm early" count={report.technicalItems.length} hint="Version minimums and platform constraints, with the VCF documentation reference (part and heading).">
          <RowTable rows={report.technicalItems} columns={[{ key: "item", label: "Item", type: "longtext" }, { key: "reference", label: "Reference", width: "35%" }]} blank={{ item: "", reference: "" }} addLabel="Add item" onChange={rows => set("technicalItems", rows)} />
        </Section>

        <Section value="constraints" title="Why the order is not negotiable" count={report.constraints.length} hint="Calendar or business constraints on the order of work. Platform-imposed constraints are generated from the plan.">
          <RowTable rows={report.constraints} columns={[{ key: "constraint", label: "Constraint", type: "longtext" }, { key: "imposedBy", label: "Imposed by", width: "18%" }, { key: "effect", label: "Effect on the sequence", type: "longtext" }]} blank={{ constraint: "", imposedBy: "", effect: "" }} addLabel="Add constraint" onChange={rows => set("constraints", rows)} />
        </Section>

        <Section value="asks" title="What this asks of the customer's team" count={report.customerAsks.length} hint="Decisions, access and remediation the customer owns. The effort range is added from the customer effort estimate.">
          <TextList items={report.customerAsks} onChange={items => set("customerAsks", items)} placeholder="Decisions by November: hosts for the build, DR policy direction" />
        </Section>

        <Section value="customer-work" title="Customer-owned work" count={report.customerOwnedWork.length} hint="Work the customer's team runs themselves, drawn as grey lanes on the timeline.">
          <RowTable rows={report.customerOwnedWork} columns={[{ key: "label", label: "Work", width: "50%" }, { key: "start", label: "Start month", type: "month" }, { key: "end", label: "End month", type: "month" }]} blank={{ label: "", start: "", end: "" }} addLabel="Add work" onChange={rows => set("customerOwnedWork", rows)} />
        </Section>

        <Section value="open-items" title="Open items" count={report.openItems.length} hint="Everything still outstanding, what it gates, and who owns it.">
          <RowTable rows={report.openItems} columns={[{ key: "item", label: "Item", type: "longtext" }, { key: "gates", label: "What it gates" }, { key: "owner", label: "Owner", width: "20%" }]} blank={{ item: "", gates: "", owner: "" }} addLabel="Add open item" onChange={rows => set("openItems", rows)} />
        </Section>

        <Section value="milestones" title="Engagement milestones to date" count={report.milestonesToDate.length} hint="What has already happened, with dates.">
          <RowTable rows={report.milestonesToDate} columns={[{ key: "date", label: "Date", type: "date", width: "16%" }, { key: "event", label: "Event", width: "28%" }, { key: "detail", label: "Detail" }]} blank={{ date: "", event: "", detail: "" }} addLabel="Add milestone" onChange={rows => set("milestonesToDate", rows)} />
        </Section>

        <Section value="sources" title="Sources" count={report.sources.length} hint="The documents this report was built from, cited in the footer.">
          <RowTable rows={report.sources.map(source => ({ ...source, date: source.date ?? "" }))} columns={[{ key: "title", label: "Document", width: "70%" }, { key: "date", label: "Date", type: "date" }]} blank={{ title: "", date: "" }} addLabel="Add source" onChange={rows => set("sources", rows.map(row => ({ title: row.title, date: row.date || null })))} />
        </Section>
      </Accordion>
    </section>
  );
}
