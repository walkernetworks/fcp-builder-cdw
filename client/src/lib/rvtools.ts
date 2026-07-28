import { unzipSync } from "fflate";
import type { InventorySummary } from "@shared/fcp";
import { emptyInventory } from "@shared/fcp";
import type { HclInventoryEvidence } from "@shared/hcl";

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
const norm = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const key = (value: unknown) => norm(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
const number = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const yes = (value: unknown) => /^(?:true|yes|y|1|enabled|on)$/i.test(norm(value));
const hclBoolean = (value: unknown): "enabled" | "disabled" | "unknown" => {
  const text = norm(value).toLowerCase();
  if (/^(?:true|yes|y|1|enabled|on)$/i.test(text)) return "enabled";
  if (/^(?:false|no|n|0|disabled|off)$/i.test(text)) return "disabled";
  return "unknown";
};

function first(row: Row, names: string[]): Cell {
  for (const name of names) {
    const value = row[key(name)];
    if (value !== undefined && norm(value)) return value;
  }
  return "";
}

function hostMemoryGiB(row: Row): number {
  const mib = number(first(row, ["Memory Total MiB", "Memory MiB", "Memory Size MiB"]));
  if (mib > 0) return Math.round(mib / 102.4) / 10;
  const gib = number(first(row, ["Memory Total GiB", "Memory GiB", "Memory Size GiB", "Memory Total GB", "Memory GB", "Memory Size GB"]));
  if (gib > 0) return Math.round(gib * 10) / 10;
  const generic = number(first(row, ["Memory", "Memory Size", "Memory Total"]));
  if (!generic) return 0;
  return Math.round((generic >= 8192 ? generic / 1024 : generic) * 10) / 10;
}

function speedMb(row: Row): number {
  const raw = norm(first(row, ["Speed Mb", "Speed (Mb/s)", "Link Speed", "Speed"]));
  const parsed = number(raw);
  return /\b(?:gb|gbit|gbps)\b/i.test(raw) ? parsed * 1000 : parsed;
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
  const compactName = key(filename);
  const knownSheet = Object.entries(hclTabAliases).find(([alias]) => compactName.includes(alias))?.[1];
  const sheetName = knownSheet || "vInfo";
  if (headerIndex < 0) return new Map([[sheetName, []]]);
  const headers = rows[headerIndex].map(value => key(value));
  const records = rows.slice(headerIndex + 1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]))).filter(record => Object.values(record).some(value => norm(value)));
  return new Map([[sheetName, records]]);
}

function sheet(sheets: SheetMap, wanted: string): Row[] {
  return Array.from(sheets.entries()).find(([name]) => key(name) === key(wanted))?.[1] || [];
}

function hasSheet(sheets: SheetMap, wanted: string): boolean {
  return Array.from(sheets.keys()).some(name => key(name) === key(wanted));
}

const hclTabAliases: Record<string, string> = {
  vhost: "vhost",
  vnic: "vnic",
  vhba: "vhba",
  vcluster: "vcluster",
  dvswitch: "dvswitch",
  vscvmk: "vscvmk",
  vdatastore: "vdatastore",
  vinfo: "vinfo",
  vnetwork: "vnetwork",
  vsnapshot: "vsnapshot",
  vtools: "vtools",
  vcd: "vcd",
  vusb: "vusb",
};

function hclTabKey(name: string): string {
  return hclTabAliases[key(name)] || key(name);
}

function addRows(target: Map<string, Row>, rows: Row[], identity: (row: Row, index: number) => string): void {
  rows.forEach((row, index) => {
    const id = identity(row, index).trim().toLowerCase();
    if (id) target.set(id, row);
  });
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
  const nicRows = new Map<string, Row>();
  const hbaRows = new Map<string, Row>();
  const clusterRows = new Map<string, Row>();
  const distributedSwitchRows = new Map<string, Row>();
  const vmkernelRows = new Map<string, Row>();
  const networkRows = new Map<string, Row>();
  const toolsRows = new Map<string, Row>();
  const cdRows = new Map<string, Row>();
  const usbRows = new Map<string, Row>();
  const hclTabs: Record<string, boolean> = {};

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) throw new Error(`${file.name}: only .xlsx and .csv files are accepted.`);
    const sheets = lower.endsWith(".xlsx") ? parseXlsx(await file.arrayBuffer()) : parseCsv(await file.text(), file.name);
    const sheetNames = Array.from(sheets.keys());
    Object.keys(hclTabAliases).forEach(tab => { if (hasSheet(sheets, tab)) hclTabs[hclTabKey(tab)] = true; });
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
    addRows(nicRows, sheet(sheets, "vNIC"), (row, index) => [first(row, ["Host", "Host Name", "ESX Host"]), first(row, ["Network Device", "Device", "Name"]), first(row, ["Driver", "Driver Name"]), index].map(norm).join("|"));
    addRows(hbaRows, sheet(sheets, "vHBA"), (row, index) => [first(row, ["Host", "Host Name", "ESX Host"]), first(row, ["Device", "HBA", "Name"]), first(row, ["Driver", "Driver Name"]), index].map(norm).join("|"));
    addRows(clusterRows, sheet(sheets, "vCluster"), (row, index) => norm(first(row, ["Name", "Cluster", "Cluster Name"])) || `cluster-${index}`);
    addRows(distributedSwitchRows, sheet(sheets, "dvSwitch"), (row, index) => norm(first(row, ["Switch", "Name", "Distributed Switch"])) || `dvs-${index}`);
    addRows(vmkernelRows, sheet(sheets, "vSC+VMK"), (row, index) => [first(row, ["Host", "Host Name", "ESX Host"]), first(row, ["Device", "VMkernel", "Name"]), index].map(norm).join("|"));
    addRows(networkRows, sheet(sheets, "vNetwork"), (row, index) => [first(row, ["VM", "VM Name", "Name"]), first(row, ["Adapter", "Adapter Type", "Type"]), index].map(norm).join("|"));
    addRows(toolsRows, sheet(sheets, "vTools"), (row, index) => norm(first(row, ["VM", "VM Name", "Name"])) || `tools-${index}`);
    addRows(cdRows, sheet(sheets, "vCD"), (row, index) => [first(row, ["VM", "VM Name", "Name"]), first(row, ["Device", "CD/DVD", "CDROM"]), index].map(norm).join("|"));
    addRows(usbRows, sheet(sheets, "vUSB"), (row, index) => [first(row, ["VM", "VM Name", "Name"]), first(row, ["Device", "USB Device"]), index].map(norm).join("|"));
  }

  const summary = emptyInventory();
  summary.sourceCount = sources.length;
  summary.hosts = hostRows.size;
  summary.vmCount = vmRows.size;
  summary.datastoreCount = datastoreRows.size;
  summary.snapshotCount = snapshotRows.size;

  const datacenters = new Set<string>();
  const clusters = new Set<string>();
  const clusterProfiles = new Map<string, number>();
  const versions = new Map<string, number>();
  const models = new Map<string, { vendor: string; model: string; cpuModel: string; hosts: number; physicalCores: number; esxiVersions: Map<string, number>; clusterMembership: Map<string, number>; memoryGiB: number[] }>();
  for (const row of Array.from(hostRows.values())) {
    const datacenter = norm(first(row, ["Datacenter"])); if (datacenter) datacenters.add(datacenter);
    const cluster = norm(first(row, ["Cluster"]));
    const clusterKey = cluster ? `${datacenter}|${cluster}` : "";
    const clusterName = cluster ? (datacenter ? `${datacenter} / ${cluster}` : cluster) : "";
    if (clusterKey) clusters.add(clusterKey);
    if (clusterName) clusterProfiles.set(clusterName, (clusterProfiles.get(clusterName) || 0) + 1);
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
    const existing = models.get(modelKey) || { vendor, model, cpuModel, hosts: 0, physicalCores: 0, esxiVersions: new Map<string, number>(), clusterMembership: new Map<string, number>(), memoryGiB: [] };
    existing.hosts += 1;
    existing.physicalCores += Math.max(0, cores);
    existing.esxiVersions.set(version, (existing.esxiVersions.get(version) || 0) + 1);
    if (clusterName) existing.clusterMembership.set(clusterName, (existing.clusterMembership.get(clusterName) || 0) + 1);
    const memoryGiB = hostMemoryGiB(row); if (memoryGiB > 0) existing.memoryGiB.push(memoryGiB);
    models.set(modelKey, existing);
  }
  summary.datacenters = datacenters.size;
  summary.clusters = clusters.size;
  summary.clusterProfiles = Array.from(clusterProfiles.entries()).map(([name, hosts]) => ({ name, hosts })).sort((a, b) => b.hosts - a.hosts || a.name.localeCompare(b.name));
  summary.esxiVersions = Array.from(versions.entries()).map(([version, hosts]) => ({ version, hosts })).sort((a, b) => b.hosts - a.hosts);
  summary.hostModels = Array.from(models.values()).map(model => {
    const observedMemory = model.memoryGiB.filter(value => value > 0);
    return {
      vendor: model.vendor,
      model: model.model,
      cpuModel: model.cpuModel,
      hosts: model.hosts,
      physicalCores: model.physicalCores,
      esxiVersions: Array.from(model.esxiVersions.entries()).map(([version, hosts]) => ({ version, hosts })).sort((a, b) => b.hosts - a.hosts),
      esxiCorrelation: "per-platform" as const,
      clusterMembership: Array.from(model.clusterMembership.entries()).map(([name, hosts]) => ({ name, hosts })).sort((a, b) => b.hosts - a.hosts || a.name.localeCompare(b.name)),
      minimumMemoryGiB: observedMemory.length ? Math.min(...observedMemory) : 0,
      maximumMemoryGiB: observedMemory.length ? Math.max(...observedMemory) : 0,
    };
  }).sort((a, b) => b.hosts - a.hosts);

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

  const evidenceHosts: HclInventoryEvidence["hosts"] = Array.from(hostRows.values()).map(row => {
    const datacenter = norm(first(row, ["Datacenter"]));
    const cluster = norm(first(row, ["Cluster"]));
    const totalCores = Math.round(number(first(row, ["# Cores", "Cores", "NumCpuCores"])));
    const socketCount = Math.round(number(first(row, ["# CPU", "CPU Packages", "Sockets", "NumCpuPackages"])));
    const coresPerSocket = Math.round(number(first(row, ["Cores per CPU", "Cores per Socket", "# Cores per CPU"]))) || (socketCount > 0 ? Math.round(totalCores / socketCount) : 0);
    return {
      name: norm(first(row, ["Host", "Host Name", "Name"])),
      cluster: cluster ? (datacenter ? `${datacenter} / ${cluster}` : cluster) : "",
      vendor: norm(first(row, ["Vendor"])),
      model: norm(first(row, ["Model"])),
      cpuModel: norm(first(row, ["CPU Model"])),
      esxiVersion: norm(first(row, ["ESX Version", "ESXi Version", "Version"])),
      socketCount: Math.max(0, socketCount),
      coresPerSocket: Math.max(0, coresPerSocket),
      biosVersion: norm(first(row, ["BIOS Version", "Bios Version"])),
      biosDate: norm(first(row, ["BIOS Date", "Bios Date", "BIOS Release Date"])),
    };
  });
  const hostCluster = new Map(evidenceHosts.filter(host => host.name).map(host => [host.name.toLowerCase(), host.cluster]));
  const hostClusterFor = (name: string) => hostCluster.get(name.toLowerCase()) || "";
  const evidence: HclInventoryEvidence = {
    tabs: hclTabs,
    hosts: evidenceHosts,
    nics: Array.from(nicRows.values()).map(row => {
      const host = norm(first(row, ["Host", "Host Name", "ESX Host"]));
      return {
        host,
        cluster: hostClusterFor(host),
        device: norm(first(row, ["Network Device", "Device", "Name"])),
        driver: norm(first(row, ["Driver", "Driver Name"])),
        speedMb: Math.max(0, speedMb(row)),
        switchName: norm(first(row, ["Switch", "Switch Name", "vSwitch", "Distributed Switch"])),
      };
    }),
    hbas: Array.from(hbaRows.values()).map(row => {
      const host = norm(first(row, ["Host", "Host Name", "ESX Host"]));
      return {
        host,
        cluster: hostClusterFor(host),
        device: norm(first(row, ["Device", "HBA", "Name"])),
        model: norm(first(row, ["Model", "Adapter Model"])),
        driver: norm(first(row, ["Driver", "Driver Name"])),
      };
    }),
    clusters: Array.from(clusterRows.values()).map(row => ({
      name: norm(first(row, ["Name", "Cluster", "Cluster Name"])),
      ha: hclBoolean(first(row, ["HAInfo", "HA Info", "HA"])),
      drs: hclBoolean(first(row, ["DRSInfo", "DRS Info", "DRS"])),
      evcMode: norm(first(row, ["CurrentEVCModeKey", "Current EVC Mode Key", "EVC Mode", "EVC"])),
      vsan: hclBoolean(first(row, ["VsanEnabled", "vSAN Enabled", "vSAN"])),
    })),
    distributedSwitches: Array.from(distributedSwitchRows.values()).map(row => ({
      name: norm(first(row, ["Switch", "Name", "Distributed Switch"])),
      version: norm(first(row, ["Version", "vDS Version"])),
      maxMtu: Math.max(0, Math.round(number(first(row, ["Max MTU", "Maximum MTU", "MTU"])))),
    })),
    vmkernels: Array.from(vmkernelRows.values()).map(row => {
      const host = norm(first(row, ["Host", "Host Name", "ESX Host"]));
      const traffic = norm(first(row, ["vSAN", "vSAN Traffic", "Traffic Type", "Services"]));
      return {
        host,
        cluster: hostClusterFor(host),
        device: norm(first(row, ["Device", "VMkernel", "Name"])),
        mtu: Math.max(0, Math.round(number(first(row, ["MTU", "MTU Size"])))),
        portGroup: norm(first(row, ["Portgroup", "Port Group", "Network Label"])),
        vsan: /vsan/i.test(traffic) || yes(first(row, ["vSAN", "vSAN Traffic"])) ? "enabled" : traffic ? "disabled" : "unknown",
      };
    }),
    datastores: Array.from(datastoreRows.values()).map(row => {
      const capacityMiB = Math.max(0, number(first(row, ["Capacity MiB", "Capacity"])));
      const freeMiB = Math.max(0, number(first(row, ["Free MiB", "Free Space MiB", "Free Space", "Free"])));
      const rawFreePct = number(first(row, ["Free %", "Free Space %", "Free Percent"]));
      return {
        name: norm(first(row, ["Name", "Datastore"])),
        type: norm(first(row, ["Type", "Datastore Type"])),
        version: norm(first(row, ["Version", "VMFS Version"])),
        capacityMiB,
        freeMiB,
        freePct: rawFreePct > 0 ? rawFreePct : capacityMiB > 0 ? Math.round(freeMiB / capacityMiB * 1000) / 10 : null,
      };
    }),
    vmInfo: Array.from(vmRows.values()).map(row => ({
      vm: norm(first(row, ["VM", "VM Name", "Name"])),
      guestOs: norm(first(row, ["OS according to the configuration file", "OS", "Guest OS"])),
      hardwareVersion: norm(first(row, ["HW Version", "Hardware Version", "Version"])),
    })),
    vmNetworks: Array.from(networkRows.values()).map(row => ({
      vm: norm(first(row, ["VM", "VM Name", "Name"])),
      adapter: norm(first(row, ["Adapter", "Adapter Type", "Type"])),
    })),
    snapshots: Array.from(snapshotRows.values()).map(row => ({
      vm: norm(first(row, ["VM", "VM Name", "Name"])),
      date: norm(first(row, ["Date", "Created", "Snapshot Date"])),
    })),
    tools: Array.from(toolsRows.values()).map(row => ({
      vm: norm(first(row, ["VM", "VM Name", "Name"])),
      status: norm(first(row, ["Tools Status", "Tools", "Status"])),
    })),
    cdDevices: Array.from(cdRows.values()).map(row => ({
      vm: norm(first(row, ["VM", "VM Name", "Name"])),
      connected: hclBoolean(first(row, ["Connected", "Is Connected", "Connect At Power On"])),
    })),
    usbDevices: Array.from(usbRows.values()).map(row => ({
      vm: norm(first(row, ["VM", "VM Name", "Name"])),
      connected: hclBoolean(first(row, ["Connected", "Is Connected", "Connect At Power On"])),
    })),
  };
  summary.hclEvidence = evidence;
  return { sources, summary };
}
