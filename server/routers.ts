import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createDefaultDocument, engagementDocumentSchema } from "../shared/fcp";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { createExportTicket } from "./exportTickets";
import { renderFcpHtml } from "./fcpRenderer";
import { renderPdf } from "./pdf";
import { scopedEffortForDocument } from "./rateCard";
import { canDeleteEngagement, viewerFor } from "./visibility";
import { ASSIGNMENT_ROLES, SOURCE_ITEM_KINDS, SOURCE_ITEM_STATUSES, trackerPatchSchema, VSA_ROLES } from "../shared/vsaFields";
import { STAGES } from "../shared/vsaStage";
import { MAX_IMPORT_CSV_BYTES } from "../shared/sharepointImport";
import { PROPRIETARY_LEGEND, reportConfigSchema, runReport } from "../shared/vsaReports";
import { inRoleView } from "../shared/vsaViews";
import { REPORT_XLSX_MIME, renderReportWorkbook, reportFilename } from "./reportWorkbook";

function requireRow<T>(row: T | undefined): T {
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Engagement not found" });
  return row;
}

/** Turns a db write result into the procedure's return value or the matching tRPC error. */
function unwrap<T>(result: db.WriteResult<T>): T {
  switch (result.status) {
    case "ok":
      return result.value;
    case "not_found":
      throw new TRPCError({ code: "NOT_FOUND", message: "Engagement not found" });
    case "conflict":
      throw new TRPCError({ code: "CONFLICT", message: "Someone else changed this record. Reload it and try again." });
    case "duplicate":
      throw new TRPCError({ code: "CONFLICT", message: "Another record already uses that opportunity number, Salesforce opportunity, or SharePoint item." });
    case "blocked":
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: result.reason });
    case "note_required":
      throw new TRPCError({ code: "BAD_REQUEST", message: "This stage change needs a note." });
  }
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const recordId = z.number().int().positive();
const sourceItemFields = {
  kind: z.enum(SOURCE_ITEM_KINDS),
  label: z.string().trim().min(1).max(240),
  required: z.boolean().optional(),
  status: z.enum(SOURCE_ITEM_STATUSES).optional(),
  requestedOn: isoDay.nullable().optional(),
  receivedOn: isoDay.nullable().optional(),
  reference: z.string().trim().max(1024).nullable().optional(),
  note: z.string().trim().max(5000).nullable().optional(),
};

function safeFilename(title: string, extension: string) {
  const stem = title.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "FCP";
  return `${stem}.${extension}`;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(options => options.ctx.user),
    /** Sets the signed-in user's default role view (a filter, not a permission). */
    setVsaRole: protectedProcedure.input(z.object({ vsaRole: z.enum(VSA_ROLES).nullable() })).mutation(async ({ ctx, input }) => {
      await db.setUserVsaRole(ctx.user.id, input.vsaRole);
      return { vsaRole: input.vsaRole };
    }),
  }),
  engagement: router({
    list: protectedProcedure.query(({ ctx }) => db.listEngagements(viewerFor(ctx.user))),
    get: protectedProcedure.input(z.object({ id: recordId })).query(async ({ ctx, input }) => (await db.getEngagement(viewerFor(ctx.user), input.id)) ?? null),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(240).default("New FCP engagement") })).mutation(async ({ ctx, input }) => requireRow(await db.createEngagement(viewerFor(ctx.user), input.title, createDefaultDocument(), { stage: "fcp_draft" }))),
    update: protectedProcedure
      .input(z.object({ id: recordId, title: z.string().trim().min(1).max(240), data: engagementDocumentSchema, baseCustomerName: z.string().max(240).nullable().optional(), baseTitle: z.string().max(240).nullable().optional() }))
      .mutation(async ({ ctx, input }) => requireRow(await db.updateEngagement(viewerFor(ctx.user), input.id, input.title, input.data, { customerName: input.baseCustomerName, title: input.baseTitle }))),
    duplicate: protectedProcedure.input(z.object({ id: recordId })).mutation(async ({ ctx, input }) => requireRow(await db.duplicateEngagement(viewerFor(ctx.user), input.id))),
    delete: protectedProcedure.input(z.object({ id: recordId })).mutation(async ({ ctx, input }) => {
      const viewer = viewerFor(ctx.user);
      const row = requireRow(await db.getEngagement(viewer, input.id));
      if (!canDeleteEngagement(viewer, row)) throw new TRPCError({ code: "FORBIDDEN", message: "Only the record's owner or an admin can delete it." });
      return { success: await db.deleteEngagement(viewer, input.id) };
    }),
  }),
  tracker: router({
    list: protectedProcedure
      .input(z.object({ stages: z.array(z.enum(STAGES)).optional(), mine: z.boolean().optional(), role: z.enum(ASSIGNMENT_ROLES).optional() }).default({}))
      .query(({ ctx, input }) => db.listTracker(viewerFor(ctx.user), { stages: input.stages, assignedUserId: input.mine ? ctx.user.id : undefined, assignedRole: input.mine ? input.role : undefined })),
    get: protectedProcedure.input(z.object({ id: recordId })).query(async ({ ctx, input }) => (await db.getTrackerRecord(viewerFor(ctx.user), input.id)) ?? null),
    create: protectedProcedure
      .input(z.object({ customerName: z.string().trim().min(1).max(240) }))
      .mutation(async ({ ctx, input }) => {
        const data = createDefaultDocument();
        data.fields.customerName = input.customerName;
        const row = requireRow(await db.createEngagement(viewerFor(ctx.user), input.customerName, data, { stage: "intake" }));
        return { id: row.id };
      }),
    update: protectedProcedure
      .input(z.object({ id: recordId, rowVersion: z.number().int().min(0), patch: trackerPatchSchema }))
      .mutation(async ({ ctx, input }) => unwrap(await db.updateTrackerFields(viewerFor(ctx.user), input.id, input.rowVersion, input.patch))),
    transition: protectedProcedure
      .input(z.object({ id: recordId, rowVersion: z.number().int().min(0), to: z.enum(STAGES), effectiveOn: isoDay, note: z.string().trim().max(5000).optional() }))
      .mutation(async ({ ctx, input }) => unwrap(await db.transitionStage(viewerFor(ctx.user), input.id, { to: input.to, effectiveOn: input.effectiveOn, note: input.note, expectedRowVersion: input.rowVersion }))),
    addSource: protectedProcedure
      .input(z.object({ id: recordId, item: z.object(sourceItemFields) }))
      .mutation(async ({ ctx, input }) => ({ itemId: unwrap(await db.addSourceItem(viewerFor(ctx.user), input.id, input.item)) })),
    updateSource: protectedProcedure
      .input(z.object({ id: recordId, itemId: recordId, patch: z.object(sourceItemFields).partial().strict() }))
      .mutation(async ({ ctx, input }) => ({ itemId: unwrap(await db.updateSourceItem(viewerFor(ctx.user), input.id, input.itemId, input.patch)) })),
    deleteSource: protectedProcedure
      .input(z.object({ id: recordId, itemId: recordId }))
      .mutation(async ({ ctx, input }) => ({ success: await db.deleteSourceItem(viewerFor(ctx.user), input.id, input.itemId) })),
    setAssignment: protectedProcedure
      .input(z.object({ id: recordId, role: z.enum(ASSIGNMENT_ROLES), displayName: z.string().trim().min(1).max(240), email: z.string().trim().email().max(320).nullable().optional(), broadcomEmail: z.string().trim().email().max(320).nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...assignment } = input;
        unwrap(await db.setAssignment(viewerFor(ctx.user), id, assignment));
        return { success: true };
      }),
    removeAssignment: protectedProcedure
      .input(z.object({ id: recordId, role: z.enum(ASSIGNMENT_ROLES) }))
      .mutation(async ({ ctx, input }) => ({ success: await db.removeAssignment(viewerFor(ctx.user), input.id, input.role) })),
  }),
  pipelineImport: router({
    /** Plans the SharePoint Pipeline List import and writes nothing. A mutation so the file travels in the body. */
    preview: protectedProcedure.input(z.object({ csv: z.string().min(1).max(MAX_IMPORT_CSV_BYTES) })).mutation(({ ctx, input }) => db.runSharePointImport(viewerFor(ctx.user), input.csv, "preview")),
    /** Re-plans on locked rows and applies the import in one transaction. The returned report is what was written. */
    commit: protectedProcedure.input(z.object({ csv: z.string().min(1).max(MAX_IMPORT_CSV_BYTES) })).mutation(({ ctx, input }) => db.runSharePointImport(viewerFor(ctx.user), input.csv, "apply")),
  }),
  reports: router({
    list: protectedProcedure.query(({ ctx }) => db.listSavedReports(viewerFor(ctx.user))),
    save: protectedProcedure
      .input(z.object({ id: recordId.optional(), name: z.string().trim().min(1).max(120), config: reportConfigSchema }))
      .mutation(async ({ ctx, input }) => {
        const id = await db.saveReport(viewerFor(ctx.user), input);
        if (!id) throw new TRPCError({ code: "FORBIDDEN", message: "Only the report's owner or an admin can change it. Save it under a new name instead." });
        return { id };
      }),
    delete: protectedProcedure.input(z.object({ id: recordId })).mutation(async ({ ctx, input }) => {
      if (!(await db.deleteReport(viewerFor(ctx.user), input.id))) throw new TRPCError({ code: "FORBIDDEN", message: "Only the report's owner or an admin can delete it." });
      return { success: true };
    }),
    /** Runs the report on the server against the records the user can see, in their role view, and returns an XLSX. */
    exportXlsx: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(120), config: reportConfigSchema }))
      .mutation(async ({ ctx, input }) => {
        const today = new Date().toISOString().slice(0, 10);
        const rows = (await db.listTracker(viewerFor(ctx.user))).filter(row => inRoleView(row, ctx.user.id, ctx.user.vsaRole ?? null));
        const result = runReport(rows, input.config, today);
        const workbook = renderReportWorkbook(result, input.config, PROPRIETARY_LEGEND, today);
        return { filename: reportFilename(input.name, today, "xlsx"), mime: REPORT_XLSX_MIME, base64: Buffer.from(workbook).toString("base64") };
      }),
  }),
  effort: router({
    /** Scoped effort and the internal fit check; rates stay on the server. A mutation so the document travels in the body. */
    scoped: protectedProcedure.input(z.object({ data: engagementDocumentSchema })).mutation(({ input }) => scopedEffortForDocument(input.data)),
  }),
  document: router({
    preview: protectedProcedure.input(z.object({ title: z.string().max(240), data: engagementDocumentSchema })).mutation(({ input }) => ({ html: renderFcpHtml(input.title, input.data) })),
    downloadTicket: protectedProcedure.input(z.object({ id: z.number().int().positive(), format: z.enum(["html", "pdf", "xlsx"]), documentType: z.enum(["fcp", "condensed-fcp", "plan-output", "building-blocks"]).default("fcp") })).mutation(async ({ ctx, input }) => {
      if ((input.format === "xlsx") !== (input.documentType === "building-blocks")) throw new TRPCError({ code: "BAD_REQUEST", message: "The Building Blocks workbook is only available as XLSX." });
      requireRow(await db.getEngagement(viewerFor(ctx.user), input.id));
      return { url: `/api/download/${createExportTicket(ctx.user.id, input.id, input.format, input.documentType)}` };
    }),
    html: protectedProcedure.input(z.object({ title: z.string().max(240), data: engagementDocumentSchema })).mutation(({ input }) => ({ filename: safeFilename(input.title, "html"), mime: "text/html;charset=utf-8", content: renderFcpHtml(input.title, input.data) })),
    pdf: protectedProcedure.input(z.object({ title: z.string().max(240), data: engagementDocumentSchema })).mutation(async ({ input }) => {
      const pdf = await renderPdf(renderFcpHtml(input.title, input.data));
      return { filename: safeFilename(input.title, "pdf"), mime: "application/pdf", base64: Buffer.from(pdf).toString("base64") };
    }),
  }),
});

export type AppRouter = typeof appRouter;
