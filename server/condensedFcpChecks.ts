import { FIXED_GANTT_CATEGORIES } from "../shared/fcp";

/**
 * Content gates for the Condensed FCP, after the fcp-builder skill's check_fcp.py. Every failure blocks
 * the export: the document is customer-facing and is forwarded as-is.
 */

// Internal commercial, classification, and burndown terms that must never reach the page.
const SCRUB = [
  "DRAFT", "rate card", "hourly rate", "blended rate", "BCSegment", "Corporate segment", "Strategic segment", "Commercial segment",
  "pending Broadcom approval", "awaiting staffing", "NextSteps", "ProjectStatusNotes", "Expect PO Value", "PO Value", "Work Authorization #",
  "AT RISK", "catch-up pace", "catch up pace", "risk band", "gap points", "pace gap", "shortfall", "headroom", "funded hours", "unfunded",
];
// Design-led framing: never a readiness exercise.
const VOCABULARY = /\b(readiness|workshops?|TRW)\b/i;
// Sections with no captured content are left out, so only the sections the app always writes are mandatory.
const REQUIRED = ["Executive Summary", "Scoped Effort", "Adoption Plan &amp; Recommendation", ">Summary</h3>"];
const INTERNAL_PATHS = ["/Users/", "/home/", "drive_1", "sharepoint", "localhost", "127.0.0.1"];

function visibleText(html: string): string {
  return html
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

function numberCell(cell: string): number | null {
  const text = cell.replace(/<[^>]+>/g, "").replace(/,/g, "").trim();
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}

/** Tables marked data-foot="sum" must foot: every numeric column of the last row equals the sum above it. */
function footingFailures(html: string): string[] {
  const failures: string[] = [];
  for (const match of Array.from(html.matchAll(/<table data-foot="sum">([\s\S]*?)<\/table>/g))) {
    const body = match[1].split("<tbody>")[1] ?? "";
    const rows = Array.from(body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g), (row: RegExpMatchArray) => Array.from(row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g), (cell: RegExpMatchArray) => cell[1]));
    const total = rows.pop();
    if (!total) continue;
    total.forEach((cell, index) => {
      const expected = numberCell(cell);
      if (expected === null) return;
      const sum = rows.reduce((acc, row) => acc + (numberCell(row[index] ?? "") ?? 0), 0);
      if (Math.abs(sum - expected) > 0.5) failures.push(`A table column does not foot: column ${index + 1} totals ${expected} but its rows sum to ${sum}.`);
    });
  }
  return failures;
}

export function checkCondensedFcp(html: string, context: { customerName: string; entitlementValue: number }): string[] {
  const failures: string[] = [];
  const text = visibleText(html);

  for (const term of SCRUB) {
    // Upper-case markers match exactly so ordinary words ("drafted", "at risk of") are not flagged.
    const found = term === term.toUpperCase() ? text.includes(term) : text.toLowerCase().includes(term.toLowerCase());
    if (found) failures.push(`Internal term on the page: "${term}".`);
  }
  const vocabulary = VOCABULARY.exec(text);
  if (vocabulary) failures.push(`Banned framing on the page: "${vocabulary[0]}". Describe the work in design terms.`);
  for (const path of INTERNAL_PATHS) if (html.includes(path)) failures.push(`Internal path or host in the document: "${path}".`);

  const dollars = new Set(Array.from(text.matchAll(/\$[\d,]+(?:\.\d{2})?/g), match => match[0].replace(/[.,]+$/, "")));
  if (dollars.size > 1) failures.push(`More than one dollar figure on the page: ${Array.from(dollars).join(", ")}.`);
  if (dollars.size === 1 && context.entitlementValue > 0) {
    const expected = `$${Math.round(context.entitlementValue).toLocaleString("en-US")}`;
    if (!dollars.has(expected)) failures.push(`The only dollar figure must be the entitlement value (${expected}).`);
  }

  for (const category of FIXED_GANTT_CATEGORIES) {
    if (!html.includes(`<div class="timeline-lane timeline-category-lane"><strong>${category.replace(/&/g, "&amp;")}</strong></div>`)) failures.push(`Category missing from the timeline: ${category}.`);
  }
  for (const heading of REQUIRED) if (!html.includes(heading)) failures.push(`Mandatory section missing: ${heading.replace("&amp;", "&").replace(/<[^>]*>|^>/g, "")}.`);
  if (!/For customer review · /.test(text)) failures.push("Missing the \"For customer review\" stamp.");
  if ((html.match(/Print \/ Save as PDF/g) || []).length !== 1) failures.push("The document must have exactly one Print / Save as PDF button.");
  if (context.customerName && !text.includes(context.customerName)) failures.push("The customer name does not appear on the page.");
  if (/<(script|link)\b[^>]*\b(src|href)=/i.test(html)) failures.push("The document loads an external script or stylesheet.");
  failures.push(...footingFailures(html));
  return failures;
}
