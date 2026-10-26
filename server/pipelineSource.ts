/**
 * Pipeline source seam: where import rows come from. A source produces normalized RawPipelineRow[]; reconciliation
 * (shared/sharepointImport.ts planMappedRows), the merge rule, stage events, and the report work on those rows and
 * know nothing about the source.
 *
 * Only "csv" is built: the SharePoint VSA Pipeline List export, uploaded by a person. It makes no network calls.
 * A Salesforce or SharePoint pull would be a second implementation behind this interface, added only once that
 * connector is approved; until then the app makes no outbound calls other than its database.
 */
import { mapPipelineRow, parsePipelineCsv, type RawPipelineRow } from "../shared/sharepointImport";

/** Built sources. "salesforce" and "sharepoint" are reserved names for future, approved connectors. */
export const PIPELINE_SOURCES = ["csv"] as const;
export type PipelineSourceName = (typeof PIPELINE_SOURCES)[number];
export const RESERVED_PIPELINE_SOURCES = ["salesforce", "sharepoint"] as const;
const RESERVED = new Set<string>(RESERVED_PIPELINE_SOURCES);

export type PipelineBatch = {
  source: PipelineSourceName;
  rows: RawPipelineRow[];
  /** Problems with the input as a whole (wrong file, missing columns); rows are then empty. */
  problems: string[];
  /** How records this source creates are marked (`engagements.intakeSource`). */
  intakeSource: "sharepoint_import";
  /** The note written on import stage events, naming where a row came from. */
  rowNote: (rowNumber: number) => string;
};

/** What the person supplies. A pull source would ignore the file. */
export type PipelineInput = { csv: string };

export type PipelineSource = { name: PipelineSourceName; acquire: (input: PipelineInput) => Promise<PipelineBatch> };

/** The uploaded SharePoint Pipeline List CSV, parsed and mapped exactly as before the seam existed. */
export const csvPipelineSource: PipelineSource = {
  name: "csv",
  async acquire({ csv }) {
    const file = parsePipelineCsv(csv);
    return {
      source: "csv",
      rows: file.rows.map(row => mapPipelineRow(row, file.columns)),
      problems: file.problems,
      intakeSource: "sharepoint_import",
      rowNote: rowNumber => `SharePoint import, row ${rowNumber}`,
    };
  },
};

/** Reads PIPELINE_SOURCE (default "csv"). Anything else fails loudly at startup rather than at the first import. */
export function pipelineSourceName(value: string | undefined = process.env.PIPELINE_SOURCE): PipelineSourceName {
  const name = value?.trim().toLowerCase() || "csv";
  if ((PIPELINE_SOURCES as readonly string[]).includes(name)) return name as PipelineSourceName;
  if (RESERVED.has(name)) throw new Error(`PIPELINE_SOURCE="${name}" is reserved for a future connector and is not built. Use "csv".`);
  throw new Error(`PIPELINE_SOURCE="${name}" is not a pipeline source. Use "csv".`);
}

export function pipelineSource(name: PipelineSourceName = pipelineSourceName()): PipelineSource {
  switch (name) {
    case "csv":
      return csvPipelineSource;
  }
}
