/**
 * What changed between two issued FCP versions, in customer-safe terms: hours and dates only, never rates or
 * dollars. Computed at issue and stored on the version; the revision note is the architect's wording, the facts here
 * are not editable. docs/FCP-WORKSPACE.md section 13.5.
 */

export type DateWindow = { start: string; end: string };

export type PackageChange = {
  id: string;
  label: string;
  change: "added" | "removed" | "to-follow-on" | "from-follow-on" | "hours";
  /** CDW hours in the entitlement before and after (follow-on hours are reported apart). */
  hoursBefore: number;
  hoursAfter: number;
};

export type ChangeSummary = {
  /** The issue number this version is compared against; null for the first issue. */
  basedOnIssue: number | null;
  packages: PackageChange[];
  entitlementHours: { before: number; after: number };
  followOnHours: { before: number; after: number };
  windows: Array<{ id: string; label: string; before: DateWindow | null; after: DateWindow | null }>;
  dates: Array<{ key: "plannedStart" | "implementationStart" | "targetComplete" | "termEnd" | "bsasStart" | "bsasEnd"; label: string; before: string | null; after: string | null }>;
  outcomesOn: string[];
  outcomesOff: string[];
  depths: Array<{ area: string; before: string; after: string }>;
  /** Hours delivered since the version compared against, from the consumption entries. */
  consumption: { hours: number; asOf: string } | null;
};
