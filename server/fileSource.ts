/**
 * File source seam: the files shown for a record. The app stores no file bytes; it lists links.
 *
 * "references" (default, built): the list is made from what the record already holds, the client folder link
 * (`engagements.clientFolderUrl`) and the source checklist `reference` values. No network calls.
 *
 * "sharepoint" (reserved, NOT built): a read-only Microsoft Graph listing of the client folder. It may be built only
 * once that connector is approved; until then the app makes no outbound calls other than its database. See the stub
 * below and docs/CONFIGURATION.md (FILE_SOURCE).
 */

export type RecordFile = {
  name: string;
  url: string;
  kind?: "folder" | "file" | "link";
  /** YYYY-MM-DD, when known. */
  modifiedOn?: string | null;
};

/** What a file source may read from a record. Callers load it through server/visibility.ts like any engagement read. */
export type FileSourceRecord = {
  clientFolderUrl: string | null;
  sources: { label: string; reference: string | null; receivedOn?: string | null }[];
};

export type FileSourceName = "references";
type FileSource = { name: FileSourceName; list: (record: FileSourceRecord) => Promise<RecordFile[]> };

/** Only https links are ever returned, so a stored value can never become a script or local-file link. */
function httpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A plain reference (a file name or folder path) has no link of its own; it lives in the client folder. */
function referenceName(reference: string) {
  const trimmed = reference.trim().replace(/[\\/]+$/, "");
  return trimmed.split(/[\\/]/).pop() || trimmed;
}

const referencesSource: FileSource = {
  name: "references",
  async list(record) {
    const folder = httpsUrl(record.clientFolderUrl);
    const files: RecordFile[] = [];
    if (folder) files.push({ name: "Client folder", url: folder, kind: "folder" });
    const seen = new Set(files.map(file => file.url + file.name));
    for (const source of record.sources) {
      const reference = source.reference?.trim();
      if (!reference) continue;
      const link = httpsUrl(reference);
      // A link is listed as itself. A file name or folder path opens the client folder it is kept in; without a folder
      // there is nothing to open. Free-text notes ("Signed resource assignment: 320 hours") are not files and are left out.
      const isFile = /\.[a-z0-9]{2,5}$/i.test(reference);
      const isPath = /[\\/]/.test(reference);
      const file: RecordFile | null = link
        ? { name: source.label, url: link, kind: "link", modifiedOn: source.receivedOn ?? null }
        : folder && (isFile || isPath)
          ? { name: referenceName(reference), url: folder, kind: isFile ? "file" : "folder", modifiedOn: source.receivedOn ?? null }
          : null;
      if (!file || seen.has(file.url + file.name)) continue;
      seen.add(file.url + file.name);
      files.push(file);
    }
    return files;
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// FUTURE "sharepoint" file source: NOT IMPLEMENTED. Build it only after the connector is approved.
//
// Intended shape: resolve clientFolderUrl to a drive item through Microsoft Graph (shares/{encoded-url}/driveItem),
// list its children read-only (Files.Read.All or Sites.Selected, app-only), and map each child to a RecordFile
// { name, url: webUrl, kind, modifiedOn: lastModifiedDateTime }. No file content is downloaded or stored.
// It would add the app's first outbound call, so it also needs: an allow-listed Graph host, secrets in
// docs/CONFIGURATION.md, and a docs/SECURITY-REVIEW.md update. Add "sharepoint" to FILE_SOURCES when it exists.
// ---------------------------------------------------------------------------------------------------------------------

export const FILE_SOURCES = ["references"] as const;
const RESERVED = new Set(["sharepoint"]);

/** Reads FILE_SOURCE (default "references"). Anything else fails loudly at startup rather than on first use. */
export function fileSourceName(value: string | undefined = process.env.FILE_SOURCE): FileSourceName {
  const name = value?.trim().toLowerCase() || "references";
  if ((FILE_SOURCES as readonly string[]).includes(name)) return name as FileSourceName;
  if (RESERVED.has(name)) throw new Error(`FILE_SOURCE="${name}" is reserved for a future connector and is not built. Use "references".`);
  throw new Error(`FILE_SOURCE="${name}" is not a file source. Use "references".`);
}

function fileSource(name: FileSourceName): FileSource {
  switch (name) {
    case "references":
      return referencesSource;
  }
}

/** The files for one record, from the configured source. The caller has already checked the viewer may see it. */
export function getRecordFiles(record: FileSourceRecord, name: FileSourceName = fileSourceName()): Promise<RecordFile[]> {
  return fileSource(name).list(record);
}
