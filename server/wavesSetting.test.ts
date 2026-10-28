import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyCustomerBrief } from "../shared/briefImport";
import { disagreeingWaveRows, wavesSettingWarning } from "../shared/effort";
import { createDefaultDocument, type EngagementDocument } from "../shared/fcp";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { acmeHealth, FIXTURE_TODAY } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

const brief = () => JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../docs/examples/customer-brief.example.json"), "utf8"));
const imported = (rows: Array<{ label: string; start: string; end: string }>): EngagementDocument => {
  const raw = brief();
  raw.customerOwnedWork = rows;
  const result = applyCustomerBrief(createDefaultDocument(), raw);
  if (!result.ok) throw new Error(result.error);
  return result.document;
};
const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const render = (document: EngagementDocument, format: "summary" | "standard" = "summary", draft = false) =>
  visible(renderCondensedFcpHtml(document.fields.customerName, document, { effort: scopedEffortForDocument(document, FIXTURE_TODAY), today: FIXTURE_TODAY, format, version: { issueNumber: 1, issuedOn: FIXTURE_TODAY }, draft }));

describe("customer-owned waves agree with the Migration waves setting", () => {
  it("sets the setting from a brief row that names customer-run waves, and logs it", () => {
    const remaining = imported([{ label: "Remaining migration waves", start: "2027-06", end: "2027-09" }]);
    expect(remaining.fields.estimateInputs.migrationWaves).toBe("customer-remaining");
    expect(remaining.fields.plannerLog!.at(-1)).toMatchObject({ input: "Migration waves", from: "cdw", to: "customer-remaining" });
    const all = imported([{ label: "Customer migration waves", start: "2027-02", end: "2027-09" }]);
    expect(all.fields.estimateInputs.migrationWaves).toBe("customer-all");
    expect(all.fields.plannerLog!.at(-1)).toMatchObject({ input: "Migration waves", from: "cdw", to: "customer-all" });
    // Work that does not name waves leaves the default and logs nothing.
    const other = imported([{ label: "Legacy cluster retirement", start: "2027-02", end: "2027-04" }]);
    expect(other.fields.estimateInputs.migrationWaves).toBeUndefined();
    expect(other.fields.plannerLog ?? []).toEqual([]);
  });

  it("warns, and does not print the row, when a row names waves under the default setting", () => {
    const document = acmeHealth();
    document.report.customerOwnedWork = [{ label: "Customer migration waves", start: "2027-02", end: "2027-04" }, { label: "Legacy cluster retirement", start: "2027-02", end: "2027-04" }];
    expect(disagreeingWaveRows(document).map(row => row.label)).toEqual(["Customer migration waves"]);
    expect(wavesSettingWarning(document)).toContain("Migration waves is set to \"CDW runs all waves\"");
    for (const format of ["summary", "standard"] as const) {
      const text = render(document, format);
      expect(text, format).not.toContain("Customer migration waves");
      expect(text, format).not.toMatch(/Customer-run migration waves/);
      expect(text, format).toContain("Legacy cluster retirement");
    }
  });

  it("raises no warning when the row and the setting agree, and prints the row", () => {
    const document = acmeHealth();
    document.fields.estimateInputs.migrationWaves = "customer-all";
    document.report.customerOwnedWork = [{ label: "Customer migration waves", start: "2027-02", end: "2027-04" }];
    expect(wavesSettingWarning(document)).toBeNull();
    expect(render(document)).toContain("Customer migration waves");
  });

  it("prints no wave row for Acme under the default setting", () => {
    const document = acmeHealth();
    expect(wavesSettingWarning(document)).toBeNull();
    expect(render(document)).not.toMatch(/Customer migration waves|Customer-run migration waves/);
  });
});

describe("a draft export says Draft, an issued version says Issued", () => {
  it("prints Draft in the header band beside the watermark, and Issued only on an issued version", () => {
    for (const format of ["summary", "standard"] as const) {
      const draft = render(acmeHealth(), format, true);
      const issued = render(acmeHealth(), format, false);
      expect(draft, format).toMatch(/Version 1(,| ·) [Dd]raft/);
      expect(draft, format).not.toMatch(/[Ii]ssued \d|, issued/);
      expect(issued, format).toMatch(/[Ii]ssued \d/);
    }
  });
});
