export type ExportDocumentType = "fcp" | "condensed-fcp" | "plan-output" | "building-blocks";

const DOCUMENT_SUFFIX: Record<ExportDocumentType, string> = {
  fcp: "FCP",
  "condensed-fcp": "Condensed - FCP",
  "plan-output": "Compatibility Handoff",
  "building-blocks": "Building Blocks",
};

/**
 * Download name for an export: the engagement title followed by " - FCP" (or the document's own name), for
 * example "OrthoCarolina - FCP.pdf". A title that already ends with the suffix is not repeated.
 */
export function exportFilename(title: string, documentType: ExportDocumentType, extension: "html" | "pdf" | "xlsx"): string {
  const stem = title.replace(/[^A-Za-z0-9 _-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80).trim() || "Engagement";
  const suffix = DOCUMENT_SUFFIX[documentType];
  const named = stem.toLowerCase().endsWith(suffix.toLowerCase()) ? stem : `${stem} - ${suffix}`;
  return `${named}.${extension}`;
}
