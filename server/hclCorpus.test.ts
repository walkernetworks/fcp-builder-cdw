import { describe, expect, it } from "vitest";
import { assessHclEstate, assessHclPlatform, emptyHclInventoryEvidence, type HclInventoryEvidence } from "../shared/hcl";
import { backInTime, cpuGeneration } from "../shared/hclCorpus";
import { summarizeVcfCompatibility } from "../shared/fcp";

const host = (name: string, vendor: string, model: string, cpuModel: string, esxiVersion: string): HclInventoryEvidence["hosts"][number] =>
  ({ name, cluster: "Prod", vendor, model, cpuModel, esxiVersion, socketCount: 2, coresPerSocket: 16, biosVersion: "", biosDate: "" });

describe("compatibility rules from the VCF 9.1 corpus", () => {
  it("blocks CPUs the guide does not list for 9.x, whatever the server model", () => {
    const broadwell = assessHclPlatform("Dell Inc.", "PowerEdge R730", "Intel(R) Xeon(R) CPU E5-2697A v4 @ 2.60GHz");
    expect(broadwell).toMatchObject({ status: "not-supported", evidenceState: "explicit-exclusion", matchedCpuSeries: "Intel Xeon E5-2600-v4 Series" });
    expect(broadwell.detail).toContain("Discontinued for VCF 9.x in KB 318697");
    const workstation = assessHclPlatform("HP", "HP Z4 G4 Workstation", "Intel(R) Xeon(R) W-2245 CPU @ 3.90GHz");
    expect(workstation.status).toBe("not-supported");
    expect(workstation.detail).toContain("W-2200 Series is not in the Broadcom Compatibility Guide");
    // Blocked hosts count as blocked in the compatibility summary, not as evidence still required.
    expect(summarizeVcfCompatibility([{ vendor: "Dell Inc.", model: "PowerEdge R730", cpuModel: "Intel(R) Xeon(R) CPU E5-2697A v4 @ 2.60GHz", hosts: 7, hcl: broadwell } as never])[0].decision).toBe("action-required");
  });

  it("treats a model from a known vendor that is missing from the 9.x server list as not listed", () => {
    const blade = assessHclPlatform("HPE", "ProLiant BL460c Gen10", "Intel(R) Xeon(R) Gold 6148 CPU @ 2.40GHz");
    expect(blade).toMatchObject({ status: "not-supported", evidenceState: "verified-not-listed" });
  });

  it("confirms two-socket Xeon 6 Gen12 hosts instead of leaving the CPU row open", () => {
    expect(assessHclPlatform("HPE", "Synergy 480 Gen12", "INTEL(R) XEON(R) 6740P", "ESXi 9.1", 2)).toMatchObject({ status: "supported", matchedModel: "Synergy 480 Gen12 Compute Module" });
    expect(assessHclPlatform("HPE", "ProLiant DL380 Gen12", "INTEL(R) XEON(R) 6740P", "ESXi 9.1", 2).status).toBe("supported");
    // Without a socket count the four-socket row is still possible.
    expect(assessHclPlatform("HPE", "ProLiant DL380 Gen12", "INTEL(R) XEON(R) 6740P").status).toBe("supported-cpu-unverified");
  });

  it("keeps Deprecated CPUs supported for 9.x with their end of support", () => {
    const skylake = assessHclPlatform("Dell Inc.", "PowerEdge R640", "Intel(R) Xeon(R) Gold 6130 CPU @ 2.10GHz");
    expect(skylake.status).toBe("supported");
    expect(skylake.futureReleaseSupport.status).toBe("unsupported-from-release");
    expect(skylake.futureReleaseSupport.detail).toContain("OVERRIDE");
    expect(cpuGeneration("Intel(R) Xeon(R) Gold 6248 CPU @ 2.50GHz", "Intel Xeon Gold 6200/5200 (Cascade-Lake-SP/Refresh) Series")?.lifecycle).toBe("deprecated");
  });

  it("sends 8.0 U3j and later builds to 9.1.1, and leaves earlier builds alone", () => {
    expect(backInTime("VMware ESXi 8.0.3 build-25429389", "ESXi 9.1")).toMatchObject({ source: "ESX 8.0 U3j (build 25429389)", minimum: "9.1.1" });
    expect(backInTime("VMware ESXi 8.0.3 build-25595708", "ESXi 9.1")?.minimum).toBe("9.1.1");
    expect(backInTime("VMware ESXi 8.0.3 build-24674464", "ESXi 9.1")).toBeNull();
    expect(backInTime("VMware ESXi 8.0.3", "ESXi 9.1")).toBeNull();
  });

  it("raises estate findings for KB-named drivers, 7.x hosts, Deprecated CPUs and back-in-time builds", () => {
    const evidence: HclInventoryEvidence = {
      ...emptyHclInventoryEvidence(),
      tabs: { vhost: true, vnic: true, vhba: true },
      hosts: [
        host("esx01", "Dell Inc.", "PowerEdge R640", "Intel(R) Xeon(R) Gold 6130 CPU @ 2.10GHz", "VMware ESXi 8.0.3 build-25429389"),
        host("esx02", "Dell Inc.", "PowerEdge R730", "Intel(R) Xeon(R) CPU E5-2697A v4 @ 2.60GHz", "VMware ESXi 7.0.3 build-21930508"),
      ],
      nics: [{ host: "esx02", cluster: "Prod", device: "vmnic0", driver: "qfle3", speedMb: 10000, switchName: "" }, { host: "esx02", cluster: "Prod", device: "vmnic1", driver: "qfle3", speedMb: 10000, switchName: "" }],
      hbas: [{ host: "esx01", cluster: "Prod", device: "vmhba2", model: "", driver: "brcmfcoe" }],
    };
    const ids = assessHclEstate(evidence).findings.map(item => `${item.checkId}:${item.severity}`);
    expect(ids).toEqual(expect.arrayContaining([
      "HW.SERVER_CPU_NOT_SUPPORTED:BLOCKER",
      "NET.NIC_QFLE3:BLOCKER",
      "STO.HBA_BRCMFCOE:WARNING",
      "ESX.VERSION_7:WARNING",
      "ESX.BACK_IN_TIME:WARNING",
      "HW.CPU_DEPRECATED:WARNING",
      "HW.VENDOR_LISTING:ADVISORY",
    ]));
    // One qfle3 finding per host, listing its adapters.
    expect(assessHclEstate(evidence).findings.filter(item => item.checkId === "NET.NIC_QFLE3")).toHaveLength(1);
  });
});
