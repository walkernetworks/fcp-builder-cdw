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

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

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

// ---------------------------------------------------------------------------
// Fixed-set values, read from the schemas in shared/fcp.ts so they cannot drift.
// ---------------------------------------------------------------------------
function unwrap(schema: z.ZodType): z.ZodType {
  let current: any = schema;
  for (;;) {
    const def = current?._zod?.def ?? current?.def;
    if (def?.innerType) current = def.innerType; // default, optional, nullable, catch
    else if (def?.type === "pipe") current = def.out; // z.preprocess
    else return current;
  }
}

function enumValues(schema: z.ZodType): readonly string[] | null {
  const inner: any = unwrap(schema);
  return inner?.options && inner.options.every((value: unknown) => typeof value === "string") ? inner.options : null;
}

function objectShape(schema: z.ZodType): Record<string, z.ZodType> | null {
  const inner: any = unwrap(schema);
  return inner?.shape ?? null;
}

function arrayElement(schema: z.ZodType): z.ZodType | null {
  const inner: any = unwrap(schema);
  return inner?._zod?.def?.type === "array" ? inner._zod.def.element : null;
}

function kindOf(schema: z.ZodType): string {
  return (unwrap(schema) as any)?._zod?.def?.type ?? "unknown";
}

// ---------------------------------------------------------------------------
// Coercion of common phrasings to exact enum values. A value is only ever
// replaced by one of the schema's own options; anything unmapped is left as-is
// and reported, so validation will reject it rather than guess.
// ---------------------------------------------------------------------------
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\band\b/g, "-").replace(/[\s_&/+.,]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/** Keys are normalized phrasings; values must be members of the field's enum. */
const ALIASES: Record<string, Record<string, string>> = {
  hardwareAvailability: {
    "existing-hardware": "existing", "reuse-existing-hardware": "existing", "reuse-existing": "existing", "current-hardware": "existing", "reuse": "existing",
    "new-hardware": "new", "net-new": "new", "net-new-hardware": "new", "hardware-refresh": "new",
    "tbd": "unknown", "not-sure": "unknown", "unsure": "unknown",
  },
  adoptionCadence: { "monthly": "month", "months": "month", "weekly": "week", "weeks": "week" },
  compatibilityTargetRelease: {
    "9-0": "ESXi 9.0", "esxi-9-0": "ESXi 9.0", "esxi9-0": "ESXi 9.0", "vcf-9-0": "ESXi 9.0", "vsphere-9-0": "ESXi 9.0",
    "9-1": "ESXi 9.1", "esxi-9-1": "ESXi 9.1", "esxi9-1": "ESXi 9.1", "vcf-9-1": "ESXi 9.1", "vsphere-9-1": "ESXi 9.1",
  },
  upgradePath: {
    "in-place-upgrade": "in-place", "upgrade-in-place": "in-place", "inplace": "in-place",
    "convergence": "converge", "vcf-converge": "converge",
    "import": "import-workload-domain", "import-workload-domains": "import-workload-domain", "workload-domain-import": "import-workload-domain",
    "green-field": "greenfield", "new-deployment": "greenfield",
    "design": "design-only",
    "tbd": "undecided", "unknown": "undecided",
  },
  domainTopology: { "consolidated-architecture": "consolidated", "standard-architecture": "standard", "tbd": "undecided", "unknown": "undecided" },
  principalStorage: {
    "nfs": "nfs-v3", "nfsv3": "nfs-v3", "nfs-3": "nfs-v3",
    "vmfs": "vmfs-fc", "fc": "vmfs-fc", "fibre-channel": "vmfs-fc", "fiber-channel": "vmfs-fc", "vmfs-on-fc": "vmfs-fc", "vmfs-fibre-channel": "vmfs-fc",
    "other": "other-existing", "existing": "other-existing", "existing-storage": "other-existing",
    "tbd": "undecided", "unknown": "undecided",
  },
  customerSegment: { "public": "public-sector", "government": "public-sector", "gov": "public-sector", "tbd": "unspecified", "unknown": "unspecified" },
  priorities: { "ops": "operations", "k8s": "kubernetes", "dr": "resilience", "disaster-recovery": "resilience", "ai": "private-ai" },
  componentDepths: { "none": "not-selected", "n-a": "not-selected", "tier1": "tier-1", "t1": "tier-1", "1": "tier-1", "tier2": "tier-2", "t2": "tier-2", "2": "tier-2", "tier3": "tier-3", "t3": "tier-3", "3": "tier-3" },
  automation: { "iac": "infrastructure-as-code", "day2-automation": "day-2-automation" },
};

const warnings: string[] = [];

function coerceEnum(path: string, aliasKey: string, value: Json, options: readonly string[]): Json {
  if (typeof value !== "string") return value;
  if (options.includes(value)) return value;
  const normalized = normalize(value);
  const direct = options.find(option => normalize(option) === normalized);
  const alias = ALIASES[aliasKey]?.[normalized];
  const mapped = direct ?? (alias && options.includes(alias) ? alias : undefined);
  if (mapped) {
    console.log(`  coerced ${path}: ${JSON.stringify(value)} -> ${JSON.stringify(mapped)}`);
    return mapped;
  }
  warnings.push(`${path}: ${JSON.stringify(value)} is not one of ${options.map(option => JSON.stringify(option)).join(", ")}`);
  return value;
}

function coerceScalar(path: string, value: Json, kind: string): Json {
  if (typeof value !== "string") return value;
  if (kind === "boolean") {
    const normalized = normalize(value);
    if (["true", "yes", "y", "on", "include", "included"].includes(normalized)) { console.log(`  coerced ${path}: ${JSON.stringify(value)} -> true`); return true; }
    if (["false", "no", "n", "off", "exclude", "excluded"].includes(normalized)) { console.log(`  coerced ${path}: ${JSON.stringify(value)} -> false`); return false; }
    warnings.push(`${path}: ${JSON.stringify(value)} is not a boolean`);
  }
  if (kind === "number") {
    const cleaned = value.replace(/[$,\s]/g, "").replace(/(weeks?|wks?)$/i, "");
    if (/^-?\d+(\.\d+)?$/.test(cleaned)) { console.log(`  coerced ${path}: ${JSON.stringify(value)} -> ${Number(cleaned)}`); return Number(cleaned); }
    warnings.push(`${path}: ${JSON.stringify(value)} is not a plain number`);
  }
  return value;
}

/** Walks the incoming JSON against the fields schema, coercing and flagging unknown keys. */
function coerce(path: string, aliasKey: string, value: Json, schema: z.ZodType): Json {
  if (value === null) return value;
  const options = enumValues(schema);
  if (options) return coerceEnum(path, aliasKey, value, options);
  const element = arrayElement(schema);
  if (element && Array.isArray(value)) return value.map((item, index) => coerce(`${path}[${index}]`, aliasKey, item, element));
  const shape = objectShape(schema);
  if (shape && value && typeof value === "object" && !Array.isArray(value)) {
    const out: JsonObject = {};
    for (const [key, child] of Object.entries(value)) {
      if (!(key in shape)) { warnings.push(`${path}.${key}: not a field in the version 11 schema; it will be dropped`); continue; }
      out[key] = coerce(`${path}.${key}`, path.endsWith(".componentDepths") ? "componentDepths" : key, child, shape[key]);
    }
    return out;
  }
  return coerceScalar(path, value, kindOf(schema));
}

// ---------------------------------------------------------------------------
// Deep merge: plain objects merge key by key, arrays and scalars from the JSON
// replace the current value, and null/absent keys keep the current value.
// ---------------------------------------------------------------------------
function isPlainObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(current: unknown, incoming: Json, path: string, changed: string[]): unknown {
  if (incoming === null) return current;
  if (isPlainObject(current) && isPlainObject(incoming)) {
    const out: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(incoming)) out[key] = deepMerge(current[key], value, `${path}.${key}`, changed);
    return out;
  }
  if (JSON.stringify(current) !== JSON.stringify(incoming)) changed.push(`${path}: ${JSON.stringify(current)} -> ${JSON.stringify(incoming)}`);
  return incoming;
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
  const coerced = coerce("fields", "fields", incoming, minimalFieldsSchema) as JsonObject;
  for (const warning of warnings) console.warn(`  WARNING ${warning}`);

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
