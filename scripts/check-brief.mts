/**
 * Checks a Copilot customer brief locally and prints only its shape: which fields and sections are filled,
 * row counts, and what the import and the Condensed FCP content gates would flag. Values are masked, so the
 * output can be shared without customer content.
 *
 *   pnpm brief:check path/to/brief.json
 */
import { readFileSync } from "node:fs";
import { applyCustomerBrief } from "../shared/briefImport";
import { createDefaultDocument, migrateDocument } from "../shared/fcp";
import { checkCondensedFcp } from "../server/condensedFcpChecks";
import { renderCondensedFcpHtml } from "../server/condensedFcpRenderer";
import { scopedEffortForDocument } from "../server/rateCard";

const file = process.argv[2];
if (!file) { console.error("Usage: pnpm brief:check path/to/brief.json"); process.exit(1); }

let raw: unknown;
try { raw = JSON.parse(readFileSync(file, "utf8")); } catch (error) { console.error(`Not valid JSON: ${(error as Error).message.replace(/".*?"/g, '"…"')}`); process.exit(1); }

/** Hides quoted strings, dollar figures, dates and long numbers in a message. */
const mask = (text: string) => text.replace(/"(?:[^"\\]|\\.)*"/g, '"…"').replace(/\$[\d,.]+/g, "$…").replace(/\b\d{4}-\d{2}-\d{2}\b/g, "YYYY-MM-DD").replace(/\b\d{3,}\b/g, "#");

const shape = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "blank";
  if (Array.isArray(value)) return value.length ? `${value.length} item${value.length === 1 ? "" : "s"}` : "empty list";
  if (typeof value === "object") { const keys = Object.keys(value as object); return `${keys.filter(key => shape((value as any)[key]) !== "blank" && shape((value as any)[key]) !== "empty list").length}/${keys.length} filled`; }
  return typeof value === "string" && / \| |^YYYY-MM-DD$/.test(value) ? "template hint (treated as blank)" : `${typeof value} set`;
};

console.log("Brief shape");
if (raw && typeof raw === "object" && !Array.isArray(raw)) {
  for (const [key, value] of Object.entries(raw)) {
    console.log(`  ${key.padEnd(22)} ${shape(value)}`);
    if (value && typeof value === "object" && !Array.isArray(value) && ["discovery", "entitlement", "customer", "designProfile"].includes(key)) {
      for (const [inner, innerValue] of Object.entries(value)) console.log(`    ${inner.padEnd(26)} ${shape(innerValue)}`);
    }
  }
}

const base = createDefaultDocument();
base.fields.priorities = [];
const result = applyCustomerBrief(base, raw);
if (!result.ok) { console.log(`\nImport failed: ${mask(result.error ?? "unknown error")}`); process.exit(1); }
console.log(`\nImport: ${result.changes.length} changes, ${result.coerced.length} values converted, ${result.warnings.length} not used`);
for (const warning of result.warnings) console.log(`  not used: ${mask(warning)}`);
for (const item of result.missing) console.log(`  missing:  ${item}`);

// The plan the app would build from the brief, then the Condensed FCP and its content gates.
const document = migrateDocument({ ...result.document, fields: { ...result.document.fields, plannedProjectStart: result.document.fields.plannedProjectStart || new Date().toISOString().slice(0, 10) } });
const effort = scopedEffortForDocument(document);
const html = renderCondensedFcpHtml("Brief check", document, { effort });
const failures = checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount });
if (effort.internal.cost?.status === "over") failures.push("The entitlement window costs more than the entitlement value.");
console.log(`\nPlan: ${document.adoptionTimeline.lanes.reduce((sum, lane) => sum + lane.bars.length, 0)} work packages, ${effort.totals.total} entitlement hours, ${effort.workPackages.filter(row => row.deferred).length} moved to the Two-Year Notional, cost status ${effort.internal.cost?.status ?? "n/a"}`);
console.log(`Condensed FCP gates: ${failures.length ? `${failures.length} failing` : "all pass"}`);
for (const failure of failures) console.log(`  ${mask(failure)}`);
