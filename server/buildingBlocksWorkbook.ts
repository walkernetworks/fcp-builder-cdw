import { strToU8, zipSync } from "fflate";
import { assessBuildingBlocks, dependencyLabel, type BuildingBlockAssessment } from "../shared/buildingBlocks";
import type { EngagementDocument } from "../shared/fcp";

export const BUILDING_BLOCKS_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SHEET_NAME = "Building Blocks";

const COLUMNS = [
  { header: "Category", width: 34 },
  { header: "Category Start Date", width: 18 },
  { header: "Block", width: 44 },
  { header: "Status", width: 14 },
  { header: "Projected Dates", width: 32 },
  { header: "Dependencies", width: 44 },
  { header: "Notes", width: 44 },
];
const LAST_COLUMN = String.fromCharCode(64 + COLUMNS.length);

const HEADER_STYLE = 1;
const TEXT_STYLE = 2;
const DATE_STYLE = 3;

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function textCell(ref: string, value: string, style: number): string {
  return value ? `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>` : `<c r="${ref}" s="${style}"/>`;
}

/** Writes an ISO date as an Excel date serial so it sorts, filters, and pastes as a date. */
function dateCell(ref: string, isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return `<c r="${ref}" s="${DATE_STYLE}"/>`;
  const serial = (Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - Date.UTC(1899, 11, 30)) / 86_400_000;
  return `<c r="${ref}" s="${DATE_STYLE}"><v>${serial}</v></c>`;
}

/** The Building Blocks tool takes one start date per category: the earliest projected start among its blocks. */
function categoryStartDates(assessments: BuildingBlockAssessment[]): Map<string, string> {
  const starts = new Map<string, string>();
  for (const item of assessments) {
    if (!item.projectedStart) continue;
    const current = starts.get(item.category);
    if (!current || item.projectedStart < current) starts.set(item.category, item.projectedStart);
  }
  return starts;
}

function worksheetXml(assessments: BuildingBlockAssessment[]): string {
  const starts = categoryStartDates(assessments);
  const header = `<row r="1">${COLUMNS.map((column, index) => textCell(`${String.fromCharCode(65 + index)}1`, column.header, HEADER_STYLE)).join("")}</row>`;
  const body = assessments.map((item, index) => {
    const row = index + 2;
    return `<row r="${row}">${[
      textCell(`A${row}`, item.category, TEXT_STYLE),
      dateCell(`B${row}`, starts.get(item.category) ?? ""),
      textCell(`C${row}`, item.area, TEXT_STYLE),
      textCell(`D${row}`, item.status, TEXT_STYLE),
      textCell(`E${row}`, item.projectedDates, TEXT_STYLE),
      textCell(`F${row}`, dependencyLabel(item.area), TEXT_STYLE),
      textCell(`G${row}`, item.requiredBy.length ? `Included as a dependency of ${item.requiredBy.join(", ")}` : "", TEXT_STYLE),
    ].join("")}</row>`;
  }).join("");
  const range = `A1:${LAST_COLUMN}${assessments.length + 1}`;
  const cols = COLUMNS.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${header}${body}</sheetData><autoFilter ref="${range}"/></worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="mmm d, yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function workbookPackage(sheetXml: string, rowCount: number): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${SHEET_NAME}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${SHEET_NAME}'!$A$1:$${LAST_COLUMN}$${rowCount}</definedName></definedNames></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
    "xl/styles.xml": strToU8(STYLES_XML),
  }, { level: 6 });
}

/**
 * Produces the Building Blocks workbook for an engagement: one row per block, in the categories and
 * order the Building Blocks tool uses, with the values the tool takes (category start date and block
 * status), the projected dates behind them, and each block's dependencies. Dependencies the plan does
 * not cover are included as Planning and noted.
 */
export function renderBuildingBlocksWorkbook(document: EngagementDocument, today?: string): Uint8Array {
  const assessments = assessBuildingBlocks(document, today);
  return workbookPackage(worksheetXml(assessments), assessments.length + 1);
}

export function buildingBlocksFilename(title: string): string {
  const stem = title.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "FCP";
  return `${stem}-Building-Blocks.xlsx`;
}
