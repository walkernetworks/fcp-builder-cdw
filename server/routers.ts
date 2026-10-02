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

function requireRow<T>(row: T | undefined): T {
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Engagement not found" });
  return row;
}

function safeFilename(title: string, extension: string) {
  const stem = title.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "FCP";
  return `${stem}.${extension}`;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(options => options.ctx.user),
  }),
  engagement: router({
    list: protectedProcedure.query(({ ctx }) => db.listEngagements(ctx.user.id)),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => (await db.getEngagement(ctx.user.id, input.id)) ?? null),
    create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(240).default("New FCP engagement") })).mutation(async ({ ctx, input }) => requireRow(await db.createEngagement(ctx.user.id, input.title, createDefaultDocument()))),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), title: z.string().trim().min(1).max(240), data: engagementDocumentSchema })).mutation(async ({ ctx, input }) => requireRow(await db.updateEngagement(ctx.user.id, input.id, input.title, input.data))),
    duplicate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => requireRow(await db.duplicateEngagement(ctx.user.id, input.id))),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => ({ success: await db.deleteEngagement(ctx.user.id, input.id) })),
  }),
  effort: router({
    /** Scoped effort and the internal fit check; rates stay on the server. A mutation so the document travels in the body. */
    scoped: protectedProcedure.input(z.object({ data: engagementDocumentSchema })).mutation(({ input }) => scopedEffortForDocument(input.data)),
  }),
  document: router({
    preview: protectedProcedure.input(z.object({ title: z.string().max(240), data: engagementDocumentSchema })).mutation(({ input }) => ({ html: renderFcpHtml(input.title, input.data) })),
    downloadTicket: protectedProcedure.input(z.object({ id: z.number().int().positive(), format: z.enum(["html", "pdf", "xlsx"]), documentType: z.enum(["fcp", "condensed-fcp", "plan-output", "building-blocks"]).default("fcp") })).mutation(async ({ ctx, input }) => {
      if ((input.format === "xlsx") !== (input.documentType === "building-blocks")) throw new TRPCError({ code: "BAD_REQUEST", message: "The Building Blocks workbook is only available as XLSX." });
      requireRow(await db.getEngagement(ctx.user.id, input.id));
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
