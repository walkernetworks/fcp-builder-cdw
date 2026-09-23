import { readFileSync } from "node:fs";
import path from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { assessBuildingBlocks, normalizeBlockArea, type BuildingBlockAssessment } from "../shared/buildingBlocks";
import type { EngagementDocument } from "../shared/fcp";

export const BUILDING_BLOCKS_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TEMPLATE_FILE = "building-blocks-template.xlsx";
const FULL_VERSION_SHEET = "Full Version";
const PROJECTED_DATES_HEADER = "Projected Dates";
const PROJECTED_DATES_COLUMN = "L";
const PROJECTED_DATES_WIDTH = 30;

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

function columnIndex(column: string): number {
  return Array.from(column).reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
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

function styleOf(cell: Cell | undefined): string {
  return cell?.attributes.match(/\ss="(\d+)"/)?.[1] ?? "";
}

function inlineStringCell(ref: string, style: string, value: string): string {
  const styleAttribute = style ? ` s="${style}"` : "";
  return value ? `<c r="${ref}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>` : `<c r="${ref}"${styleAttribute}/>`;
}

function cellText(cell: Cell | undefined, sharedStrings: string[]): string {
  if (!cell?.body) return "";
  if (/\st="s"/.test(cell.attributes)) return sharedStrings[Number(cell.body.match(/<v>(\d+)<\/v>/)?.[1])] ?? "";
  if (/\st="inlineStr"/.test(cell.attributes)) return textRuns(cell.body);
  return unescapeXml(cell.body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
}

function rewriteFullVersion(sheetXml: string, sharedStrings: string[], assessments: BuildingBlockAssessment[]): { xml: string; filledAreas: Set<string> } {
  const byArea = new Map(assessments.map(item => [normalizeBlockArea(item.area), item]));
  const filledAreas = new Set<string>();

  let xml = sheetXml.replace(/<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g, (_row, rowNumber: string, rowAttributes: string, content: string) => {
    const cells = new Map(parseCells(content).map(cell => [cell.column, cell]));
    const rendered = new Map(Array.from(cells, ([column, cell]) => [column, cell.body === null ? `<c r="${column}${rowNumber}"${cell.attributes}/>` : `<c r="${column}${rowNumber}"${cell.attributes}>${cell.body}</c>`]));

    if (rowNumber === "1") {
      rendered.set(PROJECTED_DATES_COLUMN, inlineStringCell(`${PROJECTED_DATES_COLUMN}1`, styleOf(cells.get("J")), PROJECTED_DATES_HEADER));
    } else {
      const assessment = byArea.get(normalizeBlockArea(cellText(cells.get("C"), sharedStrings)));
      if (assessment) {
        filledAreas.add(assessment.area);
        rendered.set("D", inlineStringCell(`D${rowNumber}`, styleOf(cells.get("D")), assessment.rating));
        rendered.set("E", inlineStringCell(`E${rowNumber}`, styleOf(cells.get("E")), assessment.deliverable));
        rendered.set(PROJECTED_DATES_COLUMN, inlineStringCell(`${PROJECTED_DATES_COLUMN}${rowNumber}`, styleOf(cells.get("J")), assessment.projectedDates));
      } else if (cells.size) {
        // Separator rows carry a fill; extend it across the new column.
        rendered.set(PROJECTED_DATES_COLUMN, inlineStringCell(`${PROJECTED_DATES_COLUMN}${rowNumber}`, styleOf(cells.get("K")), ""));
      }
    }

    const ordered = Array.from(rendered).sort(([left], [right]) => columnIndex(left) - columnIndex(right)).map(([, cell]) => cell).join("");
    const attributes = rowAttributes.replace(/\sspans="(\d+):(\d+)"/, (_match, first: string, last: string) => ` spans="${first}:${Math.max(Number(last), columnIndex(PROJECTED_DATES_COLUMN))}"`);
    return `<row r="${rowNumber}"${attributes}>${ordered}</row>`;
  });

  xml = xml
    .replace(/<dimension ref="([A-Z]+\d+):[A-Z]+(\d+)"/, `<dimension ref="$1:${PROJECTED_DATES_COLUMN}$2"`)
    .replace(/<autoFilter ref="([A-Z]+\d+):[A-Z]+(\d+)"/, `<autoFilter ref="$1:${PROJECTED_DATES_COLUMN}$2"`)
    .replace(/<\/cols>/, `<col min="${columnIndex(PROJECTED_DATES_COLUMN)}" max="${columnIndex(PROJECTED_DATES_COLUMN)}" width="${PROJECTED_DATES_WIDTH}" customWidth="1"/></cols>`);
  return { xml, filledAreas };
}

/**
 * Produces the Building Blocks workbook for an engagement: the Full Version tab gets the
 * FCP-derived Capability Rating (D), Customer Deliverables status (E), and a Projected Dates column.
 * Every other tab is copied from the template unchanged.
 */
export function renderBuildingBlocksWorkbook(document: EngagementDocument, today?: string): Uint8Array {
  const files = unzipSync(loadTemplate());
  const sheetPath = fullVersionSheetPath(files);
  const sharedStrings = files["xl/sharedStrings.xml"] ? Array.from(strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g), match => textRuns(match[1])) : [];
  const assessments = assessBuildingBlocks(document, today);
  const { xml, filledAreas } = rewriteFullVersion(strFromU8(files[sheetPath]), sharedStrings, assessments);

  const missing = assessments.filter(item => !filledAreas.has(item.area)).map(item => item.area);
  if (missing.length) throw new Error(`The Building Blocks template is missing assessment areas: ${missing.join(", ")}`);

  files[sheetPath] = strToU8(xml);
  return zipSync(files, { level: 6 });
}

export function buildingBlocksFilename(title: string): string {
  const stem = title.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "FCP";
  return `${stem}-Building-Blocks.xlsx`;
}
