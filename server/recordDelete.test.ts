import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

describe("deleting a record", () => {
  it("runs in one transaction, on a row the viewer may delete, clearing issue links before the cascade", () => {
    const source = read("server/db.ts");
    const body = source.slice(source.indexOf("export async function deleteEngagement"), source.indexOf("export async function duplicateEngagement"));
    expect(body).toContain("db.transaction(");
    expect(body.match(/deletableEngagements\(viewer\)/g)?.length).toBe(2);
    const clear = body.indexOf("set({ basedOnVersionId: null })");
    const remove = body.indexOf("tx.delete(engagements)");
    expect(clear).toBeGreaterThan(-1);
    expect(clear).toBeLessThan(remove);
  });

  it("cascades to every table that hangs off an engagement", () => {
    const schema = read("drizzle/schema.ts");
    const references = schema.match(/references\(\(\)(?:: AnyMySqlColumn)? => engagements\.id[^)]*\)/g) ?? [];
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) expect(reference).toContain('onDelete: "cascade"');
  });

  it("is offered in the record drawer to the owner or an admin, behind a confirmation", () => {
    const drawer = read("client/src/components/vsa/RecordDrawer.tsx");
    expect(drawer).toContain('user?.role === "admin" || record.ownerId === user?.id');
    expect(drawer).toContain("trpc.engagement.delete.useMutation");
    expect(drawer).toContain("<AlertDialog open={confirming}");
  });
});
