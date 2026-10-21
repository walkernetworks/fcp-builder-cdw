import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyCustomerBrief } from "../shared/briefImport";
import { createDefaultDocument, type EngagementDocument } from "../shared/fcp";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { renderFcpHtml } from "./fcpRenderer";
import { scopedEffortForDocument } from "./rateCard";

const TODAY = "2026-09-30";
const brief = () => JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../docs/examples/customer-brief.example.json"), "utf8"));

function engagement(patch: (raw: any) => void = () => {}): EngagementDocument {
  const base = createDefaultDocument();
  base.fields.priorities = [];
  Object.assign(base.fields, { plannedProjectStart: "2026-10-01", plannedImplementationStart: "2026-12-01" });
  const raw = brief();
  patch(raw);
  return applyCustomerBrief(base, raw).document;
}

const condensed = (document: EngagementDocument) => renderCondensedFcpHtml("Example Health System", document, { effort: scopedEffortForDocument(document, TODAY), today: TODAY });
const full = (document: EngagementDocument) => renderFcpHtml("Example Health System", document);

describe("entitlement-only output (no BSAS)", () => {
  // Captured from main before BSAS support was added: an engagement without BSAS must render exactly as it did.
  it("renders the condensed FCP byte-identical to the golden copy", async () => {
    await expect(condensed(engagement())).toMatchFileSnapshot("./__golden__/condensed-no-bsas.html");
  });

  it("renders the full FCP byte-identical to the golden copy", async () => {
    await expect(full(engagement())).toMatchFileSnapshot("./__golden__/full-no-bsas.html");
  });
});
