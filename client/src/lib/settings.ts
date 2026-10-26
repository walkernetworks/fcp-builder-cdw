import { trpc } from "@/lib/trpc";
import { DEFAULT_OPERATIONAL_SETTINGS, type OperationalSettings } from "@shared/appSettings";

/**
 * The operational thresholds an admin sets (stale stages, work plan follow-up, expiry bands). The code defaults apply
 * until they load, and if they cannot be loaded, so a screen never waits on them.
 */
export function useOperationalSettings(): OperationalSettings {
  const query = trpc.settings.operational.useQuery(undefined, { staleTime: 5 * 60_000 });
  return query.data ?? DEFAULT_OPERATIONAL_SETTINGS;
}
