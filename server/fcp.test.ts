import { describe, expect, it } from "vitest";
import { parseRvToolsFiles } from "../client/src/lib/rvtools";
import { applyTimelineGesture, assessReadiness, buildAdoptionPlans, buildMonthColumns, buildTwoYearNotionalColumns, buildWeekColumns, createDefaultDocument, migrateDocument, normalizeActivityLabel, normalizeWorkstreamLabel, validateTimeline, type Timeline } from "../shared/fcp";
import { appendIndustryDiscoveryPrompts, getIndustryDiscoveryTemplate, industryDiscoveryTemplates, removeIndustryDiscoveryPrompts } from "../shared/industryDiscovery";
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
    expect(result.summary.hostModels[0]).toMatchObject({
      vendor: "Dell",
      model: "R760",
      esxiCorrelation: "per-platform",
      esxiVersions: [{ version: "8.0.3", hosts: 1 }, { version: "7.0.3", hosts: 1 }],
    });
  });
});

describe("calendar-month adoption plans", () => {
  it("builds inclusive entitlement-month columns and a continuous 24-month Two-Year Notional column set", () => {
    expect(buildMonthColumns("2027-01-15", "2027-06-30")).toEqual(["Jan 27", "Feb 27", "Mar 27", "Apr 27", "May 27", "Jun 27"]);
    const twoYearNotional = buildTwoYearNotionalColumns("2027-01-15");
    expect(twoYearNotional).toHaveLength(24);
    expect(twoYearNotional[0]).toBe("Jan 27");
    expect(twoYearNotional[11]).toBe("Dec 27");
    expect(twoYearNotional[12]).toBe("Jan 28");
    expect(twoYearNotional[23]).toBe("Dec 28");
  });

  it("starts Upgrade Services while opening platform planning and design in parallel", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, {
      entitlementAmount: 2_500_000,
      entitlementStart: "2027-01-01",
      entitlementEnd: "2027-12-31",
      priorities: ["operations", "automation", "security", "resilience"],
      adoptionDetails: {
        ...document.fields.adoptionDetails,
        operations: ["capacity-cost"],
        automation: ["vm-self-service"],
        security: ["segmentation"],
        resilience: ["recovery-architecture", "recovery-exercises"],
      },
    });
    Object.assign(document.inventory, { vmCount: 1800, poweredOnVms: 1600, hosts: 40 });
    const plans = buildAdoptionPlans(document.fields, document.inventory);
    const labels = [...plans.adoptionTimeline.lanes, ...plans.twoYearPlan.lanes].flatMap(lane => [lane.name, ...lane.bars.map(activity => activity.label)]);
    const upgrade = plans.adoptionTimeline.lanes.find(lane => lane.id === "lane-upgrade-services")!;
    const platformPlan = plans.adoptionTimeline.lanes.find(lane => lane.id === "lane-platform-plan")!;
    const platformDesign = plans.adoptionTimeline.lanes.find(lane => lane.id === "lane-platform-design")!;
    expect(plans.adoptionTimeline.columns).toHaveLength(12);
    expect(plans.twoYearPlan).toMatchObject({ cadence: "month", startDate: "2027-01-01" });
    expect(plans.twoYearPlan.columns).toHaveLength(24);
    expect(plans.twoYearPlan.columns[0]).toBe("Jan 27");
    expect(plans.twoYearPlan.columns[11]).toBe("Dec 27");
    expect(plans.twoYearPlan.columns[12]).toBe("Jan 28");
    const twoYearActivities = plans.twoYearPlan.lanes.flatMap(lane => lane.bars);
    const mirroredUpgrade = plans.twoYearPlan.lanes.find(lane => lane.id === "lane-two-year-year-one-lane-upgrade-services")?.bars[0];
    expect(mirroredUpgrade).toMatchObject({ label: upgrade.bars[0].label, startCol: upgrade.bars[0].startCol, endCol: upgrade.bars[0].endCol });
    const followOnActivities = twoYearActivities.filter(activity => activity.id.startsWith("bar-follow-on-"));
    expect(followOnActivities.every(activity => activity.startCol >= 13)).toBe(true);
    expect(followOnActivities.map(activity => activity.label)).toEqual(expect.arrayContaining([
      "Capacity Forecasting and Cost Optimization",
      "Launch a Governed VM Self-Service Catalog",
      "Segment Workloads in Prioritized Rollout Waves",
      "Onboard Priority Workloads to Recovery Services",
      "Run Scheduled Recovery Exercises and Improve Runbooks",
    ]));
    expect(followOnActivities.every(activity => activity.dependsOn?.startsWith("Recommended because") && activity.dependsOn.includes("Start after"))).toBe(true);
    expect(followOnActivities.find(activity => activity.label === "Capacity Forecasting and Cost Optimization")).toMatchObject({ outcome: "Run rightsizing, forecasting, and cost-governance cycles against established capacity data." });
    expect(plans.twoYearPlan.lanes.map(lane => lane.name).join(" ")).not.toMatch(/Year [12] ·/);
    expect(plans.rationale).toContain("$2,500,000");
    expect(labels).toContain("VCF 9.1 Upgrade Services Scope and Runbook");
    expect(labels.join(" ")).not.toMatch(/Consumption Plan|Workshop|Readiness|Assessment|Validation/i);
    expect(upgrade.bars[0].startCol).toBe(1);
    expect(platformPlan.bars[0].startCol).toBe(1);
    expect(platformDesign.bars[0].startCol).toBeLessThan(upgrade.bars[0].endCol);
    expect(validateTimeline(plans.adoptionTimeline)).toEqual([]);
    expect(validateTimeline(plans.twoYearPlan)).toEqual([]);
  });

  it("creates exact weekly operational windows and detailed customer-confirmed capability activities", () => {
    expect(buildWeekColumns("2027-01-17", "2027-02-15")).toEqual([
      "Jan 17–Jan 23, 27", "Jan 24–Jan 30, 27", "Jan 31–Feb 6, 27", "Feb 7–Feb 13, 27", "Feb 14–Feb 20, 27",
    ]);
    const document = createDefaultDocument();
    Object.assign(document.fields, {
      entitlementStart: "2027-01-01",
      entitlementEnd: "2027-06-30",
      targetStart: "2027-01-17",
      targetComplete: "2027-02-15",
      adoptionCadence: "week",
      priorities: ["automation", "operations"],
      adoptionDetails: {
        ...document.fields.adoptionDetails,
        upgradePath: "migration-waves",
        automation: ["vm-self-service", "infrastructure-as-code"],
        operations: ["custom-dashboards"],
      },
    });
    const plans = buildAdoptionPlans(document.fields, document.inventory);
    const labels = plans.adoptionTimeline.lanes.flatMap(lane => lane.bars.map(activity => activity.label));
    expect(plans.adoptionTimeline).toMatchObject({ cadence: "week", startDate: "2027-01-17" });
    expect(plans.adoptionTimeline.columns).toEqual(buildWeekColumns("2027-01-17", "2027-02-15"));
    expect(labels).toEqual(expect.arrayContaining([
      "VCF 9.1 Migration Wave Services",
      "VM Self-Service Catalog Plan",
      "Infrastructure-as-Code Patterns Plan",
      "Custom Operations Dashboards Plan",
    ]));
    expect(plans.twoYearPlan).toMatchObject({ cadence: "month", startDate: "2027-01-17" });
    expect(plans.rationale).toContain("weekly execution windows");
    expect(plans.rationale).toContain("3 confirmed detailed capability focus areas");
  });

  it("omits generic follow-on placeholders when detailed selections or required signals are incomplete", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, {
      priorities: ["operations", "resilience", "private-ai"],
      hardwareAvailability: "unknown",
      adoptionDetails: {
        ...document.fields.adoptionDetails,
        operations: [],
        resilience: ["recovery-exercises"],
        privateAi: ["gpu-capacity", "ai-guardrails", "pilot-onboarding"],
      },
    });
    Object.assign(document.inventory, { vmCount: 300, hosts: 6, poweredOnVms: 280 });

    const plans = buildAdoptionPlans(document.fields, document.inventory);
    const followOnLanes = plans.twoYearPlan.lanes.filter(lane => lane.id.startsWith("lane-follow-on-"));
    const labels = followOnLanes.flatMap(lane => lane.bars.map(activity => activity.label));

    expect(followOnLanes).toEqual([]);
    expect(labels).not.toContain("Run Scheduled Recovery Exercises and Improve Runbooks");
    expect(labels).not.toContain("Onboard One Private AI Pilot With Success Measures");
    expect(JSON.stringify(plans.twoYearPlan)).not.toMatch(/Service Prioritization Decision|Year [12] ·/);
    expect(plans.rationale).toContain("no follow-on services are shown until a confirmed priority");
  });

  it("recommends compound services only after their detailed prerequisites and estate or hardware signals align", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, {
      priorities: ["operations", "resilience", "kubernetes", "private-ai"],
      hardwareAvailability: "new",
      adoptionDetails: {
        ...document.fields.adoptionDetails,
        operations: ["observability", "custom-dashboards"],
        resilience: ["recovery-architecture", "recovery-exercises"],
        kubernetes: ["workload-domains", "platform-operations"],
        privateAi: ["gpu-capacity", "ai-guardrails", "pilot-onboarding"],
      },
    });
    Object.assign(document.inventory, { vmCount: 480, hosts: 12, poweredOnVms: 440 });

    const plans = buildAdoptionPlans(document.fields, document.inventory);
    const activities = plans.twoYearPlan.lanes.flatMap(lane => lane.bars).filter(activity => activity.id.startsWith("bar-follow-on-"));
    const labels = activities.map(activity => activity.label);

    expect(labels).toEqual(expect.arrayContaining([
      "Operations Dashboards With Ownership and Review",
      "Onboard Priority Workloads to Recovery Services",
      "Run Scheduled Recovery Exercises and Improve Runbooks",
      "Pilot Kubernetes Workload Zones and Namespaces",
      "Operate the Kubernetes Fleet and Cluster Lifecycle",
      "Validate GPU Capacity and Resilience for an AI Workload Domain",
      "Define Private AI Data Boundaries and Governance",
      "Onboard One Private AI Pilot With Success Measures",
    ]));
    expect(activities.every(activity => activity.dependsOn?.includes("the customer selected") && activity.dependsOn.includes("Start after"))).toBe(true);
    expect(plans.rationale).toContain("follow-on service recommendations are shown");
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
    expect(migrated.version).toBe(10);
    expect(migrated.fields.customerName).toBe("Meridian Health");
    expect(migrated.fields.entitlementAmount).toBe(1_750_000);
    expect(migrated.fields.entitlementStart).toBe("2027-01-01");
    expect(migrated.adoptionTimeline.columns[0]).toBe("Jan 27");
    expect(migrated.twoYearPlan).toMatchObject({ startDate: "2027-01-01", cadence: "month" });
    expect(migrated.twoYearPlan.columns).toHaveLength(24);
    expect(JSON.stringify([migrated.adoptionTimeline, migrated.twoYearPlan])).toContain("Upgrade Services");
    expect(JSON.stringify([migrated.adoptionTimeline, migrated.twoYearPlan])).not.toMatch(/Consumption Plan|Workshop|Readiness|Assessment|Validation/i);
    expect(migrated.readiness.hardwarePlatforms).toEqual([]);
  });

  it("regenerates V9 plans as continuous Two-Year Notionals with researched follow-on services after Year 1", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, {
      entitlementStart: "2027-01-01",
      entitlementEnd: "2027-12-31",
      targetStart: "2027-01-17",
      priorities: ["operations"],
      adoptionDetails: { ...document.fields.adoptionDetails, operations: ["observability", "custom-dashboards"] },
    });
    Object.assign(document.inventory, { vmCount: 220, hosts: 4, poweredOnVms: 200 });
    const v9 = JSON.parse(JSON.stringify(document));
    v9.version = 9;

    const migrated = migrateDocument(v9);
    const operations = migrated.twoYearPlan.lanes.find(lane => lane.id === "lane-follow-on-operations");
    expect(migrated.version).toBe(10);
    expect(migrated.twoYearPlan).toMatchObject({ cadence: "month", startDate: "2027-01-17" });
    expect(migrated.twoYearPlan.columns).toHaveLength(24);
    expect(migrated.twoYearPlan.columns[0]).toBe("Jan 27");
    expect(migrated.twoYearPlan.columns[12]).toBe("Jan 28");
    expect(migrated.twoYearPlan.lanes.find(lane => lane.id === "lane-two-year-year-one-lane-operations")?.bars).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Health, Logs, and Diagnostics Observability Plan", startCol: expect.any(Number) }),
      expect.objectContaining({ label: "Custom Operations Dashboards Plan", startCol: expect.any(Number) }),
    ]));
    expect(operations?.bars).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Operations Dashboards With Ownership and Review",
        outcome: "Publish governed dashboards with support-team ownership, service measures, and a review cadence.",
        dependsOn: "Recommended because the customer selected Custom Operations Dashboards and Health, Logs, and Diagnostics Observability under the Operations priority and the imported estate shows 220 VMs across 4 hosts. Start after Custom Operations Dashboards Plan, once the dashboards, data sources, and ownership model are accepted.",
      }),
    ]));
  });
});

describe("planning considerations, exports, and access boundary", () => {
  it("keeps inventory observations transparent without placing excluded activities on either plan", () => {
    const document = createDefaultDocument();
    document.fields.entitledCores = 32;
    Object.assign(document.inventory, { hosts: 2, vmCount: 120, poweredOnVms: 100, physicalCores: 64, esxiVersions: [{ version: "7.0.3", hosts: 2 }], hostModels: [{ vendor: "Dell", model: "R740", cpuModel: "Intel", hosts: 2, physicalCores: 64, esxiVersions: [{ version: "7.0.3", hosts: 2 }], esxiCorrelation: "per-platform" }] });
    const considerations = assessReadiness(document.fields, document.inventory);
    expect(considerations.items.find(item => item.id === "software-baseline")?.status).toBe("attention");
    expect(considerations.items.find(item => item.id === "core-entitlement")?.status).toBe("attention");
    expect(considerations.label).toBe("Inventory-Informed VCF 9.1 Planning Considerations");
  });

  it("classifies RVTools host platforms into VCF 9.1 candidate and upgrade-required precheck outcomes", () => {
    const document = createDefaultDocument();
    Object.assign(document.inventory, {
      hosts: 10,
      physicalCores: 640,
      esxiVersions: [{ version: "8.0.3 build-25205845", hosts: 10 }],
      hostModels: [
        { vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel: "Intel Xeon Gold", hosts: 6, physicalCores: 384, esxiVersions: [{ version: "8.0.3 build-25205845", hosts: 6 }], esxiCorrelation: "per-platform" },
        { vendor: "Dell Inc.", model: "PowerEdge R730", cpuModel: "Intel Xeon E5", hosts: 3, physicalCores: 192, esxiVersions: [{ version: "8.0.3 build-25205845", hosts: 3 }], esxiCorrelation: "per-platform" },
        { vendor: "Dell Inc.", model: "PowerEdge R530", cpuModel: "Intel Xeon E5", hosts: 1, physicalCores: 64, esxiVersions: [{ version: "8.0.3 build-25205845", hosts: 1 }], esxiCorrelation: "per-platform" },
      ],
    });
    const readiness = assessReadiness(document.fields, document.inventory);
    expect(readiness.hardwarePlatforms.map(platform => [platform.model, platform.status, platform.hosts])).toEqual([
      ["PowerEdge R760", "candidate", 6],
      ["PowerEdge R730", "upgrade-required", 3],
      ["PowerEdge R530", "upgrade-required", 1],
    ]);
    expect(readiness.items.find(item => item.id === "hardware-compatibility")).toMatchObject({
      status: "attention",
      title: "VCF 9.1 Hardware Platform Precheck",
    });
    expect(readiness.hardwarePlatforms[0]).toMatchObject({
      model: "PowerEdge R760",
      esxiVersions: [{ version: "8.0.3 build-25205845", hosts: 6 }],
      esxiCorrelation: "per-platform",
    });
    expect(readiness.disclaimer).toContain("not a VCF 9.1 certification");
  });

  it("marks unclassified and incomplete platforms as review-required or unavailable", () => {
    const document = createDefaultDocument();
    Object.assign(document.inventory, {
      hosts: 2,
      physicalCores: 64,
      hostModels: [
        { vendor: "HPE", model: "ProLiant DL380 Gen10", cpuModel: "Intel Xeon", hosts: 1, physicalCores: 32, esxiVersions: [{ version: "8.0.3", hosts: 1 }], esxiCorrelation: "per-platform" },
        { vendor: "Unknown vendor", model: "Unknown model", cpuModel: "Unknown CPU", hosts: 1, physicalCores: 32, esxiVersions: [], esxiCorrelation: "unavailable" },
      ],
    });
    const readiness = assessReadiness(document.fields, document.inventory);
    expect(readiness.hardwarePlatforms.map(platform => [platform.model, platform.status])).toEqual([
      ["ProLiant DL380 Gen10", "review-required"],
      ["Unknown model", "unavailable"],
    ]);
  });

  it("provides reusable industry questions that can be applied and cleared without activating scope or generated activities", () => {
    const document = createDefaultDocument();
    document.fields.adoptionDetails.notes = "Customer confirmed an operations owner.";
    const template = getIndustryDiscoveryTemplate("financial-services-insurance");
    const originalDetails = structuredClone(document.fields.adoptionDetails);
    const originalPriorities = [...document.fields.priorities];
    const promptedNotes = appendIndustryDiscoveryPrompts(document.fields.adoptionDetails.notes, template.id);
    const clearedNotes = removeIndustryDiscoveryPrompts(promptedNotes, template.id);

    expect(industryDiscoveryTemplates).toHaveLength(6);
    expect(template.label).toBe("Financial services and insurance");
    expect(template.questions).toHaveLength(5);
    expect(promptedNotes).toContain("Discovery prompts to confirm — Financial services and insurance");
    expect(promptedNotes).toContain("discussion prompts only");
    expect(appendIndustryDiscoveryPrompts(promptedNotes, template.id)).toBe(promptedNotes);
    expect(clearedNotes).toBe("Customer confirmed an operations owner.");
    expect(removeIndustryDiscoveryPrompts(clearedNotes, template.id)).toBe(clearedNotes);
    expect(document.fields.adoptionDetails).toEqual(originalDetails);
    expect(document.fields.priorities).toEqual(originalPriorities);
    const labels = buildAdoptionPlans(document.fields, document.inventory).adoptionTimeline.lanes.flatMap(lane => lane.bars.map(activity => activity.label));
    expect(labels).not.toContain("Custom Operations Dashboards Plan");
    expect(labels).not.toContain("Infrastructure-as-Code Patterns Plan");
  });

  it("migrates V6 industry-template context to the general lens without changing confirmed scope", () => {
    const document = createDefaultDocument();
    document.fields.adoptionDetails.operations = ["custom-dashboards"];
    document.fields.priorities = ["operations"];
    const v6 = JSON.parse(JSON.stringify(document));
    v6.version = 6;
    delete v6.fields.adoptionDetails.industryTemplate;

    const migrated = migrateDocument(v6);
    expect(migrated.version).toBe(10);
    expect(migrated.fields.adoptionDetails.industryTemplate).toBe("general-enterprise");
    expect(migrated.fields.adoptionDetails.operations).toEqual(["custom-dashboards"]);
    expect(migrated.fields.priorities).toEqual(["operations"]);
  });

  it("migrates V4 platform evidence as estate-wide rather than per-platform", () => {
    const document = createDefaultDocument();
    Object.assign(document.inventory, {
      hosts: 2,
      esxiVersions: [{ version: "8.0.3 build-25205845", hosts: 2 }],
      hostModels: [{ vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel: "Intel Xeon Gold", hosts: 2, physicalCores: 128, esxiVersions: [{ version: "8.0.3 build-25205845", hosts: 2 }], esxiCorrelation: "per-platform" }],
    });
    document.readiness = assessReadiness(document.fields, document.inventory);
    const v4 = JSON.parse(JSON.stringify(document));
    v4.version = 4;
    v4.inventory.hostModels.forEach((platform: { esxiVersions?: unknown; esxiCorrelation?: unknown }) => { delete platform.esxiVersions; delete platform.esxiCorrelation; });
    v4.readiness.hardwarePlatforms.forEach((platform: { esxiVersions?: unknown; esxiCorrelation?: unknown }) => { delete platform.esxiVersions; delete platform.esxiCorrelation; });
    const migrated = migrateDocument(v4);
    expect(migrated.version).toBe(10);
    expect(migrated.inventory.hostModels[0]).toMatchObject({
      esxiVersions: [{ version: "8.0.3 build-25205845", hosts: 2 }],
      esxiCorrelation: "estate-wide",
    });
  });

  it("renders entitlement details and both synchronized adoption views with VCF 9.1 platform evidence", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, { customerName: "Meridian Health", entitledCores: 128, entitlementAmount: 3_000_000, entitlementStart: "2027-01-01", entitlementEnd: "2028-12-31", priorities: ["operations"], adoptionDetails: { ...document.fields.adoptionDetails, operations: ["observability", "custom-dashboards"] } });
    Object.assign(document.inventory, { sourceCount: 2, hosts: 4, physicalCores: 128, vmCount: 220, poweredOnVms: 200 });
    const plans = buildAdoptionPlans(document.fields, document.inventory);
    Object.assign(document, { readiness: assessReadiness(document.fields, document.inventory), ...plans });
    const html = renderFcpHtml("Meridian FCP", document);
    expect(html).toContain("Meridian Health");
    expect(html).toContain("$3,000,000");
    expect(html).toContain("Operational Adoption Timeline");
    expect(html).toContain("Two-Year Notional");
    expect(html).toContain("Execution view:");
    expect(html).toContain("Continuous planning view:");
    expect(html).toContain("Months 1–12 mirror the operational service sequence");
    expect(html).toContain("Intended Outcome");
    expect(html).toContain("Why Recommended and Readiness to Start");
    expect(html).toContain("Operations Dashboards With Ownership and Review");
    expect(html).toContain("Publish governed dashboards with support-team ownership, service measures, and a review cadence.");
    expect(html).toContain("Recommended because the customer selected");
    expect(html).toContain("VCF 9.1 Hardware Platform Precheck");
    expect(html).toContain("Observed ESXi");
    expect(html).toContain("Upgrade Services");
    const planSummaryStart = html.indexOf('<div class="plan-summary">');
    const observedInventoryStart = html.indexOf("Hardware certification evidence");
    const planSummary = html.slice(planSummaryStart, observedInventoryStart);
    expect(planSummaryStart).toBeGreaterThan(-1);
    expect(observedInventoryStart).toBeGreaterThan(planSummaryStart);
    expect(planSummary).toContain("<h3>Inventory</h3>");
    expect(planSummary).toContain("<h3>Operational window</h3>");
    expect(planSummary).toContain("<h3>Upgrade Services</h3>");
    expect(planSummary).toContain('<span class="summary-index">01</span>');
    expect(planSummary).not.toContain("data-step=");
    expect(html).toContain('<section class="executive-sheet">');
    expect(html).toContain('<section class="summary-plan">');
    expect(html).toContain("Executive snapshot");
    expect(html).toContain("Plan on a Page");
    expect(html).toContain(".executive-sheet{height:8.12in;min-height:8.12in");
    expect(html).toContain(".summary-plan{min-height:8.5in");
    expect(html).toContain("@page{size:letter landscape;margin:0}");
    expect(html).toContain('<section class="hardware-evidence">');
    expect(html).toContain('class="compact-table hardware-table"');
    expect(html).toContain("Hardware certification evidence");
    expect(html).toContain('class="notional-year-sheet notional-year-one"');
    expect(html).toContain('class="notional-year-sheet notional-year-two"');
    expect(html).toContain("Months 1–12");
    expect(html).toContain("Months 13–24");
    expect(html).toContain("Selected Follow-On Services");
    expect(html).not.toContain("Year 2 Follow-On Services");
    expect(html).toContain("#two-year .notional-year-sheet .timeline-grid{width:100%;min-width:0!important;grid-template-columns:1.45in repeat(12,minmax(0,1fr))!important}");
    expect(html).toContain("#two-year .notional-year-two{page-break-before:always;break-before:page}");
    expect(html).toContain('class="two-year-sequence-sheet"');
    expect(html).toContain("#two-year .two-year-sequence-sheet{page-break-before:always;break-before:page}");
    expect(html).toContain("page-break-after:always;break-after:page");
    expect(html).not.toMatch(/Gantt|Year [12] Consumption Plan|Workshop/i);
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
