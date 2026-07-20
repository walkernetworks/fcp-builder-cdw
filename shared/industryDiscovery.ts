import type { IndustryTemplateId } from "./fcp";

export type IndustryDiscoveryQuestion = {
  theme: string;
  question: string;
};

export type IndustryDiscoveryTemplate = {
  id: IndustryTemplateId;
  label: string;
  description: string;
  questions: readonly IndustryDiscoveryQuestion[];
};

export type IndustryDiscoveryReviewItem = IndustryDiscoveryQuestion & {
  id: string;
  ordinal: string;
};

export const industryDiscoveryTemplates = [
  {
    id: "general-enterprise",
    label: "General enterprise",
    description: "A balanced lens for operating model, lifecycle, service delivery, resilience, and application-platform decisions.",
    questions: [
      { theme: "Operating model", question: "Which team will own the platform day to day, and which handoffs create the most operational friction today?" },
      { theme: "Lifecycle", question: "Which upgrade, certificate, password, or configuration activities need a repeatable runbook first?" },
      { theme: "Service delivery", question: "Which infrastructure request is frequent enough to justify a governed catalog or automation pattern?" },
      { theme: "Resilience", question: "Which business services have a confirmed recovery objective or recovery exercise gap?" },
      { theme: "Application platform", question: "Which workload or team would be the best bounded first consumer of a modern platform service?" },
    ],
  },
  {
    id: "healthcare-life-sciences",
    label: "Healthcare and life sciences",
    description: "Guides discussion of multi-site consistency, service continuity, centralized operations, and specialized-workload dependencies.",
    questions: [
      { theme: "Service continuity", question: "Which care, laboratory, imaging, or research-supporting services require the clearest availability and recovery discussion?" },
      { theme: "Multi-site delivery", question: "Which sites need a consistent platform pattern, and where do local operating constraints differ?" },
      { theme: "Integration", question: "Which identity, messaging, data, or specialized application dependencies must be mapped before automation or upgrade work begins?" },
      { theme: "Operations", question: "What should a centralized operations team be able to see, manage, or remediate consistently across locations?" },
      { theme: "Recovery", question: "Which recovery scenarios should be proven in a documented exercise, and who owns the business validation?" },
    ],
  },
  {
    id: "financial-services-insurance",
    label: "Financial services and insurance",
    description: "Guides discussion of secure delivery, change evidence, continuity, identity governance, and risk-supporting workloads.",
    questions: [
      { theme: "Change and evidence", question: "Which platform changes need traceable approvals, operational evidence, or reporting for the customer’s governance process?" },
      { theme: "Identity", question: "Which user, administrator, service-account, or privileged-access flows need to be designed or simplified?" },
      { theme: "Continuity", question: "Which workloads have confirmed continuity, recovery-time, or recovery-point objectives that should drive sequencing?" },
      { theme: "Secure delivery", question: "Which developer or infrastructure delivery paths need stronger repeatability, guardrails, or auditability?" },
      { theme: "Risk workloads", question: "Are there risk, analytics, fraud, or reporting workloads whose platform needs should be explored without committing scope?" },
    ],
  },
  {
    id: "manufacturing-retail-distributed",
    label: "Manufacturing, retail, and distributed operations",
    description: "Guides discussion of location topology, remote operations, service continuity, and standard deployment patterns.",
    questions: [
      { theme: "Locations", question: "Which plants, branches, stores, depots, or remote sites share a platform pattern, and which require local exceptions?" },
      { theme: "Autonomy", question: "What must remain operational locally if central services or connectivity are degraded?" },
      { theme: "Consistency", question: "Which deployment, patching, configuration, or monitoring patterns should be standardized across locations first?" },
      { theme: "Maintenance", question: "Which maintenance windows, production schedules, or business peaks constrain upgrade and lifecycle activities?" },
      { theme: "Integration", question: "Which operational technology, point-of-service, logistics, or enterprise integrations require discovery before changing the platform?" },
    ],
  },
  {
    id: "public-sector-education",
    label: "Public sector and education",
    description: "Guides discussion of service continuity, shared platforms, access governance, delivery capacity, and data boundaries.",
    questions: [
      { theme: "Service priorities", question: "Which citizen, student, research, or shared services need a clearly prioritized continuity and recovery conversation?" },
      { theme: "Shared platform", question: "Which agencies, departments, campuses, or research groups need shared services versus independent operating boundaries?" },
      { theme: "Access", question: "Which access, delegation, or identity-governance decisions are prerequisites for self-service or operational change?" },
      { theme: "Delivery constraints", question: "Which procurement, governance, academic-calendar, or change-management constraints shape realistic execution windows?" },
      { theme: "Data boundaries", question: "Which data residency, classification, or integration boundaries should be discovered before workload onboarding?" },
    ],
  },
  {
    id: "digital-products-technology",
    label: "Digital products and technology",
    description: "Guides discussion of developer experience, infrastructure as code, API services, Kubernetes, and bounded private-AI exploration.",
    questions: [
      { theme: "Developer personas", question: "Which developer or platform-engineering personas should receive a self-service capability first, and what is their current request path?" },
      { theme: "Service design", question: "Which VM, network, namespace, database, or application patterns should become reusable platform services?" },
      { theme: "Delivery integration", question: "Which source-control, pipeline, ticketing, observability, or identity integrations are required for a viable first automation pattern?" },
      { theme: "Kubernetes", question: "Which workload is a bounded candidate for Kubernetes or Supervisor discovery, and what day-two operating model is required?" },
      { theme: "Private AI", question: "Is there a confirmed hypothesis for a private-AI pilot, including data boundary, capacity, guardrails, owner, and success measure?" },
    ],
  },
] as const satisfies readonly IndustryDiscoveryTemplate[];

export function getIndustryDiscoveryTemplate(id: IndustryTemplateId): IndustryDiscoveryTemplate {
  return industryDiscoveryTemplates.find(template => template.id === id) ?? industryDiscoveryTemplates[0];
}

export function getIndustryDiscoveryReviewContent(templateId: IndustryTemplateId): { template: IndustryDiscoveryTemplate; promptItems: IndustryDiscoveryReviewItem[] } {
  const template = getIndustryDiscoveryTemplate(templateId);
  return {
    template,
    promptItems: template.questions.map((item, index) => ({
      id: `${template.id}-${item.theme}`,
      ordinal: String(index + 1).padStart(2, "0"),
      ...item,
    })),
  };
}

export function industryDiscoveryPromptBlock(templateId: IndustryTemplateId): string {
  const template = getIndustryDiscoveryTemplate(templateId);
  const heading = `Discovery prompts to confirm — ${template.label}`;
  const prompts = template.questions.map(({ theme, question }) => `• ${theme}: ${question}`).join("\n");
  return `${heading}\nThese are discussion prompts only. They do not represent confirmed scope or plan commitments.\n${prompts}`;
}

export function appendIndustryDiscoveryPrompts(existingNotes: string, templateId: IndustryTemplateId): string {
  const block = industryDiscoveryPromptBlock(templateId);
  if (existingNotes.includes(block)) return existingNotes;
  return existingNotes.trim() ? `${existingNotes.trim()}\n\n${block}` : block;
}

export function removeIndustryDiscoveryPrompts(existingNotes: string, templateId: IndustryTemplateId): string {
  const block = industryDiscoveryPromptBlock(templateId);
  if (!existingNotes.includes(block)) return existingNotes;
  return existingNotes.replace(block, "").replace(/\n{3,}/g, "\n\n").trim();
}
