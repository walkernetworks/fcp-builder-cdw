import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  getEngagement: vi.fn(),
  deleteEngagement: vi.fn(),
  updateTrackerFields: vi.fn(),
  transitionStage: vi.fn(),
  listTracker: vi.fn(async () => []),
}));

import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";

function caller(overrides: Partial<NonNullable<TrpcContext["user"]>> = {}) {
  const user = { id: 7, openId: "tracker-test", email: "sa@example.test", name: "Test SA", loginMethod: "trusted-proxy", role: "user", workspaceId: 1, vsaRole: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...overrides } as NonNullable<TrpcContext["user"]>;
  return appRouter.createCaller({ user, req: { headers: {}, protocol: "https" }, res: {} } as TrpcContext);
}

describe("tracker procedures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps a stale write to CONFLICT", async () => {
    vi.mocked(db.updateTrackerFields).mockResolvedValueOnce({ status: "conflict" });
    await expect(caller().tracker.update({ id: 4, rowVersion: 0, patch: { health: "green" } })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("maps a hard gate to PRECONDITION_FAILED with the reason", async () => {
    vi.mocked(db.transitionStage).mockResolvedValueOnce({ status: "blocked", reason: "Kickoff needs the Broadcom PO received date." });
    await expect(caller().tracker.transition({ id: 4, rowVersion: 2, to: "kickoff", effectiveOn: "2026-10-15" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringMatching(/PO/) });
  });

  it("rejects edits to fields that are not directly editable before reaching the database", async () => {
    await expect(caller().tracker.update({ id: 4, rowVersion: 0, patch: { stage: "complete" } as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.updateTrackerFields).not.toHaveBeenCalled();
  });

  it("filters to the signed-in user's assignments when asked", async () => {
    await caller().tracker.list({ mine: true, role: "architect" });
    expect(db.listTracker).toHaveBeenCalledWith({ id: 7, workspaceId: 1, role: "user" }, { stages: undefined, assignedUserId: 7, assignedRole: "architect" });
  });

  it("refuses delete to someone who is not the owner or an admin", async () => {
    vi.mocked(db.getEngagement).mockResolvedValue({ id: 4, ownerId: 99, workspaceId: 1 } as never);
    await expect(caller().engagement.delete({ id: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.deleteEngagement).not.toHaveBeenCalled();
    vi.mocked(db.deleteEngagement).mockResolvedValueOnce(true);
    await expect(caller({ role: "admin" }).engagement.delete({ id: 4 })).resolves.toEqual({ success: true });
  });
});
