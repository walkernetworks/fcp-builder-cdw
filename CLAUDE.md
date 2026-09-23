# FCP Builder

Internal CDW web app that turns RVTools exports into Functional Consumption Plans (HTML/PDF). TypeScript, React + Vite client, Express + tRPC server, MySQL via Drizzle, PDF via puppeteer-core + Chromium. Package manager is pnpm (version pinned in `package.json`); Node 22 (matches `Dockerfile`).

## Commands

- `pnpm check`: TypeScript, no emit
- `pnpm test`: full Vitest suite. Prefer a single file while iterating: `pnpm test server/pdf.test.ts`
- `pnpm build`: production client and server bundle into `dist/`
- `pnpm catalog:validate`: validates the HCL catalog in `shared/hclCatalog.ts`
- `pnpm exec drizzle-kit migrate`: apply migrations in `drizzle/`. Avoid `pnpm db:push`, which also runs `drizzle-kit generate` and can create new migration files.

Known failure: `server/rvtools-supplied-verify.test.ts` reads `/home/ubuntu/upload/Franklin_Park.xlsx`, a customer workbook that is not in the repo. Ignore it unless that file is provided.

## Where things are

- `shared/fcp.ts`: engagement document model, schema, and plan/timeline generation. This is the core domain logic.
- `server/fcpRenderer.ts`: FCP HTML document; the PDF is rendered from this HTML by `server/pdf.ts`
- `server/compatibilityHandoffRenderer.ts`: compatibility delivery handoff document
- `server/routers.ts`: all tRPC procedures; `server/db.ts`: data access (always owner-scoped)
- `server/trustedSso.ts`: sign-in; `server/exportTickets.ts` + `server/exportDownloadRoutes.ts`: signed download links
- `client/src/pages/Home.tsx`: main workspace; `client/src/components/`: `PlanSetup`, `AdoptionTimelineEditor`, `DetailedAdoptionIntake`, `CompatibilityHandoffPanel`
- `client/src/lib/rvtools.ts`: RVTools XLSX/CSV parsing, in the browser only
- `shared/hcl.ts`, `shared/hclCatalog.ts`: hardware compatibility data

## Rules

- **Sign-in is gateway-only.** Identity comes from trusted OIDC gateway headers (`FCP_AUTH_MODE=trusted-proxy`); the app has no login flow. Do not add OAuth, session cookies, or any hosted-platform integration.
- **No Manus or other third-party platform code.** `server/noThirdPartyPlatform.test.ts` must keep passing.
- **Raw RVTools data never leaves the browser.** Only aggregate facts are sent to the server and stored.
- **No outbound network calls from the app** other than the database. Exported HTML must be self-contained, with no external fonts, scripts, or images.
- **Every engagement query stays scoped to the signed-in owner.**
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
