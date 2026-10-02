import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyCustomerBrief } from "../shared/briefImport";
import { buildBurndown, buildCustomerEffort, buildScopedEffort, fitToEnvelope, scopedEffortLines, splitRoles, ROLE_LOADING, type EffortLine } from "../shared/effort";
import { createDefaultDocument, migrateDocument, type EngagementDocument } from "../shared/fcp";
import { fundedHoursFromValue, scopedEffortForDocument } from "./rateCard";

const exampleBrief = () => JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../docs/examples/customer-brief.example.json"), "utf8"));

function engagement(patch: (document: EngagementDocument) => void = () => {}): EngagementDocument {
  // Start from no priorities so only the brief's choices apply (a new engagement preselects some).
  const base = createDefaultDocument();
  base.fields.priorities = [];
  const document = applyCustomerBrief(base, exampleBrief()).document;
  patch(document);
  return document;
}

const codes = (document: EngagementDocument) => scopedEffortLines(document).map(item => item.code);

describe("hours model", () => {
  it("splits a line by lead role with the 1.4375 loading", () => {
    const roles = splitRoles(100, "architect");
    expect(roles).toEqual({ architect: 100, srConsultant: 15, projectManager: 28.75 });
    expect(roles.architect + roles.srConsultant + roles.projectManager).toBeCloseTo(100 * ROLE_LOADING);
  });

  it("picks catalog brackets from the plan and estate", () => {
    // Example brief: greenfield, consolidated, 14 hosts over 2 sites, prior assessment, operations and recovery.
    expect(codes(engagement())).toEqual(["A3", "D1", "FILL", "X4", "X10"]);
    expect(codes(engagement(document => { document.report.discovery.assessmentCompleted = false; }))).toContain("DD2"); // two sites, 14 hosts
    expect(codes(engagement(document => { document.report.discovery.datacenters = 1; document.inventory.datacenters = 0; }))[0]).toBe("A1");
  });

  it("sizes the platform build by topology, nodes, and edition", () => {
    const standard = engagement(document => { document.fields.adoptionDetails.domainTopology = "standard"; document.inventory.hosts = 40; });
    expect(codes(standard)).toContain("D4");
    const vvf = engagement(document => { document.fields.adoptionDetails.platformEdition = "vvf"; });
    expect(scopedEffortLines(vvf).find(item => item.kind === "core" && item.code.startsWith("D"))).toMatchObject({ code: "D1", workstream: "VVF foundation build" });
  });

  it("prices a design-only plan as design, with each selected component designed but not built", () => {
    const document = engagement(document => { document.fields.adoptionDetails.upgradePath = "design-only"; });
    const lines = scopedEffortLines(document);
    expect(lines.map(item => item.code)).toEqual(["A3", "X4", "X10"]);
    expect(lines.filter(item => item.kind === "addon").every(item => item.reduction === "design only" && item.base < item.fullBase)).toBe(true);
  });

  it("spreads the hours over the timeline work packages and foots to the scoped totals", () => {
    for (const route of ["greenfield", "design-only", "undecided"] as const) {
      const document = migrateDocument(engagement(document => {
        Object.assign(document.fields, { plannedProjectStart: "2026-10-01", plannedImplementationStart: "2026-12-01", planAuthority: "generated" });
        document.fields.adoptionDetails.upgradePath = route;
      }));
      const effort = buildScopedEffort(document);
      const funded = effort.workPackages.filter(row => row.total > 0);
      expect(funded.length, route).toBeGreaterThan(3);
      for (const role of ["architect", "srConsultant", "projectManager", "total"] as const) expect(funded.reduce((sum, row) => sum + row[role], 0), `${route} ${role}`).toBe(effort.internal.calculatedRows.reduce((sum, row) => sum + row[role], 0));
      expect(funded.every(row => row.start && row.end && row.leadRole), route).toBe(true);
      expect(effort.workPackages.find(row => row.id === "bar-hcl-gate")?.note).toBe("checkpoint");
    }
  });

  it("maps add-on outcomes to their catalog lines", () => {
    const document = engagement(document => {
      Object.assign(document.fields.adoptionDetails, { security: ["malware-prevention"], automation: ["data-services"], networking: ["vpc"], kubernetes: ["workload-domains"] });
      document.fields.priorities = ["security", "automation", "networking", "kubernetes"];
    });
    expect(codes(document)).toEqual(expect.arrayContaining(["X12", "X13", "X6", "X9", "X2"]));
    expect(codes(document)).not.toContain("X11");
  });
});

describe("fitting scope to the envelope", () => {
  const lines: EffortLine[] = [
    { workstream: "Design", code: "A1", kind: "core", lead: "architect", fullBase: 75, base: 75 },
    { workstream: "Build", code: "D1", kind: "core", lead: "srConsultant", fullBase: 90, base: 90 },
    { workstream: "Waves", code: "FILL", kind: "fill", lead: "srConsultant", fullBase: 60, base: 60 },
    { workstream: "Operations", code: "X4", kind: "addon", lead: "srConsultant", fullBase: 80, base: 80 },
  ];
  const total = (fitted: { lines: EffortLine[] }) => fitted.lines.reduce((sum, item) => sum + item.base * ROLE_LOADING, 0);

  it("grows the wave line to use the whole envelope when the scope fits", () => {
    const fitted = fitToEnvelope(lines, 600);
    expect(fitted.status).toBe("fits");
    expect(total(fitted)).toBeCloseTo(600);
    expect(fitted.lines.find(item => item.code === "FILL")!.base).toBeGreaterThan(60);
  });

  it("keeps one-time work, cuts waves to a proving run and add-ons to design when the scope does not fit", () => {
    const fitted = fitToEnvelope(lines, 320);
    expect(fitted.status).toBe("fits-reduced");
    expect(fitted.lines.find(item => item.code === "A1")!.base).toBe(75);
    expect(fitted.lines.find(item => item.code === "D1")!.base).toBe(90);
    expect(fitted.lines.find(item => item.code === "X4")).toMatchObject({ base: 20, reduction: "design only" });
    expect(fitted.lines.find(item => item.code === "FILL")!.base).toBeGreaterThanOrEqual(28);
    expect(total(fitted)).toBeLessThanOrEqual(320 + 0.01);
  });

  it("reports a shortfall when even the reduced scope does not fit", () => {
    const fitted = fitToEnvelope(lines, 200);
    expect(fitted.status).toBe("short");
    expect(fitted.shortfallHours).toBeCloseTo((75 + 90 + 28 + 20) * ROLE_LOADING - 200);
  });

  it("leaves the scope at catalog size with no envelope", () => {
    expect(fitToEnvelope(lines, null)).toMatchObject({ status: "no-envelope" });
  });
});

describe("scoped effort table", () => {
  it("foots every column and row", () => {
    const effort = buildScopedEffort(engagement());
    for (const row of effort.rows) expect(row.architect + row.srConsultant + row.projectManager).toBe(row.total);
    const sum = (key: "architect" | "srConsultant" | "projectManager" | "total") => effort.rows.reduce((total, row) => total + row[key], 0);
    expect(effort.totals).toEqual({ architect: sum("architect"), srConsultant: sum("srConsultant"), projectManager: sum("projectManager"), total: sum("total") });
  });

  it("uses entitled hours as the envelope and reports the fit internally", () => {
    const effort = buildScopedEffort(engagement());
    expect(effort.internal).toMatchObject({ envelopeHours: 262, envelopeSource: "entitled hours" });
    expect(["fits", "fits-reduced", "short"]).toContain(effort.internal.status);
  });

  it("shows signed Resource Assignments instead of the calculated table", () => {
    const document = engagement(document => {
      document.report.resourceAssignments = [
        { workstream: "Design discovery, architecture and design", architect: 24, srConsultant: 16, projectManager: 6 },
        { workstream: "Converged management domain build", architect: 10, srConsultant: 50, projectManager: 8 },
      ];
    });
    const effort = buildScopedEffort(document);
    expect(effort.source).toBe("assignments");
    expect(effort.totals).toEqual({ architect: 34, srConsultant: 66, projectManager: 14, total: 114 });
    expect(effort.internal.calculatedRows.length).toBeGreaterThan(0);
  });

  it("estimates the envelope from the entitlement value on the server when hours are unknown", () => {
    expect(fundedHoursFromValue(79403)).toBeCloseTo(276.6, 1);
    const document = engagement(document => { document.report.entitlement.hours = null; });
    expect(scopedEffortForDocument(document).internal).toMatchObject({ envelopeSource: "entitlement value" });
    expect(scopedEffortForDocument(document).internal.envelopeHours).toBeCloseTo(276.6, 1);
  });
});

describe("customer effort", () => {
  it("builds phases from the plan with the migration phase as the peak", () => {
    const { phases, peak } = buildCustomerEffort(engagement());
    expect(phases.map(phase => phase.phase)).toEqual(expect.arrayContaining(["Design sessions and design sign-off", "Platform build", "Migration waves"]));
    expect(phases.map(phase => phase.startDate)).toEqual([...phases.map(phase => phase.startDate)].sort());
    expect(peak).toMatchObject({ phase: "Migration waves", total: 15, fte: 0.38 });
    for (const phase of phases) expect(phase.platformLead + phase.operations + phase.network).toBe(phase.total);
  });
});

describe("burndown", () => {
  it("matches the Services Status Report method", () => {
    const burndown = buildBurndown(engagement())!;
    expect(burndown).toMatchObject({ entitledHours: 262, consumedHours: 39, remainingHours: 223, daysToExpiry: 210, expiryPace: 7.4, expiryPaceFte: 0.19, extended: false });
    expect(Math.round(burndown.pctConsumed * 1000) / 10).toBe(14.9);
    expect(Math.round(burndown.pctElapsed * 1000) / 10).toBe(42.3);
    expect(burndown.gapPoints).toBeLessThan(0); // negative means behind
    expect(burndown.band).toBe("AT RISK");
  });

  it("moves the expiry only for an approved extension", () => {
    const extended = buildBurndown(engagement(document => { Object.assign(document.report.entitlement, { extensionTo: "2027-07-28", extensionApprovedBy: "Broadcom account director" }); }))!;
    expect(extended).toMatchObject({ termEnd: "2027-07-28", extended: true });
    expect(extended.expiryPace).toBeLessThan(7.4);
  });

  it("returns nothing without entitled hours", () => {
    expect(buildBurndown(engagement(document => { document.report.entitlement.hours = null; }))).toBeNull();
  });
});

describe("planner-adjusted hours", () => {
  const planned = () => migrateDocument(engagement(document => {
    Object.assign(document.fields, { plannedProjectStart: "2026-10-01", plannedImplementationStart: "2026-12-01", planAuthority: "generated" });
  }));

  it("replace the baseline per role, keep the rest, and drive the totals", () => {
    const document = planned();
    const before = buildScopedEffort(document);
    const target = before.workPackages.find(row => row.total > 0)!;
    document.report.workPackageHours = [{ id: target.id, architect: target.baseline.architect + 10, srConsultant: null, projectManager: 0 }];
    const after = buildScopedEffort(document);
    const row = after.workPackages.find(item => item.id === target.id)!;
    expect(row).toMatchObject({ architect: target.baseline.architect + 10, srConsultant: target.baseline.srConsultant, projectManager: 0, adjusted: true });
    expect(after.totals.total).toBe(before.totals.total + 10 - target.baseline.projectManager);
  });

  it("keep their follow-on hours when deferred, and come back into the entitlement when pinned there", () => {
    const document = planned();
    const deferred = buildScopedEffort(document).workPackages.find(row => row.deferred === "not funded");
    expect(deferred).toBeTruthy();
    expect(deferred!.followOn!.total).toBeGreaterThan(0);
    document.report.workPackageHours = [{ id: deferred!.id, architect: null, srConsultant: null, projectManager: null, placement: "entitlement" }];
    const row = buildScopedEffort(document).workPackages.find(item => item.id === deferred!.id)!;
    expect(row.deferred).toBeUndefined();
    expect(row.total).toBe(deferred!.followOn!.total);
  });

  it("price the plan against the entitlement value with thresholds, on the server only", () => {
    const document = planned();
    const cost = scopedEffortForDocument(document).internal.cost!;
    expect(cost.entitlementValue).toBe(document.fields.entitlementAmount);
    expect(cost.ratio).toBeCloseTo(cost.planCost / cost.entitlementValue, 5);
    document.report.workPackageHours = [{ id: scopedEffortForDocument(document).workPackages.find(row => row.total > 0)!.id, architect: 5000, srConsultant: null, projectManager: null }];
    expect(scopedEffortForDocument(document).internal.cost!.status).toBe("over");
    expect(JSON.stringify(scopedEffortForDocument(document))).not.toMatch(/"[a-z]*rate[a-z]*"\s*:/i);
  });
});

describe("entitlement budget limit", () => {
  const planned = (value: number) => migrateDocument(engagement(document => {
    Object.assign(document.fields, { plannedProjectStart: "2026-10-01", plannedImplementationStart: "2026-12-01", planAuthority: "generated", entitlementAmount: value });
  }));

  it("moves the latest non-design work to the notional until the entitlement window fits the value", () => {
    const loose = scopedEffortForDocument(planned(10_000_000));
    const value = Math.round(loose.internal.cost!.planCost * 0.85);
    const effort = scopedEffortForDocument(planned(value));
    const moved = effort.workPackages.filter(row => row.deferred === "over budget");
    expect(moved.length).toBeGreaterThan(0);
    expect(effort.internal.cost!.planCost).toBeLessThanOrEqual(value);
    expect(effort.internal.cost!.status).not.toBe("over");
    expect(moved.every(row => !/^bar-(platform-plan|playbook-design-|playbook-component-design-)/.test(row.id) && row.followOn!.total > 0)).toBe(true);
    expect(effort.internal.cost!.followOnCost).toBeGreaterThan(0);
  });

  it("keeps pinned work in and stays over when only design and pinned work remain", () => {
    const tiny = scopedEffortForDocument(planned(1_000));
    expect(tiny.internal.cost!.status).toBe("over");
    expect(tiny.workPackages.filter(row => row.total > 0).every(row => /design|requirements|mobilize|plan/i.test(row.label) || row.placement === "entitlement")).toBe(true);

    const document = planned(1_000);
    const build = scopedEffortForDocument(planned(10_000_000)).workPackages.find(row => row.id === "bar-management-domain")!;
    document.report.workPackageHours = [{ id: build.id, architect: null, srConsultant: null, projectManager: null, placement: "entitlement" }];
    expect(scopedEffortForDocument(document).workPackages.find(row => row.id === build.id)!.deferred).toBeUndefined();
  });
});

describe("placing work in the Two-Year Notional", () => {
  it("takes the package's hours out of the entitlement, even for design work", () => {
    const document = migrateDocument(engagement(document => {
      Object.assign(document.fields, { plannedProjectStart: "2026-10-01", plannedImplementationStart: "2026-12-01", planAuthority: "generated" });
    }));
    const before = scopedEffortForDocument(document);
    const design = before.workPackages.find(row => row.id.startsWith("bar-playbook-design-") && row.total > 0)!;
    document.report.workPackageHours = [{ id: design.id, architect: null, srConsultant: null, projectManager: null, placement: "notional" }];
    const after = scopedEffortForDocument(document);
    const moved = after.workPackages.find(row => row.id === design.id)!;
    expect(moved.deferred).toBe("planned for later");
    expect(moved.followOn!.total).toBe(design.total);
    expect(after.internal.cost!.planCost).toBeLessThan(before.internal.cost!.planCost);
  });
});

describe("entitlement view of the timeline", () => {
  it("hides moved work for editing and puts it back on save", async () => {
    const { withoutBars, withHiddenBars } = await import("../shared/effort");
    const document = migrateDocument(engagement(document => { Object.assign(document.fields, { plannedProjectStart: "2026-10-01", plannedImplementationStart: "2026-12-01", planAuthority: "generated" }); }));
    const original = document.adoptionTimeline;
    const target = original.lanes.flatMap(lane => lane.bars).find(bar => bar.id === "bar-management-domain")!;
    const hidden = new Set([target.id]);
    const view = withoutBars(original, hidden);
    expect(view.lanes.flatMap(lane => lane.bars).some(bar => bar.id === target.id)).toBe(false);
    const edited = { ...view, lanes: view.lanes.map(lane => ({ ...lane, bars: lane.bars.map(bar => ({ ...bar, label: `${bar.label}!` })) })) };
    const saved = withHiddenBars(edited, original, hidden).lanes.flatMap(lane => lane.bars);
    expect(saved.find(bar => bar.id === target.id)).toEqual(target);
    expect(saved).toHaveLength(original.lanes.flatMap(lane => lane.bars).length);
  });
});
