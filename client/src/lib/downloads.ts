export type DownloadEnvironment = {
  document: Pick<Document, "body" | "createElement">;
  createObjectURL: typeof URL.createObjectURL;
  revokeObjectURL: typeof URL.revokeObjectURL;
  setTimeout: typeof window.setTimeout;
  atob: typeof window.atob;
};

function browserEnvironment(): DownloadEnvironment {
  return {
    document,
    createObjectURL: URL.createObjectURL.bind(URL),
    revokeObjectURL: URL.revokeObjectURL.bind(URL),
    setTimeout: window.setTimeout.bind(window),
    atob: window.atob.bind(window),
  };
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
