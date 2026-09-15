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
  .where(or(like(engagements.customerName, "%Lyondell%"), like(engagements.title, "%Lyondell%")))
  .orderBy(desc(engagements.updatedAt))
  .limit(1);
const engagement = rows[0];
if (!engagement) throw new Error("No Lyondell engagement was found");
const output = "/home/ubuntu/fcp-builder-cdw/.tmp-lyondell-report.html";
const document = migrateDocument(engagement.data);
const html = renderFcpHtml(engagement.title, document);
const pdfOutput = "/home/ubuntu/fcp-builder-cdw/.tmp-lyondell-report.pdf";
await writeFile(output, html, "utf8");
await writeFile(pdfOutput, await renderPdf(html));
await closePdfBrowser();
console.log(JSON.stringify({
  title: engagement.title,
  plannedProjectStart: document.fields.plannedProjectStart,
  entitlementEnd: document.fields.entitlementEnd,
  notionalColumns: document.twoYearPlan.columns,
  output,
  pdfOutput,
}, null, 2));
process.exit(0);
