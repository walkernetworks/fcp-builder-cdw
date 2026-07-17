import puppeteer, { type Browser } from "puppeteer-core";

let browserPromise: Promise<Browser> | null = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    }).catch(error => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

export async function renderPdf(html: string) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    await page.emulateMediaType("print");
    return await page.pdf({
      format: "Letter",
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0.35in", right: "0.35in", bottom: "0.35in", left: "0.35in" },
    });
  } finally {
    await page.close();
  }
}
