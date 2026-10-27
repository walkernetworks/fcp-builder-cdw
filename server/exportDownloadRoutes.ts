import type { Express, Request, Response } from "express";
import { isCommercialPlan } from "../shared/buildingBlocks";
import { exportFilename, issuedFilename } from "../shared/exportFilename";
import { migrateDocument } from "../shared/fcp";
import * as db from "./db";
import { BUILDING_BLOCKS_MIME, buildingBlocksFilename, renderBuildingBlocksWorkbook } from "./buildingBlocksWorkbook";
import { verifyExportTicket } from "./exportTickets";
import { viewerFor } from "./visibility";
import { renderCompatibilityHandoffHtml } from "./compatibilityHandoffRenderer";
import { renderFcpHtml } from "./fcpRenderer";
import { renderPdf } from "./pdf";
import { condensedReleaseFailures, recordDeliveredNotes } from "./fcpIssue";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { reportFormatOption } from "../shared/reportFormat";
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

      // An issued version goes out exactly as issued: its stored HTML, or a PDF rendered from it.
      if (ticket.documentType === "issued-fcp") {
        const version = await db.getIssuedVersion(viewerFor(user!), ticket.engagementId, ticket.versionId ?? 0);
        if (!version?.renderedHtml || version.issueNumber === null) return deny(res, 404, "Issued version not found.");
        res.setHeader("Cache-Control", "private, no-store, max-age=0");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("X-Content-Type-Options", "nosniff");
        const name = issuedFilename(version.title, version.issueNumber, ticket.format === "html" ? "html" : "pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
        if (ticket.format === "html") return res.status(200).type("text/html; charset=utf-8").send(version.renderedHtml);
        return res.status(200).type("application/pdf").send(Buffer.from(await renderPdf(version.renderedHtml)));
      }

      // Same migration the workspace applies on load, so exports reflect current planning rules and wording.
      const document = migrateDocument(row.data);

      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");

      if (ticket.documentType === "building-blocks") {
        if (!isCommercialPlan(document.fields)) return deny(res, 409, "The Building Blocks workbook is produced only for a Commercial plan. Set the plan type to Commercial.");
        const workbook = renderBuildingBlocksWorkbook(document);
        res.setHeader("Content-Disposition", `attachment; filename="${buildingBlocksFilename(row.title)}"`);
        return res.status(200).type(BUILDING_BLOCKS_MIME).send(Buffer.from(workbook));
      }

      let html: string;
      if (ticket.documentType === "condensed-fcp") {
        const effort = scopedEffortForDocument(document);
        const format = ticket.reportFormat ? reportFormatOption(ticket.reportFormat) : undefined;
        const formatOptions = format ? { format, deliveredNotes: await recordDeliveredNotes(viewerFor(user!), ticket.engagementId, document) } : {};
        // Checked as it would go to the customer, then marked as a draft: only an issued version leaves without the mark.
        const failures = condensedReleaseFailures(renderCondensedFcpHtml(row.title, document, { effort, ...formatOptions }), document, effort, format);
        if (failures.length) return deny(res, 409, `The FCP was not exported because it failed these checks:\n- ${failures.join("\n- ")}`);
        html = renderCondensedFcpHtml(row.title, document, { effort, draft: true, ...formatOptions });
      } else {
        // "fcp" is the retired full template (deprecated): no UI path asks for it, and it goes with server/fcpRenderer.ts.
        html = ticket.documentType === "plan-output" ? renderCompatibilityHandoffHtml(row.title, document) : renderFcpHtml(row.title, document);
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
