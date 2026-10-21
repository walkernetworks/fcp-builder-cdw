import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Claude Code guard hooks in .claude/hooks (see "Data handling" in CLAUDE.md). Each case feeds the hook the JSON
 * Claude Code sends before a tool runs; a denial is a permissionDecision of "deny" on stdout.
 */
const root = path.resolve(import.meta.dirname, "..");
const run = (hook: string, toolInput: Record<string, string>, env: Record<string, string> = {}) => {
  const result = spawnSync("bash", [path.join(root, ".claude/hooks", hook)], {
    input: JSON.stringify({ session_id: "test", hook_event_name: "PreToolUse", tool_name: hook === "guard-bash.sh" ? "Bash" : "Edit", tool_input: toolInput }),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { denied: result.stdout.includes('"permissionDecision":"deny"'), status: result.status, stdout: result.stdout, stderr: result.stderr };
};
const bash = (command: string, env?: Record<string, string>) => run("guard-bash.sh", { command, description: "test" }, env);

/** A project directory whose backup script succeeds or fails, so migrations can be checked without a database. */
function fakeProject(backupSucceeds: boolean): string {
  const dir = mkdtempSync(path.join(tmpdir(), "guard-"));
  mkdirSync(path.join(dir, "scripts"));
  writeFileSync(path.join(dir, "scripts/db-backup.sh"), backupSucceeds ? "echo backed-up > \"$(dirname \"$0\")/../ran\"\n" : "exit 1\n");
  return dir;
}

describe("Bash guard: destructive commands are denied", () => {
  const blocked = [
    `mysql -u root fcp_builder -e "DROP TABLE engagements"`,
    `mysql -u root -e 'drop database fcp_builder'`,
    `mysql -u root fcp_builder -e "TRUNCATE TABLE engagements"`,
    `mysql -u root fcp_builder -e "DELETE FROM engagements"`,
    `mysql -u root fcp_builder -e "delete from engagements;"`,
    `mysql -u root fcp_builder -e "DELETE FROM engagements WHERE 1=1"`,
    `mysql -u root fcp_builder -e "DELETE FROM engagements WHERE true"`,
    `pnpm exec drizzle-kit drop`,
    `npx drizzle-kit push`,
    `pnpm db:push`,
    `pnpm run db:push`,
    `mysqladmin -u root drop fcp_builder`,
    `gunzip -c backups/fcp_builder.sql.gz | mysql -u root fcp_builder`,
    `mysql -u root fcp_builder < backups/dump.sql`,
    `rm -rf /opt/homebrew/var/mysql`,
    `sudo rm -rf /var/lib/mysql/fcp_builder`,
    `rm -rf data/`,
    `rm data/fields/customer.json`,
    `rm -rf ./backups`,
    `find data -name '*.json' -delete`,
    `git clean -fdx`,
    `git clean -fd`,
    `git reset --hard origin/main`,
    `git reset --hard`,
    `sed -i '' 's/deny/allow/' .claude/hooks/guard-bash.sh`,
    `echo '{}' > .claude/settings.json`,
    `rm .claude/settings.json`,
    `git checkout HEAD~5 -- .claude/hooks/guard-bash.sh`,
  ];
  for (const command of blocked) {
    it(`denies: ${command}`, () => {
      const result = bash(command);
      expect(result.denied, result.stderr).toBe(true);
      expect(result.status).toBe(0);
    });
  }
});

describe("Bash guard: everyday commands still run", () => {
  const allowed = [
    "git status",
    "git log --oneline -5",
    "git clean -n",
    "git reset HEAD server/fcp.ts",
    "pnpm check",
    "pnpm test server/pdf.test.ts",
    "ls data",
    `mysql -u root fcp_builder -N -e "SHOW TABLES"`,
    `mysql -u root fcp_builder -e "DELETE FROM engagements WHERE id = 42"`,
    "rm -rf dist",
    "rm server/zzScratch.test.ts",
    "cat .claude/settings.json",
    "grep -n deny .claude/hooks/guard-bash.sh",
    "pnpm db:backup",
    `echo "drop the subject"`,
  ];
  for (const command of allowed) {
    it(`allows: ${command}`, () => {
      const result = bash(command);
      expect(result.denied, result.stdout).toBe(false);
      expect(result.status).toBe(0);
    });
  }
});

describe("Bash guard: migrations", () => {
  it("allows a forward migration after the backup succeeds", () => {
    const project = fakeProject(true);
    const result = bash("pnpm exec drizzle-kit migrate", { CLAUDE_PROJECT_DIR: project });
    expect(result.denied).toBe(false);
    expect(readFileSync(path.join(project, "ran"), "utf8")).toContain("backed-up");
  });

  it("denies the migration when the backup fails", () => {
    const result = bash("pnpm exec drizzle-kit migrate", { CLAUDE_PROJECT_DIR: fakeProject(false) });
    expect(result.denied).toBe(true);
  });

  it("allows pnpm db:migrate, which backs up itself", () => {
    expect(bash("pnpm db:migrate").denied).toBe(false);
  });
});

describe("Bash guard: fails closed", () => {
  it("blocks when the hook input is empty", () => {
    const result = spawnSync("bash", [path.join(root, ".claude/hooks/guard-bash.sh")], { input: "", encoding: "utf8" });
    expect(result.status).toBe(2);
  });
});

describe("File guard", () => {
  it("denies edits to the guard hooks and Claude Code settings", () => {
    for (const file of [".claude/hooks/guard-bash.sh", ".claude/settings.json", ".claude/settings.local.json", "/Users/someone/.claude/settings.json"]) {
      expect(run("guard-files.sh", { file_path: path.isAbsolute(file) ? file : path.join(root, file) }).denied, file).toBe(true);
    }
  });

  it("allows edits everywhere else", () => {
    for (const file of ["server/fcp.ts", "CLAUDE.md", ".claude/skills/plan-generator-changes/SKILL.md"]) {
      expect(run("guard-files.sh", { file_path: path.join(root, file) }).denied, file).toBe(false);
    }
  });
});

describe("Hook registration", () => {
  it("registers both guards as PreToolUse hooks in the project settings", () => {
    const settings = JSON.parse(readFileSync(path.join(root, ".claude/settings.json"), "utf8"));
    const entries = settings.hooks.PreToolUse as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
    expect(entries.find(entry => entry.matcher === "Bash")?.hooks[0].command).toContain(".claude/hooks/guard-bash.sh");
    expect(entries.find(entry => entry.matcher.includes("Edit") && entry.matcher.includes("Write"))?.hooks[0].command).toContain(".claude/hooks/guard-files.sh");
  });
});
