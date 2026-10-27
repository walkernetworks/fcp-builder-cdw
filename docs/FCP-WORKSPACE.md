# FCP Workspace: build plan

This is the FCP Workspace design (`FCP-WORKSPACE-DESIGN.md`, kept outside the repo) mapped onto the real code. It names the components, routes, procedures and fields involved, maps today's UI onto the eight sections, and gives the Phase 1 plan in enough detail to build from. Where the design and the code disagree, section 3 says how and proposes a correction. Nothing in this document has been decided until it is reviewed.

**Review (2026-10-23):** the decisions are recorded in section 8. Where a decision changed this plan, the section concerned has been updated.

**Base branch:** `fcp-workspace` was cut from `vsa-tracker` (83c5a7d). `stageEvents`, `sourceChainItems`, `engagementAssignments`, `fcpVersions` and the record drawer exist only on `vsa-tracker`. That branch is open as PR #39 into `main` and already contains `main` (#37 BSAS, #38 hours fill). Each phase PR targets `vsa-tracker` until #39 merges, then is retargeted to `main`.

---

## 1. What exists today

### 1.1 Route and page

- `/fcp` → `client/src/pages/Home.tsx` (`Home`). The engagement is chosen by `?engagement=<id>`, and `/` redirects there when that parameter is present. The step is chosen by `?stage=`.
- The record has no page of its own. It opens as a drawer (`client/src/components/vsa/RecordDrawer.tsx`, opened with `useShell().openRecord(id, tab)`) with the tabs `overview | stage | sources | people | files | fcp`. The drawer's FCP tab links to `/fcp?engagement=<id>`, and that is the only deep link into the workspace (`RecordDrawer.tsx:251`).
- `Home` owns all workspace state: it loads with `engagement.get`, autosaves through `engagement.update` (debounced 1.3 s, and only while this user holds the build lock), takes the build lock with `useBuildLock` (`fcpRecord.acquireLock`), refreshes the preview with `document.preview` (debounced 350 ms), and exports with `document.downloadTicket` and then `/api/download/<ticket>`. The `engagements` table already carries `rowVersion`, `buildLockUserId` and `buildLockAt`.

### 1.2 Today's six steps and what each one renders

| `WorkspaceStage` id | Label | Components rendered (in order) |
|---|---|---|
| `engagement` | 01 Engagement | `CustomerBriefImport`; `PlanSetup step="upload"` (RVTools drop and `InventoryCards`); `PlanSetup step="customer"` (customer, segment, edition, funding, entitlement, BSAS, compatibility target release) |
| `plan` | 02 Service Plan | `ScopeAtGlance` (in Home); `PlanSetup step="timeline"` (planned start, implementation start, completion, cadence, hardware, `priorities`, `DetailedAdoptionIntake`, `timelineNotes`); the manual-plan "Apply Playbook Template" banner; `WorkPackageRegister` (in Home) |
| `staffing` | 03 Entitlement Adoption Timeline | `StaffingSummary`; the delivery basis (`document.rationale`) with Rebuild; tabs: `EntitlementTimelineWithHours` (`WorkPackageHours.tsx`, which wraps `AdoptionTimelineEditor`, `RoleHoursEditor`, `EntitlementFitPanel`, `HoursFillPanel`) and `NotionalTimelineWithHours` |
| `technical` | 04 Technical Handoff | `PlanSetup step="review"` (`InventoryCards`, the compatibility handoff with `CompatibilityHandoffPanel`, `HclEstateFindings`); `DeliveryBriefing` |
| `report` | 05 FCP Report Content | `ReportContentEditor` |
| `package` | 06 Delivery Package | `DeliveryPackageHeader`; `CondensedReportPanel` (scoped effort, assignments in force, the internal fit check, and the **raw JSON "Edit report content" dialog**); two `ExportPreferenceCard`s; `DeliverableCard`s (Condensed FCP, Functional Consumption Plan (full), Compatibility Delivery Handoff, Building Blocks for Commercial customers); the live preview iframe |

The header (`Home.tsx:283`) holds Switch engagement, the title, the save state, Tracker details, Versions (`FcpVersionsSheet`), Save, Rebuild plans, and New, Duplicate and Delete. `EngagementCommandBar` and `FcpRecordStrip` (stage, source checklist, hours source) sit above the steps.

### 1.3 Answers to design section 13

1. **Which component owns which section:** see the table in 1.2.
2. **"FCP Report Content" is not a raw JSON textarea.** Step 05 is `ReportContentEditor`, a structured accordion that edits `document.report`. Its sections are, in order: `entitlement`, `heard`, `problems`, `questions`, `people`, `milestones`, `open-items`, `cover` / `situation`, `profile`, `elements`, `technical`, `constraints`, `asks`, `customer-work` / `sizing`, `environment`, `licensing` (which includes `declined`), `assignments`, `details` (`deliveryModel`, `revision`, `sources`). Each list has add, remove, and override or hide of generated rows (`hiddenGenerated`). The raw JSON textarea exists separately, as "Edit report content" in `CondensedReportPanel` on step 06. It validates against `reportSchema` and replaces all of `report`. The only `report` key with no structured editor is **`contacts`**; it is set only by brief import or that JSON dialog.
3. **How the template is chosen today.** No toggle chooses it. Instead:
   - The **live preview always renders the full template**: `document.preview` calls `renderFcpHtml` (`server/routers.ts:251`). So the preview a user sees today is *not* the condensed FCP they send.
   - **Export** is chosen by which `DeliverableCard` is clicked: `documentType` is `"fcp"` (full, `renderFcpHtml`) or `"condensed-fcp"` (`renderCondensedFcpHtml` plus `checkCondensedFcp` gates), in `server/exportDownloadRoutes.ts:50-61`. Both `startExport` and `document.downloadTicket` default to `"fcp"`.
   - **Version preview and version HTML download** in `FcpVersionsSheet` use `document.preview` and `document.html`, both of which call `renderFcpHtml`.
   - `document.html` and `document.pdf` (`routers.ts:261-265`) also call `renderFcpHtml`. `document.pdf` has no client caller.
4. **The `fcpVersions` rows already hold a full snapshot.** Columns: `id, engagementId, versionNumber (int, unique per engagement), title, data (the whole EngagementDocument JSON), dataHash (SHA-256, so an unchanged document is not saved twice), label varchar(160), reason enum(manual, submitted, export, restore), createdByUserId, createdAt`. A version is written on Save version, when a record leaves FCP Draft (`db.ts:406`), on every `fcp` or `condensed-fcp` export, and before a restore. `versionNumber` therefore counts *every* snapshot, not only issues. There is no effort snapshot, no rendered HTML, no status, and no approval columns. Procedures: `fcpRecord.versions`, `fcpRecord.version`, `fcpRecord.saveVersion`, `fcpRecord.restoreVersion`.
5. **Which `fields` have UI, and which are import-only or have no UI at all:**

| Field | UI today | Notes |
|---|---|---|
| `customerName`, `accountId`, `location`, `primaryContact`, `customerSegment`, `fundingSource`, `entitlementAmount`, `entitlementStart`, `bsasHours`, `bsasStart`, `bsasEnd`, `compatibilityTargetRelease` | `PlanSetup` customer | `customerName` is also written by the tracker (drawer, board, import). |
| `entitlementEnd` | read-only | Shown as start + 12 months (`calculateEntitlementEndDate`), never editable. |
| `adoptionDetails.platformEdition` | `PlanSetup` customer | Shown only when `customerSegment === "commercial"`. |
| `plannedProjectStart`, `plannedImplementationStart`, `targetComplete`, `adoptionCadence`, `hardwareAvailability`, `hardwareLeadWeeks`, `priorities`, `timelineNotes` | `PlanSetup` timeline | `targetStart` is legacy, a fallback for `plannedProjectStart`, and has no UI. |
| `adoptionDetails.upgradePath`, `domainTopology`, `principalStorage`, `componentDepths`, `softPrerequisites`, `industryTemplate`, `notes` | `DetailedAdoptionIntake` | |
| `adoptionDetails.domains` | **import only** | Set by the brief (`briefImport.ts`). |
| `adoptionDetails.followOnOnly` | **import only** | |
| `exportPreferences.*` | Home step 06 | |
| `hoursModel`, `estimateInputs.blendedRate`, `estimateInputs.monthsRemaining` | `EntitlementFitPanel` | Internal. |
| `estimateInputs.reservePercent` | `PlanSetup` customer | |
| `hoursFill` | `HoursFillPanel` | |
| the other ~60 `estimateInputs` keys (topology, waves, add-on sizing) | **no UI, and not set by import either** | `resolveInputs` (`shared/hoursV2.ts`) falls back to RVTools, `report.discovery` or a default, and records each fallback as an `Assumption`. That assumption list is the natural source for Phase 2 provenance. |

---

## 2. Names the build uses

| Design term | Real name |
|---|---|
| Engagement record | `engagements` row; `trpc.tracker.get({ id })` returns record, sources, assignments, stage |
| Document | `EngagementDocument` (`shared/fcp.ts`), stored in `engagements.data`; `migrateDocument` runs on load and on export |
| Report content | `document.report`, `ReportContent` / `reportSchema` (`shared/report.ts`); `effectiveReport` (`shared/reportView.ts`) merges in generated rows |
| Effort | `ScopedEffort` (`shared/effort.ts`), computed server-side by `scopedEffortForDocument` (`server/rateCard.ts`; rates never reach the client), exposed as `effort.scoped` |
| Signed resource assignments (hours) | `document.report.resourceAssignments` (**not** `engagementAssignments`; see C-2) |
| Record roles (people) | `engagementAssignments.role`, `ASSIGNMENT_ROLES` (`shared/vsaFields.ts`) |
| Source checklist | `sourceChainItems` (`kind` in `SOURCE_ITEM_KINDS`, `status` in `SOURCE_ITEM_STATUSES`); `tracker.setSourceItem` etc.; `sourceUpdatesFromDocument` (`shared/fcpRecord.ts`) ticks items off on save |
| Hours source | `hoursSource(document)` (`shared/fcpRecord.ts`): `signed-assignment`, `catalog-estimate` or `bracket-estimate` |
| Build lock | `fcpRecord.acquireLock` / `releaseLock`, `useBuildLock`, `buildLockState` |
| Customer content gates | `checkCondensedFcp(html, { customerName, entitlementValue, bsasOnly })` (`server/condensedFcpChecks.ts`) |
| Condensed renderer | `renderCondensedFcpHtml(title, document, { today?, effort })` |
| Delivery motion / pathway | `fields.adoptionDetails.upgradePath`: `undecided, in-place, converge, import-workload-domain, greenfield, hybrid, design-only`; packages from `playbookPlanForFields` |
| Capability cards | `fields.priorities` plus `adoptionDetails.componentDepths`; not-requested is `report.declined` |
| Plan rows | bars of `document.adoptionTimeline` / `twoYearPlan`; per-package hours in `report.workPackageHours` (`architect`, `srConsultant`, `projectManager`, `placement`, `owner`); categories are `FIXED_GANTT_CATEGORIES` |
| Consumption | today a single `report.entitlement.hoursConsumed` plus `consumedAsOf` |

---

## 3. Where the design and the code disagree

Each item gives the proposed correction. I need a yes or no on each.

- **C-1. No record page or Activity tab.** The record is a drawer, and the drawer has no Activity tab (stage history is on its `stage` tab). *Proposal:* `/engagements/:id/fcp` becomes a full page of its own (it is the FCP workspace, not a tab of a record page). The drawer's "Open FCP workspace" link points to it, and `/fcp?engagement=<id>` redirects to it. Phase 3's "Activity tab entries" become `stageEvents` rows (and version events) shown on the drawer's `stage` tab. A record page with Overview and Activity tabs is out of scope here.
- **C-2. Signed hours are not in `engagementAssignments`.** That table holds one named person per record role. The signed hours that replace the estimate are `report.resourceAssignments`, and `ScopedEffort.source === "assignments"` reads from there. *Proposal:* the Plan section's hours source stays on `report.resourceAssignments`. `engagementAssignments` feeds only "who is involved" and role views.
- **C-3. `versionNumber` already counts every snapshot.** Exports, submits, manual saves and restores all take a number, so existing records already show "v7" with nothing issued. The design's v1, v2 issue numbering cannot reuse that column without renumbering history. *Proposal (Phase 3):* add `issueNumber int NULL`, unique per engagement when not null, and `status enum(snapshot, draft, issued, superseded) default 'snapshot'`. The customer sees `issueNumber`; existing rows stay `snapshot`. `label` stays varchar(160), not 120. `data` is already the `documentSnapshot`; add `effortSnapshot`, `renderedHtml` and `renderHash` beside it.
- **C-4. The live preview today is the full template.** "Every existing FCP opens and renders identically" can only refer to the *condensed* output and exports. The on-screen preview changes, from full to condensed, by intent.
- **C-5. The condensed renderer has no draft or watermark option.** Phase 1 adds an optional `draft?: boolean` to `CondensedFcpOptions`. When absent, the output is byte-identical, so the golden files hold. This is the one addition to a file on the preserve list, and it is additive.
- **C-6. Draft watermark on PDFs (design decision 14.6).** Until Phase 3 nothing is ever "issued", so watermarking draft exports in Phase 1 would watermark every PDF customers receive today. *Proposal:* Phase 1 puts the watermark on the preview only. Phase 3 adds it to draft exports once issuing exists.
- **C-7. `compatibilityHandoffRenderer` is not exclusive to `fcpRenderer`.** It backs the Compatibility Delivery Handoff deliverable (`plan-output`). `fcpRenderer.ts` only re-exports it as `renderHclCompatibilityPlanOutputHtml`. *Proposal:* Phase 1 points `exportDownloadRoutes.ts` at `renderCompatibilityHandoffHtml` directly. Phase 6 deletes `fcpRenderer.ts` and keeps `compatibilityHandoffRenderer.ts`.
- **C-8. Segment and edition are three different things.** `fields.customerSegment` is `unspecified | commercial | corporate` and drives the Building Blocks workbook. `engagements.segment` is `corporate | strategic | commercial`, belongs to the tracker, and drives gates. `adoptionDetails.platformEdition` is `vcf | vvf`. Nothing keeps the first two in step, and `fields` has no "strategic". *Proposal:* Phase 1 leaves the `PlanSetup` select as it is. Phase 2 shows the tracker segment read-only in Engagement with a readiness warning when the two disagree. Whether to derive `customerSegment` from `engagements.segment` is a decision for Phase 2 (D-6).
- **C-9. The source checklist uses different kinds and statuses.** `SOURCE_ITEM_KINDS` are `rvtools, discovery_notes, customer_brief, hardware_review, hours_source, broadcom_ser, other`; `SOURCE_ITEM_STATUSES` are `needed, requested, received, verified, waived`. The design wants per-kind statuses (Scheduled / Recorded / Transcript attached) and a "customer contacts" source. *Proposal:* keep the shared status enum and show per-kind labels for it in the UI (for example `discovery_notes`: requested = Scheduled, received = Recorded, verified = Transcript attached). Read "Customer contacts" from `report.contacts` and `engagementAssignments`, not from a source row. Settle this in Phase 5.
- **C-10. The entitlement end is not editable.** `entitlementEnd` is always shown as start + 12 months. The design's "assumed until confirmed" (5.3) needs it editable plus a confirmation flag. That belongs to Phase 2 (provenance), not Phase 1.
- **C-11. Golden files cover one fixture, not four.** The only goldens are `server/__golden__/condensed-no-bsas.html` and `full-no-bsas.html` (`server/bsas.test.ts`), built from `docs/examples/customer-brief.example.json` ("Example Health System"). Acme Health, Meridian Health, Riverbend Health and Northwind Mfg appear in assertion tests but have no golden copy. *Proposal:* the first Phase 1 commit, made before any other change, adds condensed goldens for those four, built from the existing test fixtures. Each later diff then shows.
- **C-12. The JSON editor is still the only way to reach `report.contacts`.** *Proposal:* Phase 1 keeps "Edit report content (JSON)" in an Advanced menu in Review and Issue. Phase 5 adds a contacts editor and removes the JSON dialog.

---

## 4. Today's UI in the eight sections

Phase 1 moves editors; it does not change them. A **split** means an existing `TabsContent` or accordion group is divided into two by moving its JSX verbatim. No field, handler or behaviour changes.

| New section | Phase 1 content (existing components) | Moves in later phases |
|---|---|---|
| **1 Sources** | `FcpRecordStrip` (stage, source checklist, hours source) with "Edit sources" opening the drawer's `sources` tab; `CustomerBriefImport` (Import from Cowork) | P5: an inline `sourceChainItems` checklist, Draft from discovery, Start from scratch, a diff before applying an import |
| **2 Engagement** | `PlanSetup step="customer"`, the who-and-what half: customer name, account ID, location, primary contact, customer segment, platform edition. `PlanSetup step="schedule"`: planned project start, implementation start, completion, cadence | P2: tracker segment shown read-only, delivery model moved here from Review's `details`, provenance chips |
| **3 Funding** | `PlanSetup step="funding"`: funding source, entitlement amount, reserve %, entitlement start and end, BSAS hours, start and end. `ReportContentEditor` sections `entitlement` (entitled hours, consumed, as of) and `licensing` | P2: internal panel (blended rate, entitled-hours derivation), assumed dates. P3: `fcpConsumptionEntries` table |
| **4 Estate** | `PlanSetup step="upload"` (RVTools and `InventoryCards`); compatibility target release (moved from customer); `PlanSetup step="review"` (handoff, `CompatibilityHandoffPanel`, `HclEstateFindings`); `DeliveryBriefing`; `ReportContentEditor` sections `sizing`, `environment` | P2: assumed host counts |
| **5 Scope** | `ScopeAtGlance`; `PlanSetup step="scope"`: hardware availability and lead time, `priorities`, `DetailedAdoptionIntake`; the manual-plan Apply Playbook banner; `ReportContentEditor` sections `profile`, `elements` | P2: capability cards, read-only pathway packages |
| **6 Plan** | `WorkPackageRegister`; `StaffingSummary`; delivery basis and Rebuild; `timelineNotes` (moved from the timeline step); tabs `EntitlementTimelineWithHours` and `NotionalTimelineWithHours` (with `RoleHoursEditor`, `EntitlementFitPanel`, `HoursFillPanel` inside, unchanged); the scoped-effort and fit-check body of `CondensedReportPanel`; `ReportContentEditor` sections `assignments`, `customer-work` | P2: fit check, gap and risk band in the locked internal panel |
| **7 Narrative** | `ReportContentEditor` sections `heard`, `problems`, `questions`, `people`, `milestones`, `open-items`, `cover`, `situation`, `technical`, `constraints`, `asks` | P2: open items need an owner. P5: draft from transcript, contacts editor |
| **8 Review and Issue** | `DeliveryPackageHeader`; the two `ExportPreferenceCard`s; `DeliverableCard`s for **Condensed FCP** (titled "Functional Consumption Plan"), Compatibility Delivery Handoff and Building Blocks (the full-template card is removed); `ReportContentEditor` section `details` (revision note, sources); Advanced: "Edit report content (JSON)" | P2: full readiness list. P3: Issue, approvals, change summary |

Required component changes, all mechanical:

- `PlanSetup`: the `step` union gains `funding`, `schedule` and `scope`. `customer` is split into `customer` and `funding`, and `timeline` into `schedule`, `scope` and the `timelineNotes` field (exported as a small `TimelineNotesField`). `compatibilityTargetRelease` moves to `upload`. `updateFields`, `importFiles` and the derived-plan rebuild are unchanged. The old `customer` and `timeline` values stay, rendering their combined content, until `Home` retires.
- `ReportContentEditor`: gains an optional `sections?: string[]` prop. When it is set, only those `Section` values render, and a `Group` with none of them left is omitted. The default renders everything, as today.
- `CondensedReportPanel`: gains an optional `showJsonEditor?: boolean` (default `true`) so Plan can show the effort body without the JSON button. The JSON dialog becomes its own exported `ReportJsonDialog`, used in Review's Advanced menu.
- `Home.tsx` helpers (`ScopeAtGlance`, `WorkPackageRegister`, `StaffingSummary`, `DeliveryPackageHeader`, `DeliverableCard`, `ExportPreferenceCard`, `StageAdvance`) move unchanged to `client/src/components/fcp/workspaceParts.tsx`.

---

## 5. Phase 1 plan: shell and preview

### 5.1 Scope

The three-column workspace on `/engagements/:id/fcp`, with the existing editors in the eight sections, a live condensed preview with a draft watermark, and no UI path to `renderFcpHtml`. There is no readiness logic, no provenance, no new tables and no migrations.

### 5.2 Server

1. `server/condensedFcpRenderer.ts`: `CondensedFcpOptions` gains `draft?: boolean`. When it is true, one inline style and one element are added just after `<body>`: a fixed-position, diagonal, low-opacity "DRAFT, not for distribution" text. `position: fixed` repeats it on every printed page in Chromium. It is self-contained (no fonts or images). It must not trip `checkCondensedFcp`: it contains no `$`, rate, fit, gap or risk wording, which a test asserts. When it is false or absent, nothing changes.
2. `server/routers.ts`:
   - `document.preview` → `{ html: renderCondensedFcpHtml(title, data, { effort: scopedEffortForDocument(data), draft: true }), checks: checkCondensedFcp(html, …) }`. The `checks` array is returned for Phase 2 and ignored by the Phase 1 UI.
   - `document.html` and `document.pdf` render the condensed FCP. `document.html` is used for version downloads, and gets `draft: true` because no saved snapshot is an issued version yet (C-3).
   - In `document.downloadTicket`, the default `documentType` changes from `"fcp"` to `"condensed-fcp"`. The `"fcp"` value stays accepted for one release, with no UI path reaching it (design section 9), marked `@deprecated`.
   - Remove the `renderFcpHtml` import from `routers.ts`.
3. `server/exportDownloadRoutes.ts`: `plan-output` calls `renderCompatibilityHandoffHtml` directly (C-7). The `"fcp"` branch keeps calling `renderFcpHtml` and is marked deprecated.
4. `server/fcpRenderer.ts`: add a `@deprecated` JSDoc on `renderFcpHtml` and `renderHclCompatibilityPlanOutputHtml`. No other change.

### 5.3 Client

1. **Route.** In `App.tsx`, add `/engagements/:id/fcp` → `client/src/pages/FcpWorkspace.tsx`, declared before `/fcp`. In the **last commit of Phase 1**, after acceptance (D-1):
   - `/fcp?engagement=<id>` (and the `/` redirect) goes to `/engagements/<id>/fcp`, keeping `?section=`, which is mapped from the old `?stage=` (`engagement→engagement`, `plan→scope`, `staffing→plan`, `technical→estate`, `report→narrative`, `package→review`).
   - `/fcp` with no engagement renders `FcpPicker` (`NoSelection` and the New FCP dialog, moved from `Home`).
   - `Home` is unrouted but kept.
   - In `RecordDrawer.tsx:251`, the link becomes `/engagements/${record.id}/fcp`.
2. **State hook.** Move the engagement state out of `Home` into `client/src/lib/useFcpEngagement.ts`, unchanged: load and migrate, hydrate, the tracker-rename reconciliation, autosave gated on the lock, `saveNow`, `mutateDocument` with the read-only toast, `buildPlan`, `startExport`, and the debounced preview. Both `Home`, for as long as it stays, and `FcpWorkspace` use it, so the behaviour is identical by construction.
3. **Layout** (`FcpWorkspace.tsx`, design-system tokens only: `bg-surface`, `s50`–`s600`, `text-ink`, `state-*`, never `bg-white`):
   - **Header.** Customer name and the tracker `opportunityNumber`, from `tracker.get`; a stage chip; the save state ("Saved", "Saving…", "Unsaved changes", "Read only"); Tracker details (`openRecord`); Versions (`FcpVersionsSheet`); Save; Rebuild plans; Export PDF (condensed); and a More menu with New, Duplicate and Delete. The read-only lock banner is the existing one.
   - **Left rail** (`w-56`, sticky). Eight `<button>`s with a status dot: empty, partial or complete, taken from the existing `stageDefinitions` checks mapped to sections. Phase 2 replaces them with readiness. Below them, **History** from `fcpRecord.versions`: the most recent five, each showing save time, who saved and the reason chip, with no "v" prefix. "All history" opens the sheet, relabelled per D-3. Up and down arrow keys move between sections when the rail has focus.
   - **Centre.** The selected section: a heading, a one-line purpose (the "why" from design section 5), then the section's components from section 4 above. It is wrapped in the existing `<fieldset disabled={readOnly}>`. A "Start here: Sources" pointer shows when the document is empty (no customer name and no inventory).
   - **Right** (`xl:` and up, about 40% wide, sticky, independently scrolled). A sandboxed `<iframe srcDoc>` of the `document.preview` HTML, with a "Draft" chip and "Open full preview" (a dialog at full width). Below `xl`, it collapses to a "Preview" button that opens the same dialog. Scrolling to the part of the report a section feeds is deferred to Phase 2. It needs anchors in the renderer, which would change the goldens.
   - **URL.** `?section=<id>` via `history.replaceState`, as `?stage=` works today.
4. **Exports.** The Review section offers the Condensed FCP (HTML and PDF), the handoff and Building Blocks. No client code sends `documentType: "fcp"`. Filenames are unchanged in Phase 1 (`exportFilename`); dropping "Condensed" is Phase 4.
5. **Home.** Unrouted after the redirect commit and kept in the tree for one release as the rollback (D-1). It is deleted in Phase 6.

### 5.4 Tests

- **Baseline goldens (first commit, before any change):** `server/condensedGolden.test.ts` writes `server/__golden__/condensed-{acme-health,meridian-health,riverbend-health,northwind-mfg}.html` with `today: "2026-09-30"`, built from the fixture builders the existing tests already use. The existing `condensed-no-bsas.html` and `full-no-bsas.html` stay untouched.
- `draft: true` equals the non-draft output plus exactly the watermark block, and `checkCondensedFcp` passes on the draft output.
- **Retirement guard:** `server/fcpRendererRetired.test.ts` reads the source files and asserts that `renderFcpHtml` is referenced only in `server/fcpRenderer.ts`, the deprecated branch of `server/exportDownloadRoutes.ts`, and tests; that `routers.ts` does not import `fcpRenderer`; and that no file under `client/src` contains `documentType: "fcp"` or `"fcp")`.
- `document.preview` returns condensed HTML containing the watermark (`server/trackerRouter.test.ts` style, through `appRouter.createCaller`).
- `server/designSystem.test.ts` and `server/noThirdPartyPlatform.test.ts` keep passing. They cover the new page automatically.
- Then `pnpm check` and `pnpm test`.

### 5.5 Acceptance

- Every engagement opens at `/engagements/:id/fcp`. Old links (`/fcp?engagement=`, the drawer, `/?engagement=`) land there.
- Each existing editor works in its new section, with the same autosave, lock and read-only behaviour.
- The preview is the condensed FCP with the watermark. Exports are byte-identical to today's condensed exports (the goldens pass).
- No UI path reaches `renderFcpHtml` (the guard test passes).
- It is checked on `local-preview` at http://localhost:3100 with headless puppeteer, printing booleans only (three columns present, iframe contains "DRAFT", eight rail items).

### 5.6 Docs in the same PR

This file is updated to say what was built. `docs/VSA-TRACKER-UI.md` gets the workspace layout pattern. No new environment variables; `CONFIGURATION.md` is unchanged. `SECURITY-REVIEW.md` is unchanged, because there are no new stored data (version snapshots are Phase 3).

---

### 5.7 As built (Phase 1)

Where the build differs from 5.1 to 5.6, this is what shipped:

- **`PlanSetup` steps.** The new steps are `customer-details`, `funding`, `schedule`, `scope`, `target-release` and `notes`. The field groups are named fragments (`customerFields`, `fundingFields`, `releaseField`, `scheduleFields`, `hardwareFields`, `deliveryStartNote`, `outcomePicker`, `timelineNotesField`). The combined `customer` and `timeline` steps render them in the original order, so their DOM is unchanged. The target release is its own `target-release` step in Estate, rather than being moved into `upload`.
- **State.** `useFcpEngagement(id)` (`client/src/lib/useFcpEngagement.ts`) carries Home's load, migrate, rename reconciliation, lock-gated autosave, preview and export logic for one engagement. Home keeps its own copy so the rollback page stays untouched. The copy is deleted with Home in Phase 6.
- **Routes.** `client/src/lib/fcpWorkspaceRoutes.ts` (pure, tested) maps the old `?stage=` values to sections and turns `/fcp?engagement=` into the workspace URL. `/fcp` renders `FcpPicker` (Home's list and New FCP dialog). `Home` is unrouted.
- **Golden fixtures.** These are `server/fixtures/fcpFixtures.ts`: Acme Health (entitlement, Commercial), Meridian Health (entitlement + BSAS, Corporate), Riverbend Health (BSAS only) and Northwind Mfg (hand-built, VVF, plan estimate). Before this phase none of the four existed as a standing fixture.
- **History wording (D-3).** It also covers the drawer's FCP tab ("Recent history"), the activity text ("Saved the FCP: <label>"), and the restore label ("Before restoring the copy saved <time> UTC").
- **Headless check on `local-preview`.** Writes were blocked (lock, save, export). All 129 engagements opened in the workspace with the condensed preview and the draft mark, with no page errors. Three show content checks that would stop their export. Those checks are unchanged by this phase (the mark's text cannot match them), so these records fail the same way on export today.

## 6. Later phases (for orientation; each gets its own plan update before it starts)

- **Phase 2:** `shared/fcpReadiness.ts`: pure checks over `(document, effort, record)` per design section 6, using `checkCondensedFcp` for the scrub check, `validateTimeline`, `effort.internal.fit.underFunded`, `allocateBsas` forfeiture, and `resolveInputs().assumptions` for "assumed". Provenance chips; internal panels in Funding and Plan; an editable entitlement end with a confirmation flag (C-10); the segment mismatch warning (C-8); preview anchors.
- **Phase 3:** the `fcpVersions` extension (C-3) and `fcpConsumptionEntries`; issue, revise and supersede; approvals; change summary; `stageEvents` entries (C-1); gates; watermark on draft exports (C-6). Needs the answers to design section 14 first.
- **Phase 4: replaced by the report formats in [`docs/fcp-formats/`](fcp-formats/FCP-REPORT-FORMATS.md)** (decided 2026-10-27). Phase 4 as first written improved the 15-page report: a table of contents, a reordered long single report, and a customer-facing assumptions appendix. The 15-page report is itself being replaced, because it tries to serve the customer, Broadcom and CDW delivery at once. It is split by reader into a two-page **Summary FCP** (Commercial), a six-to-seven-page **Standard FCP** (Corporate and Strategic, the version Broadcom approves) and an internal **Delivery Handoff**, all rendered from the same document and effort. So the table of contents, the reordering and the customer assumptions appendix are **not built**. The rest of Phase 4 is built inside the new formats:
  - **Document control** (version, issue date, approvals, revision note) is on Standard page 2. Summary shows the version and issue date in its header band.
  - **Naming:** "Condensed" is dropped from every customer-facing string.
  - **Footer:** every page carries a version-aware footer.
  - **Out of Scope** is its own section in Standard, and "Not in this plan" in Summary.
  - **Assumptions** move to the Delivery Handoff (Estimating Basis), not the customer documents.

  The mockups (`fcp-summary-mockup`, `fcp-standard-mockup`, `fcp-delivery-handoff-mockup`, as HTML and PDF) are visual targets with illustrative Acme Health data, not templates. Build order is one PR each: the approver-name field on approvals, then Summary, Standard and the Handoff.
- **Phase 5:** intake (C-9, C-12).
- **Phase 6:** delete `renderFcpHtml`, the deprecated `"fcp"` export, `Home`'s step body and the `/fcp` editor. Keep `compatibilityHandoffRenderer.ts` (C-7).

## 7. Decisions needed before Phase 1

Answered on 2026-10-23; see section 8.

---

## 8. Review decisions (2026-10-23)

### D-1: redirect, with one live page

- `/fcp?engagement=<id>` (and `/?engagement=<id>`) redirects to `/engagements/<id>/fcp`. There are never two live editing pages.
- `Home.tsx` stays in the tree, **unrouted**, for one release as the rollback (the same pattern as `fcpRenderer.ts`), and is deleted in Phase 6. `/fcp` with no engagement renders `FcpPicker`: the existing `NoSelection` list and the New FCP dialog, moved out of `Home` unchanged. Choosing an engagement goes to the new route.
- The redirect is the **last commit of Phase 1**, added only after the acceptance in 5.5 has been checked on `local-preview`. Until then the new route and the old page both exist, but only on the branch.

### D-2: C-1 to C-12 accepted, with these conditions

- **C-1.** Build the full page. **No Activity tab** (that is a north-star item). Phase 3 only writes the `stageEvents` and `fcpVersions` rows a future Activity tab will read.
- **C-2.** The hours-source choice stays and reads `report.resourceAssignments`. The design doc has been corrected where it said `engagementAssignments` holds hours.
- **C-3.** `issueNumber` and `status` are new columns. The existing `versionNumber` is a **save counter**: it never appears as a customer-facing version, and from Phase 1 on it is not shown with a "v" prefix anywhere (see D-3).
- **C-5 / C-6.** The draft watermark is a **render option** (`CondensedFcpOptions.draft`), never a document field, so it cannot be saved into a document or reach print by accident. When it is off, the output is byte-identical, which the golden files cover. Phase 1 uses it on the preview only; Phase 3 adds it to draft exports once "issued" exists. Known gap until Phase 3: exported PDFs carry no watermark. That is today's behaviour, so there is no regression.
- **C-7.** `compatibilityHandoffRenderer.ts` stays.
- **C-8.** `engagements.segment` (Corporate / Strategic / Commercial) is the single source of truth. The FCP workspace shows it read-only and never writes it. The FCP's own field is `adoptionDetails.platformEdition` (VVF / VCF), labelled "Platform edition". Strategic is already offered wherever `engagements.segment` is edited (`trackerPatchSchema` uses `SEGMENTS`; the SharePoint import maps "BC Segment").
  - **The third field is `fields.customerSegment`.** The mirror first proposed here is **rejected** (see 8.2): the tracker segment is never copied into an existing FCP. The FCP's plan behavior moves to explicit plan inputs instead.
- **C-11.** The golden files for all four fixtures are the first commit of Phase 1, on their own.
- **C-4, C-9, C-10, C-12.** Checked against the guardrails (one dollar figure, additive only, the visibility helper, golden files):
  - C-4 changes only the on-screen preview.
  - C-9 changes only UI labels.
  - C-10 makes a date editable: no dollar figure, and the column already exists.
  - C-12 keeps an editor that only writes `report`, which the export content gates still check.

  None of them weakens a guardrail.

### D-3: "History", not "Versions"

- The left rail's list is labelled **History**. Each entry shows the save time, who saved it, and the reason chip (Saved, Submitted, Exported, Before restore), plus the label for manual saves. **There is no "v" prefix and no number.** "All history" opens the existing sheet.
- The same wording applies to `FcpVersionsSheet` and its callers:
  - The sheet's title becomes "History", and its entries drop `v{n}`.
  - The "Saved version N" and "Restore version N" texts become "Saved" and "Restore this save (date)".
  - The HTML download filename uses the save date instead of `-v{n}`.
  - The header button is relabelled "History".
- **Versions / Issued** is reserved for Phase 3's `issueNumber`. It becomes its own rail section, above History.

### 8.1 C-8 and the "renders identically" guardrail (superseded by 8.2)

Mirroring `fields.customerSegment` from the tracker changes a plan wherever the two disagree today. They have never been synced, so mismatches are possible:

- An FCP marked Commercial whose record segment is empty or Corporate would lose the Building Blocks workbook. If it is VVF, it would also fall back to VCF (`effectivePlatformEdition`), and that regenerates its plan.
- An FCP marked Corporate or unspecified whose record is Commercial would gain Building Blocks.

The golden fixtures are not affected (their mirror equals their field). Real engagements might be, and I cannot count them without reading rows.

Proposal for the Phase 2 C-8 PR:

1. A forward migration fills only **empty** tracker segments from the document: `UPDATE engagements SET segment = <fields.customerSegment> WHERE segment IS NULL AND <fields.customerSegment> IN ('commercial','corporate')`. Nothing set is overwritten. It runs through `pnpm db:migrate`, which takes a backup first.
2. A read-only admin status line (`server/systemStatus.ts`) shows the **count** of records whose document segment still disagrees with the tracker, with no names. You resolve those in the tracker before the PR merges.
3. Only then does the server start mirroring.

If you would rather accept the plan changes for mismatched records instead, say so and step 2 is dropped.

### 8.2 C-8 decision (2026-10-23): the deal segment and the plan inputs are separate

**Decision.** The tracker segment is never copied into the FCP on an existing record. The FCP's fields drive plan generation (Building Blocks, VVF vs VCF), so overwriting them would change customer-facing output, which is prohibited. The copy is never an option.

**The fields after this change:**

| Field | What it is | Who sets it |
|---|---|---|
| `engagements.segment` (Corporate / Strategic / Commercial) | The **deal segment**. Single source of truth for it. | The tracker (record drawer, Pipeline import). The FCP shows it read-only (PR B). |
| `fields.commercialPlan` (boolean) | **Plan type**: the plan is built as Commercial, so it gets the Building Blocks workbook and may be VVF. | A person, in the FCP ("Plan type"). Defaulted once from the tracker segment when a record is created (PR B). |
| `fields.adoptionDetails.platformEdition` (VCF / VVF) | **Platform edition**. VVF only on a Commercial plan (`effectivePlatformEdition`). **Confirmed as a business rule** (2026-10-23): VVF is sold only on a Commercial plan, and code may rely on it. | A person, in the FCP. |
| `fields.customerSegment` | **Deprecated.** Kept so older documents parse, and read once by `migrateDocument`. Nothing in plan generation reads it. | Nobody, from now on. |

**Steps, in two stacked PRs:**

- **PR A (`fcp-plan-inputs`): explicit plan inputs, backfill, count.**
  1. *3c.* `commercialPlan` is a new document field (zod default `false`, plus the defaults in `createDefaultFields`). `migrateDocument` fills it, once, for a document saved without it, from what drove the plan then: `commercialPlan = (customerSegment === "commercial")`. A stored VVF on a non-Commercial plan, which the old rule ignored, is normalized to VCF. After that `commercialPlan` is present and the segment is never read again. `effectivePlatformEdition` reads `commercialPlan`; `isCommercialCustomer` becomes `isCommercialPlan`. A customer brief that states a segment still sets the plan type, as it did before, and warns if it asks for VVF off Commercial. **No saved plan changes:** the four golden files render byte-identical, also from a copy of each fixture saved without the new field, and a synthetic dry run (3 segments × 2 editions × 4 pathways, each generated and hand-edited: 48 plans) shows 0 moved activities, identical rationale and readiness, and identical rendered FCPs (`server/planInputs.test.ts`).
  2. *Step 1.* Migration `0009_tracker_segment_source` fills **only empty** tracker segments from the FCP's segment (`commercial` → Commercial; `corporate` and the older `public-sector` → Corporate), and marks each one `engagements.segmentSource = 'inferred_from_fcp'`. A set tracker segment is never changed, and the FCP document is never written. Run with `pnpm db:migrate`, which takes a backup first.
     - An inferred segment is **not confirmed**. It can never be Strategic, because the old FCP field had no Strategic value. It also matches the FCP by construction, so it never shows in the mismatch count.
     - The marker is cleared when a person sets the segment on the record, or when the Pipeline import writes it. It is internal (`ENGAGEMENT_COLUMN_VISIBILITY`) and can later drive a provenance chip.
  3. *Step 2.* Admin → System status → Boundaries shows two counts, through `visibleEngagements`. Neither shows names or changes anything.
     - **Segment review**: records whose tracker segment disagrees with the FCP's plan type (`countSegmentMismatches`). It reads only the two plan-input values.
     - **Segments filled from the FCP**: records still marked inferred, to review for Strategic (`countInferredSegments`).
- **PR B (`fcp-segment-review`): defaults on create, and a person decides each mismatch.**
  1. *3a.* A record created by the Pipeline import gets `commercialPlan` from the tracker segment it is created with. This is a default, set once at creation, and editable.
  2. *3b.* On an existing record, a mismatch is a readiness **warning** in the FCP ("Tracker segment is Strategic; this plan is built as Commercial"), next to the read-only tracker segment. A person resolves it by choosing explicitly (change the plan type to match the tracker, or keep the plan as built). The choice is saved with who and when, in History, and that same pair is not raised again. The system never resolves it.
  3. *As built.*
     - The Engagement section shows the tracker segment read-only, with a "Filled from the FCP, not confirmed" chip when it was inferred, beside the plan type.
     - A mismatch shows the warning with two buttons. **Build as … to match the tracker** changes `commercialPlan`, regenerates and saves the plan, then records the decision. **Keep the plan as …** records the decision only.
     - `fcpRecord.decideSegment` checks the saved FCP and the build lock. It stores `engagements.segmentReview` and keeps a History copy with reason `decision`, labelled with the choice (migration 0010). It never changes the tracker segment.
     - An open warning keeps Engagement "In progress" in the section rail and shows on Review and issue.
     - Nothing here depends on the VVF rule. Changing the plan type through the warning leaves the stored platform edition as it is.
  4. *Funding copy.*
     - The Funding section no longer sits under the "From the customer" header. Funding facts come from the order and CDW's records.
     - **Entitled hours** (what the entitlement funds: the signed resource assignment total, or blank to derive from the entitlement value) and **Hours consumed** (the latest consumption entry and its date) are separate sections, each with its own description.

## 9. Phase 2: Funding (design §5.3)

**As built (PR C, `fcp-funding`).** The Funding section has its own editor (`client/src/components/fcp/FundingSection.tsx`). It is UI only: no schema change and no change to generated output.

- **Prints in the FCP.** One panel holds what the customer sees:
  - funding source;
  - entitlement value (the one dollar figure), start and end;
  - BSAS hours, start and end;
  - entitled hours, and hours consumed with their as-of date.
- **Entitlement value and start live only here.** They were already in Funding, not Engagement, after Phase 1. The Engagement section has no funding fields.
- **The entitlement end is now editable.** It writes the stated term end (`report.entitlement.termEnd`), which the report already reads. Blank keeps "12 months from the start; to be confirmed".
- **Internal, never prints.** A locked panel with a lock icon and an "Internal · never prints" tag holds:
  - the blended rate and where it comes from;
  - how the entitled hours are derived (the signed resource assignment total, or the entitlement value at the blended rate, after the reserve);
  - the reserve held back (moved here);
  - the PO received date and hours, read-only from the tracker;
  - a note that the BSAS amount is never entered.

  The renderer never reads any of it. The PO has no reference-number column today, so only its date and hours show.
- **Provenance pills.** Each printed value carries Confirmed / Assumed / Unknown, with its source. These are derived from the document alone by `shared/provenance.ts` (pure), so no value is stored twice.
  - The rules are the engine's own: the term end at 12 months, and the BSAS term from `bsasTerm`.
  - An assumed date shows **Confirm**, which writes the assumed value so it reads as stated. Confirming the entitlement end therefore removes "to be confirmed" from the printed FCP, as a person's explicit choice.
  - Values are no longer grouped by source; the pill says where each one comes from.
- **Field edits** go through `client/src/lib/fieldPatch.ts`. This is PlanSetup's own rule, moved out so the two editors cannot drift: a plan input rebuilds the plan once, and a hand-edited plan keeps its edits.
- **Consumption history** (the `fcpConsumptionEntries` table) stays in Phase 3. Until then, "Hours consumed" is the latest entry, entered by hand.

## 10. Phase 2E: Scope (design §5.5)

UI only: no schema change and no change to generated output. `client/src/components/fcp/ScopeSection.tsx` edits the same fields the plan generator already reads, so a record that is opened and left alone renders exactly as before. The section has no effects; it changes the document only when a person acts.

- **Delivery motion and pathway** come first: the motion (VVF shows only its own paths), domain topology, principal storage and hardware availability, then the pathway the motion selects, with its design and implementation packages read-only. Each package shows its outcome and when it is accepted; the decisions the pathway settles show as chips.
- **One card per capability** (Operations, Automation, VCF networking (NSX), Security, Resilience and DR, Kubernetes, Private AI), with a switch, a depth tier and its focus options when on. Networking and Security share a depth tier, as do Kubernetes and Private AI; Resilience has none. Efficiency depth sits on the Operations card. A card counts as on when it is a priority or any focus under it is selected, as the generator counts it.
  - **Off** collapses the card to one line. Turning a card off clears its priority and focuses and never writes a note. **Mark not requested** is the only thing that adds the card's name to `report.declined`, which the FCP prints as "(X not requested)" for a category with no work. Turning the card back on withdraws the note.
  - A card the plan pulls in as a prerequisite says **"<outcome> included for: <outcome>"** from `resolvePlanOutcomes`. `platform:nsx` belongs to the networking card, and `platform:ssp` to Security.
  - A card listed by a brief as considered only shows a **Follow-on** chip (`adoptionDetails.followOnOnly`).
- **Design profile**: six fields, with the generated text as each placeholder and the pathway's decisions as prompts.
- **Design elements**: the add-row table, with the generated rows shown and adoptable.
- **Site prerequisites and notes**: the confirmed soft prerequisites, the industry discovery lens and the notes.
- **View document source** is a collapsed read-only block of the scope fields, for debugging only.
- The pure edits are in `client/src/lib/scopeEdits.ts`. `server/scopeEditor.test.ts` covers them and checks that the section writes `declined` from the chip alone.

## 11. Phase 2E: Plan (design §5.6)

UI only: no schema change and no change to generated output. `client/src/components/fcp/PlanEditor.tsx` replaces the scope register, the Condensed FCP panel and the raw assignments and customer-work editors in the Plan section.

- **Above the table**, in a panel of what prints (hours only):
  - **Hours source:** "Estimated from this plan" or "Signed resource assignments", with the assignments editor and **Clear assignments**.
  - **Scope by bucket:** core, depth, follow-on, customer-funded and reserve. Shows the under-funded warning and the scope moves.
  - **BSAS allocation:** hours available with the term's provenance, planned inside the term, forfeited, and follow-on BSAS does not cover.
  - The buckets and the allocation come from `shared/planView.ts`, which works them out the way the Condensed FCP prints them. `server/planView.test.ts` checks them against the printed FCP for every fixture.
- **The locked internal panel** holds the fit check, gap and risk band (`CostMeter`), the hours fill, and the entitlement fit with its rate and dollars.
- **Work packages:** one row per package under the five categories, then work not on the timeline, then follow-on.
  - Hours by role are inline, with the baseline as the placeholder, a provenance pill per row, and **Baseline** to go back.
  - The window is a pair of column selects, applied on the timeline editor's path (`synchronizeEntitlementNotionalFromOperational`), so the plan becomes hand-edited.
  - Each row also shows its lead role and owner.
  - **Follow-on** sets the engine's placement to the Two-Year Notional, which effort records as "planned for later". The FCP prints the package under Follow-on Scope. The edits are in `client/src/lib/planEdits.ts`.
- **Below the table:**
  - the timeline sheets out of the rendered FCP itself (the live preview's HTML, in a script-free frame), so the drawing is the printed one;
  - the drag-and-drop timeline editors, collapsed;
  - customer-owned work as an add-row table.
- **Not built, because each needs a stored field (out of scope for a UI-only PR):**
  - a choice of which hours print while signed assignments exist (today entering assignments makes them print, and clearing them goes back);
  - editable per-package notes (the generated notes show read-only);
  - an editable lead role (derived from the workstream).

## 12. Hiding the live preview

The live preview column can be hidden with **Hide** in its header, and brought back with **Show live preview** above the section. Hiding it gives the editor the full width. **Preview the FCP** still opens the full preview in a dialog at any width. The choice is a per-viewer convenience kept in the browser (`localStorage`, read and written inside try/catch), so it never reaches the server and the page works without it. The preview keeps rendering while hidden, because the Plan section draws its timelines from it.

## 13. Phase 3: Versions (design §7), plan

### 13.1 Decisions (design §14, 2026-10-23)

- **Numbering (14.1):** only issued versions are numbered, as `issueNumber` 1, 2, 3 per engagement (C-3). The existing `versionNumber` stays the save counter behind History. The working document is the draft and has no number.
- **Approvals (14.2):** a recorded date, approver name, recording user and optional note, per party (Broadcom, customer), on the issued version. No request flow or notifications.
- **Consumption (14.3):**
  - Entered by hand for now, by anyone in the workspace, and logged with who entered it.
  - Each entry has a `source` (`manual` now; `salesforce` reserved) and an optional `externalId`. The future Salesforce read connector (north-star Phase 7, gated on IT) can then upsert on (`engagementId`, `source`, `externalId`) without duplicating manual rows. No schema change is needed when it lands.
- **Snapshots (14.4):** JSON columns in MySQL, like engagements and History, covered by the same backup. `docs/SECURITY-REVIEW.md` says so.
- **Watermark (14.6):** on the preview and on every export of the working document. An issued version downloads exactly as issued, without it (C-6).
- **VVF (2026-10-23):** VVF is sold only on a Commercial plan. This is a business rule, and code may rely on it.

### 13.2 Data (one additive migration)

- **`fcpVersions`** gains these columns, all nullable, so every existing row stays a History save:
  - `issueNumber`, unique per engagement;
  - `status` (`issued` or `superseded`);
  - `basedOnVersionId`, the issued version this one revises;
  - `effortSnapshot`, `renderedHtml` and `renderHash`;
  - `revisionNote` and `changeSummary`;
  - `issuedAt` and `issuedByUserId`;
  - `broadcomApprovedOn` (a date, like the tracker gates), `broadcomApprovedByUserId` and `broadcomApprovalNote`, with the same three for the customer.
  - `broadcomApproverName` and `customerApproverName` (migration 0012, added before the report formats): who approved, as distinct from `…ApprovedByUserId`, the user who recorded it. Required when an approval is recorded; null on approvals recorded before 0012.
- **`reason`** gains `issued`. An issued version is the row written at issue: its `data` is the document snapshot.
- **`fcpConsumptionEntries`:** `engagementId`, `asOf`, `consumedHours`, `source`, `externalId`, `note`, `enteredByUserId`, `createdAt`. It is append-only: a correction is a new entry.
- **Tags:** every new column is tagged in `shared/vsaFields.ts`. `renderedHtml` and `revisionNote` are customer-facing; everything else is internal.
- **Visibility:** both tables are reached only through a visible engagement, and `server/visibility.test.ts` covers them.

### 13.3 Lifecycle

- **Issue** renders the Condensed FCP from the saved document without the watermark. It runs the same content checks as an export, and refuses while someone else holds the edit lock. It then stores:
  - the document, the effort and the HTML, with its hash;
  - the revision note;
  - the change summary against the latest issued version;
  - the next `issueNumber`.

  The previous issued version becomes `superseded`.
- **Revise** saves the working document to History, then replaces it with the latest issued snapshot. A re-issue therefore starts from what the customer holds. It is offered when the working document has moved on since the last issue.
- **Download** of any issued or superseded version returns its stored HTML, or a PDF rendered from that HTML, byte for byte as issued. Superseded versions stay downloadable.
- **Consumption entries** need no re-issue. The latest entry fills the document's hours consumed and its date (on the workspace's normal save path), so the burndown moves on the next export or issue.

### 13.4 Gates and the tracker

The tracker's stage gates already read three dates: `fcpSubmittedOn`, `fcpBroadcomAcceptedOn` and `fcpCustomerAcceptedOn`. Phase 3 feeds them from the version state, without changing `shared/vsaStage.ts`:
- issuing fills `fcpSubmittedOn`;
- recording an approval fills the matching accepted date.

Each is filled **only when the date is empty**. A date someone already entered on the tracker is never overwritten, and the tracker stays editable.

Issuing does not move the stage. Stage moves stay explicit, so no `stageEvents` row is written. The `fcpVersions` rows are what a future Activity tab reads (C-1).

### 13.5 Change summary (pure, `shared/fcpChangeSummary.ts`)

Computed at issue against the issued version this one is based on, in customer-safe terms (hours and dates only):
- work packages added, removed, moved to follow-on or back, with hour deltas per package and in total;
- window changes;
- key date changes: planned start, target completion, term end and BSAS term;
- outcomes turned on or off, and depth changes;
- consumption since the last issue.

It is stored on the version. The revision note is the architect's wording; the computed facts are not editable. Printing it in the report is Phase 4.

### 13.6 PRs

1. **F, data and consumption:**
   - the migration;
   - tags and visibility;
   - consumption history in Funding: list, add, and the latest entry fills hours consumed.
2. **G, issue and revise:**
   - issue, revise and supersede;
   - downloads of issued versions;
   - approvals;
   - gate dates;
   - watermark on working-document exports;
   - the change summary;
   - the Versions rail section above History, and Issue in Review.
3. **H, compare:** pick two issued versions and see the change summary between them, with their reports side by side.

Acceptance: issue v1, revise, issue v2; compare shows the diff; superseded v1 still downloads. `pnpm check` and `pnpm test` pass, and the golden files are unchanged (issued HTML is the existing renderer's output).

### 13.7 As built (PR G)

- **Issue** (Review section): **Check and show the changes** saves the FCP, runs the export checks and shows the change summary (`fcpRecord.issuePreview`, which writes nothing). **Issue N** stores it (`fcpRecord.issue`). The rendering and checks are in `server/fcpIssue.ts` (`prepareIssue`, `condensedReleaseFailures`), shared with the export route.
- **Start over from issue N** (`fcpRecord.revise`) is offered when the working FCP differs from the current issue.
- **Issued versions** lists every issue with HTML and PDF downloads (`fcpRecord.issuedDownloadTicket`, an `issued-fcp` ticket carrying the version id), the change summary, and the Broadcom and customer approvals (`fcpRecord.recordApproval`). Broadcom approval shows as not needed for a Commercial engagement.
- The rail shows **Issued** above History.
- **Draft exports:** the Condensed FCP export of the working document now carries the draft mark (C-6). It is checked unmarked, so the checks are the ones the customer copy passes.

### 13.8 As built (PR H)

- **Compare** (in the Issued versions header, once there are two issues) opens a dialog with two pickers, which default to the current issue and the one before it. It shows the change summary from the earlier issue to the later, computed from their stored snapshots (`fcpRecord.compareIssued`, in `server/fcpIssue.ts`). Both reports appear side by side, exactly as stored when issued, in sandboxed frames that cannot run scripts. It writes nothing.
- For two consecutive issues, the comparison is the same as the change summary stored on the later issue.

## 14. Report formats (replaces Phase 4; spec in `docs/fcp-formats/`)

### 14.1 Phase 3 review decisions (2026-10-27)

All three open points from Phase 3 were accepted:

1. Issuing fills only empty tracker gate dates, writes no stage events and leaves the stage alone. The `fcpVersions` row is the audit record.
2. Working-document exports carry the draft mark; an unmarked FCP requires issuing.
3. Approvals are recorded by hand: date, approver name (added in PR 1, migration 0012), the recording user and a note.

### 14.2 As built: Summary (PR 2)

- **Format option.** `renderCondensedFcpHtml` takes `format` (`"summary"`) and `version` (`{ issueNumber, issuedOn }`). With no format the long report renders byte-identical to before (the existing goldens pass unchanged); `version` is ignored without a format. The Summary renderer is `server/fcpSummaryRenderer.ts`; pieces shared with the long report moved to `server/fcpReportParts.ts`.
- **Choice and default.** `shared/reportFormat.ts`: `defaultReportFormat(segment)` gives Commercial the Summary and everyone else `"full"`, the long report, until the Standard format exists (PR 3 switches Corporate and Strategic to it). The workspace's Review section has a **Customer format** picker; a choice there applies to this session's preview, draft export and issue. Draft export tickets carry the format, resolved from the segment when the client sends none.
- **Issued format.** `fcpVersions.reportFormat` (migration 0013) records what the customer received: `summary`, `standard`, or null for the long report. "Nothing changed since issue N" now means the same pages: the current FCP rendered with issue N's number, date and format equals what was stored; a format change counts as a change.
- **Hours reconcile (spec 6, 7.1, 7.2).** `reconcileHours` counts hours delivered (`report.entitlement.hoursConsumed`) plus hours planned (`effort.totals.total`) against the entitled hours. The Summary prints delivered hours as their own "Delivered to date" row and says "X delivered plus Y planned equals the Z-hour entitlement" only when that is true; otherwise the total is "Total CDW hours" with no claim. The buckets, the reserve and the under-funded gap never print in the Summary.
- **Delivered row label.** The notes on the consumption entries up to the printed figure (`deliveredNotes`, oldest first, each once) label the "Delivered to date" row; with no notes it reads "Hours delivered to date". Preview, draft export and issue load them for the record; nothing is invented.
- **Tolerance (review decision 2026-10-27).** One hour either way still reconciles (`RECONCILE_TOLERANCE_HOURS`). The page says "equals" only when the figures add up exactly, and "uses …, to within an hour of rounding" otherwise. Hours left unplanned read: "N hours are not planned and will be forfeited at term end."
- **Issue gate.** `fundingProblem` (internal wording) is non-null when delivered plus planned is over or under the entitled hours by more than the tolerance, or, with no entitled hours on record, when the fit flags the plan under-funded. Issuing is then refused unless the issue carries a reason; the reason is stored on the version (`fcpVersions.fundingOverrideNote`) and shown in Issued versions. Draft exports are not gated by it.
- **Caps.** Key dates 5 (the entitlement end always shows), commitments 3, open items 3, each with "See the full list in the Standard FCP." when more exist.
- **Footer.** Every page carries "Functional Consumption Plan · customer · Version N · Page x of y" (or "Working draft") in CSS `@page` margin boxes, so the page count is the printed one.
- **Naming.** The draft export is named "… - FCP Draft"; its History label is "Exported FCP draft, Summary (PDF)". "Condensed" stays only inside the long report, which goes when Standard replaces it.
- **Fixtures.** `acmeHealthReconciled` is Acme Health with its plan reconciled the way a planner would (discovery already delivered carries no more hours; the waves cut to proving waves): 39 + 223 = 262. Golden: `server/__golden__/summary-acme-health.html`.
- **Known gap, not changed here:** the fit envelope and the hours fill work from the entitled hours and do not subtract hours already delivered, and the fill stops short of the reserve. So a plan with consumption, or one that keeps a reserve, does not reconcile by itself: the planner adjusts the packages, or issues with a reason. Changing the envelope changes the long report's goldens and is left for a decision.
