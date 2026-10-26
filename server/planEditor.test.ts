import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isMovedToFollowOn, packageSettings, resetRoleHours, setFollowOn, setOwner, setRoleHours, setWindow, windowColumns } from "../client/src/lib/planEdits";
import { packageHoursProvenance, windowProvenance } from "../shared/planView";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { FCP_FIXTURES, FIXTURE_TODAY } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

const ROOT = path.resolve(import.meta.dirname, "..");
const fixture = FCP_FIXTURES[0];
const effortOf = (document: ReturnType<typeof fixture.build>) => scopedEffortForDocument(document, FIXTURE_TODAY);

function packageInWindow() {
  const document = fixture.build();
  const row = effortOf(document).workPackages.find(item => item.owner === "cdw" && !item.deferred && item.total > 0 && windowColumns(document, item.id) && item.category !== "Program Management & Governance")!;
  return { document, row };
}

describe("plan edits", () => {
  it("sets a role's hours over the baseline, and drops the setting when everything is back at the default", () => {
    const { document, row } = packageInWindow();
    const edited = setRoleHours(document, row.id, "architect", 12.4);
    expect(packageSettings(edited, row.id).architect).toBe(12);
    const after = effortOf(edited).workPackages.find(item => item.id === row.id)!;
    expect([after.architect, after.adjusted]).toEqual([12, true]);
    expect(packageHoursProvenance(after, "calculated")).toEqual({ state: "confirmed", source: "Set by the planner" });
    expect(resetRoleHours(edited, row.id).report.workPackageHours).toEqual(document.report.workPackageHours);
    expect(packageHoursProvenance(row, "calculated").state).toBe("assumed");
  });

  it("moves a package to follow-on through the engine, which plans it in the Two-Year Notional and the FCP prints it there", () => {
    const { document, row } = packageInWindow();
    const moved = setFollowOn(document, row.id, true);
    const effort = effortOf(moved);
    const after = effort.workPackages.find(item => item.id === row.id)!;
    expect(isMovedToFollowOn(after)).toBe(true);
    expect(after.deferred).toBe("planned for later");
    const html = renderCondensedFcpHtml(fixture.title, moved, { effort, today: FIXTURE_TODAY });
    const followOn = html.match(/<h3>Follow-on Scope — Two-Year Notional<\/h3>.*?<\/table>/s)?.[0] ?? "";
    expect(followOn).toContain(row.label.replace(/ — depth to be confirmed$/, "").replaceAll("&", "&amp;"));
    expect(setFollowOn(moved, row.id, false).report.workPackageHours).toEqual(document.report.workPackageHours);
  });

  it("changes a window on the timeline's own path: the plan becomes hand-edited and the notional follows", () => {
    const { document, row } = packageInWindow();
    const span = windowColumns(document, row.id)!;
    const last = Math.min(document.adoptionTimeline.columns.length, span.last + 1);
    const edited = setWindow(document, row.id, span.first, last);
    expect(windowColumns(edited, row.id)).toEqual({ first: span.first, last });
    expect(edited.planAuthority).toBe("manual");
    expect(windowProvenance(edited).state).toBe("confirmed");
    expect(setWindow(document, row.id, span.first, span.last)).toBe(document);
    expect(setWindow(document, "bar-not-a-package", 1, 2)).toBe(document);
  });

  it("hands a package to the customer and back to the default owner", () => {
    const { document, row } = packageInWindow();
    const customer = setOwner(document, row.id, "customer");
    expect(effortOf(customer).workPackages.find(item => item.id === row.id)!.owner).toBe("customer");
    expect(setOwner(customer, row.id, "auto").report.workPackageHours).toEqual(document.report.workPackageHours);
  });
});

describe("plan section", () => {
  const editor = readFileSync(path.join(ROOT, "client/src/components/fcp/PlanEditor.tsx"), "utf8");

  it("changes the document only on a person's action", () => {
    expect(editor).not.toMatch(/useEffect|useLayoutEffect/);
  });

  it("keeps the fit, the gap and the dollars in the locked panel", () => {
    const [printed, internal] = editor.split("<InternalPanel");
    expect(internal).toMatch(/CostMeter|EntitlementFitPanel/);
    const overview = editor.slice(editor.indexOf("function HoursOverview"), editor.indexOf("function WorkPackagesTable"));
    expect(overview).not.toMatch(/CostMeter|dollars|blendedRate|internal\.cost|money/);
    expect(printed).toBeDefined();
  });

  it("draws the timelines from the rendered FCP, not a second drawing", () => {
    expect(editor).toMatch(/querySelectorAll\("section\.tl-sheet"\)/);
    expect(editor).toMatch(/sandbox=""/);
  });

  it("replaces the raw report panels in the workspace", () => {
    const workspace = readFileSync(path.join(ROOT, "client/src/pages/FcpWorkspace.tsx"), "utf8");
    const plan = workspace.slice(workspace.indexOf("function PlanSection("), workspace.indexOf("function ManualPlanNotice("));
    expect(plan).toMatch(/<PlanEditor /);
    expect(plan).not.toMatch(/CondensedReportPanel|ReportContentEditor|WorkPackageRegister/);
  });

  it("is never read by the FCP renderer", () => {
    for (const file of ["server/condensedFcpRenderer.ts", "shared/reportView.ts", "shared/fcp.ts", "shared/effort.ts"]) {
      expect(readFileSync(path.join(ROOT, file), "utf8"), file).not.toMatch(/planView|planEdits|PlanEditor/);
    }
  });
});
