import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyCustomerBrief } from "../shared/briefImport";
import { exportFilename } from "../shared/exportFilename";
import { createDefaultDocument, FIXED_GANTT_CATEGORIES, type EngagementDocument } from "../shared/fcp";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { scopedEffortForDocument } from "./rateCard";

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
    for (const heading of ["Executive Summary", "Situation", "Plan on a Page", "Entitlement Burndown", "Scoped Effort", "Customer Effort by Week & Work Stream", "Target Personnel by Work Stream", "VCF Design Profile", "Design Elements — Requirements & Recommendations", "Adoption Sequence & Dependencies", "Private Cloud Adoption Timeline", "Engagement Milestones to Date", "Forward Delivery Plan", "Adoption Plan & Recommendation", "The short version", "What we heard, and what we have built to", "The problems worth solving first", "The open questions", "The technical items to confirm early", "Why the order is not negotiable", "What this asks of Acme Health's team", "Open Items"]) {
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
    for (const heading of ["Target Personnel by Work Stream", "What we heard", "The problems worth solving first", "The open questions", "Engagement Milestones to Date"]) expect(visible, heading).not.toContain(heading);
    expect(visible).not.toMatch(/to be named|to be recorded|to be confirmed\b(?! —)/);
  });

  it("draws the entitlement timeline and the two-year notional with the full FCP's category Gantt", () => {
    const html = render(engagement());
    const visible = text(html);
    for (const heading of ["Private Cloud Adoption Timeline", "Two-Year Notional · Months 1–12", "Year 1 Adoption Outlook", "Delivery workstream key", "What CDW Delivers"]) expect(visible, heading).toContain(heading);
    expect(html.match(/class="timeline-grid"/g)!.length).toBeGreaterThanOrEqual(2);
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
    const broken = html.replace(/(<tr class="total"><td>Total CDW-delivered hours<\/td><td class="num">)(\d+)/, (_match, head: string, value: string) => `${head}${Number(value) + 5}`);
    expect(check(broken, document).join(" ")).toContain("does not foot");
  });

  it("blocks a missing category or mandatory section", () => {
    expect(check(html.replaceAll(`<strong>Modernize Cloud</strong>`, ""), document).join(" ")).toContain("Category missing");
    expect(check(html.replaceAll("The short version", "Summary"), document).join(" ")).toContain("Mandatory section missing");
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
