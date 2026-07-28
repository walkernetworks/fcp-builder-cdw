import puppeteer, { type Browser, type Page } from "puppeteer-core";

let browserPromise: Promise<Browser> | null = null;
let renderQueue: Promise<void> = Promise.resolve();

function isConnectionClosed(error: unknown) {
  return error instanceof Error && /connection closed|target closed|session closed|browser has disconnected/i.test(error.message);
}

function clearBrowser(expected?: Promise<Browser>) {
  if (!expected || browserPromise === expected) browserPromise = null;
}

function getBrowser() {
  if (!browserPromise) {
    const pending = puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--renderer-process-limit=1",
      ],
    });
    browserPromise = pending;
    void pending.then(browser => {
      browser.once("disconnected", () => clearBrowser(pending));
    }).catch(() => clearBrowser(pending));
  }
  return browserPromise;
}

async function withRenderSlot<T>(task: () => Promise<T>) {
  const previous = renderQueue;
  let release: (() => void) | undefined;
  renderQueue = new Promise<void>(resolve => {
    release = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    release?.();
  }
}

async function closePageSafely(page: Page, browser: Browser) {
  try {
    if (!page.isClosed()) await page.close();
  } catch (error) {
    if (!browser.connected || isConnectionClosed(error)) {
      clearBrowser();
      return;
    }
    throw error;
  }
}

async function renderPdfOnce(html: string) {
  const browser = await getBrowser();
  let page: Page | null = null;
  try {
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    await page.emulateMediaType("print");
    return await page.pdf({
      format: "Letter",
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } catch (error) {
    if (!browser.connected || isConnectionClosed(error)) clearBrowser();
    throw error;
  } finally {
    if (page) await closePageSafely(page, browser);
  }
}

/**
 * Render one document at a time. A single Chromium process is intentionally
 * reused and a disconnected target gets one clean retry, which keeps the
 * 512 MiB production runtime from launching competing renderer processes.
 */
export function renderPdf(html: string) {
  return withRenderSlot(async () => {
    try {
      return await renderPdfOnce(html);
    } catch (error) {
      if (!isConnectionClosed(error)) throw error;
      await closePdfBrowser();
      return renderPdfOnce(html);
    }
  });
}

export async function closePdfBrowser() {
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  const browser = await pending.catch(() => null);
  if (browser) await browser.close().catch(() => undefined);
}
