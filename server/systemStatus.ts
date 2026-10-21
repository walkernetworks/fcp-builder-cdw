/**
 * Read-only integration status for the admin screen: which seam implementation each `*_SOURCE` setting selects, and
 * the feature flags. It reports the environment; nothing here can change it. Going live with a connector stays an
 * environment change plus an IT approval record, never an in-app switch.
 */
import { FILE_SOURCES, fileSourceName, RESERVED_FILE_SOURCES } from "./fileSource";
import { PIPELINE_SOURCES, pipelineSourceName, RESERVED_PIPELINE_SOURCES } from "./pipelineSource";

/** What each built implementation does. Every one reads files or the record; none makes a network call. */
const IMPLEMENTATIONS: Record<string, { module: string; description: string }> = {
  csv: { module: "server/pipelineSource.ts csvPipelineSource", description: "A person uploads the SharePoint Pipeline List CSV export." },
  references: { module: "server/fileSource.ts referencesSource", description: "Links built from the record's client folder and source references." },
};

/**
 * Feature flags: environment variables read once at startup. None exist yet. A new flag is added here, and to
 * docs/CONFIGURATION.md, in the same PR, so it appears on the status screen.
 */
export const FEATURE_FLAGS: { name: string; description: string }[] = [];

export type SeamStatus = {
  variable: string;
  label: string;
  /** The raw environment value, or null when unset (the default applies). */
  configured: string | null;
  /** The implementation in use, or null when the value is refused (the server would not have started with it). */
  active: string | null;
  implementation: { module: string; description: string } | null;
  built: string[];
  reserved: string[];
  live: false;
  error: string | null;
};

export type SystemStatus = {
  seams: SeamStatus[];
  featureFlags: { name: string; description: string; value: string | null }[];
  signInMode: string | null;
  outbound: string;
  connectorApprovals: string;
};

function seam(variable: string, label: string, resolve: (value: string | undefined) => string, built: readonly string[], reserved: readonly string[], env: NodeJS.ProcessEnv): SeamStatus {
  const configured = env[variable]?.trim() || null;
  let active: string | null = null;
  let error: string | null = null;
  try {
    active = resolve(env[variable]);
  } catch (problem) {
    error = (problem as Error).message;
  }
  return { variable, label, configured, active, implementation: active ? IMPLEMENTATIONS[active] ?? null : null, built: [...built], reserved: [...reserved], live: false, error };
}

export function systemStatus(env: NodeJS.ProcessEnv = process.env): SystemStatus {
  return {
    seams: [
      seam("PIPELINE_SOURCE", "Pipeline source", value => pipelineSourceName(value), PIPELINE_SOURCES, RESERVED_PIPELINE_SOURCES, env),
      seam("FILE_SOURCE", "File source", value => fileSourceName(value), FILE_SOURCES, RESERVED_FILE_SOURCES, env),
    ],
    featureFlags: FEATURE_FLAGS.map(flag => ({ ...flag, value: env[flag.name]?.trim() || null })),
    signInMode: env.FCP_AUTH_MODE?.trim() || null,
    outbound: "Database only. No connector is built, so the app makes no other outbound calls.",
    connectorApprovals: "Not built yet. A live connector needs an approval record before it can be selected.",
  };
}
