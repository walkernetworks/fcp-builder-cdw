import { trpc } from "@/lib/trpc";
import { BUILD_LOCK_HEARTBEAT_MS } from "@shared/fcpRecord";
import { useCallback, useEffect, useRef, useState } from "react";
import superjson from "superjson";

export type BuildLock = { status: "none" | "pending" | "held" | "other"; holder: string | null; since: Date | null };

/**
 * One editor per FCP. Takes the build lock when an engagement opens, renews it every minute, and releases it on leaving
 * (including closing the tab). Someone else holding a live lock makes the workspace read-only until they finish or you
 * take over.
 */
export function useBuildLock(engagementId: number | null) {
  const [lock, setLock] = useState<BuildLock>({ status: "none", holder: null, since: null });
  const acquire = trpc.fcpRecord.acquireLock.useMutation();
  const release = trpc.fcpRecord.releaseLock.useMutation();
  const heldId = useRef<number | null>(null);

  const apply = useCallback((id: number, result: { held: boolean; holder: string | null; since: Date | null }) => {
    heldId.current = result.held ? id : null;
    setLock({ status: result.held ? "held" : "other", holder: result.holder, since: result.since ? new Date(result.since) : null });
  }, []);

  const tryAcquire = useCallback(async (id: number, takeOver = false) => {
    try {
      apply(id, await acquire.mutateAsync({ id, takeOver }));
    } catch {
      // Leave the current state; the next heartbeat tries again.
    }
  }, [acquire, apply]);

  useEffect(() => {
    if (!engagementId) { setLock({ status: "none", holder: null, since: null }); return; }
    setLock({ status: "pending", holder: null, since: null });
    void tryAcquire(engagementId);
    const timer = window.setInterval(() => void tryAcquire(engagementId), BUILD_LOCK_HEARTBEAT_MS);
    const releaseOnClose = () => {
      if (heldId.current !== engagementId) return;
      // A beacon still goes out while the page unloads; the lock would otherwise lapse after a few minutes.
      navigator.sendBeacon("/api/trpc/fcpRecord.releaseLock", new Blob([JSON.stringify(superjson.serialize({ id: engagementId }))], { type: "application/json" }));
    };
    window.addEventListener("pagehide", releaseOnClose);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", releaseOnClose);
      if (heldId.current === engagementId) { heldId.current = null; release.mutate({ id: engagementId }); }
    };
  }, [engagementId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    lock,
    readOnly: lock.status === "other",
    takeOver: () => (engagementId ? tryAcquire(engagementId, true) : Promise.resolve()),
    refresh: () => (engagementId ? tryAcquire(engagementId) : Promise.resolve()),
  };
}
