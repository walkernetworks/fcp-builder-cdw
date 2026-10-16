# VSA Tracker Data Model

Status: **Phase 0, reviewed.** Decisions from review are recorded in [section 11](#11-review-decisions). The Phase 1 migration is built from this document.

This document locks the relational shape of the VSA engagement record that absorbs the SharePoint VSA Pipeline List. It extends the existing `engagements` table and adds three tables. The FCP document model (`engagements.data`, typed by `shared/fcp.ts`) is unchanged and becomes the output of the FCP Draft stage.

Sources: `VSA-TRACKER-KICKOFF.md` (locked decisions), the CDW VSA end-to-end handbook (gate definitions), and the column headers and category values of the SharePoint `VSA Pipeline List.csv` export (118 rows, 46 columns). `docs/VSA-TRACKER-EXPANSION-PLAN.md` was not available when this was written. Choices that plan might have settled were decided in review instead (section 11).

## 1. Principles

1. **Additive.** New columns are nullable or have defaults; existing FCP procedures keep working unchanged against the same rows.
2. **Columns for what the tracker filters, sorts, or gates on. JSON for the FCP document.** Tracker fields never go into `data`, and FCP inputs never move out of it.
3. **One visibility helper.** Every engagement read and write goes through `server/visibility.ts` (section 8). `db.ts` functions take the signed-in user, not a bare `ownerId`.
4. **Attribution on every row.** `ownerId` stays on `engagements`; every new table records who created or changed each row.
5. **Business dates are `DATE`, not `TIMESTAMP`.** Gate dates are calendar days ("PO received 5/7/2026"), stored as `date` with Drizzle `mode: "string"` (`YYYY-MM-DD`), so they never shift with time zones. Audit times (`createdAt`, `recordedAt`) stay `timestamp`.
6. **Money is `DECIMAL(14,2)`**, read as a string by Drizzle and converted at the edge. No floats for dollar values.
7. **Files are referenced, never stored.** The record keeps file names and folder URLs as text. Raw RVTools still never leaves the browser.

## 2. Stage model

### 2.1 Enum

One `stage` column replaces the five SharePoint status fields (VSA Approval Stage, Resource Assignments, Project Status, FCP Submitted, FCP Done).

| Order | Value | Label | Leaves this stage when |
|---|---|---|---|
| 1 | `intake` | Intake | Pursuit registered and the participation request (SER) is submitted |
| 2 | `broadcom_request` | Broadcom Request (SER) | Broadcom partner approval is recorded (`serApprovedOn`) |
| 3 | `discovery` | Discovery | Customer discovery and scoping are done |
| 4 | `source_chain` | Source Chain | The required source items (section 5) are received or waived |
| 5 | `fcp_draft` | FCP Draft | The FCP is submitted for review (`fcpSubmittedOn`) |
| 6 | `broadcom_approval` | Broadcom Approval | Broadcom accepts the FCP (`fcpBroadcomAcceptedOn`). Corporate and Strategic only |
| 7 | `customer_approval` | Customer Approval | Customer accepts the FCP (`fcpCustomerAcceptedOn`). Corporate and Strategic also need the Broadcom work plan accepted (`workPlanAcceptedOn`); see 2.3 |
| 8 | `ra_staffing` | RA / Staffing | RA completed, onboarding done, WA received, PO received (`poReceivedOn`) |
| 9 | `kickoff` | Kickoff | Customer kickoff held (`ckomOn`) |
| 10 | `in_delivery` | In Delivery | Delivery closed out (`completedOn`) |
| 11 | `complete` | Complete | Terminal |
| exit | `refused` | Refused | Customer declined the entitlement. Terminal |
| exit | `paused` | Paused | Resumes to the stage it paused from |
| exit | `lost` | Lost | Pursuit lost or delivery cancelled. Terminal |

`complete`, `refused`, and `lost` are terminal but can be reopened with a reason (an explicit backward transition, recorded in `stageEvents`).

### 2.2 Gating by segment

| Stage | Corporate | Strategic | Commercial | Segment not set |
|---|---|---|---|---|
| `broadcom_approval` | Required | Required | **Skipped** | Required (conservative), flagged as a data-quality issue |
| Work plan inside `customer_approval` | Required | Required | **Not applicable** | Required (conservative), flagged |
| All other main-line stages | Required | Required | Required | Required |

"Skipped" means `nextStage()` goes from `fcp_draft` straight to `customer_approval` and the board does not show the column for that record. A Commercial record placed in `broadcom_approval` (for example by import) is allowed but flagged. For Commercial, the work-plan dates are hidden and ignored.

### 2.3 Work plan call-out (Corporate and Strategic)

For Corporate and Strategic customers, Customer Approval holds **two separate approvals**, and the record shows them as two items rather than one stage date:

1. **FCP approval:** the customer accepts the FCP (`fcpCustomerAcceptedOn`).
2. **Work plan approval:** Broadcom sends the customer its work plan (`workPlanSentOn`) and the customer accepts it (`workPlanAcceptedOn`). Broadcom cannot book the entitlement order until this is done.

They can happen in either order. The record leaves `customer_approval` cleanly only when both are dated. While one is missing, the board card shows which one ("Work plan sent 9/12, not accepted"), and a work plan sent more than 14 days ago without acceptance gets a warning. Both are soft gates, like the other dates in 2.1.

Commercial customers have no work plan step: Customer Approval is FCP approval only.

`shared/vsaStage.ts` exposes this as `customerApprovalItems(record) -> { fcp, workPlan? }` so the board, the record page, and the warnings all read one definition.

### 2.4 Transition rules (`shared/vsaStage.ts`, pure, tested)

- **Forward:** to the next applicable stage for the record's segment. Skipping ahead more than one stage is allowed with a note (imports and catch-up entries need it).
- **Backward:** to any earlier main-line stage, with a required note.
- **Exits:** any non-terminal stage can move to `refused`, `paused`, or `lost`.
- **Resume:** `paused` returns to the `fromStage` of the event that paused it. If that is unknown (imported as paused), the user picks.
- **Hard gate:** `kickoff` and `in_delivery` cannot be entered without `poReceivedOn`. The handbook is explicit that no delivery work begins before the Broadcom PO. Every other exit criterion in 2.1 is a **soft gate**: the transition is allowed, and the record shows a warning until the date is filled.
- The module exports `STAGES`, `stageOrder`, `applicableStages(segment)`, `nextStage(record)`, `canTransition(record, to) -> { ok, hardBlock?, warnings[] }`, and `stageWarnings(record)`. It has no database or React imports.

## 3. `engagements` (extended)

Existing columns are unchanged: `id`, `ownerId`, `title`, `customerName`, `customerShortName`, `status` (FCP document completeness: draft/ready/archived, unrelated to `stage`), `data`, `createdAt`, `updatedAt`.

The **Vis** column is the structural tag from section 7: **C** = customer-facing (may appear in exported customer documents), **I** = internal only.

### 3.1 Identity and hierarchy

| Column | Type | Null | Default | Vis | Notes / SharePoint source |
|---|---|---|---|---|---|
| `workspaceId` | int | no | 1 | I | FK `workspaces.id`. Visibility boundary (section 8) |
| `salesforceCustomerId` | varchar(32) | yes | | I | **Unique.** The "Customer ID" of the VSA-only account in CDW's Salesforce tenant, imported from "New CDW Account #" (8 digits today). NULL until the account exists; MySQL allows many NULLs in a unique index. Replaces the kickoff's working name `salesforceAccountId` |
| `salesforceOpportunityId` | varchar(32) | yes | | I | Unique. The Salesforce record ID extracted from the "Opportunity ID" HTML link; the link itself is not stored. Kept for matching; `opportunityNumber` is what people see and search |
| `serNumber` | varchar(32) | yes | | I | "SER Number". Indexed, not unique (two duplicate groups in the export are duplicate rows; import flags them) |
| `opportunityNumber` | varchar(32) | yes | | I | **Unique.** CDW's internal opportunity number for the opportunity under the account in Salesforce, `C-OPP-` plus digits ("Deal ID or Name"). Validated as `^[A-Z]+-OPP-\d{6,8}$`. Shown on the board card and searchable |
| `isFundingExtension` | boolean | no | false | I | "Funding Extension". **Legacy only.** Funding extensions are no longer offered; this keeps the 12 imported historical records identifiable. Import-only: not on the new-record form or the edit form |

### 3.2 Classification

| Column | Type | Null | Default | Vis | Notes / SharePoint source |
|---|---|---|---|---|---|
| `segment` | enum `corporate`, `strategic`, `commercial` | yes | | I | "BC Segment". New field. Separate from `data.fields.customerSegment`, which stays the VVF/VCF edition selector |
| `program` | enum `entitlement`, `extended_expert`, `bsas`, `cash_sow`, `government_entitlement`, `government_bsas` | yes | | I | "Program" |
| `region` | enum `west`, `east` | yes | | I | "West vs East" |
| `customerState` | varchar(64) | yes | | I | "Customer State" (US state of the customer) |
| `entitlementInterest` | enum `interested`, `not_interested`, `pending` | yes | | I | "Customer Entitlement Interest" |

### 3.3 Stage and health

| Column | Type | Null | Default | Vis | Notes / SharePoint source |
|---|---|---|---|---|---|
| `stage` | enum (section 2.1) | no | `intake` | I | Existing rows backfill to `fcp_draft` |
| `stageEnteredOn` | date | no | creation date | I | Denormalized from the latest `stageEvents` row, for board aging and sorting. Written only by the stage-transition procedure |
| `waitingOn` | enum `sales`, `customer`, `broadcom`, `cdw_internal` | yes | | I | Replaces SharePoint "5 Update From Sales Pending", which is a blocker, not a stage |
| `health` | enum `green`, `yellow`, `red` | yes | | I | "Project Status" |
| `riskAssessment` | enum `not_submitted`, `submitted`, `standard_terms_acknowledged`, `not_applicable` | yes | | I | "CDW Risk Assessment" |
| `raStatus` | enum `not_needed`, `not_started`, `waiting_from_broadcom`, `sent_to_broadcom`, `resources_onboarding`, `in_flight`, `delivery_complete`, `cancelled` | yes | | I | "Resource Assignments". Sub-status inside `ra_staffing` and `in_delivery`, not a second stage |
| `vcfAssessment` | boolean | no | false | I | "VCF Assessment" |
| `nextSteps` | text | yes | | I | "Next Steps" |
| `statusNotes` | text | yes | | I | "Project Status Notes" |

### 3.4 Gate dates (all `date`, nullable)

| Column | Vis | SharePoint source | Gate |
|---|---|---|---|
| `serSubmittedOn` | I | (none; new) | Participation request submitted |
| `serApprovedOn` | I | (none; new) | Broadcom partner approval of CDW |
| `fcpDraftCreatedOn` | I | "FCP Draft Created Date" | |
| `fcpSubmittedOn` | I | "FCP Submitted" (boolean in SharePoint; import leaves the date NULL and flags it when true) | |
| `fcpBroadcomAcceptedOn` | I | "FCP Broadcom Acceptance Date" | Corporate/Strategic only |
| `fcpCustomerAcceptedOn` | C | "FCP Customer Acceptance Date" | |
| `workPlanSentOn` | I | (none; new) | Broadcom sends the customer its work plan. Corporate/Strategic only (2.3) |
| `workPlanAcceptedOn` | I | (none; new) | Customer accepts the Broadcom work plan. Corporate/Strategic only (2.3) |
| `ikomOn` | I | "IKOM Date" | Internal kickoff |
| `raReceivedOn` | I | (none; new) | RA issued by Broadcom |
| `workAuthReceivedOn` | I | "Work Auth Rec'd Date" | WA |
| `poReceivedOn` | I | "PO Received" | **Hard gate** for `kickoff` and `in_delivery` |
| `ckomOn` | C | "CKOM Date" | Customer kickoff |
| `projectStartOn` | C | "Project Start Date" | |
| `estimatedCloseOn` | I | "Estimated Close Date" | |
| `completedOn` | I | (none; new) | Delivery closed out |

"FCP Done" (boolean) is not carried forward. It is derivable from `fcpCustomerAcceptedOn`; import flags rows where they disagree.

### 3.5 Commercials and term

| Column | Type | Null | Vis | Notes / SharePoint source |
|---|---|---|---|---|
| `entitlementValue` | decimal(14,2) | yes | C | "VSA Amount". The condensed FCP already allows the entitlement value as its one dollar figure |
| `estimatedDealValue` | decimal(14,2) | yes | I | "Estimated Deal Value ($)" |
| `broadcomPo` | varchar(64) | yes | I | "Broadcom PO" (number) |
| `termStart` | date | yes | C | Subscription term start |
| `termEnd` | date | yes | C | Subscription term end |
| `deliveryWindowEnd` | date | yes | C | "VSA Expiration": the date by which the entitlement must be consumed. Drives the expiry/burndown view |
| `coreCount` | int | yes | C | Licensed cores on the deal |

### 3.6 Links and locks

| Column | Type | Null | Vis | Notes |
|---|---|---|---|---|
| `clientFolderUrl` | varchar(1024) | yes | I | "Client Folder". Stored as text, rendered as a link; the server never fetches it. Validated as `https:` only |
| `buildLockUserId` | int | yes | I | FK `users.id`. Who holds the FCP build lock (Phase 4) |
| `buildLockAt` | timestamp | yes | I | When the lock was taken. A lock older than a code constant (proposed 30 minutes) is treated as released |
| `rowVersion` | int | no | I | Default 0. Optimistic concurrency for tracker edits now that several people can edit one record. Incremented on every tracker update; a stale write is rejected |
| `updatedByUserId` | int | yes | I | Last editor, for attribution alongside `updatedAt` |

### 3.7 Relationship between columns and the FCP JSON

Several tracker columns overlap with FCP inputs in `data.fields`: `entitlementValue` with `entitlementAmount`, `termStart`/`termEnd` with `entitlementStart`/`entitlementEnd`, and `customerName`. The rule:

- **Tracker columns are authoritative for the tracker.** FCP JSON is authoritative for the FCP document.
- When an FCP is first started from a record, empty FCP fields are seeded from the columns. After that there is no silent sync in either direction.
- When the two disagree, the record shows a "differs from FCP" indicator with a one-click copy in either direction (Phase 4).
- The existing behavior where `updateEngagement` derives `customerName` and `customerShortName` from `data.fields` stays for FCP saves.

### 3.8 Indexes

- unique `engagements_sf_customer_uq (salesforceCustomerId)`
- unique `engagements_sf_opportunity_uq (salesforceOpportunityId)`
- unique `engagements_opportunity_number_uq (opportunityNumber)`
- `engagements_workspace_stage_idx (workspaceId, stage, stageEnteredOn)`: board
- `engagements_workspace_expiry_idx (workspaceId, deliveryWindowEnd)`: expiry view
- `engagements_ser_idx (serNumber)`
- existing `engagements_owner_updated_idx (ownerId, updatedAt)` stays

## 4. `stageEvents` (new, append-only)

Each stage transition, including the initial stage at creation.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | int PK auto | no | |
| `engagementId` | int | no | FK `engagements.id`, `ON DELETE CASCADE` |
| `fromStage` | stage enum | yes | NULL for the first event, or an imported stage with unknown history |
| `toStage` | stage enum | no | |
| `effectiveOn` | date | no | When the transition happened in the real world. Can be backdated |
| `recordedAt` | timestamp | no | Default now. When it was entered |
| `actorUserId` | int | yes | FK `users.id`. NULL for `system` events |
| `source` | enum `manual`, `import`, `system` | no | |
| `note` | text | yes | Required by the procedure for backward moves, reopenings, and skips |

Index `(engagementId, effectiveOn, id)`.

Append-only is enforced in `db.ts`: there is no update or delete function for this table, and a test asserts that no exported function updates or deletes it. Rows go away only when the engagement is deleted (cascade). A correction is a new event.

A transition writes the event, `engagements.stage`, and `engagements.stageEnteredOn` in one transaction.

## 5. `sourceChainItems` (new)

The checklist of inputs an FCP is built from. It drives the Source Chain stage now and the Phase 4 source checklist.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | int PK auto | no | |
| `engagementId` | int | no | FK, `ON DELETE CASCADE` |
| `kind` | enum `rvtools`, `discovery_notes`, `customer_brief`, `hardware_review`, `hours_source`, `broadcom_ser`, `other` | no | |
| `label` | varchar(240) | no | |
| `required` | boolean | no | Default true |
| `status` | enum `needed`, `requested`, `received`, `verified`, `waived` | no | Default `needed` |
| `requestedOn` | date | yes | |
| `receivedOn` | date | yes | |
| `reference` | varchar(1024) | yes | File name or client-folder path. Text only; no file content is uploaded or stored |
| `note` | text | yes | Required when `status = waived` |
| `createdByUserId` | int | no | Attribution |
| `updatedByUserId` | int | yes | |
| `createdAt`, `updatedAt` | timestamp | no | |

Index `(engagementId, kind)`. All columns are **I**.

The Source Chain soft gate is met when every `required` item is `received`, `verified`, or `waived`. New records get a default set (RVTools, discovery notes, customer brief, hours source) from a constant in `shared/vsaStage.ts`.

An `rvtools` item records that an export was received and when. The aggregate facts are still saved only in `data`, exactly as today.

## 6. Multi-user tables

### 6.1 `workspaces` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | int PK auto | Migration inserts `id = 1`, name "CDW VSA" |
| `name` | varchar(120) | |
| `createdAt` | timestamp | |

One workspace is expected in practice. The table exists so the visibility boundary is a real key rather than "everyone in the database", and so a second team or a test workspace costs nothing later.

### 6.2 `users` (extended)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `workspaceId` | int | no | 1 | New users join workspace 1 on first sign-in through the gateway |
| `vsaRole` | enum `sales`, `architect`, `presales`, `pm`, `leadership` | yes | | Selects the default role view. Not a permission. The existing `role` (`user`/`admin`) stays the only permission flag |

### 6.3 `engagementAssignments` (new)

Who is on each record. This drives role views ("my records as architect").

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | int PK auto | no | |
| `engagementId` | int | no | FK, `ON DELETE CASCADE` |
| `role` | enum `sales_rep`, `account_manager`, `presales`, `architect`, `pm`, `sr_consultant` | no | |
| `userId` | int | yes | FK `users.id`. NULL when the person has not signed in yet |
| `displayName` | varchar(240) | no | |
| `email` | varchar(320) | yes | CDW email. Used to link `userId` when that person first signs in |
| `broadcomEmail` | varchar(320) | yes | "PM / Architect / Sr. Consultant: Broadcom email" |
| `createdByUserId` | int | no | |
| `createdAt`, `updatedAt` | timestamp | no | |

Unique `(engagementId, role)`: one person per role per record. Index `(userId, role)` for role views. All columns are **I**.

SharePoint mapping: "Sales Rep / Owner" → `sales_rep`, "CDW Account Manager" → `account_manager`, "Nat. Presales" → `presales`, "DC FSA" and "Architect" → `architect` (import flags rows where they differ), "PM" → `pm`, "Sr. Consultant" → `sr_consultant`.

This is a table rather than six `*UserId` columns on `engagements` because most imported assignees will not be app users yet. A row can hold a name and email now and link to a user later, and each role carries its own Broadcom email without twelve more columns.

## 7. Internal vs customer-facing tag

The tag is structural: `shared/vsaFields.ts` exports

```ts
export const ENGAGEMENT_COLUMN_VISIBILITY = {
  customerName: "customer",
  salesforceCustomerId: "internal",
  // ...every column of engagements
} as const satisfies Record<keyof Engagement, "customer" | "internal">;
```

- The `satisfies Record<keyof Engagement, …>` makes `pnpm check` fail when a column is added without a tag.
- `customerFacingColumns(row)` returns only the **C** columns. Any renderer that puts tracker columns into a customer document (FCP, condensed FCP, handoff) must go through it.
- A test asserts that every **I** column value, seeded with a sentinel string, is absent from the rendered FCP HTML.
- `stageEvents`, `sourceChainItems`, `engagementAssignments`, and `workspaces` are internal in full. They get no per-column map.
- `data` is tagged **C**. The FCP document is customer-facing by design, and its existing export gates (rate card, blended rate) are unchanged.

**Customer-facing columns:** `title`, `customerName`, `customerShortName`, `data`, `entitlementValue`, `termStart`, `termEnd`, `deliveryWindowEnd`, `coreCount`, `fcpCustomerAcceptedOn`, `ckomOn`, `projectStartOn`. Everything else is internal.

## 8. Multi-user model and visibility

### 8.1 Rules

| Action | Who |
|---|---|
| See a record, its events, sources, assignments | Any user in the record's workspace |
| Edit tracker fields, transition stage, edit sources and assignments | Any user in the workspace (shared tracker), with `rowVersion` checks |
| Edit the FCP document | Any user in the workspace, when they hold the build lock or no one does (lock enforced from Phase 4; until then, `rowVersion`) |
| Delete a record | Its `ownerId`, or an `admin` |
| Export (HTML/PDF links) | Any user in the workspace. The download route rechecks visibility for the ticket's user at download time |

Role views (Sales, Architect, PM, Leadership) are **filters**, not permissions. They are built from `engagementAssignments` plus `users.vsaRole`. Leadership sees all records in the workspace by default.

### 8.2 One helper

`server/visibility.ts` is the only place that knows the scoping rule:

```ts
type Viewer = { id: number; workspaceId: number; role: "user" | "admin" };
export function visibleEngagements(viewer: Viewer): SQL;            // where-predicate for every engagements query
export function canEditEngagement(viewer: Viewer, row: Engagement): boolean;
export function canDeleteEngagement(viewer: Viewer, row: Engagement): boolean;
```

- Every `db.ts` engagement function takes a `Viewer` and composes `visibleEngagements(viewer)` into its `where`. Child-table functions join through `engagements` with the same predicate; they never filter by `engagementId` alone.
- A test enumerates the `db.ts` exports touching engagement data and asserts each applies the predicate (the same spirit as `noThirdPartyPlatform.test.ts`).
- Where the database lives stays a `DATABASE_URL` choice. No storage or scoping logic outside `db.ts` and `visibility.ts`.

### 8.3 Effect on the existing FCP flow

The existing procedures (`list`, `get`, `create`, `update`, `duplicate`, `delete`, export) keep their names and inputs. Internally they move from `ownerId` to `Viewer`. With one signed-in user, the behavior is identical. Once a second user signs in, they see every record in workspace 1, including FCPs created before this change. That is the intended model, and the PR calls it out.

### 8.4 Required doc changes (land in the Phase 1 PR)

**CLAUDE.md**, Rules: replace

> **Every engagement query stays scoped to the signed-in owner.**

with

> **Every engagement query goes through `server/visibility.ts`.** Records are visible to users in the same workspace; `ownerId` is attribution, and delete is limited to the owner or an admin. Never filter engagements, or tables that hang off them, any other way.

**docs/SECURITY-REVIEW.md**:

- The access-control paragraph ("Every engagement query includes the authenticated local `ownerId`…") is rewritten for workspace scoping, the delete rule, and export tickets being rechecked against visibility at download.
- Data-inventory rows that say "owner-scoped" become "workspace-scoped".
- New inventory rows: tracker commercials (entitlement value, deal value, PO numbers) as CDW confidential; assignment names and CDW/Broadcom emails as internal personal data; `clientFolderUrl` as an internal link that is never fetched.
- The sequence diagram's "Owner-scoped engagement CRUD" becomes "Workspace-scoped engagement CRUD".
- A note that workspace membership comes from the gateway. Anyone the CDW SSO gateway admits joins workspace 1, so app assignment at the gateway is the access-control boundary.

**docs/CONFIGURATION.md**: no new environment variables in Phase 1. Workspace 1 and the lock timeout are code constants.

## 9. Migration (Phase 1)

One migration, `0002_*`, generated with `pnpm exec drizzle-kit generate` and applied with `pnpm exec drizzle-kit migrate`. The generated DDL is followed by hand-appended backfill statements in the same file:

1. Create `workspaces`; insert `(1, 'CDW VSA')`.
2. Add `users.workspaceId` (default 1) and `users.vsaRole`.
3. Add the `engagements` columns in section 3. Existing rows get `workspaceId = 1`, `stage = 'fcp_draft'`, `stageEnteredOn = DATE(createdAt)`, `rowVersion = 0`.
4. Create `stageEvents`, `sourceChainItems`, `engagementAssignments`.
5. Insert one `stageEvents` row per existing engagement: `fromStage NULL`, `toStage 'fcp_draft'`, `effectiveOn = DATE(createdAt)`, `source 'system'`, `note 'Existing FCP at tracker migration'`.
6. Add the foreign keys and indexes from sections 3.8 to 6.3.

The migration is checked by applying it to a copy of the local database with existing FCP rows, then confirming the current FCP test suite and a manual FCP export still pass.

## 10. SharePoint import mapping (preview for Phase 2)

This shows the stage enum covers every SharePoint state. Phase 2 owns the details and the reconciliation report.

| SharePoint "VSA Approval Stage" | Count | Maps to |
|---|---|---|
| 0 Waiting on SER Approval | 2 | `broadcom_request` |
| 1 Customer Discovery & Scoping | 14 | `discovery` |
| 2 FCP | 25 | `fcp_draft`. Moves to `broadcom_approval` or `customer_approval` when FCP Submitted is true (by segment), or `ra_staffing` when there is a customer acceptance date |
| 3 In Delivery | 49 | By "Resource Assignments": not started / waiting / sent / onboarding → `ra_staffing`; PO date and no CKOM → `kickoff`; in flight → `in_delivery`; delivery complete → `complete`; cancelled/lost → `lost` |
| 4 Customer Refused | 13 | `refused` |
| 5 Update From Sales Pending | 2 | Stage derived from dates, `waitingOn = 'sales'` |
| 6 Customer Paused | 1 | `paused`, `fromStage` unknown |
| 7 Lost | 12 | `lost` |

### 10.1 Column coverage

Every column in the current SharePoint list (46, confirmed against a header-only export of the live list) has a destination:

| SharePoint column | Destination |
|---|---|
| Customer Name | `customerName` |
| Customer State | `customerState` |
| Opportunity ID | `salesforceOpportunityId` (ID extracted from the link) |
| Deal ID or Name | `opportunityNumber` when it matches the `…-OPP-` pattern; otherwise left NULL and the original text goes to the reconciliation report |
| West vs East | `region` |
| Program | `program` |
| BC Segment | `segment` |
| Customer Entitlement Interest | `entitlementInterest` |
| VSA Approval Stage | `stage` (with the mapping above) |
| Resource Assignments | `raStatus`, and refines `stage` |
| Nat. Presales | assignment `presales` |
| DC FSA | assignment `architect` |
| VCF Assessment | `vcfAssessment` |
| FCP Draft Created Date | `fcpDraftCreatedOn` |
| FCP Submitted | refines `stage`; `fcpSubmittedOn` stays NULL and is flagged |
| FCP Customer Acceptance Date | `fcpCustomerAcceptedOn` |
| FCP Done | not stored; checked against `fcpCustomerAcceptedOn` |
| IKOM Date | `ikomOn` |
| CDW Risk Assessment | `riskAssessment` |
| Next Steps | `nextSteps` |
| CKOM Date | `ckomOn` |
| FCP Broadcom Acceptance Date | `fcpBroadcomAcceptedOn` |
| Work Auth Rec'd Date | `workAuthReceivedOn` |
| Project Status | `health` |
| VSA Amount | `entitlementValue` |
| PO Received | `poReceivedOn` |
| Project Status Notes | `statusNotes` |
| Estimated Close Date | `estimatedCloseOn` |
| Sales Rep / Owner | assignment `sales_rep` |
| VSA Expiration | `deliveryWindowEnd` |
| CDW Account Manager | assignment `account_manager` |
| New CDW Account # | `salesforceCustomerId` |
| Estimated Deal Value ($) | `estimatedDealValue` |
| Broadcom PO | `broadcomPo` |
| PM: Broadcom email | `broadcomEmail` on assignment `pm` |
| Architect: Broadcom email | `broadcomEmail` on assignment `architect` |
| PM | assignment `pm` |
| Sr. Consultant: Broadcom email | `broadcomEmail` on assignment `sr_consultant` |
| Architect | assignment `architect` (flagged when it differs from DC FSA) |
| Project Start Date | `projectStartOn` |
| Sr. Consultant | assignment `sr_consultant` |
| Is VSA? | not stored. True on every exported row; every tracker record is a VSA. Import skips and reports rows where it is false |
| Funding Extension | `isFundingExtension` (legacy flag) |
| Modified | not stored on the record. SharePoint's own last-edit time; Phase 2 uses it in the reconciliation report and as the `effectiveOn` fallback for imported `stageEvents` when no gate date fits |
| SER Number | `serNumber` |
| Client Folder | `clientFolderUrl` |

New fields with no SharePoint column: `termStart`, `termEnd`, `coreCount`, `serSubmittedOn`, `serApprovedOn`, `workPlanSentOn`, `workPlanAcceptedOn`, `raReceivedOn`, `completedOn`, `waitingOn`.

Data-quality flags already visible in the export: "Deal ID or Name" is a `C-OPP-` number on 85 rows and an `AWC-OPP-` number on 17. The other 16 rows hold 4-digit numbers or free text, and one non-opportunity value is repeated across 4 different customers. Also: 39 rows with no segment, 49 with no account number, 2 account numbers shared by different customers, 2 duplicate rows (same account, SER, and customer), 28 with no opportunity link, boolean "FCP Submitted" with no date, and a "$9.99"-shaped placeholder amount on 2 rows.

## 11. Review decisions

Decided in review on 2026-10-15:

1. **Account key is `salesforceCustomerId`**, matching the "Customer ID" name in CDW's Salesforce tenant. Unique, nullable, imported from "New CDW Account #".
2. **Funding extensions are legacy only.** They are no longer offered. `isFundingExtension` stays as an import-only flag for historical records. `parentEngagementId` is **dropped** from the kickoff list: its only use was linking extensions. It is a nullable column, so adding it later is cheap if a parent-child need appears.
3. **The work plan gets its own call-out** (section 2.3). For Corporate and Strategic customers, Customer Approval is two approvals, FCP and work plan, tracked separately with `workPlanSentOn` and `workPlanAcceptedOn`. Commercial has no work plan step.
4. **Only one hard gate:** no `kickoff` or `in_delivery` without `poReceivedOn`. Everything else warns.
5. **Source Chain** means collecting the inputs the FCP is built from (section 5).
6. **The FCP edition is not seeded from `segment`.** The two fields stay independent.
7. **Delete stays owner-or-admin**, matching today. `status = archived` remains available for anyone who prefers to archive.

8. **"Deal ID or Name" is the internal opportunity number** (`C-OPP-xxxxxxx`), stored as the unique `opportunityNumber`.
9. **Strategic is rare.** Broadcom usually takes Strategic customers direct, so CDW seldom handles one. The enum value stays for the one record in the current list, and it is gated like Corporate (Broadcom Approval and work plan). No Strategic-specific screens or views.

**Still to confirm:** what the 17 `AWC-OPP-` numbers are (another Salesforce org or a legacy prefix?). They are accepted as opportunity numbers for now.
