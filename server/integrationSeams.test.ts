import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fileSourceName, getRecordFiles } from "./fileSource";

const FOLDER = "https://example.sharepoint.com/sites/vsa/Shared%20Documents/Example%20Co";
const source = (label: string, reference: string | null, receivedOn: string | null = null) => ({ label, reference, receivedOn });

describe("file source: references", () => {
  it("lists the client folder first, then file names and paths as links into it, and links as themselves", async () => {
    const files = await getRecordFiles({
      clientFolderUrl: FOLDER,
      sources: [
        source("RVTools export", "RVTools_export_example.xlsx", "2026-10-12"),
        source("Discovery notes", "Discovery/Workshop notes/"),
        source("Customer brief", "https://example.sharepoint.com/sites/vsa/brief.docx"),
        source("Hours source", "Signed resource assignment: 320 hours"),
        source("Other", null),
      ],
    }, "references");
    expect(files).toEqual([
      { name: "Client folder", url: FOLDER, kind: "folder" },
      { name: "RVTools_export_example.xlsx", url: FOLDER, kind: "file", modifiedOn: "2026-10-12" },
      { name: "Workshop notes", url: FOLDER, kind: "folder", modifiedOn: null },
      { name: "Customer brief", url: "https://example.sharepoint.com/sites/vsa/brief.docx", kind: "link", modifiedOn: null },
    ]);
  });

  it("returns only https links, and nothing to open for names when there is no folder", async () => {
    const files = await getRecordFiles({
      clientFolderUrl: "javascript:alert(1)",
      sources: [source("A", "file.xlsx"), source("B", "http://example.com/x"), source("C", "https://example.com/ok")],
    }, "references");
    expect(files).toEqual([{ name: "C", url: "https://example.com/ok", kind: "link", modifiedOn: null }]);
    expect(await getRecordFiles({ clientFolderUrl: null, sources: [] }, "references")).toEqual([]);
  });

  it("defaults to references and refuses the SharePoint connector until it is built", () => {
    expect(fileSourceName(undefined)).toBe("references");
    expect(fileSourceName("")).toBe("references");
    expect(() => fileSourceName("sharepoint")).toThrow(/reserved for a future connector/);
    expect(() => fileSourceName("dropbox")).toThrow(/not a file source/);
  });
});

describe("integration seams make no outbound calls", () => {
  const read = (file: string) => readFileSync(path.join(import.meta.dirname, file), "utf8");
  const network = /\bfetch\(|from "node:(https?|net|tls|dgram)"|from "(https?|net|tls|axios|undici|got|node-fetch)"|require\("(https?|axios)"\)|XMLHttpRequest|WebSocket/;

  it("neither source imports a network client or calls fetch", () => {
    for (const file of ["fileSource.ts", "pipelineSource.ts"]) expect(read(file), file).not.toMatch(network);
  });

  it("reconciliation in db.ts takes normalized rows and never parses a source format itself", () => {
    const db = read("db.ts");
    const runner = db.slice(db.indexOf("export async function runPipelineImport"), db.indexOf("// Saved reports"));
    expect(runner).toMatch(/planMappedRows\(batch\.rows/);
    expect(runner).not.toMatch(/parsePipelineCsv|mapPipelineRow|planImport\(|SharePoint import, row/);
  });
});
