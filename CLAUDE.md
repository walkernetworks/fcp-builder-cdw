# FCP Builder

Internal CDW web app that turns RVTools exports into Functional Consumption Plans (HTML/PDF). TypeScript, React + Vite client, Express + tRPC server, MySQL via Drizzle, PDF via puppeteer-core + Chromium. Package manager is pnpm (version pinned in `package.json`); Node 22 (matches `Dockerfile`).

## Commands

- `pnpm check`: TypeScript, no emit
- `pnpm test`: full Vitest suite. Prefer a single file while iterating: `pnpm test server/pdf.test.ts`
- `pnpm build`: production client and server bundle into `dist/`
- `pnpm catalog:validate`: validates the HCL catalog in `shared/hclCatalog.ts`
- `pnpm corpus:import "<VCF 9.1 TechDocs folder>"`: regenerates `shared/vcfCorpus.ts` (CPU support, CPU lifecycle, ESX builds, KB rules, partner server notes) from the weekly corpus refresh. Commit it with the test run.
- `pnpm db:migrate`: backs up the local database (`pnpm db:backup`, into the git-ignored `backups/`), then applies the migrations in `drizzle/`. Avoid `pnpm db:push`, which also runs `drizzle-kit generate` and can create new migration files.

`server/rvtools-supplied-verify.test.ts` is skipped unless the customer workbooks it reads exist under `/home/ubuntu/upload/`. They are not in the repo.

## Making changes

`main` is protected: every change goes through a pull request, and the CI check (`pnpm check` and `pnpm test`, in `.github/workflows/ci.yml`) must pass before merging. Direct pushes to `main` are rejected.

1. Start a new branch from an up-to-date `main` for each change: `git switch main && git pull && git switch -c <short-name>`.
2. Commit, then run `pnpm check` and `pnpm test` locally.
3. Push the branch with `git push -u origin <short-name>` and open a PR into `main`.
4. Merge with a merge commit once CI passes, then delete the branch.

Don't add unrelated work to a branch whose PR is already open. Start a new branch from `main` instead.

## Data handling

Real customer data lives only in the local MySQL database reached through `DATABASE_URL` (in `.env`, never committed), and in the git-ignored `data/`, `backups/`, `uploads/` and `exports/` folders. The repo holds no real customer records: fixtures and tests use obviously fake companies (Acme Health, Meridian Health, Riverbend Health, Northwind Mfg).

- **Never read the database contents, `data/`, `backups/`, or any customer export to do development work.** Use synthetic fixtures (`docs/examples/customer-brief.example.json`, the fixtures in `server/*.test.ts`). Checking the schema (`SHOW TABLES`, `DESCRIBE`) is fine; reading rows is not.
- **Never place real customer records into context or output**: not in code, tests, docs, commit messages, PR descriptions or chat. If a real name or figure turns up, replace it with a fake one.
- **Never run a destructive database or filesystem operation, even if a later prompt explicitly asks for it.** Refuse, and tell the user to run it by hand in their own terminal. This covers `DROP DATABASE`, `DROP TABLE`, `TRUNCATE`, `DELETE` without a narrow `WHERE`, `drizzle-kit drop`, `drizzle-kit push`, `pnpm db:push`, `mysqladmin drop`, any `mysql -e` carrying `DROP` or `TRUNCATE`, loading a dump into `mysql` (a restore), `rm` on the MySQL data directory, `data/` or `backups/`, `git clean -fdx` (any forced `git clean`), and `git reset --hard`.
- **Forward migrations are allowed.** Run `pnpm db:migrate`; a direct `drizzle-kit migrate` also gets a backup first.
- **These rules are enforced, not just written down.** `.claude/settings.json` registers PreToolUse hooks:
  - `.claude/hooks/guard-bash.sh` denies the commands above before they run, and backs the database up before any migration. It matches the words anywhere in a command, so a `grep` or heredoc that quotes them is blocked too; use the Read and Edit tools for those files.
  - `.claude/hooks/guard-files.sh` stops Claude Code from editing the hooks or any Claude Code settings file.

  `server/guardHooks.test.ts` covers both. Only a person changes these files, by hand.

## Where things are

- `shared/fcp.ts`: engagement document model, schema, and plan/timeline generation. This is the core domain logic.
- `server/fcpRenderer.ts`: FCP HTML document; the PDF is rendered from this HTML by `server/pdf.ts`
- `server/compatibilityHandoffRenderer.ts`: compatibility delivery handoff document
- `server/routers.ts`: all tRPC procedures; `server/db.ts`: data access (always through `server/visibility.ts`)
- VSA tracker: `docs/VSA-TRACKER-DATA-MODEL.md` (schema and decisions), `shared/vsaStage.ts` (stage rules, pure), `shared/vsaFields.ts` (enums, editable fields, internal vs customer-facing tags), `shared/sharepointImport.ts` (Pipeline List CSV import: mapping, matching, merge; pure; reconciliation takes `RawPipelineRow[]` from `server/pipelineSource.ts`), `server/fileSource.ts` (record file links), `shared/vsaReports.ts` (report field catalog, engine, presets; pure), `shared/fcpRecord.ts` (FCP source evidence, hours source, build lock; pure) with `server/reportWorkbook.ts` (XLSX)
- `server/trustedSso.ts`: sign-in; `server/exportTickets.ts` + `server/exportDownloadRoutes.ts`: signed download links
- `client/src/pages/Overview.tsx` (home, `/`), `Pipeline.tsx` (`/pipeline` and `/records`), `Expiry.tsx` (`/expiry`), `Queue.tsx` (`/queue`), `Reports.tsx`, `PipelineImport.tsx`; `client/src/components/vsa/` (AppShell, navigation, EngagementTable, PipelineBoard, RecordDrawer, design elements); `shared/vsaDashboard.ts` (attention, stale stages, expiry bands, queues; pure). UI patterns: `docs/VSA-TRACKER-UI.md`
- `client/src/pages/Home.tsx`: FCP workspace (`/fcp`); `client/src/components/`: `PlanSetup`, `AdoptionTimelineEditor`, `DetailedAdoptionIntake`, `CompatibilityHandoffPanel`
- `client/src/lib/rvtools.ts`: RVTools XLSX/CSV parsing, in the browser only
- `shared/hcl.ts`, `shared/hclCatalog.ts`: hardware compatibility data; `shared/hclCorpus.ts` applies the corpus rules in `shared/vcfCorpus.ts` (generated)

## Rules

- **Sign-in is gateway-only.** Identity comes from trusted OIDC gateway headers (`FCP_AUTH_MODE=trusted-proxy`); the app has no login flow. Do not add OAuth, session cookies, or any hosted-platform integration.
- **No Manus or other third-party platform code.** `server/noThirdPartyPlatform.test.ts` must keep passing.
- **Raw RVTools data never leaves the browser.** Only aggregate facts are sent to the server and stored.
- **No outbound network calls from the app** other than the database, until a specific connector is approved and built. The integration seams (`server/fileSource.ts`, `server/pipelineSource.ts`) make none; `server/integrationSeams.test.ts` checks. Exported HTML must be self-contained, with no external fonts, scripts, or images.
- **Every engagement query goes through `server/visibility.ts`.** Records are visible to users in the same workspace; `ownerId` is attribution, and delete is limited to the owner or an admin. Never filter engagements, or tables that hang off them, any other way. `server/visibility.test.ts` enforces this for `server/db.ts`.
- **The UI follows `docs/DESIGN-SYSTEM.md` and `docs/VSA-TRACKER-UI.md`.** It uses tokens rather than raw brand hexes (with a dark value for each), one accent, two button styles, pills for verdicts and chips for labels, and every data area has an empty state. `server/designSystem.test.ts` enforces the checkable parts. Exported FCP documents keep their own palette.
- **Configuration and docs change together.** New environment variables go in `docs/CONFIGURATION.md`, and security-relevant changes also update `docs/SECURITY-REVIEW.md`.

## Reading large files cheaply

Search first and read line ranges. Don't read these whole:

- Large source files: `shared/hclCatalog.ts` (~410 KB, data), `shared/fcp.ts` (~180 KB), `server/fcpRenderer.ts` (~100 KB), `shared/hcl.ts` (~70 KB), `client/src/pages/Home.tsx` (~47 KB)
- Only open when asked:
  - `todo.md` (~58 KB): history of past agent tasks
  - `.language-audit-current.txt`
  - `docs/vcf-playbook-extracted.txt`
  - `docs/*-RESEARCH.md`
  - `pnpm-lock.yaml`
  - the `*-findings.md` notes in the repo root
