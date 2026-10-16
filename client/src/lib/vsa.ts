import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type Outputs = inferRouterOutputs<AppRouter>;
export type TrackerRow = Outputs["tracker"]["list"][number];
export type TrackerRecord = NonNullable<Outputs["tracker"]["get"]>;

/** Today as YYYY-MM-DD in UTC, the same calendar the server uses for stage dates. */
export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export const SEGMENT_LABELS = { corporate: "Corporate", strategic: "Strategic", commercial: "Commercial" } as const;
