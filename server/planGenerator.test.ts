import { describe, expect, it } from "vitest";
import { createDefaultDocument, refreshDerivedDocument, validateTimeline, validateTimelineSequence, type EngagementDocument, type Timeline, type TimelineBar } from "../shared/fcp";

type AdoptionDetailsPatch = Partial<EngagementDocument["fields"]["adoptionDetails"]>;

function plan(details: AdoptionDetailsPatch, fields: Partial<EngagementDocument["fields"]> = {}): EngagementDocument {
  const document = createDefaultDocument();
  Object.assign(document.fields, {
    customerName: "Acme",
    plannedProjectStart: "2026-06-01",
    plannedImplementationStart: "2026-06-01",
    entitlementStart: "2026-06-01",
    priorities: [],
    ...fields,
  });
  document.fields.adoptionDetails = { ...document.fields.adoptionDetails, ...details };
  return refreshDerivedDocument(document, { forceRebuild: true });
}

function activities(timeline: Timeline): TimelineBar[] {
  return timeline.lanes.flatMap(lane => lane.bars);
}

function activity(timeline: Timeline, id: string): TimelineBar {
  const found = activities(timeline).find(item => item.id === id);
  if (!found) throw new Error(`No activity ${id}; have ${activities(timeline).map(item => item.id).join(", ")}`);
  return found;
}

describe("timeline sequence validation", () => {
  it("warns when an activity starts before a prerequisite finishes, and ignores missing prerequisites", () => {
    const timeline: Timeline = {
      cadence: "month",
      startDate: "2026-06-01",
      columns: ["Jun 26", "Jul 26", "Aug 26", "Sep 26"],
      lanes: [{
        id: "lane",
        name: "Governance",
        category: "Program Management & Governance",
        workstreamType: "Governance",
        bars: [
          { id: "a", startCol: 1, endCol: 3, color: "green", label: "Build", milestone: false, deferred: false },
          { id: "b", startCol: 2, endCol: 4, color: "green", label: "Secure", milestone: false, deferred: false, prerequisites: ["a", "gone"] },
          { id: "c", startCol: 3, endCol: 5, color: "green", label: "Operate", milestone: false, deferred: false, prerequisites: ["a"] },
        ],
      }],
    };
    expect(validateTimelineSequence(timeline)).toEqual(["“Secure” starts before its prerequisite “Build” finishes."]);
  });
});

describe("site readiness prerequisites", () => {
  it("runs confirmed prerequisites before platform build on non-Red pathways", () => {
    const document = plan({ upgradePath: "greenfield", softPrerequisites: ["dns-ntp", "ip-pools"] });
    const foundation = activity(document.adoptionTimeline, "bar-management-domain");
    for (const id of ["bar-soft-prerequisite-dns-ntp", "bar-soft-prerequisite-ip-pools"]) {
      expect(activity(document.adoptionTimeline, id).endCol).toBeLessThanOrEqual(foundation.startCol);
    }
  });

  it("does not schedule site prerequisites for a design-only plan", () => {
    const document = plan({ upgradePath: "design-only", softPrerequisites: ["dns-ntp"] });
    expect(activities(document.adoptionTimeline).some(item => item.id.startsWith("bar-soft-prerequisite-"))).toBe(false);
  });
});

describe("plans without an approved execution pathway", () => {
  for (const upgradePath of ["design-only", "undecided"] as const) {
    it(`carries a ${upgradePath} plan through entitlement end`, () => {
      const document = plan({ upgradePath }, { priorities: ["operations"] });
      const timeline = document.adoptionTimeline;
      const lastColumn = timeline.columns.length + 1;
      const decision = activity(timeline, "bar-platform-execution-decision");
      expect(decision.milestone).toBe(true);
      expect(activity(timeline, "bar-platform-design-authority")).toMatchObject({ startCol: decision.endCol, endCol: lastColumn });
      expect(activity(timeline, "bar-platform-operating-readiness").endCol).toBe(lastColumn);
      expect(activities(timeline).some(item => item.id.startsWith("bar-playbook-execution-"))).toBe(false);
      expect(validateTimeline(timeline)).toEqual([]);
      expect(validateTimelineSequence(timeline)).toEqual([]);
    });
  }
});

describe("outcome prerequisites", () => {
  it("adds and sequences the vDefend chain for malware prevention", () => {
    const document = plan({ upgradePath: "greenfield", security: ["malware-prevention"] }, { priorities: ["security"] });
    const timeline = document.adoptionTimeline;
    const nsx = activity(timeline, "bar-vcf-networking-nsx");
    const segmentation = activity(timeline, "bar-security-segmentation");
    const ssp = activity(timeline, "bar-security-services-platform");
    const malware = activity(timeline, "bar-security-malware-prevention");
    expect(segmentation.startCol).toBeGreaterThanOrEqual(nsx.endCol);
    expect(ssp.startCol).toBeGreaterThanOrEqual(nsx.endCol);
    expect(malware.startCol).toBeGreaterThanOrEqual(Math.max(segmentation.endCol, ssp.endCol));
    expect(malware.prerequisites).toEqual(expect.arrayContaining(["bar-security-segmentation", "bar-security-services-platform"]));
    expect(segmentation.outcome).toContain("Included as a prerequisite for: Enable vDefend Malware Prevention and Sandboxing");
    expect(malware.dependsOn).toContain("vDefend Firewall with ATP add-on");
    expect(document.rationale).toContain("Prerequisites were added so selected outcomes can be delivered");
    expect(validateTimelineSequence(timeline)).toEqual([]);
  });

  it("builds VPCs on overlay, Edge routing, and the physical fabric", () => {
    const timeline = plan({ upgradePath: "converge", networking: ["vpc"] }, { priorities: ["networking"] }).adoptionTimeline;
    const fabric = activity(timeline, "bar-networking-physical-fabric");
    const nsx = activity(timeline, "bar-vcf-networking-nsx");
    const edge = activity(timeline, "bar-networking-edge-cluster-routing");
    const vpc = activity(timeline, "bar-networking-vpc");
    expect(fabric.endCol).toBeLessThanOrEqual(activity(timeline, "bar-converge-management-domain").startCol);
    expect(edge.startCol).toBeGreaterThanOrEqual(nsx.endCol);
    expect(vpc.startCol).toBeGreaterThanOrEqual(Math.max(edge.endCol, activity(timeline, "bar-networking-overlay-transport").endCol));
    expect(validateTimelineSequence(timeline)).toEqual([]);
  });

  it("places WAF after Avi, and DSM after VCF Automation and the Supervisor", () => {
    const timeline = plan({ upgradePath: "greenfield", security: ["waf"], automation: ["data-services"] }, { priorities: ["security", "automation"] }).adoptionTimeline;
    expect(activity(timeline, "bar-security-waf").startCol).toBeGreaterThanOrEqual(activity(timeline, "bar-networking-load-balancing").endCol);
    const dsm = activity(timeline, "bar-cloud-automation-data-services");
    expect(dsm.startCol).toBeGreaterThanOrEqual(activity(timeline, "bar-cloud-automation-vm-self-service").endCol);
    expect(dsm.startCol).toBeGreaterThanOrEqual(activity(timeline, "bar-cloud-kubernetes-workload-domains").endCol);
    // A focus replaces the generic capability activity.
    expect(activities(timeline).some(item => item.id === "bar-cloud-automation")).toBe(false);
  });

  it("takes the Private AI pilot through GPU capacity, guardrails, the Supervisor, and VCF Automation", () => {
    const timeline = plan({ upgradePath: "greenfield", privateAi: ["pilot-onboarding"] }, { priorities: ["private-ai"] }).adoptionTimeline;
    const pilot = activity(timeline, "bar-cloud-private-ai-pilot-onboarding");
    for (const id of ["bar-cloud-private-ai-ai-guardrails", "bar-cloud-automation-vm-self-service"]) expect(pilot.startCol).toBeGreaterThanOrEqual(activity(timeline, id).endCol);
    expect(activity(timeline, "bar-cloud-private-ai-gpu-capacity").startCol).toBeGreaterThanOrEqual(activity(timeline, "bar-cloud-kubernetes-workload-domains").endCol);
  });
});

describe("platform licensing", () => {
  it("activates subscription licensing after the foundation on execution pathways", () => {
    const timeline = plan({ upgradePath: "greenfield" }).adoptionTimeline;
    expect(activity(timeline, "bar-platform-licensing").startCol).toBeGreaterThanOrEqual(activity(timeline, "bar-management-domain").endCol);
  });

  it("skips licensing when importing into an already licensed VCF instance", () => {
    const timeline = plan({ upgradePath: "import-workload-domain" }).adoptionTimeline;
    expect(activities(timeline).some(item => item.id === "bar-platform-licensing")).toBe(false);
  });
});

describe("timeline horizon", () => {
  it("extends the grid past entitlement end instead of squeezing work into the last column", () => {
    const document = plan({
      upgradePath: "greenfield",
      operations: ["lifecycle", "observability", "capacity-cost"],
      security: ["malware-prevention", "ids-ips", "waf"],
      resilience: ["recovery-exercises"],
    }, { priorities: ["operations", "security", "resilience"] });
    const timeline = document.adoptionTimeline;
    const byLane = timeline.lanes.find(lane => lane.id === "lane-security-resilience")!.bars.filter(item => !item.id.startsWith("bar-playbook-component-design-"));
    // Sequential security work never shares a start column.
    expect(new Set(byLane.map(item => item.startCol)).size).toBe(byLane.length);
    expect(timeline.columns.length).toBeGreaterThan(13);
    expect(validateTimeline(timeline)).toEqual([]);
    expect(validateTimelineSequence(timeline)).toEqual([]);
  });
});

describe("VMware vSphere Foundation plans", () => {
  const vvf = (details: AdoptionDetailsPatch, fields: Partial<EngagementDocument["fields"]> = {}) =>
    plan({ platformEdition: "vvf", ...details }, { customerSegment: "commercial", ...fields });

  it("applies VVF only to commercial customers", () => {
    const publicSector = plan({ platformEdition: "vvf", upgradePath: "greenfield" }, { customerSegment: "public-sector" });
    expect(activities(publicSector.adoptionTimeline).some(item => item.id === "bar-management-domain")).toBe(true);
    const commercial = vvf({ upgradePath: "greenfield" });
    expect(activities(commercial.adoptionTimeline).some(item => item.id === "bar-management-domain")).toBe(false);
  });

  it("builds a VVF foundation with no NSX, and leaves VCF-only outcomes out", () => {
    const document = vvf(
      { upgradePath: "greenfield", security: ["segmentation", "waf"], automation: ["vm-self-service"], kubernetes: ["workload-domains"] },
      { priorities: ["security", "automation", "kubernetes"] },
    );
    const timeline = document.adoptionTimeline;
    const ids = activities(timeline).map(item => item.id);
    expect(activity(timeline, "bar-vvf-foundation").label).toBe("Deploy and Validate the Greenfield VVF Foundation");
    expect(ids).toContain("bar-vvf-workload-clusters");
    expect(ids).not.toContain("bar-workload-domain");
    expect(ids.some(id => id === "bar-vcf-networking-nsx" || id === "bar-security-segmentation" || id.startsWith("bar-cloud-automation"))).toBe(false);
    // Avi and VKS are available with VVF.
    expect(ids).toEqual(expect.arrayContaining(["bar-networking-load-balancing", "bar-security-waf", "bar-cloud-kubernetes-workload-domains"]));
    expect(document.rationale).toContain("VMware vSphere Foundation (VVF 9)");
    expect(document.rationale).toContain("Selected outcomes that require VCF are left out of this plan");
    expect(validateTimelineSequence(timeline)).toEqual([]);
  });

  it("falls back to a pathway decision when a VCF-only pathway is selected", () => {
    const timeline = vvf({ upgradePath: "import-workload-domain" }).adoptionTimeline;
    expect(activity(timeline, "bar-playbook-design-pathway-decision").label).toBe("Select VVF Adoption Path and Record Decisions");
    expect(activities(timeline).some(item => item.id === "bar-import-workload-domain")).toBe(false);
  });

  it("uses the VVF upgrade order and operations adoption for an in-place upgrade", () => {
    const timeline = vvf({ upgradePath: "in-place" }).adoptionTimeline;
    expect(activity(timeline, "bar-playbook-design-upgrade-runbook").outcome).toContain("VCF Operations and cloud proxy, vCenter and management services");
    expect(activity(timeline, "bar-playbook-adoption-vvf-operations").label).toBe("Operate the Upgraded Platform Through VCF Operations");
  });
});

describe("generated plans across pathways and editions", () => {
  const paths = ["undecided", "in-place", "converge", "import-workload-domain", "greenfield", "hybrid", "design-only"] as const;
  for (const edition of ["vcf", "vvf"] as const) {
    for (const upgradePath of paths) {
      it(`${edition} ${upgradePath} plans stay inside the grid and in prerequisite order`, () => {
        const document = plan({
          platformEdition: edition,
          upgradePath,
          softPrerequisites: ["dns-ntp"],
          operations: ["lifecycle", "custom-dashboards"],
          networking: ["vpc", "load-balancing"],
          security: ["identity-firewall", "security-intelligence", "waf"],
          resilience: ["cyber-recovery", "cloud-cyber-recovery"],
          kubernetes: ["developer-experience"],
          automation: ["data-services"],
          privateAi: ["pilot-onboarding"],
        }, { customerSegment: "commercial", priorities: ["operations", "networking", "security", "resilience", "kubernetes", "automation", "private-ai"] });
        for (const timeline of [document.adoptionTimeline, document.twoYearPlan]) expect(validateTimeline(timeline)).toEqual([]);
        expect(validateTimelineSequence(document.adoptionTimeline)).toEqual([]);
      });
    }
  }
});
