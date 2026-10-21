import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applySettingChanges, DEFAULT_OPERATIONAL_SETTINGS, resolveOperationalSettings, SETTING_DEFINITIONS, SETTING_KEYS, settingValues } from "../shared/appSettings";
import { EXPIRY_BAND_DAYS, EXPIRY_BANDS, expiryBandFor, expiryBands, expiryBandTotals, STALE_AFTER_DAYS, staleness } from "../shared/vsaDashboard";
import { stageWarnings, WORK_PLAN_STALE_DAYS } from "../shared/vsaStage";
import { expiryRows } from "../shared/vsaViews";

const TODAY = "2026-10-16";

describe("operational settings", () => {
  it("defaults to the code constants", () => {
    expect(DEFAULT_OPERATIONAL_SETTINGS).toEqual({ staleAfterDays: STALE_AFTER_DAYS, workPlanStaleDays: WORK_PLAN_STALE_DAYS, expiryBandDays: EXPIRY_BAND_DAYS });
    expect(resolveOperationalSettings([])).toEqual({ settings: DEFAULT_OPERATIONAL_SETTINGS, stored: [] });
    // One setting per stage threshold, the work plan, and each dated band; no threshold for In Delivery.
    expect(SETTING_KEYS).toHaveLength(Object.keys(STALE_AFTER_DAYS).length + 1 + 4);
    expect(SETTING_KEYS).not.toContain("stale_after_days.in_delivery");
  });

  it("uses stored values and falls back per key when one is missing or invalid", () => {
    const resolved = resolveOperationalSettings([
      { key: "stale_after_days.intake", value: 10 },
      { key: "work_plan_stale_days", value: "21" },
      { key: "stale_after_days.discovery", value: 0 },
      { key: "stale_after_days.kickoff", value: 2.5 },
      { key: "no_such_setting", value: 5 },
    ]);
    expect(resolved.settings.staleAfterDays.intake).toBe(10);
    expect(resolved.settings.workPlanStaleDays).toBe(WORK_PLAN_STALE_DAYS);
    expect(resolved.settings.staleAfterDays.discovery).toBe(STALE_AFTER_DAYS.discovery);
    expect(resolved.settings.staleAfterDays.kickoff).toBe(STALE_AFTER_DAYS.kickoff);
    expect(resolved.stored).toEqual(["stale_after_days.intake"]);
    // Resolving never changes the defaults it starts from.
    expect(DEFAULT_OPERATIONAL_SETTINGS.staleAfterDays.intake).toBe(7);
  });

  it("falls back on all four expiry bands together when the stored ones are out of order", () => {
    const resolved = resolveOperationalSettings([
      { key: "expiry_band_days.d30", value: 45 },
      { key: "expiry_band_days.d60", value: 40 },
    ]);
    expect(resolved.settings.expiryBandDays).toEqual(EXPIRY_BAND_DAYS);
    expect(resolved.stored).toEqual([]);
  });

  it("validates changes: whole numbers within bounds, known keys, bands in order", () => {
    const apply = (changes: Record<string, unknown>) => applySettingChanges(DEFAULT_OPERATIONAL_SETTINGS, changes);
    expect(apply({ "stale_after_days.intake": 10 })).toEqual({ ok: true, settings: expect.objectContaining({ staleAfterDays: expect.objectContaining({ intake: 10 }) }), changed: { "stale_after_days.intake": 10 } });
    expect(apply({ "stale_after_days.intake": 7 })).toMatchObject({ ok: true, changed: {} });
    expect(apply({ "stale_after_days.intake": 0 })).toEqual({ ok: false, errors: { "stale_after_days.intake": "At least 1" } });
    expect(apply({ "stale_after_days.intake": 366 })).toEqual({ ok: false, errors: { "stale_after_days.intake": "At most 365" } });
    expect(apply({ work_plan_stale_days: 3.5 })).toEqual({ ok: false, errors: { work_plan_stale_days: "Enter a whole number" } });
    expect(apply({ work_plan_stale_days: Number.NaN })).toMatchObject({ ok: false });
    expect(apply({ work_plan_stale_days: "14" })).toMatchObject({ ok: false });
    expect(apply({ "stale_after_days.in_delivery": 30 })).toEqual({ ok: false, errors: { "stale_after_days.in_delivery": "Not a setting" } });
    expect(apply({ "expiry_band_days.d30": 60 })).toEqual({ ok: false, errors: { "expiry_band_days.d60": "Must be more than 60" } });
    expect(apply({ "expiry_band_days.d30": 45, "expiry_band_days.d60": 75 })).toMatchObject({ ok: true });
    // A failed change leaves the current settings untouched.
    expect(DEFAULT_OPERATIONAL_SETTINGS.expiryBandDays.d30).toBe(30);
  });

  it("round-trips through the flat key/value form", () => {
    const values = settingValues(DEFAULT_OPERATIONAL_SETTINGS);
    expect(resolveOperationalSettings(Object.entries(values).map(([key, value]) => ({ key, value }))).settings).toEqual(DEFAULT_OPERATIONAL_SETTINGS);
  });

  it("is seeded by migration with exactly the code defaults", () => {
    const seed = readFileSync(path.join(import.meta.dirname, "../drizzle/0006_seed_app_settings.sql"), "utf8");
    const rows = Array.from(seed.matchAll(/\('([^']+)', CAST\('(\d+)' AS JSON\)\)/g)).map(([, key, value]) => [key, Number(value)]);
    expect(Object.fromEntries(rows)).toEqual(Object.fromEntries(SETTING_DEFINITIONS.map(definition => [definition.key, definition.defaultValue])));
    expect(seed).toMatch(/INSERT IGNORE/);
  });
});

describe("pure functions take the thresholds as input", () => {
  it("staleness uses the given per-stage thresholds", () => {
    const row = { stage: "fcp_draft" as const, stageEnteredOn: "2026-10-01" };
    expect(staleness(row, TODAY)).toEqual({ days: 15, threshold: 21, stale: false });
    expect(staleness(row, TODAY, { ...STALE_AFTER_DAYS, fcp_draft: 10 })).toEqual({ days: 15, threshold: 10, stale: true });
    expect(staleness({ stage: "in_delivery", stageEnteredOn: "2025-01-01" }, TODAY, { ...STALE_AFTER_DAYS, fcp_draft: 1 }).stale).toBe(false);
  });

  it("stageWarnings uses the given work plan threshold", () => {
    const sent = { stage: "customer_approval" as const, segment: "corporate" as const, workPlanSentOn: "2026-10-01" };
    expect(stageWarnings(sent, TODAY)).toContain("Work plan sent 2026-10-01, not accepted after 14 days");
    expect(stageWarnings(sent, TODAY, 20)).not.toContainEqual(expect.stringMatching(/Work plan/));
    expect(stageWarnings(sent, "2026-10-05", 3)).toContain("Work plan sent 2026-10-01, not accepted after 3 days");
  });

  it("expiry bands follow the given limits, with labels to match", () => {
    expect(expiryBands()).toEqual(EXPIRY_BANDS);
    expect(EXPIRY_BANDS.map(band => band.label)).toEqual(["Expired", "0 to 30 days", "31 to 60 days", "61 to 90 days", "91 to 180 days", "Over 180 days", "No expiry date"]);
    const limits = { d30: 14, d60: 45, d90: 120, d180: 365 };
    expect([-1, 14, 15, 45, 46, 120, 365, 366, null].map(days => expiryBandFor(days, limits))).toEqual(["expired", "d30", "d60", "d60", "d90", "d90", "d180", "later", "none"]);
    expect(expiryBands(limits).map(band => band.label)).toEqual(["Expired", "0 to 14 days", "15 to 45 days", "46 to 120 days", "121 to 365 days", "Over 365 days", "No expiry date"]);
    const rows = expiryRows([{ id: 1, customerName: "Acme Health", opportunityNumber: null, stage: "fcp_draft", segment: null, deliveryWindowEnd: "2026-11-05", entitlementValue: "50000.00", entitlementGroupId: null }], TODAY);
    expect(expiryBandTotals(rows).find(band => band.count)?.key).toBe("d30");
    expect(expiryBandTotals(rows, limits).find(band => band.count)?.key).toBe("d60");
  });
});
