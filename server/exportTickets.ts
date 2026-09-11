import { createHmac, timingSafeEqual } from "node:crypto";

export type ExportFormat = "html" | "pdf";
export type ExportDocumentType = "fcp" | "plan-output";

type ExportTicketPayload = {
  userId: number;
  engagementId: number;
  format: ExportFormat;
  documentType: ExportDocumentType;
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

export function createExportTicket(userId: number, engagementId: number, format: ExportFormat, documentType: ExportDocumentType = "fcp") {
  const payload: ExportTicketPayload = {
    userId,
    engagementId,
    format,
    documentType,
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
    if (parsed.format !== "html" && parsed.format !== "pdf") return null;
    if (parsed.documentType !== "fcp" && parsed.documentType !== "plan-output") return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) return null;
    return parsed as ExportTicketPayload;
  } catch {
    return null;
  }
}
