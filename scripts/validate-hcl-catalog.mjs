import { HCL_SERVER_CATALOG, HCL_SNAPSHOT } from "../shared/hclCatalog.ts";

const errors = [];
const duplicateKeys = new Map();
const vendors = new Set();
const releaseCounts = { "ESXi 9.0": 0, "ESXi 9.1": 0 };

for (const [index, row] of HCL_SERVER_CATALOG.entries()) {
  const [vendor, model, cpuSeries, releaseMask, confirmationMask, productId] = row;
  if (![vendor, model, cpuSeries].every(value => typeof value === "string" && value.trim())) errors.push(`Row ${index + 1} has incomplete vendor, model, or CPU identity.`);
  if (!Number.isInteger(productId) || productId <= 0) errors.push(`Row ${index + 1} has an invalid product ID.`);
  if (!Number.isInteger(releaseMask) || releaseMask < 1 || releaseMask > 3) errors.push(`Row ${index + 1} has an invalid release mask ${releaseMask}.`);
  if (!Number.isInteger(confirmationMask) || confirmationMask < 0 || confirmationMask > 3) errors.push(`Row ${index + 1} has an invalid confirmation mask ${confirmationMask}.`);
  vendors.add(vendor);
  if ((releaseMask & 1) !== 0) releaseCounts["ESXi 9.0"] += 1;
  if ((releaseMask & 2) !== 0) releaseCounts["ESXi 9.1"] += 1;
  const key = [vendor, model, cpuSeries, releaseMask, confirmationMask, productId].join("|").toLowerCase();
  duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1);
}

for (const [key, count] of duplicateKeys) if (count > 1) errors.push(`Duplicate catalog row (${count} copies): ${key}`);
if (HCL_SERVER_CATALOG.length !== HCL_SNAPSHOT.reportedCount) errors.push(`Catalog length ${HCL_SERVER_CATALOG.length} does not match reported count ${HCL_SNAPSHOT.reportedCount}.`);
if (!HCL_SNAPSHOT.source.startsWith("https://compatibilityguide.broadcom.com/")) errors.push("Snapshot source is not the Broadcom Compatibility Guide.");
if (!Number.isFinite(Date.parse(HCL_SNAPSHOT.capturedAt))) errors.push("Snapshot capture time is invalid.");
if (!releaseCounts["ESXi 9.0"] || !releaseCounts["ESXi 9.1"]) errors.push("Catalog must contain records for both maintained release masks.");

const summary = {
  catalogRows: HCL_SERVER_CATALOG.length,
  manufacturers: vendors.size,
  capturedAt: HCL_SNAPSHOT.capturedAt,
  source: HCL_SNAPSHOT.source,
  releaseCounts,
  errors,
};

console.log(JSON.stringify(summary, null, 2));
if (errors.length) process.exitCode = 1;
