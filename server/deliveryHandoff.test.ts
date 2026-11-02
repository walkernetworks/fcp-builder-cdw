import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDefaultDocument, refreshDerivedDocument, type EngagementDocument } from "../shared/fcp";
import { renderDeliveryHandoffHtml, INTERNAL_MARK, type HandoffRecord } from "./deliveryHandoffRenderer";
import { acmeHealthReconciled, FIXTURE_TODAY, harborPointLogistics } from "./fixtures/fcpFixtures";
import { renderPdf } from "./pdf";
import { scopedEffortForDocument } from "./rateCard";

const chrome = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium"].find(path => existsSync(path));
if (chrome) process.env.PUPPETEER_EXECUTABLE_PATH ||= chrome;

const handoff = (document: EngagementDocument, record?: HandoffRecord) =>
  renderDeliveryHandoffHtml(document.fields.customerName, document, { effort: scopedEffortForDocument(document, FIXTURE_TODAY), today: FIXTURE_TODAY, ...(record ? { record } : {}) });
const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const pages = (pdf: Uint8Array) => (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

/** The estate with host models imported (synthetic), so the compatibility section has evidence to show. */
function populatedEstate(): EngagementDocument {
  const document = createDefaultDocument();
  document.fields.customerName = "Northwind Mfg";
  Object.assign(document.inventory, {
    hosts: 9,
    physicalCores: 384,
    hostModels: [
      { vendor: "Dell Inc.", model: "PowerEdge R760", cpuModel: "Intel(R) Xeon(R) Gold 6430", hosts: 4, physicalCores: 256, esxiVersions: [{ version: "8.0.3", hosts: 4 }], esxiCorrelation: "per-platform", clusterMembership: [{ name: "Prod-A", hosts: 4 }] },
      { vendor: "Cisco Systems Inc", model: "UCSC-C220-M5SX", cpuModel: "Intel(R) Xeon(R) Silver 4210 CPU @ 2.20GHz", hosts: 3, physicalCores: 48, esxiVersions: [{ version: "8.0.3", hosts: 3 }], esxiCorrelation: "per-platform", clusterMembership: [{ name: "Edge", hosts: 3 }] },
    ],
  });
  return refreshDerivedDocument(document);
}
function emptyEstate(): EngagementDocument {
  const document = createDefaultDocument();
  document.fields.customerName = "Northwind Mfg";
  return refreshDerivedDocument(document);
}

const issued: HandoffRecord = { opportunityNumber: "C-OPP-0001234", segment: "corporate", stage: "customer_approval", issued: { issueNumber: 1, issuedOn: "2026-09-30", format: "standard", broadcomApprovedOn: null, customerApprovedOn: "2026-10-02" }, deliveredNotes: ["Assessment and discovery"] };

describe("Delivery Handoff", () => {
  it("renders Acme Health (Commercial, entitlement with consumption and a reserve) byte-identical to the golden copy", async () => {
    await expect(handoff(acmeHealthReconciled(), issued)).toMatchFileSnapshot("./__golden__/handoff-acme-health.html");
  });

  it("renders Harbor Point Logistics (converge, 1,000 hours) byte-identical to the golden copy", async () => {
    await expect(handoff(harborPointLogistics())).toMatchFileSnapshot("./__golden__/handoff-harbor-point-logistics.html");
  });

  it("renders an empty estate byte-identical to the golden copy, with no section that has nothing to say", async () => {
    const html = handoff(emptyEstate());
    await expect(html).toMatchFileSnapshot("./__golden__/handoff-empty-estate.html");
    const text = visible(html);
    for (const heading of ["Server models", "Owned actions"]) expect(text, heading).not.toContain(heading);
    expect(text).toContain("Not established");
  });

  it("renders a populated estate with the compatibility evidence folded in", async () => {
    const html = handoff(populatedEstate());
    await expect(html).toMatchFileSnapshot("./__golden__/handoff-populated-estate.html");
    const text = visible(html);
    for (const heading of ["Server models", "Owned actions", "Handoff boundary"]) expect(text, heading).toContain(heading);
    expect(text).toMatch(/Dell Inc\. PowerEdge R760/);
  });

  it("is marked internal on every printed page, and never as a customer document", () => {
    const html = handoff(acmeHealthReconciled(), issued);
    expect(html).toContain(INTERNAL_MARK);
    expect(html).toMatch(/@top-left\{content:"Internal, not for customer distribution"/);
    expect(visible(html)).toContain("Customer received FCP Version 1, Standard, 30 Sep 2026");
    expect(visible(html)).toContain("Broadcom Pending");
    expect(visible(html)).toContain("Customer Approved 2 Oct 2026");
  });

  it("opens with a Start here box of at most five items, built from the plan", () => {
    for (const document of [acmeHealthReconciled(), harborPointLogistics(), emptyEstate()]) {
      const html = handoff(document);
      const box = html.slice(html.indexOf('<ol class="start">'), html.indexOf("</ol>", html.indexOf('<ol class="start">')));
      const items = box.match(/<li>/g) ?? [];
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.length).toBeLessThanOrEqual(5);
    }
    const acme = visible(handoff(acmeHealthReconciled()));
    expect(acme).toMatch(/\d+ of \d+ estimating inputs are assumed/);
    expect(acme).toContain("39 delivered, 205 planned and 18 held add up to the 262-hour entitlement");
  });

  it("shows the hours, what moved and why, and every estimating input with confirmed or assumed", () => {
    const text = visible(handoff(acmeHealthReconciled()));
    expect(text).toContain("Remaining hours by role");
    expect(text).toContain("What moved, and why");
    expect(text).toMatch(/VMs 350 Assumed High impact/);
    expect(text).toMatch(/ESX hosts 14 Confirmed/);
  });

  it("leaves out the under-funded gap, the buckets and signed resource assignments", () => {
    for (const document of [acmeHealthReconciled(), harborPointLogistics()]) {
      expect(visible(handoff(document))).not.toMatch(/under-funded|Scope by bucket|signed resource|catch-up|shortfall/i);
    }
  });

  it("prints no em-dashes", () => {
    for (const document of [acmeHealthReconciled(), harborPointLogistics(), emptyEstate(), populatedEstate()]) expect(visible(handoff(document))).not.toContain("—");
  });

  it("is self-contained: no script, no external reference", () => {
    const html = handoff(acmeHealthReconciled()).replaceAll('xmlns="http://www.w3.org/2000/svg"', "");
    expect(html).not.toMatch(/<script|src=|https?:\/\/|@import|<link/i);
  });

  it("cannot be broken out of its page footer by a hostile customer name", () => {
    const doc = acmeHealthReconciled();
    doc.fields.customerName = "Acme</style><script>alert(1)</script>";
    expect(handoff(doc)).not.toMatch(/<script/i);
  });

  it("lists the missing RVTools tabs as one evidence gap row with one combined impact", () => {
    const html = handoff(acmeHealthReconciled());
    const rows = html.split("<h3>Evidence gaps</h3>")[1].split("</table>")[0].match(/<tr>.*?<\/tr>/g) ?? [];
    const missing = rows.filter(row => row.includes("RVTools tabs missing:"));
    expect(missing).toHaveLength(1);
    expect(missing[0]).toContain("vHost, vNIC, vHBA");
    expect(missing[0]).toContain("Skipped: ");
    expect(rows.filter(row => /<td>missing tab/.test(row))).toHaveLength(1);
    // The other gaps keep their own rows.
    expect(rows.some(row => row.includes("Guest OS compatibility dataset"))).toBe(true);
  });

  it.skipIf(!chrome)("prints Harbor Point in seven pages: no page holds only the tail of the Work Package Detail table", async () => {
    const pdf = await renderPdf(handoff(harborPointLogistics()));
    expect(pages(pdf)).toBe(7);
  }, 90_000);

  it.skipIf(!chrome)("prints to a PDF", async () => {
    expect(pages(await renderPdf(handoff(acmeHealthReconciled(), issued)))).toBeGreaterThanOrEqual(5);
  }, 90_000);
});
