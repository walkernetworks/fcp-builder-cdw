import { describe, expect, it } from "vitest";
import type { EngagementDocument } from "../shared/fcp";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { cedarRidgeLogistics, FIXTURE_TODAY } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";

// A record with nothing booked: no entitlement value, hours or term. Every customer format must still read as a plan.

const render = (document: EngagementDocument, format?: "summary") =>
  renderCondensedFcpHtml(document.fields.customerName, document, { effort: scopedEffortForDocument(document, FIXTURE_TODAY), today: FIXTURE_TODAY, ...(format ? { format } : {}) });
const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const tiles = (html: string) => Array.from(html.matchAll(/<div class="kpi"><div class="v">(.*?)<\/div><div class="l">(.*?)<\/div>/g), match => `${match[2]}: ${match[1]}`);

describe("no entitlement booked: the long report", () => {
  it("says the entitlement is not booked instead of repeating the planned hours", () => {
    const labels = tiles(render(cedarRidgeLogistics())).map(tile => tile.split(":")[0]);
    expect(labels).toEqual(["Entitlement", "Scoped Effort", "Planned Completion", "Target Platform"]);
    expect(tiles(render(cedarRidgeLogistics()))[0]).toBe("Entitlement: Not yet booked");
  });
});
