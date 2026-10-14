import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyCustomerBrief } from "../shared/briefImport";
import { exportFilename } from "../shared/exportFilename";
import { createDefaultDocument, FIXED_GANTT_CATEGORIES, refreshDerivedDocument, type EngagementDocument } from "../shared/fcp";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { scopedEffortForDocument } from "./rateCard";
import { barWindow } from "../shared/buildingBlocks";

const brief = () => JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../docs/examples/customer-brief.example.json"), "utf8"));

function engagement(patch: (raw: any) => void = () => {}): EngagementDocument {
  const base = createDefaultDocument();
  base.fields.priorities = [];
  Object.assign(base.fields, { plannedProjectStart: "2026-10-01", plannedImplementationStart: "2026-12-01" });
  const raw = brief();
  patch(raw);
  return applyCustomerBrief(base, raw).document;
}

const render = (document: EngagementDocument) => renderCondensedFcpHtml("Acme Health", document, { effort: scopedEffortForDocument(document), today: "2026-09-30" });
const check = (html: string, document: EngagementDocument) => checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount });
const text = (html: string) => html.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("Condensed FCP", () => {
  it("renders every section and passes the content gates", () => {
    const document = engagement();
    const html = render(document);
    expect(check(html, document)).toEqual([]);
    const visible = text(html);
    for (const heading of ["Executive Summary", "Situation", "Plan on a Page", "Entitlement Burndown", "Scoped Effort", "Customer Effort by Week & Work Stream", "Target Personnel by Work Stream", "VCF Design Profile", "Design Elements — Requirements & Recommendations", "Private Cloud Adoption Timeline", "Engagement Milestones to Date", "Key Dates", "Adoption Plan & Recommendation", "Summary", "What we heard, and what we have built to", "Customer Problems", "Open Questions", "The technical items to confirm early", "Sequencing Constraints", "Customer Team Commitments", "Open Items"]) {
      expect(visible, heading).toContain(heading);
    }
    for (const category of FIXED_GANTT_CATEGORIES) expect(visible).toContain(category);
    expect(visible).toContain("Amazing happens when two people run a platform");
    expect(visible).toContain("For customer review · 30 Sep 2026");
    expect(visible).toContain("223 hrs");
    expect(visible).toContain("7.4 hrs/wk");
  });

  it("carries exactly one dollar figure and nothing from the internal fit check", () => {
    const document = engagement();
    const visible = text(render(document));
    expect(visible.match(/\$[\d,]+/g)).toEqual(["$79,403"]);
    for (const internal of ["envelope", "shortfall", "Unfunded", "headroom", "AT RISK", "WATCH", "ON TRACK", "catch-up", "rate"]) expect(visible).not.toMatch(new RegExp(`\\b${internal}\\b`, "i"));
  });

  it("is self-contained and printable", () => {
    const html = render(engagement());
    expect(html).not.toMatch(/<(script|link)\b[^>]*\b(src|href)=/i);
    expect(html.match(/Print \/ Save as PDF/g)).toHaveLength(1);
    expect(html).toContain("CDW — Proprietary and confidential. Copying restricted.");
    expect(html.match(/<path fill="currentColor"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("shows signed resource assignments and keeps the table footed", () => {
    const document = engagement(raw => {
      raw.resourceAssignments = [
        { workstream: "Design discovery, architecture and design", architect: 24, srConsultant: 16, projectManager: 6 },
        { workstream: "Converged management domain build", architect: 10, srConsultant: 50, projectManager: 8 },
      ];
    });
    const html = render(document);
    expect(check(html, document)).toEqual([]);
    expect(text(html)).toContain("from the signed resource assignments");
    expect(text(html)).toContain("Total CDW-delivered hours 34 66 14 114");
  });

  it("says when no consumption data exists instead of showing zeros", () => {
    const document = engagement(raw => { raw.entitlement.hours = null; raw.entitlement.hoursConsumed = null; });
    const visible = text(render(document));
    expect(visible).toContain("No consumption data exists yet");
    expect(visible).not.toContain("Hours Remaining");
  });

  it("leaves out sections nobody has filled in instead of printing placeholders", () => {
    const document = engagement(raw => { raw.personnel = []; raw.whatWeHeard = []; raw.problems = []; raw.openQuestions = []; raw.milestonesToDate = []; });
    document.report.milestonesToDate = [];
    document.report.hiddenGenerated = ["milestonesToDate:entitlement effective"];
    const html = render(document);
    expect(check(html, document)).toEqual([]);
    const visible = text(html);
    for (const heading of ["Target Personnel by Work Stream", "What we heard", "Customer Problems", "Open Questions", "Engagement Milestones to Date"]) expect(visible, heading).not.toContain(heading);
    expect(visible).not.toMatch(/to be named|to be recorded|to be confirmed\b(?! —)/);
  });

  it("draws the entitlement timeline and the two-year notional with the full FCP's category Gantt", () => {
    const html = render(engagement());
    const visible = text(html);
    for (const heading of ["Private Cloud Adoption Timeline", "After the Entitlement", "Delivery workstream key", "Work Packages and Scoped Effort"]) expect(visible, heading).toContain(heading);
    expect(html.match(/class="timeline-grid"/g)!.length).toBeGreaterThanOrEqual(2);
    // The entitlement year is drawn once; the notional picks up after it.
    expect(visible).not.toContain("Year 1 Adoption Outlook");
  });

  it("starts the notional after the entitlement ends, and stops the entitlement sheet at the term end when less than a year is left", () => {
    const document = engagement();
    document.fields.entitlementStart = "2026-04-01";
    document.report.entitlement.termStart = "2026-04-01";
    document.report.entitlement.termEnd = "2026-12-31";
    const html = render(document);
    const sheets = Array.from(html.matchAll(/<section class="tl-sheet"><div class="tl-head"><span>([^<]*)<\/span><h2>([^<]*)<\/h2>[\s\S]*?<\/section>/g)).map(match => ({ eyebrow: match[1], heading: match[2], months: (match[0].match(/class="timeline-head"/g) ?? []).length }));
    const entitlement = sheets.find(item => item.heading === "Private Cloud Adoption Timeline")!;
    const after = sheets.filter(item => item.heading.startsWith("After the Entitlement"));
    expect(after[0].eyebrow).toMatch(/^Two-Year Notional · Jan 2027 to /);
    expect(entitlement.months + after.reduce((sum, item) => sum + item.months, 0)).toBeLessThanOrEqual(24 + 1);
    expect(after.every(item => item.months <= 12)).toBe(true);
  });

  it("describes each work package once, with its hours, what it delivers and how it is accepted", () => {
    const document = engagement();
    document.report.resourceAssignments = [];
    const visible = text(render(document));
    expect(visible).toContain("Work Packages and Scoped Effort");
    expect(visible).toContain("Run the design discovery sessions to");
    expect(visible).toContain("Accepted when:");
    expect(visible).not.toContain("What CDW Delivers");
    expect(visible).not.toContain("Adoption Sequence & Dependencies");
  });
});

/** The example brief with an RVTools estate, so the compatibility and estate sections have evidence to show. */
function withEstate(preferences: { includeVcfReadiness: boolean; includeOperationalTimeline: boolean }): EngagementDocument {
  const document = engagement(raw => { raw.discovery.newHostsPurchased = { management: 4, workload: 8 }; raw.contacts.cdw = [{ name: "Jordan Blake", role: "Architect" }]; });
  Object.assign(document.inventory, {
    hosts: 6, clusters: 2, datacenters: 1, vmCount: 220, poweredOnVms: 190, poweredOffVms: 30, physicalCores: 192, vCpu: 640, vmMemoryGiB: 2400, snapshotCount: 41,
    esxiVersions: [{ version: "8.0.3", hosts: 4 }, { version: "7.0.3", hosts: 2 }],
    clusterProfiles: [{ name: "DC1 / Prod", hosts: 4 }, { name: "DC1 / Mgmt", hosts: 2 }],
    guestOperatingSystems: [{ name: "Microsoft Windows Server 2019", vms: 120 }],
    hostModels: [
      { vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel: "Intel(R) Xeon(R) Gold 6430", hosts: 4, physicalCores: 128, esxiVersions: [{ version: "8.0.3", hosts: 4 }], esxiCorrelation: "per-platform", clusterMembership: [{ name: "DC1 / Prod", hosts: 4 }], minimumMemoryGiB: 512, maximumMemoryGiB: 512 },
      { vendor: "Cisco Systems Inc", model: "UCSC-C240-M5SX", cpuModel: "Intel(R) Xeon(R) Gold 6130", hosts: 2, physicalCores: 64, esxiVersions: [{ version: "7.0.3", hosts: 2 }], esxiCorrelation: "per-platform", clusterMembership: [{ name: "DC1 / Mgmt", hosts: 2 }], minimumMemoryGiB: 384, maximumMemoryGiB: 384 },
    ],
  });
  document.inventorySources = [{ id: "rv-1", filename: "rvtools-dc1.xlsx", byteSize: 1, sheets: ["vHost"], importedAt: "2026-09-20T10:00:00Z", warnings: [] }];
  Object.assign(document.fields, { location: "Columbus, OH", primaryContact: "Pat Rivera, IT Director", targetComplete: "2027-04-15", hardwareAvailability: "new", hardwareLeadWeeks: 8, timelineNotes: "No changes during the December freeze.", exportPreferences: preferences });
  document.fields.adoptionDetails = { ...document.fields.adoptionDetails, industryTemplate: "healthcare-life-sciences", notes: "Keep the DR site on its own workload domain." };
  return refreshDerivedDocument(document, { forceRebuild: true });
}

describe("Condensed FCP as the only FCP", () => {
  it("shows the compatibility posture, actions and planning considerations when the compatibility checkbox is on", () => {
    const document = withEstate({ includeVcfReadiness: true, includeOperationalTimeline: true });
    const html = render(document);
    const visible = text(html);
    expect(visible).toMatch(/ESXi 9\.1 Compatibility/);
    expect(visible).toContain("Target release listed");
    expect(visible).toContain("Compatibility Actions");
    expect(visible).toContain("Planning Considerations");
    expect(visible).toContain("ESXi versions in use: 8.0.3 (4), 7.0.3 (2)");
    expect(checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount })).toEqual([]);
  });

  it("leaves compatibility out, and draws the notional from the project start, when both checkboxes are off", () => {
    const document = withEstate({ includeVcfReadiness: false, includeOperationalTimeline: false });
    const visible = text(render(document));
    expect(visible).not.toContain("Compatibility Actions");
    expect(visible).not.toContain("Private Cloud Adoption Timeline");
    expect(visible).toContain("Two-Year Notional");
    expect(visible).not.toContain("After the Entitlement");
  });

  it("includes every field the engagement collects", () => {
    const visible = text(render(withEstate({ includeVcfReadiness: true, includeOperationalTimeline: true })));
    // Engagement fields
    expect(visible).toContain("Location: Columbus, OH");
    expect(visible).toContain("Industry: Healthcare and life sciences");
    expect(visible).toContain("Pat Rivera");
    expect(visible).toContain("IT Director");
    expect(visible).toContain("Jordan Blake");
    expect(visible).toContain("Implementation services start");
    expect(visible).toContain("target completion");
    expect(visible).toContain("New hardware lead time of 8 weeks");
    expect(visible).toContain("No changes during the December freeze.");
    expect(visible).toContain("Keep the DR site on its own workload domain.");
    // Discovery answers
    expect(visible).toContain("What We Know About the Estate");
    expect(visible).toContain("4 for management, 8 for workloads");
    // RVTools estate
    expect(visible).toContain("192 physical cores");
    expect(visible).toContain("30 powered-off VMs");
    expect(visible).toContain("41 VM snapshots");
    expect(visible).toContain("Microsoft Windows Server 2019 (120)");
    expect(visible).not.toContain("rvtools-dc1.xlsx");
    expect(visible).not.toContain("Sources:");
    // Hours basis (v2)
    expect(visible).toContain("Estimating Basis");
  });
});

describe("Condensed FCP review fixes", () => {
  it("does not call licensed cores beyond the imported hosts spare, and asks which hosts they cover", () => {
    const document = withEstate({ includeVcfReadiness: true, includeOperationalTimeline: true });
    document.report.discovery.licensedCores = 20_000;
    document.inventory.hclEvidence.hosts = Array.from({ length: 6 }, (_, index) => ({ name: `esx${index}`, cluster: "DC1 / Prod", vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel: "Intel(R) Xeon(R) Gold 6430", esxiVersion: "8.0.3", socketCount: 2, coresPerSocket: 16, biosVersion: "", biosDate: "" }));
    const visible = text(render(document));
    expect(visible).toContain("the 6 hosts in these RVTools exports require 192");
    expect(visible).not.toMatch(/\bspare\b/);
    expect(visible).toContain("are not matched to these hosts");
    expect(visible).toMatch(/licensed cores are not matched to the hosts in these RVTools exports/);
  });

  it("turns a renewal date that has passed into an open item", () => {
    const document = withEstate({ includeVcfReadiness: true, includeOperationalTimeline: true });
    document.report.discovery.renewalDate = "2026-01-15";
    const visible = text(render(document));
    expect(visible).not.toContain("Subscription renewal 15 Jan 2026");
    expect(visible).toMatch(/subscription renewal date on record \(15 Jan 2026\) has passed/);
  });

  it("lists the governance stages on the Plan on a Page", () => {
    const visible = text(render(withEstate({ includeVcfReadiness: true, includeOperationalTimeline: true })));
    const governance = /Program Management & Governance — ([^.]*?)(?= Modernize| Operations)/.exec(visible)?.[1] ?? "";
    expect(governance).not.toContain("no work in scope");
    expect(governance).toMatch(/Discovery Sessions/);
  });

  it("builds lifecycle images only for the host models the compatibility check lists", () => {
    const document = withEstate({ includeVcfReadiness: true, includeOperationalTimeline: true });
    document.inventory.hostModels.push({ vendor: "Dell Inc.", model: "PowerEdge R730", cpuModel: "Intel(R) Xeon(R) CPU E5-2697A v4 @ 2.60GHz", hosts: 7, physicalCores: 224, esxiVersions: [{ version: "7.0.3", hosts: 7 }], esxiCorrelation: "per-platform", clusterMembership: [], minimumMemoryGiB: 256, maximumMemoryGiB: 256 } as never);
    document.inventory.hosts += 7;
    const visible = text(render(refreshDerivedDocument(document, { forceRebuild: true })));
    const lifecycle = /Hardware lifecycle (.*?)(?= Disaster recovery| Principal storage| Backup| Licensing| Workloads| Adoption Timeline)/.exec(visible)?.[1] ?? "";
    expect(lifecycle).toContain("Build the cluster images");
    expect(lifecycle).toContain("Blocked or not listed for the target release: Dell PowerEdge R730 (7 hosts)");
    expect(lifecycle).not.toContain("Dell Inc.");
    expect(lifecycle).toContain("Gate: support confirmed or hardware replaced for every host model");
  });

  it("names a server model once and keeps a CPU-split model out of the image list", () => {
    const document = withEstate({ includeVcfReadiness: true, includeOperationalTimeline: true });
    document.inventory.hostModels.push(
      { vendor: "HPE", model: "HPE Synergy 480 Gen10", cpuModel: "Intel(R) Xeon(R) Gold 6248 CPU @ 2.50GHz", hosts: 5, physicalCores: 200, esxiVersions: [{ version: "8.0.3", hosts: 5 }], esxiCorrelation: "per-platform", clusterMembership: [], minimumMemoryGiB: 512, maximumMemoryGiB: 512 } as never,
      { vendor: "Dell Inc.", model: "PowerEdge R730", cpuModel: "Intel(R) Xeon(R) CPU E5-2697A v4 @ 2.60GHz", hosts: 3, physicalCores: 96, esxiVersions: [{ version: "7.0.3", hosts: 3 }], esxiCorrelation: "per-platform", clusterMembership: [], minimumMemoryGiB: 256, maximumMemoryGiB: 256 } as never,
      { vendor: "Dell Inc.", model: "PowerEdge R730", cpuModel: "Intel(R) Xeon(R) Gold 6248 CPU @ 2.50GHz", hosts: 2, physicalCores: 80, esxiVersions: [{ version: "7.0.3", hosts: 2 }], esxiCorrelation: "per-platform", clusterMembership: [], minimumMemoryGiB: 256, maximumMemoryGiB: 256 } as never,
    );
    document.inventory.hosts += 10;
    const visible = text(render(refreshDerivedDocument(document, { forceRebuild: true })));
    expect(visible).not.toMatch(/HPE HPE|Dell Inc\./);
    const lifecycle = /Hardware lifecycle (.*?)(?= Disaster recovery| Principal storage| Backup| Licensing| Workloads| Adoption Timeline)/.exec(visible)?.[1] ?? "";
    const images = /the compatibility check lists: (.*?)\./.exec(lifecycle)?.[1] ?? "";
    expect(images).not.toContain("R730");
    expect(lifecycle).toMatch(/Blocked or not listed for the target release: .*Dell PowerEdge R730 \((\d+ of 5 hosts, by CPU|5 hosts)\)/);
  });

  it("treats a renewal on the entitlement start as the current term, not a lapsed renewal", () => {
    const document = withEstate({ includeVcfReadiness: false, includeOperationalTimeline: true });
    document.fields.entitlementStart = "2026-09-01";
    document.report.discovery.renewalDate = "2026-09-01";
    const visible = text(render(refreshDerivedDocument(document, { forceRebuild: true })));
    expect(visible).not.toContain("has passed");
    expect(visible).not.toContain("Subscription renewal");
    // A renewal well before the term started is still raised.
    document.report.discovery.renewalDate = "2026-03-01";
    expect(text(render(refreshDerivedDocument(document, { forceRebuild: true })))).toContain("has passed");
  });

  it("keeps internal estimating references and doubled full stops out of the document", () => {
    const visible = text(render(refreshDerivedDocument(withEstate({ includeVcfReadiness: true, includeOperationalTimeline: true }), { forceRebuild: true })));
    expect(visible).not.toMatch(/\bSpec\b|worked example|consolidated/);
    expect(visible).not.toMatch(/[a-z]\.\.|….|…\./);
  });

  it("targets 9.1.1 when hosts run 8.0 U3j or later builds", () => {
    const document = withEstate({ includeVcfReadiness: true, includeOperationalTimeline: true });
    document.inventory.hclEvidence.hosts = [
      { name: "esx01", cluster: "DC1 / Prod", vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel: "Intel(R) Xeon(R) Gold 6430", esxiVersion: "VMware ESXi 8.0.3 build-25429389", socketCount: 2, coresPerSocket: 32, biosVersion: "", biosDate: "" },
    ];
    const visible = text(render(refreshDerivedDocument(document, { forceRebuild: true })));
    expect(visible).toContain("VCF 9.1.1");
    expect(visible).toContain("must target 9.1.1 or later (KB 450972, KB 454369)");
  });

  it("lists adapter findings in the compatibility section", () => {
    const document = withEstate({ includeVcfReadiness: true, includeOperationalTimeline: true });
    document.inventory.hclEvidence = { ...document.inventory.hclEvidence, tabs: { ...document.inventory.hclEvidence.tabs, vhost: true, vnic: true },
      hosts: [{ name: "rh01", cluster: "Remote Hospitals", vendor: "HPE", model: "ProLiant DL360 Gen10", cpuModel: "Intel(R) Xeon(R) Gold 6230 CPU @ 2.10GHz", esxiVersion: "VMware ESXi 8.0.3 build-24674464", socketCount: 2, coresPerSocket: 20, biosVersion: "", biosDate: "" }],
      nics: [{ host: "rh01", cluster: "Remote Hospitals", device: "vmnic0", driver: "qfle3", speedMb: 10000, switchName: "" }] };
    const visible = text(render(refreshDerivedDocument(document, { forceRebuild: true })));
    expect(visible).toContain("Host Findings");
    expect(visible).toMatch(/NIC on the qfle3 driver.*\(blocker\) 1 host Remote Hospitals/);
  });

  it("dates the platform build from the foundation build and starts licensing inside it", () => {
    const document = withEstate({ includeVcfReadiness: false, includeOperationalTimeline: true });
    document.fields.adoptionDetails = { ...document.fields.adoptionDetails, upgradePath: "hybrid" } as never;
    const refreshed = refreshDerivedDocument(document, { forceRebuild: true });
    const window = (id: string) => { const bar = refreshed.adoptionTimeline.lanes.flatMap(lane => lane.bars).find(item => item.id === id); return bar ? barWindow(refreshed.adoptionTimeline, bar) : null; };
    const foundation = window("bar-management-domain")!;
    const licensing = window("bar-platform-licensing")!;
    expect(licensing.start <= (window("bar-workload-domain")?.end ?? "9999")).toBe(true);
    expect(licensing.start >= foundation.end.slice(0, 7)).toBe(true);
    const visible = text(render(refreshed));
    const month = new Date(`${foundation.start}T00:00:00Z`).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
    expect(visible).toMatch(new RegExp(`\\d{1,2} ${month} Platform build begins`));
  });

  it("marks a calculated entitlement end as to be confirmed, and shows mixed jumbo frames", () => {
    const document = withEstate({ includeVcfReadiness: false, includeOperationalTimeline: true });
    document.report.entitlement.termEnd = "";
    document.report.discovery.jumboFrames = "mixed";
    const visible = text(render(refreshDerivedDocument(document, { forceRebuild: true })));
    expect(visible).toContain("12 months from the start; to be confirmed");
    expect(visible).toMatch(/Entitlement end date: .* is assumed as 12 months from the start/);
    expect(visible).toMatch(/Jumbo frames Mixed/);
    // A stated term end carries no caveat.
    document.report.entitlement.termEnd = "2027-09-30";
    expect(text(render(refreshDerivedDocument(document, { forceRebuild: true })))).not.toContain("to be confirmed");
  });

  it("gives each domain from the brief its own work package, after its own management domain", () => {
    const document = withEstate({ includeVcfReadiness: false, includeOperationalTimeline: true });
    document.fields.adoptionDetails = { ...document.fields.adoptionDetails, upgradePath: "hybrid", domainTopology: "standard", domains: [
      { name: "Lifeline", kind: "management", pathway: "greenfield", instance: "Lifeline", hosts: 4, notes: "Move the SVRA 600 workloads first" },
      { name: "Randalia", kind: "management", pathway: "greenfield", instance: "Randalia", hosts: 4, notes: "" },
      { name: "Citrix VDI", kind: "workload", pathway: "greenfield", instance: "Randalia", hosts: 169, notes: "" },
      { name: "Epic", kind: "workload", pathway: "import", instance: "Lifeline", hosts: 40, notes: "" },
    ] } as never;
    document.report.designProfile.availability = "";
    const refreshed = refreshDerivedDocument(document, { forceRebuild: true });
    const bars = new Map(refreshed.adoptionTimeline.lanes.flatMap(lane => lane.bars).map(bar => [bar.id, bar]));
    expect(bars.get("bar-management-domain")?.label).toBe("Lifeline Management Domain");
    expect(bars.get("bar-management-domain-2")?.prerequisites).toEqual(["bar-management-domain"]);
    expect(bars.get("bar-workload-domain")).toMatchObject({ label: "Citrix VDI Workload Domain", prerequisites: ["bar-management-domain-2"] });
    expect(bars.get("bar-import-domain-1")).toMatchObject({ label: "Import Epic as a Workload Domain", prerequisites: ["bar-management-domain"] });
    const effort = scopedEffortForDocument(refreshed);
    for (const id of ["bar-management-domain", "bar-management-domain-2", "bar-workload-domain", "bar-import-domain-1"]) expect(effort.workPackages.find(row => row.id === id)?.total ?? 0).toBeGreaterThan(0);
    expect(effort.internal.pass1?.inputs).toMatchObject({ workloadDomains: 2, instances: 2 });
    const visible = text(render(refreshed));
    expect(visible).toContain("Import Epic as a Workload Domain");
    expect(visible).toContain("Move the SVRA 600 workloads first, then deploy the Lifeline management domain (4 hosts)");
    expect(visible).toContain("Management domains: Lifeline (Lifeline), built new; Randalia (Randalia), built new.");
  });

  it("raises the work plan hours item only once", () => {
    const document = withEstate({ includeVcfReadiness: false, includeOperationalTimeline: true });
    document.report.openItems = [{ item: "Confirm the 1,445-hour Broadcom work plan", gates: "Hours", owner: "Broadcom" }];
    const visible = text(render(refreshDerivedDocument(document, { forceRebuild: true })));
    expect(visible).not.toContain("Entitled hours from the signed resource assignments");
  });

  it("shows Senior Architect and Offshore PM hours from a signed work plan", () => {
    const document = engagement(raw => { raw.resourceAssignments = [{ workstream: "Design and build", architect: 180, srConsultant: 900, projectManager: 190, seniorArchitect: 62, offshoreProjectManager: 113 }]; });
    const effort = scopedEffortForDocument(document);
    expect(effort.source).toBe("assignments");
    expect(effort.totals.total).toBe(1_445);
    const html = renderCondensedFcpHtml("Acme Health", document, { effort, today: "2026-09-30" });
    const visible = text(html);
    expect(visible).toContain("Sr. Architect");
    expect(visible).toContain("Offshore PM");
    expect(visible).toContain("1,445");
    expect(checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount }).filter(item => !/costs more/.test(item))).toEqual([]);
  });
});

describe("Condensed FCP gates", () => {
  const document = engagement();
  const html = render(document);

  it("blocks readiness, workshop and TRW framing", () => {
    for (const word of ["readiness", "Workshop", "TRW"]) {
      expect(check(html.replace("Executive Summary", `Executive Summary ${word}`), document).join(" ")).toContain("Banned framing");
    }
  });

  it("blocks a second dollar figure and internal terms", () => {
    expect(check(html.replace("Executive Summary", "Executive Summary $293"), document).join(" ")).toContain("More than one dollar figure");
    expect(check(html.replace("Executive Summary", "Executive Summary DRAFT"), document).join(" ")).toContain("DRAFT");
    expect(check(html.replace("Executive Summary", "Executive Summary shortfall"), document).join(" ")).toContain("shortfall");
  });

  it("blocks a table that does not foot", () => {
    const broken = html.replace(/(<tr class="total"><td>Total CDW-delivered hours<\/td>(?:<td><\/td>)*<td class="num">)(\d+)/, (_match, head: string, value: string) => `${head}${Number(value) + 5}`);
    expect(check(broken, document).join(" ")).toContain("does not foot");
  });

  it("blocks a missing category or mandatory section", () => {
    expect(check(html.replaceAll(`<strong>Modernize Cloud</strong>`, ""), document).join(" ")).toContain("Category missing");
    expect(check(html.replaceAll("<h3>Summary</h3>", "<h3>Recap</h3>"), document).join(" ")).toContain("Mandatory section missing");
  });

  it("names the download with the FCP suffix", () => {
    expect(exportFilename("Acme Health", "condensed-fcp", "pdf")).toBe("Acme Health - Condensed - FCP.pdf");
  });
});

describe("hand-entered report content", () => {
  it("saves half-filled rows and leaves them out of the document", async () => {
    const { engagementDocumentSchema } = await import("../shared/fcp");
    const document = engagement();
    document.report.milestonesToDate.push({ date: "", event: "Kickoff still being scheduled", detail: "" });
    document.report.customerOwnedWork.push({ label: "Wave 4", start: "2027-05", end: "" });
    document.report.whatWeHeard.push({ component: "", customerPosition: "", whereItLands: "" });
    expect(engagementDocumentSchema.safeParse(document).success).toBe(true);
    const html = render(document);
    expect(check(html, document)).toEqual([]);
    expect(text(html)).not.toContain("Kickoff still being scheduled");
    expect(text(html)).not.toContain("Wave 4");
  });
});

describe("generated report content", () => {
  it("prints generated rows until the planner hides or overrides them", async () => {
    const { generateReport, effectiveReport } = await import("../shared/reportView");
    const document = engagement(raw => { raw.personnel = []; });
    const generated = generateReport(document);
    const [first, second] = generated.personnel;
    expect(first && second).toBeTruthy();
    expect(effectiveReport(document).personnel.map(row => row.workstream)).toContain(first!.row.workstream);

    document.report.hiddenGenerated = [first!.key];
    document.report.personnel = [{ ...second!.row, cdw: ["Lead architect"] }];
    const personnel = effectiveReport(document).personnel;
    expect(personnel.map(row => row.workstream)).not.toContain(first!.row.workstream);
    expect(personnel.filter(row => row.workstream === second!.row.workstream)).toEqual([{ ...second!.row, cdw: ["Lead architect"] }]);
  });

  it("uses the planner's headline and design profile over the generated text", async () => {
    const { effectiveReport, generateReport } = await import("../shared/reportView");
    const document = engagement();
    document.report.headline = null;
    document.report.designProfile.availability = null;
    expect(effectiveReport(document).headline).toBe(generateReport(document).headline);
    expect(effectiveReport(document).designProfile.availability).toBe(generateReport(document).designProfile.availability);
    document.report.designProfile.availability = "Single site with vSphere HA";
    expect(effectiveReport(document).designProfile.availability).toBe("Single site with vSphere HA");
  });
});

describe("discovery answers", () => {
  it("add design content only where the plan makes them matter", async () => {
    const { generateReport } = await import("../shared/reportView");
    const document = engagement();
    Object.assign(document.report.discovery, { enhancedLinkedMode: true, jumboFrames: false, backup: "Veeam", serverVendor: "Dell", renewalDate: "2027-06-30", addOnsPurchased: ["Avi Load Balancer"] });
    const greenfield = generateReport(document);
    expect(greenfield.designElements.map(item => item.row.component)).toEqual(expect.arrayContaining(["Backup", "Hardware lifecycle"]));
    expect(greenfield.constraints.map(item => item.row.constraint)).toContain("Subscription renewal 30 Jun 2027");
    expect(greenfield.constraints.map(item => item.row.constraint)).not.toContain("Enhanced Linked Mode split before convergence");
    expect(greenfield.openItems.map(item => item.row.item)).toContain("Avi Load Balancer is purchased but not in this plan");

    document.fields.adoptionDetails.upgradePath = "converge";
    expect(generateReport(document).constraints.map(item => item.row.constraint)).toContain("Enhanced Linked Mode split before convergence");

    document.fields.adoptionDetails.upgradePath = "design-only";
    const designOnly = generateReport(document).designElements.map(item => item.row.component);
    expect(designOnly).not.toContain("Backup");
    expect(designOnly).not.toContain("Hardware lifecycle");
  });

  it("brief the delivery team on what is on record and nothing else", async () => {
    const { deliveryBriefing } = await import("../shared/deliveryBriefing");
    const document = engagement();
    document.report.discovery = { ...document.report.discovery, currentPlatform: null, backup: "Veeam", jumboFrames: false, enhancedLinkedMode: null };
    const topics = deliveryBriefing(document).map(item => item.topic);
    expect(topics).toEqual(expect.arrayContaining(["Backup", "Jumbo frames"]));
    expect(topics).not.toContain("Current platform");
    expect(topics).not.toContain("Enhanced Linked Mode");
  });
});

describe("gates on the timeline", () => {
  it("draws a gate as a marker in its last window, not as a span", async () => {
    const { renderTimeline } = await import("./timelineHtml");
    const timeline = { ...engagement().adoptionTimeline, cadence: "month" as const, columns: ["Jan", "Feb", "Mar"], lanes: [{ id: "lane", category: "Program Management & Governance" as const, workstreamType: "Governance" as const, label: "Governance", bars: [{ id: "bar-hcl-gate", startCol: 1, endCol: 3, color: "green" as const, label: "Hardware Compatibility Sign-Off", milestone: true, deferred: false }] }] };
    const html = renderTimeline(timeline as any);
    expect(html).toMatch(/grid-column:2\/3;[^"]*justify-self:end/);
  });
});

describe("work the entitlement cannot carry", () => {
  it("moves out of the entitlement timeline and starts after the entitlement in the notional", async () => {
    const { migrateDocument } = await import("../shared/fcp");
    const { timelinesWithDeferrals } = await import("../shared/effort");
    const document = migrateDocument(engagement(raw => { raw.resourceAssignments = []; }));
    const effort = scopedEffortForDocument(document);
    const deferred = effort.workPackages.filter(row => row.deferred);
    expect(deferred.length).toBeGreaterThan(0);
    expect(deferred.every(row => row.total === 0)).toBe(true);

    const { adoption, notional } = timelinesWithDeferrals(document, deferred.map(row => row.id));
    const ids = new Set(deferred.map(row => row.id));
    expect(adoption.lanes.flatMap(lane => lane.bars).some(bar => ids.has(bar.id))).toBe(false);
    // The entitlement ends 28 Apr 2027; the notional starts Oct 2026, so May 2027 is column 8.
    const moved = notional.lanes.flatMap(lane => lane.bars).filter(bar => ids.has(bar.id));
    expect(moved.length).toBe(deferred.length);
    expect(Math.min(...moved.map(bar => bar.startCol))).toBe(notional.columns.indexOf("May 2027") + 1);

    const visible = text(render(document));
    expect(visible).toContain("after the entitlement:");
    expect(check(render(document), document)).toEqual([]);
  });
});

describe("follow-on scope", () => {
  it("prints deferred work as follow-on hours, not in the entitlement totals", async () => {
    const { migrateDocument } = await import("../shared/fcp");
    const document = migrateDocument(engagement());
    const html = render(document);
    expect(check(html, document)).toEqual([]);
    const visible = text(html);
    expect(visible).toContain("Follow-on Scope — Two-Year Notional");
    expect(visible).toMatch(/Total follow-on hours/);
  });
});

describe("entitlement expiry", () => {
  it("states the expiry date without any extension wording", () => {
    const visible = text(render(engagement()));
    expect(visible).toContain("Expires 28 Apr 2027");
    expect(visible).not.toMatch(/extension/i);
  });
});
