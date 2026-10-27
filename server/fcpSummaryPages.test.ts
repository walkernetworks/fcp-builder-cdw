import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EngagementDocument } from "../shared/fcp";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { FIT_MIN_ZOOM } from "./fcpSummaryRenderer";
import { acmeHealthReconciled, cedarRidgeLogistics, FIXTURE_TODAY, meridianHealth, northwindMfg, riverbendHealth } from "./fixtures/fcpFixtures";
import { renderPdf } from "./pdf";
import { scopedEffortForDocument } from "./rateCard";

// Printing needs a browser; CI has none, so this runs where Chrome or Chromium is installed.
const chrome = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(path => existsSync(path));
if (chrome) process.env.PUPPETEER_EXECUTABLE_PATH ||= chrome;

const summary = (document: EngagementDocument) => renderCondensedFcpHtml(document.fields.customerName, document, { effort: scopedEffortForDocument(document, FIXTURE_TODAY), today: FIXTURE_TODAY, format: "summary", draft: true });
const pages = (pdf: Uint8Array) => (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

/** A plan with far more in it than the fixtures: a long scope list and a crowded timeline. */
function crowded(): EngagementDocument {
  const document = acmeHealthReconciled();
  document.report.customerOwnedWork = Array.from({ length: 12 }, (_, index) => ({ label: `Customer workstream ${index + 1} with a longer label`, start: "2026-11", end: "2027-03" }));
  const lane = document.adoptionTimeline.lanes[0];
  for (let index = 0; index < 20; index += 1) lane.bars.push({ ...lane.bars[0], id: `bar-extra-${index}`, label: `Extra checkpoint workstream ${index + 1}`, startCol: 1 + (index % 4), endCol: 4 + (index % 4) });
  return document;
}

describe("Summary FCP pages", () => {
  it("lays each page out at its printed width and scales a page down to fit its sheet, with no network", () => {
    const html = summary(acmeHealthReconciled());
    expect(html).toContain('<section class="p1sheet" data-fit="11 7.95">');
    expect(html).toContain('<section class="p2" data-fit="10.1 7.65">');
    expect(html).toContain(`Math.max(${FIT_MIN_ZOOM},`);
    const scripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/g) ?? [];
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).not.toMatch(/src=|https?:|fetch|XMLHttpRequest|import\(/);
  });

  it("leaves delivery categories with nothing scheduled off the timeline", () => {
    const html = summary(acmeHealthReconciled());
    const yearOne = html.split('<section class="p2"')[1];
    expect(yearOne).not.toContain("<strong>Modernize Cloud</strong>");
    expect(yearOne).toContain("<strong>Operations</strong>");
  });

  it.skipIf(!chrome)("prints on three pages with follow-on packages or BSAS, and on two without, the fixtures and a crowded plan alike", async () => {
    for (const document of [acmeHealthReconciled(), meridianHealth(), riverbendHealth(), crowded()]) {
      expect(summary(document)).toContain("<h2>After the ");
      expect(pages(await renderPdf(summary(document))), document.fields.customerName).toBe(3);
    }
    // Generic notional lanes (governance reviews, operating model, service consumption) alone do not make a page.
    for (const document of [northwindMfg(), cedarRidgeLogistics()]) {
      expect(summary(document)).not.toContain("<h2>After the ");
      expect(pages(await renderPdf(summary(document))), document.fields.customerName).toBe(2);
    }
  }, 90_000);
});
