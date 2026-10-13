import { CPU_LIFECYCLE, CPU_SERIES_RELEASES, ESX_BUILDS, VCF_CORPUS, VCF_KB, VENDOR_SERVER_NOTES, type CpuLifecycleStatus } from "./vcfCorpus";

/**
 * Lookups over the VCF 9.1 TechDocs corpus (shared/vcfCorpus.ts): which ESXi releases a CPU series is listed for,
 * its KB 318697 lifecycle, whether a host build is newer than a target release ("back in time"), the KB rule
 * behind each, and partner server statements. Pure functions over strings so the checker and the FCP can share them.
 */

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
const SERIES = new Map(CPU_SERIES_RELEASES.map(([name, releases]) => [key(name), { name, releases }]));
const LIFECYCLE = new Map(CPU_LIFECYCLE.map(row => [key(row.series), row]));

export function kb(id: string): { id: string; title: string; url: string; planningRule: string } {
  const found = VCF_KB.find(item => item.id === id);
  return found ?? { id, title: `KB ${id}`, url: `https://knowledge.broadcom.com/external/article/${id}`, planningRule: "" };
}

export type CpuGeneration = {
  /** The Compatibility Guide CPU series, or the family the CPU string names when the guide has no such series. */
  label: string;
  /** ESXi releases the guide lists the series for; null when the series is not in the guide for any release. */
  releases: readonly string[] | null;
  lifecycle: CpuLifecycleStatus | null;
  codeName: string;
};

/** The Compatibility Guide series an older Intel CPU string belongs to (E3, E5, E7, D, W), which the server catalog does not carry. */
function legacyIntelSeries(raw: string): string | null {
  const upper = raw.toUpperCase().replace(/\((?:R|TM)\)/g, " ").replace(/\s+/g, " ");
  const e = upper.match(/\bE([357])-(\d)(\d)\d\d[A-Z]*\s*(?:V(\d))?\b/);
  if (e) {
    const [, family, first, second, version] = e;
    const suffix = version ? `-v${version}` : "";
    if (family === "7") return CPU_SERIES_RELEASES.find(([name]) => name.startsWith("Intel Xeon E7-") && (version ? name.endsWith(`-v${version} Series`) : !/-v\d/.test(name)))?.[0] ?? `Intel Xeon E7${suffix} Series`;
    return `Intel Xeon E${family}-${first}${second}00${suffix} Series`;
  }
  const w = upper.match(/\bW-(\d)(\d)\d\d[A-Z]?\b/);
  if (w && w[1] !== "1") return `Intel Xeon W-${w[1]}${w[2]}00 Series`;
  const d = upper.match(/\bD-(1[5]|2[1])\d\d\b/);
  if (d) return `Intel Xeon D-${d[1]}00 Series`;
  return null;
}

/** The CPU's series in the Compatibility Guide with its releases and lifecycle. `resolvedSeries` is the server catalog's series when it found one. */
export function cpuGeneration(cpuModel: string, resolvedSeries: string): CpuGeneration | null {
  const label = resolvedSeries || legacyIntelSeries(cpuModel) || (/\bOPTERON\b/i.test(cpuModel) ? "AMD Opteron" : "");
  if (!label) return null;
  const series = SERIES.get(key(label)) ?? (label === "AMD Opteron" ? Array.from(SERIES.values()).find(item => item.name.startsWith("AMD Opteron")) : undefined);
  const lifecycle = LIFECYCLE.get(key(label));
  return { label: series?.name ?? label, releases: series?.releases ?? null, lifecycle: lifecycle?.vcf9x ?? null, codeName: lifecycle?.codeName ?? "" };
}

/** Why a CPU cannot run the target release, from the guide and KB 318697; null when nothing blocks it. */
export function cpuBlockReason(generation: CpuGeneration, targetRelease: string): string | null {
  const guide = `Broadcom Compatibility Guide (${VCF_CORPUS.compatibilityGuide})`;
  if (generation.lifecycle === "discontinued") return `${generation.label}${generation.codeName ? ` (${generation.codeName})` : ""} is Discontinued for VCF 9.x in KB 318697: the ESX installer blocks it.${generation.releases?.length ? ` The ${guide} lists it through ${generation.releases[0]}.` : ""}`;
  if (!generation.releases) return `${generation.label} is not in the ${guide} CPU list for any ESXi release.`;
  if (!generation.releases.includes(targetRelease)) return `The ${guide} lists ${generation.label} through ${generation.releases[0] ?? "no release"}, not ${targetRelease}.`;
  return null;
}

/** KB 318697 and KB 428874 wording for a CPU that runs VCF 9.x but not the next major release. */
export function cpuDeprecation(generation: CpuGeneration): { detail: string; nextAction: string; kbIds: string[] } | null {
  if (generation.lifecycle !== "deprecated" && generation.lifecycle !== "deprecated-override") return null;
  const override = generation.lifecycle === "deprecated-override";
  return {
    detail: `${generation.label}${generation.codeName ? ` (${generation.codeName})` : ""} is Deprecated in KB 318697: it runs VCF 9.x, the installer shows CPU_SUPPORT_WARNING, and support ends with the next major release.${override ? " Skylake-SP needs the OVERRIDE procedure attached to KB 428874 to install or upgrade." : ""}`,
    nextAction: `Plan to replace these hosts before the next major VCF release.${override ? " Use the KB 428874 OVERRIDE procedure for the 9.x install or upgrade." : ""}`,
    kbIds: override ? ["318697", "428874"] : ["318697"],
  };
}

type EsxRelease = (typeof ESX_BUILDS)[number];
const MAJOR_RELEASES = ESX_BUILDS.filter(item => /^\d+\.\d+\.\d+\.0$/.test(item.version));

/** The host's ESX build and the date it shipped, when the version string carries a build number. */
export function esxBuildOf(esxiVersion: string): { version: string; build: number; releaseDate: string | null; known: EsxRelease | null } | null {
  const build = Number(esxiVersion.match(/build[- ]?(\d{5,})/i)?.[1] ?? 0);
  const version = esxiVersion.match(/\b(\d+\.\d+(?:\.\d+)?)\b/)?.[1] ?? "";
  if (!build) return null;
  const known = ESX_BUILDS.find(item => item.build === build) ?? null;
  // Builds rise over time across release lines, so an unlisted build shipped no earlier than the newest listed build below it.
  const floor = known ?? [...ESX_BUILDS].reverse().find(item => item.build < build) ?? null;
  return { version, build, releaseDate: floor?.releaseDate ?? null, known };
}

/**
 * KB 450972 and KB 454369: a source build released after the target release cannot upgrade or converge to it.
 * Returns the first release of the target line that ships after the source, for example 9.1.1 for 8.0 U3j.
 */
export function backInTime(esxiVersion: string, targetRelease: string): { source: string; sourceDate: string; targetDate: string; minimum: string } | null {
  const host = esxBuildOf(esxiVersion);
  const line = targetRelease.match(/(\d+\.\d+)/)?.[1];
  if (!host?.releaseDate || !line || !host.version.startsWith("8.")) return null;
  const releases = MAJOR_RELEASES.filter(item => item.version.startsWith(`${line}.`));
  const ga = releases[0];
  if (!ga || host.releaseDate <= ga.releaseDate) return null;
  const minimum = releases.find(item => item.releaseDate > host.releaseDate!);
  return {
    source: host.known ? `ESX ${host.known.version} (build ${host.build})` : `ESXi ${host.version} build ${host.build}`,
    sourceDate: host.releaseDate,
    targetDate: ga.releaseDate,
    minimum: minimum ? minimum.version.replace(/\.0$/, "") : `a ${line}.x release after ${host.releaseDate}`,
  };
}

/** Partner statements for this server model that stop short of Broadcom's (Broadcom governs). */
export function vendorServerNote(vendor: string, model: string): (typeof VENDOR_SERVER_NOTES)[number] | null {
  const model_ = key(model);
  const vendor_ = key(vendor);
  return VENDOR_SERVER_NOTES.find(note => {
    const platform = key(note.platform.replace(/\(.*?\)/g, ""));
    return platform.length >= 4 && model_.includes(platform) && (!note.vendor || vendor_.includes(key(note.vendor)) || key(note.vendor).includes(vendor_.slice(0, 3)));
  }) ?? null;
}
