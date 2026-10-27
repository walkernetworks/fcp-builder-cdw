import { describe, expect, it } from "vitest";
import { createDefaultDocument, refreshDerivedDocument, type EngagementDocument } from "../shared/fcp";
import { renderCompatibilityHandoffHtml } from "./compatibilityHandoffRenderer";

// The standalone Compatibility Delivery Handoff is redesigned in its own PR. Until then it must render exactly as it
// did before the report formats work: these goldens were captured from the renderer before any format change.
function estate(populated: boolean): EngagementDocument {
  const document = createDefaultDocument();
  document.fields.customerName = "Northwind Mfg";
  if (populated) {
    Object.assign(document.inventory, {
      hosts: 9,
      physicalCores: 384,
      hostModels: [
        { vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel: "Intel(R) Xeon(R) Gold 6430", hosts: 4, physicalCores: 256, esxiVersions: [{ version: "8.0.3", hosts: 4 }], esxiCorrelation: "per-platform", clusterMembership: [{ name: "Prod-A", hosts: 4 }] },
        { vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel: "Intel(R) Xeon(R) Gold 6230", hosts: 2, physicalCores: 128, esxiVersions: [{ version: "8.0.3", hosts: 2 }], esxiCorrelation: "per-platform", clusterMembership: [{ name: "Prod-B", hosts: 2 }] },
        { vendor: "Cisco Systems Inc", model: "UCSC-C220-M5SX", cpuModel: "Intel(R) Xeon(R) Silver 4210 CPU @ 2.20GHz", hosts: 3, physicalCores: 48, esxiVersions: [{ version: "8.0.3", hosts: 3 }], esxiCorrelation: "per-platform", clusterMembership: [{ name: "Edge", hosts: 3 }] },
      ],
    });
  }
  return refreshDerivedDocument(document);
}

describe("standalone Compatibility Delivery Handoff (baseline before the report formats)", () => {
  it("renders an empty estate byte-identical to the golden copy", async () => {
    await expect(renderCompatibilityHandoffHtml("Northwind Mfg", estate(false))).toMatchFileSnapshot("./__golden__/compat-handoff-empty.html");
  });

  it("renders a populated estate byte-identical to the golden copy", async () => {
    await expect(renderCompatibilityHandoffHtml("Northwind Mfg", estate(true))).toMatchFileSnapshot("./__golden__/compat-handoff-populated.html");
  });
});
