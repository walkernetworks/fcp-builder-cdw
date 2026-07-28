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
  ["cisco", "ucs"], ["cisco"], ["ucs"], ["poweredge"], ["proliant"], ["thinksystem"], ["thinkagile"], ["thinkserver"], ["system", "x"], ["primergy"], ["primequest"], ["apollo"], ["synergy"], ["superserver"], ["sr"], ["rh"], ["fusionserver"], ["nf"], ["hpe"], ["dell"], ["lenovo"], ["fujitsu"], ["huawei"], ["inspur"], ["supermicro"],
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
