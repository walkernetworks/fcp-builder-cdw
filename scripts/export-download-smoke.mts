import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { createDefaultDocument } from "../shared/fcp";
import type { TrpcContext } from "../server/_core/context";
import { closePdfBrowser } from "../server/pdf";
import { appRouter } from "../server/routers";

async function waitForDownload(directory: string, filename: string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const files = await readdir(directory);
    if (files.includes(filename) && !files.some(file => file.endsWith(".crdownload"))) return join(directory, filename);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${filename}`);
}

const now = new Date();
const user = {
  id: 7,
  openId: "export-smoke-user",
  email: "export@example.test",
  name: "Export Smoke",
  loginMethod: "trusted-proxy",
  role: "user" as const,
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};
const context = { user, req: { headers: {}, protocol: "https" }, res: {} } as TrpcContext;
const caller = appRouter.createCaller(context);
const document = createDefaultDocument();
document.fields.customerName = "Export Smoke Customer";

const html = await caller.document.html({ title: "Export Smoke FCP", data: document });
const pdf = await caller.document.pdf({ title: "Export Smoke FCP", data: document });
const directory = await mkdtemp(join(tmpdir(), "fcp-downloads-"));
const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});

try {
  const page = await browser.newPage();
  const session = await page.createCDPSession();
  await session.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: directory });
  await page.setContent("<!doctype html><button id='html'>HTML</button><button id='pdf'>PDF</button>");
  const payload = JSON.stringify({ htmlExport: html, pdfExport: pdf }).replaceAll("<", "\\u003c");
  await page.evaluate(`
    window.exportPayload = ${payload};
    window.triggerExport = function(filename, blob) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(function() { URL.revokeObjectURL(url); anchor.remove(); }, 30000);
    };
    document.getElementById("html").addEventListener("click", function() {
      const item = window.exportPayload.htmlExport;
      window.triggerExport(item.filename, new Blob([item.content], { type: item.mime }));
    });
    document.getElementById("pdf").addEventListener("click", function() {
      const item = window.exportPayload.pdfExport;
      const parts = [];
      const size = 512 * 1024;
      for (let offset = 0; offset < item.base64.length; offset += size) {
        const binary = atob(item.base64.slice(offset, offset + size));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        parts.push(bytes);
      }
      window.triggerExport(item.filename, new Blob(parts, { type: item.mime }));
    });
  `);

  await page.click("#html");
  const htmlPath = await waitForDownload(directory, html.filename);
  await page.click("#pdf");
  const pdfPath = await waitForDownload(directory, pdf.filename);
  const htmlBytes = await readFile(htmlPath);
  const pdfBytes = await readFile(pdfPath);

  if (html.mime !== "text/html;charset=utf-8" || !htmlBytes.toString().includes("Adoption Timeline")) throw new Error("Downloaded HTML validation failed");
  if (pdf.mime !== "application/pdf" || pdfBytes.length < 1_000 || pdfBytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Downloaded PDF validation failed");

  const result = { html: { filename: html.filename, bytes: htmlBytes.length }, pdf: { filename: pdf.filename, bytes: pdfBytes.length } };
  await writeFile("/home/ubuntu/work/fcp-export-smoke-result.json", `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  await closePdfBrowser();
  await rm(directory, { recursive: true, force: true });
}
