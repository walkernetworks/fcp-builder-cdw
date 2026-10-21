---
name: plan-generator-changes
description: Use when changing how FCP plans are generated or worded (shared/fcp.ts timelines, activity labels, dependsOn/outcome text, prerequisites, durations, pathways, bar ids) or the Building Blocks mapping. Keeps saved engagements current on load and export so users never have to click Rebuild or lose hand edits.
---

# Changing the plan generator without forcing rebuilds

Saved engagements store their generated timelines. Users must never need **Rebuild Plans** / **Apply Playbook Template** to pick up a generator change, and hand edits must never be lost. `migrateDocument` in `shared/fcp.ts` runs whenever a document is loaded in the workspace (which then auto-saves if anything changed) and whenever it is exported (`server/exportDownloadRoutes.ts`). That is where saved plans are brought up to date.

## How saved plans are kept current

- `planAuthority: "generated"` (nobody edited the plan): `migrateDocument` returns the freshly generated `adoptionTimeline`, `twoYearPlan`, and `rationale`. Both timeline editors set `planAuthority: "manual"` on any edit, so this is safe.
- `planAuthority: "manual"` (hand-edited): `withRefreshedActivityDetails` keeps every position, label, and added or removed activity. It refreshes only `dependsOn`, `outcome`, and `prerequisites` on activities whose id the generator still produces, and renames legacy generated labels (`LEGACY_GENERATED_LABELS`).
- The `rationale` is always regenerated.

## Rules for a generator change

1. **Keep bar ids stable.** Refresh and the Building Blocks mapping match by id. If an id must change, map the old id to the new one in `migrateDocument` so manual plans keep their refresh, and update `shared/buildingBlocks.ts` rules and `GENERATED_BAR_ID`.
2. **Renaming a generated label?** Labels on manual plans are never overwritten, because users rename activities. Add the old label and its new wording to `LEGACY_GENERATED_LABELS` in `shared/fcp.ts` so only the untouched generated wording is replaced.
3. **Changing wording** (`dependsOn`, `outcome`, notes): no migration needed. It reaches manual plans through the refresh, and generated plans through regeneration.
4. **Changing positions or durations**: it reaches generated plans only. Never move activities in a manual plan.
5. **New fields** on the document or `adoptionDetails`: add a zod `.default(...)` and a value in `createDefaultAdoptionDetails` / `createDefaultFields` so older saved documents still parse.
6. **Never write engagement rows directly** to "fix" a plan. Let `migrateDocument` do it on load or export.

## Verify before committing

- `pnpm check` and `pnpm test`. `server/planGenerator.test.ts` ("loading saved plans") covers regeneration and hand-edit preservation. Extend it when you add a legacy label or id mapping.
- Dry-run the migration against synthetic plans only: never read rows from the database (see "Data handling" in CLAUDE.md). Build saved plans from the fake fixtures (`docs/examples/customer-brief.example.json`, `server/twoSiteReview.test.ts`), store a `manual` copy with hand edits and a `generated` copy, run `migrateDocument`, and compare against the stored plan:
  - For `manual` plans, activities moved must be 0, labels changed must be only intended legacy renames, and activity counts must be unchanged.
  - For `generated` plans, report the new window (first and last column) and `validateTimeline` errors (expect 0).
  If a check against the user's real engagements is wanted, give the user the throwaway script to run in their own terminal and ask for the counts only.
- Tell the user to refresh the browser tab; the dev server (`tsx watch` + Vite) picks up code changes itself.
