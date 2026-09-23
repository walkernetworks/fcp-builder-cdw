export type DownloadFormat = "html" | "pdf" | "xlsx";

const EXPECTED_MIME: Record<DownloadFormat, string> = {
  html: "text/html",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export type DownloadEnvironment = {
  document: Pick<Document, "body" | "createElement">;
  createObjectURL: typeof URL.createObjectURL;
  revokeObjectURL: typeof URL.revokeObjectURL;
  setTimeout: typeof window.setTimeout;
  atob: typeof window.atob;
};

type DownloadResponse = Pick<Response, "blob" | "headers" | "ok" | "status" | "text">;

function browserEnvironment(): DownloadEnvironment {
  return {
    document,
    createObjectURL: URL.createObjectURL.bind(URL),
    revokeObjectURL: URL.revokeObjectURL.bind(URL),
    setTimeout: window.setTimeout.bind(window),
    atob: window.atob.bind(window),
  };
}

function extensionFor(format: DownloadFormat) {
  return format;
}

function safeFilenameStem(value: string) {
  return value
    .replace(/[\\/\u0000-\u001F\u007F]+/g, "-")
    .replace(/[<>:"|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.[^/.]+$/, "")
    .slice(0, 120);
}

/**
 * Uses a server-supplied attachment name when possible, while always preserving
 * the expected extension for the requested export type.
 */
export function filenameFromContentDisposition(header: string | null, fallbackFilename: string, format: DownloadFormat) {
  const extendedMatch = header?.match(/(?:^|;)\s*filename\*\s*=\s*UTF-8''([^;]+)/i);
  const standardMatch = header?.match(/(?:^|;)\s*filename\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  const encoded = extendedMatch?.[1];
  let candidate = encoded
    ? (() => {
      try {
        return decodeURIComponent(encoded);
      } catch {
        return encoded;
      }
    })()
    : (standardMatch?.[1] ?? standardMatch?.[2] ?? fallbackFilename);

  const stem = safeFilenameStem(candidate) || safeFilenameStem(fallbackFilename) || "FCP";
  return `${stem}.${extensionFor(format)}`;
}

export function triggerBlobDownload(filename: string, blob: Blob, environment: DownloadEnvironment = browserEnvironment()) {
  const url = environment.createObjectURL(blob);
  const anchor = environment.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  environment.document.body.appendChild(anchor);
  anchor.click();

  // Chromium may begin reading the Blob after the click handler returns. Revoking
  // immediately can produce a browser-level "Download failed" even though the
  // authenticated export request succeeded.
  environment.setTimeout(() => {
    environment.revokeObjectURL(url);
    anchor.remove();
  }, 30_000);
}

export function downloadText(filename: string, mime: string, content: string, environment?: DownloadEnvironment) {
  triggerBlobDownload(filename, new Blob([content], { type: mime }), environment);
}

export function decodeBase64(base64: string, atobImplementation: typeof window.atob = value => globalThis.atob(value)) {
  const parts: ArrayBuffer[] = [];
  const chunkSize = 512 * 1024;
  for (let offset = 0; offset < base64.length; offset += chunkSize) {
    const binary = atobImplementation(base64.slice(offset, offset + chunkSize));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    parts.push(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  }
  return parts;
}

export function downloadBase64(filename: string, mime: string, base64: string, environment?: DownloadEnvironment) {
  const activeEnvironment = environment ?? browserEnvironment();
  triggerBlobDownload(filename, new Blob(decodeBase64(base64, activeEnvironment.atob), { type: mime }), activeEnvironment);
}

/**
 * Converts a signed same-origin export response into a verified browser download.
 * Error responses are deliberately surfaced to the workspace instead of being
 * downloaded as misleading text files.
 */
export async function downloadServerAttachment(
  response: DownloadResponse,
  format: DownloadFormat,
  fallbackFilename: string,
  environment?: DownloadEnvironment,
) {
  const expectedMime = EXPECTED_MIME[format];
  if (!response.ok) {
    const message = (await response.text().catch(() => "")).trim();
    throw new Error(message || `The ${format.toUpperCase()} export could not be generated (HTTP ${response.status}).`);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes(expectedMime)) {
    const message = (await response.text().catch(() => "")).trim();
    throw new Error(message || `The export service returned ${contentType || "an unknown file type"} instead of ${expectedMime}.`);
  }

  const blob = await response.blob();
  if (format === "pdf") {
    const signature = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());
    if (signature !== "%PDF-") throw new Error("The export service did not return a valid PDF document.");
  }
  if (format === "xlsx") {
    const signature = new TextDecoder().decode(await blob.slice(0, 2).arrayBuffer());
    if (signature !== "PK") throw new Error("The export service did not return a valid Excel workbook.");
  }

  const filename = filenameFromContentDisposition(response.headers.get("content-disposition"), fallbackFilename, format);
  triggerBlobDownload(filename, new Blob([blob], { type: expectedMime }), environment);
}
