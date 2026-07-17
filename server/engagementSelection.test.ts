import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getEngagement: vi.fn(),
}));

import { engagementExists, reconcileSelectedEngagementId, shouldQuerySelectedEngagement } from "../client/src/lib/engagementSelection";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function authenticatedContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 7,
    openId: "stale-selection-test-user",
    email: "sa@example.test",
    name: "Test SA",
    loginMethod: "trusted-proxy",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return { user, req: { headers: {}, protocol: "https" }, res: {} } as TrpcContext;
}

describe("engagement selection recovery", () => {
  it("keeps a selected engagement when it remains in the refreshed list", () => {
    const engagements = [{ id: 10 }, { id: 11 }];

    expect(reconcileSelectedEngagementId(11, engagements)).toBe(11);
    expect(engagementExists(11, engagements)).toBe(true);
  });

  it("replaces a stale selection with the first current engagement", () => {
    const engagements = [{ id: 24 }, { id: 25 }];

    expect(reconcileSelectedEngagementId(1, engagements)).toBe(24);
    expect(engagementExists(1, engagements)).toBe(false);
  });

  it("clears a stale selection when the refreshed list is empty and preserves it before the list resolves", () => {
    expect(reconcileSelectedEngagementId(1, [])).toBeNull();
    expect(reconcileSelectedEngagementId(1, undefined)).toBe(1);
  });

  it("blocks stale cached IDs while the owner-scoped list refreshes, then permits only a current list member", () => {
    const staleCachedList = [{ id: 1 }];
    const currentList = [{ id: 24 }];

    expect(shouldQuerySelectedEngagement(1, staleCachedList, true)).toBe(false);
    expect(shouldQuerySelectedEngagement(1, [], false)).toBe(false);
    expect(shouldQuerySelectedEngagement(24, currentList, false)).toBe(true);
  });

  it("returns null instead of a query error when an owner-scoped engagement no longer exists", async () => {
    vi.mocked(db.getEngagement).mockResolvedValueOnce(undefined);

    const result = await appRouter.createCaller(authenticatedContext()).engagement.get({ id: 999 });

    expect(result).toBeNull();
    expect(db.getEngagement).toHaveBeenCalledWith(7, 999);
  });
});
