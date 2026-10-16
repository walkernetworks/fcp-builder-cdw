import { strToU8, zipSync } from "fflate";
import { FIELD_BY_KEY, formatMeasure, measureLabel, type ReportConfig, type ReportResult } from "../shared/vsaReports";
import type { ReportField, ReportSource } from "../shared/vsaReports";

export const REPORT_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Cell styles (index into cellXfs below).
const HEADER = 1;
const TEXT = 2;
const DATE = 3;
const MONEY = 4;
const NUMBER = 5;
const NOTE = 6;

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Column letters past Z (AA, AB, ...). */
export function columnName(index: number) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

const textCell = (ref: string, value: string, style = TEXT) => (value ? `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>` : `<c r="${ref}" s="${style}"/>`);
const numberCell = (ref: string, value: number, style: number) => `<c r="${ref}" s="${style}"><v>${value}</v></c>`;

function dateCell(ref: string, iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return textCell(ref, iso);
  const serial = (Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - Date.UTC(1899, 11, 30)) / 86_400_000;
  return numberCell(ref, serial, DATE);
}

/** One typed cell: numbers stay numbers, money keeps its format, dates are Excel dates, enums use their labels. */
function typedCell(ref: string, field: ReportField, row: ReportSource, display: string, today: string) {
  const value = field.get(row, today);
  if (value === null || value === "") return `<c r="${ref}" s="${TEXT}"/>`;
  if (field.type === "money") return numberCell(ref, Number(value), MONEY);
  if (field.type === "number") return numberCell(ref, Number(value), NUMBER);
  if (field.type === "date" && typeof value === "string") return dateCell(ref, value);
  return textCell(ref, display);
}

function sheetXml(rowsXml: string, widths: number[], lastRef: string, filterRef: string | null) {
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastRef}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rowsXml}</sheetData>${filterRef ? `<autoFilter ref="${filterRef}"/>` : ""}</worksheet>`;
}

function detailSheet(result: ReportResult, legend: string, today: string) {
  const header = `<row r="1">${result.columns.map((field, index) => textCell(`${columnName(index)}1`, field.label, HEADER)).join("")}</row>`;
  const body = result.rows.map((row, rowIndex) => {
    const r = rowIndex + 2;
    return `<row r="${r}">${result.columns.map((field, index) => typedCell(`${columnName(index)}${r}`, field, row, result.table[rowIndex][index], today)).join("")}</row>`;
  }).join("");
  const legendRow = result.rows.length + 3;
  const last = columnName(result.columns.length - 1);
  const widths = result.columns.map(field => (field.type === "text" ? 32 : field.type === "money" ? 18 : field.type === "date" ? 14 : 20));
  return sheetXml(`${header}${body}<row r="${legendRow}">${textCell(`A${legendRow}`, legend, NOTE)}</row>`, widths, `${last}${legendRow}`, `A1:${last}${result.rows.length + 1}`);
}

function summarySheet(result: ReportResult, config: ReportConfig, legend: string) {
  const groups = result.groups ?? [];
  const groupField = config.groupBy ?? "";
  const lines: string[][] = [];
  const styles: number[][] = [];
  if (result.pivot) {
    const first = config.measures[0];
    lines.push([`${measureLabel(first)} by ${groupLabel(result, groupField)} and ${result.pivot.compare.label}`, ...result.pivot.columns.map(col => col.label), "Total"]);
    styles.push(lines[0].map(() => HEADER));
    groups.forEach((group, index) => {
      lines.push([group.label, ...result.pivot!.cells[index].map(value => formatMeasure(first, value)), formatMeasure(first, group.values[0])]);
      styles.push(lines[lines.length - 1].map(() => TEXT));
    });
    lines.push(["Total", ...result.pivot.columnTotals.map(value => formatMeasure(first, value)), formatMeasure(first, result.totals[0])]);
    styles.push(lines[lines.length - 1].map(() => HEADER));
    lines.push([]);
    styles.push([]);
  }
  lines.push([groupLabel(result, groupField), ...config.measures.map(measureLabel)]);
  styles.push(lines[lines.length - 1].map(() => HEADER));
  for (const group of groups) {
    lines.push([group.label, ...group.values.map((value, index) => formatMeasure(config.measures[index], value))]);
    styles.push(lines[lines.length - 1].map(() => TEXT));
  }
  lines.push(["Total", ...result.totals.map((value, index) => formatMeasure(config.measures[index], value))]);
  styles.push(lines[lines.length - 1].map(() => HEADER));
  lines.push([], [legend]);
  styles.push([], [NOTE]);
  const rowsXml = lines.map((line, r) => `<row r="${r + 1}">${line.map((value, c) => textCell(`${columnName(c)}${r + 1}`, value, styles[r][c])).join("")}</row>`).join("");
  const width = Math.max(...lines.map(line => line.length), 1);
  return sheetXml(rowsXml, Array.from({ length: width }, (_, index) => (index === 0 ? 34 : 18)), `${columnName(width - 1)}${lines.length}`, null);
}

function groupLabel(result: ReportResult, key: string) {
  return FIELD_BY_KEY.get(key)?.label ?? result.columns.find(field => field.key === key)?.label ?? "Group";
}

// Header fill is the design system's table head (cool gray 11) with white bold text.
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="mmm d, yyyy"/><numFmt numFmtId="165" formatCode="&quot;$&quot;#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font><font><i/><sz val="9"/><color rgb="FF898B8E"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF54565B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** The report as an XLSX workbook: a Report sheet of rows, and a Summary sheet when the report groups. */
export function renderReportWorkbook(result: ReportResult, config: ReportConfig, legend: string, today: string): Uint8Array {
  const sheets = [{ name: "Report", xml: detailSheet(result, legend, today) }];
  if (result.groups) sheets.push({ name: "Summary", xml: summarySheet(result, config, legend) });
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(STYLES_XML),
  };
  sheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheet.xml); });
  return zipSync(files, { level: 6 });
}

/** File name from the report name: letters, digits, and hyphens, dated. */
export function reportFilename(name: string, today: string, extension: "xlsx" | "csv") {
  const stem = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "VSA-report";
  return `${stem}-${today}.${extension}`;
}
