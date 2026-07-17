import { unzipSync } from "fflate";
import type { InventorySummary } from "@shared/fcp";
import { emptyInventory } from "@shared/fcp";

type Cell = string | number | boolean;
type Row = Record<string, Cell>;
type SheetMap = Map<string, Row[]>;

type SourceResult = {
  id: string;
  filename: string;
  byteSize: number;
  sheets: string[];
  importedAt: string;
  warnings: string[];
};

export type RvToolsImportResult = {
  sources: SourceResult[];
  summary: InventorySummary;
};

const textDecoder = new TextDecoder("utf-8");
const norm = (value: unknown) => String(value ?? "").trim();
const key = (value: unknown) => norm(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
const number = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const yes = (value: unknown) => /^(?:true|yes|y|1)$/i.test(norm(value));

function first(row: Row, names: string[]): Cell {
  for (const name of names) {
    const value = row[key(name)];
    if (value !== undefined && norm(value)) return value;
  }
  return "";
}

function xml(data: Uint8Array): Document {
  const document = new DOMParser().parseFromString(textDecoder.decode(data), "application/xml");
  if (document.querySelector("parsererror")) throw new Error("The XLSX package contains invalid XML.");
  return document;
}

function cellText(cell: Element, sharedStrings: string[]): Cell {
  const type = cell.getAttribute("t") || "";
  if (type === "inlineStr") return Array.from(cell.querySelectorAll("is t")).map(node => node.textContent || "").join("");
  const raw = cell.querySelector("v")?.textContent || "";
  if (type === "s") return sharedStrings[Number(raw)] ?? "";
  if (type === "b") return raw === "1";
  if (type === "str") return raw;
  const parsed = Number(raw);
  return raw !== "" && Number.isFinite(parsed) ? parsed : raw;
}

function columnIndex(reference: string): number {
  const letters = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase() || "A";
  return Array.from(letters).reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseSheet(data: Uint8Array, sharedStrings: string[]): Row[] {
  const document = xml(data);
  const rawRows = Array.from(document.querySelectorAll("sheetData row")).map(row => {
    const cells: Cell[] = [];
    for (const cell of Array.from(row.querySelectorAll(":scope > c"))) cells[columnIndex(cell.getAttribute("r") || "A1")] = cellText(cell, sharedStrings);
    return cells;
  });
  const headerIndex = rawRows.findIndex(row => row.filter(value => norm(value)).length >= 2);
  if (headerIndex < 0) return [];
  const headers = rawRows[headerIndex].map(value => key(value));
  return rawRows.slice(headerIndex + 1).filter(row => row.some(value => norm(value))).map(values => {
    const record: Row = {};
    headers.forEach((header, index) => { if (header) record[header] = values[index] ?? ""; });
    return record;
  });
}

function parseXlsx(buffer: ArrayBuffer): SheetMap {
  const entries = unzipSync(new Uint8Array(buffer));
  const workbook = entries["xl/workbook.xml"];
  const relationships = entries["xl/_rels/workbook.xml.rels"];
  if (!workbook || !relationships) throw new Error("This file is not a valid RVTools XLSX workbook.");

  const sharedDocument = entries["xl/sharedStrings.xml"] ? xml(entries["xl/sharedStrings.xml"]) : null;
  const sharedStrings = sharedDocument ? Array.from(sharedDocument.querySelectorAll("si")).map(item => Array.from(item.querySelectorAll("t")).map(node => node.textContent || "").join("")) : [];
  const relMap = new Map(Array.from(xml(relationships).querySelectorAll("Relationship")).map(rel => [rel.getAttribute("Id") || "", rel.getAttribute("Target") || ""]));
  const result: SheetMap = new Map();
  for (const sheet of Array.from(xml(workbook).querySelectorAll("sheet"))) {
    const name = sheet.getAttribute("name") || "Sheet";
    const relationId = sheet.getAttribute("r:id") || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || "";
    const target = relMap.get(relationId);
    if (!target) continue;
    const normalizedTarget = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const data = entries[normalizedTarget];
    if (data) result.set(name, parseSheet(data, sharedStrings));
  }
  return result;
}

function parseCsv(text: string, filename: string): SheetMap {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); if (row.some(item => item.trim())) rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headerIndex = rows.findIndex(values => values.filter(value => value.trim()).length >= 2);
  const sheetName = filename.match(/v(?:info|host|datastore|snapshot|partition|memory|disk|network)/i)?.[0] || "vInfo";
  if (headerIndex < 0) return new Map([[sheetName, []]]);
  const headers = rows[headerIndex].map(value => key(value));
  const records = rows.slice(headerIndex + 1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]))).filter(record => Object.values(record).some(value => norm(value)));
  return new Map([[sheetName, records]]);
}

function sheet(sheets: SheetMap, wanted: string): Row[] {
  return Array.from(sheets.entries()).find(([name]) => key(name) === key(wanted))?.[1] || [];
}

export async function parseRvToolsFiles(files: File[]): Promise<RvToolsImportResult> {
  if (!files.length) throw new Error("Select one or more RVTools XLSX or CSV exports.");
  if (files.length > 20) throw new Error("Import up to 20 exports at a time.");
  if (files.some(file => file.size > 30 * 1024 * 1024)) throw new Error("Each export must be 30 MB or smaller.");

  const sources: SourceResult[] = [];
  const hostRows = new Map<string, Row>();
  const vmRows = new Map<string, Row>();
  const datastoreRows = new Map<string, Row>();
  const snapshotRows = new Map<string, Row>();

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) throw new Error(`${file.name}: only .xlsx and .csv files are accepted.`);
    const sheets = lower.endsWith(".xlsx") ? parseXlsx(await file.arrayBuffer()) : parseCsv(await file.text(), file.name);
    const sheetNames = Array.from(sheets.keys());
    const warnings: string[] = [];
    if (!sheet(sheets, "vHost").length) warnings.push("vHost data missing; host and core totals may be incomplete.");
    if (!sheet(sheets, "vInfo").length) warnings.push("vInfo data missing; VM totals may be incomplete.");
    if (!sheet(sheets, "vDatastore").length) warnings.push("vDatastore data missing; storage totals may be incomplete.");
    sources.push({ id: crypto.randomUUID(), filename: file.name, byteSize: file.size, sheets: sheetNames, importedAt: new Date().toISOString(), warnings });

    for (const row of sheet(sheets, "vHost")) {
      const identity = norm(first(row, ["UUID", "Object ID"])) || [first(row, ["Datacenter"]), first(row, ["Cluster"]), first(row, ["Host"])].map(norm).join("|");
      if (identity) hostRows.set(identity.toLowerCase(), row);
    }
    for (const row of sheet(sheets, "vInfo")) {
      const identity = norm(first(row, ["VM UUID", "UUID", "Object ID"])) || [first(row, ["Datacenter"]), first(row, ["Cluster"]), first(row, ["VM"])].map(norm).join("|");
      if (identity) vmRows.set(identity.toLowerCase(), row);
    }
    for (const row of sheet(sheets, "vDatastore")) {
      const identity = norm(first(row, ["Object ID", "UUID"])) || [first(row, ["Datacenter"]), first(row, ["Name"])].map(norm).join("|");
      if (identity) datastoreRows.set(identity.toLowerCase(), row);
    }
    for (const row of sheet(sheets, "vSnapshot")) {
      const identity = [first(row, ["VM UUID", "VM"]), first(row, ["Name", "Snapshot"]), first(row, ["Date", "Created"])].map(norm).join("|");
      if (identity) snapshotRows.set(identity.toLowerCase(), row);
    }
  }

  const summary = emptyInventory();
  summary.sourceCount = sources.length;
  summary.hosts = hostRows.size;
  summary.vmCount = vmRows.size;
  summary.datastoreCount = datastoreRows.size;
  summary.snapshotCount = snapshotRows.size;

  const datacenters = new Set<string>();
  const clusters = new Set<string>();
  const versions = new Map<string, number>();
  const models = new Map<string, { vendor: string; model: string; cpuModel: string; hosts: number; physicalCores: number; esxiVersions: Map<string, number> }>();
  for (const row of Array.from(hostRows.values())) {
    const datacenter = norm(first(row, ["Datacenter"])); if (datacenter) datacenters.add(datacenter);
    const cluster = norm(first(row, ["Cluster"])); if (cluster) clusters.add(`${datacenter}|${cluster}`);
    const cores = Math.round(number(first(row, ["# Cores", "Cores", "NumCpuCores"])));
    summary.physicalCores += Math.max(0, cores);
    const cpuUsage = number(first(row, ["CPU usage %", "CPU usage", "CPU %"])); if (cpuUsage >= 80) summary.highCpuHosts += 1;
    const memoryUsage = number(first(row, ["Memory usage %", "Memory usage", "Memory %"])); if (memoryUsage >= 80) summary.highMemoryHosts += 1;
    if (yes(first(row, ["in Maintenance Mode", "Maintenance Mode"]))) summary.maintenanceHosts += 1;
    const configStatus = norm(first(row, ["Config status", "Connection State", "State"])); if (/disconnect|notrespond|red/i.test(configStatus)) summary.disconnectedHosts += 1;
    const version = norm(first(row, ["ESX Version", "ESXi Version", "Version"])) || "Unknown"; versions.set(version, (versions.get(version) || 0) + 1);
    const vendor = norm(first(row, ["Vendor"])) || "Unknown vendor";
    const model = norm(first(row, ["Model"])) || "Unknown model";
    const cpuModel = norm(first(row, ["CPU Model"])) || "Unknown CPU";
    const modelKey = `${vendor}|${model}|${cpuModel}`;
    const existing = models.get(modelKey) || { vendor, model, cpuModel, hosts: 0, physicalCores: 0, esxiVersions: new Map<string, number>() };
    existing.hosts += 1;
    existing.physicalCores += Math.max(0, cores);
    existing.esxiVersions.set(version, (existing.esxiVersions.get(version) || 0) + 1);
    models.set(modelKey, existing);
  }
  summary.datacenters = datacenters.size;
  summary.clusters = clusters.size;
  summary.esxiVersions = Array.from(versions.entries()).map(([version, hosts]) => ({ version, hosts })).sort((a, b) => b.hosts - a.hosts);
  summary.hostModels = Array.from(models.values()).map(model => ({
    vendor: model.vendor,
    model: model.model,
    cpuModel: model.cpuModel,
    hosts: model.hosts,
    physicalCores: model.physicalCores,
    esxiVersions: Array.from(model.esxiVersions.entries()).map(([version, hosts]) => ({ version, hosts })).sort((a, b) => b.hosts - a.hosts),
    esxiCorrelation: "per-platform" as const,
  })).sort((a, b) => b.hosts - a.hosts);

  const operatingSystems = new Map<string, number>();
  for (const row of Array.from(vmRows.values())) {
    const power = norm(first(row, ["Powerstate", "Power State"]));
    if (/poweredon|on/i.test(power)) summary.poweredOnVms += 1; else summary.poweredOffVms += 1;
    summary.vCpu += Math.max(0, Math.round(number(first(row, ["CPUs", "vCPU", "NumCpu"]))));
    const memoryMiB = number(first(row, ["Memory", "Memory MiB", "Memory Size MiB"])); summary.vmMemoryGiB += memoryMiB / 1024;
    const operatingSystem = norm(first(row, ["OS according to the configuration file", "OS", "Guest OS"])) || "Unknown";
    operatingSystems.set(operatingSystem, (operatingSystems.get(operatingSystem) || 0) + 1);
  }
  summary.vmMemoryGiB = Math.round(summary.vmMemoryGiB * 10) / 10;
  summary.guestOperatingSystems = Array.from(operatingSystems.entries()).map(([name, vms]) => ({ name, vms })).sort((a, b) => b.vms - a.vms).slice(0, 15);

  for (const row of Array.from(datastoreRows.values())) {
    const capacityMiB = number(first(row, ["Capacity MiB", "Capacity"]));
    const usedMiB = number(first(row, ["In Use MiB", "Used MiB", "In Use"]));
    const provisionedMiB = number(first(row, ["Provisioned MiB", "Provisioned"]));
    summary.datastoreCapacityTiB += capacityMiB / 1024 / 1024;
    summary.datastoreUsedTiB += usedMiB / 1024 / 1024;
    if (capacityMiB > 0 && provisionedMiB / capacityMiB >= 1.5) summary.overcommittedDatastores += 1;
  }
  summary.datastoreCapacityTiB = Math.round(summary.datastoreCapacityTiB * 10) / 10;
  summary.datastoreUsedTiB = Math.round(summary.datastoreUsedTiB * 10) / 10;
  return { sources, summary };
}
