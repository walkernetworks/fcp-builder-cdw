import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  listUsersForAdmin: vi.fn(async () => []),
  listWorkspaces: vi.fn(async () => [{ id: 1, name: "CDW VSA" }]),
  getUserForAdmin: vi.fn(async () => ({ user: { id: 3, name: "Priya Shah", role: "user" }, assignments: [], activity: [] })),
  updateUserByAdmin: vi.fn(async () => ({ status: "ok" })),
  listAppSettings: vi.fn(async () => []),
  readOperationalSettings: vi.fn(async () => (await import("../shared/appSettings")).resolveOperationalSettings([])),
  saveAppSettings: vi.fn(async () => ({ status: "ok", changed: [] })),
}));

import { navGroupsFor } from "../client/src/components/vsa/navigation";
import { DEFAULT_OPERATIONAL_SETTINGS } from "../shared/appSettings";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";
import { systemStatus } from "./systemStatus";

type Role = "user" | "admin";

function caller(role: Role | null) {
  const user = role ? ({ id: 7, openId: "admin-test", email: "sa@example.test", name: "Test SA", loginMethod: "trusted-proxy", role, workspaceId: 1, vsaRole: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), updatedByUserId: null } as NonNullable<TrpcContext["user"]>) : null;
  return appRouter.createCaller({ user, req: { headers: {}, protocol: "https" }, res: {} } as TrpcContext);
}

/** Every admin procedure with a valid input, so a refusal can only come from the access check. */
const ADMIN_CALLS: Record<string, (api: ReturnType<typeof caller>) => Promise<unknown>> = {
  "admin.users.list": api => api.admin.users.list(),
  "admin.users.get": api => api.admin.users.get({ id: 3 }),
  "admin.users.update": api => api.admin.users.update({ id: 3, patch: { role: "admin" } }),
  "admin.settings.list": api => api.admin.settings.list(),
  "admin.settings.update": api => api.admin.settings.update({ values: { work_plan_stale_days: 10 } }),
  "admin.status": api => api.admin.status(),
};

describe("admin access control", () => {
  beforeEach(() => vi.clearAllMocks());

  it("covers every procedure in the admin router", () => {
    const procedures = Object.keys(appRouter._def.procedures).filter(name => name.startsWith("admin."));
    expect(procedures.sort()).toEqual(Object.keys(ADMIN_CALLS).sort());
  });

  it.each(Object.keys(ADMIN_CALLS))("refuses %s to a signed-in user who is not an admin, and to no user", async name => {
    await expect(ADMIN_CALLS[name](caller("user"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(ADMIN_CALLS[name](caller(null))).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const fn of Object.values(db)) if (vi.isMockFunction(fn)) expect(fn).not.toHaveBeenCalled();
  });

  it.each(Object.keys(ADMIN_CALLS))("allows %s to an admin", async name => {
    await expect(ADMIN_CALLS[name](caller("admin"))).resolves.toBeDefined();
  });

  it("lets every signed-in user read the resolved settings, but nobody signed out", async () => {
    await expect(caller("user").settings.operational()).resolves.toEqual(DEFAULT_OPERATIONAL_SETTINGS);
    await expect(caller(null).settings.operational()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("shows the Admin nav entry only to admins", () => {
    const hrefs = (role: Role | undefined) => navGroupsFor(role).flatMap(group => group.items.map(item => item.href));
    expect(hrefs("admin")).toContain("/admin");
    expect(hrefs("user")).not.toContain("/admin");
    expect(hrefs(undefined)).not.toContain("/admin");
    expect(navGroupsFor("user").every(group => group.items.length > 0)).toBe(true);
  });
});

describe("admin user changes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the admin as the actor, for attribution", async () => {
    await caller("admin").admin.users.update({ id: 3, patch: { vsaRole: "architect", workspaceId: 1 } });
    expect(db.updateUserByAdmin).toHaveBeenCalledWith({ id: 7, workspaceId: 1, role: "admin" }, 3, { vsaRole: "architect", workspaceId: 1 });
  });

  it("refuses to demote the last admin", async () => {
    vi.mocked(db.updateUserByAdmin).mockResolvedValueOnce({ status: "last_admin" });
    await expect(caller("admin").admin.users.update({ id: 7, patch: { role: "user" } })).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringMatching(/only admin/) });
  });

  it("accepts only today's fields: no capabilities, no identity, nothing empty", async () => {
    const api = caller("admin");
    await expect(api.admin.users.update({ id: 3, patch: { capabilities: ["data_steward"] } as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.admin.users.update({ id: 3, patch: { email: "x@example.test" } as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.admin.users.update({ id: 3, patch: { role: "owner" } as never })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.admin.users.update({ id: 3, patch: {} })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.updateUserByAdmin).not.toHaveBeenCalled();
  });

  it("maps a missing user and an unknown workspace", async () => {
    vi.mocked(db.updateUserByAdmin).mockResolvedValueOnce({ status: "not_found" });
    await expect(caller("admin").admin.users.update({ id: 99, patch: { role: "admin" } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    vi.mocked(db.updateUserByAdmin).mockResolvedValueOnce({ status: "no_workspace" });
    await expect(caller("admin").admin.users.update({ id: 3, patch: { workspaceId: 9 } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("admin user profile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the profile as the admin, so record data stays within what the admin can see", async () => {
    const profile = await caller("admin").admin.users.get({ id: 3 });
    expect(db.getUserForAdmin).toHaveBeenCalledWith({ id: 7, workspaceId: 1, role: "admin" }, 3);
    expect(profile).toMatchObject({ user: { id: 3 }, assignments: [], activity: [], workspaces: [{ id: 1 }] });
  });

  it("maps a missing user to NOT_FOUND", async () => {
    vi.mocked(db.getUserForAdmin).mockResolvedValueOnce(undefined);
    await expect(caller("admin").admin.users.get({ id: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("admin settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists every setting with its value, default, bounds, and whether it is stored", async () => {
    const result = await caller("admin").admin.settings.list();
    expect(result.settings.find(setting => setting.key === "stale_after_days.discovery")).toMatchObject({ value: 21, defaultValue: 21, min: 1, max: 365, stored: false });
    expect(result.groups.map(group => group.id)).toEqual(["stale", "work_plan", "expiry", "gate_labels"]);
    expect(result.settings.find(setting => setting.key === "gate_label.poReceivedOn")).toMatchObject({ kind: "label", value: "PO received", defaultValue: "PO received", max: 60 });
  });

  it("turns invalid values into BAD_REQUEST", async () => {
    vi.mocked(db.saveAppSettings).mockResolvedValueOnce({ status: "invalid", errors: { work_plan_stale_days: "At least 1" } });
    await expect(caller("admin").admin.settings.update({ values: { work_plan_stale_days: 0 } })).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/At least 1/) });
  });
});

describe("system status", () => {
  it("reports the default seams in file mode, with nothing live", () => {
    const status = systemStatus({});
    expect(status.seams.map(seam => [seam.variable, seam.active, seam.configured, seam.live])).toEqual([
      ["PIPELINE_SOURCE", "csv", null, false],
      ["FILE_SOURCE", "references", null, false],
    ]);
    expect(status.seams[0].reserved).toEqual(["salesforce", "sharepoint"]);
    expect(status.featureFlags).toEqual([]);
  });

  it("shows a reserved value as refused rather than live", () => {
    const status = systemStatus({ PIPELINE_SOURCE: "salesforce" });
    expect(status.seams[0]).toMatchObject({ configured: "salesforce", active: null, live: false, error: expect.stringMatching(/reserved/) });
  });

  it("is read-only: the only admin mutations are user and settings edits", () => {
    const mutations = Object.entries(appRouter._def.procedures)
      .filter(([name, procedure]) => name.startsWith("admin.") && (procedure as { _def: { type: string } })._def.type === "mutation")
      .map(([name]) => name);
    expect(mutations.sort()).toEqual(["admin.settings.update", "admin.users.update"]);
  });
});
