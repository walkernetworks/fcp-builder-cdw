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

## 6. Later phases (for orientation; each gets its own plan update before it starts)

- **Phase 2:** `shared/fcpReadiness.ts`: pure checks over `(document, effort, record)` per design section 6, using `checkCondensedFcp` for the scrub check, `validateTimeline`, `effort.internal.fit.underFunded`, `allocateBsas` forfeiture, and `resolveInputs().assumptions` for "assumed". Provenance chips; internal panels in Funding and Plan; an editable entitlement end with a confirmation flag (C-10); the segment mismatch warning (C-8); preview anchors.
- **Phase 3:** the `fcpVersions` extension (C-3) and `fcpConsumptionEntries`; issue, revise and supersede; approvals; change summary; `stageEvents` entries (C-1); gates; watermark on draft exports (C-6). Needs the answers to design section 14 first.
- **Phase 4:** report changes (document control, naming, order, Out of Scope, assumptions, table of contents, footer), with new goldens and deliberate updates to existing ones.
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
  - **The third field is `fields.customerSegment`** (`unspecified | commercial | corporate`, in the document). It stops being an input. It becomes a **mirror of `engagements.segment`, written only by the server** (on `engagement.get`, `engagement.update` and export): `commercial → commercial`, `corporate → corporate`, `strategic → strategic` (added to `customerSegmentSchema`, additively), `null → unspecified`. The engine keeps reading the mirror (`isCommercialCustomer` for Building Blocks, and `effectivePlatformEdition`, which allows VVF only when the customer is Commercial), so nothing on the preserve list is refactored. Brief import stops writing it; a brief's `customer.segment` becomes a note, "segment is set on the tracker record". The "Customer segment" select in `PlanSetup` is replaced by a read-only chip from `tracker.get`.
  - **This touches a guardrail ("every existing FCP renders identically"); see 8.1.** The work is therefore its own PR at the start of Phase 2, not part of Phase 1, which keeps its editors unchanged.
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

### 8.1 C-8 and the "renders identically" guardrail

Mirroring `fields.customerSegment` from the tracker changes a plan wherever the two disagree today. They have never been synced, so mismatches are possible:

- An FCP marked Commercial whose record segment is empty or Corporate would lose the Building Blocks workbook. If it is VVF, it would also fall back to VCF (`effectivePlatformEdition`), and that regenerates its plan.
- An FCP marked Corporate or unspecified whose record is Commercial would gain Building Blocks.

The golden fixtures are not affected (their mirror equals their field). Real engagements might be, and I cannot count them without reading rows.

Proposal for the Phase 2 C-8 PR:

1. A forward migration fills only **empty** tracker segments from the document: `UPDATE engagements SET segment = <fields.customerSegment> WHERE segment IS NULL AND <fields.customerSegment> IN ('commercial','corporate')`. Nothing set is overwritten. It runs through `pnpm db:migrate`, which takes a backup first.
2. A read-only admin status line (`server/systemStatus.ts`) shows the **count** of records whose document segment still disagrees with the tracker, with no names. You resolve those in the tracker before the PR merges.
3. Only then does the server start mirroring.

If you would rather accept the plan changes for mismatched records instead, say so and step 2 is dropped.
