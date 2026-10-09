/**
 * Runs the v1 and v2 hours models over the same grid (edition, pathway, sites, hosts, prior assessment, no
 * outcomes) and writes the comparison, the v2 outcome sweeps, and the data for the hours reference page.
 *
 *   pnpm exec tsx scripts/hours-sweep.mts [output directory]
 *
 * Writes hours-sweep.json and hours-model-comparison.md to the output directory (default: docs/hours-reference).
 * Totals are the full scope in loaded hours with no entitlement, so nothing is scaled to a budget.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildScopedEffort, buildScopedEffortV1, scopedEffortLines } from "../shared/effort";
import { createDefaultDocument, refreshDerivedDocument, type Capability, type EngagementDocument } from "../shared/fcp";
import { loadedOf, scopeV2 } from "../shared/hoursV2";

const OUT = path.resolve(process.argv[2] ?? "docs/hours-reference");
const PATHS = ["undecided", "design-only", "in-place", "converge", "import-workload-domain", "greenfield", "hybrid"] as const;
const VVF_PATHS = new Set(["undecided", "design-only", "in-place", "converge", "greenfield"]);
const HOSTS = [8, 10, 16, 25, 40, 50, 65, 100, 150];
const SITES = [1, 2, 4];
export const AREAS: Record<string, [Capability, string[]]> = {
  operations: ["operations", ["lifecycle", "observability", "capacity-cost", "custom-dashboards", "identity-certificates", "event-integration"]],
  automation: ["automation", ["vm-self-service", "infrastructure-as-code", "day-2-automation", "governance", "application-provisioning", "data-services"]],
  networking: ["networking", ["physical-fabric", "edge-cluster-routing", "overlay-transport", "vpc", "load-balancing", "network-operations"]],
  security: ["security", ["segmentation", "identity-rbac", "hardening-compliance", "ids-ips", "malware-prevention", "identity-firewall", "security-intelligence", "waf"]],
  resilience: ["resilience", ["recovery-architecture", "recovery-exercises", "cyber-recovery", "cloud-cyber-recovery"]],
  kubernetes: ["kubernetes", ["workload-domains", "platform-operations", "developer-experience"]],
  privateAi: ["private-ai", ["gpu-capacity", "ai-guardrails", "pilot-onboarding"]],
};

type Plan = { edition?: "vcf" | "vvf"; path: string; hosts: number; sites?: number; assessment?: boolean; focus?: Record<string, string[]>; depth?: "tier-1" | "tier-2" | "tier-3" };

export function plan(input: Plan): EngagementDocument {
  let document = createDefaultDocument();
  const focus = input.focus ?? {};
  const priorities = Object.entries(AREAS).filter(([key]) => (focus[key] ?? []).length).map(([, [capability]]) => capability);
  const depth = input.depth ?? "not-selected";
  Object.assign(document.fields, {
    customerName: "Sweep", customerSegment: "commercial", entitlementStart: "2027-01-04", plannedProjectStart: "2027-01-04", priorities,
    adoptionDetails: {
      ...document.fields.adoptionDetails, platformEdition: input.edition ?? "vcf", upgradePath: input.path,
      ...Object.fromEntries(Object.keys(AREAS).map(key => [key, focus[key] ?? []])),
      componentDepths: { operations: depth, automation: depth, networkingSecurity: depth, kubernetesAi: depth, efficiency: "not-selected" },
    },
  });
  Object.assign(document.inventory, { hosts: input.hosts, vmCount: input.hosts * 20, poweredOnVms: input.hosts * 18, datacenters: input.sites ?? 1, clusters: Math.max(1, Math.ceil(input.hosts / 16)) });
  document.report.discovery = { ...document.report.discovery, assessmentCompleted: input.assessment ?? false };
  return refreshDerivedDocument(document);
}

/** v1 full-scope loaded hours, by line, with no envelope. */
export function v1Total(document: EngagementDocument) {
  const effort = buildScopedEffortV1(document);
  return { total: effort.internal.fullScopeHours, lines: scopedEffortLines(document).map(line => ({ code: line.code, base: line.base })) };
}
/** v2 Pass 1 loaded hours, by line. */
export function v2Total(document: EngagementDocument) {
  const pass1 = scopeV2(document);
  const lines = pass1.lines.map(line => ({ code: line.code, name: line.name, base: line.computedBase, loaded: loadedOf(pass1, line, line.computedBase), drivers: line.drivers }));
  return { total: pass1.technical + pass1.pm, pm: pass1.pm, lines };
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const grid: Array<Record<string, unknown>> = [];
  for (const edition of ["vcf", "vvf"] as const) for (const pathway of PATHS) {
    if (edition === "vvf" && !VVF_PATHS.has(pathway)) continue;
    for (const sites of SITES) for (const hosts of HOSTS) for (const assessment of [false, true]) {
      const document = plan({ edition, path: pathway, hosts, sites, assessment });
      const v1 = v1Total(document);
      const v2 = v2Total(document);
      const stages = (effort: ReturnType<typeof buildScopedEffortV1>) => effort.workPackages.filter(row => row.total > 0).map(row => [row.label.replace(/^(Month \d+|Weeks? [\d–-]+): /, ""), row.architect, row.srConsultant, row.projectManager, row.total]);
      const v2Stages = stages(buildScopedEffort({ ...document, fields: { ...document.fields, hoursModel: "v2" } }));
      grid.push({ edition, path: pathway, sites, hosts, assessment, v1: v1.total, v2: v2.total, delta: v1.total ? (v2.total - v1.total) / v1.total : null, v1Lines: v1.lines, v2Lines: v2.lines, v1Stages: stages(buildScopedEffortV1(document)), v2Stages });
    }
  }
  const outcomes: Array<Record<string, unknown>> = [];
  for (const [area, [, focuses]] of Object.entries(AREAS)) for (const focus of focuses) for (const pathway of ["greenfield", "design-only"]) {
    const document = plan({ path: pathway, hosts: 40, focus: { [area]: [focus] } });
    const base = v2Total(plan({ path: pathway, hosts: 40 }));
    const v2 = v2Total(document);
    const baseCodes = new Map(base.lines.map(line => [line.code, line.base]));
    outcomes.push({ area, focus, path: pathway, added: v2.lines.filter(line => (baseCodes.get(line.code) ?? 0) !== line.base).map(line => ({ code: line.code, name: line.name, base: line.base - (baseCodes.get(line.code) ?? 0), drivers: line.drivers })), total: v2.total, v1Total: v1Total(document).total });
  }
  // The spec 7.8 outcome set at each depth tier.
  const combinations = (["tier-1", "tier-2", "tier-3"] as const).map(depth => {
    const document = plan({ path: "converge", hosts: 40, focus: { operations: ["lifecycle", "observability"], security: ["segmentation"], automation: ["vm-self-service"] }, depth });
    return { depth, ...v2Total(document), v1Total: v1Total(document).total };
  });
  const pct = (value: number | null) => (value === null ? "" : `${value >= 0 ? "+" : ""}${Math.round(value * 100)}%`);
  // Spec section 1 and 3 deltas: base hours, no outcomes, 1 site, discovery in scope, migration waves left out.
  const cell = (pathway: string, hosts: number) => grid.find(row => row.edition === "vcf" && row.path === pathway && row.sites === 1 && row.hosts === hosts && !row.assessment)!;
  const baseWithoutWaves = (lines: unknown) => (lines as Array<{ code: string; base: number }>).filter(line => !line.code.startsWith("FILL")).reduce((sum, line) => sum + line.base, 0);
  const greenfield = (hosts: number) => { const row = cell("greenfield", hosts); const v1 = baseWithoutWaves(row.v1Lines); const v2 = baseWithoutWaves(row.v2Lines); return { v1, v2, delta: (v2 - v1) / v1 }; };
  const lineBase = (document: EngagementDocument, code: string) => scopeV2(document).lines.filter(line => line.code === code).reduce((sum, line) => sum + line.computedBase, 0);
  const withInputs = (input: Plan, inventory: Partial<EngagementDocument["inventory"]>, discovery: Partial<EngagementDocument["report"]["discovery"]>, estimate: EngagementDocument["fields"]["estimateInputs"] = {}) => {
    const document = plan(input);
    Object.assign(document.inventory, inventory);
    document.report.discovery = { ...document.report.discovery, ...discovery };
    document.fields.estimateInputs = estimate;
    return document;
  };
  const checks: Array<{ claim: string; expected: string; result: string; hit: boolean }> = [];
  for (const hosts of [8, 10, 16, 25]) { const g = greenfield(hosts); checks.push({ claim: `Greenfield ${hosts} hosts, 1 site`, expected: "within plus or minus 15% of v1", result: `${pct(g.delta)} (v1 ${Math.round(g.v1)}, v2 ${Math.round(g.v2)} base)`, hit: Math.abs(g.delta) <= 0.15 }); }
  for (const hosts of [40, 50, 65, 100]) { const g = greenfield(hosts); checks.push({ claim: `Greenfield ${hosts} hosts, 1 site`, expected: "20 to 30% below v1", result: `${pct(g.delta)} (v1 ${Math.round(g.v1)}, v2 ${Math.round(g.v2)} base)`, hit: g.delta <= -0.2 && g.delta >= -0.3 }); }
  { const g = greenfield(150); checks.push({ claim: "Greenfield 150 hosts, 1 site", expected: "about 55% below v1", result: `${pct(g.delta)} (v1 ${Math.round(g.v1)}, v2 ${Math.round(g.v2)} base)`, hit: Math.abs(g.delta + 0.55) <= 0.03 }); }
  for (const clusters of [10, 6]) {
    const buvm = lineBase(withInputs({ path: "in-place", hosts: 150 }, { clusters }, { vcenters: 1 }), "C1");
    checks.push({ claim: `In-place VCF 150 hosts, ${clusters} clusters: Bring Under VCF Management`, expected: "about 110 base (spec assumes 6 clusters)", result: `C1 ${buvm.toFixed(1)} base`, hit: Math.abs(buvm - 110) <= 5 });
  }
  for (const [vms, expected] of [[100, 89], [500, 217]] as const) {
    const waves = lineBase(withInputs({ path: "greenfield", hosts: 8 }, { vmCount: vms }, {}), "FILL_mig");
    checks.push({ claim: `FILL_mig at ${vms} VMs`, expected: `about ${expected} base`, result: `${waves.toFixed(1)} base`, hit: Math.abs(waves - expected) <= 3 });
  }
  { const dd = lineBase(withInputs({ path: "greenfield", hosts: 51 }, {}, { vcenters: 1 }), "DD"); checks.push({ claim: "DD at 51 hosts, 1 site, 1 vCenter", expected: "about 38", result: dd.toFixed(2), hit: Math.abs(dd - 38) <= 1 }); }
  { const dd = lineBase(withInputs({ path: "greenfield", hosts: 150, sites: 3 }, {}, { vcenters: 4 }), "DD"); checks.push({ claim: "DD at 150 hosts, 4 vCenters, 3 sites", expected: "about 95", result: dd.toFixed(2), hit: Math.abs(dd - 95) <= 1 }); }
  for (const nsx of [true, false]) {
    const x1 = lineBase(withInputs({ path: "import-workload-domain", hosts: 32 }, { clusters: 2 }, { vcenters: 1, enhancedLinkedMode: false }, { noExistingNsx: nsx, source8x: false }), "X1");
    checks.push({ claim: `X1 small clean import (32 hosts, 2 clusters, 9.x, ${nsx ? "NSX to deploy" : "NSX present"})`, expected: "40 to 50", result: x1.toFixed(1), hit: x1 >= 40 && x1 <= 50 });
  }
  { const x1 = lineBase(withInputs({ path: "import-workload-domain", hosts: 150 }, { clusters: 6 }, { vcenters: 1, enhancedLinkedMode: false }, { noExistingNsx: true, source8x: true }), "X1"); checks.push({ claim: "X1 150 hosts, 6 clusters, 8.x, new NSX", expected: "about 120", result: x1.toFixed(1), hit: Math.abs(x1 - 120) <= 5 }); }

  writeFileSync(path.join(OUT, "hours-sweep.json"), JSON.stringify({ grid, outcomes, combinations, checks }, null, 1));

  const rows = grid.map(row => `| ${row.edition} | ${row.path} | ${row.sites} | ${row.hosts} | ${row.assessment ? "yes" : "no"} | ${Math.round(row.v1 as number)} | ${Math.round(row.v2 as number)} | ${pct(row.delta as number | null)} |`);
  const outcomeRows = outcomes.map(row => `| ${row.path} | ${row.area} | ${row.focus} | ${(row.added as Array<{ code: string; base: number }>).map(line => `${line.code} ${Math.round(line.base * 10) / 10}`).join(", ")} | ${Math.round(row.v1Total as number)} | ${Math.round(row.total as number)} |`);
  writeFileSync(path.join(OUT, "hours-model-comparison.md"), [
    "# Hours model comparison: v1 and v2",
    "",
    "Generated by `scripts/hours-sweep.mts`. Full scope in loaded hours (lead, secondary and PM) with no entitlement. Inventory assumed: 20 VMs per host, one cluster per 16 hosts, one vCenter, one VCF instance, existing hardware, topology undecided.",
    "",
    "## Spec deltas",
    "",
    "The deltas the spec states (sections 1 and 3), checked against this implementation. Greenfield deltas compare base hours without migration waves, as the spec states them. A flagged row is reported, not tuned.",
    "",
    "| Claim | Spec expects | v2 result | |",
    "|---|---|---|---|",
    ...checks.map(row => `| ${row.claim} | ${row.expected} | ${row.result} | ${row.hit ? "hit" : "FLAG"} |`),
    "",
    "## Base plans (no outcomes)",
    "",
    "| Edition | Pathway | Sites | Hosts | Prior assessment | v1 | v2 | Delta |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "## v2 outcomes, one at a time (40 hosts, 1 site)",
    "",
    "Lines and base hours each outcome adds over the base plan; totals are the whole plan.",
    "",
    "| Pathway | Area | Outcome | v2 lines added (base) | v1 total | v2 total |",
    "|---|---|---|---|---|---|",
    ...outcomeRows,
    "",
    "## Spec 7.8 outcome set by depth (converge, 40 hosts)",
    "",
    "| Depth | v1 total | v2 total |",
    "|---|---|---|",
    ...combinations.map(row => `| ${row.depth} | ${Math.round(row.v1Total)} | ${Math.round(row.total)} |`),
    "",
  ].join("\n"));
  console.log(`Wrote ${grid.length} grid cells, ${outcomes.length} outcome runs and ${combinations.length} combinations to ${OUT}`);
}

main();
