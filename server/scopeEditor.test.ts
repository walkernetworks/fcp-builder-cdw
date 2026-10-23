import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { focusesOf, isDeclined, isInScope, setCapabilityInScope, setDeclined, setFocus } from "../client/src/lib/scopeEdits";
import { capabilitySchema, createDefaultDocument, resolvePlanOutcomes, type EngagementDocument } from "../shared/fcp";

const ROOT = path.resolve(import.meta.dirname, "..");

function scoped(): EngagementDocument {
  const document = createDefaultDocument();
  document.fields.customerName = "Acme Health";
  return document;
}

describe("scope card edits", () => {
  it("turns a card on as a priority, and off with its focuses cleared", () => {
    const on = setFocus(setCapabilityInScope(scoped(), "security", "Security", true), "security", "segmentation", true);
    expect(on.fields.priorities).toContain("security");
    expect(isInScope(on, "security")).toBe(true);
    const off = setCapabilityInScope(on, "security", "Security", false);
    expect(off.fields.priorities).not.toContain("security");
    expect(focusesOf(off, "security")).toEqual([]);
    expect(isInScope(off, "security")).toBe(false);
  });

  it("counts a focus without a priority as in scope, as the generator does", () => {
    const document = scoped();
    document.fields.adoptionDetails.privateAi = ["gpu-capacity"];
    expect(isInScope(document, "private-ai")).toBe(true);
    expect(resolvePlanOutcomes(document.fields).outcomes.some(outcome => outcome.key.startsWith("private-ai:"))).toBe(isInScope(document, "private-ai"));
  });

  it("makes a capability a priority when a focus is selected, and only clears that focus when it is unselected", () => {
    const document = setFocus(scoped(), "automation", "vm-self-service", true);
    expect(document.fields.priorities).toContain("automation");
    const cleared = setFocus(document, "automation", "vm-self-service", false);
    expect(focusesOf(cleared, "automation")).toEqual([]);
    expect(cleared.fields.priorities).toContain("automation");
  });

  it("never writes a not-requested note when a card is turned off", () => {
    const document = setCapabilityInScope(setCapabilityInScope(scoped(), "kubernetes", "Kubernetes", true), "kubernetes", "Kubernetes", false);
    expect(document.report.declined).toEqual([]);
  });

  it("withdraws the note when the card is turned back on", () => {
    const declined = setDeclined(scoped(), "Kubernetes", true);
    expect(isDeclined(declined, "kubernetes")).toBe(true);
    expect(setCapabilityInScope(declined, "kubernetes", "Kubernetes", true).report.declined).toEqual([]);
  });

  it("keeps one note per card and leaves other notes alone", () => {
    const document = scoped();
    document.report.declined = ["Hardware refresh"];
    const twice = setDeclined(setDeclined(document, "Private AI", true), "private ai", true);
    expect(twice.report.declined).toEqual(["Hardware refresh", "private ai"]);
    expect(setDeclined(twice, "Private AI", false).report.declined).toEqual(["Hardware refresh"]);
  });
});

describe("scope section", () => {
  const source = readFileSync(path.join(ROOT, "client/src/components/fcp/ScopeSection.tsx"), "utf8");

  it("has one card per capability", () => {
    const cards = [...source.matchAll(/\{ capability: "([a-z-]+)", name:/g)].map(match => match[1]);
    expect(cards).toEqual(capabilitySchema.options);
  });

  it("changes the document only on a person's action, so opening a record changes nothing", () => {
    expect(source).not.toMatch(/useEffect|useLayoutEffect/);
    // The not-requested note is written from one place: the chip a person clicks.
    expect(source.match(/setDeclined\(/g)).toHaveLength(1);
    expect(source).toMatch(/onClick=\{\(\) => onChange\(setDeclined\(/);
  });

  it("is never read by the FCP renderer", () => {
    for (const file of ["server/condensedFcpRenderer.ts", "shared/reportView.ts", "shared/fcp.ts"]) {
      expect(readFileSync(path.join(ROOT, file), "utf8"), file).not.toMatch(/ScopeSection|scopeEdits/);
    }
  });

  it("replaces the raw report editing for scope in the workspace", () => {
    const workspace = readFileSync(path.join(ROOT, "client/src/pages/FcpWorkspace.tsx"), "utf8");
    const scope = workspace.slice(workspace.indexOf('section === "scope"'), workspace.indexOf('section === "plan"'));
    expect(scope).toMatch(/<ScopeSection /);
    expect(scope).not.toMatch(/ReportContentEditor|PlanSetup/);
  });
});
