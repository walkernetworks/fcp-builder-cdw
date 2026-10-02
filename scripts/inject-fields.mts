// LOCAL DEVELOPMENT ONLY. Applies a JSON "fields" block to an existing engagement
// through the local tRPC API (the dev SSO proxy supplies the signed-in identity).
//
//   pnpm exec tsx scripts/inject-fields.mts --id <engagementId> --fields <fields.json> [--url http://localhost:3100] [--dry-run]
//
// The engagement is loaded exactly as the browser loads it (engagement.get, then
// migrateDocument), so inventory and inventory sources are carried through untouched.
// Only data.fields changes; readiness and both timelines are then regenerated.
import { readFile } from "node:fs/promises";
import superjson from "superjson";
import { z } from "zod";
import { engagementDocumentSchema, migrateDocument, minimalFieldsSchema, refreshDerivedDocument, type EngagementDocument } from "../shared/fcp";
import { createFieldCoercer, deepMerge, isPlainObject, type Json, type JsonObject } from "../shared/fieldCoercion";

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const name = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) args[name] = true;
    else { args[name] = next; index++; }
  }
  const id = Number(args.id);
  if (!Number.isInteger(id) || id <= 0 || typeof args.fields !== "string") {
    console.error("Usage: pnpm exec tsx scripts/inject-fields.mts --id <engagementId> --fields <fields.json> [--url http://localhost:3100] [--dry-run]");
    process.exit(2);
  }
  return { id, fieldsPath: args.fields, baseUrl: String(typeof args.url === "string" ? args.url : "http://localhost:3100").replace(/\/+$/, ""), dryRun: args["dry-run"] === true };
}

// ---------------------------------------------------------------------------
// tRPC over HTTP. The server uses the superjson transformer, so inputs are sent
// as superjson.serialize(...) ({ json, meta? }) and results arrive as
// { result: { data: { json, meta? } } }. Single, non-batched calls are used:
// GET /api/trpc/<path>?input=... for queries, POST /api/trpc/<path> for mutations.
// ---------------------------------------------------------------------------
async function trpc<T>(baseUrl: string, kind: "query" | "mutation", path: string, input: unknown): Promise<T> {
  const payload = JSON.stringify(superjson.serialize(input));
  const response = kind === "query"
    ? await fetch(`${baseUrl}/api/trpc/${path}?input=${encodeURIComponent(payload)}`)
    : await fetch(`${baseUrl}/api/trpc/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: payload });
  const text = await response.text();
  let body: any;
  try { body = JSON.parse(text); } catch { throw new Error(`${path}: HTTP ${response.status} returned non-JSON: ${text.slice(0, 300)}`); }
  if (!response.ok || body.error) {
    const error = body.error ? superjson.deserialize<any>(body.error) : null;
    throw new Error(`${path}: HTTP ${response.status} ${error?.message ?? text.slice(0, 300)}`);
  }
  return superjson.deserialize<T>(body.result.data);
}

function printIssues(label: string, error: z.ZodError) {
  console.error(`${label} failed validation:`);
  for (const issue of error.issues) console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
}

async function main() {
  const { id, fieldsPath, baseUrl, dryRun } = parseArgs(process.argv.slice(2));

  let raw: Json;
  try { raw = JSON.parse(await readFile(fieldsPath, "utf8")); } catch (error) { console.error(`Could not read ${fieldsPath}: ${(error as Error).message}`); process.exit(2); }
  // Accept either a bare fields object or a wrapper of the form { "fields": { ... } }.
  const incoming = isPlainObject(raw) && isPlainObject(raw.fields) && Object.keys(raw).every(key => key === "fields" || key === "title") ? raw.fields : raw;
  if (!isPlainObject(incoming)) { console.error(`${fieldsPath} must contain a JSON object of fields.`); process.exit(2); }

  // Load the engagement the same way client/src/pages/Home.tsx does.
  const row = await trpc<{ id: number; title: string; data: unknown } | null>(baseUrl, "query", "engagement.get", { id });
  if (!row) { console.error(`Engagement ${id} was not found for the signed-in owner.`); process.exit(1); }
  const current = migrateDocument(row.data);
  console.log(`Loaded engagement ${id} "${row.title}" (hosts ${current.inventory.hosts}, VMs ${current.inventory.vmCount}, sources ${current.inventorySources.length}).`);

  console.log("Coercing input:");
  const coercer = createFieldCoercer();
  const coerced = coercer.coerce("fields", "fields", incoming, minimalFieldsSchema) as JsonObject;
  for (const line of coercer.coerced) console.log(`  coerced ${line}`);
  for (const warning of coercer.warnings) console.warn(`  WARNING ${warning}`);

  const changed: string[] = [];
  const mergedFields = deepMerge(current.fields, coerced, "fields", changed);
  const fieldsCheck = minimalFieldsSchema.safeParse(mergedFields);
  if (!fieldsCheck.success) { printIssues("Merged fields", fieldsCheck.error); console.error("Nothing was posted."); process.exit(1); }

  // migrateDocument normalizes planning dates; planAuthority "generated" plus a forced rebuild then
  // matches the workspace's "Rebuild Generated Plan" action.
  const normalized = migrateDocument({ ...current, planAuthority: "generated", fields: fieldsCheck.data });
  const rebuilt: EngagementDocument = refreshDerivedDocument(normalized, { forceRebuild: true });
  const documentCheck = engagementDocumentSchema.safeParse(rebuilt);
  if (!documentCheck.success) { printIssues("Merged document", documentCheck.error); console.error("Nothing was posted."); process.exit(1); }

  console.log(changed.length ? `Field changes:\n${changed.map(line => `  ${line}`).join("\n")}` : "No field values changed.");
  if (typeof coerced.entitlementEnd === "string" && coerced.entitlementEnd !== documentCheck.data.fields.entitlementEnd) {
    console.log(`  note: entitlementEnd is derived by the builder as entitlementStart + 12 months (${documentCheck.data.fields.entitlementEnd}).`);
  }
  if (dryRun) { console.log(`Dry run: engagement ${id} validated and was not updated.`); return; }

  await trpc(baseUrl, "mutation", "engagement.update", { id, title: row.title, data: documentCheck.data });

  // Round-trip check: re-read and confirm the inventory is byte-for-byte unchanged.
  const saved = await trpc<{ data: unknown }>(baseUrl, "query", "engagement.get", { id });
  const savedDocument = migrateDocument(saved.data);
  const inventoryKept = JSON.stringify(savedDocument.inventory) === JSON.stringify(current.inventory)
    && JSON.stringify(savedDocument.inventorySources) === JSON.stringify(current.inventorySources);
  if (!inventoryKept) { console.error(`Engagement ${id} was updated, but the saved inventory differs from what was loaded.`); process.exit(1); }
  console.log(`Updated engagement ${id} "${row.title}": ${changed.length} field value(s) applied, plan regenerated, inventory unchanged.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
