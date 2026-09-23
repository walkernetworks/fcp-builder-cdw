import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ upsertUser: vi.fn(), getUserByOpenId: vi.fn(async () => undefined) }));

import { createContext } from "./_core/context";

const root = path.resolve(import.meta.dirname, "..");
const scanned = ["client", "server", "shared", "scripts", "drizzle", "vite.config.ts", "vitest.config.ts", "package.json", "pnpm-lock.yaml", "Dockerfile"];
const thisFile = path.relative(root, import.meta.filename);

// Split so this file does not match its own pattern.
const forbidden = new RegExp(["man" + "us", "butterfly-" + "effect", "BUILT_IN_" + "FORGE", "FRONTEND_" + "FORGE"].join("|"), "i");

function files(entry: string): string[] {
  const full = path.join(root, entry);
  if (!statSync(full, { throwIfNoEntry: false })) return [];
  if (!statSync(full).isDirectory()) return [entry];
  return readdirSync(full).flatMap(name => (name === "node_modules" ? [] : files(path.join(entry, name))));
}

describe("no third-party hosting platform dependency", () => {
  it("keeps Manus runtime, OAuth, Forge services, and plugins out of source and dependencies", () => {
    const hits = scanned
      .flatMap(files)
      .filter(file => file !== thisFile && !/\.(png|jpe?g|gif|ico|woff2?|ttf|pdf|xlsx)$/i.test(file))
      .flatMap(file =>
        readFileSync(path.join(root, file), "utf8")
          .split("\n")
          .flatMap((line, index) => (forbidden.test(line) ? [`${file}:${index + 1}: ${line.trim().slice(0, 120)}`] : []))
      );
    expect(hits).toEqual([]);
  });
});

describe("request identity", () => {
  const originalMode = process.env.FCP_AUTH_MODE;
  afterEach(() => {
    process.env.FCP_AUTH_MODE = originalMode;
  });

  function request(headers: Record<string, string>) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return { headers: lower, get: (name: string) => lower[name.toLowerCase()] } as any;
  }

  it("ignores session cookies and bearer tokens; only the gateway identity counts", async () => {
    process.env.FCP_AUTH_MODE = "trusted-proxy";
    const ctx = await createContext({
      req: request({ cookie: "app_session_id=forged", authorization: "Bearer forged" }),
      res: {} as any,
      info: {} as any,
    });
    expect(ctx.user).toBeNull();
  });

  it("authenticates nobody when trusted-proxy mode is not enabled", async () => {
    delete process.env.FCP_AUTH_MODE;
    const ctx = await createContext({
      req: request({ "x-auth-request-user": "someone@example.com" }),
      res: {} as any,
      info: {} as any,
    });
    expect(ctx.user).toBeNull();
  });
});
