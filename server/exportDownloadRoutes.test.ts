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
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Meridian-FCP-Plan.html"');
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
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="Meridian-FCP-Plan.pdf"');
    expect(content.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(content.length).toBeGreaterThan(20);
    expect(getEngagement).toHaveBeenCalledWith(7, 41);
  });

  it("normalizes unsafe and empty export names", () => {
    expect(safeExportFilename("  ACME / FCP: West  ", "pdf")).toBe("ACME-FCP-West.pdf");
    expect(safeExportFilename("///", "html")).toBe("FCP.html");
  });
});
