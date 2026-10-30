import { describe, expect, it } from "vitest";
import { applyCustomerBrief } from "../shared/briefImport";
import { buildAdoptionPlans, createDefaultDocument, getHclSchedulePath, inventoryInScope } from "../shared/fcp";
import { emptyHclInventoryEvidence } from "../shared/hcl";
import { harborPointLogistics } from "./fixtures/fcpFixtures";

const SUPPORTED_CPU = "Intel(R) Xeon(R) Gold 6430";
const UNSUPPORTED_CPU = "Intel(R) Xeon(R) Gold 6230";

/** Three supported hosts and one unsupported host named esx-old01 (fake data). */
function mixedEstate() {
  const document = createDefaultDocument();
  const host = (name: string, cpuModel: string) => ({ name, cluster: "Cluster-A", vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel, esxiVersion: "8.0.3", socketCount: 2, coresPerSocket: 16, biosVersion: "1.0.0", biosDate: "2024-01-01" });
  const hclEvidence = emptyHclInventoryEvidence();
  hclEvidence.hosts = [host("esx01", SUPPORTED_CPU), host("esx02", SUPPORTED_CPU), host("esx03", SUPPORTED_CPU), host("esx-old01", UNSUPPORTED_CPU)];
  hclEvidence.nics = [{ host: "esx-old01", cluster: "Cluster-A", device: "vmnic0", driver: "ixgben", speedMb: 10000, switchName: "vSwitch0" }];
  Object.assign(document.inventory, {
    hosts: 4,
    physicalCores: 128,
    hostModels: [
      { vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel: SUPPORTED_CPU, hosts: 3, physicalCores: 96, esxiVersions: [{ version: "8.0.3", hosts: 3 }], esxiCorrelation: "per-platform" },
      { vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel: UNSUPPORTED_CPU, hosts: 1, physicalCores: 32, esxiVersions: [{ version: "8.0.3", hosts: 1 }], esxiCorrelation: "per-platform" },
    ],
    hclEvidence,
  });
  Object.assign(document.fields, {
    targetStart: "2027-01-01",
    targetComplete: "2028-01-01",
    adoptionCadence: "month",
    adoptionDetails: { ...document.fields.adoptionDetails, upgradePath: "in-place" },
  });
  return document;
}

const bars = (document: ReturnType<typeof mixedEstate>) => buildAdoptionPlans(document.fields, document.inventory).adoptionTimeline.lanes.flatMap(lane => lane.bars);

describe("hardware path", () => {
  it("reads 0 and 0 new hosts in the brief as existing hardware", () => {
    expect(harborPointLogistics().fields.hardwareAvailability).toBe("existing");
  });

  it("imports excluded hosts and warns on a wrong type", () => {
    const brief = JSON.parse(JSON.stringify({ discovery: { excludedHosts: [" esx-old01 ", "", "esx-old02"] } }));
    const imported = applyCustomerBrief(createDefaultDocument(), brief);
    expect(imported.document.fields.adoptionDetails.excludedHosts).toEqual(["esx-old01", "esx-old02"]);
    const bad = applyCustomerBrief(createDefaultDocument(), { discovery: { excludedHosts: "esx-old01" } });
    expect(bad.document.fields.adoptionDetails.excludedHosts).toEqual([]);
    expect(bad.warnings).toContain("discovery.excludedHosts: expected a list of host names; ignored");
  });

  it("checks compatibility only over in-scope hosts", () => {
    const document = mixedEstate();
    expect(getHclSchedulePath(document.inventory)).toBe("red");
    const scoped = inventoryInScope(document.inventory, ["ESX-OLD01"]);
    expect(scoped.hosts).toBe(3);
    expect(scoped.hostModels.map(platform => platform.cpuModel)).toEqual([SUPPORTED_CPU]);
    expect(scoped.hclEvidence.nics).toEqual([]);
    expect(getHclSchedulePath(scoped)).toBe("green");

    document.fields.adoptionDetails.excludedHosts = ["esx-old01"];
    expect(bars(document).some(bar => bar.id === "bar-hcl-remediation" || bar.id === "bar-hcl-procurement")).toBe(false);
  });

  it("turns a red result on existing hardware into an exceptions task beside mobilization", () => {
    const document = mixedEstate();
    document.fields.hardwareAvailability = "existing";
    const timeline = bars(document);
    expect(timeline.some(bar => bar.id === "bar-hcl-procurement" || bar.id === "bar-hcl-greenfield")).toBe(false);
    const exceptions = timeline.find(bar => bar.id === "bar-hcl-remediation");
    const mobilization = timeline.find(bar => bar.id === "bar-platform-plan");
    expect(exceptions).toMatchObject({ label: "Resolve Compatibility Exceptions" });
    expect(exceptions!.startCol).toBe(mobilization!.startCol);
    expect(timeline.find(bar => bar.id === "bar-hcl-gate")?.dependsOn).toBe("Confirmed when each unsupported host has an approved exception, a replacement, or is excluded from scope.");
  });

  it("keeps the procurement path when the hardware is not known to be reused", () => {
    const document = mixedEstate();
    document.fields.hardwareAvailability = "unknown";
    expect(bars(document).some(bar => bar.id === "bar-hcl-procurement")).toBe(true);
  });
});
