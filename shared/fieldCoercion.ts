import type { z } from "zod";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

// ---------------------------------------------------------------------------
// Fixed-set values are read from the zod schemas themselves, so they cannot drift.
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

export function normalizePhrase(value: string): string {
  return value.trim().toLowerCase().replace(/\band\b/g, "-").replace(/[\s_&/+.,]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/** Keys are normalized phrasings; values must be members of the field's enum. */
export const FIELD_ALIASES: Record<string, Record<string, string>> = {
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
    "in-place-upgrade": "in-place", "upgrade-in-place": "in-place", "inplace": "in-place", "brownfield": "in-place", "brownfield-upgrade": "in-place",
    "convergence": "converge", "vcf-converge": "converge",
    "import": "import-workload-domain", "import-workload-domains": "import-workload-domain", "workload-domain-import": "import-workload-domain",
    "green-field": "greenfield", "new-deployment": "greenfield",
    "greenfield-brownfield": "hybrid", "greenfield-brownfield-combination": "hybrid", "combination": "hybrid",
    "design": "design-only",
    "tbd": "undecided", "unknown": "undecided",
  },
  platformEdition: { "vmware-cloud-foundation": "vcf", "vmware-vsphere-foundation": "vvf", "cloud-foundation": "vcf", "vsphere-foundation": "vvf" },
  domainTopology: { "consolidated-architecture": "consolidated", "standard-architecture": "standard", "tbd": "undecided", "unknown": "undecided" },
  principalStorage: {
    "nfs": "nfs-v3", "nfsv3": "nfs-v3", "nfs-3": "nfs-v3",
    "vmfs": "vmfs-fc", "fc": "vmfs-fc", "fcp": "vmfs-fc", "fibre-channel": "vmfs-fc", "fiber-channel": "vmfs-fc", "vmfs-on-fc": "vmfs-fc", "vmfs-fibre-channel": "vmfs-fc",
    "other": "other-existing", "existing": "other-existing", "existing-storage": "other-existing", "iscsi": "other-existing",
    "tbd": "undecided", "unknown": "undecided",
  },
  customerSegment: { "public": "public-sector", "government": "public-sector", "gov": "public-sector", "tbd": "unspecified", "unknown": "unspecified" },
  priorities: { "ops": "operations", "k8s": "kubernetes", "dr": "resilience", "disaster-recovery": "resilience", "ai": "private-ai" },
  componentDepths: { "none": "not-selected", "n-a": "not-selected", "tier1": "tier-1", "t1": "tier-1", "1": "tier-1", "tier2": "tier-2", "t2": "tier-2", "2": "tier-2", "tier3": "tier-3", "t3": "tier-3", "3": "tier-3" },
  automation: { "iac": "infrastructure-as-code", "day2-automation": "day-2-automation", "dsm": "data-services", "dbaas": "data-services" },
  networking: { "vpcs": "vpc", "avi": "load-balancing", "avi-load-balancer": "load-balancing" },
  security: { "dfw": "segmentation", "microsegmentation": "segmentation", "ids": "ids-ips", "ips": "ids-ips", "atp": "ids-ips" },
};

/**
 * Coerces loose phrasings ("vSAN", "IaC", "Tier 2", "$1,250,000") to the schema's own values.
 * A value is only ever replaced by one of the schema's options; anything unmapped is left as-is
 * and reported, so validation rejects it rather than guessing.
 */
export function createFieldCoercer() {
  const coerced: string[] = [];
  const warnings: string[] = [];

  const coerceEnum = (path: string, aliasKey: string, value: Json, options: readonly string[]): Json => {
    if (typeof value !== "string") return value;
    if (options.includes(value)) return value;
    const normalized = normalizePhrase(value);
    const direct = options.find(option => normalizePhrase(option) === normalized);
    const alias = FIELD_ALIASES[aliasKey]?.[normalized];
    const mapped = direct ?? (alias && options.includes(alias) ? alias : undefined);
    if (mapped) {
      coerced.push(`${path}: ${JSON.stringify(value)} → ${JSON.stringify(mapped)}`);
      return mapped;
    }
    warnings.push(`${path}: ${JSON.stringify(value)} is not one of ${options.map(option => JSON.stringify(option)).join(", ")}`);
    return value;
  };

  const coerceScalar = (path: string, value: Json, kind: string): Json => {
    if (typeof value !== "string") return value;
    if (kind === "boolean") {
      const normalized = normalizePhrase(value);
      if (["true", "yes", "y", "on", "include", "included"].includes(normalized)) { coerced.push(`${path}: ${JSON.stringify(value)} → true`); return true; }
      if (["false", "no", "n", "off", "exclude", "excluded"].includes(normalized)) { coerced.push(`${path}: ${JSON.stringify(value)} → false`); return false; }
      warnings.push(`${path}: ${JSON.stringify(value)} is not a boolean`);
    }
    if (kind === "number") {
      const cleaned = value.replace(/[$,\s]/g, "").replace(/(weeks?|wks?|hours?|hrs?)$/i, "");
      if (/^-?\d+(\.\d+)?$/.test(cleaned)) { coerced.push(`${path}: ${JSON.stringify(value)} → ${Number(cleaned)}`); return Number(cleaned); }
      warnings.push(`${path}: ${JSON.stringify(value)} is not a plain number`);
    }
    return value;
  };

  /** Walks incoming JSON against a schema, coercing values and dropping keys the schema does not have. */
  const coerce = (path: string, aliasKey: string, value: Json, schema: z.ZodType): Json => {
    if (value === null) return value;
    const options = enumValues(schema);
    if (options) return coerceEnum(path, aliasKey, value, options);
    const element = arrayElement(schema);
    if (element && Array.isArray(value)) return value.map((item, index) => coerce(`${path}[${index}]`, aliasKey, item, element));
    const shape = objectShape(schema);
    if (shape && value && typeof value === "object" && !Array.isArray(value)) {
      const out: JsonObject = {};
      for (const [key, child] of Object.entries(value)) {
        if (!(key in shape)) { warnings.push(`${path}.${key}: not a known field; it will be dropped`); continue; }
        out[key] = coerce(`${path}.${key}`, path.endsWith(".componentDepths") ? "componentDepths" : key, child, shape[key]);
      }
      return out;
    }
    return coerceScalar(path, value, kindOf(schema));
  };

  return { coerce, coerceEnum, coerced, warnings };
}

export function isPlainObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Plain objects merge key by key; arrays and scalars replace; null or absent keeps the current value. */
export function deepMerge(current: unknown, incoming: Json, path: string, changed: string[]): unknown {
  if (incoming === null) return current;
  if (isPlainObject(current) && isPlainObject(incoming)) {
    const out: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(incoming)) out[key] = deepMerge(current[key], value, `${path}.${key}`, changed);
    return out;
  }
  if (JSON.stringify(current) !== JSON.stringify(incoming)) changed.push(`${path}: ${JSON.stringify(current)} → ${JSON.stringify(incoming)}`);
  return incoming;
}
