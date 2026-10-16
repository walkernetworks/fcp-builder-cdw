import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Assertions from the CDW design system (cdw-branding, cdw-report-design surface-app.md section 4), for the app UI.
const root = path.resolve(import.meta.dirname, "..");
const client = path.join(root, "client");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}
const sources = files(path.join(client, "src")).filter(file => /\.(tsx?|css)$/.test(file));
const read = (file: string) => readFileSync(file, "utf8");

describe("CDW design system in the app", () => {
  it("ships the logo with its registered mark (nine subpaths) in every variant", () => {
    const dir = path.join(client, "src/assets/brand");
    for (const file of readdirSync(dir).filter(name => name.endsWith(".svg"))) {
      const d = read(path.join(dir, file)).match(/d="([^"]+)"/)![1].replace(/\s+/g, "");
      expect(d.split(/(?=M)/).filter(Boolean), file).toHaveLength(9);
    }
  });

  it("declares CDW Red once, as a token, and keeps the blocked state under its own name", () => {
    const css = read(path.join(client, "src/index.css"));
    expect(css.match(/--cdw-red:\s*#CC0000/gi)).toHaveLength(1);
    expect(css).toMatch(/--state-blocked:/);
    expect(css).not.toMatch(/--bad:/);
  });

  it("uses no off-brand reds, retired navy chrome, or teal in client source", () => {
    const forbidden = /#(c8102e|a80d27|e31837|10233f|07182d|0b1f37|22d3ce|0b9bb1|125e6e)\b/i;
    const hits = sources.filter(file => forbidden.test(read(file))).map(file => path.relative(root, file));
    expect(hits).toEqual([]);
  });

  it("bundles the typeface instead of loading remote fonts", () => {
    expect(read(path.join(client, "index.html"))).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(sources.filter(file => /fonts\.(googleapis|gstatic)\.com/.test(read(file)))).toEqual([]);
    expect(read(path.join(client, "src/main.tsx"))).toMatch(/@fontsource-variable\/inter/);
  });

  it("carries the proprietary legend in the app shell", () => {
    expect(read(path.join(client, "src/components/vsa/AppShell.tsx"))).toMatch(/CDW (\u2014|\\u2014) Proprietary and confidential\. Copying restricted\./);
  });

  it("formats client money with double zeros (no whole-dollar currency formatters)", () => {
    expect(sources.filter(file => /currency: "USD", maximumFractionDigits: 0/.test(read(file))).map(file => path.relative(root, file))).toEqual([]);
  });

  it("renders compatibility decisions as pills, not badges", () => {
    const panel = read(path.join(client, "src/components/CompatibilityHandoffPanel.tsx"));
    expect(panel).toMatch(/DECISION_VERDICT/);
    expect(panel).not.toMatch(/<Badge/);
  });

  it("gives every color token a dark-theme value, except the brand red, which stays fixed", () => {
    const css = read(path.join(client, "src/index.css"));
    const block = (selector: string) => css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));
    const names = (text: string) => new Set(Array.from(text.matchAll(/(--[a-z0-9-]+):\s*#/gi), match => match[1]));
    const light = names(block(":root"));
    const dark = new Set(Array.from(block(".dark").matchAll(/(--[a-z0-9-]+):/gi), match => match[1]));
    // Brand fills and the white text on them read the same in both themes.
    const fixed = new Set(["--cdw-red", "--cdw-red-bright", "--cdw-red-deep", "--primary-foreground", "--sidebar-primary-foreground"]);
    expect(Array.from(light).filter(name => !fixed.has(name) && !dark.has(name))).toEqual([]);
    expect(block(".dark")).not.toMatch(/--cdw-red:/);
  });

  it("uses surface tokens rather than hard-coded white panels, so dark mode holds", () => {
    const app = sources.filter(file => !file.includes(`${path.sep}ui${path.sep}`));
    expect(app.filter(file => /\bbg-white\b(?!\/)/.test(read(file))).map(file => path.relative(root, file))).toEqual([]);
  });

  it("routes every sidebar item", () => {
    const nav = read(path.join(client, "src/components/vsa/navigation.ts"));
    const app = read(path.join(client, "src/App.tsx"));
    for (const [, href] of Array.from(nav.matchAll(/href: "([^"]+)"/g))) expect(app, href).toMatch(new RegExp(`path="${href}"`));
  });

  it("uses US spellings in client copy", () => {
    const british = /\b(programme|modelled|labour|analyse[sd]?|organisation|colour)\b/i;
    expect(sources.filter(file => british.test(read(file))).map(file => path.relative(root, file))).toEqual([]);
  });
});
