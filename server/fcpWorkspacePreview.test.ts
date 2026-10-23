import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getEngagement: vi.fn() }));

import type { TrpcContext } from "./_core/context";
import { checkCondensedFcp } from "./condensedFcpChecks";
import { renderCondensedFcpHtml } from "./condensedFcpRenderer";
import { FCP_FIXTURES, FIXTURE_TODAY, acmeHealth } from "./fixtures/fcpFixtures";
import { scopedEffortForDocument } from "./rateCard";
import { appRouter } from "./routers";

const ROOT = path.resolve(import.meta.dirname, "..");
const DRAFT_TEXT = "Draft, not for distribution";
const DRAFT_BLOCK = /<style>\.draft-mark\{[\s\S]*?<\/style><div class="draft-mark" aria-hidden="true">Draft, not for distribution<\/div>/;

function caller() {
  const user = { id: 7, openId: "preview-test", email: "sa@example.test", name: "Test SA", loginMethod: "trusted-proxy", role: "user", workspaceId: 1, vsaRole: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  return appRouter.createCaller({ user, req: { headers: {}, protocol: "https" }, res: {} } as unknown as TrpcContext);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" || name === "__golden__" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : [];
  });
}

describe("draft mark", () => {
  for (const fixture of FCP_FIXTURES) {
    it(`adds only the draft mark for ${fixture.title}`, () => {
      const document = fixture.build();
      const options = { effort: scopedEffortForDocument(document, FIXTURE_TODAY), today: FIXTURE_TODAY };
      const plain = renderCondensedFcpHtml(fixture.title, document, options);
      const draft = renderCondensedFcpHtml(fixture.title, document, { ...options, draft: true });
      expect(plain).not.toContain(DRAFT_TEXT);
      expect(draft.split(DRAFT_TEXT)).toHaveLength(2);
      expect(draft.replace(DRAFT_BLOCK, "")).toBe(plain);
      // The mark carries no dollar figure or internal wording, so the customer content gates still pass.
      expect(checkCondensedFcp(draft, { customerName: document.fields.customerName, entitlementValue: document.fields.entitlementAmount, bsasOnly: document.fields.fundingSource === "bsas" })).toEqual([]);
    });
  }

  it("is a render option and never part of the document", () => {
    const document = acmeHealth();
    expect(JSON.stringify(document)).not.toMatch(/draft-mark|"draft"/);
  });
});

describe("workspace preview", () => {
  it("previews the condensed FCP with the draft mark and its content checks", async () => {
    const document = acmeHealth();
    const result = await caller().document.preview({ title: "Acme Health", data: document });
    expect(result.html).toContain(DRAFT_TEXT);
    expect(result.html).toContain("Functional Consumption Plan");
    expect(result.html).not.toContain("Internal Planning Document");
    expect(result.checks).toEqual([]);
  });

  it("downloads saved history as the condensed FCP with the draft mark", async () => {
    const file = await caller().document.html({ title: "Acme Health", data: acmeHealth() });
    expect(file.content).toContain(DRAFT_TEXT);
    expect(file.content).not.toContain("Internal Planning Document");
  });
});

describe("full template retired from the UI", () => {
  it("is referenced only by its own module and the deprecated export branch", () => {
    const users = [...sourceFiles(path.join(ROOT, "server")), ...sourceFiles(path.join(ROOT, "shared")), ...sourceFiles(path.join(ROOT, "client/src"))]
      .filter(file => readFileSync(file, "utf8").includes("renderFcpHtml"))
      .map(file => path.relative(ROOT, file))
      .sort();
    expect(users).toEqual(["server/exportDownloadRoutes.ts", "server/fcpRenderer.ts"]);
    expect(readFileSync(path.join(ROOT, "server/routers.ts"), "utf8")).not.toMatch(/from "\.\/fcpRenderer"/);
  });

  it("is never requested by the client", () => {
    for (const file of sourceFiles(path.join(ROOT, "client/src"))) {
      const source = readFileSync(file, "utf8");
      expect(source, path.relative(ROOT, file)).not.toMatch(/documentType\s*(=|:)\s*"fcp"|ExportDocumentType\s*=\s*"fcp"|\(\s*"fcp"\s*\)/);
    }
  });
});
