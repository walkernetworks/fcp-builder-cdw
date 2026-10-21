/**
 * Operational settings an admin can change in the app (the `app_settings` table). Pure: no database or React imports.
 *
 * Each setting has a code default: the constants in shared/vsaStage.ts and shared/vsaDashboard.ts. A stored value
 * overrides it; a missing or invalid stored value falls back to it, so the app behaves as before when the table is
 * empty or absent. The pure functions (staleness, stageWarnings, expiryBandFor) take the resolved numbers as input.
 */
import { z } from "zod";
import { EXPIRY_BAND_DAYS, STALE_AFTER_DAYS, type ExpiryBandDays } from "./vsaDashboard";
import { STAGE_LABELS, WORK_PLAN_STALE_DAYS, type Stage } from "./vsaStage";

export type OperationalSettings = {
  staleAfterDays: Partial<Record<Stage, number>>;
  workPlanStaleDays: number;
  expiryBandDays: ExpiryBandDays;
};

export const DEFAULT_OPERATIONAL_SETTINGS: OperationalSettings = {
  staleAfterDays: { ...STALE_AFTER_DAYS },
  workPlanStaleDays: WORK_PLAN_STALE_DAYS,
  expiryBandDays: { ...EXPIRY_BAND_DAYS },
};

/** Values are JSON in the table. Every setting today is a whole number of days. */
export type AppSettingValue = number;

export type SettingGroup = "stale" | "work_plan" | "expiry";
export const SETTING_GROUPS: { id: SettingGroup; label: string; description: string }[] = [
  { id: "stale", label: "Stale stage thresholds", description: "Days a record may sit in a stage before it counts as stale. In Delivery has no threshold." },
  { id: "work_plan", label: "Work plan follow-up", description: "Days after a work plan is sent, without acceptance, before the record shows a warning." },
  { id: "expiry", label: "Expiry bands", description: "Upper bound, in days left, of each expiry band. Each band must end after the one before." },
];

export type SettingDefinition = {
  key: string;
  group: SettingGroup;
  label: string;
  min: number;
  max: number;
  defaultValue: number;
  read: (settings: OperationalSettings) => number;
  write: (settings: OperationalSettings, value: number) => void;
};

const STALE_STAGES = Object.keys(STALE_AFTER_DAYS) as Stage[];
const BAND_KEYS = Object.keys(EXPIRY_BAND_DAYS) as (keyof ExpiryBandDays)[];
const BAND_LABELS: Record<keyof ExpiryBandDays, string> = { d30: "First band (stop) ends at", d60: "Second band (warn) ends at", d90: "Third band (warn) ends at", d180: "Fourth band ends at" };

export const SETTING_DEFINITIONS: SettingDefinition[] = [
  ...STALE_STAGES.map(stage => ({
    key: `stale_after_days.${stage}`,
    group: "stale" as const,
    label: STAGE_LABELS[stage],
    min: 1,
    max: 365,
    defaultValue: STALE_AFTER_DAYS[stage]!,
    read: (settings: OperationalSettings) => settings.staleAfterDays[stage] ?? STALE_AFTER_DAYS[stage]!,
    write: (settings: OperationalSettings, value: number) => void (settings.staleAfterDays[stage] = value),
  })),
  {
    key: "work_plan_stale_days",
    group: "work_plan",
    label: "Warn after",
    min: 1,
    max: 180,
    defaultValue: WORK_PLAN_STALE_DAYS,
    read: settings => settings.workPlanStaleDays,
    write: (settings, value) => void (settings.workPlanStaleDays = value),
  },
  ...BAND_KEYS.map(band => ({
    key: `expiry_band_days.${band}`,
    group: "expiry" as const,
    label: BAND_LABELS[band],
    min: 1,
    max: 730,
    defaultValue: EXPIRY_BAND_DAYS[band],
    read: (settings: OperationalSettings) => settings.expiryBandDays[band],
    write: (settings: OperationalSettings, value: number) => void (settings.expiryBandDays[band] = value),
  })),
];

export const SETTING_KEYS = SETTING_DEFINITIONS.map(definition => definition.key);
const BY_KEY = new Map(SETTING_DEFINITIONS.map(definition => [definition.key, definition]));

export function settingDefinition(key: string) {
  return BY_KEY.get(key);
}

function valueSchema(definition: SettingDefinition) {
  return z.number({ error: "Enter a whole number" }).int("Enter a whole number").min(definition.min, `At least ${definition.min}`).max(definition.max, `At most ${definition.max}`);
}

function cloneSettings(settings: OperationalSettings): OperationalSettings {
  return { staleAfterDays: { ...settings.staleAfterDays }, workPlanStaleDays: settings.workPlanStaleDays, expiryBandDays: { ...settings.expiryBandDays } };
}

/** Problems that span settings: the expiry bands must each end after the one before. Keyed by the setting at fault. */
function crossFieldErrors(settings: OperationalSettings): Record<string, string> {
  const errors: Record<string, string> = {};
  for (let index = 1; index < BAND_KEYS.length; index += 1) {
    const previous = settings.expiryBandDays[BAND_KEYS[index - 1]];
    if (settings.expiryBandDays[BAND_KEYS[index]] <= previous) errors[`expiry_band_days.${BAND_KEYS[index]}`] = `Must be more than ${previous}`;
  }
  return errors;
}

export type ResolvedSettings = { settings: OperationalSettings; stored: string[] };

/**
 * The settings the app runs on: each stored value that is valid, else the code default. If the stored expiry bands are
 * out of order, all four fall back together, so the bands stay consistent.
 */
export function resolveOperationalSettings(rows: { key: string; value: unknown }[]): ResolvedSettings {
  const settings = cloneSettings(DEFAULT_OPERATIONAL_SETTINGS);
  const stored = new Set<string>();
  for (const row of rows) {
    const definition = BY_KEY.get(row.key);
    if (!definition || !valueSchema(definition).safeParse(row.value).success) continue;
    definition.write(settings, row.value as number);
    stored.add(row.key);
  }
  if (Object.keys(crossFieldErrors(settings)).length) {
    settings.expiryBandDays = { ...DEFAULT_OPERATIONAL_SETTINGS.expiryBandDays };
    for (const band of BAND_KEYS) stored.delete(`expiry_band_days.${band}`);
  }
  return { settings, stored: SETTING_KEYS.filter(key => stored.has(key)) };
}

export function settingValues(settings: OperationalSettings): Record<string, number> {
  return Object.fromEntries(SETTING_DEFINITIONS.map(definition => [definition.key, definition.read(settings)]));
}

export type SettingChangeResult = { ok: true; settings: OperationalSettings; changed: Record<string, number> } | { ok: false; errors: Record<string, string> };

/** Validates `changes` against the current settings: known keys, whole numbers within bounds, bands in order. */
export function applySettingChanges(current: OperationalSettings, changes: Record<string, unknown>): SettingChangeResult {
  const next = cloneSettings(current);
  const errors: Record<string, string> = {};
  const changed: Record<string, number> = {};
  for (const [key, value] of Object.entries(changes)) {
    const definition = BY_KEY.get(key);
    if (!definition) {
      errors[key] = "Not a setting";
      continue;
    }
    const parsed = valueSchema(definition).safeParse(value);
    if (!parsed.success) {
      errors[key] = parsed.error.issues[0]?.message ?? "Not a valid value";
      continue;
    }
    if (definition.read(next) !== parsed.data) changed[key] = parsed.data;
    definition.write(next, parsed.data);
  }
  Object.assign(errors, Object.fromEntries(Object.entries(crossFieldErrors(next)).filter(([key]) => !(key in errors))));
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, settings: next, changed };
}
