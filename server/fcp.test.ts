import { describe, expect, it } from "vitest";
import { parseRvToolsFiles } from "../client/src/lib/rvtools";
import { applyTimelineGesture, assessReadiness, buildAdoptionPlans, buildMonthColumns, buildTwoYearColumns, createDefaultDocument, migrateDocument, normalizeActivityLabel, normalizeWorkstreamLabel, validateTimeline, type Timeline } from "../shared/fcp";
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
  });
});

describe("calendar-month adoption plans", () => {
  it("builds inclusive entitlement-month columns and an independent 24-month plan", () => {
    expect(buildMonthColumns("2027-01-15", "2027-06-30")).toEqual(["Jan 27", "Feb 27", "Mar 27", "Apr 27", "May 27", "Jun 27"]);
    const twoYear = buildTwoYearColumns("2027-01-15");
    expect(twoYear).toHaveLength(24);
    expect(twoYear[0]).toBe("Jan 27");
    expect(twoYear[23]).toBe("Dec 28");
  });

  it("uses entitlement value and term while generating only Plan and Design activities", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, {
      entitlementAmount: 2_500_000,
      entitlementStart: "2027-01-01",
      entitlementEnd: "2027-12-31",
      priorities: ["operations", "automation", "security", "resilience"],
    });
    Object.assign(document.inventory, { vmCount: 1800, poweredOnVms: 1600, hosts: 40 });
    const plans = buildAdoptionPlans(document.fields, document.inventory);
    const labels = [...plans.adoptionTimeline.lanes, ...plans.twoYearPlan.lanes].flatMap(lane => [lane.name, ...lane.bars.map(activity => activity.label)]);
    expect(plans.adoptionTimeline.columns).toHaveLength(12);
    expect(plans.twoYearPlan.columns).toHaveLength(24);
    expect(plans.rationale).toContain("$2,500,000");
    expect(labels.every(label => /(Plan|Design)$/.test(label))).toBe(true);
    expect(labels.join(" ")).not.toMatch(/Workshop|Readiness|Assessment|Validation/i);
    expect(validateTimeline(plans.adoptionTimeline)).toEqual([]);
    expect(validateTimeline(plans.twoYearPlan)).toEqual([]);
  });

  it("normalizes custom labels to title-style Plan or Design language", () => {
    expect(normalizeActivityLabel("operations design")).toBe("Operations Design");
    expect(normalizeActivityLabel("network workshop")).toBe("Network Plan");
    expect(normalizeActivityLabel("DR design")).toBe("DR Design");
    expect(normalizeWorkstreamLabel("platform readiness")).toBe("Platform Plan");
  });

  it("applies month drag and edge resize gestures while rejecting bounds and overlap conflicts", () => {
    const timeline: Timeline = {
      columns: ["Jan 27", "Feb 27", "Mar 27", "Apr 27", "May 27", "Jun 27"],
      lanes: [{ id: "lane", name: "Platform Design", bars: [
        { id: "a", startCol: 1, endCol: 3, color: "blue", label: "Platform Plan", milestone: false, deferred: false },
        { id: "b", startCol: 5, endCol: 7, color: "teal", label: "Platform Design", milestone: false, deferred: false },
      ] }],
    };
    const moved = applyTimelineGesture(timeline, "lane", "a", "move", 1);
    expect(moved.lanes[0].bars[0]).toMatchObject({ startCol: 2, endCol: 4 });
    const resizedStart = applyTimelineGesture(timeline, "lane", "a", "start", 1);
    expect(resizedStart.lanes[0].bars[0]).toMatchObject({ startCol: 2, endCol: 3 });
    const resizedEnd = applyTimelineGesture(timeline, "lane", "a", "end", 1);
    expect(resizedEnd.lanes[0].bars[0]).toMatchObject({ startCol: 1, endCol: 4 });
    expect(applyTimelineGesture(timeline, "lane", "a", "move", -1)).toBe(timeline);
    expect(applyTimelineGesture(timeline, "lane", "a", "end", 3)).toBe(timeline);
  });

  it("migrates older engagements to entitlement-aware, normalized adoption plans", () => {
    const legacyTimeline = { columns: ["Wave 1", "Wave 2"], lanes: [{ id: "legacy", name: "readiness", bars: [{ id: "old", startCol: 1, endCol: 2, color: "blue", label: "workshop", milestone: false, deferred: false }] }] };
    const migrated = migrateDocument({ version: 1, fields: { customerName: "Meridian Health", cust: "MER", entitlement: "256", funds: "$1,750,000", termStart: "2027-01-01", termEnd: "2028-12-31", vmCount: "980", hostCount: "22", notes: "No December changes" }, timeline: legacyTimeline, rationale: "Old rationale" });
    expect(migrated.version).toBe(3);
    expect(migrated.fields.customerName).toBe("Meridian Health");
    expect(migrated.fields.entitlementAmount).toBe(1_750_000);
    expect(migrated.fields.entitlementStart).toBe("2027-01-01");
    expect(migrated.adoptionTimeline.columns[0]).toBe("Jan 27");
    expect(migrated.twoYearPlan.columns).toHaveLength(24);
    expect(JSON.stringify([migrated.adoptionTimeline, migrated.twoYearPlan])).not.toMatch(/Workshop|Readiness|Assessment|Validation/i);
  });
});

describe("planning considerations, exports, and access boundary", () => {
  it("keeps inventory observations transparent without placing excluded activities on either plan", () => {
    const document = createDefaultDocument();
    document.fields.entitledCores = 32;
    Object.assign(document.inventory, { hosts: 2, vmCount: 120, poweredOnVms: 100, physicalCores: 64, esxiVersions: [{ version: "7.0.3", hosts: 2 }], hostModels: [{ vendor: "Dell", model: "R740", cpuModel: "Intel", hosts: 2, physicalCores: 64 }] });
    const considerations = assessReadiness(document.fields, document.inventory);
    expect(considerations.items.find(item => item.id === "software-baseline")?.status).toBe("attention");
    expect(considerations.items.find(item => item.id === "core-entitlement")?.status).toBe("attention");
    expect(considerations.label).toBe("Inventory-Informed VCF 9.1 Planning Considerations");
  });

  it("renders entitlement details and both synchronized adoption views with neutral language", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, { customerName: "Meridian Health", entitledCores: 128, entitlementAmount: 3_000_000, entitlementStart: "2027-01-01", entitlementEnd: "2028-12-31" });
    Object.assign(document.inventory, { sourceCount: 2, hosts: 4, physicalCores: 128, vmCount: 220, poweredOnVms: 200 });
    const plans = buildAdoptionPlans(document.fields, document.inventory);
    Object.assign(document, { readiness: assessReadiness(document.fields, document.inventory), ...plans });
    const html = renderFcpHtml("Meridian FCP", document);
    expect(html).toContain("Meridian Health");
    expect(html).toContain("$3,000,000");
    expect(html).toContain("Adoption Timeline");
    expect(html).toContain("Two-Year Notional Adoption Plan");
    expect(html).not.toMatch(/Gantt|Workshop|Readiness/i);
    expect(html).not.toMatch(/\[\[[^\]]+\]\]/);
  });

  it("returns an authenticated standalone HTML download with a safe filename", async () => {
    const document = createDefaultDocument();
    document.fields.customerName = "Meridian Health";
    const result = await appRouter.createCaller(authenticatedContext()).document.html({ title: "Meridian Health / FCP", data: document });
    expect(result.filename).toBe("Meridian-Health-FCP.html");
    expect(result.content).toContain("Adoption Timeline");
  });

  it("rejects business-data procedures without an authenticated user", async () => {
    const ctx = { user: null, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext;
    const caller = appRouter.createCaller(ctx);
    await expect(caller.engagement.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.document.html({ title: "No Access", data: createDefaultDocument() })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
