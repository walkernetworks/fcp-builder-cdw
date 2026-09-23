import { readFileSync } from "node:fs";
import path from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { assessBuildingBlocks, normalizeBlockArea, type BuildingBlockAssessment } from "../shared/buildingBlocks";
import type { EngagementDocument } from "../shared/fcp";

export const BUILDING_BLOCKS_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TEMPLATE_FILE = "building-blocks-template.xlsx";
const FULL_VERSION_SHEET = "Full Version";
const OUTPUT_SHEET = "Building Blocks";
const PROJECTED_DATES_HEADER = "Projected Dates";

let cachedTemplate: Uint8Array | null = null;

function loadTemplate(): Uint8Array {
  if (cachedTemplate) return cachedTemplate;
  // Source runs from server/; the production bundle runs from dist/ next to the copied server/ tree.
  const candidates = [path.resolve(import.meta.dirname, "templates", TEMPLATE_FILE), path.resolve(import.meta.dirname, "..", "server", "templates", TEMPLATE_FILE)];
  for (const candidate of candidates) {
    try {
      cachedTemplate = new Uint8Array(readFileSync(candidate));
      return cachedTemplate;
    } catch {
      // Try the next location.
    }
  }
  throw new Error("The Building Blocks template workbook is missing.");
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function unescapeXml(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function textRuns(xml: string): string {
  return unescapeXml(Array.from(xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g), match => match[1]).join(""));
}

function fullVersionSheetPath(files: Record<string, Uint8Array>): string {
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const sheet = Array.from(workbook.matchAll(/<sheet\s[^>]*>/g), match => match[0]).find(tag => tag.includes(`name="${FULL_VERSION_SHEET}"`));
  const relationshipId = sheet?.match(/r:id="([^"]+)"/)?.[1];
  const relationships = strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const target = Array.from(relationships.matchAll(/<Relationship\s[^>]*>/g), match => match[0]).find(tag => tag.includes(`Id="${relationshipId}"`))?.match(/Target="([^"]+)"/)?.[1];
  if (!target) throw new Error(`The Building Blocks template has no "${FULL_VERSION_SHEET}" tab.`);
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

type Cell = { column: string; attributes: string; body: string | null };

function parseCells(rowXml: string): Cell[] {
  return Array.from(rowXml.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g), match => ({ column: match[1], attributes: match[2], body: match[3] ?? null }));
}

function cellText(cell: Cell | undefined, sharedStrings: string[]): string {
  if (!cell?.body) return "";
  if (/\st="s"/.test(cell.attributes)) return sharedStrings[Number(cell.body.match(/<v>(\d+)<\/v>/)?.[1])] ?? "";
  if (/\st="inlineStr"/.test(cell.attributes)) return textRuns(cell.body);
  return unescapeXml(cell.body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
}

type TemplateBlock = { block: string; category: string; area: string };

/** Block (A), Category (B), and Assessment Area (C) rows from the template's Full Version tab, with merged categories filled down. */
function templateBlocks(): { headers: [string, string, string, string, string]; blocks: TemplateBlock[] } {
  const files = unzipSync(loadTemplate());
  const sharedStrings = files["xl/sharedStrings.xml"] ? Array.from(strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g), match => textRuns(match[1])) : [];
  const rows = Array.from(strFromU8(files[fullVersionSheetPath(files)]).matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g), match => {
    const cells = new Map(parseCells(match[2]).map(cell => [cell.column, cell]));
    const text = (column: string) => cellText(cells.get(column), sharedStrings).replace(/\s+/g, " ").trim();
    return { rowNumber: match[1], text };
  });
  const header = rows.find(row => row.rowNumber === "1");
  if (!header) throw new Error(`The Building Blocks template "${FULL_VERSION_SHEET}" tab has no header row.`);

  const blocks: TemplateBlock[] = [];
  let category = "";
  for (const row of rows) {
    if (row.rowNumber === "1") continue;
    category = row.text("B") || category;
    const area = row.text("C");
    if (area) blocks.push({ block: row.text("A"), category, area });
  }
  return { headers: [header.text("A"), header.text("B"), header.text("C"), header.text("D"), header.text("E")], blocks };
}

const COLUMNS = [
  { letter: "A", width: 8 },
  { letter: "B", width: 26 },
  { letter: "C", width: 44 },
  { letter: "D", width: 20 },
  { letter: "E", width: 22 },
  { letter: "F", width: 32 },
];
const HEADER_STYLE = 1;
const BODY_STYLE = 2;

function stringCell(ref: string, value: string, style: number): string {
  return value ? `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>` : `<c r="${ref}" s="${style}"/>`;
}

function blockCell(ref: string, value: string): string {
  return /^\d+$/.test(value) ? `<c r="${ref}" s="${BODY_STYLE}"><v>${value}</v></c>` : stringCell(ref, value, BODY_STYLE);
}

function worksheetXml(rows: string[][]): string {
  const lastRow = rows.length;
  const sheetRows = rows.map((values, index) => {
    const rowNumber = index + 1;
    const cells = values.map((value, column) => {
      const ref = `${COLUMNS[column].letter}${rowNumber}`;
      if (rowNumber === 1) return stringCell(ref, value, HEADER_STYLE);
      return column === 0 ? blockCell(ref, value) : stringCell(ref, value, BODY_STYLE);
    }).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("");
  const range = `A1:${COLUMNS[COLUMNS.length - 1].letter}${lastRow}`;
  const cols = COLUMNS.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="${range}"/></worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function workbookPackage(sheetXml: string, rowCount: number): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${OUTPUT_SHEET}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${OUTPUT_SHEET}'!$A$1:$${COLUMNS[COLUMNS.length - 1].letter}$${rowCount}</definedName></definedNames></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
    "xl/styles.xml": strToU8(STYLES_XML),
  }, { level: 6 });
}

/**
 * Produces the Building Blocks workbook for an engagement: a single sheet holding only what the
 * Building Blocks tool takes from the template's Full Version tab (A Block, B Category,
 * C Assessment Area, D Capability Rating, E Customer Deliverables, L Projected Dates), as columns A–F.
 * A–C and the header labels come from the template; D, E, and Projected Dates are derived from the FCP.
 */
export function renderBuildingBlocksWorkbook(document: EngagementDocument, today?: string): Uint8Array {
  const { headers, blocks } = templateBlocks();
  const byArea = new Map(assessBuildingBlocks(document, today).map(item => [normalizeBlockArea(item.area), item]));
  const filledAreas = new Set<string>();
  const rows = blocks.map(block => {
    const assessment = byArea.get(normalizeBlockArea(block.area));
    if (assessment) filledAreas.add(assessment.area);
    return [block.block, block.category, block.area, assessment?.rating ?? "", assessment?.deliverable ?? "", assessment?.projectedDates ?? ""];
  });

  const missing = Array.from(byArea.values()).filter(item => !filledAreas.has(item.area)).map(item => item.area);
  if (missing.length) throw new Error(`The Building Blocks template is missing assessment areas: ${missing.join(", ")}`);

  const sheetRows = [[...headers, PROJECTED_DATES_HEADER], ...rows];
  return workbookPackage(worksheetXml(sheetRows), sheetRows.length);
}

export function buildingBlocksFilename(title: string): string {
  const stem = title.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "FCP";
  return `${stem}-Building-Blocks.xlsx`;
}
