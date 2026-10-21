# VSA Tracker: North-Star Architecture and Roadmap

**Status:** DRAFT FOR REVIEW. No feature code, no schema change, and no migration until this document and the customer model pass the review gate.
**Owner:** Andrew Walker
**Date:** 2026-10-20 (grounded against the repo 2026-10-20)

---

## 0. Read this first: how this draft was grounded

The first draft was written from the brief without the repository. It has since been checked against the code: `drizzle/schema.ts`, the migrations in `drizzle/`, `server/db.ts`, `server/routers.ts`, `server/_core/trpc.ts`, `server/trustedSso.ts`, `server/visibility.ts`, `server/fileSource.ts`, `server/pipelineSource.ts`, `shared/vsaStage.ts`, `shared/vsaFields.ts`, `shared/vsaViews.ts`, `shared/vsaReports.ts`, `shared/vsaDashboard.ts`, the identity fields in `shared/fcp.ts`, `docs/VSA-TRACKER-DATA-MODEL.md`, `docs/VSA-TRACKER-IT-INTEGRATION.md`, `docs/DEPLOYMENT.md`, `docs/SECURITY-REVIEW.md`, `.github/workflows/ci.yml` and `CLAUDE.md`. Row counts come from `COUNT(*)` queries only; no records were read.

Section 9 records what each former VERIFY item turned out to be. Where the code contradicted the draft, the design was corrected in place, and the change is called out with **Grounded:**.

### What the code establishes

| Fact | Source |
|---|---|
| Database is **MySQL** through Drizzle (`drizzle-orm/mysql-core`, `drizzle-orm/mysql2`, `dialect: "mysql"`). | `drizzle/schema.ts`, `server/db.ts`, `drizzle.config.ts` |
| `engagements` is the top-level record. PK `id` is `int` autoincrement. | `drizzle/schema.ts` |
| `engagements.salesforceCustomerId` is `varchar(32)`, nullable, **indexed, not unique** (`engagements_sf_customer_idx`). It holds the account's Salesforce "Customer ID" (`Account.CustomerID__c`, imported from "New CDW Account #", 8 digits today). The brief says this is the **VSA-only** account, not the main end-customer account. | `drizzle/schema.ts`; data model 3.1, 11.12, 12.1; brief |
| `opportunityNumber` (`C-OPP-` digits) is the unique business key, one per plan. `salesforceOpportunityId`, `sharepointItemId` and `intakeSubmissionId` are also unique. | `drizzle/schema.ts`; data model 11.12 |
| `entitlementGroupId` exists: `int`, nullable, indexed. It is a **peer group of alternative plans that share one entitlement**, so hours and the entitlement are counted once per group. It is not a customer grouping. | `drizzle/schema.ts`; data model 3.1, 11.12 |
| `customerName` is `varchar(240)`, not null, default `"Untitled customer"`. `segment` (`corporate`/`strategic`/`commercial`), `region` (`west`/`east`) and `ownerId` (`int`, not null, attribution only) are on `engagements`. | `drizzle/schema.ts`, `shared/vsaStage.ts`, `shared/vsaFields.ts` |
| The FCP engine keys off the engagement document (`data.fields.customerName`, `data.fields.accountId`), not any DB grouping key. | `shared/fcp.ts`, `server/db.ts` |
| tRPC with `protectedProcedure` (any signed-in user) and an `adminProcedure` (defined, not used by `appRouter` today). Every record read and write goes through `server/visibility.ts`. | `server/_core/trpc.ts`, `server/routers.ts`, `server/visibility.ts` |
| SSO is a trusted OIDC gateway (`FCP_AUTH_MODE=trusted-proxy`). The app has no login flow. | `server/trustedSso.ts`, `CLAUDE.md` |
| Migrations: `drizzle-kit generate`, then `pnpm db:migrate` (backs up first). Never `pnpm db:push`. | `CLAUDE.md`, `package.json` |
| `server/pipelineSource.ts` (`PIPELINE_SOURCE`, only `csv` built) and `server/fileSource.ts` (`FILE_SOURCE`, only `references` built) are the integration seams. They make no outbound calls. | the two files; `server/integrationSeams.test.ts` |
| Email flows run in Power Automate today (one flow, `ServiceEngagementFlow`). The SharePoint VSA Pipeline List is the incumbent system; a daily CSV import of it is built. | data model 12 |
| Work rules: additive only, PRs into protected `main` with CI green (`pnpm check`, `pnpm test`), config and docs change together, standalone until a connector is approved. | `CLAUDE.md`, brief |

### Current volume (local MySQL, `COUNT(*)` only, 2026-10-20)

| Table | Rows |
|---|---|
| `engagements` | 125 (69 with a `salesforceCustomerId`, 65 distinct values; 56 without one; 0 with an `entitlementGroupId`) |
| `stageEvents` | 126 |
| `sourceChainItems` | 472 |
| `engagementAssignments` | 373 |
| `fcpVersions` | 3 |
| `savedReports` | 0 |
| `users` / `workspaces` | 1 / 1 (single local user) |

The SharePoint list export behind this had 118 rows (data model section 10).

---

## 1. Customer identity model (the spine; lock this first)

### 1.1 Problem

Today the engagement is the top of the tree, and its only Salesforce key is the **VSA-only** account. As a result:

- Two engagements for the same real customer don't know they're related unless they happen to share a VSA account ID. Today 56 of 125 engagements have no account ID at all, so they can only be related by name.
- Salesforce pipeline (opportunities hang off the **main** account), Broadcom forecasting (keyed on the end customer) and the SharePoint list (free-text customer names) can't join cleanly to an engagement.

The fix is a `customers` table above `engagements`, keyed on the **main end-customer Salesforce Customer ID**, with every external account and every engagement hanging off it.

**Grounded:** the first draft also listed "the alternative plans case needs a side key (`entitlementGroupId`)" as part of this problem. It doesn't. `entitlementGroupId` answers a different question (which plans share one entitlement) and stays. See 1.5.

### 1.2 Target entities

Table names follow the repo's camelCase convention (`stageEvents`, `sourceChainItems`, `engagementAssignments`). Every new table uses `int` autoincrement PKs and `int` FKs, matching `engagements.id`.

```
customers (1) ──< customerAccounts (n)   main SF account + 0..n VSA SF accounts (+ later: Broadcom site/ERP IDs)
customers (1) ──< customerAliases  (n)   names seen in SF, SharePoint, Broadcom files, email
customers (1) ──< engagements      (n)   existing table, gains customerId
customers (1) ──< customerMerges   (n)   audit of every merge into this customer
```

**Visibility:** `customers` carries `workspaceId` like `engagements` and `savedReports`. `server/visibility.ts` gains `visibleCustomers(viewer)`, and every customer query in `server/db.ts` composes it. Tables that hang off customers are reached only through a visible customer. `server/visibility.test.ts` is extended to enforce this, as it does for engagements.

#### `customers` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | `int` autoincrement PK | Internal surrogate. Never exposed as a business key. |
| `workspaceId` | `int`, not null, default 1, FK → `workspaces` | Visibility boundary, as on `engagements`. |
| `mainSfAccountId` | `varchar(32)`, nullable, **unique** | The main end-customer Salesforce Customer ID (`Account.CustomerID__c`, the same format as `salesforceCustomerId`). In MySQL a unique index on a nullable column allows any number of NULLs, so this gives "unique where not null" directly. It must be `varchar`, not `text`: MySQL can't put a unique index on a `text` column without a prefix length. NULL only while status = `provisional`. |
| `canonicalName` | `varchar(240)`, not null | Display name. Same length as `engagements.customerName`. Editable by data stewards, with an audit entry for every change. |
| `normalizedName` | `varchar(240)`, not null, indexed | Lower-cased, punctuation and legal suffixes stripped (Inc, LLC, Corp, "The"). Used for dedup. |
| `status` | `mysqlEnum` `active`, `provisional`, `merged`, `archived` | `provisional` = no main SF ID confirmed yet. `merged` = tombstone. |
| `mergedIntoCustomerId` | `int`, nullable, FK → `customers` | Set only when status = `merged`. Lookups follow it so old links never 404. |
| `segment`, `region` | nullable `mysqlEnum`, the same `SEGMENTS` and `REGIONS` as `engagements` | Both exist per engagement today. At customer level they're a default that engagements can override. Whether to store them or derive them is decision 8.5. |
| `ownerId` | `int`, nullable | Attribution only, like `engagements.ownerId`. Not a permission. |
| `createdAt`, `updatedAt` | `timestamp`, `defaultNow()`, `updatedAt` also `onUpdateNow()` | The repo convention. |
| `createdByUserId`, `updatedByUserId` | `int`, FK → `users`, `onDelete: "set null"` | The repo's actor convention (`sourceChainItems`, `engagements.updatedByUserId`). |
| `rowVersion` | `int`, not null, default 0 | Optimistic concurrency, as on `engagements`. |

#### `customerAccounts` (new): external identities linked to a customer

| Column | Type | Notes |
|---|---|---|
| `id` | `int` autoincrement PK | |
| `customerId` | `int`, not null, FK → `customers` | |
| `system` | `mysqlEnum` | `salesforce` now. Reserved for later: `broadcom`, `sharepoint_list`. |
| `accountRole` | `mysqlEnum` `main`, `vsa` | Exactly one `main` per customer per system. Zero or more `vsa`. |
| `externalId` | `varchar(32)`, not null | The Salesforce Customer ID. `varchar` so it can be part of a unique index. |
| `externalName` | `varchar(240)` | Name as the source system shows it, for alias capture. |
| `source` | `mysqlEnum` | `backfill`, `manual`, `csv_import`, `sf_read` (later). |
| `verifiedAt`, `verifiedByUserId` | nullable | Set when a person confirms the link. |
| `mainCustomerKey` | `int`, generated: `IF(accountRole = 'main', customerId, NULL)` | Exists only to enforce one main per customer (below). |
| | | **Unique (`system`, `externalId`)**: an external account belongs to exactly one customer. |
| | | **Unique (`system`, `mainCustomerKey`)**: one main per customer per system. |

**Grounded (MySQL):** MySQL has no partial indexes, so "unique (`customerId`, `system`) where `accountRole = 'main'`" can't be written directly. The generated column holds `customerId` on `main` rows and NULL on `vsa` rows. Because MySQL allows many NULLs in a unique index, the `vsa` rows never collide and two `main` rows for one customer do. The single write path in `server/db.ts` also checks it first, so a steward sees a clear message rather than a duplicate-key error. Generated columns need MySQL 5.7 or later; the production MySQL version is still an IT question (8.4).

`customers.mainSfAccountId` duplicates the `main` row in `customerAccounts` on purpose, so the common lookup is fast. MySQL can't enforce that two tables agree without triggers, so a single write path in `server/db.ts` keeps them in sync, and a test checks that no other code writes either column. **Decision for review:** keep the denormalized column, or drop it and always join. The draft recommends keeping it.

#### `customerAliases` (new)

| Column | Notes |
|---|---|
| `customerId` (`int` FK), `alias` (`varchar(240)`), `normalizedAlias` (`varchar(240)`, indexed), `source` (`mysqlEnum` `sf`, `sharepoint`, `broadcom_file`, `manual`, `merge`) | Every name seen for the customer. On a merge, the losing customer's canonical name becomes an alias of the winner, so search by the old name still finds it. |

#### `engagements` (existing): additive changes only

| Change | Notes |
|---|---|
| Add `customerId` `int`, FK → `customers`, **nullable** at first, indexed | Becomes required (application-level, then DB `NOT NULL`) only after the backfill is fully resolved. See Phase 1. |
| **Keep** `salesforceCustomerId` (`varchar(32)`, nullable, indexed) | Not dropped and not renamed. After the backfill it matches a `customerAccounts` row with `accountRole = 'vsa'`. A later, separately reviewed phase can add `vsaAccountId` FK → `customerAccounts` and deprecate the text column. **No destructive change in this roadmap.** |
| **Keep** `entitlementGroupId` | It's the correct key for alternative plans. See 1.5. |
| Tag `customerId` in `ENGAGEMENT_COLUMN_VISIBILITY` (`shared/vsaFields.ts`) | `internal`. `pnpm check` fails if a new column is untagged. |

### 1.3 Rollup rules ("everything rolls up to the customer")

| Measure | Engagement level | Customer level |
|---|---|---|
| VSA progress / stage | Stored on the engagement (`stage`, `stageEnteredOn`, history in `stageEvents`). | **Derived:** furthest-behind active engagement by `stageOrder()` (exit stages excluded), plus a count by stage. Not stored. |
| Gate / warning status | Computed per engagement today: `exitGaps()` and `stageWarnings()` in `shared/vsaStage.ts` (soft), the PO hard gate, and `staleness()` in `shared/vsaDashboard.ts`. | Worst status across active engagements. |
| Pipeline (SF opportunities) | Opportunities linked to the engagement's VSA account, or explicitly tagged to the engagement. | All opportunities on the main account and every VSA account. |
| Entitlement / burndown / FCP | Per engagement (the FCP engine is unchanged). | Sum across the customer's engagements, **counting each `entitlementGroupId` group once**, the same rule `shared/vsaViews.ts` and `shared/vsaReports.ts` apply today. Shown read-only. FCP calculations still run per engagement. |
| Broadcom forecast | n/a | Joined by customer through `customerAccounts` / aliases. |
| Activity / audit | Engagement trail (`stageEvents`, `fcpVersions`, later `auditLog`). | Union of the customer trail and every engagement's trail. |

Customer-level numbers are **computed in queries or views, not stored**. That avoids a second source of truth and makes merges cheap: repoint the engagements and the rollups follow.

### 1.4 FCP engine contract (do not break)

**Grounded:** `shared/fcp.ts` treats the customer as two strings in the engagement document: `data.fields.customerName` (max 240) and `data.fields.accountId` (max 120). Despite its name, `accountId` is a short display name: `server/db.ts` copies it into `engagements.customerShortName`, and `customerName` into `engagements.customerName`, on every FCP save. `shared/customerName.ts` keeps renames consistent between the document, the column and the title. `shared/fcp.ts` never reads `salesforceCustomerId`, `entitlementGroupId` or any other DB key.

- The FCP engine keeps its current identity input. The customer layer **adds** an optional `customer` context next to the engagement and never writes `data.fields`.
- Any FCP output that prints a customer name keeps reading `data.fields.customerName`. The customer canonical name replaces it only behind a flag, after the review.
- CI gets a **golden-file test** (none exists today): build FCP outputs for a fixed set of fixture engagements (Acme Health, Meridian Health, Riverbend Health, Northwind Mfg) before and after every phase, and require byte-identical results (excluding timestamps).

### 1.5 Alternative plans and `entitlementGroupId`

**Grounded:** the first draft treated `entitlementGroupId` as a workaround for customer grouping, to be retired once `customers` exists, with a `groupKeyFor()` shim that fell back to `customerId`. The code shows that would be wrong:

- **What it is:** a peer group of alternative plans for **one entitlement** (review decision 11.12, migration `0002`). Neither row is primary.
- **Readers:** the entitlement rollup in `shared/vsaViews.ts`, the "Plan group" dimension and count-once aggregation in `shared/vsaReports.ts`, and the "Plan group" chip in `client/src/components/vsa/RecordDrawer.tsx`.
- **Writers:** none. It's not in `trackerPatchSchema` and the import doesn't set it. The data model says grouping gets its own procedure when the UI needs it. 0 of 125 engagements have it set.
- **Not read by `shared/fcp.ts`.** Changing it can't affect the FCP engine.

One customer can hold several separate entitlements, and those must be summed. Two alternative plans for one entitlement must not be. A fallback to `customerId` would merge the first case into the second and undercount hours. So:

**Target:**
- `entitlementGroupId` stays as the alternative-plan key. It isn't a hack and has no retirement path in this roadmap.
- Every member of a group must belong to the same customer. An application check in the grouping procedure enforces it, and the backfill reports any group that would split (none can today, since no group exists).
- An optional `planLabel` (`varchar(120)`, for example "Option B: 3-year") can be added when the grouping UI is built.
- The `alternativeOfEngagementId` self-FK from the first draft is dropped, because it would duplicate `entitlementGroupId`. Decision 8.8 confirms.

### 1.6 Dedup and merge

#### Finding candidates

A nightly job (and an on-demand button) scores customer pairs and writes `customerMergeCandidates` (`customerAId`, `customerBId`, `score`, `reasons` JSON, `status`: open / dismissed / merged):

| Signal | Weight (initial, tune later) |
|---|---|
| Same main SF account ID | Auto-flag **critical**. This shouldn't be possible because of the unique constraint, so it means bad data. |
| A VSA account ID linked to both | Critical (same reason). |
| Exact `normalizedName` match | High |
| Alias of one equals `normalizedName` of the other | High |
| App-side name similarity (Jaro-Winkler or token-set on `normalizedName`) ≥ 0.92 | Medium |
| Same `customerState` on their engagements, plus similarity ≥ 0.85 | Low (tie-breaker only) |

**Grounded (MySQL):** there's no `pg_trgm` and no built-in similarity function. MySQL `FULLTEXT` finds word matches but doesn't score fuzzy name similarity. At this volume (hundreds of customers, so tens of thousands of pairs) the scorer loads every `normalizedName` and alias into Node and compares them in memory, in a pure function in `shared/` with unit tests. `FULLTEXT` isn't needed for dedup.

**Grounded:** the draft's "shared email domain on primary contacts" signal is dropped. No customer contacts are stored. `engagementAssignments` holds CDW and Broadcom staff emails, which say nothing about the customer, and the FCP document's `primaryContact` is a free-text name with no email.

No automatic merges. A person always confirms.

#### The merge operation (one transaction)

`mergeCustomers({ winnerId, loserId, reason })`, data-steward role only:

1. **Snapshot:** write `customerMerges` (`id`, `winnerId`, `loserId`, `actorUserId`, `reason`, `at`, `loserSnapshot` JSON of the full loser row plus its accounts, aliases and the list of engagement IDs moved).
2. **Repoint:** `engagements.customerId`, `customerAccounts.customerId` and `customerAliases.customerId` go from the loser to the winner. Unique-constraint conflicts (for example, two `main` accounts, caught by the `mainCustomerKey` index) **abort** the merge and ask the steward to choose. Silent overwrites aren't allowed.
3. **Alias:** the loser's `canonicalName` becomes an alias of the winner.
4. **Tombstone:** the loser gets `status = 'merged'` and `mergedIntoCustomerId = winnerId`. **It's never deleted.** Every lookup by an old ID follows the pointer, so bookmarks, emails and audit links still resolve.
5. **Audit:** one `auditLog` entry per moved row (see 5.3), plus one summary entry for the merge.
6. **Re-score:** close the candidate and recompute rollups (these are views, so this happens on its own).

#### Unmerge

`unmergeCustomers(mergeId)` replays `loserSnapshot`: it reactivates the loser and moves back only the rows recorded in the snapshot that haven't been edited on the winner since. Rows edited since the merge are listed for the steward to resolve. This is the "never lose history" guarantee.

#### Engagement-level moves

Steward tooling can also **move a single engagement** to another customer (`reassignEngagement`). It's audited the same way. This covers the "this engagement was filed under the wrong customer" case without a full merge. Moving one member of an `entitlementGroupId` group moves the whole group, or is refused.

### 1.7 Migration path (additive, reviewable, reversible)

Every step is its own PR, with CI green, behind the review gate where marked. Migrations are generated with `drizzle-kit generate`, committed, and applied with `pnpm db:migrate`, which backs up the database first. drizzle-kit has no down migrations, so "reversible" below means a separately reviewed forward migration that removes the addition, or a restore from the pre-migration backup. A person runs a restore or any `DROP`/`TRUNCATE` by hand; the repo's Claude Code hooks block them.

| Step | What | Reversible? |
|---|---|---|
| **M0** | **Review gate.** This section, the final DDL, and a dry-run backfill report against a copy of the real data are approved. The report contains real customer names, so it stays on the local machine (in the git-ignored `exports/`) and never goes into the repo, a PR or chat. | n/a |
| M1 | Additive DDL: create `customers`, `customerAccounts`, `customerAliases`, `customerMerges`, `customerMergeCandidates` and `auditLog` (none exist today). Add nullable `engagements.customerId`. No reads change. | Forward migration that drops the new tables and column, or restore the pre-migration backup. |
| M2 | **Backfill script (dry run first):** see below. It writes to staging tables (`bfCustomers`, `bfCustomerAccounts`, `bfAliases`) and produces a CSV/HTML report. | Empty the staging tables (by hand). |
| M3 | Steward review of the report: confirm the auto-groups, resolve the flagged ones, and supply main SF IDs where they're known (CSV upload). | n/a |
| M4 | Promote the staging rows to the real tables and set `engagements.customerId`. Idempotent: running it again changes nothing. | Set `customerId` back to null and remove the promoted rows (recorded by batch ID). |
| M5 | Reads switch to customer-aware screens behind a flag (`FEATURE_CUSTOMER_SPINE`). The old engagement screens stay as they are. | Flag off. |
| M6 | Writes require `customerId` for new engagements (app-level). Unresolved legacy rows show a "needs customer" badge. | Flag off. |
| M7 | When unresolved = 0: DB `NOT NULL` on `engagements.customerId`. **Separate review.** | Forward migration that relaxes the constraint. |

**Grounded:** the app has no feature-flag mechanism today. `FEATURE_CUSTOMER_SPINE` would be the first. It's an environment variable read once at startup, documented in `docs/CONFIGURATION.md` in the same PR, the same way `PIPELINE_SOURCE` and `FILE_SOURCE` are.

#### Backfill algorithm (M2)

```
for each engagement E:
  vsa = normalize(E.salesforceCustomerId)          # varchar(32), may be null (56 of 125 today)
  key candidates:
    1. vsa account ID          -> group by exact ID   (65 distinct IDs across 69 engagements today)
    2. entitlementGroupId      -> union groups that share it   (no-op today: 0 rows set)
    3. normalizedName(E.customerName)    # skip the column default "Untitled customer"
  union-find over engagements using rules 1 and 2 (hard links)
  rule 3 only PROPOSES links (soft), never auto-unions

for each resulting group G:
  create provisional customer:
    canonicalName   = most frequent customerName in G (ties -> most recent engagement)
    mainSfAccountId = NULL   (we only hold VSA IDs today; main IDs come from steward CSV or SF read later)
    status          = 'provisional'
  create customerAccounts(accountRole='vsa') for each distinct VSA ID in G
  create aliases for every distinct name in G

flag for manual review when:
  - a group has >1 distinct normalized name with similarity < 0.85
  - two groups share a soft name link (likely the same customer, different VSA accounts)
  - an engagement has no VSA ID and no name match
  - an entitlementGroupId spans >1 VSA account ID with dissimilar names
```

**Output:** auto-grouped count, flagged count by reason, and a per-group table the steward can edit and re-upload (the M3 CSV). The CSV round-trip is also how **main SF account IDs** get in before any Salesforce connector exists. The steward pastes them from Salesforce, and each row is recorded with `source = 'csv_import'`.

A customer moves from `provisional` to `active` when a main SF ID is confirmed.

---

## 2. Connector backbone (seams only; no live connector yet)

### 2.1 The rule

> **No live connector runs until IT approves it. Until then, the app's only outbound network connection is to its own database.** Every connector below ships with a file/CSV implementation as the default, and the live implementation is either unbuilt or compiled but unreachable. Switching to live is a **config change plus an approval record**, not a rewrite.

This is already enforced three ways: `server/integrationSeams.test.ts` checks the seams make no calls, exported HTML is self-contained, and `docs/DEPLOYMENT.md` tells the platform to deny general egress and allow only the database.

### 2.2 One seam pattern for every source

**Grounded:** this now matches the two existing seams instead of inventing a second style. Both work the same way:

- One environment variable per seam selects an implementation by name: `PIPELINE_SOURCE` (default `csv`) and `FILE_SOURCE` (default `references`).
- The value is parsed once. A reserved name (`salesforce` or `sharepoint`, not built) or an unknown name **throws at startup** rather than at first use.
- A source turns its input into normalized rows, and reconciliation knows nothing about the source. `PipelineSource.acquire(input)` returns a `PipelineBatch` (`rows: RawPipelineRow[]`, `problems`, `intakeSource`, `rowNote`).
- The file seam's `list(record)` returns links only, never file bytes.

New connectors follow the same shape:

```ts
// Proposed. Same style as server/pipelineSource.ts: a name list, a reserved set, a fail-loud parser, a switch.
export const FORECAST_SOURCES = ["file"] as const;          // FORECAST_SOURCE, default "file"; "broadcom" reserved
export type ForecastSource = { name: ForecastSourceName; acquire: (input: { file: string }) => Promise<ForecastBatch> };

export const EMAIL_SINKS = ["off", "draft_log"] as const;   // EMAIL_SINK, default "draft_log"; "live" reserved
export type EmailSink = { name: EmailSinkName; push: (message: RenderedEmail, idempotencyKey: string) => Promise<PushResult> };
```

- **Configuration:** `<SEAM>_SOURCE` for sources and `<SEAM>_SINK` for write-backs (`EMAIL_SINK`, later `SALESFORCE_SINK`). Defaults are the file implementation for sources and `draft_log` / `off` for sinks. Each goes in `docs/CONFIGURATION.md` in the PR that adds it.
- **Approval guard (new):** when a live implementation exists, selecting it fails at startup unless a matching row exists in `connectorApprovals` (`connectorId`, `approvedByUserId`, `itTicket`, `scope`, `approvedAt`, `expiresAt`). That turns "IT approved it" into data the app checks, not tribal knowledge.
- **Egress guard (defense in depth, new):** an outbound-HTTP allowlist wrapper. Any `fetch` to a host that isn't on the approved list throws and logs. The default allowlist is empty.
- **Plan, then apply:** the built pipeline import already works this way. `pipelineImport.preview` plans and writes nothing; `pipelineImport.commit` re-plans on locked rows and applies everything in one transaction; `importSnapshot` is the merge base. New sources reuse this pattern rather than adding `ingest*` staging tables. A source gets staging tables only if its file is too large to re-plan in one request.
- **Ingest log (new):** `ingestBatches` (`id`, `connectorId`, `mode`, `fileName`, `rowsIn`, `rowsApplied`, `rowsRejected`, `startedByUserId`, `startedAt`, `finishedAt`, `errors` JSON). The pipeline import returns its report but doesn't persist it today.

### 2.3 Salesforce read

**Grounded:** the data model names no VSA-specific custom fields in Salesforce. The only Salesforce identifiers in play are:

- `Account.CustomerID__c`: the account's Customer ID, which `salesforceCustomerId` holds;
- the Opportunity record ID: `salesforceOpportunityId`, taken from the list's "Opportunity ID" link;
- the `C-OPP-` opportunity number: `opportunityNumber`.

The intake flow creates the Opportunity ("<name> - VMware LLC", stage Discovery, close date = booking + 14 days) with one product line at the entitlement amount (data model 12.1). VSA stage, gate dates, entitlement term and expiry live in the tracker, imported from the SharePoint list, not in Salesforce.

| Item | Design |
|---|---|
| Objects | Account (main + VSA) and Opportunity (stage, amount, close date, owner, account, opportunity number). Any VSA custom fields are to be named by the Salesforce admin (8.9). |
| File mode (now) | Upload Salesforce report exports (CSV) with fixed column mappings stored in config. Accounts and Opportunities as separate files. |
| Live mode (later, IT) | Salesforce REST/Bulk API through a **read-only** integration user and a connected app (`PIPELINE_SOURCE=salesforce` is already reserved). Incremental by `SystemModstamp`. |
| Matching | Customer IDs → `customerAccounts.externalId`. Unknown main account IDs create `provisional` customers **only in the preview**. A steward accepts them. |
| Output | `sfOpportunities` table linked to the customer (and optionally the engagement). This feeds pipeline rollups. |

### 2.4 Salesforce write-back (separate, later, gated harder)

Write is a **different connector** (`SALESFORCE_SINK`), with a **different IT approval**, a **different integration user** and its own kill switch.

- **Narrow allowlist:** a config file lists the exact `(object, field)` pairs that may be written. No custom fields exist for this yet; names such as `Opportunity.VSA_Stage__c` are placeholders until the Salesforce admin creates and names them (8.9). Anything else is rejected at compile time (typed) and at run time.
- **Idempotent:** every push carries `idempotencyKey = hash(object, recordId, field, newValue, sourceEventId)`. A repeat is a no-op that's still logged.
- **Compare-before-write:** read the current value first. If it isn't the value we last saw (someone edited it in Salesforce), **don't overwrite**. Raise a conflict instead.
- **Outbox pattern:** app transactions write to `sfWriteOutbox`. A worker drains it. Modes: `off` → `dry_run` (computes and logs the push, sends nothing) → `live`.
- **Audit:** `sfWriteLog` (`outboxId`, `object`, `recordId`, `field`, `oldValue`, `newValue`, `actorUserId`, `sourceEventId`, `mode`, `result`, `sfResponse`, `at`). It's append-only and visible on the customer record.
- **Rate and blast-radius limits:** a per-run cap (for example, 50 records), a per-day cap, and an automatic pause on an error rate above a threshold.
- **Two-person rule:** to enable `live`, one person (admin) sets the config and a second person (IT-designated approver) records the approval row.

### 2.5 Broadcom forecasting import (read-only)

| Item | Design |
|---|---|
| File mode (now) | Upload the Broadcom forecast export (XLSX/CSV) through `FORECAST_SOURCE=file`. The column mapping is versioned in config because Broadcom changes formats. A Broadcom sample file is still needed. |
| API mode (later, IT plus Broadcom) | Same interface. Only the `acquire()` implementation changes. |
| Matching | By Broadcom customer/site ID (stored as a `customerAccounts` row with `system = 'broadcom'`) once it's known, otherwise by alias. Rows that don't match go to a steward queue, never to a guessed customer. |
| Storage | `broadcomForecastSnapshots` (one per import) plus rows keyed to the customer. Snapshots are kept so the app can show forecast drift over time. |

### 2.6 SharePoint: list retirement and file seam

**Files/folders, grounded:** `server/fileSource.ts` has two names.

- `references` (default, built) lists the record's `clientFolderUrl` plus the source checklist `reference` values. It returns `https:` links only, never file bytes, and makes no calls.
- `sharepoint` (reserved, not built) would be a read-only Microsoft Graph listing of the client folder (`shares/{encoded-url}/driveItem` children, `Sites.Selected` or `Files.Read.All`, app-only).

The record Files tab (`tracker.files`) uses it. Picking up FCP drop folders isn't part of the seam; it would be a new, separately approved use.

**What the list is, grounded:**
- **Columns:** 46 in the exported view, every one mapped or deliberately dropped (data model 10.1). The built-in `ID` column is added to the export so `sharepointItemId` can be the primary match key.
- **Flows:** one Power Automate flow, `ServiceEngagementFlow`, triggered by the Broadcom Services Engagement Participation Request form (data model 12.1). It does three things:
  - looks up the Salesforce account;
  - creates the client folder and moves RVTools files into it;
  - creates the Opportunity and the list item, then sends four emails: to the rep and manager, the DC architect, the SDDC team (the SER hand-off) and the Broadcom account director (risk-assessment terms).
- **Flow problems:** data model 12.2 lists nine. The worst is that RVTools file selection takes the whole upload folder, so one customer's files can be moved into another customer's folder.

**List retirement path (one-way, staged):**

| Stage | State | Exit criteria |
|---|---|---|
| L0 (**built**) | The list is the system of record. The tracker imports a daily CSV export of the list (`PIPELINE_SOURCE=csv`, `pipelineImport.preview` / `commit`). | Met in design: all 46 columns map or are explicitly dropped. Remaining: every list row resolves to an engagement/customer or sits in the review queue. |
| L1 | **Parallel run.** The team updates the tracker. The daily import's reconciliation report already lists conflicts (changed on both sides) and rows "not in today's export". L1 adds a saved history of those reports. | 2 consecutive weeks with zero unexplained diffs. |
| L2 | **Tracker is the system of record.** The list becomes read-only (an IT/site-owner change). The flow's **list write** is replaced by the Intake Log (data model 12.5) and its **emails** by Section 3 rules. The account lookup, folder creation and Opportunity creation stay in Power Automate: the app can't take them over without approved connectors (data model 12.3). | Every flow step is mapped to a tracker rule, kept in Power Automate, or explicitly retired. |
| L3 | **Archive.** The list is exported and stored. A link from the tracker opens the archived item for history. | Site owner sign-off. |
| L4 (optional, IT) | **Live read** of the list during L1 through Graph, replacing manual CSV exports (`PIPELINE_SOURCE=sharepoint`, reserved). | IT approval of Graph app permissions. |

---

## 3. Automation and notification engine (build-ready now, send-gated)

### 3.1 Shape

```
domain write (db.ts mutation)           scheduler (every 15 min + nightly)
        │                                         │
        ▼                                         ▼
   events table  ◄──── emitted in same tx ──  time-based evaluators
        │                                   (stale stage, work plan >14d, expiry)
        ▼
   rules engine  ── matches rule, checks suppression/dedupe ──►  notifications (one row per recipient per channel)
                                                                    │
                                    ┌───────────────────────────────┼─────────────────────────────┐
                                    ▼                               ▼                             ▼
                              in-app inbox                 email sink (EMAIL_SINK)          digest builder
                              (always live)          off | draft_log | live             (daily summary)
```

- **Events** come from two places: (a) **domain events** written in the same database transaction as the change (an outbox pattern, so nothing is missed or double-fired), and (b) **time-based evaluators** that reuse the pure checks that already exist: `staleness()` and `STALE_AFTER_DAYS` (`shared/vsaDashboard.ts`), `stageWarnings()` and `WORK_PLAN_STALE_DAYS` (`shared/vsaStage.ts`), and `EXPIRY_BANDS`.
- **In-app notifications are always live.** They never leave the database, so they need no approval.
- **Email** goes through the email sink (Section 2 pattern):
  - `off`: nothing.
  - `draft_log` (**default**): renders the full email (to, cc, subject, body) and stores it in `notificationDeliveries` with `status = 'would_send'`. An admin page shows exactly what would have gone out. **No outbound mail.**
  - `live` (reserved, not built): sends through the IT-approved path (for example, Graph `sendMail` from a shared mailbox, or an SMTP relay). Needs the `connectorApprovals` row.

**Recipients, grounded:** the people on a record are its `engagementAssignments` rows. There's one per role per engagement (`sales_rep`, `account_manager`, `presales`, `architect`, `pm`, `sr_consultant`, `broadcom_ad`), with CDW and Broadcom emails, linked to a `users` row by email on sign-in. Rules address recipients by these roles. `ownerId` isn't used for routing: on imported records it's whoever ran the import.

### 3.2 Tables (proposed)

| Table | Purpose |
|---|---|
| `events` | `id`, `type`, `customerId`, `engagementId`, `payload` JSON, `actorUserId`, `occurredAt`, `processedAt`. |
| `notificationRules` | `id`, `key` (stable, for example `intake.stale.nudge`), `eventType` / `schedule`, `conditions` JSON, `recipients` (assignment-role expressions), `channels`, `templateKey`, `cooldown`, `maxRepeats`, `enabled`, `version`. Rules are stored as data but seeded and reviewed in code (a `rules.seed.ts` PR), so changes go through CI. |
| `notificationTemplates` | `key`, `version`, `subject`, `bodyMarkdown`, `variablesSchema`. Rendering is strict: a missing variable fails the render and logs the error, so a half-filled email can never go out. |
| `notifications` | One row per recipient per event per rule: `userId`, `ruleKey`, `eventId`, `title`, `body`, `link`, `readAt`, `snoozedUntil`, `dedupeKey`. |
| `notificationDeliveries` | One row per channel attempt: `notificationId`, `channel`, `mode` (draft_log/live), `renderedSubject`, `renderedBody`, `to`, `cc`, `status` (would_send / sent / failed / suppressed), `providerMessageId`, `at`. **This is the full notification audit trail.** |
| `notificationPreferences` | Per user: channel on/off per rule category, daily digest vs immediate. Mandatory rules (for example, compliance gates) can't be turned off. |

### 3.3 Initial rules

**Grounded:** there's no "intake submitted" field.

- A record is created from the intake form, so in the tracker every record has already been submitted.
- `intakeSubmissionId` is the form response ID from the intake import, a dedup key. That import isn't built yet, so nothing writes it.
- The `intake` stage's exit criterion is `serSubmittedOn` (`exitGaps()`): the SER the SDDC team files with Broadcom by hand.

So R1 watches records stuck in `intake` without an SER. Whether that's the nudge the team means is decision 8.4.

Stage enum (`shared/vsaStage.ts`): main line `intake`, `broadcom_request`, `discovery`, `fcp_draft`, `broadcom_approval` (Corporate/Strategic only), `customer_approval`, `ra_staffing`, `kickoff`, `in_delivery`, `complete`. Exits: `refused`, `paused`, `lost`. The **one hard gate** is `poReceivedOn`: `kickoff` and `in_delivery` can't be entered without it. Every other gate is a soft warning, and backward moves, skips and reopenings need a note. There are no SLA deadlines. "Late" means a stage held past `STALE_AFTER_DAYS` (intake 7, broadcom_request 14, discovery 21, fcp_draft 21, broadcom_approval 14, customer_approval 21, ra_staffing 14, kickoff 14, paused 60; none for in_delivery), or a work plan sent more than 14 days ago and not accepted.

| # | Rule key | Trigger | Recipients | Cadence / suppression |
|---|---|---|---|---|
| **R1** | `intake.ser_not_submitted.nudge` | **First concrete rule.** `stage = 'intake'` and `serSubmittedOn` is null, N business days after `stageEnteredOn` (config, default 3). | `sales_rep` and `presales` assignments. Internal-only by default. | Day 3, Day 7, then escalate on Day 10 (target is decision 8.4). Stops the moment `serSubmittedOn` is set or the stage changes. `maxRepeats` = 3. |
| R2 | `workplan.unaccepted.14d` | Corporate/Strategic (`requiresWorkPlan()`), `workPlanSentOn` set, `workPlanAcceptedOn` null, more than `WORK_PLAN_STALE_DAYS` (14) days. The same condition `stageWarnings()` already shows. | `pm`, `account_manager`. | Once at 14 days, again at 21 days. Digest after that. |
| R3 | `stage.changed` | A `stageEvents` row is written. | Everyone assigned to the engagement, plus customer watchers once watchers exist. | Immediate in-app. Email only for configured transitions. |
| R4 | `stage.stale` | `staleness()` reports `stale` (the `STALE_AFTER_DAYS` thresholds above). Also fires on a delivery stage without `poReceivedOn`. | The assignment roles for the stage, plus a segment lead. | Once per stale spell, plus a daily digest while it's still open. |
| R5 | `entitlement.expiry.approaching` | `deliveryWindowEnd` crosses 90 / 60 / 30 days, the same bands as `EXPIRY_BANDS`. | `account_manager`, `pm`. | One per threshold. |
| R6 | `data.customer_unresolved` | Engagement without `customerId` (during the migration). | Data stewards. | Daily digest. |
| R7 | `sf.write.conflict` (later) | Write-back conflict from 2.4. | Actor, data stewards. | Immediate. |

**Replacing Power Automate, grounded:** there's one flow. Of its steps, only the four intake emails are candidates for Section 3 rules (account lookup, folders and Opportunity creation stay in the flow, per 2.6). Each email gets a row in a mapping table (flow step → rule key → status: `shadow` / `replaced` / `retired`). A rule runs in **shadow** (`draft_log`) next to its flow step until its `would_send` log matches what the flow actually sent for 2 weeks. Then that email is turned off in the flow and the rule goes live. The flow's run history isn't available today (data model 12), so the comparison needs the flow owner to export it.

---

## 4. Daily-driver UX

### 4.1 "My work" home (default landing page)

**Grounded:** part of this exists.
- The home page (`/`, `client/src/pages/Overview.tsx`) is the dashboard.
- `/queue` (`client/src/pages/Queue.tsx`) has role queues chosen from the user's `vsaRole` (`sales`, `architect`, `presales`, `pm`, `leadership`).
- `tracker.list` takes a `mine` filter that matches the user's assignments.

My work extends these rather than adding a parallel page.

Three panes, driven by the user's assignment roles on each record:

1. **Needs me now:** open notifications that need action, approvals assigned to me, stale or gated records I'm assigned to, and R1/R2 nudges. Sorted by severity, then age.
2. **My records:** customers and engagements where I hold an assignment, grouped by role, with stage, next gate and days in stage.
3. **Overdue / due soon:** gates and expiries in the next 14 days, plus anything overdue.

The `leadership` role view acts as the team toggle ("my team's work").

### 4.2 Notification inbox

A bell icon with a count. Filters for unread, mentions, approvals and breaches. Actions: mark read, snooze (1 day, 1 week, until a date), open record. An optional digest email setting (governed by `EMAIL_SINK`).

### 4.3 Saved and shared views

**Grounded:** `savedReports` already stores named report definitions (`config` JSON, workspace-visible, editable by owner or admin) for the Reports screen. Saved views extend it: either add `entity`, `layout` (list/board), `visibility` (private / workspace) and `pinned` to `savedReports`, or add a sibling `savedViews` table with the same visibility rules in `server/visibility.ts`. The URL encodes the view, so a pasted link shows the same view. Seeded shared views: "Stuck in intake", "Work plans >14d", "Expiring in 90 days", "Unresolved customers".

### 4.4 Fast global search

- One search box (`Ctrl+K`) across customers (canonical name, aliases, SF IDs), engagements (customer name, opportunity number, SER number), opportunities and people.
- **Grounded (MySQL):** there's no `pg_trgm` or `tsvector`. At this volume (a few thousand searchable strings), search runs as:
  - exact and prefix matches on indexed `varchar` columns (`opportunityNumber`, `serNumber`, `salesforceCustomerId`, `normalizedName`, `normalizedAlias`);
  - plus app-side similarity over the in-memory name list for typos.
  - A MySQL `FULLTEXT` index on `customerAliases.alias` and `customers.canonicalName` is the next step only if that misses the target in 4.7. InnoDB `FULLTEXT` ignores words shorter than `innodb_ft_min_token_size` (3 by default), which matters for short customer names.
  - No external search service.
- A search by a merged customer's old name or old ID resolves to the winner, with a "merged into" note.

### 4.5 Bulk actions

Multi-select on any list or view: reassign an assignment, change stage (gate checks and note rules still apply per row), add watcher, snooze, export CSV, and (stewards only) "propose merge". Each bulk action runs as one batch with a `batchId` in the audit log, so it can be reviewed or reversed as a unit. Server-enforced limit: 200 rows per action, which already exceeds today's whole board.

### 4.6 Visible audit trail on every record

An **Activity** tab on every customer and engagement, merging these sources in time order:
- stage history (`stageEvents`, append-only, exists);
- FCP versions (`fcpVersions`, exists);
- field changes (`auditLog`, new);
- notifications sent or drafted (`notificationDeliveries`);
- connector ingests and pushes (`ingestBatches`, `sfWriteLog`);
- merges and moves (`customerMerges`).

It shows who, what, old → new and when, and links to the batch for bulk changes.

### 4.7 Performance targets (at real volume)

**Grounded:** the base is small. Today:
- 125 engagements, 126 stage events, 373 assignments and 472 source items;
- about 65 distinct account IDs, so probably fewer than 125 customers once deduplicated;
- the SharePoint list export had 118 rows.

`tracker.list` already returns the whole workspace to the browser, which filters and sorts locally, and that's the right design at this size.

**Planning volume:** today plus five years of modest growth, with headroom:

| Entity | Today | Plan for |
|---|---|---|
| Engagements | 125 | 1,000 |
| Customers | ~100 (after dedup) | 600 |
| Stage events | 126 | 10,000 |
| Salesforce opportunities (once imported, all on main and VSA accounts) | 0 | 20,000 |
| Audit rows | 0 | 250,000 |
| Named users / concurrent | 1 (local) | 30 / 10 (decision 8.10) |

| Surface | Target (p95, server + render) |
|---|---|
| My work home | < 800 ms |
| List view, any saved filter | < 500 ms server for the whole workspace (≤ 1,000 rows), filtered and sorted in the browser. No server-side pagination or row virtualization needed at this size. |
| Board view, all open records | < 1 s. |
| Global search, type-ahead | < 200 ms per keystroke (debounced). |
| Record page, including the Activity tab's first page | < 1 s. Activity is cursor-paginated (a busy record may have hundreds of audit rows). |
| Bulk action, 200 rows | < 5 s, with progress shown. |

**How it's checked:** CI has no MySQL service today, so there's no CI load test. Instead:
1. A fake-data fixture generator (Acme Health, Meridian Health, Riverbend Health, Northwind Mfg and numbered variants) fills a scratch database to the "plan for" column.
2. A scripted check, run by hand before each phase ships, times the list, search and record-page queries and runs `EXPLAIN` on them to confirm they use an index.
3. Search and dedup scoring are pure functions with unit tests over a 1,000-name fixture, so their cost is covered in CI.

Revisit if the counts pass half of the "plan for" column.

---

## 5. Governance and deployment

### 5.1 Identity / SSO

**Grounded:** SSO stays **gateway-based**.
- `FCP_AUTH_MODE=trusted-proxy` turns it on. With it unset, no request is authenticated.
- `server/trustedSso.ts` reads three headers, each renamable through `FCP_SSO_ID_HEADER`, `FCP_SSO_EMAIL_HEADER` and `FCP_SSO_NAME_HEADER`: `x-auth-request-user` (required, immutable subject), `x-auth-request-email` and `x-auth-request-name`.
- It derives `openId = corp:` plus the first 48 hex characters of `sha256(FCP_OIDC_ISSUER + ":" + subject)`, and upserts the `users` row on each request.
- **Trust model** (`docs/DEPLOYMENT.md`, `docs/SECURITY-REVIEW.md`): the gateway is the only network path to the container, strips client-supplied identity headers, and injects validated ones.
- Every user joins workspace 1.

**IT needs to provide:** keep the current gateway configuration, plus Entra ID group claims (or a group-membership feed) if roles are to be driven by AD groups instead of being managed in the app.

### 5.2 Roles and permissions

**Grounded:** the current model is more than light. This section **extends** it rather than replacing it. Today there are four layers:

| Layer | Where | What it does |
|---|---|---|
| Permission flag | `users.role` (`user` / `admin`) | The only permission today. Admin can delete any record and edit any saved report. `adminProcedure` exists in `server/_core/trpc.ts` but no procedure uses it yet. |
| Visibility | `workspaceId` on users, engagements and saved reports; `server/visibility.ts` | Every record query composes `visibleEngagements(viewer)`. Everyone in the workspace sees and edits every record. Delete is owner-or-admin. `server/visibility.test.ts` enforces that `server/db.ts` uses it. |
| Record roles | `engagementAssignments` (one person per role per engagement: `sales_rep`, `account_manager`, `presales`, `architect`, `pm`, `sr_consultant`, `broadcom_ad`) | Who works the record. Linked to users by email on sign-in. Drives queues and role views, not permissions. |
| Default view | `users.vsaRole` (`sales`, `architect`, `presales`, `pm`, `leadership`) | A filter (`inRoleView()` in `shared/vsaViews.ts`), explicitly not a permission. |

**Extension:** add capability roles alongside `users.role`, and keep record roles where they are:

| Capability | Can | Builds on |
|---|---|---|
| (every workspace member) | Read and edit records in the workspace, run the import, comment. | Today's behavior. Unchanged unless decision 8.6 chooses edit scoping. |
| `lead` | Bulk actions and shared views across their segment/region. | `vsaRole = leadership` today is a view only. |
| `data_steward` | Merge, unmerge, reassign customers, resolve ingest queues, edit canonical names and aliases. | New. |
| `automation_admin` | Edit rules and templates (still through the PR seed for production) and view draft emails. | New. |
| `admin` | Users, roles, connector modes (except live, which also needs an approval row), delete any record. | `users.role = admin`. |
| `it_approver` | Record `connectorApprovals`. Has no data-edit rights. This is the second key in the two-person rule. | New. |

- **Storage:** a `userCapabilities` table (`userId`, `capability`, `grantedByUserId`, `grantedAt`), so one user can hold several. `users.role` stays as is. `admin` remains the existing flag, not a second copy.
- **Implementation:** `server/visibility.ts` stays the one place that decides access. It gains `can(viewer, action, resource)`, and `Viewer` gains the capability list. Procedures that need a capability use a `capabilityProcedure(...)` wrapper built like `adminProcedure`. The UI hides what the policy denies, but **the server is the only enforcement point**.
- **Scoping:** `segment` and `region` exist on every engagement, so scoping is possible. The default stays as today, workspace-wide read and edit, with only the capabilities above scoped (decision 8.6).

### 5.3 Full audit logging

**Grounded:** history exists only in three places:
- `stageEvents` (append-only by convention: `server/db.ts` exposes no update or delete for it);
- `fcpVersions` (document snapshots);
- `updatedByUserId` / `updatedAt` / `rowVersion` on engagements (last editor only).

There's no general audit or field-history table.

`auditLog` (append-only, no update or delete grants at the database role level when IT can provide that):
- **Who and when:** `id`, `at`, `actorUserId`, `actorType` (user / system / connector / rule).
- **What:** `action`, `entity`, `entityId`, `customerId` (denormalized for the customer-level trail), `field`, `oldValue`, `newValue`.
- **Context:** `batchId`, `requestId`, `userAgent` (from the gateway).

Field values are stored as `text`. Nothing in this table needs a unique index, so `text` is fine here.

Every write in `server/db.ts` already takes a `Viewer`, so the audit write goes there, in the same transaction as the change, and **no mutation can skip it**. A CI test lists the `db.ts` write functions and checks that each one writes audit rows. Stage changes keep going to `stageEvents`; the Activity tab reads both rather than copying stage changes into `auditLog`. Retention defaults to 7 years, or IT/records policy if different.

### 5.4 Data quality and dedup tooling

From Section 1: the merge-candidates queue, merge/unmerge, engagement reassignment, unresolved-customer queue, ingest rejection queues, and a **data-quality dashboard**. The dashboard extends the per-record flags in `dataQualityFlags()` (`shared/vsaDashboard.ts`: no segment, no or placeholder opportunity number, no VSA amount, no expiry, no architect) with customer-level ones: customers without a main SF ID, engagements without a customer, open merge candidates, stale imports, and rules failing to render.

### 5.5 What each capability needs from IT

**Grounded:** `docs/VSA-TRACKER-IT-INTEGRATION.md` lists four asks (SSO confirmation, SharePoint Graph `Sites.Selected`, Salesforce read-only connected app, an outbound allowlist) and four open questions (hosting, database location and retention, connector scopes, data-handling review). No IT tickets exist yet. The rows below map onto those asks; new asks are marked **(new)** and should be added to that brief when this document is approved.

| Capability | Needs from IT | IT brief | Can build before approval? |
|---|---|---|---|
| Customer spine, merge, audit, roles, My work, views, search, in-app notifications | Nothing new (existing hosting, DB and gateway). | Hosting and database open questions | **Yes.** |
| Role mapping from AD groups | Group claims through the gateway, or a group feed. | **(new)** | Yes (in-app role assignment until then). |
| Salesforce read (live) | Connected app, read-only integration user, field-level access, network egress to Salesforce, secret storage. | Salesforce ask, Network ask | Seam plus CSV mode, yes. Live, no. |
| Salesforce write-back | **Separate** approval: a write-scoped integration user limited to the allowlisted fields, a change-management record, and a named IT approver. | **(new)** | Outbox plus `dry_run`, yes. Live, no. |
| Broadcom forecast API | Broadcom API credentials (via the partner program), egress, secret storage. | **(new)** | File import, yes. API, no. |
| Outbound email send | Approved send path (a shared mailbox with Graph `Mail.Send` scoped by an application access policy, or an SMTP relay), sender address, and allowed recipient domains (internal first). | **(new)** | `draft_log`, yes. Sending, no. |
| SharePoint list live read / retirement | Graph `Sites.Selected` on the one site, site-owner agreement to make the list read-only, and the flow owner's agreement to change `ServiceEngagementFlow` (data model 12.5). | SharePoint ask (extends its scope from the client folders to the list) | CSV import plus parallel-run diff, yes (built). |
| DB-level append-only audit | A separate DB role without UPDATE/DELETE on `auditLog`. | Database open question | App-level enforcement now. |

### 5.6 Deployment and change control (unchanged principles, made explicit)

- PRs into protected `main`, merged with a merge commit once CI is green.
  - **CI today** (`.github/workflows/ci.yml`): `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`.
  - **Added by this roadmap:** FCP golden tests (part of `pnpm test`, Phase 1), and a migration check that applies `drizzle/` to an empty MySQL service container (Phase 1; CI has no database today). The performance check stays manual (4.7).
- **Config and docs change together:** any PR that adds or changes a `*_SOURCE` / `*_SINK` setting, a feature flag, or a rule must update `docs/CONFIGURATION.md` (and `docs/SECURITY-REVIEW.md` when security-relevant) in the same PR. A new CI test checks that every `process.env.*` name read in `server/` appears in `docs/CONFIGURATION.md`.
- Every schema change is additive and made with `drizzle-kit generate` plus `pnpm db:migrate`, never `pnpm db:push`. Destructive steps (drop a column, add `NOT NULL`) are their own PRs with their own review.
- Feature flags for every user-visible phase, as environment variables (none exist yet; see 1.7). Default off in production until the phase's acceptance criteria are met.

---

## 6. Phased roadmap

**Legend:** 🟢 **Build now:** no outside approval needed (code dependencies only). 🟠 **Waits on IT:** can be built to the seam / dry-run, but going live needs IT approval.

There's always a working app: each phase ships behind a flag on top of the previous one, and the current tracker and FCP engine keep working the whole time.

### Phase 0: Ground truth and review gate 🟢
- **Goal:** turn this draft into a verified document, and approve the customer model and DDL.
- **Depends on:** code access (done: Section 9). Review by Andrew and the team.
- **Ships standalone:** yes (docs only).
- **Acceptance:** zero VERIFY markers left (met). Final DDL attached. Dry-run backfill report on a copy of the real data reviewed locally (it never leaves the machine). Schema review gate signed off. Decisions in Section 8 taken.

### Phase 1: Customer spine 🟢
- **Goal:** `customers` above `engagements`. Every engagement linked, provisional where needed.
- **Depends on:** Phase 0 (code and review).
- **Ships standalone:** yes, behind `FEATURE_CUSTOMER_SPINE`.
- **Scope:** M1 to M6 from 1.7. `visibleCustomers()` in `server/visibility.ts`. Customer page with rollups (1.3), counting entitlement groups once. Steward CSV round-trip for main SF IDs. FCP golden tests. CI migration check.
- **Acceptance:** 100% of engagements have a `customerId` or sit in the review queue with a reason. The backfill is idempotent (a second run changes 0 rows). FCP golden tests are byte-identical. Existing engagement screens are unchanged with the flag off. Customer rollups match a hand-checked sample of 10 customers.

### Phase 2: Dedup, merge and audit foundation 🟢
- **Goal:** clean records safely, and log every change.
- **Depends on:** Phase 1 (code).
- **Ships standalone:** yes.
- **Scope:** `auditLog` written from `server/db.ts` (5.3). Candidate scoring, merge, unmerge, engagement reassignment. Data-quality dashboard. Merged-ID redirect. The same-customer check for `entitlementGroupId` groups (1.5).
- **Acceptance:** a merge followed by an unmerge restores the exact pre-merge state on a test fixture. Every `db.ts` write writes audit rows (CI test lists the functions and checks each one). No merge possible without the steward capability. The flagged backfill queue is worked to a zero count.

### Phase 3: Roles and permissions 🟢 (AD-group mapping 🟠)
- **Goal:** extend today's model with the capabilities in 5.2.
- **Depends on:** Phase 2 (audit, code). AD-group claims from IT are optional (in-app role assignment works until then).
- **Ships standalone:** yes.
- **Acceptance:** a policy test matrix (capability × action) passes. Every capability-gated procedure goes through `can()` in `server/visibility.ts`. No regression for current users: `users.role`, workspace visibility, delete rules and assignment-driven queues behave exactly as before.

### Phase 4: Automation engine in draft/log mode 🟢
- **Goal:** compute and record every notification. In-app notifications live, email `draft_log` only.
- **Depends on:** Phases 1 to 2 (events need customer and audit context). Code only.
- **Ships standalone:** yes. No outbound mail by construction (the egress guard plus `EMAIL_SINK=draft_log`, and `live` isn't built).
- **Scope:** events outbox, scheduler, rules, templates, deliveries audit. **R1 (stuck in intake without an SER) ships first**, then R2 to R6. Admin "would-send" viewer. Mapping table for the flow's four emails, in `shadow`.
- **Acceptance:** R1 produces correct would-send rows for a seeded set of fake engagements (it fires on day 3, 7 and 10 and stops when `serSubmittedOn` is set). Zero outbound connections in an egress-log test. Each shadowed email is compared against the flow's run history for 2 weeks with no unexplained diffs.

### Phase 5: Daily-driver UX 🟢
- **Goal:** the tracker becomes the all-day app.
- **Depends on:** Phases 1 to 4 (code).
- **Ships standalone:** yes. Each piece can ship separately.
- **Scope:** My work (extending Overview and Queue), notification inbox, saved/shared views (extending `savedReports`), global search, bulk actions, Activity tab on every record.
- **Acceptance:** the performance targets in 4.7 are met on the "plan for" fixture. Activity tab shows every source in 4.6. Bulk actions are reversible by batch. 80% of the team uses My work as their landing page within 2 weeks (usage metric).

### Phase 6: File-mode connectors 🟢
- **Goal:** bring in Salesforce, Broadcom and SharePoint-list data **by file**, through the seams, with no outbound calls.
- **Depends on:** Phases 1 to 2 (code).
- **Ships standalone:** yes.
- **Scope:**
  - New seams in the existing style (2.2), with the approval-checked startup and the egress guard.
  - SF CSV import (accounts, opportunities).
  - Broadcom forecast file import (needs a sample file).
  - Persisted daily-import reports for the SharePoint **parallel run (L1)**; the L0 import is already built.
  - Pipeline rollups by customer.
- **Acceptance:** each import is idempotent, previewed before it writes, and reversible by batch. Unmatched rows go to queues and are never guessed. Startup fails if any live implementation is selected without an approval row (test). The list parallel-run report is kept daily.

### Phase 7: Salesforce live read 🟠 *Waits on IT*
- **Goal:** replace SF CSV uploads with incremental API reads.
- **Depends on:** **IT approval** (connected app, read-only user, egress, secrets) plus Phase 6 (code).
- **Ships standalone:** the code ships dark in Phase 6. This phase is a **config flip** (`PIPELINE_SOURCE=salesforce` or the SF account/opportunity source) plus the approval row.
- **Acceptance:** live and file modes produce identical previews for the same snapshot. Incremental sync is under 15 minutes. Health check is on the admin page. Rollback is setting the source back to its file implementation.

### Phase 8: Outbound email send 🟠 *Waits on IT*
- **Goal:** the automation engine sends real email. The flow's emails retire one at a time.
- **Depends on:** **IT approval** of the send path plus Phase 4 (code).
- **Ships standalone:** config flip per rule (`live` can be enabled rule by rule, internal recipients first).
- **Acceptance:** R1 live for 2 weeks with sent = would-send. Each flow email moves from shadow to replaced to retired with the flow owner's sign-off. One-switch kill (`EMAIL_SINK=draft_log`) is tested.

### Phase 9: SharePoint list retirement 🟠 *Waits on IT / site owner*
- **Goal:** the tracker is the only system of record (L2 to L3).
- **Depends on:**
  - the Phase 6 parallel run passing;
  - Phase 8 for the flow's emails;
  - the flow owner replacing the list write with the Intake Log (data model 12.5);
  - **site-owner/IT action** (list read-only, archive).

  The optional Graph live read (L4) needs IT approval.
- **Acceptance:** L1 exit criteria met (2 weeks, zero unexplained diffs). List is read-only. Flow steps mapped, kept or retired. Archive linked from records.

### Phase 10: Broadcom forecast API 🟠 *Waits on IT and Broadcom*
- **Goal:** automated forecast pulls.
- **Depends on:** Broadcom API access, **IT approval** of egress and secrets, and Phase 6 (code).
- **Acceptance:** same as Phase 7. Live and file modes match on the same period.

### Phase 11: Salesforce write-back 🟠 *Waits on IT (separate, stricter approval)*
- **Goal:** push a small allowlisted set of VSA fields back to Salesforce.
- **Depends on:**
  - Phase 7 running cleanly for at least 30 days;
  - the Salesforce admin creating and naming the target fields;
  - **a separate IT approval** (write-scoped user, change record, named approver);
  - Phase 2 audit.
- **Ships standalone:** outbox plus `dry_run` can be built any time after Phase 7. Live needs the two-person enable.
- **Acceptance:**
  - 2 weeks of `dry_run` reviewed with zero unexpected pushes.
  - Idempotency test: the same event replayed 10 times gives 1 write.
  - Conflict test: a changed SF value causes no overwrite.
  - Every push is in `sfWriteLog` and visible on the customer.
  - Kill switch tested.

### Summary

| Phase | Name | Approval | Can start now? |
|---|---|---|---|
| 0 | Ground truth + review gate | Internal review | 🟢 Yes (grounding done; review pending) |
| 1 | Customer spine | Schema review gate | 🟢 Yes (after Phase 0) |
| 2 | Dedup / merge / audit | none | 🟢 Yes |
| 3 | Roles & permissions (extend) | none (AD groups optional 🟠) | 🟢 Yes |
| 4 | Automation engine, draft mode (R1 first) | none | 🟢 Yes |
| 5 | My work, inbox, views, search, bulk, activity | none | 🟢 Yes |
| 6 | File-mode connectors + list parallel run | none | 🟢 Yes |
| 7 | Salesforce live read | **IT** | 🟠 Seam ready, waits |
| 8 | Outbound email send | **IT** | 🟠 Draft ready, waits |
| 9 | SharePoint list retirement | **IT / site owner / flow owner** | 🟠 Parallel run ready, waits |
| 10 | Broadcom forecast API | **IT + Broadcom** | 🟠 File mode ready, waits |
| 11 | Salesforce write-back | **IT (separate, stricter)** | 🟠 Dry run ready, waits |

Phases 3 to 6 can run in parallel once Phase 2 lands. Phase 4 needs only the event context from Phases 1 and 2.

---

## 7. Guardrails (apply to every phase)

1. **Additive only.** No column drops, renames or type changes without a separate review. Old columns stay readable until a reviewed deprecation PR.
2. **Never break the FCP engine or the existing tracker.** FCP golden tests and the existing screens run in CI on every PR. Every new surface sits behind a flag.
3. **PR workflow into protected `main`, CI green.** No direct pushes. No skipped checks.
4. **Config and docs change together** (CI-enforced, 5.6).
5. **Standalone until approved.** The database is the only outbound connection. The egress guard plus the `connectorApprovals` startup check make that mechanical, on top of `server/integrationSeams.test.ts`.
6. **Schema review gate** before any migration (Phase 0 → Phase 1), the same as the earlier work.
7. **Every record query goes through `server/visibility.ts`**, for customers as for engagements.
8. **No real customer data in the repo.** Fixtures and tests use fake companies. Backfill and reconciliation reports with real names stay on the local machine.

---

## 8. Decisions needed at review

1. Keep the denormalized `customers.mainSfAccountId` alongside `customerAccounts`? (Recommended: yes.)
2. Customer status lifecycle: is `provisional` acceptable in the UI for customers without a confirmed main SF ID?
3. Dedup thresholds (1.6) and who holds the `data_steward` capability at launch.
4. R1 meaning and timing. The code has no "intake submitted" field, so R1 is drafted as "in `intake` without `serSubmittedOn`". Confirm that's the nudge wanted, and set the timing (3 / 7 / 10 business days) and escalation target. Escalating to the rep's manager needs a manager field, which doesn't exist (the flow looks managers up in the directory).
5. Customer-level `segment` and `region`: store them on `customers` as defaults, or always derive them from the engagements?
6. Whether segment/region scoping on reads or edits is wanted, or capability-scoping only (today everyone in the workspace reads and edits everything).
7. Customer-level rollup definitions (1.3), especially "customer stage = furthest-behind active engagement".
8. Alternative plans: keep `entitlementGroupId` as the peer-group key and drop the `alternativeOfEngagementId` proposal (1.5)? (Recommended: yes.)
9. Salesforce fields: are there VSA custom fields on Account or Opportunity today, or would write-back need new ones? Only the Salesforce admin can answer; it gates Phase 11, not Phase 1.
10. Planning volume for users: how many named users and concurrent users should 4.7 assume? The repo can't tell (1 local user). Drafted as 30 named, 10 concurrent.
11. Production database: which MySQL version and flavor will IT provide? Generated columns need MySQL 5.7+, and the design assumes 8.0+. This is on the IT brief's open questions already.
12. Order of Phases 3 to 6 if capacity is limited. (Recommended: 4 (R1) → 5 → 6 → 3.)

---

## 9. Grounding register (resolved 2026-10-20)

Every item from the first draft's VERIFY register, with what the code says.

| # | Item | Finding | Source |
|---|---|---|---|
| V1 | `engagements` PK; `salesforceCustomerId` | PK `int` autoincrement. `salesforceCustomerId` is `varchar(32)`, nullable, **indexed** (`engagements_sf_customer_idx`), **not unique**: one account has many opportunities. It holds `Account.CustomerID__c`. | `drizzle/schema.ts`; data model 3.1, 11.12 |
| V2 | `entitlementGroupId` | Exists (migration 0002): `int`, nullable, indexed. A peer group of alternative plans for one entitlement. Readers: `shared/vsaViews.ts`, `shared/vsaReports.ts`, `RecordDrawer.tsx`. No writers. 0 rows set. Not read by `shared/fcp.ts` or `server/routers.ts`. **Not retired** (1.5). | `drizzle/schema.ts`, grep of `server/`, `shared/`, `client/src/` |
| V3 | Dialect and driver | MySQL, `drizzle-orm/mysql2`. No partial indexes (generated column used, 1.2). No `pg_trgm` (app-side similarity, 1.6; `FULLTEXT` optional, 4.4). Local server is current MySQL; production version is an IT question (8.11). | `server/db.ts`, `drizzle.config.ts` |
| V4 | Column conventions; users/audit tables | `createdAt` / `updatedAt` `timestamp` with `defaultNow()` and `onUpdateNow()`. Actors are `createdByUserId` / `updatedByUserId` `int` FK `users` `onDelete: set null`. Optimistic concurrency via `rowVersion`. Tables are camelCase. `users` exists (`openId`, `email`, `role`, `workspaceId`, `vsaRole`). History: `stageEvents` (append-only), `fcpVersions`. No general audit table. | `drizzle/schema.ts` |
| V5 | Name, segment, region, owner | `customerName` `varchar(240)` not null, default "Untitled customer". `segment` enum (`corporate`, `strategic`, `commercial`), `region` enum (`west`, `east`), `ownerId` `int` not null (attribution; no FK). All on `engagements`. | `drizzle/schema.ts`, `shared/vsaStage.ts`, `shared/vsaFields.ts` |
| V6 | FCP identity field | `data.fields.customerName` and `data.fields.accountId` (a short name, copied to `customerShortName`). No DB key. Retiring or changing any grouping column is safe for the FCP engine. | `shared/fcp.ts`, `server/db.ts` |
| V7 | `pipelineSource` interface and selection | `PIPELINE_SOURCE` env, default `csv`, parsed with a fail-loud check (`salesforce`, `sharepoint` reserved). `acquire({ csv })` → `PipelineBatch { source, rows: RawPipelineRow[], problems, intakeSource, rowNote }`. 2.2 now matches it. | `server/pipelineSource.ts` |
| V8 | `fileSource` interface and modes | `FILE_SOURCE` env, default `references` (client folder + source references, `https:` only, no calls). `sharepoint` reserved, not built. `getRecordFiles(record)` → `RecordFile[]` (links only). | `server/fileSource.ts` |
| V9 | Router framework and protection; roles | tRPC. All app procedures are `protectedProcedure` (signed-in user) except `auth.me`. `adminProcedure` is defined but unused. Access goes through `server/visibility.ts` (workspace). Roles: `users.role`, `vsaRole` (view only), `engagementAssignments` (record roles). 5.2 extends this. | `server/routers.ts`, `server/_core/trpc.ts`, `server/visibility.ts` |
| V10 | Gateway SSO header and trust | `FCP_AUTH_MODE=trusted-proxy`. Headers `x-auth-request-user` / `-email` / `-name` (configurable). `openId` hashed from `FCP_OIDC_ISSUER` and the subject. The gateway must be the only path and strip client headers. | `server/trustedSso.ts`, `docs/DEPLOYMENT.md`, `docs/SECURITY-REVIEW.md` |
| V11 | Intake status, stages, work plan, SLA/gates | No intake-submitted field. `intakeSubmissionId` is a dedup key for the unbuilt intake import; intake's exit criterion is `serSubmittedOn`. Stages and gates as in 3.3. `poReceivedOn` is the one hard gate (`kickoff`, `in_delivery`). Work plan: `workPlanSentOn` / `workPlanAcceptedOn`, Corporate/Strategic only, warn after 14 days. No SLA deadlines; `STALE_AFTER_DAYS` per stage. | `shared/vsaStage.ts`, `shared/vsaDashboard.ts`, `drizzle/schema.ts`, data model 3.1, 3.4 |
| V12 | VSA Salesforce fields | None named. The data model uses `Account.CustomerID__c`, the Opportunity record ID and the `C-OPP-` number only. VSA tracking data lives in the tracker. Write-back field names are decision 8.9. | data model 3.1, 12.1 |
| V13 | SharePoint columns, flows, IT asks | 46 list columns, all mapped (data model 10.1). One flow, `ServiceEngagementFlow`, with nine documented problems (12.2) and a restructure option (12.5). The IT brief has four asks and four open questions, and no ticket numbers. | data model 10, 12; IT integration brief |
| V14 | Repo conventions | `drizzle-kit generate` then `pnpm db:migrate` (backs up first); never `pnpm db:push`. CI: `pnpm check`, `pnpm test`. PRs into protected `main`, merge commit. No feature-flag mechanism exists; flags will be env vars documented in `docs/CONFIGURATION.md`. | `CLAUDE.md`, `.github/workflows/ci.yml`, `package.json` |
| V15 | Row counts | See section 0. 125 engagements; everything else in the hundreds. 4.7 is sized from this. | Local MySQL, `COUNT(*)` only |
| V16 | Contacts / email domains | No customer contacts. `engagementAssignments` holds CDW and Broadcom staff emails; the FCP's `primaryContact` is a name only. Dropped as a dedup signal. | `drizzle/schema.ts`, `shared/fcp.ts` |

*End of draft. Stop here for review. No code, schema or migration work starts until Phase 0 is signed off.*
