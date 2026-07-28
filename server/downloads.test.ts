import { describe, expect, it, vi } from "vitest";
import {
  downloadBase64,
  downloadServerAttachment,
  downloadText,
  filenameFromContentDisposition,
  type DownloadEnvironment,
} from "../client/src/lib/downloads";

function createEnvironment() {
  const clicked: Array<{ href: string; download: string }> = [];
  const appended: unknown[] = [];
  const removed: unknown[] = [];
  const revoked: string[] = [];
  const scheduled: Array<() => void> = [];
  const blobs: Blob[] = [];

  const anchor = {
    href: "",
    download: "",
    style: { display: "" },
    click() { clicked.push({ href: this.href, download: this.download }); },
    remove() { removed.push(this); },
  };

  const environment: DownloadEnvironment = {
    document: {
      body: { appendChild(node: unknown) { appended.push(node); return node; } },
      createElement() { return anchor; },
    } as unknown as DownloadEnvironment["document"],
    createObjectURL(blob) { blobs.push(blob); return `blob:test-${blobs.length}`; },
    revokeObjectURL(url) { revoked.push(url); },
    setTimeout(callback) { scheduled.push(callback as () => void); return 1; },
    atob(value) { return Buffer.from(value, "base64").toString("binary"); },
  };

  return { environment, anchor, clicked, appended, removed, revoked, scheduled, blobs };
}

describe("browser export download lifecycle", () => {
  it("starts a named HTML download and keeps the Blob URL alive until the delayed cleanup", async () => {
    const state = createEnvironment();
    downloadText("Meridian-FCP.html", "text/html;charset=utf-8", "<!doctype html><title>FCP</title>", state.environment);

    expect(state.clicked).toEqual([{ href: "blob:test-1", download: "Meridian-FCP.html" }]);
    expect(state.appended).toHaveLength(1);
    expect(state.blobs[0].type).toBe("text/html;charset=utf-8");
    expect(await state.blobs[0].text()).toContain("<title>FCP</title>");
    expect(state.revoked).toEqual([]);

    state.scheduled[0]();
    expect(state.revoked).toEqual(["blob:test-1"]);
    expect(state.removed).toHaveLength(1);
  });

  it("decodes a non-empty PDF payload into a named application/pdf download", async () => {
    const state = createEnvironment();
    const bytes = Buffer.from("%PDF-1.7\nfixture");
    downloadBase64("Meridian-FCP.pdf", "application/pdf", bytes.toString("base64"), state.environment);

    expect(state.clicked[0]).toEqual({ href: "blob:test-1", download: "Meridian-FCP.pdf" });
    expect(state.blobs[0].type).toBe("application/pdf");
    expect(Buffer.from(await state.blobs[0].arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("normalizes the server filename to the requested PDF extension", () => {
    expect(filenameFromContentDisposition('attachment; filename="Meridian FCP.txt"', "Fallback.pdf", "pdf")).toBe("Meridian FCP.pdf");
    expect(filenameFromContentDisposition("attachment; filename*=UTF-8''Meridian%20FCP.pdf", "Fallback.pdf", "pdf")).toBe("Meridian FCP.pdf");
    expect(filenameFromContentDisposition(null, "Fallback.txt", "pdf")).toBe("Fallback.pdf");
  });

  it("downloads only a verified PDF response with a .pdf filename", async () => {
    const state = createEnvironment();
    const response = new Response("%PDF-1.7\nverified export", {
      status: 200,
      headers: {
        "content-disposition": 'attachment; filename="Meridian-FCP.txt"',
        "content-type": "application/pdf",
      },
    });

    await downloadServerAttachment(response, "pdf", "Fallback.pdf", state.environment);

    expect(state.clicked).toEqual([{ href: "blob:test-1", download: "Meridian-FCP.pdf" }]);
    expect(state.blobs[0].type).toBe("application/pdf");
    expect(Buffer.from(await state.blobs[0].arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("surfaces a text error response instead of downloading it as a misleading PDF or text file", async () => {
    const state = createEnvironment();
    const response = new Response("The export could not be generated.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });

    await expect(downloadServerAttachment(response, "pdf", "Fallback.pdf", state.environment))
      .rejects.toThrow("The export could not be generated.");
    expect(state.clicked).toEqual([]);
    expect(state.blobs).toEqual([]);
  });

  it("surfaces malformed PDF decoding errors before a broken download is started", () => {
    const state = createEnvironment();
    state.environment.atob = vi.fn(() => { throw new Error("Malformed export payload"); });

    expect(() => downloadBase64("Broken.pdf", "application/pdf", "not-base64", state.environment)).toThrow("Malformed export payload");
    expect(state.clicked).toEqual([]);
    expect(state.blobs).toEqual([]);
  });
});
