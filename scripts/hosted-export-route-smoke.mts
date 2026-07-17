import { desc } from "drizzle-orm";
import { engagements } from "/home/ubuntu/fcp-builder-cdw/drizzle/schema.ts";
import { getDb } from "/home/ubuntu/fcp-builder-cdw/server/db.ts";
import { createExportTicket } from "/home/ubuntu/fcp-builder-cdw/server/exportTickets.ts";

const previewBase = "https://3000-ipfivehwirab6lj2gbl68-bef480a2.us2.manus.computer";
const db = await getDb();
if (!db) throw new Error("Database unavailable");
const [row] = await db.select({ id: engagements.id, ownerId: engagements.ownerId }).from(engagements).orderBy(desc(engagements.updatedAt)).limit(1);
if (!row) throw new Error("No existing engagement is available for the smoke test");

const results: Record<string, unknown>[] = [];
for (const format of ["html", "pdf"] as const) {
  const ticket = createExportTicket(row.ownerId, row.id, format);
  const response = await fetch(`${previewBase}/api/download/${ticket}`, { redirect: "manual" });
  const bytes = Buffer.from(await response.arrayBuffer());
  results.push({
    format,
    status: response.status,
    contentType: response.headers.get("content-type"),
    disposition: response.headers.get("content-disposition"),
    size: bytes.length,
    signature: format === "pdf" ? bytes.subarray(0, 5).toString("utf8") : bytes.subarray(0, 15).toString("utf8"),
  });
}

console.log(JSON.stringify(results, null, 2));
