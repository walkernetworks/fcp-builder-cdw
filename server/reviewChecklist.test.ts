import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { reviewChecklist } from "../shared/reviewChecklist";
import { acmeHealthReconciled } from "./fixtures/fcpFixtures";

const client = path.resolve(import.meta.dirname, "../client/src");
const read = (file: string) => readFileSync(path.join(client, file), "utf8");

describe("Review checklist", () => {
  it("is one list: the decisions, the funding check and the readiness items, each with a section to fix it in", () => {
    const items = reviewChecklist(acmeHealthReconciled(), { segmentWarning: null, wavesWarning: null });
    expect(items.map(item => item.id)).toEqual(["segment", "waves", "funding-check", "customer", "hours", "end-date", "scope", "timeline", "evidence", "estate-size"]);
    for (const item of items) expect(["engagement", "funding", "estate", "scope", "plan"]).toContain(item.fixIn);
  });

  it("carries the segment and waves warnings, and the funding problem once the issue check has run", () => {
    const document = acmeHealthReconciled();
    const raised = reviewChecklist(document, { segmentWarning: "Segment disagrees.", wavesWarning: "Waves disagree.", fundingProblem: "Under-funded: 12 hours." });
    expect(raised.find(item => item.id === "segment")).toMatchObject({ ready: false, detail: "Segment disagrees.", fixIn: "engagement" });
    expect(raised.find(item => item.id === "waves")).toMatchObject({ ready: false, fixIn: "plan" });
    expect(raised.find(item => item.id === "funding-check")).toMatchObject({ ready: false, detail: "Under-funded: 12 hours." });
    const clear = reviewChecklist(document, { segmentWarning: null, wavesWarning: null, fundingProblem: null });
    expect(clear.find(item => item.id === "funding-check")).toMatchObject({ ready: true });
    expect(clear.find(item => item.id === "segment")).not.toHaveProperty("detail");
  });

  it("says the funding check has not run until it has", () => {
    const item = reviewChecklist(acmeHealthReconciled(), { segmentWarning: null, wavesWarning: null }).find(entry => entry.id === "funding-check")!;
    expect(item).toMatchObject({ ready: false, pending: true });
  });
});

describe("Review checklist items", () => {
  const none = { segmentWarning: null, wavesWarning: null, fundingProblem: null };
  const item = (document: ReturnType<typeof acmeHealthReconciled>, id: string) => reviewChecklist(document, none).find(entry => entry.id === id)!;

  it("has every item the tests below turn off ready in the reconciled fixture", () => {
    for (const id of ["segment", "waves", "funding-check", "customer", "hours", "end-date", "scope", "timeline", "estate-size"]) expect(item(acmeHealthReconciled(), id).ready, id).toBe(true);
  });

  it("holds the end date not ready while it is only calculated from the start", () => {
    const document = acmeHealthReconciled();
    document.report.entitlement.termEnd = "";
    expect(item(document, "end-date")).toMatchObject({ ready: false, fixIn: "funding" });
    expect(item(document, "end-date").detail).toContain("to be confirmed");
    document.report.entitlement.termEnd = "2027-03-31";
    expect(item(document, "end-date")).toMatchObject({ ready: true });
    expect(item(document, "end-date")).not.toHaveProperty("detail");
  });

  it("holds the estate size not ready until it is known or the planner decides", () => {
    const document = acmeHealthReconciled();
    document.inventory.hosts = 0;
    document.report.discovery.esxHosts = 0;
    delete document.fields.estimateInputs.smallEstate;
    const unknown = item(document, "estate-size");
    expect(unknown).toMatchObject({ ready: false, fixIn: "estate" });
    expect(unknown.detail).toContain("Set Small estate in the planner inputs");
    document.fields.estimateInputs.smallEstate = "no";
    expect(item(document, "estate-size")).toMatchObject({ ready: true });
  });

  it("reads the BSAS hours and wording when the funding source is BSAS", () => {
    const document = acmeHealthReconciled();
    document.fields.fundingSource = "bsas";
    document.report.entitlement.hours = 0;
    document.fields.bsasHours = 0;
    expect(item(document, "customer").label).toBe("Customer and BSAS");
    expect(item(document, "end-date").label).toBe("BSAS end date confirmed");
    expect(item(document, "hours").ready).toBe(false);
    document.fields.bsasHours = 120;
    expect(item(document, "hours").ready).toBe(true);
  });

  it("holds the customer item not ready without a name", () => {
    const document = acmeHealthReconciled();
    document.fields.customerName = "";
    expect(item(document, "customer")).toMatchObject({ ready: false, fixIn: "funding" });
  });

  it("counts the unchecked funding item among the items still open", () => {
    const open = reviewChecklist(acmeHealthReconciled(), { segmentWarning: null, wavesWarning: null }).filter(entry => !entry.ready);
    expect(open.map(entry => entry.id)).toContain("funding-check");
    expect(open.find(entry => entry.id === "funding-check")).toMatchObject({ pending: true });
  });
});

describe("Review section layout", () => {
  const review = read("components/fcp/ReviewSection.tsx");
  const order = (...needles: string[]) => needles.map(needle => review.indexOf(needle));

  it("runs top to bottom: ready to issue, the issue with its versions, downloads, then More", () => {
    const positions = order('title="Ready to issue"', "<ReportFormatPicker", "<IssuePanel", "<IssuedVersionsList", 'title="Downloads"', ">More<");
    expect(positions.every(index => index > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("lists the three downloads once, with the Building Blocks workbook for Commercial plans only", () => {
    expect(review.match(/<DeliverableCard /g)).toHaveLength(3);
    expect(review).toContain("isCommercialPlan(document.fields) && <DeliverableCard");
    expect(review).toContain('title="Delivery Handoff"');
  });

  it("keeps only the sources behind More, and offers no long-report export toggles or full-report format", () => {
    expect(review).toContain('sections={["sources"]}');
    expect(review).not.toContain("ExportPreferenceCard");
    expect(read("pages/FcpWorkspace.tsx")).not.toContain("ExportPreferenceCard");
    expect(read("components/fcp/IssuedVersions.tsx")).toContain('REPORT_FORMAT_CHOICES.filter(choice => choice !== "full")');
  });

  it("has no em-dash in what it prints", () => {
    expect(review).not.toContain("—");
  });
});
