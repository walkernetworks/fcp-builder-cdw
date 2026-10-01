import type { Express, Request, Response } from "express";
import { isCommercialCustomer } from "../shared/buildingBlocks";
import { exportFilename } from "../shared/exportFilename";
import { migrateDocument } from "../shared/fcp";
import * as db from "./db";
import { BUILDING_BLOCKS_MIME, buildingBlocksFilename, renderBuildingBlocksWorkbook } from "./buildingBlocksWorkbook";
import { verifyExportTicket } from "./exportTickets";
import { renderFcpHtml, renderHclCompatibilityPlanOutputHtml } from "./fcpRenderer";
import { renderPdf } from "./pdf";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { scopedEffortForDocument } from "./rateCard";

export function safeExportFilename(title: string, extension: "html" | "pdf", documentType: "fcp" | "condensed-fcp" | "plan-output" = "fcp") {
  return exportFilename(title, documentType, extension);
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

      // Same migration the workspace applies on load, so exports reflect current planning rules and wording.
      const document = migrateDocument(row.data);

      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");

      if (ticket.documentType === "building-blocks") {
        if (!isCommercialCustomer(document.fields)) return deny(res, 409, "The Building Blocks workbook is produced only for commercial customers. Set the customer segment to Commercial.");
        const workbook = renderBuildingBlocksWorkbook(document);
        res.setHeader("Content-Disposition", `attachment; filename="${buildingBlocksFilename(row.title)}"`);
        return res.status(200).type(BUILDING_BLOCKS_MIME).send(Buffer.from(workbook));
      }

      let html: string;
      if (ticket.documentType === "condensed-fcp") {
        html = renderCondensedFcpHtml(row.title, document, { effort: scopedEffortForDocument(document) });
        // The condensed FCP goes to the customer as-is, so every content gate must pass first.
        const failures = checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount });
        if (failures.length) return deny(res, 409, `The Condensed FCP was not exported because it failed these checks:\n- ${failures.join("\n- ")}`);
      } else {
        html = ticket.documentType === "plan-output" ? renderHclCompatibilityPlanOutputHtml(row.title, document) : renderFcpHtml(row.title, document);
      }
      const filename = safeExportFilename(row.title, ticket.format === "html" ? "html" : "pdf", ticket.documentType === "plan-output" || ticket.documentType === "condensed-fcp" ? ticket.documentType : "fcp");

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
