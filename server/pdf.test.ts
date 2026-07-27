import { afterEach, describe, expect, it, vi } from "vitest";

const { launch } = vi.hoisted(() => ({ launch: vi.fn() }));

vi.mock("puppeteer-core", () => ({
  default: { launch },
}));

import { closePdfBrowser, renderPdf } from "./pdf";

describe("PDF rendering recovery", () => {
  afterEach(async () => {
    await closePdfBrowser();
    launch.mockReset();
  });

  it("preserves a completed PDF when Chromium disconnects while closing the page", async () => {
    const page = {
      setContent: vi.fn(async () => undefined),
      emulateMediaType: vi.fn(async () => undefined),
      pdf: vi.fn(async () => Buffer.from("%PDF-1.7\nrecovered export", "utf8")),
      isClosed: vi.fn(() => false),
      close: vi.fn(async () => {
        throw new Error("Protocol error: Connection closed");
      }),
    };
    const browser = {
      connected: false,
      once: vi.fn(),
      newPage: vi.fn(async () => page),
      close: vi.fn(async () => undefined),
    };
    launch.mockResolvedValue(browser);

    const pdf = await renderPdf("<html><body>FCP</body></html>");

    expect(pdf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    expect(page.pdf).toHaveBeenCalledTimes(1);
    expect(page.close).toHaveBeenCalledTimes(1);
  });
});
