import type { Express, Request, Response } from "express";
import { isCommercialCustomer } from "../shared/buildingBlocks";
import { engagementDocumentSchema } from "../shared/fcp";
import * as db from "./db";
import { BUILDING_BLOCKS_MIME, buildingBlocksFilename, renderBuildingBlocksWorkbook } from "./buildingBlocksWorkbook";
import { verifyExportTicket } from "./exportTickets";
import { renderFcpHtml, renderHclCompatibilityPlanOutputHtml } from "./fcpRenderer";
import { renderPdf } from "./pdf";

export function safeExportFilename(title: string, extension: "html" | "pdf", documentType: "fcp" | "plan-output" = "fcp") {
  const stem = title
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "FCP";
  return `${stem}${documentType === "plan-output" ? "-Compatibility-Handoff" : ""}.${extension}`;
}

function deny(res: Response, status: number, message: string) {
  res.removeHeader("Content-Disposition");
  res.status(status).type("text/plain").send(message);
}

export function registerExportDownloadRoutes(app: Express) {
  app.get("/api/download/:ticket", async (req: Request, res: Response) => {
    const ticket = verifyExportTicket(req.params.ticket);
    if (!ticket) return deny(res, 401, "This download link is invalid or has expired.");

    try {
      const row = await db.getEngagement(ticket.userId, ticket.engagementId);
      if (!row) return deny(res, 404, "Engagement not found.");

      const document = engagementDocumentSchema.parse(row.data);

      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");

      if (ticket.documentType === "building-blocks") {
        if (!isCommercialCustomer(document.fields)) return deny(res, 409, "The Building Blocks workbook is produced only for commercial customers. Set the customer segment to Commercial.");
        const workbook = renderBuildingBlocksWorkbook(document);
        res.setHeader("Content-Disposition", `attachment; filename="${buildingBlocksFilename(row.title)}"`);
        return res.status(200).type(BUILDING_BLOCKS_MIME).send(Buffer.from(workbook));
      }

      const html = ticket.documentType === "plan-output" ? renderHclCompatibilityPlanOutputHtml(row.title, document) : renderFcpHtml(row.title, document);
      const filename = safeExportFilename(row.title, ticket.format === "html" ? "html" : "pdf", ticket.documentType === "plan-output" ? "plan-output" : "fcp");

      if (ticket.format === "html") {
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.status(200).type("text/html; charset=utf-8").send(html);
      }

      const pdf = await renderPdf(html);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.status(200).type("application/pdf").send(Buffer.from(pdf));
    } catch (error) {
      console.error("[Export Download] Failed", error);
      return deny(res, 500, "The export could not be generated.");
    }
  });
}
