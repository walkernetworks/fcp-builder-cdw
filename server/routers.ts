import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { createDefaultDocument, engagementDocumentSchema, migrateDocument, type EngagementDocument } from "../shared/fcp";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { createExportTicket } from "./exportTickets";
import { compareIssued, prepareIssue, recordDeliveredNotes } from "./fcpIssue";
import { defaultReportFormat, needsBroadcomSignature, REPORT_FORMAT_CHOICES, REPORT_FORMAT_LABELS, reportFormatOption, type ReportFormatChoice } from "../shared/reportFormat";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { renderPdf } from "./pdf";
import { hoursFillOptions } from "./hoursFill";
import { scopedEffortForDocument } from "./rateCard";
import { canDeleteEngagement, viewerFor } from "./visibility";
import { ASSIGNMENT_ROLES, fcpWaiverSchema, SOURCE_ITEM_KINDS, SOURCE_ITEM_STATUSES, trackerPatchSchema, VSA_ROLES } from "../shared/vsaFields";
import { STAGES } from "../shared/vsaStage";
import { MAX_IMPORT_CSV_BYTES } from "../shared/sharepointImport";
import { getRecordFiles } from "./fileSource";
import { pipelineSource } from "./pipelineSource";
import { PROPRIETARY_LEGEND, reportConfigSchema, runReport } from "../shared/vsaReports";
import { inRoleView } from "../shared/vsaViews";
import { REPORT_XLSX_MIME, renderReportWorkbook, reportFilename } from "./reportWorkbook";
import { adminUserPatchSchema } from "../shared/adminUsers";
import { SETTING_DEFINITIONS, SETTING_GROUPS, settingValues } from "../shared/appSettings";
import { systemStatus } from "./systemStatus";

function requireRow<T>(row: T | undefined): T {
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Engagement not found" });
  return row;
}

/**
 * The FCP as the workspace shows it: the customer report in the chosen format with the draft mark, and the content
 * checks it would face on export. Effort is priced here so rates never reach the client. No format renders the long
 * report.
 */
function draftFcp(title: string, document: EngagementDocument, choice?: ReportFormatChoice, deliveredNotes: string[] = [], broadcomSignature = false) {
  const format = choice ? reportFormatOption(choice) : undefined;
  const html = renderCondensedFcpHtml(title, document, { effort: scopedEffortForDocument(document), draft: true, ...(format ? { format, deliveredNotes, broadcomSignature } : {}) });
  const checks = checkCondensedFcp(html, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount, bsasOnly: document.fields.fundingSource === "bsas", format });
  return { html, checks };
}
const reportFormatInput = z.enum(REPORT_FORMAT_CHOICES).optional();

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

/** A save refused because someone else holds the FCP build lock becomes a CONFLICT with the holder's name. */
async function lockAware<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof db.BuildLockedError) throw new TRPCError({ code: "CONFLICT", message: error.message });
    throw error;
  }
}

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
      .mutation(async ({ ctx, input }) => requireRow(await lockAware(() => db.updateEngagement(viewerFor(ctx.user), input.id, input.title, input.data, { customerName: input.baseCustomerName, title: input.baseTitle })))),
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
    /** Links for the record's files: the client folder and source references. Read through visibility like every record read; no file bytes. */
    files: protectedProcedure.input(z.object({ id: recordId })).query(async ({ ctx, input }) => {
      const found = requireRow(await db.getTrackerRecord(viewerFor(ctx.user), input.id));
      return getRecordFiles({ clientFolderUrl: found.record.clientFolderUrl, sources: found.sources });
    }),
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
    /** Records (or, with null, removes) the FCP waiver. It satisfies the FCP approval gate for delivery only. */
    setFcpWaiver: protectedProcedure
      .input(z.object({ id: recordId, rowVersion: z.number().int().min(0), waiver: fcpWaiverSchema.nullable() }))
      .mutation(async ({ ctx, input }) => {
        unwrap(await db.setFcpWaiver(viewerFor(ctx.user), input.id, input.rowVersion, input.waiver));
        return { success: true } as const;
      }),
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
    preview: protectedProcedure.input(z.object({ csv: z.string().min(1).max(MAX_IMPORT_CSV_BYTES) })).mutation(async ({ ctx, input }) => db.runPipelineImport(viewerFor(ctx.user), await pipelineSource().acquire({ csv: input.csv }), "preview")),
    /** Re-plans on locked rows and applies the import in one transaction. The returned report is what was written. */
    commit: protectedProcedure.input(z.object({ csv: z.string().min(1).max(MAX_IMPORT_CSV_BYTES) })).mutation(async ({ ctx, input }) => db.runPipelineImport(viewerFor(ctx.user), await pipelineSource().acquire({ csv: input.csv }), "apply")),
  }),
  fcpRecord: router({
    /** Takes or renews the FCP build lock; `takeOver` takes it from someone else. */
    acquireLock: protectedProcedure.input(z.object({ id: recordId, takeOver: z.boolean().default(false) })).mutation(async ({ ctx, input }) => requireRow(await db.acquireBuildLock(viewerFor(ctx.user), input.id, input.takeOver))),
    releaseLock: protectedProcedure.input(z.object({ id: recordId })).mutation(async ({ ctx, input }) => { await db.releaseBuildLock(viewerFor(ctx.user), input.id); return { success: true }; }),
    versions: protectedProcedure.input(z.object({ id: recordId })).query(async ({ ctx, input }) => (await db.listFcpVersions(viewerFor(ctx.user), input.id)) ?? []),
    version: protectedProcedure.input(z.object({ id: recordId, versionId: recordId })).query(async ({ ctx, input }) => {
      const version = requireRow(await db.getFcpVersion(viewerFor(ctx.user), input.id, input.versionId));
      return { id: version.id, versionNumber: version.versionNumber, title: version.title, label: version.label, createdAt: version.createdAt, data: version.data };
    }),
    saveVersion: protectedProcedure.input(z.object({ id: recordId, label: z.string().trim().min(1).max(160) })).mutation(async ({ ctx, input }) => requireRow(await db.createFcpVersion(viewerFor(ctx.user), input.id, input.label, "manual"))),
    /** A person's decision on a tracker segment that disagrees with the FCP plan type; logged in History. */
    decideSegment: protectedProcedure
      .input(z.object({ id: recordId, choice: z.enum(["match-tracker", "keep-plan"]) }))
      .mutation(async ({ ctx, input }) => unwrap(await lockAware(() => db.decideSegment(viewerFor(ctx.user), ctx.user.name ?? ctx.user.email ?? null, input.id, input.choice)))),
    /** Issued versions, newest first, and whether the working FCP has moved on since the current one. */
    issued: protectedProcedure.input(z.object({ id: recordId })).query(async ({ ctx, input }) => {
      const viewer = viewerFor(ctx.user);
      const versions = requireRow(await db.listIssuedVersions(viewer, input.id));
      const current = requireRow(await db.getEngagement(viewer, input.id));
      const latest = versions.find(version => version.status === "issued");
      const hash = createHash("sha256").update(JSON.stringify(migrateDocument(current.data))).digest("hex");
      return { versions: versions.map(({ dataHash: _hash, ...version }) => version), changedSinceIssue: latest ? latest.dataHash !== hash : null };
    }),
    /** What issuing now would produce: the checks and the change summary. Writes nothing. */
    issuePreview: protectedProcedure.input(z.object({ id: recordId, reportFormat: reportFormatInput })).mutation(async ({ ctx, input }) => {
      const prepared = requireRow(await prepareIssue(viewerFor(ctx.user), input.id, { reportFormat: input.reportFormat }));
      return { failures: prepared.failures, fundingProblem: prepared.fundingProblem, reportFormat: prepared.reportFormat, changeSummary: prepared.changeSummary, unchanged: prepared.unchanged, basedOnIssue: prepared.basedOn?.issueNumber ?? null };
    }),
    /** Issues the saved FCP as the next numbered version, exactly as rendered now, without the draft mark. */
    issue: protectedProcedure
      .input(z.object({
        id: recordId,
        label: z.string().trim().max(160).default(""),
        revisionNote: z.string().trim().max(2000).nullable().default(null),
        reportFormat: reportFormatInput,
        /** Why to issue although the hours do not reconcile with the funding; logged on the version. */
        fundingOverride: z.string().trim().max(2000).nullable().default(null),
      }))
      .mutation(async ({ ctx, input }) => {
        const viewer = viewerFor(ctx.user);
        const prepared = requireRow(await prepareIssue(viewer, input.id, { reportFormat: input.reportFormat }));
        if (prepared.failures.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `The FCP was not issued because it failed these checks:\n- ${prepared.failures.join("\n- ")}` });
        if (prepared.fundingProblem && !input.fundingOverride) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `The FCP was not issued: ${prepared.fundingProblem} To issue it anyway, give the reason.` });
        if (prepared.unchanged) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Nothing has changed since issue ${prepared.basedOn?.issueNumber}.` });
        const reportFormat = reportFormatOption(prepared.reportFormat) ?? null;
        return unwrap(await lockAware(() => db.issueFcpVersion(viewer, input.id, { title: prepared.title, data: prepared.document, effort: prepared.effort, html: prepared.html, label: input.label, revisionNote: input.revisionNote || null, changeSummary: prepared.changeSummary, basedOnVersionId: prepared.basedOn?.id ?? null, reportFormat, fundingOverrideNote: prepared.fundingProblem ? input.fundingOverride : null })));
      }),
    /** Replaces the working FCP with the current issued version (saved to History first), to start the next revision. */
    revise: protectedProcedure.input(z.object({ id: recordId })).mutation(async ({ ctx, input }) => unwrap(await lockAware(() => db.reviseFromIssued(viewerFor(ctx.user), input.id)))),
    recordApproval: protectedProcedure
      .input(z.object({ id: recordId, versionId: recordId, party: z.enum(["broadcom", "customer"]), on: isoDay, approverName: z.string().trim().min(1, "Enter who approved it").max(160), note: z.string().trim().max(2000).nullable().default(null) }))
      .mutation(async ({ ctx, input }) => unwrap(await db.recordApproval(viewerFor(ctx.user), input.id, input.versionId, input.party, { on: input.on, approverName: input.approverName, note: input.note || null }))),
    /** Two issued versions compared: the change summary from the earlier to the later, and both as issued. */
    compareIssued: protectedProcedure
      .input(z.object({ id: recordId, versionIds: z.tuple([recordId, recordId]).refine(([a, b]) => a !== b, "Pick two different issued versions") }))
      .query(async ({ ctx, input }) => requireRow(await compareIssued(viewerFor(ctx.user), input.id, input.versionIds))),
    /** A signed link to an issued version, exactly as issued. Downloading it writes nothing. */
    issuedDownloadTicket: protectedProcedure.input(z.object({ id: recordId, versionId: recordId, format: z.enum(["html", "pdf"]) })).mutation(async ({ ctx, input }) => {
      requireRow(await db.getIssuedVersion(viewerFor(ctx.user), input.id, input.versionId));
      return { url: `/api/download/${createExportTicket(ctx.user.id, input.id, input.format, "issued-fcp", input.versionId)}` };
    }),
    /** Hours consumed as of a date, newest first. */
    consumption: protectedProcedure.input(z.object({ id: recordId })).query(async ({ ctx, input }) => (await db.listConsumptionEntries(viewerFor(ctx.user), input.id)) ?? []),
    /** Anyone who can see the engagement records consumption by hand; Salesforce entries come only from the connector. */
    addConsumption: protectedProcedure
      .input(z.object({ id: recordId, asOf: isoDay, consumedHours: z.number().min(0).max(1_000_000), note: z.string().trim().max(2000).nullable().default(null) }))
      .mutation(async ({ ctx, input }) => unwrap(await db.addConsumptionEntry(viewerFor(ctx.user), input.id, { asOf: input.asOf, consumedHours: Math.round(input.consumedHours * 100) / 100, note: input.note || null }))),
    restoreVersion: protectedProcedure.input(z.object({ id: recordId, versionId: recordId })).mutation(async ({ ctx, input }) => requireRow(await lockAware(() => db.restoreFcpVersion(viewerFor(ctx.user), input.id, input.versionId)))),
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
        const { settings } = await db.readOperationalSettings();
        const result = runReport(rows, input.config, today, settings);
        const workbook = renderReportWorkbook(result, input.config, PROPRIETARY_LEGEND, today, settings);
        return { filename: reportFilename(input.name, today, "xlsx"), mime: REPORT_XLSX_MIME, base64: Buffer.from(workbook).toString("base64") };
      }),
  }),
  settings: router({
    /** The operational thresholds every screen uses (stale stages, work plan follow-up, expiry bands), with code defaults for anything not stored. */
    operational: protectedProcedure.query(async () => (await db.readOperationalSettings()).settings),
  }),
  /** The admin area. Every procedure is an adminProcedure: the server refuses anyone whose users.role is not admin. */
  admin: router({
    users: router({
      list: adminProcedure.query(async () => ({ users: await db.listUsersForAdmin(), workspaces: await db.listWorkspaces() })),
      /** One user's profile: details, the assignments they hold on records the admin can see, and recent activity. */
      get: adminProcedure.input(z.object({ id: recordId })).query(async ({ ctx, input }) => {
        const profile = await db.getUserForAdmin(viewerFor(ctx.user), input.id);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        return { ...profile, workspaces: await db.listWorkspaces() };
      }),
      update: adminProcedure.input(z.object({ id: recordId, patch: adminUserPatchSchema })).mutation(async ({ ctx, input }) => {
        const result = await db.updateUserByAdmin(viewerFor(ctx.user), input.id, input.patch);
        switch (result.status) {
          case "ok":
            return { success: true };
          case "not_found":
            throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
          case "last_admin":
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This is the only admin. Make someone else an admin first, so the app is never left without one." });
          case "no_workspace":
            throw new TRPCError({ code: "BAD_REQUEST", message: "That workspace does not exist." });
        }
      }),
    }),
    settings: router({
      list: adminProcedure.query(async () => {
        const [resolved, rows] = await Promise.all([db.readOperationalSettings(), db.listAppSettings()]);
        const values = settingValues(resolved.settings);
        return {
          groups: SETTING_GROUPS,
          settings: SETTING_DEFINITIONS.map(({ key, group, kind, label, min, max, defaultValue }) => {
            const row = resolved.stored.includes(key) ? rows.find(item => item.key === key) : undefined;
            return { key, group, kind, label, min, max, defaultValue, value: values[key], stored: Boolean(row), updatedAt: row?.updatedAt ?? null, updatedByName: row?.updatedByName ?? null };
          }),
        };
      }),
      update: adminProcedure.input(z.object({ values: z.record(z.string().max(64), z.union([z.number(), z.string().max(200)])) })).mutation(async ({ ctx, input }) => {
        const result = await db.saveAppSettings(viewerFor(ctx.user), input.values);
        if (result.status === "invalid") throw new TRPCError({ code: "BAD_REQUEST", message: Object.entries(result.errors).map(([key, error]) => `${key}: ${error}`).join("; ") });
        return { changed: result.changed };
      }),
    }),
    /** Read-only. There is deliberately no procedure that changes a source or flag: that is an environment change plus an approval record. */
    status: adminProcedure.query(async ({ ctx }) => {
      const viewer = viewerFor(ctx.user);
      return { ...systemStatus(), segmentMismatches: await db.countSegmentMismatches(viewer), inferredSegments: await db.countInferredSegments(viewer) };
    }),
  }),
  effort: router({
    /** Scoped effort and the internal fit check; rates stay on the server. A mutation so the document travels in the body. */
    scoped: protectedProcedure.input(z.object({ data: engagementDocumentSchema })).mutation(({ input }) => scopedEffortForDocument(input.data)),
    /** Scope that fits the entitlement hours the plan leaves unused, with the hours each addition brings. */
    fillOptions: protectedProcedure.input(z.object({ data: engagementDocumentSchema })).mutation(({ input }) => hoursFillOptions(input.data)),
  }),
  document: router({
    /** `id`, when given, is the record whose consumption notes label the delivered hours; it must be visible. */
    preview: protectedProcedure.input(z.object({ title: z.string().max(240), data: engagementDocumentSchema, reportFormat: reportFormatInput, id: recordId.optional() })).mutation(async ({ ctx, input }) => {
      const notes = input.id && input.reportFormat && input.reportFormat !== "full" ? await recordDeliveredNotes(viewerFor(ctx.user), input.id, input.data) : [];
      const record = input.id ? await db.getEngagement(viewerFor(ctx.user), input.id) : undefined;
      return draftFcp(input.title, input.data, input.reportFormat, notes, needsBroadcomSignature(record?.segment));
    }),
    downloadTicket: protectedProcedure.input(z.object({ id: z.number().int().positive(), format: z.enum(["html", "pdf", "xlsx"]), documentType: z.enum([/** @deprecated The full template; no UI sends it. Removed with server/fcpRenderer.ts. */ "fcp", "condensed-fcp", "plan-output", "building-blocks"]).default("condensed-fcp"), reportFormat: reportFormatInput })).mutation(async ({ ctx, input }) => {
      if ((input.format === "xlsx") !== (input.documentType === "building-blocks")) throw new TRPCError({ code: "BAD_REQUEST", message: "The Building Blocks workbook is only available as XLSX." });
      const row = requireRow(await db.getEngagement(viewerFor(ctx.user), input.id));
      // The FCP draft in the chosen format, or the one the tracker segment gives.
      const reportFormat = input.documentType === "condensed-fcp" ? input.reportFormat ?? defaultReportFormat(row.segment) : undefined;
      // Every customer document export keeps the FCP as it was sent.
      if (input.documentType === "fcp" || input.documentType === "condensed-fcp") {
        await db.createFcpVersion(viewerFor(ctx.user), input.id, `Exported ${input.documentType === "fcp" ? "full-template FCP" : `FCP draft, ${REPORT_FORMAT_LABELS[reportFormat!]}`} (${input.format.toUpperCase()})`, "export");
      }
      return { url: `/api/download/${createExportTicket(ctx.user.id, input.id, input.format, input.documentType, undefined, reportFormat)}` };
    }),
    html: protectedProcedure.input(z.object({ title: z.string().max(240), data: engagementDocumentSchema })).mutation(({ input }) => ({ filename: safeFilename(input.title, "html"), mime: "text/html;charset=utf-8", content: draftFcp(input.title, input.data).html })),
    pdf: protectedProcedure.input(z.object({ title: z.string().max(240), data: engagementDocumentSchema })).mutation(async ({ input }) => {
      const pdf = await renderPdf(draftFcp(input.title, input.data).html);
      return { filename: safeFilename(input.title, "pdf"), mime: "application/pdf", base64: Buffer.from(pdf).toString("base64") };
    }),
  }),
});

export type AppRouter = typeof appRouter;
