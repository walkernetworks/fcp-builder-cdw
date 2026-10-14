import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyCustomerBrief } from "../shared/briefImport";
import { createDefaultDocument, migrateDocument, refreshDerivedDocument } from "../shared/fcp";

const example = () => JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../docs/examples/customer-brief.example.json"), "utf8"));

describe("customer brief import", () => {
  it("maps planning answers to fields, coercing loose phrasing", () => {
    const result = applyCustomerBrief(createDefaultDocument(), example());
    expect(result.ok).toBe(true);
    const { fields } = result.document;
    expect(fields).toMatchObject({ customerName: "Acme Health", location: "Reno, NV", customerSegment: "commercial", entitlementAmount: 79403, entitlementStart: "2026-04-29", hardwareAvailability: "new" });
    expect(fields.adoptionDetails).toMatchObject({ upgradePath: "greenfield", domainTopology: "consolidated", principalStorage: "vmfs-fc" });
    expect(fields.adoptionDetails.operations).toContain("observability");
    expect(fields.adoptionDetails.resilience).toContain("recovery-architecture");
    expect(fields.priorities).toEqual(expect.arrayContaining(["operations", "resilience"]));
    expect(result.coerced).toEqual(expect.arrayContaining([expect.stringContaining("\"Greenfield\" → \"greenfield\""), expect.stringContaining("\"Fibre Channel\" → \"vmfs-fc\"")]));
  });

  it("stores narrative content in the report", () => {
    const { report } = applyCustomerBrief(createDefaultDocument(), example()).document;
    expect(report.briefVersion).toBe(1);
    expect(report.entitlement).toMatchObject({ hours: 262, hoursConsumed: 39, termEnd: "2027-04-28" });
    expect(report.discovery).toMatchObject({ assessmentCompleted: true, esxHosts: 14, enhancedLinkedMode: false });
    expect(report.declined).toEqual(["Kubernetes", "Private AI", "HCX"]);
    expect(report.whatWeHeard).toHaveLength(2);
    expect(report.designProfile.isolation).toContain("VLAN-backed");
    expect(report.milestonesToDate.map(item => item.date)).toEqual(["2026-04-29", "2026-07-21"]);
    expect(report.customerOwnedWork[0]).toMatchObject({ start: "2027-02", end: "2027-04" });
  });

  it("does not add declined outcomes", () => {
    const brief = example();
    brief.discovery.addOnsConsidered = ["VKS", "VCF Operations"];
    const { fields } = applyCustomerBrief(createDefaultDocument(), brief).document;
    expect(fields.priorities).not.toContain("kubernetes");
    expect(fields.priorities).toContain("operations");
  });

  it("builds the adoption plan from the outcomes the customer wants", () => {
    const brief = example();
    brief.discovery.outcomesWanted = { operations: ["capacity-cost", "Custom Dashboards"], automation: [], networking: [], security: ["segmentation", "firewall everything"], resilience: ["recovery-exercises"], kubernetes: [], privateAi: [] };
    const result = applyCustomerBrief(createDefaultDocument(), brief);
    const { fields } = result.document;
    expect(fields.priorities).toEqual(expect.arrayContaining(["operations", "security", "resilience"]));
    expect(fields.adoptionDetails.operations).toEqual(expect.arrayContaining(["capacity-cost", "custom-dashboards"]));
    expect(fields.adoptionDetails.security).toContain("segmentation");
    expect(fields.adoptionDetails.resilience).toContain("recovery-exercises");
    expect(result.warnings).toContain('discovery.outcomesWanted.security: "firewall everything" is not a recognized outcome; ignored');
  });

  it("drops a bad row with a warning instead of failing the import", () => {
    const brief = example();
    brief.milestonesToDate.push({ date: "September", event: "Kickoff" });
    const result = applyCustomerBrief(createDefaultDocument(), brief);
    expect(result.ok).toBe(true);
    expect(result.document.report.milestonesToDate).toHaveLength(2);
    expect(result.warnings.some(warning => warning.startsWith("milestonesToDate[2]"))).toBe(true);
  });

  it("lists missing facts that become open items", () => {
    const result = applyCustomerBrief(createDefaultDocument(), { schemaVersion: 1, customer: { name: "Acme Health" } });
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual(expect.arrayContaining(["Entitled hours (Resource Assignments total)", "What we heard", "Target personnel"]));
  });

  it("rejects a different schema version or a non-object file", () => {
    expect(applyCustomerBrief(createDefaultDocument(), { schemaVersion: 2 }).ok).toBe(false);
    expect(applyCustomerBrief(createDefaultDocument(), [1, 2]).ok).toBe(false);
  });

  it("never changes inventory and keeps a hand-edited plan", () => {
    const document = refreshDerivedDocument(createDefaultDocument());
    document.inventory = { ...document.inventory, hosts: 14, vmCount: 363 };
    document.planAuthority = "manual";
    const before = JSON.stringify(document.adoptionTimeline);
    const result = applyCustomerBrief(document, example());
    expect(result.document.inventory).toMatchObject({ hosts: 14, vmCount: 363 });
    expect(result.document.planAuthority).toBe("manual");
    expect(JSON.stringify(result.document.adoptionTimeline.lanes.map(lane => lane.bars.map(bar => [bar.id, bar.startCol, bar.endCol])))).toBe(JSON.stringify(JSON.parse(before).lanes.map((lane: any) => lane.bars.map((bar: any) => [bar.id, bar.startCol, bar.endCol]))));
  });

  it("round-trips through a saved document", () => {
    const { document } = applyCustomerBrief(createDefaultDocument(), example());
    const reloaded = migrateDocument(JSON.parse(JSON.stringify(document)));
    expect(reloaded.report.whatWeHeard).toEqual(document.report.whatWeHeard);
    expect(migrateDocument(JSON.parse(JSON.stringify({ ...createDefaultDocument(), report: undefined }))).report.briefVersion).toBeNull();
  });
});

describe("Copilot prompt", () => {
  it("returns a template that imports cleanly when Copilot leaves it unfilled", async () => {
    const { COPILOT_BRIEF_PROMPT } = await import("../shared/briefPrompt");
    const template = COPILOT_BRIEF_PROMPT.slice(COPILOT_BRIEF_PROMPT.indexOf("{\n  \"schemaVersion\""), COPILOT_BRIEF_PROMPT.lastIndexOf("}") + 1);
    const parsed = JSON.parse(template);
    parsed.customer.name = "Acme Health";
    const result = applyCustomerBrief(createDefaultDocument(), parsed);
    expect(result.ok).toBe(true);
    const { report } = result.document;
    expect([report.whatWeHeard, report.designElements, report.openItems, report.personnel, report.milestonesToDate, report.customerOwnedWork, report.sources].every(list => list.length === 0)).toBe(true);
  });

  it("asks for every top-level brief field the importer reads", async () => {
    const { COPILOT_BRIEF_PROMPT } = await import("../shared/briefPrompt");
    for (const key of ["entitlement", "discovery", "designProfile", "designElements", "whatWeHeard", "problems", "openQuestions", "technicalItems", "constraints", "customerAsks", "customerOwnedWork", "openItems", "personnel", "milestonesToDate", "resourceAssignments", "sources", "headline", "revision"]) {
      expect(COPILOT_BRIEF_PROMPT, key).toContain(`"${key}"`);
    }
    expect(COPILOT_BRIEF_PROMPT).toContain("Do NOT use the words \"readiness\", \"workshop\" or \"TRW\"");
  });
});

describe("brief import with hand-entered content", () => {
  it("keeps sections the brief leaves empty and replaces sections it fills", () => {
    const document = createDefaultDocument();
    document.report.situation = ["Typed by hand"];
    document.report.openItems = [{ item: "Hand-entered item", gates: "Build", owner: "Planner" }];
    const brief = example();
    brief.situation = [];
    delete brief.openItems;
    const { report } = applyCustomerBrief(document, brief).document;
    expect(report.situation).toEqual(["Typed by hand"]);
    expect(report.openItems).toEqual([{ item: "Hand-entered item", gates: "Build", owner: "Planner" }]);
    expect(report.whatWeHeard).toHaveLength(2);
  });
});

describe("Copilot prompt for an engagement", () => {
  it("names the customer, lists what the app holds, and pre-fills the name", async () => {
    const { copilotBriefPrompt, COPILOT_BRIEF_PROMPT } = await import("../shared/briefPrompt");
    const document = createDefaultDocument();
    expect(copilotBriefPrompt({ ...document, fields: { ...document.fields, customerName: "" } })).toBe(COPILOT_BRIEF_PROMPT);
    const prompt = copilotBriefPrompt({ ...document, fields: { ...document.fields, customerName: "Acme \"North\" Health", entitlementAmount: 79403, entitlementStart: "2026-04-29" } });
    expect(prompt.startsWith("This brief is for Acme \"North\" Health.")).toBe(true);
    expect(prompt).toContain("- Entitlement value: $79,403");
    expect(prompt).toContain('"customer": { "name": "Acme \\"North\\" Health",');
    expect(prompt).toContain(COPILOT_BRIEF_PROMPT.slice(0, 60));
    for (const internal of ["rate", "PO value", "segment:"]) expect(prompt.slice(0, prompt.indexOf("You are preparing"))).not.toContain(internal);
  });
});

describe("reading Copilot's reply", () => {
  it("accepts plain JSON, a fenced json block, or JSON with text around it", async () => {
    const { parseBriefText } = await import("../shared/briefImport");
    const brief = { schemaVersion: 1, customer: { name: "Acme Health" } };
    const json = JSON.stringify(brief, null, 2);
    expect(parseBriefText(json)).toEqual(brief);
    expect(parseBriefText(`Here is the brief:\n\`\`\`json\n${json}\n\`\`\`\nLet me know.`)).toEqual(brief);
    expect(parseBriefText(`Sure! ${json} Hope that helps.`)).toEqual(brief);
    expect(() => parseBriefText("No brief here.")).toThrow();
  });

  it("asks Copilot for a downloadable file named after the customer", async () => {
    const { copilotBriefPrompt, COPILOT_BRIEF_PROMPT } = await import("../shared/briefPrompt");
    const document = createDefaultDocument();
    expect(COPILOT_BRIEF_PROMPT).toContain("downloadable file named customer-brief.json");
    expect(copilotBriefPrompt({ ...document, fields: { ...document.fields, customerName: "Acme Health, Inc." } })).toContain("downloadable file named Acme-Health-Inc-brief.json");
  });
});

describe("plan inputs from the brief", () => {
  it("fills schedule, contact, site prerequisites, component depth, industry and release, mapping loose wording", () => {
    const base = createDefaultDocument();
    const result = applyCustomerBrief({ ...base, fields: { ...base.fields, primaryContact: "" } }, {
      schemaVersion: 1,
      customer: { name: "Acme Health", accountId: 12345 },
      contacts: { customer: [{ name: "Pat Rivera", role: "Infrastructure Manager" }] },
      schedule: { projectStart: "2026-11-02", implementationStart: "2027-01-04", targetComplete: "next spring", hardwareLeadWeeks: "10 weeks", calendarConstraints: "Change freeze Dec 15 to Jan 2." },
      discovery: { sitePrerequisitesOpen: ["DNS", "top of rack"], componentDepth: { operations: "Operationalized", automation: "tier 1", networkingSecurity: null }, industry: "Healthcare", targetRelease: "9.1", planningNotes: "Two sites share one change board." },
    });
    expect(result.ok).toBe(true);
    const { fields } = result.document;
    expect(fields).toMatchObject({ accountId: "12345", primaryContact: "Pat Rivera, Infrastructure Manager", plannedProjectStart: "2026-11-02", plannedImplementationStart: "2027-01-04", hardwareLeadWeeks: 10, timelineNotes: "Change freeze Dec 15 to Jan 2.", compatibilityTargetRelease: "ESXi 9.1" });
    expect(fields.adoptionDetails).toMatchObject({ softPrerequisites: ["dns-ntp", "tor-switch-design"], industryTemplate: "healthcare-life-sciences", notes: "Two sites share one change board." });
    expect(fields.adoptionDetails.componentDepths).toMatchObject({ operations: "tier-2", automation: "tier-1", networkingSecurity: base.fields.adoptionDetails.componentDepths.networkingSecurity });
    expect(result.warnings.join(" ")).toContain("schedule.targetComplete");
    expect(fields.targetComplete).toBe(base.fields.targetComplete);
  });

  it("keeps a primary contact the planner already entered unless the brief names one", () => {
    const base = createDefaultDocument();
    const document = { ...base, fields: { ...base.fields, primaryContact: "Set by hand" } };
    expect(applyCustomerBrief(document, { schemaVersion: 1, contacts: { customer: [{ name: "Pat Rivera", role: "" }] } }).document.fields.primaryContact).toBe("Set by hand");
    expect(applyCustomerBrief(document, { schemaVersion: 1, customer: { primaryContact: "Sam Lee, CIO" } }).document.fields.primaryContact).toBe("Sam Lee, CIO");
  });
  it("reads mixed jumbo frames", () => {
    const brief = example() as Record<string, any>;
    brief.discovery = { ...brief.discovery, jumboFrames: "Mixed: Citrix and Epic switches run 9000" };
    expect(applyCustomerBrief(createDefaultDocument(), brief).document.report.discovery.jumboFrames).toBe("mixed");
  });
  it("reads the domain list, coercing loose phrasing", () => {
    const brief = example() as Record<string, any>;
    brief.discovery = { ...brief.discovery, plannedPath: "hybrid", domains: [
      { name: "North", kind: "Management Domain", pathway: "Greenfield build", instance: "North", hosts: "4", notes: "Move the CORE 600 workloads first" },
      { name: "Epic", kind: "Workload", pathway: "Import existing vCenter", instance: "North", hosts: null, notes: null },
      { name: "", kind: "workload", pathway: "import" },
    ] };
    const result = applyCustomerBrief(createDefaultDocument(), brief);
    expect(result.document.fields.adoptionDetails.domains).toEqual([
      { name: "North", kind: "management", pathway: "greenfield", instance: "North", hosts: 4, notes: "Move the CORE 600 workloads first" },
      { name: "Epic", kind: "workload", pathway: "import", instance: "North", hosts: null, notes: "" },
    ]);
  });
});
