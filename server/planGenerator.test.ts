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
