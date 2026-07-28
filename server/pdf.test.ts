import { afterEach, describe, expect, it, vi } from "vitest";

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));

vi.mock("puppeteer-core", () => ({
  default: { launch },
}));

import { closePdfBrowser, renderPdf } from "./pdf";

function successfulPage(content = "%PDF-1.7\nrecovered export") {
  return {
    setContent: vi.fn(async () => undefined),
    emulateMediaType: vi.fn(async () => undefined),
    pdf: vi.fn(async () => Buffer.from(content, "utf8")),
    isClosed: vi.fn(() => false),
    close: vi.fn(async () => undefined),
  };
}

function browserFor(page: ReturnType<typeof successfulPage>, connected = true) {
  return {
    connected,
    once: vi.fn(),
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => undefined),
  };
}

describe("PDF rendering recovery", () => {
  afterEach(async () => {
    await closePdfBrowser();
    launch.mockReset();
  });

  it("preserves a completed PDF when Chromium disconnects while closing the page", async () => {
    const page = successfulPage();
    page.close.mockRejectedValue(new Error("Protocol error: Connection closed"));
    const browser = browserFor(page, false);
    launch.mockResolvedValue(browser);

    const pdf = await renderPdf("<html><body>FCP</body></html>");

    expect(pdf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(page.pdf).toHaveBeenCalledTimes(1);
    expect(page.close).toHaveBeenCalledTimes(1);
  });

  it("retries once with a fresh renderer after a target closes during PDF creation", async () => {
    const failedPage = successfulPage();
    failedPage.pdf.mockRejectedValue(new Error("Protocol error (Page.printToPDF): Target closed"));
    const recoveredPage = successfulPage("%PDF-1.7\nretried export");
    launch
      .mockResolvedValueOnce(browserFor(failedPage))
      .mockResolvedValueOnce(browserFor(recoveredPage));

    const pdf = await renderPdf("<html><body>FCP</body></html>");

    expect(pdf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(launch).toHaveBeenCalledTimes(2);
    expect(failedPage.pdf).toHaveBeenCalledTimes(1);
    expect(recoveredPage.pdf).toHaveBeenCalledTimes(1);
  });
});
