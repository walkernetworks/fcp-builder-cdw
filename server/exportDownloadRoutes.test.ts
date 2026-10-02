import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultDocument } from "../shared/fcp";

vi.mock("./db", () => ({ getEngagement: vi.fn() }));
vi.mock("./pdf", () => ({ renderPdf: vi.fn(async () => Buffer.from("%PDF-1.7\npreview export\n", "utf8")) }));

import * as db from "./db";
import { registerExportDownloadRoutes, safeExportFilename } from "./exportDownloadRoutes";
import { createExportTicket, verifyExportTicket } from "./exportTickets";

const getEngagement = vi.mocked(db.getEngagement);
let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.JWT_SECRET = "export-route-test-secret-with-enough-entropy";
  const app = express();
  registerExportDownloadRoutes(app);
  await new Promise<void>(resolve => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

beforeEach(() => {
  getEngagement.mockReset();
  getEngagement.mockResolvedValue({
    id: 41,
    ownerId: 7,
    title: "Meridian / FCP: Plan",
    customerName: "Meridian Health",
    customerShortName: "MER",
    status: "draft",
    documentVersion: 3,
    intakeCompletion: 100,
    readinessStatus: "planning",
    data: createDefaultDocument(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

describe("signed binary export downloads", () => {
  it("rejects invalid or tampered tickets", async () => {
    const valid = createExportTicket(7, 41, "html");
    expect(verifyExportTicket(valid)).toMatchObject({ userId: 7, engagementId: 41, format: "html" });
    expect(verifyExportTicket(`${valid}tampered`)).toBeNull();

    const response = await fetch(`${baseUrl}/api/download/not-a-ticket`);
    expect(response.status).toBe(401);
  });

  it("streams a protected HTML attachment with a safe filename", async () => {
    const ticket = createExportTicket(7, 41, "html");
    const response = await fetch(`${baseUrl}/api/download/${ticket}`);
    const content = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Meridian FCP Plan - FCP.html"');
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(content.length).toBeGreaterThan(1_000);
    expect(content).toContain("Functional Consumption Plan");
    expect(getEngagement).toHaveBeenCalledWith(7, 41);
  });

  it("streams a protected PDF attachment with valid MIME and signature", async () => {
    const ticket = createExportTicket(7, 41, "pdf");
    const response = await fetch(`${baseUrl}/api/download/${ticket}`);
    const content = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Meridian FCP Plan - FCP.pdf"');
    expect(content.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(content.length).toBeGreaterThan(20);
    expect(getEngagement).toHaveBeenCalledWith(7, 41);
  });

  it("streams the separate plan-output document with its own safe filename", async () => {
    const ticket = createExportTicket(7, 41, "html", "plan-output");
    const response = await fetch(`${baseUrl}/api/download/${ticket}`);
    const content = await response.text();

    expect(verifyExportTicket(ticket)).toMatchObject({ documentType: "plan-output" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Meridian FCP Plan - Compatibility Handoff.html"');
    expect(content).toContain("VCF Compatibility Delivery Handoff");
    expect(content).toContain("Every observed server and CPU cohort");
    expect(content).toContain("Compatibility action register");
  });

  it("streams the Building Blocks workbook for commercial customers", async () => {
    const data = createDefaultDocument();
    data.fields.customerSegment = "commercial";
    getEngagement.mockResolvedValueOnce({ ...(await getEngagement.getMockImplementation()!(7, 41))!, data });
    const ticket = createExportTicket(7, 41, "xlsx", "building-blocks");
    const response = await fetch(`${baseUrl}/api/download/${ticket}`);
    const content = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Meridian FCP Plan - Building Blocks.xlsx"');
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(content.subarray(0, 2).toString("utf8")).toBe("PK");
  });

  it("refuses the Building Blocks workbook unless the customer is commercial", async () => {
    const ticket = createExportTicket(7, 41, "xlsx", "building-blocks");
    const response = await fetch(`${baseUrl}/api/download/${ticket}`);

    expect(response.status).toBe(409);
    expect(await response.text()).toContain("commercial customers");
  });

  it("only issues XLSX tickets for the Building Blocks workbook", () => {
    expect(verifyExportTicket(createExportTicket(7, 41, "xlsx", "building-blocks"))).toMatchObject({ format: "xlsx", documentType: "building-blocks" });
    expect(verifyExportTicket(createExportTicket(7, 41, "xlsx", "fcp"))).toBeNull();
    expect(verifyExportTicket(createExportTicket(7, 41, "pdf", "building-blocks"))).toBeNull();
  });

  it("normalizes unsafe and empty export names", () => {
    expect(safeExportFilename("  ACME / FCP: West  ", "pdf")).toBe("ACME FCP West - FCP.pdf");
    expect(safeExportFilename("  ACME / FCP: West  ", "pdf", "plan-output")).toBe("ACME FCP West - Compatibility Handoff.pdf");
    expect(safeExportFilename("///", "html")).toBe("Engagement - FCP.html");
  });
});

describe("condensed FCP downloads", () => {
  it("streams the Condensed FCP when its content gates pass", async () => {
    const { applyCustomerBrief } = await import("../shared/briefImport");
    const { readFileSync } = await import("node:fs");
    const brief = JSON.parse(readFileSync(new URL("../docs/examples/customer-brief.example.json", import.meta.url), "utf8"));
    const row = await getEngagement.getMockImplementation()!(7, 41);
    // An entitlement large enough for the design work, so the window fits the value.
    brief.entitlement.value = 250000;
    getEngagement.mockResolvedValue({ ...row!, data: applyCustomerBrief(createDefaultDocument(), brief).document });
    const response = await fetch(`${baseUrl}/api/download/${createExportTicket(7, 41, "html", "condensed-fcp")}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Meridian FCP Plan - Condensed - FCP.html"');
    expect(await response.text()).toContain("Adoption Plan &amp; Recommendation");
  });

  it("refuses the Condensed FCP when the entitlement window costs more than the entitlement value", async () => {
    const { applyCustomerBrief } = await import("../shared/briefImport");
    const { readFileSync } = await import("node:fs");
    const brief = JSON.parse(readFileSync(new URL("../docs/examples/customer-brief.example.json", import.meta.url), "utf8"));
    const row = await getEngagement.getMockImplementation()!(7, 41);
    getEngagement.mockResolvedValue({ ...row!, data: applyCustomerBrief(createDefaultDocument(), brief).document });
    const response = await fetch(`${baseUrl}/api/download/${createExportTicket(7, 41, "html", "condensed-fcp")}`);
    expect(response.status).toBe(409);
    expect(await response.text()).toContain("costs more than the entitlement value");
  });

  it("refuses the Condensed FCP and lists the failed checks", async () => {
    const { applyCustomerBrief } = await import("../shared/briefImport");
    const row = await getEngagement.getMockImplementation()!(7, 41);
    const document = applyCustomerBrief(createDefaultDocument(), { schemaVersion: 1, customer: { name: "Meridian Health" }, headline: "Amazing happens after the readiness workshop." }).document;
    getEngagement.mockResolvedValue({ ...row!, data: document });
    const response = await fetch(`${baseUrl}/api/download/${createExportTicket(7, 41, "pdf", "condensed-fcp")}`);
    expect(response.status).toBe(409);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(await response.text()).toContain("Banned framing");
  });
});
