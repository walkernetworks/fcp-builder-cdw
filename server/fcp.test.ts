import { describe, expect, it } from "vitest";
import { parseRvToolsFiles } from "../client/src/lib/rvtools";
import { assessReadiness, buildTimeline, createDefaultDocument, migrateDocument, validateTimeline } from "../shared/fcp";
import type { TrpcContext } from "./_core/context";
import { renderFcpHtml } from "./fcpRenderer";
import { appRouter } from "./routers";

function csvFile(name: string, rows: string[][]) {
  const content = rows.map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
  return new File([content], name, { type: "text/csv" });
}

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
function authenticatedContext(): TrpcContext {
  const user: AuthenticatedUser = { id: 7, openId: "cdw-test-user", email: "sa@example.test", name: "Test SA", loginMethod: "trusted-proxy", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  return { user, req: { headers: {}, protocol: "https" }, res: {} } as TrpcContext;
}

describe("RVTools local import", () => {
  it("aggregates multiple CSV exports and deduplicates stable host and VM identifiers", async () => {
    const vHost = csvFile("vHost.csv", [
      ["UUID", "Datacenter", "Cluster", "Host", "# Cores", "ESX Version", "Vendor", "Model", "CPU Model"],
      ["host-1", "DC1", "Cluster-A", "esx01", "32", "8.0.3", "Dell", "R760", "Intel Xeon"],
      ["host-2", "DC1", "Cluster-A", "esx02", "32", "7.0.3", "Dell", "R760", "Intel Xeon"],
    ]);
    const vInfo = csvFile("vInfo.csv", [
      ["VM UUID", "VM", "Powerstate", "CPUs", "Memory", "OS according to the configuration file"],
      ["vm-1", "app01", "poweredOn", "4", "8192", "Windows Server"],
      ["vm-2", "app02", "poweredOff", "2", "4096", "Linux"],
      ["vm-1", "app01 duplicate", "poweredOn", "4", "8192", "Windows Server"],
    ]);
    const result = await parseRvToolsFiles([vHost, vInfo]);
    expect(result.sources).toHaveLength(2);
    expect(result.summary.hosts).toBe(2);
    expect(result.summary.physicalCores).toBe(64);
    expect(result.summary.vmCount).toBe(2);
    expect(result.summary.poweredOnVms).toBe(1);
    expect(result.summary.esxiVersions).toEqual(expect.arrayContaining([{ version: "7.0.3", hosts: 1 }]));
  });
});

describe("deterministic VCF plan", () => {
  it("flags observable risks without claiming HCL certification", () => {
    const document = createDefaultDocument();
    document.fields.entitledCores = 32;
    Object.assign(document.inventory, { hosts: 2, vmCount: 120, poweredOnVms: 100, physicalCores: 64, esxiVersions: [{ version: "7.0.3", hosts: 2 }], hostModels: [{ vendor: "Dell", model: "R740", cpuModel: "Intel", hosts: 2, physicalCores: 64 }] });
    const readiness = assessReadiness(document.fields, document.inventory);
    expect(readiness.items.find(item => item.id === "software-baseline")?.status).toBe("attention");
    expect(readiness.items.find(item => item.id === "core-entitlement")?.status).toBe("attention");
    expect(readiness.items.find(item => item.id === "hardware-compatibility")?.status).toBe("unknown");
    expect(readiness.disclaimer).toContain("not an HCL certification");
  });

  it("creates a no-overlap timeline with an explicit procurement gate", () => {
    const document = createDefaultDocument();
    document.fields.hardwareAvailability = "new";
    document.fields.hardwareLeadWeeks = 18;
    document.fields.priorities = ["operations", "automation", "security", "resilience"];
    Object.assign(document.inventory, { vmCount: 1800, poweredOnVms: 1600, hosts: 40 });
    const draft = buildTimeline(document.fields, document.inventory);
    expect(draft.timeline.lanes.some(lane => lane.name === "Hardware Readiness")).toBe(true);
    expect(draft.timeline.lanes.some(lane => lane.name === "Security")).toBe(true);
    expect(draft.timeline.lanes.some(lane => lane.name === "Resilience")).toBe(true);
    expect(validateTimeline(draft.timeline)).toEqual([]);
  });

  it("migrates the earlier manual-intake document without losing customer and timeline context", () => {
    const current = createDefaultDocument();
    const migrated = migrateDocument({ version: 1, fields: { customerName: "Meridian Health", cust: "MER", entitlement: "256", termEnd: "2029-12-31", vmCount: "980", hostCount: "22", hardwareIsNetNew: true, hardwareLeadMonths: 4, vdefendInScope: true, notes: "No December changes" }, timeline: current.timeline, rationale: "Existing rationale" });
    expect(migrated.version).toBe(2);
    expect(migrated.fields.customerName).toBe("Meridian Health");
    expect(migrated.fields.accountId).toBe("MER");
    expect(migrated.inventory.vmCount).toBe(980);
    expect(migrated.fields.hardwareLeadWeeks).toBe(16);
    expect(migrated.fields.priorities).toContain("security");
  });
});

describe("exports and access boundary", () => {
  it("renders synchronized inventory, readiness, and timeline views with no unresolved tokens", () => {
    const document = createDefaultDocument();
    document.fields.customerName = "Meridian Health";
    document.fields.entitledCores = 128;
    Object.assign(document.inventory, { sourceCount: 2, hosts: 4, physicalCores: 128, vmCount: 220, poweredOnVms: 200 });
    document.readiness = assessReadiness(document.fields, document.inventory);
    const draft = buildTimeline(document.fields, document.inventory);
    document.timeline = draft.timeline;
    document.rationale = draft.rationale;
    const html = renderFcpHtml("Meridian FCP", document);
    expect(html).toContain("Meridian Health");
    expect(html).toContain("Inventory-informed VCF 9.1 pre-assessment");
    expect(html).toContain("Private Cloud Gantt");
    expect(html).toContain("Generated without AI");
    expect(html).not.toMatch(/\[\[[^\]]+\]\]/);
  });

  it("returns an authenticated standalone HTML download with a safe filename", async () => {
    const document = createDefaultDocument();
    document.fields.customerName = "Meridian Health";
    const result = await appRouter.createCaller(authenticatedContext()).document.html({ title: "Meridian Health / FCP", data: document });
    expect(result.filename).toBe("Meridian-Health-FCP.html");
    expect(result.content).toContain("Generated without AI");
  });

  it("rejects business-data procedures without an authenticated user", async () => {
    const ctx = { user: null, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext;
    const caller = appRouter.createCaller(ctx);
    await expect(caller.engagement.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.document.html({ title: "No access", data: createDefaultDocument() })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
