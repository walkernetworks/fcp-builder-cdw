import { z } from "zod";
import { HCL_SERVER_CATALOG, HCL_SNAPSHOT, type HclCatalogRecord } from "./hclCatalog";
export { HCL_SNAPSHOT };

export const HCL_EVALUATION_VERSION = "2.0.0" as const;
export const HCL_TARGET_RELEASE = "ESXi 9.1" as const;
const TARGET_RELEASE_MASK = 2;
const DETAIL_URL = "https://compatibilityguide.broadcom.com/detail?programId=server&productId=";

export const HCL_EVALUATION_STATUSES = [
  "supported",
  "supported-cpu-unverified",
  "review",
  "cpu-not-certified",
  "not-supported",
  "unknown",
] as const;
export type HclEvaluationStatus = (typeof HCL_EVALUATION_STATUSES)[number];

/**
 * HCL 2.0 scheduling paths are deliberately conservative. They sequence delivery
 * work from the offline evidence only; they do not certify a complete VCF build.
 */
export const HCL_SCHEDULE_PATHS = ["green", "yellow", "red", "unresolved"] as const;
export type HclSchedulePath = (typeof HCL_SCHEDULE_PATHS)[number];

export function hclSchedulePath(status: HclEvaluationStatus): HclSchedulePath {
  if (status === "supported") return "green";
  if (status === "supported-cpu-unverified" || status === "review" || status === "unknown") return "yellow";
  return "red";
}

export const HCL_MODEL_MATCH_METHODS = ["exact", "core", "compact", "token", "fuzzy", "none"] as const;
export type HclModelMatchMethod = (typeof HCL_MODEL_MATCH_METHODS)[number];

export type HclCandidate = {
  partnerName: string;
  model: string;
  score: number;
  productId: number;
};

export type HclFutureReleaseSupport = {
  status: "not-applicable" | "revalidation-required";
  verifiedThroughRelease: string;
  vendorHardwareSupportEnd: string;
  detail: string;
  nextAction: string;
  source: string;
};

const NO_FUTURE_RELEASE_BOUNDARY: HclFutureReleaseSupport = {
  status: "not-applicable",
  verifiedThroughRelease: HCL_TARGET_RELEASE,
  vendorHardwareSupportEnd: "",
  detail: "No model-specific future-release boundary is encoded in the current offline HCL planning snapshot.",
  nextAction: "Revalidate the server and CPU pairing whenever the target ESXi or VCF release changes.",
  source: "",
};

const CISCO_M5_BLADE_LIFECYCLE_SOURCE = "https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs-b-series-blade-servers/ucs-m5-blade-server-b200-eol.html";
const CISCO_M5_RACK_LIFECYCLE_SOURCE = "https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs-c-series-rack-servers/ucs-m5-rack-server-c220-c240-c480-eol.html";

function futureReleaseSupport(partnerName: string, model: string): HclFutureReleaseSupport {
  const identity = `${partnerName} ${model}`.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const m5Match = identity.match(/\b(B200|C220|C240|C480)\s+M5[A-Z0-9]*\b/);
  const genericBoundary: HclFutureReleaseSupport = {
    status: "revalidation-required",
    verifiedThroughRelease: HCL_TARGET_RELEASE,
    vendorHardwareSupportEnd: "",
    detail: `The supplied offline HCL snapshot contains server-and-CPU evidence through ${HCL_TARGET_RELEASE}. Support for a later ESXi or VCF release is not verified by this snapshot.`,
    nextAction: `Before selecting any release later than ${HCL_TARGET_RELEASE}, revalidate the complete server configuration in the current Broadcom Compatibility Guide.`,
    source: HCL_SNAPSHOT.source,
  };
  if (!identity.startsWith("CISCO ") || !m5Match) return genericBoundary;

  const source = m5Match[1] === "B200" ? CISCO_M5_BLADE_LIFECYCLE_SOURCE : CISCO_M5_RACK_LIFECYCLE_SOURCE;
  return {
    ...genericBoundary,
    vendorHardwareSupportEnd: "2028-10-31",
    detail: `${genericBoundary.detail} Cisco publishes a hardware support end date of October 31, 2028 for this M5 family.`,
    nextAction: `${genericBoundary.nextAction} Confirm Cisco support coverage through the planned service life.`,
    source: `${HCL_SNAPSHOT.source}; ${source}`,
  };
}

export type HclPlatformAssessment = {
  targetRelease: typeof HCL_TARGET_RELEASE;
  snapshotCapturedAt: string;
  snapshotSource: string;
  status: HclEvaluationStatus;
  modelMatchMethod: HclModelMatchMethod;
  modelMatchConfidence: number;
  vendorResolved: boolean;
  matchedPartnerName: string;
  matchedModel: string;
  matchedCpuSeries: string;
  productIds: number[];
  detailUrl: string;
  vcfVendorConfirmation: "reported" | "not-reported" | "unknown";
  supportedCpuSeries: string[];
  candidateModels: HclCandidate[];
  detail: string;
  nextAction: string;
  futureReleaseSupport: HclFutureReleaseSupport;
};

type CpuResolution = {
  series: string;
  confidence: "exact" | "inferred" | "legacy" | "unknown";
  note: string;
};

type ModelResolution = {
  entries: readonly HclCatalogRecord[];
  method: HclModelMatchMethod;
  score: number;
  vendorResolved: boolean;
  candidates: HclCandidate[];
  note: string;
};

const VENDOR_ALIASES: Record<string, string> = {
  "dell": "Dell",
  "dell inc": "Dell",
  "dell emc": "Dell",
  "dell technologies": "Dell",
  "dell computer": "Dell",
  "hp": "Hewlett Packard Enterprise",
  "hpe": "Hewlett Packard Enterprise",
  "hewlett packard": "Hewlett Packard Enterprise",
  "hewlett packard enterprise": "Hewlett Packard Enterprise",
  "cisco": "Cisco",
  "cisco systems": "Cisco",
  "cisco systems inc": "Cisco",
  "lenovo": "Lenovo",
  "lenovo global technology": "Lenovo",
  "ibm": "Lenovo",
  "supermicro": "Supermicro Computer, Inc",
  "super micro computer": "Supermicro Computer, Inc",
  "supermicro computer": "Supermicro Computer, Inc",
  "smci": "Supermicro Computer, Inc",
  "fujitsu": "Fujitsu",
  "fujitsu limited": "Fujitsu",
  "fsas": "Fsas Technologies Inc.",
  "fsas technologies": "Fsas Technologies Inc.",
  "inspur": "IEIT SYSTEMS Co., Ltd.",
  "ieit": "IEIT SYSTEMS Co., Ltd.",
  "ieit systems": "IEIT SYSTEMS Co., Ltd.",
  "huawei": "Huawei Technologies Co., Ltd.",
  "xfusion": "xFusion Digital Technologies Co., Ltd",
  "h3c": "New H3C Technologies Co., Ltd.",
  "new h3c": "New H3C Technologies Co., Ltd.",
  "nec": "NEC Corporation",
  "hitachi": "Hitachi, Ltd.",
  "gigabyte": "Giga Computing Technology Co., Ltd.",
  "giga computing": "Giga Computing Technology Co., Ltd.",
  "asus": "ASUSTek Computer Inc.",
  "asustek": "ASUSTek Computer Inc.",
  "asrock": "ASRock Rack Incorporation",
  "asrockrack": "ASRock Rack Incorporation",
  "quanta": "Quanta Computer Inc.",
  "quantacloud": "Quanta Computer Inc.",
  "qct": "Quanta Computer Inc.",
  "tyan": "Tyan Computer",
  "mitac": "MiTAC Computing Technology Corporation",
  "msi": "Micro-Star International Co., Ltd.",
  "intel": "Intel Corporation",
  "oracle": "Oracle",
  "netapp": "NetApp",
  "unisys": "Unisys Corporation",
  "stratus": "Stratus Technologies",
  "kontron": "Kontron AG",
  "advantech": "Advantech Corporation",
  "zte": "ZTE Corporation",
  "aic": "AIC Inc.",
  "amazon": "Amazon Web Services",
  "google": "Google LLC",
  "microsoft": "Microsoft",
  "alibaba": "Alibaba Cloud Computing Limited",
  "equinix": "Equinix",
  "siemens": "Siemens AG",
  "aivres": "Aivres Systems Inc.",
  "acer": "Altos Computing Inc.",
  "altos": "Altos Computing Inc.",
};

const PARTNER_BY_NORMALIZED = new Map<string, string>();
const CATALOG_BY_PARTNER = new Map<string, HclCatalogRecord[]>();
for (const record of HCL_SERVER_CATALOG) {
  const partner = record[0];
  PARTNER_BY_NORMALIZED.set(basicNormalize(partner), partner);
  const records = CATALOG_BY_PARTNER.get(partner) || [];
  records.push(record);
  CATALOG_BY_PARTNER.set(partner, records);
}

const MODEL_NOISE = new Set(["server", "servers", "system", "systems", "rack", "rackmount", "tower", "blade", "node", "nodes", "appliance", "certified", "ready", "readynode", "vsan", "series", "platform", "the", "and"]);
const LINE_PREFIXES = [
  ["cisco", "ucs"], ["cisco"], ["ucs"], ["ucsb"], ["ucsc"], ["poweredge"], ["proliant"], ["thinksystem"], ["thinkagile"], ["thinkserver"], ["system", "x"], ["primergy"], ["primequest"], ["apollo"], ["synergy"], ["superserver"], ["sr"], ["rh"], ["fusionserver"], ["nf"], ["hpe"], ["dell"], ["lenovo"], ["fujitsu"], ["huawei"], ["inspur"], ["supermicro"],
];

function basicNormalize(value: string): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalVendor(raw: string): { partnerName: string; resolved: boolean } {
  const normalized = basicNormalize(raw);
  if (!normalized) return { partnerName: "", resolved: false };
  if (PARTNER_BY_NORMALIZED.has(normalized)) return { partnerName: PARTNER_BY_NORMALIZED.get(normalized) || "", resolved: true };
  if (VENDOR_ALIASES[normalized]) return { partnerName: VENDOR_ALIASES[normalized], resolved: true };
  const stripped = normalized.replace(/\b(inc|incorporated|corp|corporation|co|company|ltd|limited|llc|gmbh|ag|sas|srl|pte|pvt|plc|kg|bv|nv|spa|technologies|technology)\b/g, " ").replace(/\s+/g, " ").trim();
  if (PARTNER_BY_NORMALIZED.has(stripped)) return { partnerName: PARTNER_BY_NORMALIZED.get(stripped) || "", resolved: true };
  if (VENDOR_ALIASES[stripped]) return { partnerName: VENDOR_ALIASES[stripped], resolved: true };
  const longestAlias = Object.keys(VENDOR_ALIASES).filter(alias => stripped === alias || stripped.startsWith(`${alias} `)).sort((left, right) => right.length - left.length)[0];
  return longestAlias ? { partnerName: VENDOR_ALIASES[longestAlias], resolved: true } : { partnerName: "", resolved: false };
}

function normalizeModel(raw: string): string {
  const noParentheses = String(raw || "").replace(/\([^)]*\)/g, " ").replace(/\(R\)|\(TM\)/gi, " ");
  return basicNormalize(noParentheses).split(" ").filter(token => token && !MODEL_NOISE.has(token)).join(" ");
}

function coreModel(raw: string): string {
  let tokens = normalizeModel(raw).split(" ").filter(Boolean);
  let previous = "";
  while (tokens.join(" ") !== previous) {
    previous = tokens.join(" ");
    const prefix = LINE_PREFIXES.find(tokensToRemove => tokensToRemove.every((token, index) => tokens[index] === token));
    if (!prefix) break;
    tokens = tokens.slice(prefix.length);
  }
  return tokens.join(" ");
}

function compactModel(raw: string): string {
  return normalizeModel(raw).replace(/\s+/g, "");
}

function digitGroups(raw: string): string[] {
  return (normalizeModel(raw).match(/\d+/g) || []).sort();
}

function digitsAgree(left: string, right: string): boolean {
  const a = digitGroups(left);
  const b = digitGroups(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(current[rightIndex - 1] + 1, previous[rightIndex] + 1, previous[rightIndex - 1] + cost);
    }
    previous.splice(0, previous.length, ...current);
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function uniqueEntries(entries: readonly HclCatalogRecord[]): readonly HclCatalogRecord[] {
  const result = new Map<number, HclCatalogRecord>();
  for (const entry of entries) result.set(entry[5], entry);
  return Array.from(result.values());
}

function candidatesFor(scope: readonly HclCatalogRecord[], model: string): HclCandidate[] {
  const wantedCore = coreModel(model);
  const wantedCompact = compactModel(model);
  const candidates = new Map<string, HclCandidate>();
  for (const entry of scope) {
    const candidateModel = entry[1];
    const score = Math.max(similarity(wantedCore, coreModel(candidateModel)), similarity(wantedCompact, compactModel(candidateModel)));
    const key = `${entry[0]}|${candidateModel}`;
    const existing = candidates.get(key);
    if (!existing || score > existing.score) candidates.set(key, { partnerName: entry[0], model: candidateModel, score: Number(score.toFixed(3)), productId: entry[5] });
  }
  return Array.from(candidates.values()).filter(candidate => candidate.score >= 0.72).sort((left, right) => right.score - left.score || left.model.localeCompare(right.model)).slice(0, 3);
}

function resolveModel(vendor: string, model: string): ModelResolution {
  const vendorMatch = canonicalVendor(vendor);
  const scopedCatalog = vendorMatch.resolved ? (CATALOG_BY_PARTNER.get(vendorMatch.partnerName) || []) : HCL_SERVER_CATALOG;
  const normalized = normalizeModel(model);
  if (!normalized) return { entries: [], method: "none", score: 0, vendorResolved: vendorMatch.resolved, candidates: [], note: "The vHost row has no usable model string." };
  const matchingTiers: Array<{ method: Exclude<HclModelMatchMethod, "token" | "fuzzy" | "none">; select: (entry: HclCatalogRecord) => string; wanted: string }> = [
    { method: "exact", select: entry => normalizeModel(entry[1]), wanted: normalized },
    { method: "core", select: entry => coreModel(entry[1]), wanted: coreModel(model) },
    { method: "compact", select: entry => compactModel(entry[1]), wanted: compactModel(model) },
  ];
  for (const tier of matchingTiers) {
    if (!tier.wanted) continue;
    const entries = uniqueEntries(scopedCatalog.filter(entry => tier.select(entry) === tier.wanted));
    if (entries.length) return { entries, method: tier.method, score: 1, vendorResolved: vendorMatch.resolved, candidates: [], note: "" };
  }
  const wantedTokens = new Set(normalized.split(" ").filter(Boolean));
  const tokenEntries = uniqueEntries(scopedCatalog.filter(entry => {
    const candidateTokens = new Set(normalizeModel(entry[1]).split(" ").filter(Boolean));
    const candidateContainsWanted = Array.from(wantedTokens).every(token => candidateTokens.has(token));
    const wantedContainsCandidate = Array.from(candidateTokens).every(token => wantedTokens.has(token));
    return (candidateContainsWanted || wantedContainsCandidate) && digitsAgree(model, entry[1]);
  }));
  if (tokenEntries.length) return { entries: tokenEntries, method: "token", score: 0.95, vendorResolved: vendorMatch.resolved, candidates: [], note: "" };

  const candidates = vendorMatch.resolved ? candidatesFor(scopedCatalog, model) : [];
  const fuzzy = candidates.find(candidate => candidate.score >= 0.88 && digitsAgree(model, candidate.model));
  if (fuzzy) {
    const entries = uniqueEntries(scopedCatalog.filter(entry => entry[0] === fuzzy.partnerName && entry[1] === fuzzy.model));
    return { entries, method: "fuzzy", score: fuzzy.score, vendorResolved: vendorMatch.resolved, candidates, note: `A fuzzy HCL model candidate was found at ${(fuzzy.score * 100).toFixed(0)}% similarity; manual confirmation is required.` };
  }
  const digitGuardNote = candidates.length && candidates[0].score >= 0.88 && !digitsAgree(model, candidates[0].model)
    ? "The closest HCL model has a different model-number identity and was deliberately not accepted."
    : "No model in the offline HCL snapshot matched the reported vHost model.";
  return { entries: [], method: "none", score: candidates[0]?.score || 0, vendorResolved: vendorMatch.resolved, candidates, note: digitGuardNote };
}

function resolveCpuSeries(raw: string): CpuResolution {
  const text = String(raw || "").replace(/\((?:R|TM)\)/gi, " ").replace(/\s+/g, " ").trim();
  const upper = text.toUpperCase();
  if (!upper) return { series: "", confidence: "unknown", note: "The vHost row has no usable CPU model string." };
  if (/\bOPTERON\b/i.test(upper)) return { series: "", confidence: "legacy", note: "AMD Opteron predates the ESXi 9.x hardware baseline." };
  if (/\bE[57]-\d{4}\b|\bE3-\d{4}\b|\bX\d{4}\b|\bD-1[0-5]\d\d\b|\bD-21\d\d\b/i.test(upper)) return { series: "", confidence: "legacy", note: "This Intel Xeon generation predates the ESXi 9.x hardware baseline." };

  if (upper.includes("EPYC")) {
    const match = upper.match(/EPYC\s+([0-9A-Z]{4,5})/);
    if (!match) return { series: "", confidence: "unknown", note: "The AMD EPYC SKU could not be classified." };
    const sku = match[1];
    if (/^7[FH]\d\d$/.test(sku)) return { series: "AMD EPYC 7002/7Fx2/7Hx2 Series", confidence: "exact", note: `EPYC ${sku}` };
    const digits = sku.match(/^(\d)(\d\d)(\d)/);
    if (!digits) return { series: "", confidence: "unknown", note: `The AMD EPYC SKU ${sku} could not be classified.` };
    const [, lead, , generation] = digits;
    const series = lead === "7" ? ({ "1": "AMD EPYC 7001 Series", "2": "AMD EPYC 7002/7Fx2/7Hx2 Series", "3": "AMD EPYC 7003/7003X Series" } as const)[generation]
      : lead === "9" ? ({ "4": "AMD EPYC 9004 Series", "5": "AMD EPYC 9005 Series" } as const)[generation]
        : lead === "8" && generation === "4" ? "AMD EPYC 8004 Series" : undefined;
    return series ? { series, confidence: "exact", note: `EPYC ${sku}` } : { series: "", confidence: "unknown", note: `The AMD EPYC SKU ${sku} is not mapped to the supplied server HCL series.` };
  }

  if (/INTEL|XEON|ATOM/.test(upper)) {
    if (/ATOM/.test(upper) && /\bC3\d{3}\b/.test(upper)) return { series: "Intel Atom C3000 Series", confidence: "exact", note: "Intel Atom C3000" };
    const max = upper.match(/\bMAX\s*(\d{4})\b/);
    if (max?.[1].startsWith("94")) return { series: "Intel Xeon CPU Max 9400 (Sapphire-Rapids-HBM) Series", confidence: "exact", note: `Xeon CPU Max ${max[1]}` };
    const w = upper.match(/\bW-(\d{4,5})\b/);
    if (w) return w[1].startsWith("11") ? { series: "Intel Xeon W-11000 Processor Series", confidence: "exact", note: `Xeon W-${w[1]}` } : { series: "", confidence: "unknown", note: `Xeon W-${w[1]} is not mapped to the supplied server HCL series.` };
    const d = upper.match(/\bD-(\d{4})\b/);
    if (d) return d[1].startsWith("17") ? { series: "Intel Xeon D-1700 (Ice-Lake-D) Series", confidence: "exact", note: `Xeon D-${d[1]}` } : d[1].startsWith("27") ? { series: "Intel Xeon D-2700 (Ice-Lake-D) Series", confidence: "exact", note: `Xeon D-${d[1]}` } : { series: "", confidence: "unknown", note: `Xeon D-${d[1]} is not mapped to the supplied server HCL series.` };
    const e = upper.match(/\bE-(\d{4})([A-Z]*)\b/);
    if (e) {
      const number = e[1];
      if (number.startsWith("21")) return { series: "Intel Xeon E-2100 Series", confidence: "exact", note: "Xeon E-2100" };
      if (number.startsWith("22")) return { series: "Intel Xeon E-2200 (4 or 6-core) Series", confidence: "inferred", note: "Xeon E-2200 is split by core count in the HCL; this reference view needs manual confirmation." };
      if (number.startsWith("23")) return { series: "Intel Xeon E-2300 Series", confidence: "exact", note: "Xeon E-2300" };
      if (number.startsWith("24")) return { series: "Intel Xeon E-2400/Xeon 6300 Series", confidence: "exact", note: "Xeon E-2400" };
      return { series: "", confidence: "unknown", note: `Xeon E-${number} is not mapped to the supplied server HCL series.` };
    }
    const scalable = upper.match(/\b(PLATINUM|GOLD|SILVER|BRONZE)\s+(\d{4}[A-Z+]*)\b/);
    if (scalable) {
      const [, tier, rawSku] = scalable;
      const sku = rawSku.toUpperCase();
      const numeric = sku.match(/^(\d)(\d)(\d\d)([A-Z+]*)$/);
      if (!numeric) return { series: "", confidence: "unknown", note: `The Xeon ${tier} SKU ${sku} could not be classified.` };
      const [, leading, generation, , suffix] = numeric;
      const cooper = suffix.includes("H");
      const series = leading === "8"
        ? ({ "1": "Intel Xeon Platinum 8100 (Skylake-SP) Series", "2": "Intel Xeon Platinum 8200 (Cascade-Lake-SP) Series", "3": cooper ? "Intel Xeon Platinum 8300 (Cooper-Lake-SP) Series" : "Intel Xeon Platinum 8300 (Ice-Lake-SP) Series", "4": "Intel Xeon Platinum 8400 (Sapphire-Rapids-SP) Series", "5": "Intel Xeon Platinum 8500 (Emerald Rapids-SP) Series" } as const)[generation]
        : (leading === "6" || leading === "5")
          ? ({ "1": "Intel Xeon Gold 6100/5100, Silver 4100, Bronze 3100 (Skylake-SP) Series", "2": "Intel Xeon Gold 6200/5200 (Cascade-Lake-SP/Refresh) Series", "3": cooper ? "Intel Xeon Gold 6300/5300 (Cooper-Lake-SP) Series" : "Intel Xeon Gold 6300/5300 (Ice-Lake-SP) Series", "4": "Intel Xeon Gold 6400/5400 (Sapphire-Rapids-SP) Series", "5": "Intel Xeon Gold 6500/5500 (Emerald Rapids-SP) Series" } as const)[generation]
          : leading === "4"
            ? ({ "1": "Intel Xeon Gold 6100/5100, Silver 4100, Bronze 3100 (Skylake-SP) Series", "2": "Intel Xeon Silver 4200, Bronze 3200 (Cascade-Lake-SP/Refresh) Series", "3": "Intel Xeon Silver 4300 (Ice-Lake-SP) Series", "4": "Intel Xeon Silver 4400, Bronze 3400 (Sapphire-Rapids-SP) Series", "5": "Intel Xeon Silver 4500, Bronze 3500 (Emerald Rapids-SP) Series" } as const)[generation]
            : leading === "3"
              ? ({ "1": "Intel Xeon Gold 6100/5100, Silver 4100, Bronze 3100 (Skylake-SP) Series", "2": "Intel Xeon Silver 4200, Bronze 3200 (Cascade-Lake-SP/Refresh) Series", "4": "Intel Xeon Silver 4400, Bronze 3400 (Sapphire-Rapids-SP) Series", "5": "Intel Xeon Silver 4500, Bronze 3500 (Emerald Rapids-SP) Series" } as const)[generation]
              : undefined;
      return series ? { series, confidence: "exact", note: `Xeon ${tier[0]}${tier.slice(1).toLowerCase()} ${sku}` } : { series: "", confidence: "unknown", note: `The Xeon ${tier} SKU ${sku} is not mapped to the supplied server HCL series.` };
    }
    const xeonSix = upper.match(/\bXEON\s+(\d{4})([A-Z]*)\b/);
    if (xeonSix) {
      const value = Number(xeonSix[1]);
      if (value >= 6900 && value <= 6999) return { series: "Intel Xeon 6900P (Granite Rapids-AP) Series", confidence: "exact", note: `Xeon ${xeonSix[1]}${xeonSix[2]}` };
      if (value >= 6500 && value <= 6799) return { series: "Intel Xeon 6500P/6700P (Granite Rapids-SP) Series", confidence: "inferred", note: `Xeon ${xeonSix[1]}${xeonSix[2]}; four-socket systems require a separate HCL row.` };
      if (value >= 6300 && value <= 6399) return { series: "Intel Xeon E-2400/Xeon 6300 Series", confidence: "exact", note: `Xeon ${xeonSix[1]}${xeonSix[2]}` };
    }
  }
  return { series: "", confidence: "unknown", note: `The reported CPU string could not be classified against the supplied HCL CPU series: ${text || "not reported"}.` };
}

function hclEntryUrl(productId: number): string {
  return productId ? `${DETAIL_URL}${productId}` : "";
}

function emptyAssessment(status: HclEvaluationStatus, modelMatch: ModelResolution, cpu: CpuResolution, detail: string, nextAction: string): HclPlatformAssessment {
  return {
    targetRelease: HCL_TARGET_RELEASE,
    snapshotCapturedAt: HCL_SNAPSHOT.capturedAt,
    snapshotSource: HCL_SNAPSHOT.source,
    status,
    modelMatchMethod: modelMatch.method,
    modelMatchConfidence: modelMatch.score,
    vendorResolved: modelMatch.vendorResolved,
    matchedPartnerName: "",
    matchedModel: "",
    matchedCpuSeries: cpu.series,
    productIds: [],
    detailUrl: "",
    vcfVendorConfirmation: "unknown",
    supportedCpuSeries: [],
    candidateModels: modelMatch.candidates,
    detail,
    nextAction,
    futureReleaseSupport: NO_FUTURE_RELEASE_BOUNDARY,
  };
}

export function assessHclPlatform(vendor: string, model: string, cpuModel: string): HclPlatformAssessment {
  const modelMatch = resolveModel(vendor, model);
  const cpu = resolveCpuSeries(cpuModel);
  if (!modelMatch.entries.length) {
    const legacyDetail = cpu.confidence === "legacy" ? ` ${cpu.note}` : "";
    return emptyAssessment(
      "unknown",
      modelMatch,
      cpu,
      `${modelMatch.note}${legacyDetail} The result is unresolved against the offline ${HCL_TARGET_RELEASE} server snapshot.`,
      "Confirm the exact OEM server model and CPU, then validate the complete configuration in the Broadcom Compatibility Guide before selecting the VCF path.",
    );
  }

  const entries = modelMatch.entries;
  const matchingPartner = entries[0][0];
  const matchingModel = entries[0][1];
  const supportedCpuSeries = Array.from(new Set(entries.filter(entry => (entry[3] & TARGET_RELEASE_MASK) !== 0).map(entry => entry[2]))).sort();
  const allProductIds = Array.from(new Set(entries.map(entry => entry[5]))).sort((left, right) => left - right);
  const cpuEntries = cpu.series ? entries.filter(entry => entry[2] === cpu.series) : [];
  const targetCpuEntries = cpuEntries.filter(entry => (entry[3] & TARGET_RELEASE_MASK) !== 0);
  const confirmationReported = targetCpuEntries.some(entry => (entry[4] & TARGET_RELEASE_MASK) !== 0);
  const sourceEvidence = `${matchingPartner} ${matchingModel}; ${cpu.series || "CPU series unresolved"}; snapshot ${HCL_SNAPSHOT.capturedAt}`;
  const statusFromFuzzyOrVendor = !modelMatch.vendorResolved || modelMatch.method === "fuzzy";
  const baseline = {
    targetRelease: HCL_TARGET_RELEASE,
    snapshotCapturedAt: HCL_SNAPSHOT.capturedAt,
    snapshotSource: HCL_SNAPSHOT.source,
    modelMatchMethod: modelMatch.method,
    modelMatchConfidence: modelMatch.score,
    vendorResolved: modelMatch.vendorResolved,
    matchedPartnerName: matchingPartner,
    matchedModel: matchingModel,
    matchedCpuSeries: cpu.series,
    productIds: allProductIds,
    detailUrl: hclEntryUrl(targetCpuEntries[0]?.[5] || cpuEntries[0]?.[5] || entries[0]?.[5]),
    vcfVendorConfirmation: targetCpuEntries.length ? (confirmationReported ? "reported" as const : "not-reported" as const) : "unknown" as const,
    supportedCpuSeries,
    candidateModels: modelMatch.candidates,
    futureReleaseSupport: targetCpuEntries.length ? futureReleaseSupport(matchingPartner, matchingModel) : NO_FUTURE_RELEASE_BOUNDARY,
  };

  if (statusFromFuzzyOrVendor) {
    return {
      ...baseline,
      status: "review",
      detail: `${modelMatch.note || "The reported vendor or model required a non-exact HCL match."} Candidate evidence: ${sourceEvidence}. This remains unproven until the OEM model identity is confirmed.`,
      nextAction: "Confirm the OEM vendor and exact server model, then validate the full configuration in the Broadcom Compatibility Guide before treating this as a supported pairing.",
    };
  }
  if (!cpu.series) {
    return {
      ...baseline,
      status: "supported-cpu-unverified",
      detail: `The server model is present in the offline ${HCL_TARGET_RELEASE} snapshot, but the reported CPU string could not be resolved to one of its certified series. ${cpu.note} Candidate CPU series: ${supportedCpuSeries.join("; ") || "not reported"}.`,
      nextAction: "Verify the installed CPU series against the HCL detail record and complete the NIC, HBA/controller, firmware, driver, storage, and vSAN/ReadyNode checks.",
    };
  }
  if (targetCpuEntries.length) {
    const verificationNote = cpu.confidence === "inferred" ? ` ${cpu.note}` : "";
    return {
      ...baseline,
      status: cpu.confidence === "inferred" ? "supported-cpu-unverified" : "supported",
      detail: `The offline HCL snapshot lists the exact server-model and CPU-series pairing for ${HCL_TARGET_RELEASE}: ${sourceEvidence}.${verificationNote} This is source evidence only, not complete configuration certification.`,
      nextAction: "Retain the HCL evidence in the delivery baseline and validate NIC, HBA/controller, firmware, driver, OEM image, storage, vSAN/ReadyNode, build, and topology requirements before deployment.",
    };
  }
  if (cpuEntries.length) {
    return {
      ...baseline,
      status: "not-supported",
      detail: `The offline HCL snapshot contains ${sourceEvidence}, but not for ${HCL_TARGET_RELEASE}.`,
      nextAction: "Select a release-supported platform path or validate an approved replacement, repurpose, or exception decision before deployment planning proceeds.",
    };
  }
  return {
    ...baseline,
    status: "cpu-not-certified",
    detail: `The server model is present in the offline ${HCL_TARGET_RELEASE} snapshot, but not with the reported CPU series ${cpu.series}. Candidate CPU series: ${supportedCpuSeries.join("; ") || "not reported"}.`,
    nextAction: "Validate the CPU generation and supported configuration; plan replacement, repurpose, or an approved exception before the VCF deployment path is committed.",
  };
}

export function hclStatusLabel(status: HclEvaluationStatus): string {
  return {
    supported: "Snapshot-supported pairing",
    "supported-cpu-unverified": "CPU needs verification",
    review: "Manual HCL review",
    "cpu-not-certified": "CPU not in snapshot pairing",
    "not-supported": "Not listed for ESXi 9.1",
    unknown: "No snapshot match",
  }[status];
}

export function hclStatusSummary(status: HclEvaluationStatus): string {
  return {
    supported: "The supplied offline HCL snapshot lists the model and resolved CPU series for ESXi 9.1.",
    "supported-cpu-unverified": "The model appears in the supplied snapshot, but its installed CPU series needs manual verification.",
    review: "A non-exact identity match needs manual confirmation before it can be used as HCL evidence.",
    "cpu-not-certified": "The model appears in the supplied snapshot, but the reported CPU series does not.",
    "not-supported": "The matching model and CPU series are not listed for ESXi 9.1 in the supplied snapshot.",
    unknown: "No deterministic server-model pairing was found in the supplied offline snapshot.",
  }[status];
}

export const HCL_OFFLINE_LIMITATION = `This HCL ${HCL_EVALUATION_VERSION} offline server-and-CPU reference uses a snapshot captured ${HCL_SNAPSHOT.capturedAt}. It does not validate NICs, HBAs/controllers, firmware, drivers, BIOS, OEM images, storage, vSAN/ReadyNode, ESXi builds, licensing, topology, or other configuration requirements; confirm the complete configuration in the Broadcom Compatibility Guide and vendor processes.`;


/**
 * Detailed RVTools evidence and estate-level findings used by the HCL 2.0
 * planning precheck. These fields deliberately retain only evidence that an
 * RVTools export can observe; they are not a substitute for the Compatibility
 * Guide or an OEM configuration validation.
 */
export const HCL_FINDING_SEVERITIES = ["BLOCKER", "WARNING", "ADVISORY", "INFO"] as const;
export type HclFindingSeverity = (typeof HCL_FINDING_SEVERITIES)[number];

export const hclEvidenceHostSchema = z.object({
  name: z.string(),
  cluster: z.string(),
  vendor: z.string(),
  model: z.string(),
  cpuModel: z.string(),
  esxiVersion: z.string(),
  socketCount: z.number().int().nonnegative(),
  coresPerSocket: z.number().int().nonnegative(),
  biosVersion: z.string(),
  biosDate: z.string(),
});

export const hclEvidenceNicSchema = z.object({
  host: z.string(),
  cluster: z.string(),
  device: z.string(),
  driver: z.string(),
  speedMb: z.number().nonnegative(),
  switchName: z.string(),
});

export const hclEvidenceHbaSchema = z.object({
  host: z.string(),
  cluster: z.string(),
  device: z.string(),
  model: z.string(),
  driver: z.string(),
});

export const hclEvidenceClusterSchema = z.object({
  name: z.string(),
  ha: z.enum(["enabled", "disabled", "unknown"]),
  drs: z.enum(["enabled", "disabled", "unknown"]),
  evcMode: z.string(),
  vsan: z.enum(["enabled", "disabled", "unknown"]),
});

export const hclEvidenceDvSwitchSchema = z.object({
  name: z.string(),
  version: z.string(),
  maxMtu: z.number().nonnegative(),
});

export const hclEvidenceVmKernelSchema = z.object({
  host: z.string(),
  cluster: z.string(),
  device: z.string(),
  mtu: z.number().nonnegative(),
  portGroup: z.string(),
  vsan: z.enum(["enabled", "disabled", "unknown"]),
});

export const hclEvidenceDatastoreSchema = z.object({
  name: z.string(),
  type: z.string(),
  version: z.string(),
  capacityMiB: z.number().nonnegative(),
  freeMiB: z.number().nonnegative(),
  freePct: z.number().min(0).max(100).nullable(),
});

export const hclEvidenceVmInfoSchema = z.object({
  vm: z.string(),
  guestOs: z.string(),
  hardwareVersion: z.string(),
});

export const hclEvidenceVmNetworkSchema = z.object({ vm: z.string(), adapter: z.string() });
export const hclEvidenceSnapshotSchema = z.object({ vm: z.string(), date: z.string() });
export const hclEvidenceToolsSchema = z.object({ vm: z.string(), status: z.string() });
export const hclEvidenceDeviceSchema = z.object({ vm: z.string(), connected: z.enum(["enabled", "disabled", "unknown"]) });

export const hclInventoryEvidenceSchema = z.object({
  tabs: z.record(z.string(), z.boolean()).default({}),
  hosts: z.array(hclEvidenceHostSchema).default([]),
  nics: z.array(hclEvidenceNicSchema).default([]),
  hbas: z.array(hclEvidenceHbaSchema).default([]),
  clusters: z.array(hclEvidenceClusterSchema).default([]),
  distributedSwitches: z.array(hclEvidenceDvSwitchSchema).default([]),
  vmkernels: z.array(hclEvidenceVmKernelSchema).default([]),
  datastores: z.array(hclEvidenceDatastoreSchema).default([]),
  vmInfo: z.array(hclEvidenceVmInfoSchema).default([]),
  vmNetworks: z.array(hclEvidenceVmNetworkSchema).default([]),
  snapshots: z.array(hclEvidenceSnapshotSchema).default([]),
  tools: z.array(hclEvidenceToolsSchema).default([]),
  cdDevices: z.array(hclEvidenceDeviceSchema).default([]),
  usbDevices: z.array(hclEvidenceDeviceSchema).default([]),
});
export type HclInventoryEvidence = z.infer<typeof hclInventoryEvidenceSchema>;

export function emptyHclInventoryEvidence(): HclInventoryEvidence {
  return {
    tabs: {},
    hosts: [],
    nics: [],
    hbas: [],
    clusters: [],
    distributedSwitches: [],
    vmkernels: [],
    datastores: [],
    vmInfo: [],
    vmNetworks: [],
    snapshots: [],
    tools: [],
    cdDevices: [],
    usbDevices: [],
  };
}

export const hclFindingSchema = z.object({
  checkId: z.string(),
  severity: z.enum(HCL_FINDING_SEVERITIES),
  title: z.string(),
  scope: z.enum(["host", "cluster", "switch", "datastore", "fleet"]),
  subject: z.string(),
  evidence: z.string(),
  remediation: z.string(),
  cluster: z.string().optional(),
  releases: z.array(z.string()).default([]),
  source: z.string().optional(),
});
export type HclFinding = z.infer<typeof hclFindingSchema>;

export const hclCoverageGapSchema = z.object({
  kind: z.enum(["missing-tab", "empty-tab", "missing-dataset", "not-in-rvtools"]),
  subject: z.string(),
  impact: z.string(),
});
export type HclCoverageGap = z.infer<typeof hclCoverageGapSchema>;

export const hclAssessmentSchema = z.object({
  findings: z.array(hclFindingSchema),
  coverageGaps: z.array(hclCoverageGapSchema),
});
export type HclAssessment = z.infer<typeof hclAssessmentSchema>;

export type HclFindingSummary = {
  id: string;
  checkId: string;
  severity: HclFinding["severity"];
  title: string;
  scope: HclFinding["scope"];
  remediation: string;
  affectedCount: number;
  subjects: string[];
  clusters: string[];
  findings: HclFinding[];
};

/**
 * Consolidates repeated check results for workspace presentation while retaining
 * the original host, cluster, switch, datastore, and fleet evidence for drill-down.
 */
export function summarizeHclFindings(findings: HclFinding[]): HclFindingSummary[] {
  const groups = new Map<string, HclFindingSummary>();
  for (const finding of findings) {
    const key = [finding.checkId, finding.severity, finding.title, finding.scope, finding.remediation].join("|");
    const existing = groups.get(key);
    if (existing) {
      existing.findings.push(finding);
      continue;
    }
    groups.set(key, {
      id: key.toLowerCase(),
      checkId: finding.checkId,
      severity: finding.severity,
      title: finding.title,
      scope: finding.scope,
      remediation: finding.remediation,
      affectedCount: 0,
      subjects: [],
      clusters: [],
      findings: [finding],
    });
  }
  const severityOrder: Record<HclFinding["severity"], number> = { BLOCKER: 0, WARNING: 1, ADVISORY: 2, INFO: 3 };
  return Array.from(groups.values()).map(summary => {
    summary.subjects = Array.from(new Set(summary.findings.map(finding => finding.subject).filter(Boolean))).sort();
    summary.clusters = Array.from(new Set(summary.findings.map(finding => finding.cluster).filter((cluster): cluster is string => Boolean(cluster)))).sort();
    summary.affectedCount = summary.subjects.length || summary.findings.length;
    return summary;
  }).sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity] || right.affectedCount - left.affectedCount || left.title.localeCompare(right.title));
}

const HCL_MIN_NIC_SPEED_MB = 10000;
const HCL_NSX_TEP_MIN_MTU = 1600;
const HCL_RECOMMENDED_MTU = 9000;
const HCL_MIN_WORKLOAD_DOMAIN_HOSTS = 3;
const HCL_LOW_FREE_SPACE_PCT = 20;
const HCL_STALE_SNAPSHOT_DAYS = 30;
const HCL_LICENSE_MIN_CORES_PER_SOCKET = 16;
const HCL_OLD_BIOS_YEARS = 4;
const HCL_SEVERITY_ORDER: HclFindingSeverity[] = ["BLOCKER", "WARNING", "ADVISORY", "INFO"];
const HCL_EVC_INTEL_ORDER = [
  "intel-merom", "intel-penryn", "intel-nehalem", "intel-westmere", "intel-sandybridge", "intel-ivybridge", "intel-haswell", "intel-broadwell", "intel-skylake", "intel-cascadelake", "intel-cooperlake", "intel-icelake", "intel-sapphirerapids", "intel-emeraldrapids", "intel-graniterapids",
];
const HCL_EVC_AMD_ORDER = [
  "amd-rev-e", "amd-rev-f", "amd-greyhound", "amd-greyhound-no3dnow", "amd-bulldozer", "amd-piledriver", "amd-streamroller", "amd-zen", "amd-zen2", "amd-zen3", "amd-zen4", "amd-zen5",
];

function hclFinding(
  checkId: string,
  severity: HclFindingSeverity,
  title: string,
  scope: HclFinding["scope"],
  subject: string,
  evidence: string,
  remediation: string,
  extra: Partial<Pick<HclFinding, "cluster" | "releases" | "source">> = {},
): HclFinding {
  return { checkId, severity, title, scope, subject, evidence, remediation, releases: [], ...extra };
}

function normalizedEvidence(value: string): string {
  return basicNormalize(value);
}

function canonicalHclTab(name: string): string {
  const normalized = normalizedEvidence(name).replace(/\s/g, "");
  const aliases: Record<string, string> = {
    vhost: "vhost",
    vnic: "vnic",
    vhba: "vhba",
    vcluster: "vcluster",
    dvswitch: "dvswitch",
    vscvmk: "vscvmk",
    vdatastore: "vdatastore",
    vinfo: "vinfo",
    vnetwork: "vnetwork",
    vsnapshot: "vsnapshot",
    vtools: "vtools",
    vcd: "vcd",
    vusb: "vusb",
  };
  return aliases[normalized] || normalized;
}

function hasHclTab(evidence: HclInventoryEvidence, tab: string): boolean {
  const canonical = canonicalHclTab(tab);
  return Object.entries(evidence.tabs).some(([name, present]) => present === true && canonicalHclTab(name) === canonical);
}

function hclDate(value: string): Date | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  if (!Number.isNaN(timestamp)) return new Date(timestamp);
  const year = raw.match(/\b(19|20)\d{2}\b/)?.[0];
  return year ? new Date(`${year}-01-01T00:00:00Z`) : null;
}

function hclClusterKey(value: string): string {
  return normalizedEvidence(value).replace(/^.*\s\/\s/, "");
}

function hclHostLabel(host: HclInventoryEvidence["hosts"][number]): string {
  return host.name || `${host.vendor} ${host.model}`.trim() || "Unnamed host";
}

function hclModelLabel(host: HclInventoryEvidence["hosts"][number]): string {
  return `${host.vendor} ${host.model}`.trim().replace(/\s+/g, " ") || "Unknown model";
}

function hclMajorVersion(version: string): number | null {
  const match = String(version || "").match(/\b(\d+)(?:\.\d+)?\b/);
  const major = Number(match?.[1]);
  return Number.isFinite(major) ? major : null;
}

function hclTextList(items: string[], limit = 10): string {
  const unique = Array.from(new Set(items.filter(Boolean))).sort();
  const shown = unique.slice(0, limit);
  return `${shown.join(", ")}${unique.length > limit ? ` (+${unique.length - limit} more)` : ""}`;
}

function hclHardwareFindings(evidence: HclInventoryEvidence): HclFinding[] {
  const findings: HclFinding[] = [];
  for (const host of evidence.hosts) {
    const assessment = assessHclPlatform(host.vendor, host.model, host.cpuModel);
    const status = assessment.status;
    const severity: HclFindingSeverity = status === "supported"
      ? "INFO"
      : status === "cpu-not-certified" || status === "not-supported"
        ? "BLOCKER"
        : "WARNING";
    const title = status === "supported"
      ? "Offline server and CPU pairing is listed"
      : status === "cpu-not-certified" || status === "not-supported"
        ? "Server and CPU pairing is not listed in the offline HCL snapshot"
        : "Server and CPU pairing needs HCL confirmation";
    findings.push(hclFinding(
      `HW.SERVER_CPU_${status.toUpperCase().replace(/-/g, "_")}`,
      severity,
      title,
      "host",
      hclHostLabel(host),
      assessment.detail,
      assessment.nextAction,
      { cluster: host.cluster || undefined, releases: [HCL_TARGET_RELEASE], source: assessment.detailUrl || HCL_SNAPSHOT.source },
    ));
    if (assessment.futureReleaseSupport.status === "revalidation-required") {
      findings.push(hclFinding(
        "HW.FUTURE_RELEASE_REVALIDATION",
        "ADVISORY",
        "Future-release support requires revalidation",
        "host",
        hclHostLabel(host),
        assessment.futureReleaseSupport.detail,
        assessment.futureReleaseSupport.nextAction,
        { cluster: host.cluster || undefined, releases: [HCL_TARGET_RELEASE], source: assessment.futureReleaseSupport.source },
      ));
    }
  }
  return findings;
}

function hclHostCapacityFindings(evidence: HclInventoryEvidence, now: Date): HclFinding[] {
  const findings: HclFinding[] = [];
  for (const host of evidence.hosts) {
    if (host.coresPerSocket > 0 && host.coresPerSocket < HCL_LICENSE_MIN_CORES_PER_SOCKET) {
      const sockets = host.socketCount || 1;
      const physical = host.coresPerSocket * sockets;
      const chargeable = HCL_LICENSE_MIN_CORES_PER_SOCKET * sockets;
      findings.push(hclFinding(
        "LIC.SOCKET_BELOW_CORE_FLOOR",
        "ADVISORY",
        "Socket has fewer cores than the licensing floor",
        "host",
        hclHostLabel(host),
        `${host.coresPerSocket} cores per socket × ${host.socketCount || "?"} sockets = ${physical} physical cores, but a ${HCL_LICENSE_MIN_CORES_PER_SOCKET}-core-per-socket floor produces ${chargeable} chargeable cores.`,
        "Use the chargeable figure for VCF subscription sizing; evaluate whether a denser-socket configuration improves the licensing position.",
        { cluster: host.cluster || undefined },
      ));
    }
    const biosDate = hclDate(host.biosDate);
    const staleBefore = new Date(now);
    staleBefore.setUTCFullYear(staleBefore.getUTCFullYear() - HCL_OLD_BIOS_YEARS);
    if (biosDate && biosDate < staleBefore) {
      findings.push(hclFinding(
        "HW.BIOS_STALE",
        "ADVISORY",
        "BIOS is several years old",
        "host",
        hclHostLabel(host),
        `BIOS ${host.biosVersion || "(version not reported)"} is dated ${host.biosDate}.`,
        "Confirm the required BIOS and firmware levels against the exact model record before the upgrade window.",
        { cluster: host.cluster || undefined, source: "Broadcom Compatibility Guide and OEM firmware matrix" },
      ));
    }
  }
  return findings;
}

function hclNicLayoutFindings(evidence: HclInventoryEvidence): HclFinding[] {
  if (!hasHclTab(evidence, "vnic")) return [];
  const findings: HclFinding[] = [];
  const byHost = new Map<string, HclInventoryEvidence["nics"]>();
  for (const nic of evidence.nics) {
    if (!nic.host) continue;
    const current = byHost.get(nic.host) || [];
    current.push(nic);
    byHost.set(nic.host, current);
  }
  for (const host of evidence.hosts) {
    const nics = byHost.get(host.name) || [];
    if (!nics.length) continue;
    const cluster = nics[0]?.cluster || host.cluster || undefined;
    if (nics.length < 2) {
      findings.push(hclFinding(
        "NET.NIC_COUNT_LOW",
        "WARNING",
        "Fewer than two physical NICs",
        "host",
        hclHostLabel(host),
        `${nics.length} physical NIC row(s) were reported for this host.`,
        "Add redundant uplinks before this host joins a VCF workload domain.",
        { cluster },
      ));
    }
    const speeds = nics.map(nic => nic.speedMb).filter(speed => speed > 0);
    if (speeds.length && speeds.every(speed => speed < HCL_MIN_NIC_SPEED_MB)) {
      findings.push(hclFinding(
        "NET.NIC_SPEED_LOW",
        "WARNING",
        "All uplinks are below 10 GbE",
        "host",
        hclHostLabel(host),
        `Reported link speeds: ${Array.from(new Set(speeds)).sort((a, b) => a - b).map(speed => `${speed} Mb`).join(", ")}.`,
        "Plan NIC and switch-port upgrades so vSAN and NSX overlay traffic have 10 GbE or faster connectivity.",
        { cluster },
      ));
    }
  }
  return findings;
}

function hclClusterFindings(evidence: HclInventoryEvidence): HclFinding[] {
  const findings: HclFinding[] = [];
  const hostsByCluster = new Map<string, HclInventoryEvidence["hosts"]>();
  for (const host of evidence.hosts) {
    const cluster = host.cluster || "(standalone)";
    const current = hostsByCluster.get(cluster) || [];
    current.push(host);
    hostsByCluster.set(cluster, current);
  }
  const configurationByCluster = new Map<string, HclInventoryEvidence["clusters"][number]>();
  for (const cluster of evidence.clusters) configurationByCluster.set(hclClusterKey(cluster.name), cluster);
  for (const [cluster, hosts] of Array.from(hostsByCluster.entries())) {
    const configuration = configurationByCluster.get(hclClusterKey(cluster));
    if (configuration?.ha === "disabled") {
      findings.push(hclFinding("CLU.HA_DISABLED", "WARNING", "vSphere HA is disabled", "cluster", cluster, "HA is reported as disabled on this cluster.", "Enable HA before conversion.", { cluster }));
    }
    if (configuration?.drs === "disabled") {
      findings.push(hclFinding("CLU.DRS_DISABLED", "WARNING", "vSphere DRS is disabled", "cluster", cluster, "DRS is reported as disabled on this cluster.", "Enable DRS, preferably in fully automated mode, before lifecycle operations.", { cluster }));
    }
    const evcMode = normalizedEvidence(configuration?.evcMode || "").replace(/\s/g, "-");
    if (evcMode) {
      const order = evcMode.startsWith("intel-") ? HCL_EVC_INTEL_ORDER : evcMode.startsWith("amd-") ? HCL_EVC_AMD_ORDER : [];
      const floor = evcMode.startsWith("intel-") ? "intel-skylake" : evcMode.startsWith("amd-") ? "amd-zen" : "";
      if (order.length && floor && order.indexOf(evcMode) >= 0 && order.indexOf(evcMode) < order.indexOf(floor)) {
        findings.push(hclFinding(
          "CLU.EVC_BASELINE_BELOW_ESXI9",
          "BLOCKER",
          "EVC baseline is older than the ESXi 9.x hardware baseline",
          "cluster",
          cluster,
          `Current EVC mode is '${configuration?.evcMode}'.`,
          "Raise or clear the EVC baseline before the upgrade; plan required VM power-off activity as a separate change.",
          { cluster, releases: [HCL_TARGET_RELEASE], source: "Derived from the supplied ESXi 9.1 server compatibility evidence" },
        ));
      }
    }
    if (cluster !== "(standalone)" && hosts.length < HCL_MIN_WORKLOAD_DOMAIN_HOSTS) {
      findings.push(hclFinding(
        "CLU.SIZE_BELOW_MINIMUM",
        "ADVISORY",
        "Cluster is smaller than the VCF workload-domain minimum signal",
        "cluster",
        cluster,
        `${hosts.length} host(s) were reported in this cluster.`,
        "Confirm the intended VCF storage and availability design, then consolidate or add hosts if the selected design requires it.",
        { cluster },
      ));
    }
    const models = new Set<string>(hosts.map((host: HclInventoryEvidence["hosts"][number]) => hclModelLabel(host)).filter((model: string) => model !== "Unknown model"));
    if (models.size > 1) {
      findings.push(hclFinding(
        "CLU.MIXED_HARDWARE",
        "ADVISORY",
        "Cluster contains mixed server models",
        "cluster",
        cluster,
        `${models.size} server models are observed: ${hclTextList(Array.from(models))}.`,
        "Consider regrouping hosts into homogeneous VCF clusters to simplify vSAN, EVC, and lifecycle image management.",
        { cluster },
      ));
    }
    const versions = new Set<string>(hosts.map((host: HclInventoryEvidence["hosts"][number]) => host.esxiVersion).filter(Boolean));
    if (versions.size > 1) {
      findings.push(hclFinding(
        "CLU.MIXED_ESXI_VERSION",
        "WARNING",
        "Cluster runs mixed ESXi versions",
        "cluster",
        cluster,
        `Versions observed: ${hclTextList(Array.from(versions))}.`,
        "Bring the cluster to a single baseline before conversion because lifecycle management applies one image per cluster.",
        { cluster },
      ));
    }
  }
  return findings;
}

function hclNetworkFindings(evidence: HclInventoryEvidence): HclFinding[] {
  const findings: HclFinding[] = [];
  if (hasHclTab(evidence, "dvswitch")) {
    for (const distributedSwitch of evidence.distributedSwitches) {
      const major = hclMajorVersion(distributedSwitch.version);
      if (major !== null && major < 7) {
        findings.push(hclFinding(
          "NET.VDS_VERSION_TOO_OLD",
          "BLOCKER",
          "Distributed switch is older than vDS 7.0",
          "switch",
          distributedSwitch.name || "Unnamed distributed switch",
          `vDS '${distributedSwitch.name || "Unnamed"}' reports version ${distributedSwitch.version}.`,
          "Upgrade the vDS to 7.0 or later before conversion because the VCF NSX path requires a distributed switch.",
          { releases: [HCL_TARGET_RELEASE], source: "VCF 9 release notes — N-VDS removal and vDS requirement" },
        ));
      }
      if (distributedSwitch.maxMtu > 0 && distributedSwitch.maxMtu < HCL_NSX_TEP_MIN_MTU) {
        findings.push(hclFinding(
          "NET.VDS_MTU_TOO_LOW",
          "WARNING",
          "Distributed switch MTU is below the NSX overlay minimum",
          "switch",
          distributedSwitch.name || "Unnamed distributed switch",
          `vDS '${distributedSwitch.name || "Unnamed"}' reports a maximum MTU of ${distributedSwitch.maxMtu}.`,
          `Raise vDS and physical-fabric MTU together to at least ${HCL_NSX_TEP_MIN_MTU}; ${HCL_RECOMMENDED_MTU} is the usual target.`,
        ));
      }
    }
  }
  if (hasHclTab(evidence, "vnic") && hasHclTab(evidence, "dvswitch")) {
    const distributedNames = new Set(evidence.distributedSwitches.map(distributedSwitch => normalizedEvidence(distributedSwitch.name)).filter(Boolean));
    const switchesByHost = new Map<string, Set<string>>();
    const clusterByHost = new Map<string, string>();
    for (const nic of evidence.nics) {
      if (!nic.host) continue;
      const switches = switchesByHost.get(nic.host) || new Set<string>();
      if (nic.switchName) switches.add(normalizedEvidence(nic.switchName));
      switchesByHost.set(nic.host, switches);
      if (nic.cluster) clusterByHost.set(nic.host, nic.cluster);
    }
    for (const host of evidence.hosts) {
      const switches = switchesByHost.get(host.name);
      if (switches && switches.size && !Array.from(switches).some(name => distributedNames.has(name))) {
        findings.push(hclFinding(
          "NET.NO_DISTRIBUTED_SWITCH",
          "BLOCKER",
          "Host has no uplink on a distributed switch",
          "host",
          hclHostLabel(host),
          `Reported uplinks are attached to: ${hclTextList(Array.from(switches))}; none match a distributed-switch row.`,
          "Migrate this host's uplinks to a vDS 7.0 or later before it joins a VCF workload domain.",
          { cluster: clusterByHost.get(host.name) || host.cluster || undefined, releases: [HCL_TARGET_RELEASE], source: "VCF 9 release notes — N-VDS removal and vDS requirement" },
        ));
      }
    }
  }
  if (hasHclTab(evidence, "vscvmk")) {
    for (const vmkernel of evidence.vmkernels) {
      const carriesVsan = vmkernel.vsan === "enabled" || /vsan/i.test(vmkernel.portGroup);
      if (carriesVsan && vmkernel.mtu > 0 && vmkernel.mtu < HCL_RECOMMENDED_MTU) {
        findings.push(hclFinding(
          "NET.VSAN_VMK_MTU_LOW",
          "ADVISORY",
          "vSAN VMkernel is not using jumbo frames",
          "host",
          vmkernel.host || "Unnamed host",
          `${vmkernel.device || "VMkernel"} carries vSAN traffic at MTU ${vmkernel.mtu}.`,
          `Coordinate a move to MTU ${HCL_RECOMMENDED_MTU} with the physical fabric; do not change it in isolation.`,
          { cluster: vmkernel.cluster || undefined },
        ));
      }
    }
  }
  return findings;
}

function hclStorageFindings(evidence: HclInventoryEvidence): HclFinding[] {
  if (!hasHclTab(evidence, "vdatastore")) return [];
  const findings: HclFinding[] = [];
  for (const datastore of evidence.datastores) {
    const text = `${datastore.type} ${datastore.version} ${datastore.name}`.toLowerCase();
    if (/vvol/.test(text)) {
      findings.push(hclFinding(
        "STO.VVOL_DATASTORE",
        "BLOCKER",
        "vVols datastore present",
        "datastore",
        datastore.name || "Unnamed datastore",
        `Datastore '${datastore.name || "Unnamed"}' reports type '${datastore.type || "not reported"}'.`,
        "Plan a data migration to VMFS, NFS, or vSAN before the upgrade; this is a workload migration rather than a configuration change.",
        { releases: [HCL_TARGET_RELEASE], source: "VCF 9 release notes — vVols deprecation/removal planning" },
      ));
    }
    const vmfsMatch = text.match(/vmfs[\s-]*(\d)/i);
    const versionMajor = vmfsMatch ? Number(vmfsMatch[1]) : /vmfs/i.test(datastore.type) ? hclMajorVersion(datastore.version) : null;
    if (versionMajor !== null && versionMajor < 6) {
      findings.push(hclFinding(
        "STO.VMFS_VERSION_OLD",
        "WARNING",
        `Datastore is VMFS-${versionMajor}`,
        "datastore",
        datastore.name || "Unnamed datastore",
        `Datastore reports type '${datastore.type || "not reported"}' and version '${datastore.version || "not reported"}'.`,
        "Create a VMFS-6 datastore and plan Storage vMotion capacity and maintenance windows because VMFS-5 cannot be upgraded in place.",
      ));
    }
    const freePct = datastore.freePct ?? (datastore.capacityMiB > 0 ? datastore.freeMiB / datastore.capacityMiB * 100 : null);
    if (freePct !== null && freePct < HCL_LOW_FREE_SPACE_PCT) {
      findings.push(hclFinding(
        "STO.FREE_SPACE_LOW",
        "WARNING",
        "Datastore free space is low",
        "datastore",
        datastore.name || "Unnamed datastore",
        `${freePct.toFixed(1)}% free capacity is reported.`,
        "Free capacity or add storage headroom before rolling upgrades, host evacuation, and snapshot growth.",
      ));
    }
    if (/nfs[\s-]*3/i.test(text)) {
      findings.push(hclFinding(
        "STO.NFS_V3",
        "ADVISORY",
        "NFS v3 datastore",
        "datastore",
        datastore.name || "Unnamed datastore",
        `Datastore reports type '${datastore.type || "not reported"}'.`,
        "Consider NFS 4.1 or vSAN as part of the VCF storage-design decision.",
      ));
    }
  }
  return findings;
}

function hclVmEstateFindings(evidence: HclInventoryEvidence, now: Date): HclFinding[] {
  const findings: HclFinding[] = [];
  if (hasHclTab(evidence, "vnetwork")) {
    const deprecated = new Map<string, number>();
    for (const network of evidence.vmNetworks) {
      const adapter = normalizedEvidence(network.adapter);
      if (adapter && ["vlance", "vmxnet2", "vmxnet 2", "flexible"].some(value => adapter.includes(value))) deprecated.set(adapter, (deprecated.get(adapter) || 0) + 1);
    }
    for (const [adapter, count] of Array.from(deprecated.entries())) {
      findings.push(hclFinding(
        "VM.DEPRECATED_VNIC",
        "WARNING",
        "VMs use a deprecated virtual NIC type",
        "fleet",
        adapter,
        `${count} virtual NIC(s) report adapter type '${adapter}'.`,
        "Replace VLANCE, Flexible, and VMXNET2 adapters with VMXNET3 through an in-guest driver and NIC-change plan.",
        { source: "VCF 9 release notes — vSphere deprecations" },
      ));
    }
  }
  if (hasHclTab(evidence, "vsnapshot")) {
    const cutoff = new Date(now.getTime() - HCL_STALE_SNAPSHOT_DAYS * 24 * 60 * 60 * 1000);
    const stale = evidence.snapshots.filter(snapshot => {
      const date = hclDate(snapshot.date);
      return date !== null && date < cutoff;
    });
    if (stale.length) {
      const dates = stale.map(snapshot => hclDate(snapshot.date)).filter((date): date is Date => date !== null);
      const oldest = dates.length ? new Date(Math.min(...dates.map(date => date.getTime()))).toISOString().slice(0, 10) : "not reported";
      findings.push(hclFinding(
        "VM.STALE_SNAPSHOTS",
        "WARNING",
        "Snapshots older than 30 days exist",
        "fleet",
        `${stale.length} snapshot(s)`,
        `${stale.length} snapshot(s) are older than ${HCL_STALE_SNAPSHOT_DAYS} days; oldest date ${oldest}. Affected VMs include ${hclTextList(stale.map(snapshot => snapshot.vm))}.`,
        "Consolidate snapshots before the upgrade because they can grow during host evacuation and consume datastore capacity.",
      ));
    }
  }
  if (hasHclTab(evidence, "vcd")) {
    const mounted = evidence.cdDevices.filter(device => device.connected === "enabled");
    if (mounted.length) {
      findings.push(hclFinding(
        "VM.CDROM_CONNECTED",
        "ADVISORY",
        "VMs have connected CD/DVD devices",
        "fleet",
        `${mounted.length} VM(s)`,
        `${mounted.length} connected CD/DVD device(s) were observed on: ${hclTextList(mounted.map(device => device.vm))}.`,
        "Disconnect connected ISO/CD/DVD devices before rolling upgrades so DRS evacuation is not blocked.",
      ));
    }
  }
  if (hasHclTab(evidence, "vusb") && evidence.usbDevices.length) {
    findings.push(hclFinding(
      "VM.USB_PASSTHROUGH",
      "WARNING",
      "VMs have USB devices attached",
      "fleet",
      `${evidence.usbDevices.length} VM(s)`,
      `${evidence.usbDevices.length} USB device row(s) were observed on: ${hclTextList(evidence.usbDevices.map(device => device.vm))}.`,
      "Remove USB passthrough or plan the required powered-off migration window because USB devices prevent vMotion.",
    ));
  }
  if (hasHclTab(evidence, "vtools")) {
    const notRunning = evidence.tools.filter(tool => /toolsnotinstalled|not installed|toolsnotrunning|not running/i.test(tool.status));
    if (notRunning.length) {
      findings.push(hclFinding(
        "VM.TOOLS_MISSING",
        "ADVISORY",
        "VMs without running VMware Tools",
        "fleet",
        `${notRunning.length} VM(s)`,
        `${notRunning.length} VM(s) report VMware Tools not installed or not running.`,
        "Install or start VMware Tools before maintenance windows so guests can be quiesced and shut down cleanly.",
      ));
    }
  }
  if (hasHclTab(evidence, "vinfo")) {
    const versions = new Map<string, number>();
    for (const vm of evidence.vmInfo) {
      if (vm.hardwareVersion) versions.set(vm.hardwareVersion, (versions.get(vm.hardwareVersion) || 0) + 1);
    }
    if (versions.size) {
      const reported = Array.from(versions.entries()).sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true })).map(([version, count]) => `${version} (${count})`).join(", ");
      findings.push(hclFinding(
        "VM.HW_VERSION_SPREAD",
        "INFO",
        "VM hardware version spread",
        "fleet",
        "virtual machines",
        `Hardware versions present: ${reported}.`,
        "No compatibility action is implied by this inventory signal; upgrade virtual hardware only for required features after application review.",
        { source: "Broadcom KB 312100" },
      ));
    }
  }
  return findings;
}

function hclLicensingFindings(evidence: HclInventoryEvidence): HclFinding[] {
  let count = 0;
  let physical = 0;
  let chargeable = 0;
  for (const host of evidence.hosts) {
    if (!host.socketCount || !host.coresPerSocket) continue;
    count += 1;
    physical += host.socketCount * host.coresPerSocket;
    chargeable += host.socketCount * Math.max(host.coresPerSocket, HCL_LICENSE_MIN_CORES_PER_SOCKET);
  }
  if (!count) return [];
  const uplift = chargeable - physical;
  return [hclFinding(
    "LIC.CORE_COUNT",
    "INFO",
    "Licensable core count",
    "fleet",
    "estate",
    `${count} host(s): ${physical} physical cores and ${chargeable} chargeable cores at the ${HCL_LICENSE_MIN_CORES_PER_SOCKET}-core-per-socket floor${uplift ? ` (${uplift} cores of uplift)` : ""}.`,
    "Use the chargeable figure as a planning input for VCF subscription sizing.",
  )];
}

function hclCoverageGaps(evidence: HclInventoryEvidence): HclCoverageGap[] {
  const requirements: Array<[string, string]> = [
    ["vhost", "server hardware, host capacity, cluster composition, and licensing checks"],
    ["vnic", "NIC count, speed, uplink, and adapter-driver evidence"],
    ["vhba", "storage-adapter driver evidence"],
    ["vcluster", "HA, DRS, and EVC cluster configuration checks"],
    ["dvswitch", "distributed-switch version and MTU checks"],
    ["vscvmk", "vSAN VMkernel MTU checks"],
    ["vdatastore", "vVols, VMFS version, and datastore-capacity checks"],
    ["vinfo", "guest OS and VM hardware checks"],
    ["vnetwork", "deprecated virtual-NIC checks"],
    ["vsnapshot", "stale-snapshot checks"],
    ["vtools", "VMware Tools checks"],
    ["vcd", "connected CD/DVD checks"],
    ["vusb", "USB-passthrough checks"],
  ];
  const rowCounts: Record<string, number> = {
    vhost: evidence.hosts.length,
    vnic: evidence.nics.length,
    vhba: evidence.hbas.length,
    vcluster: evidence.clusters.length,
    dvswitch: evidence.distributedSwitches.length,
    vscvmk: evidence.vmkernels.length,
    vdatastore: evidence.datastores.length,
    vinfo: evidence.vmInfo.length,
    vnetwork: evidence.vmNetworks.length,
    vsnapshot: evidence.snapshots.length,
    vtools: evidence.tools.length,
    vcd: evidence.cdDevices.length,
    vusb: evidence.usbDevices.length,
  };
  const gaps: HclCoverageGap[] = [];
  for (const [tab, impact] of requirements) {
    if (!hasHclTab(evidence, tab)) gaps.push({ kind: "missing-tab", subject: tab, impact: `Skipped: ${impact}.` });
    else if (!rowCounts[tab]) gaps.push({ kind: "empty-tab", subject: tab, impact: `No usable rows were available: ${impact}.` });
  }
  gaps.push(
    { kind: "missing-dataset", subject: "I/O driver compatibility dataset", impact: "Unavailable: the supplied offline archive does not contain a driver-to-device compatibility dataset, so NIC/HBA driver support cannot be verified." },
    { kind: "missing-dataset", subject: "Guest OS compatibility dataset", impact: "Unavailable: the supplied offline archive does not contain a guest-OS compatibility dataset, so guest OS support cannot be verified." },
    { kind: "not-in-rvtools", subject: "TPM 2.0, boot device, and firmware levels", impact: "RVTools does not provide TPM status, boot-media type or size, or sufficient firmware evidence; collect PowerCLI/esxcli and OEM evidence." },
    { kind: "not-in-rvtools", subject: "PCI vendor/device identifiers", impact: "RVTools does not provide PCI VID/DID/SVID/SSID, so individual NIC/HBA cards cannot be matched exactly to the Compatibility Guide." },
  );
  return gaps;
}

/**
 * Evaluate every HCL 2.0 family that can be assessed safely from the persisted
 * RVTools evidence. Driver and guest OS compatibility are explicitly reported
 * as unavailable because the supplied offline archive lacks their datasets.
 */
export function assessHclEstate(evidence: HclInventoryEvidence, now: Date = new Date()): HclAssessment {
  const findings = [
    ...hclHardwareFindings(evidence),
    ...hclHostCapacityFindings(evidence, now),
    ...hclNicLayoutFindings(evidence),
    ...hclClusterFindings(evidence),
    ...hclNetworkFindings(evidence),
    ...hclStorageFindings(evidence),
    ...hclVmEstateFindings(evidence, now),
    ...hclLicensingFindings(evidence),
  ].sort((left, right) => HCL_SEVERITY_ORDER.indexOf(left.severity) - HCL_SEVERITY_ORDER.indexOf(right.severity) || left.checkId.localeCompare(right.checkId) || left.subject.localeCompare(right.subject));
  return { findings, coverageGaps: hclCoverageGaps(evidence) };
}

export function hclFindingSchedulePath(findings: HclFinding[], fallback: HclSchedulePath = "unresolved"): HclSchedulePath {
  if (findings.some(finding => finding.severity === "BLOCKER")) return "red";
  if (findings.some(finding => finding.severity === "WARNING")) return "yellow";
  return findings.length ? "green" : fallback;
}

export function hclFindingSeverityLabel(severity: HclFindingSeverity): string {
  return { BLOCKER: "Blocker", WARNING: "Warning", ADVISORY: "Advisory", INFO: "Information" }[severity];
}

export const HCL_ESTATE_LIMITATION = "This estate-level HCL 2.0 planning precheck evaluates only RVTools-observable signals and the supplied offline server/CPU snapshot. It is not an official Broadcom, OEM, or configuration certification. Explicit coverage gaps identify checks that could not be completed from the import or the supplied offline archive.";
