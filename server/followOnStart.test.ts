import { describe, expect, it } from "vitest";
import { barWindow } from "../shared/buildingBlocks";
import { fundedWorkEnd } from "../shared/effort";
import type { Timeline } from "../shared/fcp";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { prepareReport } from "./fcpReportParts";
import { acmeHealthReconciled, FIXTURE_TODAY } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("follow-on work starts after the funded work ends", () => {
  it("is the last CDW activity's end, never later than the entitlement end, and ignores customer work and checkpoints", () => {
    const timeline = { startDate: "2026-08-01", columns: Array.from({ length: 12 }, (_, i) => `M${i}`), lanes: [{ id: "l", label: "L", bars: [
      { id: "bar-a", label: "A", startCol: 1, endCol: 8, color: "red" },
      { id: "bar-b", label: "B", startCol: 3, endCol: 12, owner: "customer" },
      { id: "bar-backup-gate", label: "Gate", startCol: 11, endCol: 12, color: "gate" },
    ] }] } as unknown as Timeline;
    const ends = barWindow(timeline, { startCol: 1, endCol: 8 })!.end;
    expect(fundedWorkEnd(timeline, "2027-08-31")).toBe(ends);
    expect(fundedWorkEnd(timeline, "2027-01-31")).toBe("2027-01-31");
    expect(fundedWorkEnd({ ...timeline, lanes: [] }, "2027-08-31")).toBe("2027-08-31");
  });

  it("starts the follow-on the month after the plan's work ends, not when the entitlement window closes", () => {
    const document = acmeHealthReconciled();
    const effort = scopedEffortForDocument(document, FIXTURE_TODAY);
    const { customerTimelines } = prepareReport(document, { effort, today: FIXTURE_TODAY });
    const worked = fundedWorkEnd(customerTimelines.adoption, "2027-12-31")!;
    // The same plan under an entitlement that runs four months longer than the work does.
    const longer = acmeHealthReconciled();
    longer.report.entitlement.termEnd = "2027-08-28";
    longer.fields.entitlementEnd = "2027-08-28";
    const effortLonger = scopedEffortForDocument(longer, FIXTURE_TODAY);
    expect(fundedWorkEnd(prepareReport(longer, { effort: effortLonger, today: FIXTURE_TODAY }).customerTimelines.adoption, "2027-08-28")).toBe(worked);
    const text = visible(renderCondensedFcpHtml("Acme Health", longer, { effort: effortLonger, today: FIXTURE_TODAY, format: "summary", version: { issueNumber: 1, issuedOn: FIXTURE_TODAY } }));
    const [year, month] = worked.split("-").map(Number);
    const next = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month, 1)));
    expect(text).toMatch(new RegExp(`follow-on work runs from ${next}`, "i"));
    expect(text).not.toContain("runs from September 2027");
  });
});
