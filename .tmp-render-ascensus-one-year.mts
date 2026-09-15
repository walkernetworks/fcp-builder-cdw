import { writeFile } from "node:fs/promises";
import { desc, like, or } from "drizzle-orm";
import { engagements } from "./drizzle/schema";
import { getDb } from "./server/db";
import { renderFcpHtml } from "./server/fcpRenderer";
import { closePdfBrowser, renderPdf } from "./server/pdf";
import { migrateDocument } from "./shared/fcp";

const db = await getDb();
if (!db) throw new Error("Database is not configured");
const rows = await db
  .select()
  .from(engagements)
  .where(or(like(engagements.customerName, "%Ascensus%"), like(engagements.title, "%Ascensus%")))
  .orderBy(desc(engagements.updatedAt))
  .limit(1);
const engagement = rows[0];
if (!engagement) throw new Error("No Ascensus engagement was found");
const document = migrateDocument(engagement.data);
const html = renderFcpHtml(engagement.title, document);
const output = "/home/ubuntu/fcp-builder-cdw/.tmp-ascensus-one-year.html";
const pdfOutput = "/home/ubuntu/fcp-builder-cdw/.tmp-ascensus-one-year.pdf";
await writeFile(output, html, "utf8");
await writeFile(pdfOutput, await renderPdf(html));
await closePdfBrowser();
const match = html.match(/class="operational-print-sheet entitlement-one-sheet cadence-month">([\s\S]*?)<\/section>/);
const sheet = match?.[1] ?? "";
console.log(JSON.stringify({
  title: engagement.title,
  plannedProjectStart: document.fields.plannedProjectStart,
  entitlementStart: document.fields.entitlementStart,
  entitlementEnd: document.fields.entitlementEnd,
  sheetMonthHeaders: (sheet.match(/class="timeline-head"/g) ?? []).length,
  hasNov2027: sheet.includes("Nov 27"),
  output,
  pdfOutput,
}, null, 2));
process.exit(0);
