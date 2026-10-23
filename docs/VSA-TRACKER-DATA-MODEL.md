# VSA Tracker Data Model

Status: **Phase 1 implemented** (migration `drizzle/0002_vsa_tracker_core.sql`). **Phase 4 implemented** (FCP workspace per record, migration `0004_fcp_versions.sql`; section 13). **Phase 2 implemented** (daily SharePoint import: `shared/sharepointImport.ts`, `runSharePointImport` in `server/db.ts`, the Import page at `/import`; no schema change). Decisions from review are recorded in [section 11](#11-review-decisions).

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
| 4 | `fcp_draft` | FCP Draft | The FCP is submitted for review (`fcpSubmittedOn`). Readiness: the required source items (section 5) are received, verified, or waived |
| 5 | `broadcom_approval` | Broadcom Approval | Broadcom accepts the FCP (`fcpBroadcomAcceptedOn`). Corporate and Strategic only |
| 6 | `customer_approval` | Customer Approval | Customer accepts the FCP (`fcpCustomerAcceptedOn`) and the Broadcom work plan (`workPlanAcceptedOn`); see 2.3 |
| 7 | `ra_staffing` | RA / Staffing | RA completed, onboarding done, WA received, PO received (`poReceivedOn`). Staffing can start before the FCP is approved; see 2.5 |
| 8 | `kickoff` | Kickoff | Customer kickoff held (`ckomOn`) |
| 9 | `in_delivery` | In Delivery | Delivery closed out (`completedOn`) |
| 10 | `complete` | Complete | Terminal |
| exit | `refused` | Refused | Customer declined the entitlement. Terminal |
| exit | `paused` | Paused | Resumes to the stage it paused from |
| exit | `lost` | Lost | Pursuit lost or delivery cancelled. Terminal |

`complete`, `refused`, and `lost` are terminal but can be reopened with a reason (an explicit backward transition, recorded in `stageEvents`).

### 2.2 Gating by segment

| Stage | Corporate | Strategic | Commercial | Segment not set |
|---|---|---|---|---|
| `broadcom_approval` | Required | Required | **Skipped** | Required (conservative), flagged as a data-quality issue |
| Work plan inside `customer_approval` | Required | Required | Required | Required |
| FCP approval needed for delivery (2.5) | Broadcom's (`fcpBroadcomAcceptedOn`) | Broadcom's | The customer's (`fcpCustomerAcceptedOn`) | Broadcom's (conservative) |
| All other main-line stages | Required | Required | Required | Required |

"Skipped" means `nextStage()` goes from `fcp_draft` straight to `customer_approval` and the board does not show the column for that record. A Commercial record placed in `broadcom_approval` (for example by import) is allowed but flagged.

### 2.3 Work plan call-out

In every segment, Customer Approval holds **two separate approvals**, and the record shows them as two items rather than one stage date. (Until 2026-10-21 the work plan applied to Corporate and Strategic only; see decision 14.)

1. **FCP approval:** the customer accepts the FCP (`fcpCustomerAcceptedOn`).
2. **Work plan approval:** Broadcom sends the customer its work plan (`workPlanSentOn`; Broadcom stage 5.2, "WP Sent to AD/Customer – Pending Acknowledgment") and the customer accepts it (`workPlanAcceptedOn`). Broadcom cannot book the entitlement order until this is done.

They can happen in either order. The record leaves `customer_approval` cleanly only when both are dated. While one is missing, the board card shows which one ("Work plan sent 9/12, not accepted"), and a work plan sent more than 14 days ago without acceptance gets a warning. Leaving Customer Approval without them is a soft gate; entering delivery without them is not (2.5).

`shared/vsaStage.ts` exposes this as `customerApprovalItems(record) -> { fcp, workPlan? }` so the board, the record page, and the warnings all read one definition.

### 2.4 Transition rules (`shared/vsaStage.ts`, pure, tested)

- **Forward:** to the next applicable stage for the record's segment. Skipping ahead more than one stage is allowed with a note (imports and catch-up entries need it).
- **Backward:** to any earlier main-line stage, with a required note.
- **Exits:** any non-terminal stage can move to `refused`, `paused`, or `lost`.
- **Resume:** `paused` returns to the `fromStage` of the event that paused it. If that is unknown (imported as paused), the user picks.
- **Dates:** a transition's `effectiveOn` cannot be before the record's current `stageEnteredOn` or in the future, so history stays in order.
- **Hard gate:** `kickoff` and `in_delivery` cannot be entered until the delivery requirements in 2.5 are met: FCP approval (or a waiver), the customer's work plan acceptance, and the PO. The handbook is explicit that no delivery work begins before the Broadcom PO. Every other exit criterion in 2.1 is a **soft gate**: the transition is allowed, and the record shows a warning until the date is filled.
- `nextStage` goes from `discovery` straight to `fcp_draft`; there is no Source Chain stage (decision 13).
- The module exports `STAGES`, `stageOrder`, `applicableStages(segment)`, `nextStage(record)`, `canTransition(record, to) -> { ok, hardBlock?, noteRequired, warnings[] }`, `exitGaps`, `customerApprovalItems`, `effectiveDateProblem`, `stageWarnings(record, today)`, `deliveryRequirements`, `fcpTrailing`, and `authorizationCheck`. It has no database or React imports.

### 2.5 Staffing ahead of the FCP, and the delivery requirements

Records being caught up can be staffed while the FCP is still being written, and the PO or work authorization can arrive before the FCP is approved. The stage stays a single value: such a record sits in **RA / Staffing**, and the FCP is shown as trailing.

- **Staffing has no gate.** A record can move into `ra_staffing` from any earlier stage in every segment; skipping ahead needs a note, as any skip does.
- **Delivery requirements** (`deliveryRequirements`, hard): `kickoff` and `in_delivery` cannot be entered until all three are met:
  1. **FCP approval:** Broadcom's (`fcpBroadcomAcceptedOn`) for Corporate and Strategic, the customer's (`fcpCustomerAcceptedOn`) for Commercial, **or an FCP waiver**.
  2. **Work plan accepted** (`workPlanAcceptedOn`), in every segment.
  3. **PO received** (`poReceivedOn`).
- **FCP waiver:** the PM or Broadcom said FCP approval isn't required. It stores who said it (`fcpWaiverBy`), which side (`fcpWaiverParty`: `pm` or `broadcom`), the date (`fcpWaivedOn`), where it was said (`fcpWaiverSource`), and who entered it (`fcpWaiverRecordedByUserId`). All four are required. It is saved through its own procedure (`tracker.setFcpWaiver`), not the field patch, and can be removed. It satisfies FCP approval only, never the work plan or the PO.
- **FCP trailing** (`fcpTrailing`): a record in `ra_staffing` or later whose FCP approval is not recorded or waived. Corporate and Strategic: red, since it blocks delivery until Broadcom approves. Commercial: amber, a reminder while staffing (delivery still needs the customer's approval or a waiver). It is a stage warning, a pill on the record, a built-in "FCP trailing" view, and a row in the Overview's data-quality panel. The next action names the FCP gate to record (submit first if the FCP was never submitted).
- **PO / work authorization before the work plan** (`authorizationCheck`, soft): a data-quality flag when `poReceivedOn` or `workAuthReceivedOn` is recorded and `workPlanAcceptedOn` is not. Once the work plan is accepted, the work plan hours (`workPlanHours`) are compared with the PO / work authorization hours (`poHours`): equal hours clear it, different hours raise an **hours mismatch** flag instead. Until both hours are entered the flag stays, asking for them. No email and no block.
- Records created from the FCP workspace (the existing "New engagement" flow, and duplicates) start in `fcp_draft`. Records created from the tracker start in `intake`.

## 3. `engagements` (extended)

Existing columns are unchanged: `id`, `ownerId`, `title`, `customerName`, `customerShortName`, `status` (FCP document completeness: draft/ready/archived, unrelated to `stage`), `data`, `createdAt`, `updatedAt`.

The **Vis** column is the structural tag from section 7: **C** = customer-facing (may appear in exported customer documents), **I** = internal only.

### 3.1 Identity and hierarchy

| Column | Type | Null | Default | Vis | Notes / SharePoint source |
|---|---|---|---|---|---|
| `workspaceId` | int | no | 1 | I | FK `workspaces.id`. Visibility boundary (section 8) |
| `salesforceCustomerId` | varchar(32) | yes | | I | **Indexed, not unique.** The "Customer ID" of the account in CDW's Salesforce tenant, imported from "New CDW Account #" (8 digits today). One account can carry many engagements, because one Salesforce account has many opportunities. NULL until the account exists. Replaces the kickoff's working name `salesforceAccountId`. `opportunityNumber` is the unique business key (one per plan) |
| `salesforceOpportunityId` | varchar(32) | yes | | I | Unique. The Salesforce record ID extracted from the "Opportunity ID" HTML link; the link itself is not stored. Kept for matching; `opportunityNumber` is what people see and search |
| `serNumber` | varchar(32) | yes | | I | "SER Number". Indexed, not unique (two duplicate groups in the export are duplicate rows; import flags them) |
| `opportunityNumber` | varchar(32) | yes | | I | **Unique.** CDW's internal opportunity number for the opportunity under the account in Salesforce, `C-OPP-` plus digits ("Deal ID or Name"). Validated as `^C-OPP-\d{6,8}$`. Shown on the board card and searchable |
| `intakeSource` | enum `manual`, `sharepoint_import`, `intake_import` | no | `manual` | I | How the record was created (section 12). Existing rows backfill to `manual` |
| `intakeSubmissionId` | varchar(64) | yes | | I | **Unique.** The form response ID from the intake import, so re-importing the same file never creates a duplicate |
| `sharepointItemId` | int | yes | | I | **Unique.** The Pipeline List item's built-in `ID`. The primary match key for the daily import (12.4) |
| `importSnapshot` | json | yes | | I | The mapped values from the last SharePoint import of this record. The merge base that tells "changed in SharePoint" apart from "changed in the app" (12.4) |
| `lastImportedAt` | timestamp | yes | | I | Last time an import touched this record |
| `intakeAnswers` | json | yes | | I | Intake form answers that are context, not tracker fields: industry codes, engagement scope, contract length, prior sales or services, MSA, services provided so far, evaluation notes. Read-only after import. Typed by a zod schema in `shared/vsaIntake.ts` |
| `entitlementGroupId` | int | yes | | I | Indexed. NULL for the normal one-plan case. Two or more engagements that are **alternative plans for the same entitlement** share one group id. It is a peer group, not a parent/child link: neither row is primary. Hours and the shared entitlement are counted **once per group, never summed across siblings** (burndown rule; the view is Phase 3). Not in the direct-edit schema; grouping gets its own procedure when the UI needs it |
| `isFundingExtension` | boolean | no | false | I | "Funding Extension". **Legacy only.** Funding extensions are no longer offered; this keeps the 12 imported historical records identifiable. Import-only: not on the new-record form or the edit form |

### 3.2 Classification

| Column | Type | Null | Default | Vis | Notes / SharePoint source |
|---|---|---|---|---|---|
| `segment` | enum `corporate`, `strategic`, `commercial` | yes | | I | "BC Segment". New field. The deal segment. Separate from the FCP plan inputs (`data.fields.commercialPlan`, `adoptionDetails.platformEdition`), and never copied into them on an existing record (docs/FCP-WORKSPACE.md §8.2) |
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
| `workPlanSentOn` | I | (none; new) | Broadcom sends the customer its work plan (2.3) |
| `workPlanAcceptedOn` | I | (none; new) | Customer accepts the Broadcom work plan (2.3). **Required** for `kickoff` and `in_delivery` (2.5) |
| `ikomOn` | I | "IKOM Date" | Internal kickoff |
| `raReceivedOn` | I | (none; new) | RA issued by Broadcom |
| `workAuthReceivedOn` | I | "Work Auth Rec'd Date" | WA |
| `poReceivedOn` | I | "PO Received" | **Required** for `kickoff` and `in_delivery` (2.5) |
| `ckomOn` | C | "CKOM Date" | Customer kickoff |
| `projectStartOn` | C | "Project Start Date" | |
| `estimatedCloseOn` | I | "Estimated Close Date" | |
| `completedOn` | I | (none; new) | Delivery closed out |

Delivery requirements and the hours check (section 2.5, migration 0008):

| Column | Tag | Notes |
|---|---|---|
| `workPlanHours` | I | int. Hours on the accepted work plan |
| `poHours` | I | int. Hours on the PO / work authorization |
| `fcpWaiverParty` | I | enum `pm`, `broadcom`. Who said FCP approval isn't required |
| `fcpWaiverBy` | I | varchar(120). The person who said it |
| `fcpWaivedOn` | I | date. When it was said |
| `fcpWaiverSource` | I | varchar(500). Where it was said |
| `fcpWaiverRecordedByUserId` | I | FK `users.id` (set null). Who entered the waiver |

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
| `buildLockAt` | timestamp | yes | I | When the lock was taken or last renewed. The holder renews it every minute; a lock not renewed for 3 minutes is treated as released (section 13) |
| `rowVersion` | int | no | I | Default 0. Optimistic concurrency for tracker edits now that several people can edit one record. Incremented on every tracker update; a stale write is rejected |
| `updatedByUserId` | int | yes | I | Last editor, for attribution alongside `updatedAt` |

### 3.7 Relationship between columns and the FCP JSON

Several tracker columns overlap with FCP inputs in `data.fields`: `entitlementValue` with `entitlementAmount`, `termStart`/`termEnd` with `entitlementStart`/`entitlementEnd`, and `customerName`. The rule:

- **Tracker columns are authoritative for the tracker.** FCP JSON is authoritative for the FCP document.
- When an FCP is first started from a record, empty FCP fields are seeded from the columns. After that there is no silent sync in either direction.
- When the two disagree, the record shows a "differs from FCP" indicator with a one-click copy in either direction (Phase 4).
- The existing behavior where `updateEngagement` derives `customerName` and `customerShortName` from `data.fields` stays for FCP saves.

### 3.8 Indexes

- `engagements_sf_customer_idx (salesforceCustomerId)`: plain index, one account to many engagements
- `engagements_entitlement_group_idx (entitlementGroupId)`
- unique `engagements_sf_opportunity_uq (salesforceOpportunityId)`
- unique `engagements_opportunity_number_uq (opportunityNumber)`
- unique `engagements_sharepoint_item_uq (sharepointItemId)`
- unique `engagements_intake_submission_uq (intakeSubmissionId)`
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

The checklist of inputs an FCP is built from. It is the **FCP Draft readiness check** and the Phase 4 source checklist; it does not gate a stage of its own (decision 13).

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

FCP Draft readiness is met when every `required` item is `received`, `verified`, or `waived`. Until then, `stageWarnings` reports "Source not received: …" on a record in `fcp_draft`, and leaving FCP Draft lists the open sources with its other gaps. It is a soft check only; the PO is the one hard gate. Waiving a source needs a note, which is how an explicit, recorded decision to proceed without it is kept. New records get a default set (RVTools, discovery notes, customer brief, hours source) from a constant in `shared/vsaStage.ts`.

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
| `vsaRole` | enum `sales`, `architect`, `presales`, `pm`, `leadership` | yes | | Selects the default queue in My Queue (leadership lands on Needs attention; no role lands on Awaiting my action). Not a permission. The existing `role` (`user`/`admin`) stays the only permission flag |
| `updatedByUserId` | int, FK `users.id` (set null) | yes | | The admin who last changed this user's `role`, `vsaRole`, or `workspaceId` on the admin screen. `updatedAt` records when; a sign-in changes only `lastSignedIn` |

### 6.3 `engagementAssignments` (new)

Who is on each record. This drives role views ("my records as architect").

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | int PK auto | no | |
| `engagementId` | int | no | FK, `ON DELETE CASCADE` |
| `role` | enum `sales_rep`, `account_manager`, `presales`, `architect`, `pm`, `sr_consultant`, `broadcom_ad` | no | `broadcom_ad` is the Broadcom account director named on the intake form (email only; never an app user) |
| `userId` | int | yes | FK `users.id`. NULL when the person has not signed in yet |
| `displayName` | varchar(240) | no | |
| `email` | varchar(320) | yes | CDW email. Used to link `userId` when that person first signs in |
| `broadcomEmail` | varchar(320) | yes | "PM / Architect / Sr. Consultant: Broadcom email" |
| `createdByUserId` | int | no | |
| `createdAt`, `updatedAt` | timestamp | no | |

Unique `(engagementId, role)`: one person per role per record. Index `(userId, role)` for role views. All columns are **I**.

SharePoint mapping: "Sales Rep / Owner" → `sales_rep`, "CDW Account Manager" → `account_manager`, "Nat. Presales" → `presales`, "DC FSA" and "Architect" → `architect` (import flags rows where they differ), "PM" → `pm`, "Sr. Consultant" → `sr_consultant`.

This is a table rather than six `*UserId` columns on `engagements` because most imported assignees will not be app users yet. A row can hold a name and email now and link to a user later, and each role carries its own Broadcom email without twelve more columns.

### 6.4 `app_settings` (new)

Workflow parameters an admin can change: the per-stage stale thresholds, the work plan warning, the expiry band limits, and the gate display labels. The stage sequence and gate applicability stay in code. One row per key (`key`, `value` json, `updatedByUserId`, `updatedAt`), seeded from the code constants, which remain the fallback. The keys and rules are in `docs/CONFIGURATION.md` (Operational settings) and `shared/appSettings.ts`.

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
- A test seeds every column with a sentinel string and asserts that no **I** value survives `customerFacingColumns()`. Today no renderer reads tracker columns at all (they render from `data` only); the first one that does must take its input from `customerFacingColumns()`.
- `stageEvents`, `sourceChainItems`, `engagementAssignments`, and `workspaces` are internal in full. They get no per-column map.
- `data` is tagged **C**. The FCP document is customer-facing by design, and its existing export gates (rate card, blended rate) are unchanged.

**Customer-facing columns:** `title`, `customerName`, `customerShortName`, `data`, `entitlementValue`, `termStart`, `termEnd`, `deliveryWindowEnd`, `coreCount`, `fcpCustomerAcceptedOn`, `ckomOn`, `projectStartOn`. Everything else is internal.

## 8. Multi-user model and visibility

### 8.1 Rules

| Action | Who |
|---|---|
| See a record, its events, sources, assignments | Any user in the record's workspace |
| Edit tracker fields, transition stage, edit sources and assignments | Any user in the workspace (shared tracker), with `rowVersion` checks |
| Edit the FCP document | Any user in the workspace. Saves stay last-write-wins, as today, and do not bump `rowVersion` (FCP saves never touch tracker columns). The build lock is enforced from Phase 4 |
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

- Every `db.ts` engagement function takes a `Viewer` and composes `visibleEngagements(viewer)` into its `where`. Child-table functions first load the engagement through the same predicate, then filter the child table by both its own ID and that `engagementId`; they never trust an `engagementId` alone.
- `server/visibility.test.ts` scans the `db.ts` exports touching engagement data and fails if one does not apply the helper (the same spirit as `noThirdPartyPlatform.test.ts`). It also asserts that nothing updates or deletes `stageEvents`.
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

Checked on 2026-10-16 by applying it to a copy of the local database (7 existing FCPs, 1 user): all 7 moved to `fcp_draft` with one `system` stage event each, workspace 1 was created, and the user joined it. A smoke run of every new `db.ts` function against the copy confirmed workspace isolation, stale-write rejection, unique-key handling, the PO hard gate, note rules, pause and resume, waived-source notes, owner-or-admin delete, and cascades.

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

Every column in the current SharePoint list view (46, confirmed against a header-only export of the live list) has a destination:

| SharePoint column | Destination |
|---|---|
| Customer Name | `customerName` |
| Customer State | `customerState` |
| Opportunity ID | `salesforceOpportunityId` (ID extracted from the link) |
| Deal ID or Name | `opportunityNumber` when it is a `C-OPP-` number; otherwise left NULL, the record is flagged "needs opportunity number", and the original text goes to the reconciliation report |
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
| ID (built-in, hidden in the current view; to be added) | `sharepointItemId` |

New fields with no SharePoint column: `termStart`, `termEnd`, `coreCount`, `serSubmittedOn`, `serApprovedOn`, `workPlanSentOn`, `workPlanAcceptedOn`, `raReceivedOn`, `completedOn`, `waitingOn`.

Data-quality flags already visible in the export: "Deal ID or Name" is a `C-OPP-` number on 85 rows. 17 rows hold `AWC-OPP-` placeholders created before opportunities came from Power Automate; they are not valid and are treated like missing numbers. The other 16 rows hold 4-digit numbers or free text, and one non-opportunity value is repeated across 4 different customers. Also: 39 rows with no segment, 49 with no account number, 2 account numbers shared by different customers (allowed by the schema; reported for review), 2 duplicate rows (same account, SER, and customer), 28 with no opportunity link, boolean "FCP Submitted" with no date, and a "$9.99"-shaped placeholder amount on 2 rows.

## 11. Review decisions

Decided in review on 2026-10-15:

1. **Account key is `salesforceCustomerId`**, matching the "Customer ID" name in CDW's Salesforce tenant. Nullable, imported from "New CDW Account #". Made non-unique by decision 12.
2. **Funding extensions are legacy only.** They are no longer offered. `isFundingExtension` stays as an import-only flag for historical records. `parentEngagementId` is **dropped** from the kickoff list: its only use was linking extensions. It is a nullable column, so adding it later is cheap if a parent-child need appears.
3. **The work plan gets its own call-out** (section 2.3). Customer Approval is two approvals, FCP and work plan, tracked separately with `workPlanSentOn` and `workPlanAcceptedOn`. (Commercial had no work plan step until decision 14.)
4. **Only one hard gate:** no `kickoff` or `in_delivery` without `poReceivedOn`. Everything else warns. (Extended by decision 14.)
5. **Source Chain** meant collecting the inputs the FCP is built from (section 5). It is no longer a stage; see decision 13.
6. **The FCP edition is not seeded from `segment`.** The two fields stay independent.
7. **Delete stays owner-or-admin**, matching today. `status = archived` remains available for anyone who prefers to archive.

8. **"Deal ID or Name" is the internal opportunity number** (`C-OPP-xxxxxxx`), stored as the unique `opportunityNumber`.
9. **Strategic is rare.** Broadcom usually takes Strategic customers direct, so CDW seldom handles one. The enum value stays for the one record in the current list, and it is gated like Corporate (Broadcom Approval and work plan). No Strategic-specific screens or views.

10. **`AWC-OPP-` numbers are placeholders**, not valid opportunity numbers. Only `C-OPP-` is accepted. The 17 placeholder rows import with no opportunity number and a "needs opportunity number" flag.
11. **Intake starts with a daily import of the SharePoint Pipeline List** (12.4). The flow stays as it is. Restructuring the flow and replacing the list write with an Intake Log is kept in the plan as a later option, if IT allows it (12.5).
12. **One account, many engagements; alternative plans form a peer group** (2026-10-16, before the Phase 1 migration was merged). Some customers carry two alternative plans that share one entitlement, and their hours must never be summed (VSA end-to-end reference, pipeline-health section). A unique `salesforceCustomerId` made that impossible, since one Salesforce account legitimately has many opportunities. So:
    - `opportunityNumber` is the unique business key, one per plan.
    - `salesforceCustomerId` is a plain index (`engagements_sf_customer_idx`), not unique.
    - New `entitlementGroupId` (nullable, indexed) groups alternative plans as peers. `parentEngagementId` stays dropped: this is not a parent/child link.
    - `sharepointItemId`, `opportunityNumber`, `intakeSubmissionId`, and `salesforceOpportunityId` stay unique.
    - Burndown counts hours and the shared entitlement once per `entitlementGroupId`, never summed across siblings. Phase 1 adds the column only; the burndown code is Phase 3.
    - Migration 0002 was regenerated with the change. The local dev database, which already had the earlier 0002, was corrected in place (same three statements) rather than rebuilt, to keep edits made after it was applied.
13. **Source Chain is not a stage** (2026-10-16). The team doesn't run it as a discrete step, so as a stage it was a board column nobody worked. The main line is now 10 stages: Intake, Broadcom Request (SER), Discovery, FCP Draft, Broadcom Approval, Customer Approval, RA / Staffing, Kickoff, In Delivery, Complete, with exits Refused, Paused, and Lost unchanged.
    - `sourceChainItems` stays exactly as it was. It is now the FCP Draft readiness check (section 5): a soft warning on a record in FCP Draft while a required source is open, never a block.
    - The explicit, recorded decision to go ahead without a source is the existing waive-with-note rule. There is no separate mechanism.
    - Import is unaffected. Nothing mapped to `source_chain`: "1 Customer Discovery & Scoping" maps to Discovery and "2 FCP" to FCP Draft. The backfill of existing FCPs to FCP Draft is unchanged.
    - Migration 0002 was amended in place, since `vsa-tracker` had not been released. The local dev database had one record in Source Chain. It was moved to FCP Draft, its one stage event was re-pointed with a note saying so, and the enum columns were narrowed in place rather than the database being rebuilt, to keep the data. The result was checked against a fresh build from the migrations.

14. **Staffing can run ahead of the FCP; delivery has three requirements** (2026-10-21). Catch-up records get staffed, and receive the PO or work authorization, while the FCP is still being written. Section 2.5 has the rules:
    - The stage stays one value. A catch-up record sits in RA / Staffing, with the FCP flagged as trailing: red for Corporate and Strategic, amber for Commercial.
    - Staffing has no gate in any segment.
    - Entering Kickoff or In Delivery needs FCP approval (Broadcom's for Corporate and Strategic, the customer's for Commercial), the customer's work plan acceptance in every segment, and the PO.
    - An FCP waiver from the PM or Broadcom, with who, when, and where, satisfies FCP approval only.
    - A PO or work authorization before work plan acceptance is a soft data-quality flag. It clears when the accepted hours match, and becomes an hours mismatch when they don't.
    - The work plan now applies to Commercial. Migration 0008 adds the hours and waiver columns; it is additive.

## 12. Intake and the Power Automate flow

Based on the exported flow definition (`ServiceEngagementFlow`, exported 2026-10-16). The flow's run history was not available, so the failure points below are read from the definition, not observed.

### 12.1 What the flow does

Trigger: a response to the Broadcom Services Engagement Participation Request form. In order:

1. Reads the response and cleans the client name (strips 16 punctuation characters) for use in folder paths.
2. Looks up the Salesforce Account whose `CustomerID__c` equals the form's Customer ID. If none is found, it emails the rep **and continues**.
3. Looks up the rep, the rep's manager, and the DC architect in the directory.
4. Creates the client folder `Discovery/Clients/<name>`, plus `RVTools Exports`, and moves uploaded RVTools files into it.
5. For each matching account: creates the Opportunity ("<name> - VMware LLC", stage Discovery, close date = booking date + 14 days) and a product line at the entitlement amount. It then creates the Pipeline List item (Title = the `C-OPP-` number, stage "1 Customer Discovery & Scoping", RA "1 Not Started", risk "Submitted", VSA Expiration = booking date + 364 days) and sends four emails: rep and manager, DC architect, the SDDC team (asking them to copy the data by hand into Broadcom's Google form, the SER), and the Broadcom account director (risk-assessment terms).

This confirms the account key: the form's Customer ID is Salesforce `Account.CustomerID__c`, the value `salesforceCustomerId` holds.

### 12.2 Why it keeps breaking

| # | Issue | Effect |
|---|---|---|
| 1 | **No error handling.** The "Go Here If Failed" scope is empty; there is no terminate, retry, or failure notice | Any failed step leaves a half-finished intake, and no one is told unless they check run history |
| 2 | **Not safe to re-run.** Nothing checks for an existing opportunity, folder, or list item | Resubmitting the form, or re-running a failed run, creates a second opportunity and list item |
| 3 | **Account-not-found does not stop the flow** | The folder is created and RVTools files are moved, but no opportunity or list item is made. The rep's fix (resubmit) then runs into issue 2 |
| 4 | **Directory lookups gate everything.** The rep's manager and the DC architect must resolve before any real work starts | A rep with no manager set, or a blank or guest architect, fails the whole run before anything is created |
| 5 | **One long chain.** The opportunity, product, list item, and four emails run strictly in sequence, each after the previous succeeds | A product-line failure leaves an opportunity with no list row and no emails. A failed email skips every later email |
| 6 | **RVTools file selection takes the whole folder.** It lists every file in the form's upload folder, not just this response's files, then moves and deletes them all | If a previous run failed partway or two submissions overlap, **one customer's RVTools exports are moved into another customer's folder**. This is a data-handling problem, not just a reliability one |
| 7 | **The list item uses people fields** (sales rep and DC FSA as user claims) and choice values typed as text | An unresolvable person, or a renamed choice value, fails the list write |
| 8 | **The For-each over matched accounts** | Two accounts with the same Customer ID create two opportunities and two list items |
| 9 | Hard-coded IDs (list GUID, product ID, site URLs) and an always-false condition (`1 = 2`) left over from testing | Fragile to any SharePoint or Salesforce change; confusing to maintain |

The list write (7) is only one of nine. Replacing the list with the app removes it, but most of the breakage is in 1 to 6.

### 12.3 The constraint

The app is standalone now and integration-ready behind clean seams (kickoff, revised 2026-10-16). It makes no calls to Salesforce, SharePoint, or mail, and no outbound network calls except the database, until a specific connector is approved and built; data moves as files. So the app cannot take over steps 2, 4, or 5 (account lookup, folders and files, opportunity, emails) without reopening that decision.

### 12.4 Baseline: daily import of the Pipeline List

The first operating mode assumes the flow and the SharePoint list stay exactly as they are, and the app pulls the list in once a day. People may keep updating SharePoint during the transition while others work in the app, so the import is built to run every day, safely.

**Pipeline source seam.** Row acquisition is separate from reconciliation. `server/pipelineSource.ts` turns the input into normalized `RawPipelineRow[]` (tracker field names, derived stage, assignments, per-row flags). `planMappedRows`, the per-field merge, stage events, and the reconciliation report work only on those rows. The CSV upload is the only source (`PIPELINE_SOURCE=csv`). An approved Salesforce or SharePoint pull would be a second source producing the same rows, with no change to reconciliation.

**How the file gets in.** The app cannot fetch from SharePoint (no outbound network). Once a day, someone exports the list view to CSV (SharePoint "Export to CSV") and uploads it on the app's Import page. The server parses the CSV; it holds tracker data only, no RVTools. A dry run shows the reconciliation report before anything is written, and the import is applied in one transaction.

**One change to the SharePoint view, no IT needed:** add the built-in **ID** column to the view that gets exported. It is the only key every row has. Without it, the 33 rows with no valid `C-OPP-` number could only be matched on SER or customer name, and a renamed customer would come in as a duplicate.

**Matching** (first hit wins, every fallback is reported): `sharepointItemId` → `opportunityNumber` → `serNumber` → `salesforceCustomerId`. An unmatched row creates a record with `intakeSource = sharepoint_import`. A row that matches two records is skipped and reported. Because `salesforceCustomerId` is not unique, the account fallback only counts when it identifies exactly one record.

**Same account, different opportunity numbers** are two engagements, and duplicate account numbers in the export are no longer an insert failure. **Same account and same opportunity number** is a duplicate row: skipped and reported.

**Merge rule, per field,** using `importSnapshot` (the values from the last import) as the base:

| SharePoint value vs last import | App value vs last import | Result |
|---|---|---|
| Unchanged | Any | Keep the app value |
| Changed | Unchanged | Take the SharePoint value |
| Changed | Changed, same new value | No change |
| Changed | Changed, different values | Keep the app value; listed as a conflict in the report |

So SharePoint edits flow in, app edits are never overwritten, and only true two-sided edits need a person. After each import, `importSnapshot` is updated to the imported values.

**Stage:** the stage derived from the row (section 10) goes through the same rule. A stage change taken from SharePoint is written as a `stageEvents` row with `source = import` and `effectiveOn` from the relevant gate date, or from "Modified" if none fits.

**Rows that disappear** from the export are never deleted in the app. They are listed in the report as "not in today's export".

**Idempotent:** importing the same file twice changes nothing the second time. A test covers this.

**As built (Phase 2):**

- **Procedures:** `pipelineImport.preview` writes nothing. `pipelineImport.commit` re-plans on locked rows and writes everything in one transaction. (`apply` is reserved by tRPC.)
- **Who can run it:** any workspace member. Every change is attributed to the user who ran it.
- **Unchanged rows:** a row whose record does not change keeps its `updatedAt` and `rowVersion`, so a daily import does not reorder lists or cause edit conflicts. Only `importSnapshot` and `lastImportedAt` are written.
- **Value rules:**
  - Person columns: `[]` means empty. Several people in one column are kept together in one assignment and flagged. A `Z_Archive:` prefix is removed and flagged.
  - Amounts: `$0.00` is treated as a placeholder and left empty.
  - Client folders: site-relative paths are prefixed with `https://cdw.sharepoint.com` (text only; never fetched).
  - Opportunity numbers: read from "Deal ID or Name", else the link text of "Opportunity ID". The Salesforce opportunity ID comes from the link.
- **Architect vs DC FSA:** "Architect" (the delivery architect, with a Broadcom email) is kept over "DC FSA" when both are set; the difference is flagged. If DC FSA should be its own role, that is an enum change in a later migration.
- **Stage dates:** a stage taken from SharePoint is dated from its gate date (FCP draft, Broadcom or customer acceptance, PO, CKOM), else from "Modified". The date is never earlier than the record's current `stageEnteredOn` and never in the future.
- **Fallback matches:** a fallback key never matches a record that holds a different SharePoint item ID or a different opportunity number.
- **Conflicts** are reported once. The snapshot then records the SharePoint value, so the app value stays without being reported again until SharePoint changes the field.

### 12.5 Later, if IT allows: restructure the flow and add an Intake Log

This is the preferred end state, kept in the plan in case IT allows the flow changes. Nothing in the daily-import baseline depends on it, and the schema needs no change to adopt it.

**Keep the flow for what only it can do, restructure it, and stop it writing the 46-column list.**

Flow changes (Power Automate work, outside this repo):

1. **Validate first, then act.** Look up the account before anything is created. If it is not found or matches more than one, email the rep and **terminate** (fixes 3, 8).
2. **Make directory lookups optional.** Treat a failed manager or architect lookup as "unknown", and carry on (fixes 4).
3. **Check before create.** Search for an existing opportunity for this account before creating one. Folder creation tolerates an existing folder (fixes 2).
4. **Pick only this response's RVTools files** using the file list in the response's upload answer, not the whole folder (fixes 6). This one should be fixed even if nothing else changes.
5. **Wrap the main work in a Try scope and add a Catch scope** that runs on failure or timeout and emails the SDDC team the run link and what was already created (fixes 1, 5).
6. **Run the emails in parallel branches** after the opportunity exists, so one failure does not skip the rest (fixes 5).
7. **Replace the Pipeline List write with an "Intake Log"**: a plain SharePoint list or Excel table with text-only columns (response ID, submit date, Customer ID, client name, `C-OPP-` number, opportunity ID, flow result). No people or choice fields (fixes 7). The app imports this log, plus the form-response export for the answers.

App side, the intake import (replaces the daily list import as the source of new records):

- Matches on `intakeSubmissionId`, then `opportunityNumber`, then `salesforceCustomerId` (only when it identifies exactly one record). Records that came from the daily list import match on `opportunityNumber`, so switching sources creates no duplicates. A rerun of the same file changes nothing.
- Creates the record at stage `intake` (the SER is still submitted by hand by the SDDC team, so `broadcom_request` starts when `serSubmittedOn` is set), with `riskAssessment = submitted`, as the flow does today.
- Maps the answers: Y1 VCF consulting amount → `entitlementValue`; estimated booking date → `estimatedCloseOn`; booking date + 364 days → `deliveryWindowEnd`, marked as an estimate until confirmed; estimated cores → `coreCount`; estimated ABV → `estimatedDealValue`; rep, DC architect, and Broadcom AD → assignments; everything else → `intakeAnswers`.
- Never handles RVTools files. The upload stays in SharePoint as today; the architect loads RVTools in the browser, so raw data still never reaches the app.

If you later want the app to own the form itself (option C in the earlier draft), it would export an intake file to a watched SharePoint folder, and the restructured flow would start from that file instead of from Forms. Nothing in the schema changes for that.

Cutover from the baseline: once the Intake Log is live and the team works from the app, the daily list import is turned off and the intake import takes over. Fix 4 (the RVTools file selection) is worth asking IT for on its own, even if nothing else changes.

### 12.6 Smaller findings

- The flow writes five list fields that are not in the 46-column export (`VSEStage`, `AccelerationFundStage`, `DiscoveryReadinessStage`, `Alignment`, and a "Professional Services" field). They look unused. The importer ignores them unless told otherwise.
- The form collects the Broadcom account director's email. That is now the `broadcom_ad` assignment role.
- The VSA Expiration the flow sets is an estimate (booking + 364 days), so imported expiry dates from intake are only as good as the booking date.

## 13. FCP workspace per record (Phase 4)

Each FCP belongs to its tracker record. The workspace shows the record's stage, FCP Draft readiness, and hours source; keeps a version history; and allows one editor at a time. Rules are in `shared/fcpRecord.ts`.

### 13.1 Source checklist in the FCP

- The workspace shows FCP Draft readiness from `sourceChainItems` (section 5), for example "3 of 4 sources in", with the open items named and a link to the Sources tab.
- **Evidence ticks items off.** An FCP save moves a checklist item from needed or requested to received, with a date, a reference, and a note saying why, when the document holds the evidence:
  - **`rvtools`:** RVTools was imported. The reference is the file names; the date is the import date. Only aggregates and file metadata are in the document, as before.
  - **`customer_brief`:** the brief was imported ("what we heard", personnel, questions, or sources are present).
  - **`hours_source`:** signed resource-assignment hours are entered.
- **Evidence never undoes a decision.** It never changes a verified or waived item, never moves anything backward, and never touches discovery notes, which stay with people.

### 13.2 Hours source

- Where the plan's hours come from: the **signed resource assignment** (hours by role from the signed Broadcom work plan) when one is recorded, otherwise the calculated estimate (services catalog, hours model v2; or host brackets, v1).
- Shown in the workspace; a signed RA reads as a verdict pill with its total hours.

### 13.3 `fcpVersions` (new, migration 0004)

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | int PK auto | no | |
| `engagementId` | int | no | FK `engagements.id`, `ON DELETE CASCADE` |
| `versionNumber` | int | no | 1, 2, 3, … per engagement. Unique with `engagementId` |
| `title` | varchar(240) | no | The engagement title at the time |
| `data` | json | no | The full FCP document. Customer-facing content, same classification as `engagements.data` |
| `dataHash` | varchar(64) | no | SHA-256 of the document JSON |
| `label` | varchar(160) | no | For example "Sent to customer for review", "Submitted: moved to Broadcom Approval", "Exported Condensed FCP (PDF)" |
| `reason` | enum `manual`, `submitted`, `export`, `restore` | no | |
| `createdByUserId` | int | yes | FK `users.id`, `ON DELETE SET NULL` |
| `createdAt` | timestamp | no | |

- **When versions are made:**
  - when someone saves one, with a label;
  - when the record leaves FCP Draft forward, which is always recorded as a milestone;
  - on every FCP or Condensed FCP export. A repeat export of an unchanged FCP is not saved again.
- **Restore:** it saves the current FCP as a "Before restoring version N" version first, so a restore can itself be undone. It restores document content only; the engagement keeps its current customer name and title (decision 12 and the connected-name rules).
- **Versions can be previewed and downloaded as HTML.** They are reached only through a visible engagement, and `server/visibility.test.ts` enforces that.

### 13.4 Build lock

- **One editor per FCP.** Opening an FCP takes the lock (`buildLockUserId`, `buildLockAt`). The holder's workspace renews it every 60 seconds and releases it on leaving, including closing the tab. A lock not renewed for 3 minutes is free. That is shorter than the 30 minutes first proposed, because the heartbeat keeps an active editor's lock alive.
- **While someone else holds a live lock:**
  - the workspace is read-only, with a banner naming the holder and controls disabled;
  - the server refuses that user's FCP saves and restores (CONFLICT, with the holder's name);
  - autosave runs only while the user holds the lock.
- **Take over editing** (with confirmation) moves the lock. The previous holder's next save is refused, and their workspace turns read-only.
- **Scope:** tracker edits in the record drawer are not covered by the lock; they keep their `rowVersion` check. Saving an FCP renews the lock.

### 13.5 Record files (file source seam)

- The record drawer's **Files** tab shows the client folder as an "Open client folder" link and lists the record's files as links out. Read-only: no upload, no download, no storage.
- The list comes from `server/fileSource.ts` through `tracker.files`, which reads the record through `server/visibility.ts` like every record read.
- **`references` (default):** the client folder (`clientFolderUrl`), then each source checklist `reference`. A link is listed as itself. A file name or folder path links to the client folder that holds it. Free-text references are left out. Only `https:` URLs are returned.
- **`sharepoint` (reserved, not built):** a read-only Microsoft Graph listing of the client folder, behind `FILE_SOURCE`, once that connector is approved. No schema change is needed for either.
