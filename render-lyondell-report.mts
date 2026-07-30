import { writeFile } from "node:fs/promises";
import { desc, like, or } from "drizzle-orm";
import { engagements } from "./drizzle/schema";
import { getDb } from "./server/db";
import { renderFcpHtml } from "./server/fcpRenderer";

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
await writeFile(output, renderFcpHtml(engagement.title, engagement.data), "utf8");
console.log(JSON.stringify({
  title: engagement.title,
  plannedProjectStart: engagement.data.fields.plannedProjectStart,
  entitlementEnd: engagement.data.fields.entitlementEnd,
  notionalColumns: engagement.data.twoYearPlan.columns,
  output,
}, null, 2));
process.exit(0);
