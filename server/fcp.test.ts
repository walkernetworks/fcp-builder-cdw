import { describe, expect, it } from "vitest";
import { parseRvToolsFiles } from "../client/src/lib/rvtools";
import { applyScheduleFieldPatch, applyTimelineGesture, assessReadiness, buildAdoptionPlans, buildMonthColumns, buildTwoYearNotionalColumns, buildWeekColumns, calculateEntitlementEndDate, colorForWorkstreamType, createDefaultDocument, FIXED_GANTT_CATEGORIES, getFollowOnReadinessGuidance, getHclSchedulePath, migrateDocument, normalizeActivityLabel, normalizeWorkstreamLabel, refreshDerivedDocument, validateTimeline, type Timeline } from "../shared/fcp";
import { appendIndustryDiscoveryPrompts, getIndustryDiscoveryTemplate, industryDiscoveryTemplates, removeIndustryDiscoveryPrompts } from "../shared/industryDiscovery";
import { assessHclEstate, assessHclPlatform, emptyHclInventoryEvidence } from "../shared/hcl";
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
      ["UUID", "Datacenter", "Cluster", "Host", "# Cores", "ESX Version", "Vendor", "Model", "CPU Model", "Memory Total MiB"],
      ["host-1", "DC1", "Cluster-A", "esx01", "32", "8.0.3", "Dell", "R760", "Intel Xeon", "1048576"],
      ["host-2", "DC1", "Cluster-A", "esx02", "32", "7.0.3", "Dell", "R760", "Intel Xeon", "2097152"],
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
      clusterMembership: [{ name: "DC1 / Cluster-A", hosts: 2 }],
      minimumMemoryGiB: 1024,
      maximumMemoryGiB: 2048,
    });
    expect(result.summary.clusterProfiles).toEqual([{ name: "DC1 / Cluster-A", hosts: 2 }]);
  });

  it("consolidates host models whose RVTools fields differ only by whitespace", async () => {
    const vHost = csvFile("vHost.csv", [
      ["UUID", "Datacenter", "Cluster", "Host", "# Cores", "ESX Version", "Vendor", "Model", "CPU Model", "Memory Total MiB"],
      ["host-1", "DC1", "Cluster-A", "esx01", "32", "8.0.3", "HPE", "ProLiant DL380 Gen10", "Intel Xeon Gold", "1048576"],
      ["host-2", "DC1", "Cluster-A", "esx02", "32", "8.0.3", " HPE ", "ProLiant  DL380  Gen10 ", "Intel Xeon Gold", "1048576"],
    ]);
    const result = await parseRvToolsFiles([vHost]);
    expect(result.summary.hostModels).toHaveLength(1);
    expect(result.summary.hostModels[0]).toMatchObject({ vendor: "HPE", model: "ProLiant DL380 Gen10", hosts: 2, physicalCores: 64 });
  });
});

describe("calendar-month adoption plans", () => {
  it("builds inclusive entitlement-month columns and an entitlement-bounded Notional column set", () => {
    expect(buildMonthColumns("2027-01-15", "2027-06-30")).toEqual(["Jan 27", "Feb 27", "Mar 27", "Apr 27", "May 27", "Jun 27"]);
    expect(calculateEntitlementEndDate("2027-01-15")).toBe("2028-01-15");
    const notional = buildTwoYearNotionalColumns("2027-01-15", "2028-01-15");
    expect(notional).toHaveLength(13);
    expect(notional[0]).toBe("Jan 27");
    expect(notional[11]).toBe("Dec 27");
    expect(notional[12]).toBe("Jan 28");
  });

  it("time-boxes discovery and then sequences the selected implementation workstreams without adding unselected networking scope", () => {
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
    const activities = plans.adoptionTimeline.lanes.flatMap(lane => lane.bars);
    const activity = (id: string) => activities.find(candidate => candidate.id === id)!;
    const mobilization = activity("bar-platform-plan");
    const managementDomain = activity("bar-management-domain");
    const workloadDomain = activity("bar-workload-domain");
    const upgrade = activity("bar-vcf-upgrade-services");
    const handover = activity("bar-platform-handover");
    const cloudEnds = plans.adoptionTimeline.lanes.find(lane => lane.id === "lane-cloud")!.bars.map(candidate => candidate.endCol);
    const securityEnds = plans.adoptionTimeline.lanes.find(lane => lane.id === "lane-security-resilience")!.bars.map(candidate => candidate.endCol);

    expect(plans.adoptionTimeline.columns.length).toBeGreaterThanOrEqual(10);
    expect(new Set(plans.adoptionTimeline.lanes.map(lane => lane.category))).toEqual(new Set(FIXED_GANTT_CATEGORIES));
    expect(plans.adoptionTimeline.lanes.filter(lane => lane.category === "Modernize Infrastructure").map(lane => lane.workstreamType)).toEqual(expect.arrayContaining(["Infrastructure Build", "Migration Waves"]));
    expect(plans.twoYearPlan).toMatchObject({ cadence: "month", startDate: "2027-01-01" });
    expect(plans.twoYearPlan.columns).toHaveLength(13);
    expect(plans.twoYearPlan.columns[0]).toBe("Jan 27");
    expect(plans.twoYearPlan.columns[11]).toBe("Dec 27");
    expect(plans.twoYearPlan.columns[12]).toBe("Jan 28");
    expect(plans.twoYearPlan.lanes.flatMap(lane => lane.bars).every(candidate => candidate.endCol <= plans.twoYearPlan.columns.length + 1)).toBe(true);
    expect(plans.twoYearPlan.lanes.map(lane => lane.name).join(" ")).not.toMatch(/Year [12] ·/);
    expect(plans.rationale).toContain("$2,500,000");
    expect(plans.rationale).toContain("implementation begins with mobilisation and delivery-baseline work in the first calendar month");
    expect(plans.rationale).toContain("The Entitlement Notional begins at the planned project start (2027-01-01) and ends at entitlement end (2028-01-01)");
    expect(labels).toEqual(expect.arrayContaining([
      "Month 1: Mobilize and Freeze VCF Delivery Baseline",
      "Deploy VCF Management Domain and Core Control Plane",
      "Create or Import Workload Domain and Prepare Clusters",
      expect.stringContaining("HCL Gate:"),
      "Validate Handover, Service Acceptance, and Ongoing Lifecycle",
    ]));
    expect(mobilization.endCol).toBeLessThanOrEqual(managementDomain.startCol);
    expect(activities.some(candidate => candidate.id === "bar-vcf-networking-nsx")).toBe(false);
    expect(workloadDomain.startCol).toBeGreaterThanOrEqual(managementDomain.startCol);
    expect(upgrade.startCol).toBeGreaterThanOrEqual(Math.max(...cloudEnds, ...securityEnds));
    expect(handover.startCol).toBeGreaterThanOrEqual(upgrade.endCol);
    expect(validateTimeline(plans.adoptionTimeline)).toEqual([]);
    expect(validateTimeline(plans.twoYearPlan)).toEqual([]);
  });

  it("creates exact weekly operational windows and detailed customer-confirmed capability activities", () => {
    expect(buildWeekColumns("2027-01-17", "2027-02-15")).toEqual([
      "Jan 17–Jan 23, 27", "Jan 24–Jan 30, 27", "Jan 31–Feb 6, 27", "Feb 7–Feb 13, 27", "Feb 14–Feb 15, 27",
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
    expect(plans.adoptionTimeline.columns.slice(0, 4)).toEqual(buildWeekColumns("2027-01-17", "2027-02-15").slice(0, 4));
    expect(plans.adoptionTimeline.columns[4]).toBe("Feb 14–Feb 20, 27");
    expect(plans.adoptionTimeline.columns.length).toBeGreaterThanOrEqual(5);
    expect(labels).toEqual(expect.arrayContaining([
      "Execute VCF 9.1 Migration Waves",
      "Launch a Governed VM Self-Service Catalog",
      "Build Infrastructure-as-Code Blueprints and Release Controls",
      "Publish Operational Dashboards and Service Measures",
    ]));
    expect(plans.twoYearPlan).toMatchObject({ cadence: "month", startDate: "2027-01-17" });
    expect(plans.rationale).toContain("weekly execution windows");
    expect(plans.rationale).toContain("3 selected detailed capability focus areas");
  });

  it("applies the confirmed upgrade path, constraints, timeline notes, and discovery lens to visible planning context without adding unselected scope", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, {
      entitlementStart: "2027-01-01",
      entitlementEnd: "2027-12-31",
      targetStart: "2027-01-01",
      targetComplete: "2027-12-31",
      adoptionCadence: "week",
      priorities: ["operations"],
      timelineNotes: "No production cutovers during the final two weeks of March.",
      adoptionDetails: {
        ...document.fields.adoptionDetails,
        upgradePath: "migration-waves",
        industryTemplate: "financial-services-insurance",
        operations: ["capacity-cost"],
        notes: "Pilot the first two application cohorts before wider migration waves.",
      },
    });

    const refreshed = refreshDerivedDocument(document);
    const refreshedActivities = refreshed.adoptionTimeline.lanes.flatMap(lane => lane.bars);
    const upgrade = refreshedActivities.find(activity => activity.id === "bar-vcf-upgrade-services");
    const mobilization = refreshedActivities.find(activity => activity.id === "bar-platform-plan");
    const labels = refreshedActivities.map(activity => activity.label);

    expect(upgrade).toMatchObject({ label: "Execute VCF 9.1 Migration Waves" });
    expect(upgrade?.dependsOn).toContain("Pilot the first two application cohorts");
    expect(upgrade?.dependsOn).toContain("No production cutovers during the final two weeks of March");
    expect(mobilization?.label).toBe("Weeks 1–2: Mobilize and Freeze VCF Delivery Baseline");
    expect(refreshed.rationale).toContain("Financial services and insurance industry discovery lens");
    expect(refreshed.rationale).toContain("it informs the planning narrative only and does not add scope");
    expect(labels).not.toContain("Custom Operations Dashboards Plan");

    const designOnly = refreshDerivedDocument({
      ...document,
      fields: { ...document.fields, adoptionDetails: { ...document.fields.adoptionDetails, upgradePath: "design-only" } },
    });
    expect(designOnly.adoptionTimeline.lanes.flatMap(lane => lane.bars).find(activity => activity.id === "bar-vcf-upgrade-services")).toBeUndefined();
    expect(designOnly.rationale).toContain("design-only path intentionally stops before migration execution");
  });

  it("keeps planned delivery timing independent while recalculating the entitlement term", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, {
      entitlementStart: "2027-01-01",
      entitlementEnd: "2027-06-30",
      plannedProjectStart: "2027-01-17",
      targetStart: "2027-01-01",
      targetComplete: "2027-06-30",
      adoptionCadence: "month",
      priorities: ["automation"],
      adoptionDetails: { ...document.fields.adoptionDetails, automation: ["vm-self-service", "infrastructure-as-code", "approval-guardrails"] },
    });

    const original = buildAdoptionPlans(document.fields, document.inventory).adoptionTimeline;
    const entitlementPatched = applyScheduleFieldPatch(document.fields, { entitlementStart: "2027-02-01" });
    const refreshed = buildAdoptionPlans(entitlementPatched, document.inventory).adoptionTimeline;
    expect(entitlementPatched.entitlementEnd).toBe("2028-02-01");
    expect(entitlementPatched.plannedProjectStart).toBe("2027-01-17");
    expect(entitlementPatched.targetStart).toBe("2027-01-01");
    expect(entitlementPatched.targetComplete).toBe("2027-06-30");
    expect(refreshed.startDate).toBe("2027-01-17");
    expect(refreshed.columns).toEqual(original.columns);
    expect(validateTimeline(refreshed)).toEqual([]);

    const weeklyFields = {
      ...document.fields,
      plannedProjectStart: "2027-01-17",
      targetStart: "2027-01-01",
      targetComplete: "2027-01-24",
      adoptionCadence: "week" as const,
      adoptionDetails: { ...document.fields.adoptionDetails, automation: ["vm-self-service", "infrastructure-as-code", "day-2-automation", "governance", "application-provisioning"] },
    };
    const weekly = buildAdoptionPlans(weeklyFields, document.inventory).adoptionTimeline;
    expect(weekly.columns.slice(0, 2)).toEqual(["Jan 17–Jan 23, 27", "Jan 24–Jan 30, 27"]);
    expect(weekly.lanes.filter(lane => lane.id === "lane-cloud")).toHaveLength(1);
    expect(validateTimeline(weekly)).toEqual([]);
  });

  it("migrates legacy target starts into the separately persisted planned project start", () => {
    const legacy = createDefaultDocument();
    Object.assign(legacy.fields, { entitlementStart: "2027-03-01", targetStart: "2027-04-15", targetComplete: "2027-09-30" });
    const rawLegacy = structuredClone(legacy) as Record<string, unknown>;
    const rawFields = rawLegacy.fields as Record<string, unknown>;
    delete rawFields.plannedProjectStart;

    const migrated = migrateDocument(rawLegacy);
    expect(migrated.fields.plannedProjectStart).toBe("2027-04-15");
    expect(buildAdoptionPlans(migrated.fields, migrated.inventory).adoptionTimeline.startDate).toBe("2027-04-15");
  });

  it("uses selected module tasks directly without generic follow-on placeholders", () => {
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
    const labels = plans.adoptionTimeline.lanes.flatMap(lane => lane.bars.map(activity => activity.label));

    expect(labels).toEqual(expect.arrayContaining([
      "Execute Recovery Exercise and Runbook Validation",
      "Onboard the First Private AI Pilot",
    ]));
    expect(labels).not.toContain("Resilience Implementation");
    expect(labels).not.toContain("Private AI Implementation");
    expect(JSON.stringify(plans.twoYearPlan)).not.toMatch(/Service Prioritization Decision|Year [12] ·/);
    expect(plans.twoYearPlan.lanes.length).toBeGreaterThanOrEqual(FIXED_GANTT_CATEGORIES.length);
    expect(new Set(plans.twoYearPlan.lanes.map(lane => lane.category))).toEqual(new Set(FIXED_GANTT_CATEGORIES));
    expect(plans.rationale).toContain("HCL 2.0 evaluation path");
  });

  it("recommends compound services only after their detailed prerequisites and estate or hardware signals align", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, {
      entitlementStart: "2027-01-01",
      entitlementEnd: "2028-01-01",
      targetStart: "2027-01-01",
      targetComplete: "2027-09-30",
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
    const activities = plans.adoptionTimeline.lanes.flatMap(lane => lane.bars);
    const labels = activities.map(activity => activity.label);

    expect(labels).toEqual(expect.arrayContaining([
      "Deploy VCF Operations Health, Logs, and Diagnostics",
      "Publish Operational Dashboards and Service Measures",
      "Implement Recovery Architecture",
      "Execute Recovery Exercise and Runbook Validation",
      "Create Workload Domain and Enable Supervisor",
      "Operationalize Kubernetes Platform Services",
      "Implement AI Capacity and GPU Enablement",
      "Apply Private AI Guardrails",
      "Onboard the First Private AI Pilot",
    ]));
    expect(activities.filter(activity => activity.id.startsWith("bar-cloud-") || activity.id.startsWith("bar-security-") || activity.id.startsWith("bar-resilience-")).every(activity => Boolean(activity.dependsOn))).toBe(true);
    expect(plans.rationale).toContain("final migration or implementation phase is gated until selected Cloud and Security & Resilience work is complete");
  });

  it("normalizes custom labels to title-style Plan or Design language", () => {
    expect(normalizeActivityLabel("operations design")).toBe("Operations Design");
    expect(normalizeActivityLabel("network workshop")).toBe("Network Plan");
    expect(normalizeActivityLabel("DR design")).toBe("DR Design");
    expect(normalizeWorkstreamLabel("platform readiness")).toBe("Platform Plan");
  });

  it("applies month drag and edge resize gestures while allowing bounded overlapping work within one category", () => {
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
    const overlapped = applyTimelineGesture(timeline, "lane", "a", "end", 3);
    expect(overlapped.lanes[0].bars[0]).toMatchObject({ startCol: 1, endCol: 6 });
    expect(validateTimeline(overlapped)).toEqual([]);
    expect(applyTimelineGesture(timeline, "lane", "a", "move", -1)).toBe(timeline);
    expect(applyTimelineGesture(timeline, "lane", "a", "end", 5)).toBe(timeline);
  });

  it("migrates older engagements to entitlement-aware, normalized adoption plans", () => {
    const legacyTimeline = { columns: ["Wave 1", "Wave 2"], lanes: [{ id: "legacy", name: "readiness", bars: [{ id: "old", startCol: 1, endCol: 2, color: "blue", label: "workshop", milestone: false, deferred: false }] }] };
    const migrated = migrateDocument({ version: 1, fields: { customerName: "Meridian Health", cust: "MER", entitlement: "256", funds: "$1,750,000", termStart: "2027-01-01", termEnd: "2028-12-31", vmCount: "980", hostCount: "22", notes: "No December changes" }, timeline: legacyTimeline, rationale: "Old rationale" });
    expect(migrated.version).toBe(11);
    expect(migrated.fields.customerName).toBe("Meridian Health");
    expect(migrated.fields.entitlementAmount).toBe(1_750_000);
    expect(migrated.fields.entitlementStart).toBe("2027-01-01");
    expect(migrated.fields.entitlementEnd).toBe("2028-01-01");
    expect(migrated.adoptionTimeline.columns[0]).toBe("Jan 27");
    expect(migrated.twoYearPlan).toMatchObject({ startDate: "2027-01-01", cadence: "month" });
    expect(migrated.twoYearPlan.columns).toHaveLength(13);
    expect(JSON.stringify([migrated.adoptionTimeline, migrated.twoYearPlan])).toContain("Deploy VCF Management Domain and Core Control Plane");
    expect(JSON.stringify([migrated.adoptionTimeline, migrated.twoYearPlan])).not.toMatch(/Consumption Plan|Workshop/i);
    expect(JSON.stringify([migrated.adoptionTimeline, migrated.twoYearPlan])).toContain("Month 1: Mobilize and Freeze VCF Delivery Baseline");
    expect(migrated.readiness.hardwarePlatforms).toEqual([]);
  });

  it("regenerates V9 plans as entitlement-aligned Notionals with selected Operations tasks in the fixed category row", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, {
      entitlementStart: "2027-01-01",
      entitlementEnd: "2027-12-31",
      targetStart: "2027-01-17",
      targetComplete: "2027-09-30",
      priorities: ["operations"],
      adoptionDetails: { ...document.fields.adoptionDetails, operations: ["observability", "custom-dashboards"] },
    });
    Object.assign(document.inventory, { vmCount: 220, hosts: 4, poweredOnVms: 200 });
    const v9 = JSON.parse(JSON.stringify(document));
    v9.version = 9;

    const migrated = migrateDocument(v9);
    const operations = migrated.twoYearPlan.lanes.find(lane => lane.id === "lane-operations");
    expect(migrated.version).toBe(11);
    expect(migrated.twoYearPlan).toMatchObject({ cadence: "month", startDate: "2027-01-17" });
    expect(migrated.twoYearPlan.columns).toHaveLength(13);
    expect(migrated.twoYearPlan.columns[0]).toBe("Jan 27");
    expect(migrated.twoYearPlan.columns[12]).toBe("Jan 28");
    expect(new Set(migrated.twoYearPlan.lanes.map(lane => lane.category))).toEqual(new Set(FIXED_GANTT_CATEGORIES));
    expect(operations?.bars).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Deploy VCF Operations Health, Logs, and Diagnostics", startCol: expect.any(Number) }),
      expect.objectContaining({ label: "Publish Operational Dashboards and Service Measures", startCol: expect.any(Number) }),
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
    expect(considerations.items.find(item => item.id === "core-entitlement")).toBeUndefined();
    expect(considerations.label).toBe("Inventory-Informed VCF 9.1 Planning Considerations");
  });

  it("classifies RVTools-formatted legacy ESXi values instead of reporting them as unavailable", () => {
    const document = createDefaultDocument();
    Object.assign(document.inventory, {
      esxiVersions: [
        { version: "VMware ESXi 6.5.0 build-10719125", hosts: 27 },
        { version: "VMware ESXi 6.5.0 build-9298722", hosts: 1 },
      ],
    });

    const baseline = assessReadiness(document.fields, document.inventory).items.find(item => item.id === "software-baseline");
    expect(baseline).toMatchObject({
      status: "attention",
      detail: "28 host(s) report ESXi 7.x or older.",
      evidence: "VMware ESXi 6.5.0 build-10719125: 27; VMware ESXi 6.5.0 build-9298722: 1",
    });
  });

  it("reports unavailable only when no ESXi version evidence exists", () => {
    const document = createDefaultDocument();
    const baseline = assessReadiness(document.fields, document.inventory).items.find(item => item.id === "software-baseline");
    expect(baseline).toMatchObject({ status: "unknown", detail: "ESXi versions were not available." });
  });

  it("refreshes stale persisted baseline findings from ESXi 8.0.3 RVTools evidence", () => {
    const document = createDefaultDocument();
    Object.assign(document.inventory, {
      esxiVersions: [
        { version: "VMware ESXi 8.0.3 build-24784735", hosts: 267 },
        { version: "VMware ESXi 8.0.3 build-24859861", hosts: 18 },
        { version: "VMware ESXi 8.0.3 build-24585383", hosts: 1 },
      ],
    });
    const storedBaseline = document.readiness.items.find(item => item.id === "software-baseline");
    if (!storedBaseline) throw new Error("Expected default software baseline readiness item");
    Object.assign(storedBaseline, {
      status: "unknown",
      evidence: "VMware ESXi 8.0.3 build-24784735: 267; VMware ESXi 8.0.3 build-24859861: 18; VMware ESXi 8.0.3 build-24585383: 1",
      detail: "ESXi versions were not available.",
    });

    const refreshedBaseline = migrateDocument(document).readiness.items.find(item => item.id === "software-baseline");
    expect(refreshedBaseline).toMatchObject({
      status: "info",
      detail: "286 host(s) report ESXi 8.x.",
      evidence: "VMware ESXi 8.0.3 build-24784735: 267; VMware ESXi 8.0.3 build-24859861: 18; VMware ESXi 8.0.3 build-24585383: 1",
    });
  });

  it("evaluates supplied offline HCL server-and-CPU evidence conservatively", () => {
    const exact = assessHclPlatform("Dell Inc.", "PowerEdge R760", "Intel(R) Xeon(R) Gold 6430");
    const cpuMismatch = assessHclPlatform("Dell Inc.", "PowerEdge R760", "Intel(R) Xeon(R) Gold 6230");
    const digitGuard = assessHclPlatform("Dell Inc.", "PowerEdge R7600", "Intel(R) Xeon(R) Gold 6430");

    expect(exact).toMatchObject({
      status: "supported",
      modelMatchMethod: "exact",
      matchedPartnerName: "Dell",
      matchedModel: "PowerEdge R760",
      matchedCpuSeries: "Intel Xeon Gold 6400/5400 (Sapphire-Rapids-SP) Series",
    });
    expect(exact.detailUrl).toContain("productId=55720");
    expect(cpuMismatch).toMatchObject({ status: "cpu-not-certified", matchedModel: "PowerEdge R760" });
    expect(digitGuard).toMatchObject({ status: "unknown", modelMatchMethod: "none" });
    expect(digitGuard.detail).toContain("different model-number identity");
  });

  it("adds HCL snapshot evidence to readiness and the consolidated delivery baseline without treating it as certification", () => {
    const document = createDefaultDocument();
    Object.assign(document.inventory, {
      hosts: 6,
      physicalCores: 384,
      hostModels: [
        { vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel: "Intel(R) Xeon(R) Gold 6430", hosts: 4, physicalCores: 256, esxiVersions: [{ version: "8.0.3", hosts: 4 }], esxiCorrelation: "per-platform" },
        { vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel: "Intel(R) Xeon(R) Gold 6230", hosts: 2, physicalCores: 128, esxiVersions: [{ version: "8.0.3", hosts: 2 }], esxiCorrelation: "per-platform" },
      ],
    });

    const readiness = assessReadiness(document.fields, document.inventory);
    const hclReadiness = readiness.items.find(item => item.id === "server-cpu-hcl-snapshot");
    const plans = buildAdoptionPlans(document.fields, document.inventory);
    const baseline = plans.adoptionTimeline.lanes.flatMap(lane => lane.bars).find(activity => activity.id === "bar-platform-plan");

    expect(readiness.hardwarePlatforms.map(platform => [platform.hosts, platform.hcl.status])).toEqual([[4, "supported"], [2, "cpu-not-certified"]]);
    expect(hclReadiness).toMatchObject({ status: "attention", title: "Offline ESXi 9.1 Server HCL Snapshot" });
    expect(hclReadiness?.detail).toContain("2 host(s) have a reported server-and-CPU pairing that is not listed for ESXi 9.1");
    expect(baseline?.dependsOn).toContain("HCL schedule path Red");
    expect(baseline?.outcome).toContain("offline HCL evidence");
    expect(readiness.disclaimer).toContain("offline HCL snapshot result is not a VCF 9.1 certification");
  });

  it("builds immutable five-category Gantt rows and HCL-path buffers before module-gated migration", () => {
    const planFor = (cpuModel: string, softPrerequisites: Array<"dns-ntp" | "ip-pools" | "tor-switch-design"> = []) => {
      const document = createDefaultDocument();
      Object.assign(document.fields, {
        targetStart: "2027-01-01",
        targetComplete: "2028-01-01",
        adoptionCadence: "month",
        priorities: ["automation", "security", "resilience"],
        adoptionDetails: { ...document.fields.adoptionDetails, upgradePath: "migration-waves", automation: ["vm-self-service"], security: ["segmentation"], resilience: ["recovery-architecture"], softPrerequisites },
      });
      Object.assign(document.inventory, {
        hosts: 2,
        physicalCores: 128,
        hostModels: [{ vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel, hosts: 2, physicalCores: 128, esxiVersions: [{ version: "8.0.3", hosts: 2 }], esxiCorrelation: "per-platform" }],
      });
      return { document, plan: buildAdoptionPlans(document.fields, document.inventory).adoptionTimeline };
    };
    const labels = (timeline: ReturnType<typeof buildAdoptionPlans>["adoptionTimeline"]) => timeline.lanes.flatMap(lane => lane.bars);

    const green = planFor("Intel(R) Xeon(R) Gold 6430");
    expect(getHclSchedulePath(green.document.inventory)).toBe("green");
    expect(Array.from(new Set(green.plan.lanes.map(lane => lane.category)))).toEqual(FIXED_GANTT_CATEGORIES);
    expect(labels(green.plan).map(activity => activity.label)).not.toContain("Procure Replacement Hardware or Approve Greenfield Path");
    expect(labels(green.plan).some(activity => activity.label.includes("HCL Gate: Green"))).toBe(true);

    const yellow = planFor("Unknown CPU");
    expect(getHclSchedulePath(yellow.document.inventory)).toBe("yellow");
    expect(labels(yellow.plan).some(activity => activity.label === "Remediate and Verify HCL Exceptions")).toBe(true);
    expect(labels(yellow.plan).some(activity => activity.label.includes("HCL Gate: Yellow"))).toBe(true);

    const red = planFor("Intel(R) Xeon(R) Gold 6230", ["dns-ntp", "ip-pools"]);
    expect(getHclSchedulePath(red.document.inventory)).toBe("red");
    const redBars = labels(red.plan);
    const procurement = redBars.find(activity => activity.label === "Procure Replacement Hardware or Approve Greenfield Path");
    const greenfield = redBars.find(activity => activity.label === "Provision and Validate Greenfield Hardware Baseline");
    const hclGate = redBars.find(activity => activity.label.includes("HCL Gate: Red"));
    const prerequisite = redBars.find(activity => activity.label === "Confirm DNS, NTP, and core services");
    const migration = redBars.find(activity => activity.label.includes("Migration Waves"));
    const cloud = redBars.find(activity => activity.label === "Launch a Governed VM Self-Service Catalog");
    const security = redBars.find(activity => activity.label === "Implement Segmentation and Security Policy");
    const resilience = redBars.find(activity => activity.label === "Implement Recovery Architecture");
    expect(procurement && greenfield && hclGate && prerequisite && migration && cloud && security && resilience).toBeTruthy();
    expect(prerequisite!.startCol).toBe(procurement!.startCol);
    expect(hclGate!.startCol).toBeGreaterThanOrEqual(greenfield!.endCol);
    expect(migration!.startCol).toBeGreaterThanOrEqual(Math.max(cloud!.endCol, security!.endCol, resilience!.endCol));
    expect(migration!.dependsOn).toContain("selected Cloud and Security & Resilience activities complete");
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

  it("consolidates observed RVTools host platforms into one compatibility decision log without per-host timeline lanes", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, {
      entitlementStart: "2027-01-01",
      entitlementEnd: "2027-12-31",
      targetStart: "2027-01-01",
      targetComplete: "2027-12-31",
    });
    Object.assign(document.inventory, {
      hosts: 6,
      physicalCores: 384,
      hostModels: [
        { vendor: "HPE", model: "ProLiant DL380 Gen10", cpuModel: "Intel Xeon", hosts: 4, physicalCores: 256, esxiVersions: [{ version: "VMware ESXi 8.0.3 build-24784735", hosts: 4 }], esxiCorrelation: "per-platform" },
        { vendor: "Unknown vendor", model: "Unknown model", cpuModel: "Unknown CPU", hosts: 2, physicalCores: 128, esxiVersions: [], esxiCorrelation: "unavailable" },
      ],
    });

    const plans = buildAdoptionPlans(document.fields, document.inventory);
    const assessment = plans.adoptionTimeline.lanes.flatMap(lane => lane.bars).find(activity => activity.id === "bar-platform-plan");
    const mirroredAssessment = plans.twoYearPlan.lanes.flatMap(lane => lane.bars).find(activity => activity.id === "bar-platform-plan");

    expect(assessment).toMatchObject({
      label: "Month 1: Mobilize and Freeze VCF Delivery Baseline",
      dependsOn: expect.stringContaining("bill of materials"),
    });
    expect(mirroredAssessment?.label).toBe("Month 1: Mobilize and Freeze VCF Delivery Baseline");
    expect(plans.adoptionTimeline.lanes.some(lane => lane.id.startsWith("lane-host-platform-"))).toBe(false);
    expect(plans.twoYearPlan.lanes.some(lane => lane.id.startsWith("lane-two-year-year-one-lane-host-platform-"))).toBe(false);
    expect(plans.rationale).toContain("HCL 2.0 evaluation path");
    expect(validateTimeline(plans.adoptionTimeline)).toEqual([]);
    expect(validateTimeline(plans.twoYearPlan)).toEqual([]);
  });

  it("refreshes a current engagement to remove legacy host lanes and retain one consolidated compatibility assessment", () => {
    const document = createDefaultDocument();
    Object.assign(document.inventory, {
      hosts: 4,
      physicalCores: 256,
      hostModels: [{ vendor: "HPE", model: "ProLiant DL380 Gen10", cpuModel: "Intel Xeon", hosts: 4, physicalCores: 256, esxiVersions: [{ version: "VMware ESXi 8.0.3 build-24784735", hosts: 4 }], esxiCorrelation: "per-platform" }],
    });
    const reopened = migrateDocument(JSON.parse(JSON.stringify(document)));
    expect(reopened.adoptionTimeline.lanes.flatMap(lane => lane.bars).find(activity => activity.id === "bar-platform-plan")).toMatchObject({
      label: "Month 1: Mobilize and Freeze VCF Delivery Baseline",
      dependsOn: expect.stringContaining("bill of materials"),
    });
    expect(reopened.adoptionTimeline.lanes.some(lane => lane.id.startsWith("lane-host-platform-"))).toBe(false);
    expect(reopened.twoYearPlan.lanes.some(lane => lane.id.startsWith("lane-two-year-year-one-lane-host-platform-"))).toBe(false);
  });

  it("explains the exact missing inputs when selected follow-on services are intentionally deferred", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, {
      priorities: ["operations"],
      adoptionDetails: { ...document.fields.adoptionDetails, operations: ["capacity-cost"] },
      hardwareAvailability: "unknown",
    });
    const guidance = getFollowOnReadinessGuidance(document.fields, document.inventory);

    expect(guidance).toMatchObject({
      blocked: true,
      title: "Follow-on services are waiting on the inputs listed below.",
    });
    expect(guidance.actions).toEqual(expect.arrayContaining([
      "Upload RVTools inventory or confirm Hardware availability as Existing or New in Plan Setup.",
      "Upload RVTools inventory with usable host or VM evidence.",
    ]));
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
    expect(migrated.version).toBe(11);
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
    expect(migrated.version).toBe(11);
    expect(migrated.inventory.hostModels[0]).toMatchObject({
      esxiVersions: [{ version: "8.0.3 build-25205845", hosts: 2 }],
      esxiCorrelation: "estate-wide",
    });
  });

  it("evaluates VCF 9.1 host-cohort, topology, and sizing evidence without presenting RVTools as certification", () => {
    const document = createDefaultDocument();
    Object.assign(document.inventory, {
      hosts: 6,
      physicalCores: 384,
      clusters: 1,
      clusterProfiles: [{ name: "DC1 / Mgmt", hosts: 6 }],
      esxiVersions: [{ version: "VMware ESXi 9.1.0 build-25370933", hosts: 6 }],
      hostModels: [
        { vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel: "Intel Xeon Gold", hosts: 3, physicalCores: 192, esxiVersions: [{ version: "VMware ESXi 9.1.0 build-25370933", hosts: 3 }], esxiCorrelation: "per-platform", clusterMembership: [{ name: "DC1 / Mgmt", hosts: 3 }], minimumMemoryGiB: 1024, maximumMemoryGiB: 1024 },
        { vendor: "HPE", model: "ProLiant DL380 Gen10", cpuModel: "Intel Xeon Gold", hosts: 3, physicalCores: 192, esxiVersions: [{ version: "VMware ESXi 9.1.0 build-25370933", hosts: 3 }], esxiCorrelation: "per-platform", clusterMembership: [{ name: "DC1 / Mgmt", hosts: 3 }], minimumMemoryGiB: 768, maximumMemoryGiB: 768 },
      ],
    });

    const readiness = assessReadiness(document.fields, document.inventory);
    expect(readiness.items.find(item => item.id === "software-baseline")).toMatchObject({
      status: "info",
      title: "VCF 9.1 ESX BOM Alignment Signal",
      detail: expect.stringContaining("not confirmation of the required exact build"),
    });
    expect(readiness.items.find(item => item.id === "management-domain-cohort-uniformity")).toMatchObject({
      status: "attention",
      title: "Management-Domain Cohort Uniformity",
      detail: expect.stringContaining("more than one hardware vendor"),
      evidence: "DC1 / Mgmt: 6 hosts",
    });
    expect(readiness.items.find(item => item.id === "deployment-topology-sizing-evidence")).toMatchObject({
      status: "info",
      title: "VCF 9.1 Topology and N-1 Sizing Evidence",
      detail: expect.stringContaining("at least four hosts"),
      evidence: expect.stringContaining("Dell Inc. PowerEdge R760: 1,024–1,024 GiB per host"),
    });
    expect(readiness.disclaimer).toContain("one hardware vendor for the selected management domain");
  });

  it("uses only the canonical categories and workstream types in generated adoption plans", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, {
      entitlementStart: "2027-01-01",
      entitlementEnd: "2027-12-31",
      targetStart: "2027-01-01",
      targetComplete: "2027-12-31",
      priorities: ["operations", "automation", "security", "resilience", "kubernetes", "private-ai"],
      adoptionDetails: {
        ...document.fields.adoptionDetails,
        operations: ["capacity-cost"],
        automation: ["vm-self-service"],
        security: ["segmentation"],
        resilience: ["recovery-architecture"],
        kubernetes: ["workload-domains"],
        privateAi: ["gpu-capacity"],
      },
    });
    const plans = buildAdoptionPlans(document.fields, document.inventory);
    const canonicalCategories = new Set(FIXED_GANTT_CATEGORIES);
    const canonicalWorkstreamTypes = new Set(["Governance", "Operating Model / Platform", "Infrastructure Build", "Migration Waves", "Consume / Handover", "Security & Resiliency"]);
    const lanes = [...plans.adoptionTimeline.lanes, ...plans.twoYearPlan.lanes];
    expect(lanes.length).toBeGreaterThan(0);
    expect(lanes.every(lane => canonicalCategories.has(lane.category) && canonicalWorkstreamTypes.has(lane.workstreamType))).toBe(true);
    expect(lanes.filter(lane => lane.category === "Modernize Infrastructure").map(lane => lane.workstreamType)).toEqual(expect.arrayContaining(["Infrastructure Build", "Migration Waves"]));
    expect(lanes.every(lane => lane.bars.every(activity => activity.color === colorForWorkstreamType(lane.workstreamType)))).toBe(true);
  });

  it("bounds the fixed-category Notional to the entitlement period and repairs a stale Notional", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, { entitlementStart: "2027-01-01", entitlementEnd: "2028-01-01", targetStart: "2027-01-01", targetComplete: "2027-12-31" });
    const plans = buildAdoptionPlans(document.fields, document.inventory);
    Object.assign(document, plans);
    expect(document.twoYearPlan.columns).toHaveLength(13);
    expect(new Set(document.twoYearPlan.lanes.map(lane => lane.category))).toEqual(new Set(FIXED_GANTT_CATEGORIES));
    expect(document.twoYearPlan.lanes.flatMap(lane => lane.bars).every(activity => activity.endCol <= document.twoYearPlan.columns.length + 1)).toBe(true);

    const staleDocument = JSON.parse(JSON.stringify(document));
    staleDocument.twoYearPlan.lanes = staleDocument.twoYearPlan.lanes.map((lane: { bars: unknown[] }) => ({ ...lane, bars: [] }));
    const migrated = migrateDocument(staleDocument);
    expect(migrated.twoYearPlan.columns).toHaveLength(13);
    expect(new Set(migrated.twoYearPlan.lanes.map(lane => lane.category))).toEqual(new Set(FIXED_GANTT_CATEGORIES));
    expect(migrated.twoYearPlan.lanes.flatMap(lane => lane.bars)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "bar-platform-plan" }),
    ]));
  });

  it("adds VCF networking only after explicit scope confirmation and strips unselected generated networking from saved plans", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, {
      entitlementStart: "2027-01-01",
      entitlementEnd: "2027-12-31",
      targetStart: "2027-01-01",
      targetComplete: "2027-12-31",
    });

    const unselectedPlans = buildAdoptionPlans(document.fields, document.inventory);
    expect(unselectedPlans.adoptionTimeline.lanes.flatMap(lane => lane.bars).some(activity => activity.id === "bar-vcf-networking-nsx")).toBe(false);
    expect(unselectedPlans.twoYearPlan.lanes.flatMap(lane => lane.bars).some(activity => activity.id === "bar-two-year-baseline-networking-nsx")).toBe(false);

    const explicitlyScopedFields = { ...document.fields, priorities: [...document.fields.priorities, "networking" as const] };
    const explicitlyScopedPlans = buildAdoptionPlans(explicitlyScopedFields, document.inventory);
    const primaryNetworking = explicitlyScopedPlans.adoptionTimeline.lanes.find(lane => lane.id === "lane-modernize-infrastructure-build");
    expect(primaryNetworking).toMatchObject({
      category: "Modernize Infrastructure",
      workstreamType: "Infrastructure Build",
      bars: expect.arrayContaining([expect.objectContaining({ id: "bar-vcf-networking-nsx", label: "Implement VCF Networking, NSX Transport, Edge, and Routing" })]),
    });

    const savedWithLegacyGeneratedNetworking = JSON.parse(JSON.stringify({
      ...document,
      adoptionTimeline: explicitlyScopedPlans.adoptionTimeline,
      twoYearPlan: explicitlyScopedPlans.twoYearPlan,
      rationale: explicitlyScopedPlans.rationale,
    }));
    const migrated = migrateDocument(savedWithLegacyGeneratedNetworking);
    expect(migrated.adoptionTimeline.lanes.flatMap(lane => lane.bars).some(activity => activity.id === "bar-vcf-networking-nsx")).toBe(false);
    expect(migrated.twoYearPlan.lanes.flatMap(lane => lane.bars).some(activity => activity.id === "bar-two-year-baseline-networking-nsx")).toBe(false);
  });

  it("renders entitlement details and both synchronized adoption views with VCF 9.1 platform evidence", () => {
    const document = createDefaultDocument();
    Object.assign(document.fields, { customerName: "Meridian Health", entitledCores: 128, entitlementAmount: 3_000_000, entitlementStart: "2027-01-01", entitlementEnd: "2028-01-01", targetStart: "2027-01-01", targetComplete: "2027-09-30", priorities: ["operations"], adoptionDetails: { ...document.fields.adoptionDetails, operations: ["observability", "custom-dashboards"] } });
    Object.assign(document.inventory, { sourceCount: 2, hosts: 4, physicalCores: 128, vmCount: 220, poweredOnVms: 200, hostModels: [{ vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel: "Intel(R) Xeon(R) Gold 6430", hosts: 4, physicalCores: 128, esxiVersions: [{ version: "8.0.3", hosts: 4 }], esxiCorrelation: "per-platform" }] });
    const plans = buildAdoptionPlans(document.fields, document.inventory);
    Object.assign(document, { readiness: assessReadiness(document.fields, document.inventory), ...plans });
    const html = renderFcpHtml("Meridian FCP", document);
    expect(html).toContain("Meridian Health");
    expect(html).toContain("$3,000,000");
    expect(html).toContain("Operational Adoption Timeline");
    expect(html).toContain("Entitlement Notional");
    expect(html).toContain("Two-year operational view:");
    expect(html).toContain("Entitlement-period planning view:");
    expect(html).toContain("Planned Project Start Through Entitlement End");
    expect(html).toContain("planned project start (2027-01-01)");
    expect(html).toContain("through 2028-01-01");
    expect(html).toContain("Intended Outcome");
    expect(html).toContain("Sequence Notes");
    expect(html).toContain("Publish Operational Dashboards and Service Measures");
    expect(html).toContain("Implement the selected operating capability with accountable ownership and measurable service outcomes.");
    expect(html).toContain("Begin after workload-domain readiness and the HCL gate.");
    expect(html).toContain("Observed host inventory");
    expect(html).toContain("VCF 9.1 Delivery Inventory");
    expect(html).toContain("Reported ESXi");
    expect(html).toContain("220 VM records");
    expect(html).toContain("Customer-aligned delivery plan");
    expect(html).toContain("HCL Server + CPU Evidence");
    expect(html).not.toContain("Physical cores");
    expect(html).toContain("Snapshot-supported pairing");
    expect(html).toContain("Offline HCL limitation");
    expect(html).toContain("Migration Waves");
    expect(html).toContain('<div class="timeline-corner">Category</div>');
    expect(html).toContain("timeline-category-lane");
    expect(html).toContain("timeline-category-row");
    expect(html).toContain('grid-template-rows:repeat(');
    expect(html).toContain('class="sequence-category"');
    expect(html).toContain('<th colspan="5" style="background:#10233f;color:#fff;text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:8px 10px">Modernize Infrastructure</th>');
    expect(html).not.toContain("Category Group / Workstream Type");
    expect(html).not.toContain("<th>Workstream type</th>");
    expect(html).toContain("Workstream color key");
    expect(html).toContain("Infrastructure Build");
    expect(html).not.toContain("Implement VCF Networking, NSX Transport, Edge, and Routing");
    expect(html).not.toContain("VCF Networking and NSX Lifecycle Progression");
    expect(html).not.toContain("independently from security services");
    const planSummaryStart = html.indexOf('<div class="plan-summary">');
    const observedInventoryStart = html.indexOf("Observed host inventory");
    const planSummary = html.slice(planSummaryStart, observedInventoryStart);
    expect(planSummaryStart).toBeGreaterThan(-1);
    expect(observedInventoryStart).toBeGreaterThan(planSummaryStart);
    expect(planSummary).toContain("<h3>Customer background</h3>");
    expect(planSummary).toContain("<h3>Observed footprint</h3>");
    expect(planSummary).toContain("<h3>Selected scope</h3>");
    expect(planSummary).toContain("<h3>Entitlement Notional</h3>");
    expect(planSummary).toContain("<h3>Operational Adoption Timeline</h3>");
    expect(planSummary).toContain('<span class="summary-index">01</span>');
    expect(planSummary).not.toContain("data-step=");
    expect(html).toContain('<section class="executive-sheet">');
    expect(html).toContain('<section class="summary-plan">');
    expect(html).toContain("Executive snapshot");
    expect(html).toContain("Plan on a Page");
    expect(html).toContain(".executive-sheet{height:auto;min-height:7.7in");
    expect(html).not.toContain(".executive-sheet{height:8.5in;min-height:8.5in");
    expect(html).toContain(".summary-plan{height:8.5in;min-height:8.5in");
    expect(html).toContain("@page{size:letter landscape;margin:0}");
    expect(html).toContain('<section class="hardware-evidence">');
    expect(html).toContain('class="compact-table hardware-table"');
    expect(html).toContain("VCF 9.1 Delivery Inventory");
    expect(html).toContain('class="notional-year-sheet notional-year-one"');
    expect(html).not.toContain('class="notional-year-sheet notional-year-two"');
    expect(html).toContain("Planned Project Start Through Entitlement End");
    expect(html).toContain("Entitlement-Aligned Delivery Outlook");
    expect(html).not.toContain("Months 13–24");
    expect(html).not.toContain("Continuous Year 2 Delivery");
    expect(html).not.toContain("Year 2 Follow-On Services");
    expect(html).toContain("#two-year .notional-year-sheet .timeline-grid{width:100%;min-width:0!important;grid-template-columns:1.45in repeat(12,minmax(0,1fr))!important}");
    expect(html).not.toContain("#two-year .notional-year-two{page-break-before:always;break-before:page}");
    expect(html).toContain('class="two-year-sequence-sheet"');
    expect(html).toContain("#two-year .two-year-sequence-sheet{page-break-before:always;break-before:page}");
    expect(html).toContain("page-break-after:always;break-after:page");
    const visibleReport = html.replace(/<style>[\s\S]*?<\/style>/i, "");
    expect(visibleReport).not.toMatch(/\b(assessment|workshop)\b/i);
    expect(html).not.toMatch(/Gantt|Year [12] Consumption Plan|Workshop/i);
    expect(html).not.toMatch(/\[\[[^\]]+\]\]/);
  });

  it("can omit the VCF 9.1 readiness section while retaining the customer plan and timeline export", () => {
    const document = createDefaultDocument();
    document.fields.customerName = "Meridian Health";
    document.fields.exportPreferences.includeVcfReadiness = false;
    Object.assign(document.inventory, { sourceCount: 1, hosts: 4, vmCount: 220, esxiVersions: [{ version: "8.0.3", hosts: 4 }] });

    const html = renderFcpHtml("Meridian FCP", document);
    expect(html).not.toContain('data-tab="considerations"');
    expect(html).not.toContain('<section id="considerations"');
    expect(html).not.toContain("VCF 9.1 Host Inventory");
    expect(html).not.toContain("VCF 9.1 Delivery Inventory");
    expect(html).not.toContain("HCL Server + CPU Evidence");
    expect(html).toContain("Customer background");
    expect(html).toContain("Observed footprint");
    expect(html).toContain("Entitlement Notional");
    expect(html).toContain("Operational Adoption Timeline");
  });

  it("defaults the VCF 9.1 readiness export preference to included when migrating saved documents", () => {
    const persisted = JSON.parse(JSON.stringify(createDefaultDocument())) as Record<string, unknown>;
    const fields = persisted.fields as Record<string, unknown>;
    delete fields.exportPreferences;

    expect(migrateDocument(persisted).fields.exportPreferences.includeVcfReadiness).toBe(true);
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


describe("HCL 2.0 estate evidence", () => {
  function detailedHclEvidence() {
    const evidence = emptyHclInventoryEvidence();
    evidence.tabs = Object.fromEntries(["vHost", "vNIC", "vHBA", "vCluster", "dvSwitch", "vSCVMK", "vDatastore", "vInfo", "vNetwork", "vSnapshot", "vTools", "vCD", "vUSB"].map(tab => [tab, true]));
    evidence.hosts = [{ name: "esx01", cluster: "Cluster-A", vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel: "Intel(R) Xeon(R) Gold 6230", esxiVersion: "8.0.3", socketCount: 2, coresPerSocket: 8, biosVersion: "1.0.0", biosDate: "2020-01-01" }];
    evidence.nics = [{ host: "esx01", cluster: "Cluster-A", device: "vmnic0", driver: "ixgben", speedMb: 1000, switchName: "vSwitch0" }];
    evidence.hbas = [{ host: "esx01", cluster: "Cluster-A", device: "vmhba0", model: "Example HBA", driver: "lpfc" }];
    evidence.clusters = [{ name: "Cluster-A", ha: "disabled", drs: "disabled", evcMode: "intel-haswell", vsan: "enabled" }];
    evidence.distributedSwitches = [{ name: "vDS-01", version: "6.6", maxMtu: 1500 }];
    evidence.vmkernels = [{ host: "esx01", cluster: "Cluster-A", device: "vmk1", mtu: 1500, portGroup: "vSAN", vsan: "enabled" }];
    evidence.datastores = [
      { name: "vvol-prod", type: "vVol", version: "", capacityMiB: 100_000, freeMiB: 10_000, freePct: 10 },
      { name: "vmfs-legacy", type: "VMFS", version: "5", capacityMiB: 100_000, freeMiB: 10_000, freePct: 10 },
      { name: "nfs-legacy", type: "NFS", version: "3", capacityMiB: 100_000, freeMiB: 30_000, freePct: 30 },
    ];
    evidence.vmInfo = [{ vm: "app01", guestOs: "Windows Server", hardwareVersion: "vmx-13" }];
    evidence.vmNetworks = [{ vm: "app01", adapter: "VMXNET2" }];
    evidence.snapshots = [{ vm: "app01", date: "2025-01-01" }];
    evidence.tools = [{ vm: "app01", status: "Tools not installed" }];
    evidence.cdDevices = [{ vm: "app01", connected: "enabled" }];
    evidence.usbDevices = [{ vm: "app01", connected: "enabled" }];
    return evidence;
  }

  it("evaluates every RVTools-observable HCL 2.0 family and discloses unavailable checks", () => {
    const assessment = assessHclEstate(detailedHclEvidence(), new Date("2026-07-28T00:00:00.000Z"));
    const checkIds = assessment.findings.map(finding => finding.checkId);

    expect(checkIds).toEqual(expect.arrayContaining([
      "HW.SERVER_CPU_CPU_NOT_CERTIFIED", "LIC.SOCKET_BELOW_CORE_FLOOR", "NET.NIC_COUNT_LOW", "NET.NIC_SPEED_LOW",
      "CLU.HA_DISABLED", "CLU.DRS_DISABLED", "CLU.EVC_BASELINE_BELOW_ESXI9", "CLU.SIZE_BELOW_MINIMUM",
      "NET.VDS_VERSION_TOO_OLD", "NET.VDS_MTU_TOO_LOW", "NET.NO_DISTRIBUTED_SWITCH", "NET.VSAN_VMK_MTU_LOW",
      "STO.VVOL_DATASTORE", "STO.VMFS_VERSION_OLD", "STO.FREE_SPACE_LOW", "STO.NFS_V3",
      "VM.DEPRECATED_VNIC", "VM.STALE_SNAPSHOTS", "VM.CDROM_CONNECTED", "VM.USB_PASSTHROUGH", "VM.TOOLS_MISSING", "VM.HW_VERSION_SPREAD", "LIC.CORE_COUNT",
    ]));
    expect(assessment.coverageGaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "missing-dataset", subject: "I/O driver compatibility dataset" }),
      expect.objectContaining({ kind: "missing-dataset", subject: "Guest OS compatibility dataset" }),
      expect.objectContaining({ kind: "not-in-rvtools", subject: "TPM 2.0, boot device, and firmware levels" }),
      expect.objectContaining({ kind: "not-in-rvtools", subject: "PCI vendor/device identifiers" }),
    ]));
    expect(assessment.coverageGaps.some(gap => gap.kind === "missing-tab" || gap.kind === "empty-tab")).toBe(false);
  });

  it("propagates estate-level blockers into readiness and the customer-facing export", () => {
    const document = createDefaultDocument();
    document.inventory = { ...document.inventory, hosts: 1, physicalCores: 16, hclEvidence: detailedHclEvidence() };
    document.readiness = assessReadiness(document.fields, document.inventory);
    const estateReadiness = document.readiness.items.find(item => item.id === "hcl-2-estate-evidence");
    const html = renderFcpHtml("HCL Estate Test", document);

    expect(document.readiness.hclSchedulePath).toBe("red");
    expect(estateReadiness).toMatchObject({ status: "attention", title: "HCL 2.0 Estate Evidence" });
    expect(estateReadiness?.detail).toContain("blocker");
    expect(html).toContain("HCL 2.0 Estate Evidence and Findings");
    expect(html).toContain("vVols datastore present");
    expect(html).toContain("Coverage Gaps and Evidence Required");
  });
});
