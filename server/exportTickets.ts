import { createHmac, timingSafeEqual } from "node:crypto";

export type ExportFormat = "html" | "pdf" | "xlsx";
export type ExportDocumentType = "fcp" | "condensed-fcp" | "plan-output" | "building-blocks" | "issued-fcp";

type ExportTicketPayload = {
  userId: number;
  engagementId: number;
  format: ExportFormat;
  documentType: ExportDocumentType;
  /** The issued version, for "issued-fcp" only. */
  versionId?: number;
  expiresAt: number;
};

const TICKET_LIFETIME_MS = 2 * 60 * 1000;

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET is required for export tickets");
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createExportTicket(userId: number, engagementId: number, format: ExportFormat, documentType: ExportDocumentType = "fcp", versionId?: number) {
  const payload: ExportTicketPayload = {
    userId,
    engagementId,
    format,
    documentType,
    ...(versionId !== undefined ? { versionId } : {}),
    expiresAt: Date.now() + TICKET_LIFETIME_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyExportTicket(ticket: string): ExportTicketPayload | null {
  const [encoded, providedSignature, extra] = ticket.split(".");
  if (!encoded || !providedSignature || extra) return null;

  const expectedSignature = sign(encoded);
  const provided = Buffer.from(providedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<ExportTicketPayload>;
    if (!Number.isInteger(parsed.userId) || Number(parsed.userId) <= 0) return null;
    if (!Number.isInteger(parsed.engagementId) || Number(parsed.engagementId) <= 0) return null;
    if (parsed.format !== "html" && parsed.format !== "pdf" && parsed.format !== "xlsx") return null;
    if (parsed.documentType !== "fcp" && parsed.documentType !== "condensed-fcp" && parsed.documentType !== "plan-output" && parsed.documentType !== "building-blocks" && parsed.documentType !== "issued-fcp") return null;
    // An issued version is named by its id, and only an issued version is.
    if ((parsed.documentType === "issued-fcp") !== (parsed.versionId !== undefined)) return null;
    if (parsed.versionId !== undefined && (!Number.isInteger(parsed.versionId) || parsed.versionId <= 0)) return null;
    if (parsed.documentType === "issued-fcp" && parsed.format === "xlsx") return null;
    // The Building Blocks workbook is only ever issued as XLSX, and XLSX only for that workbook.
    if ((parsed.format === "xlsx") !== (parsed.documentType === "building-blocks")) return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) return null;
    return parsed as ExportTicketPayload;
  } catch {
    return null;
  }
}
