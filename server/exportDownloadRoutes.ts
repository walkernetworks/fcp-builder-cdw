import type { Express, Request, Response } from "express";
import { isCommercialCustomer } from "../shared/buildingBlocks";
import { exportFilename } from "../shared/exportFilename";
import { migrateDocument } from "../shared/fcp";
import * as db from "./db";
import { BUILDING_BLOCKS_MIME, buildingBlocksFilename, renderBuildingBlocksWorkbook } from "./buildingBlocksWorkbook";
import { verifyExportTicket } from "./exportTickets";
import { viewerFor } from "./visibility";
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
      // Visibility is rechecked at download time for the user the ticket was issued to.
      const user = await db.getUserById(ticket.userId);
      const row = user ? await db.getEngagement(viewerFor(user), ticket.engagementId) : undefined;
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
        const effort = scopedEffortForDocument(document);
        html = renderCondensedFcpHtml(row.title, document, { effort });
        // The condensed FCP goes to the customer as-is, so every content gate must pass first.
        const failures = checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount, bsasOnly: document.fields.fundingSource === "bsas" });
        // The entitlement window never goes over the entitlement value. Under v2 only protected, design and pinned work
        // can keep it over once the squeeze has run; that plan is flagged under-funded in the document and still exports.
        if (effort.internal.cost?.status === "over" && !effort.internal.fit?.underFunded) failures.push("The entitlement window costs more than the entitlement value. Reduce hours or move work to the Two-Year Notional on the Entitlement Adoption Timeline step.");
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
