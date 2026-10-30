import { describe, expect, it } from "vitest";
import { storageLabel } from "../shared/report";
import { effectiveReport } from "../shared/reportView";
import { firstSentence } from "./fcpReportParts";
import { harborPointLogistics } from "./fixtures/fcpFixtures";

const source = (filename: string, extra: Record<string, unknown> = {}) => ({ id: filename, filename, byteSize: 1, sheets: ["vInfo"], importedAt: "2026-10-01T00:00:00.000Z", warnings: [], ...extra });
const openItems = (document: ReturnType<typeof harborPointLogistics>) => effectiveReport(document).openItems.map(item => item.item);

describe("brief-to-plan small fixes", () => {
  it("counts distinct vCenters across the exports for the RVTools open item", () => {
    const document = harborPointLogistics();
    document.report.discovery.vcenters = 3;
    // Two workbooks of the same vCenter and one of another: two of three vCenters exported.
    document.inventorySources = [source("a.xlsx", { vcenterKeys: ["0a1b2c3d"] }), source("a-again.xlsx", { vcenterKeys: ["0a1b2c3d"] }), source("b.xlsx", { vcenterKeys: ["9f8e7d6c"] })];
    expect(openItems(document)).toContain("RVTools exports for 2 of 3 vCenters");
    // Workbooks that do not say which vCenter they cover count one each.
    document.inventorySources = [source("a.xlsx"), source("b.xlsx")];
    expect(openItems(document)).toContain("RVTools exports for 2 of 3 vCenters");
  });

  it("raises an open item for an RVTools export more than 60 days before the as-of date", () => {
    const document = harborPointLogistics();
    document.report.asOf = "2026-10-15";
    document.inventorySources = [source("a.xlsx", { exportedOn: "2026-07-01" }), source("b.xlsx", { exportedOn: "2026-10-01" })];
    expect(openItems(document).find(item => item.startsWith("RVTools export from"))).toBe("RVTools export from 1 Jul 2026 is more than 60 days old");
    document.inventorySources = [source("b.xlsx", { exportedOn: "2026-10-01" })];
    expect(openItems(document).some(item => item.startsWith("RVTools export from"))).toBe(false);
  });

  it("labels the brief's storage code", () => {
    expect(storageLabel("vmfs-fc")).toBe("VMFS on Fibre Channel principal storage");
    expect(storageLabel("NFS-v3")).toBe("NFS v3 principal storage");
    expect(storageLabel("Pure FlashArray over iSCSI")).toBe("Pure FlashArray over iSCSI");
    expect(storageLabel("")).toBeNull();
  });

  it("cuts a long sentence at a clause or word boundary, never inside a word", () => {
    const long = "The customer keeps the existing Fibre Channel arrays for every production cluster, adds vSAN only for the new management domain, and retires the legacy NFS shares after the waves.";
    const cut = firstSentence(long, 120);
    expect(cut).toBe("The customer keeps the existing Fibre Channel arrays for every production cluster.");
    expect(cut.length).toBeLessThanOrEqual(120);
    const words = firstSentence("Supercalifragilistic expialidocious words keep going on and on without any commas at all in them anywhere", 60);
    expect(words.endsWith("…")).toBe(true);
    expect(long.includes(words.slice(0, -1)) || words.slice(0, -1).split(" ").every(word => /^[A-Za-z]+$/.test(word))).toBe(true);
  });
});
