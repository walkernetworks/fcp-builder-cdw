import { withFieldPatch } from "@/lib/fieldPatch";
import type { AdoptionDetails, Capability, EngagementDocument } from "@shared/fcp";

/** Where each capability keeps its focus selections in `adoptionDetails`. */
export const FOCUS_KEY: Record<Capability, "operations" | "automation" | "networking" | "security" | "resilience" | "kubernetes" | "privateAi"> = {
  operations: "operations",
  automation: "automation",
  networking: "networking",
  security: "security",
  resilience: "resilience",
  kubernetes: "kubernetes",
  "private-ai": "privateAi",
};

const sameName = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

export const focusesOf = (document: EngagementDocument, capability: Capability): string[] => document.fields.adoptionDetails[FOCUS_KEY[capability]] as string[];

/** In scope as the plan generator sees it: a priority, or any focus selected under it. */
export const isInScope = (document: EngagementDocument, capability: Capability) => document.fields.priorities.includes(capability) || focusesOf(document, capability).length > 0;

export const isDeclined = (document: EngagementDocument, name: string) => document.report.declined.some(item => sameName(item, name));

/**
 * Turns a capability card on or off. Off removes the priority and its focuses, so the generator no longer counts it.
 * On withdraws a "not requested" note for the card; off never adds one, which only a person's click does.
 */
export function setCapabilityInScope(document: EngagementDocument, capability: Capability, name: string, on: boolean): EngagementDocument {
  const { priorities, adoptionDetails } = document.fields;
  const next = withFieldPatch(document, {
    priorities: on ? Array.from(new Set([...priorities, capability])) : priorities.filter(item => item !== capability),
    adoptionDetails: on ? adoptionDetails : ({ ...adoptionDetails, [FOCUS_KEY[capability]]: [] } as AdoptionDetails),
  });
  return on && isDeclined(next, name) ? { ...next, report: { ...next.report, declined: next.report.declined.filter(item => !sameName(item, name)) } } : next;
}

/** Selects or clears one focus; selecting one also makes the capability a priority. */
export function setFocus(document: EngagementDocument, capability: Capability, value: string, checked: boolean): EngagementDocument {
  const { priorities, adoptionDetails } = document.fields;
  const selected = focusesOf(document, capability);
  return withFieldPatch(document, {
    priorities: priorities.includes(capability) || !checked ? priorities : [...priorities, capability],
    adoptionDetails: { ...adoptionDetails, [FOCUS_KEY[capability]]: checked ? Array.from(new Set([...selected, value])) : selected.filter(item => item !== value) } as AdoptionDetails,
  });
}

/** Adds or removes a "not requested" note, which the FCP prints when a category has no work. */
export function setDeclined(document: EngagementDocument, name: string, on: boolean): EngagementDocument {
  const rest = document.report.declined.filter(item => !sameName(item, name));
  return { ...document, report: { ...document.report, declined: on ? [...rest, name] : rest } };
}
