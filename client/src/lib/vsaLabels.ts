import { GATE_DATES, type TrackerPatch } from "@shared/vsaFields";

export const ENUM_LABELS = {
  segment: { corporate: "Corporate", strategic: "Strategic", commercial: "Commercial" },
  program: { entitlement: "Entitlement", extended_expert: "Extended Expert", bsas: "BSAS", cash_sow: "Cash SOW", government_entitlement: "Government: Entitlement", government_bsas: "Government BSAS" },
  region: { west: "West", east: "East" },
  entitlementInterest: { interested: "Interested, pursuing VCF", not_interested: "Not interested", pending: "Pending response" },
  waitingOn: { sales: "Sales", customer: "Customer", broadcom: "Broadcom", cdw_internal: "CDW internal" },
  health: { green: "Green", yellow: "Yellow", red: "Red" },
  riskAssessment: { not_submitted: "Not submitted", submitted: "Submitted", standard_terms_acknowledged: "Standard terms acknowledged", not_applicable: "Not applicable" },
  raStatus: { not_needed: "No RA needed", not_started: "Not started", waiting_from_broadcom: "Waiting on RA from Broadcom", sent_to_broadcom: "RA sent to Broadcom", resources_onboarding: "Resources onboarding", in_flight: "Project in flight", delivery_complete: "Delivery complete", cancelled: "Delivery cancelled" },
} as const;

export type FieldKind = "text" | "textarea" | "date" | "money" | "int" | "bool" | "enum" | "url";
export type EditableField = keyof TrackerPatch;
export type FieldDef = { key: EditableField; label: string; kind: FieldKind; hint?: string; options?: Record<string, string>; required?: boolean };

/** Every directly editable tracker field, grouped as the editor shows them. Stage moves go through Move stage. */
export const FIELD_GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Identity",
    fields: [
      { key: "customerName", label: "Customer name", kind: "text", required: true },
      { key: "opportunityNumber", label: "Opportunity number", kind: "text", hint: "C-OPP- followed by digits" },
      { key: "salesforceCustomerId", label: "Customer ID", kind: "text", hint: "Salesforce account Customer ID" },
      { key: "salesforceOpportunityId", label: "Salesforce opportunity ID", kind: "text" },
      { key: "serNumber", label: "SER number", kind: "text" },
    ],
  },
  {
    title: "Classification",
    fields: [
      { key: "segment", label: "Segment", kind: "enum", options: ENUM_LABELS.segment },
      { key: "program", label: "Program", kind: "enum", options: ENUM_LABELS.program },
      { key: "region", label: "Region", kind: "enum", options: ENUM_LABELS.region },
      { key: "customerState", label: "Customer state", kind: "text" },
      { key: "entitlementInterest", label: "Entitlement interest", kind: "enum", options: ENUM_LABELS.entitlementInterest },
    ],
  },
  {
    title: "Status",
    fields: [
      { key: "health", label: "Project health", kind: "enum", options: ENUM_LABELS.health },
      { key: "waitingOn", label: "Waiting on", kind: "enum", options: ENUM_LABELS.waitingOn },
      { key: "riskAssessment", label: "CDW risk assessment", kind: "enum", options: ENUM_LABELS.riskAssessment },
      { key: "raStatus", label: "Resource assignment", kind: "enum", options: ENUM_LABELS.raStatus },
      { key: "vcfAssessment", label: "VCF assessment done", kind: "bool" },
    ],
  },
  {
    title: "Gate dates",
    // Labels here are the defaults; screens show the admin's labels from useOperationalSettings().gateLabels.
    fields: GATE_DATES.map(gate => ({ key: gate.key, label: gate.label, kind: "date" as const, ...("hint" in gate ? { hint: gate.hint } : {}) })),
  },
  {
    title: "Commercials and term",
    fields: [
      { key: "entitlementValue", label: "VSA amount", kind: "money" },
      { key: "estimatedDealValue", label: "Estimated deal value", kind: "money" },
      { key: "broadcomPo", label: "Broadcom PO number", kind: "text" },
      { key: "termStart", label: "Term start", kind: "date" },
      { key: "termEnd", label: "Term end", kind: "date" },
      { key: "deliveryWindowEnd", label: "VSA expiration", kind: "date", hint: "End of the delivery window" },
      { key: "coreCount", label: "Licensed cores", kind: "int" },
    ],
  },
  {
    title: "Notes and links",
    fields: [
      { key: "nextSteps", label: "Next steps", kind: "textarea" },
      { key: "statusNotes", label: "Project status notes", kind: "textarea" },
      { key: "clientFolderUrl", label: "Client folder link", kind: "url", hint: "https:// link to the SharePoint folder" },
    ],
  },
];

export const ROLE_LABELS: Record<string, string> = { sales_rep: "Sales rep", account_manager: "Account manager", presales: "Presales", architect: "Architect", pm: "PM", sr_consultant: "Sr. consultant", broadcom_ad: "Broadcom AD" };

export const SOURCE_KIND_LABELS: Record<string, string> = { rvtools: "RVTools export", discovery_notes: "Discovery notes", customer_brief: "Customer brief", hardware_review: "Hardware review", hours_source: "Hours source", broadcom_ser: "Broadcom SER", other: "Other" };
export const SOURCE_STATUS_LABELS: Record<string, string> = { needed: "Needed", requested: "Requested", received: "Received", verified: "Verified", waived: "Waived" };
