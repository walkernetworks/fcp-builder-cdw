import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  createEngagement: vi.fn(),
}));

import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function authenticatedContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 23,
    openId: "engagement-naming-test-user",
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

describe("engagement naming at creation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trims and persists the name entered before a new engagement is created", async () => {
    const row = { id: 41, title: "Meridian Health VCF Adoption" };
    vi.mocked(db.createEngagement).mockResolvedValueOnce(row as never);

    const result = await appRouter.createCaller(authenticatedContext()).engagement.create({
      title: "  Meridian Health VCF Adoption  ",
    });

    expect(db.createEngagement).toHaveBeenCalledWith(
      23,
      "Meridian Health VCF Adoption",
      expect.objectContaining({ version: expect.any(Number) }),
    );
    const [, , createdDocument] = vi.mocked(db.createEngagement).mock.calls[0]!;
    const baselineLanes = createdDocument.twoYearPlan.lanes.filter(lane => lane.id.startsWith("lane-two-year-baseline-"));
    expect(baselineLanes).toHaveLength(3);
    expect(baselineLanes.every(lane => lane.name === lane.workstreamType)).toBe(true);
    expect(baselineLanes.some(lane => lane.bars.some(activity => activity.startCol === 13 && activity.endCol === 25))).toBe(true);
    expect(result).toBe(row);
  });

  it("rejects a blank engagement name before any record is created", async () => {
    await expect(
      appRouter.createCaller(authenticatedContext()).engagement.create({ title: "   " }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(db.createEngagement).not.toHaveBeenCalled();
  });
});
