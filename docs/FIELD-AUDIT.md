# Field audit

Every field the tool captures or stores, where it is entered, where it is read, and whether to keep it. This is the input for Phase 6 (`docs/FCP-WORKSPACE.md`, which deletes the long "Full report"): **it recommends; nothing is removed by this document.** Written against `main` after PRs #81 to #83 (Delivery Handoff, Phase 5 intake, Review and issue layout).

## How this was made, and its limits

- The field list comes from the schemas, walked by script: `engagementDocumentV11Schema` (the document: `fields`, `fields.adoptionDetails`, `fields.estimateInputs`, `inventory`, `report`, and the generated timelines and readiness) and `trackerPatchSchema` (the tracker record). Rows of an array of objects (for example `report.openItems[]`) are one row, and the generated structures (`readiness`, the two timelines) are one row each.
- "Read by" comes from a text search of the files behind each reader, counting property accesses and string keys, with schema definitions, migrations' empty defaults and comments skipped. The readers are: **Summary and Standard** (`fcpSummaryRenderer`, `fcpReportParts`, `fcpTwoYear`, `timelineHtml`, `fcpStandardRenderer`), **Handoff** (`deliveryHandoffRenderer`, `deliveryBriefing`), **hours engine** (`hoursV2`, `hoursFit`, `effort`, `estateSize`, `rateCard`, `bsas`, `consumption`), **plan or report generator** (`fcp.ts`, `reportView`, `industryDiscovery`, `planSummary`, `planView`), **tracker (FCP record)** (`fcpRecord`, `fcpIssue`, `fcpChangeSummary`, `provenance`) and **Full report** (`condensedFcpRenderer`'s long-report code, `fcpRenderer`, `compatibilityHandoffRenderer`, `condensedFcpChecks`).
- A search by field name cannot see a reader that walks every key (the Handoff prints every estimating input without naming one), and it over-counts common names (`hours`, `label`, `customer`). Rows marked `~` share their last name with another field and were checked by hand; the rows I corrected by hand carry their reason in the last column. Treat "Nothing" as "check before removing", not as proof.
- "Entered" is the workspace section that edits the field, taken from the UI code, plus **Brief** (the Cowork brief import) and **RVTools**. "No editor" means no screen sets it: only the brief or code does.
- The rollback `Home` page (unrouted, deleted in Phase 6) is ignored as a reader and an editor.

## Summary of recommendations

| Recommend | Fields |
|---|---|
| **Remove with the Full report (Phase 6)** | `fields.exportPreferences.includeVcfReadiness`, `fields.exportPreferences.includeOperationalTimeline` (the long-report toggles, hidden in the Review rewrite), `report.headline` (entered in Narrative, printed only on the Full report's cover). |
| **Remove** | `fields.customerSegment` (deprecated: the segment lives on the tracker; read only by one migration and a legacy mismatch count), `report.discovery.coreCount` (read once, as a fallback behind `licensedCores`). |
| **Make derived** | `fields.primaryContact` (first customer contact), `fields.entitlementEnd` (calculated from the start unless confirmed, C-10), `fields.targetStart` (a second field for `plannedProjectStart`), `rationale` (regenerated on every build, never printed), `report.revision` (see below). |
| **Review** | `fields.accountId` (only feeds the tracker short name), `fields.adoptionCadence` (weekly plans), `fields.hoursModel` (v1 code path), `estimateInputs.outcomeRanking` and `estimateInputs.wantThisYear` (no editor), `report.sources` (printed only on the Full report), and the tracker columns `salesforceOpportunityId`, `broadcomPo` and `coreCount` (import or report only). |
| **Keep** | Everything else: the other estimating inputs, scope, funding, inventory aggregates, the narrative sections the Summary, Standard and Handoff print, and the tracker fields behind stage gates, dashboards and reports. |

## Things to decide before Phase 6

1. **The issue note is not what the Standard prints.** The Standard's document control line "Revision" prints `report.revision`, a field typed in Narrative. The revision note typed in the issue panel is stored on the version and shown in Issued versions, but is not given to the renderer, so a re-issue with a note and an empty `report.revision` prints "Working draft" in that cell (version 2 or later). Either pass the issue note to the renderer (then `report.revision` is derivable) or document that Narrative is the source. Verify before relying on this: it is read from `server/fcpIssue.ts`, `server/db.ts` and `server/fcpStandardRenderer.ts`.
2. **Planning considerations have no home after the Full report goes.** `readiness.items` (the inventory-informed planning considerations) and the advisory host findings reach only the Full report and the Estate section. The Delivery Handoff prints blockers and warnings but not these. Decide whether the Handoff should carry them before deleting the long report.
3. **Content only the Full report reads.** Besides `report.headline`: the Full report footer is the only place `report.sources` is cited, and the long report is the only reader of the compatibility-in-FCP and operational-timeline switches.
4. **Fields with no editor.** `adoptionDetails.excludedHosts`, `discovery.storageSecondary`, `discovery.vsphere8Strategy`, `discovery.newHostsPurchased.workload`, `report.customerEffort`, `estimateInputs.outcomeRanking` and `wantThisYear` are set only by the brief or code. The Contacts editor closed the same gap for `report.contacts` in Phase 5.
5. **Duplicated facts.** The customer name (document and tracker), the entitlement dates (`fields.entitlementStart` and `report.entitlement.termStart`, and the tracker's `termStart` and `termEnd`), the primary contact (`fields.primaryContact` and `report.contacts.customer`), and the sites, vCenters and host counts (`report.discovery.*` against RVTools `inventory.*`, kept as the fallback) each exist in two places. The fallbacks are deliberate; the others are candidates to derive.



## 1. The engagement document: engagement fields (`document.fields`)

| Field | Entered | Read by | Recommend | Why |
|---|---|---|---|---|
| `version` | Tracker drawer, Review | Everything | Keep | Document schema version; drives migration. |
| `planAuthority` | Plan (Apply playbook template) | hours engine, plan or report generator | Keep | Says whether the plan is generated or hand-built; Rebuild respects it. |
| `fields.customerName`~ | Engagement and brief | Summary, Standard, Handoff, hours engine, plan or report generator, tracker (FCP record), Full report | Keep | Also stored on the tracker record (`engagements.customerName`) and kept in step on rename. The tracker is the natural source; this copy could be derived from it. |
| `fields.accountId` | Engagement and brief | Tracker short name (`db.ts` customerShortName); brief prompt | Review | Not printed by Summary, Standard or Handoff. Its only job is the tracker short name, which has its own column. Candidate to derive or drop. |
| `fields.location` | Engagement and brief | Summary (header line); brief prompt | Keep | Printed in the Summary header only. |
| `fields.primaryContact` | Engagement and brief | Standard (who is involved), Handoff (people) | Make derived | Overlaps `report.contacts.customer`. Derive it as the first customer contact once the Contacts editor is in use. |
| `fields.entitlementAmount` | Funding and brief | Summary, Standard, hours engine, plan or report generator, tracker (FCP record), Full report | Keep |  |
| `fields.entitlementStart` | Funding and brief | Summary, Standard, Handoff, hours engine, plan or report generator, tracker (FCP record), Full report | Keep |  |
| `fields.entitlementEnd` | Funding | hours engine, plan or report generator, tracker (FCP record), Full report | Make derived | `calculateEntitlementEndDate(entitlementStart)` already gives it; the stored value is only a fallback and the "assumed" flag. Keep as the confirmed value (C-10), derive otherwise. |
| `fields.plannedProjectStart` | Engagement (schedule) and brief | Summary, Standard, hours engine, plan or report generator, tracker (FCP record), Full report | Keep |  |
| `fields.plannedImplementationStart` | Engagement (schedule) and brief | hours engine, plan or report generator, tracker (FCP record) | Keep |  |
| `fields.targetStart` | Engagement (schedule) | Summary (fallback for the plan start), plan generator | Make derived | A fallback behind `plannedProjectStart`. Two start fields for one date. Fold it into `plannedProjectStart` in a migration. |
| `fields.targetComplete` | Engagement (schedule) and brief | Summary, Standard, plan or report generator, tracker (FCP record), Full report | Keep | The customer's own target completion; Summary prints it as a key date. |
| `fields.hardwareAvailability` | Scope and brief | plan or report generator | Keep |  |
| `fields.hardwareLeadWeeks` | Scope and brief | plan or report generator | Keep |  |
| `fields.priorities[]` | Scope and brief | hours engine, plan or report generator | Keep |  |
| `fields.timelineNotes` | Engagement (schedule) and brief | plan or report generator | Keep |  |
| `fields.adoptionCadence` | Engagement (schedule) | Plan generator (week or month windows) | Review | Customer formats and the Handoff are monthly. Confirm weekly plans are still wanted before keeping the switch. |
| `fields.exportPreferences.includeVcfReadiness` | Hidden in the Review rewrite (was Review toggle) | Full report | Remove (Phase 6) | A Full-report export toggle. The Summary, Standard and Handoff ignore it. |
| `fields.exportPreferences.includeOperationalTimeline` | Hidden in the Review rewrite (was Review toggle) | Full report | Remove (Phase 6) | A Full-report export toggle. The Summary, Standard and Handoff ignore it. |
| `fields.compatibilityTargetRelease` | Estate and brief | plan or report generator | Keep |  |
| `fields.customerSegment` | No editor (deprecated) | Migration only; tracker mismatch count (`db.ts`) | Remove | Documented as deprecated: the deal segment lives on the tracker. Read only to derive `commercialPlan` once and to count legacy mismatches. Drop after the mismatch count is retired. |
| `fields.commercialPlan` | Engagement and brief | hours engine, plan or report generator, tracker (FCP record) | Keep |  |
| `fields.hoursModel` | Plan (estimating inputs) | hours engine, plan or report generator, tracker (FCP record) | Review | v1 (host brackets) versus v2. If no saved plan still needs v1, remove the switch and the v1 code. |
| `fields.plannerLog[]` | Written by Plan edits | hours engine | Keep | Audit trail of planner decisions; never printed. Could appear in the Handoff. |
| `fields.hoursFill.enabled` | Plan (hours fill) | plan or report generator | Keep |  |
| `fields.hoursFill.label` | Plan (hours fill) and brief | Plan (fill package label), Summary, Standard, Handoff (as a package name) | Keep |  |
| `fields.fundingSource` | Funding and brief | Summary, Standard, hours engine, plan or report generator, tracker (FCP record) | Keep |  |
| `fields.bsasHours` | Funding and brief | Summary, Standard, hours engine, plan or report generator, tracker (FCP record), Full report | Keep |  |
| `fields.bsasStart` | Funding and brief | hours engine, plan or report generator, tracker (FCP record) | Keep |  |
| `fields.bsasEnd` | Funding and brief | hours engine, plan or report generator, tracker (FCP record) | Keep |  |

## 2. Scope: `fields.adoptionDetails`

| Field | Entered | Read by | Recommend | Why |
|---|---|---|---|---|
| `fields.adoptionDetails.upgradePath` | Scope (pathway choice) | plan or report generator | Keep | Selects the playbook; the main plan input. |
| `fields.adoptionDetails.platformEdition` | Scope and brief | plan or report generator | Keep |  |
| `fields.adoptionDetails.domainTopology` | Scope and brief | hours engine, plan or report generator | Keep |  |
| `fields.adoptionDetails.principalStorage` | Scope and brief | hours engine, plan or report generator | Keep |  |
| `fields.adoptionDetails.componentDepths.operations`~ | Scope and brief | Handoff, hours engine, plan or report generator, tracker (FCP record), Full report | Keep |  |
| `fields.adoptionDetails.componentDepths.automation`~ | Scope and brief | hours engine, plan or report generator, tracker (FCP record) | Keep |  |
| `fields.adoptionDetails.componentDepths.networkingSecurity` | Scope and brief | hours engine, plan or report generator, tracker (FCP record) | Keep |  |
| `fields.adoptionDetails.componentDepths.kubernetesAi` | Scope and brief | hours engine, plan or report generator, tracker (FCP record) | Keep |  |
| `fields.adoptionDetails.componentDepths.efficiency` | Scope and brief | hours engine, plan or report generator, tracker (FCP record) | Keep |  |
| `fields.adoptionDetails.operations[]`~ | Scope and brief | Handoff, hours engine, plan or report generator, tracker (FCP record), Full report | Keep |  |
| `fields.adoptionDetails.automation[]`~ | Scope and brief | hours engine, plan or report generator, tracker (FCP record) | Keep |  |
| `fields.adoptionDetails.networking[]`~ | Scope and brief | Handoff, hours engine, plan or report generator | Keep |  |
| `fields.adoptionDetails.security[]` | Scope and brief | Handoff, hours engine, plan or report generator, Full report | Keep |  |
| `fields.adoptionDetails.resilience[]` | Scope and brief | Handoff, hours engine, plan or report generator | Keep |  |
| `fields.adoptionDetails.kubernetes[]` | Scope and brief | Handoff, hours engine, plan or report generator | Keep |  |
| `fields.adoptionDetails.privateAi[]` | Scope and brief | hours engine, plan or report generator | Keep |  |
| `fields.adoptionDetails.softPrerequisites[]` | Scope and brief | plan or report generator | Keep |  |
| `fields.adoptionDetails.notes` | Scope and brief | Plan generator (timeline context), constraints (a "Planning note" row, so Standard and Handoff) | Keep | Free text; becomes a constraint row. |
| `fields.adoptionDetails.industryTemplate` | Scope and brief | plan or report generator, Full report | Keep |  |
| `fields.adoptionDetails.domains[]` | Scope or brief | hours engine, plan or report generator, Full report | Keep | Workload and management domains; sizes the build. |
| `fields.adoptionDetails.followOnOnly[]` | Scope and brief | hours engine, plan or report generator | Keep |  |
| `fields.adoptionDetails.excludedHosts[]` | Brief only (no editor) | plan or report generator | Keep | Hosts left out of the compatibility check. No editor: add one or accept brief-only. |

## 3. Estimating inputs: `fields.estimateInputs`

61 of the 67 inputs are the estimating drivers `resolveInputs` reads (`shared/hoursV2.ts`). Each has the same profile, so they share one row:

- **Entered:** Plan, estimating inputs panel (`EntitlementFitPanel` lists every key of the schema, so each can be set there; most are blank and use a recorded default).
- **Read by:** hours engine; the Delivery Handoff prints each one the plan used under Estimating Basis, with its source and Confirmed or Assumed.
- **Recommend:** Keep. None is read by the Summary or Standard (by design: they print hours, not drivers).
- **Fields:** `sites`, `workloadDomains`, `stretchedClusters`, `storageTypes`, `clustersOnFcOrNfs`, `mixedStorage`, `dedicatedNsxWorkloadDomains`, `noExistingNsx`, `enhancedLinkedMode`, `sourceIsVcf`, `source8x`, `clustersOnVum`, `vcentersWithIwa`, `clustersOnVss`, `legacyLogs`, `upgradeVcfAutomation`, `upgradeLogs`, `upgradeVidmToIdentityBroker`, `upgradeHcx`, `upgradeAvi`, `upgradeSrm`, `upgradeSupervisors`, `upgradeNsxFederation`, `migrationSitePairs`, `extendedVlans`, `datedWaves`, `orgs`, `catalogItems`, `templates`, `vcenterSources`, `managementPacks`, `dashboards`, `eventTargets`, `segments`, `edgeClusters`, `extraUplinkPairs`, `externalVlans`, `virtualNetworkAppliance`, `transitGateway`, `zones`, `apps`, `sspAlreadyDeployed`, `tuningCycles`, `drSitePairs`, `recoveryPlans`, `protectedVms`, `exercises`, `ireTests`, `supervisors`, `vksClusters`, `gpuHosts`, `models`, `engines`, `dsmTemplates`, `clouds`, `virtualServices`, `wafPolicies`, `tieredHosts`, `broadcomBaselineDelivered`, `outcomeRanking[]`, `wantThisYear[]`

Inputs with their own profile:

| Field | Entered | Read by | Recommend | Why |
|---|---|---|---|---|
| `smallEstate` | Plan (estimating inputs) | Hours engine (design tier), Handoff | Keep | Switches the Reference Architecture Design tier; changes are logged in `plannerLog`. |
| `migrationWaves` | Plan (Migration waves), brief | Hours engine, plan generator, Handoff, Standard and Summary (wording) | Keep | Who runs the migration waves; documented in FCP-REPORT-FORMATS.md. |
| `targetClusters` | Plan (estimating inputs) | Hours engine | Keep |  |
| `blendedRate` | Funding, Plan (fit panel) | Hours engine (dollar view), planner screens only | Keep | Rate never prints. |
| `reservePercent` | Funding | Hours engine (reserve) | Keep | Default 8%. |
| `monthsRemaining` | Plan (fit panel) | Hours engine (required burn), Handoff (pace risk) | Keep |  |
| `outcomeRanking` | No editor (code or brief) | Hours engine (fill order) | Review | No screen sets it. Remove, or add a ranking control. |
| `wantThisYear` | No editor (code or brief) | Hours engine (customer-funded bucket) | Review | No screen sets it. |

## 4. RVTools inventory: `document.inventory` and `inventorySources`

All derived from the RVTools export in the browser; only these aggregates are stored (never raw rows). The editing column is RVTools for all of them.

| Field | Entered | Read by | Recommend | Why |
|---|---|---|---|---|
| `inventorySources[]` | RVTools | Plan or report generator (inventory merge), tracker (RVTools-received check) | Keep | File name, size and sheets of each import; no raw data. |
| `inventory.sourceCount` | RVTools | plan or report generator | Keep |  |
| `inventory.datacenters`~ | RVTools | Handoff, hours engine, plan or report generator, Full report | Keep |  |
| `inventory.clusters` | RVTools | Handoff, hours engine, plan or report generator, Full report | Keep |  |
| `inventory.clusterProfiles[]` | RVTools | hours engine, plan or report generator | Keep |  |
| `inventory.hosts` | RVTools | Handoff, hours engine, plan or report generator, Full report | Keep |  |
| `inventory.physicalCores` | RVTools | plan or report generator | Keep |  |
| `inventory.vmCount` | RVTools | hours engine, plan or report generator, Full report | Keep |  |
| `inventory.poweredOnVms` | RVTools | plan or report generator | Keep |  |
| `inventory.poweredOffVms` | RVTools | plan or report generator | Keep |  |
| `inventory.vCpu` | RVTools | plan or report generator | Keep |  |
| `inventory.vmMemoryGiB` | RVTools | plan or report generator | Keep |  |
| `inventory.datastoreCount` | RVTools | plan or report generator | Keep |  |
| `inventory.datastoreCapacityTiB` | RVTools | plan or report generator | Keep |  |
| `inventory.datastoreUsedTiB` | RVTools | plan or report generator | Keep |  |
| `inventory.snapshotCount` | RVTools | plan or report generator | Keep |  |
| `inventory.maintenanceHosts` | RVTools | plan or report generator | Keep |  |
| `inventory.disconnectedHosts` | RVTools | plan or report generator | Keep |  |
| `inventory.highCpuHosts` | RVTools | plan or report generator | Keep |  |
| `inventory.highMemoryHosts` | RVTools | plan or report generator | Keep |  |
| `inventory.overcommittedDatastores` | RVTools | plan or report generator | Keep |  |
| `inventory.esxiVersions[]` | RVTools | hours engine, plan or report generator, Full report | Keep |  |
| `inventory.guestOperatingSystems[]` | RVTools | plan or report generator | Keep |  |
| `inventory.hostModels[]` | RVTools | plan or report generator | Keep |  |
| `inventory.hclEvidence` | RVTools | hours engine, plan or report generator | Keep |  |

## 5. Generated: plan, timelines, readiness

| Field | Entered | Read by | Recommend | Why |
|---|---|---|---|---|
| `readiness` | Generated | Handoff, hours engine, plan or report generator, Full report | Keep | Generated from the inventory and plan. The Handoff prints `readiness.hcl` and the host platforms; the planning considerations (`readiness.items`) reach only the Full report and the Estate section. |
| `adoptionTimeline` | Generated; edited in Plan | Summary, Standard, Handoff, hours engine, plan or report generator, Full report | Keep | The plan itself. |
| `twoYearPlan` | Generated; edited in Plan | hours engine, plan or report generator, Full report | Keep | Follow-on plan; Summary page 3, Standard roadmap. |
| `rationale` | Generated | hours engine, plan or report generator | Make derived | Text the generator rewrites on every build and the planner screens show. Nothing prints it; no reason to store it. |

## 6. Report content: `document.report`

| Field | Entered | Read by | Recommend | Why |
|---|---|---|---|---|
| `report.briefVersion` | Brief | Nothing | Keep | Bookkeeping: shows which brief version is loaded. |
| `report.importedAt` | Brief | tracker (FCP record) | Keep | Bookkeeping; feeds the "brief imported" source check in the tracker. |
| `report.asOf` | Narrative (Delivery model and revision), brief | Summary, Standard, hours engine, plan or report generator, tracker (FCP record), Full report | Keep | Dates the content; feeds the burndown and the issue stamp. |
| `report.deliveryModel` | Narrative and brief | Summary, Standard, Handoff, Full report | Keep |  |
| `report.headline` | Narrative (cover headline) | Plan generator (default only); Full report cover | Remove (Phase 6) | The Summary and Standard covers write their own tagline. Entered in Narrative, printed only by the Full report. |
| `report.contacts.customer[]` | Narrative (Contacts) and brief | Standard (who is involved), Handoff (people and contacts), Full report | Keep | Name and role print in the Standard; email and phone only in the Handoff. `fields.primaryContact` overlaps it. |
| `report.contacts.cdw[]` | Narrative (Contacts) and brief | Standard, Handoff (people and contacts), Full report | Keep |  |
| `report.contacts.broadcom[]` | Narrative (Contacts) and brief | Standard, Handoff (people and contacts), Full report | Keep |  |
| `report.entitlement.hours` | Funding and brief | Summary, Standard, Handoff, hours engine, plan or report generator, tracker (FCP record), Full report | Keep |  |
| `report.entitlement.termStart`~ | Funding and brief | Summary, Standard, Handoff, hours engine, plan or report generator, tracker (FCP record), Full report | Keep | Overrides the engagement start when Broadcom's record states the term. Overlaps `fields.entitlementStart`. |
| `report.entitlement.termEnd`~ | Funding and brief | Summary, Standard, Handoff, hours engine, plan or report generator, tracker (FCP record), Full report | Keep | As above, for the end date. Overlaps `fields.entitlementEnd`. |
| `report.entitlement.hoursConsumed` | Funding and brief | hours engine, tracker (FCP record) | Keep |  |
| `report.entitlement.consumedAsOf` | Funding and brief | Summary, Standard, hours engine, tracker (FCP record), Full report | Keep |  |
| `report.declined[]` | Scope (declined add-ons) | Summary ("not requested" line), Full report | Keep |  |
| `report.situation[]` | Narrative | Standard (situation), Full report | Keep | Not in the Summary. |
| `report.designProfile.consumption` | Scope | Summary (architecture at a glance), Standard (design profile), Full report | Keep | Not in the Handoff. |
| `report.designProfile.physicalSite` | Scope | Summary (architecture at a glance), Standard (design profile), Full report | Keep |  |
| `report.designProfile.availability` | Scope | Summary (architecture at a glance), Standard (design profile), Full report | Keep |  |
| `report.designProfile.isolation` | Scope | Summary (architecture at a glance), Standard (design profile), Full report | Keep |  |
| `report.designProfile.recoverability` | Scope | Summary (architecture at a glance), Standard (design profile), Full report | Keep |  |
| `report.designProfile.expansion` | Scope | Summary (architecture at a glance), Standard (design profile), Full report | Keep |  |
| `report.designElements[]` | Narrative, Scope | Handoff, plan generator | Keep |  |
| `report.whatWeHeard[]` | Narrative | Standard, Full report | Keep | Not in the Summary or the Handoff. |
| `report.problems[]` | Narrative | Summary and Standard (the "why it matters" line for follow-on work), Full report | Keep |  |
| `report.openQuestions[]` | Narrative | Handoff, Full report | Keep | Handoff only among the live documents. |
| `report.technicalItems[]` | Narrative | Handoff, Full report, plan generator (adds its own rows) | Keep | Handoff only among the live documents. |
| `report.constraints[]` | Narrative, Plan | Standard, Handoff, plan generator | Keep |  |
| `report.customerAsks[]` | Narrative and brief | Summary, Standard, Handoff, plan or report generator, Full report | Keep |  |
| `report.customerOwnedWork[]` | Plan and brief | Summary, Standard, Handoff, hours engine, plan or report generator, Full report | Keep |  |
| `report.customerEffort[]` | Brief only (no editor) | Hours engine (customer effort), Standard, Handoff | Keep | Customer's own weekly hours replace CDW's defaults. No editor. |
| `report.openItems[]` | Narrative and brief | Summary, Standard, Handoff, plan or report generator, Full report | Keep |  |
| `report.personnel[]` | Narrative and brief | Handoff, plan or report generator, tracker (FCP record), Full report | Keep |  |
| `report.milestonesToDate[]` | Narrative | Standard, Full report | Keep |  |
| `report.sources[]` | Review > More | Handoff? no; Full report footer; tracker (sources check) | Review | Printed in the Full report footer only. The Summary, Standard and Handoff do not cite sources. Keep as a record, or print them in the Handoff. |
| `report.revision` | Narrative (Delivery model and revision), brief | Standard (document control), Full report | Make derived | The issue panel already takes a revision note, stored on the version. Two places say what a version changed; the Standard prints this one. Derive it from the issue note. |
| `report.workPackageHours[]` | Plan (hours) | Hours engine | Keep | Planner overrides of package hours. |
| `report.hiddenGenerated[]` | Narrative (hide a generated row) | Plan or report generator | Keep | Bookkeeping for rows the planner removed. |

### 6.1 Discovery answers: `report.discovery`

| Field | Entered | Read by | Recommend | Why |
|---|---|---|---|---|
| `report.discovery.assessmentCompleted` | Estate (Estimating inputs or Environment) and brief | Handoff, hours engine | Keep |  |
| `report.discovery.coreCount`~ | Brief | Plan generator (fallback behind licensedCores) | Remove | Read once, as a fallback for `licensedCores`. Merge into one cores field. |
| `report.discovery.licensedCores` | Estate (Estimating inputs or Environment) and brief | Handoff, plan or report generator | Keep |  |
| `report.discovery.vcfLicensed` | Estate (Estimating inputs or Environment) and brief | Handoff | Keep |  |
| `report.discovery.renewalDate` | Estate (Estimating inputs or Environment) | Handoff, plan or report generator, Full report | Keep |  |
| `report.discovery.addOnsPurchased[]` | Estate (Estimating inputs or Environment) | Handoff, hours engine, plan or report generator | Keep |  |
| `report.discovery.currentPlatform` | Estate (Estimating inputs or Environment) | Handoff | Keep |  |
| `report.discovery.enhancedLinkedMode`~ | Estate (Estimating inputs or Environment) and brief | Handoff, hours engine, plan or report generator | Keep |  |
| `report.discovery.networking`~ | Estate (Estimating inputs or Environment) and brief | Handoff, hours engine, plan or report generator | Keep |  |
| `report.discovery.vcenters` | Estate (Estimating inputs or Environment) and brief | Handoff, hours engine, plan or report generator, Full report | Keep |  |
| `report.discovery.datacenters`~ | Estate (Estimating inputs or Environment) and brief | Handoff, hours engine, plan or report generator, Full report | Keep |  |
| `report.discovery.edgeSites` | Estate (Estimating inputs or Environment) and brief | Handoff, plan or report generator | Keep |  |
| `report.discovery.esxHosts` | Estate (Estimate inputs), brief | Hours engine (fallback behind RVTools) | Keep | Estimate when there is no RVTools export. |
| `report.discovery.vcfInstances` | Estate, brief | Hours engine | Keep |  |
| `report.discovery.storage` | Estate (Estimating inputs or Environment) and brief | Summary, Standard, Handoff, hours engine | Keep |  |
| `report.discovery.serverVendor` | Estate (Estimating inputs or Environment) | Summary, Standard, Handoff, plan or report generator | Keep |  |
| `report.discovery.containerPlatform` | Estate (Estimating inputs or Environment) | Handoff, plan or report generator | Keep |  |
| `report.discovery.jumboFrames` | Estate (Estimating inputs or Environment) and brief | Handoff, plan or report generator | Keep |  |
| `report.discovery.securityTooling` | Estate (Estimating inputs or Environment) | Handoff, plan or report generator | Keep |  |
| `report.discovery.drSolution` | Estate (Estimating inputs or Environment) | Handoff, plan or report generator | Keep |  |
| `report.discovery.backup` | Estate (Estimating inputs or Environment) | Handoff, plan or report generator | Keep |  |
| `report.discovery.hyperscalers[]` | Estate (Estimating inputs or Environment) | Handoff | Keep |  |
| `report.discovery.newHostsPurchased.management` | Estate (Estimating inputs or Environment) and brief | Handoff, hours engine, plan or report generator, Full report | Keep |  |
| `report.discovery.newHostsPurchased.workload` | Brief only (no editor) | Handoff, hours engine, plan or report generator | Keep | No editor for the workload count (management has one). |
| `report.discovery.storageSecondary[]` | Brief only (no editor) | Hours engine (mixed storage) | Keep | No editor. |
| `report.discovery.vsphere8Strategy` | Brief only (no editor) | Plan generator (vSphere 8 open item) | Keep | No editor. |

## 7. Tracker record (`engagements`, `trackerPatchSchema`)

The tracker fields that exist for the pipeline (stage gates, dashboards, reports) are kept; the column "Feeds the FCP" names the ones the FCP reads or writes.

| Field | Entered | Used by | Feeds the FCP | Recommend | Why |
|---|---|---|---|---|---|
| `customerName` | Tracker drawer, Engagement | dashboards (Overview, Expiry, Queue), reports, Pipeline import, FCP record (funding, issue, readiness), Delivery Handoff, tracker screens | Yes: name on every document | Keep | Part of the FCP workflow. |
| `salesforceCustomerId` | Tracker drawer, Pipeline import | reports, Pipeline import, tracker screens | No | Keep | Stage rules, dashboards or reports read it. |
| `salesforceOpportunityId` | Pipeline import (no editor beyond the generic drawer field) | Pipeline import | No | Review | Read only by the Pipeline import; nothing else uses it. The opportunity number is the working key. |
| `opportunityNumber` | Tracker drawer, Pipeline import | dashboards (Overview, Expiry, Queue), reports, Pipeline import, FCP record (funding, issue, readiness), Delivery Handoff, tracker screens | Yes: Handoff | Keep | Part of the FCP workflow. |
| `serNumber` | Tracker drawer, Pipeline import | reports, Pipeline import, tracker screens | No | Keep | Stage rules, dashboards or reports read it. |
| `segment` | Tracker drawer, Engagement (segment review) | stage rules and gates, dashboards (Overview, Expiry, Queue), reports, Pipeline import, FCP record (funding, issue, readiness), Delivery Handoff, tracker screens | Yes: picks the format (Summary or Standard); Handoff | Keep | Part of the FCP workflow. |
| `program` | Tracker drawer, Pipeline import | reports, Pipeline import | No | Keep | Report and import column. |
| `region` | Tracker drawer, Pipeline import | reports, Pipeline import | No | Keep | Report and import column. |
| `customerState` | Tracker drawer, Pipeline import | reports, Pipeline import | No | Keep | Report and import column. |
| `entitlementInterest` | Tracker drawer, Pipeline import | reports, Pipeline import | No | Keep | Stage rules, dashboards or reports read it. |
| `waitingOn` | Tracker drawer, Pipeline import | dashboards (Overview, Expiry, Queue), reports, Pipeline import | No | Keep | Stage rules, dashboards or reports read it. |
| `health` | Tracker drawer, Pipeline import | reports, Pipeline import, tracker screens | No | Keep | Stage rules, dashboards or reports read it. |
| `riskAssessment` | Tracker drawer, Pipeline import | reports, Pipeline import | No | Keep | Stage rules, dashboards or reports read it. |
| `raStatus` | Tracker drawer, Pipeline import | reports, Pipeline import | No | Keep | Stage rules, dashboards or reports read it. |
| `vcfAssessment` | Tracker drawer, Pipeline import | reports, Pipeline import | No | Keep | Report and import column. |
| `nextSteps` | Tracker drawer, Pipeline import | reports, Pipeline import | No | Keep | Stage rules, dashboards or reports read it. |
| `statusNotes` | Tracker drawer, Pipeline import | reports, Pipeline import | No | Keep | Stage rules, dashboards or reports read it. |
| `serSubmittedOn` | Tracker drawer, Pipeline import | stage rules and gates, reports | No | Keep | Stage gate and reports. |
| `serApprovedOn` | Tracker drawer, Pipeline import | stage rules and gates, reports | No | Keep | Stage rules, dashboards or reports read it. |
| `fcpDraftCreatedOn` | Tracker drawer, Pipeline import | stage rules and gates, reports, Pipeline import, tracker screens | Yes: filled when the FCP is issued | Keep | Part of the FCP workflow. |
| `fcpSubmittedOn` | Tracker drawer, Pipeline import | stage rules and gates, reports, tracker screens | Yes: filled when the FCP is issued | Keep | Part of the FCP workflow. |
| `fcpBroadcomAcceptedOn` | Tracker drawer, Pipeline import | stage rules and gates, reports, Pipeline import, tracker screens | Yes: set by recording the approval | Keep | Part of the FCP workflow. |
| `fcpCustomerAcceptedOn` | Tracker drawer, Pipeline import | stage rules and gates, reports, Pipeline import, tracker screens | Yes: set by recording the approval | Keep | Part of the FCP workflow. |
| `workPlanSentOn` | Tracker drawer, Pipeline import | stage rules and gates, reports | No | Keep | Stage rules, dashboards or reports read it. |
| `workPlanAcceptedOn` | Tracker drawer, Pipeline import | stage rules and gates, dashboards (Overview, Expiry, Queue), reports | No | Keep | Stage rules, dashboards or reports read it. |
| `workPlanHours` | Tracker drawer, Pipeline import | stage rules and gates, dashboards (Overview, Expiry, Queue), tracker screens | No | Keep | Stage rules, dashboards or reports read it. |
| `poHours` | Tracker drawer, Funding | stage rules and gates, dashboards (Overview, Expiry, Queue), FCP record (funding, issue, readiness), tracker screens | Yes: Funding section, issue readiness | Keep | Part of the FCP workflow. |
| `ikomOn` | Tracker drawer, Pipeline import | stage rules and gates, reports, Pipeline import | No | Keep | Stage rules, dashboards or reports read it. |
| `raReceivedOn` | Tracker drawer, Pipeline import | stage rules and gates, reports | No | Keep | Stage rules, dashboards or reports read it. |
| `workAuthReceivedOn` | Tracker drawer, Pipeline import | stage rules and gates, dashboards (Overview, Expiry, Queue), reports, Pipeline import | No | Keep | Stage rules, dashboards or reports read it. |
| `poReceivedOn` | Tracker drawer, Funding | stage rules and gates, dashboards (Overview, Expiry, Queue), reports, Pipeline import, FCP record (funding, issue, readiness), tracker screens | Yes: Funding section | Keep | Part of the FCP workflow. |
| `ckomOn` | Tracker drawer, Pipeline import | stage rules and gates, reports, Pipeline import | No | Keep | Stage rules, dashboards or reports read it. |
| `projectStartOn` | Tracker drawer, Pipeline import | stage rules and gates, reports, Pipeline import | No | Keep | Stage rules, dashboards or reports read it. |
| `estimatedCloseOn` | Tracker drawer, Pipeline import | stage rules and gates, reports, Pipeline import | No | Keep | Stage rules, dashboards or reports read it. |
| `completedOn` | Tracker drawer, Pipeline import | stage rules and gates, reports | No | Keep | Stage rules, dashboards or reports read it. |
| `entitlementValue` | Tracker drawer, Pipeline import | dashboards (Overview, Expiry, Queue), reports, Pipeline import, FCP record (funding, issue, readiness), tracker screens | Yes: entitlement value (the one dollar figure) | Keep | Part of the FCP workflow. |
| `estimatedDealValue` | Tracker drawer, Pipeline import | reports, Pipeline import | No | Keep | Reports and import only; not an FCP figure (the FCP carries the entitlement value only). |
| `broadcomPo` | Pipeline import (no editor beyond the generic drawer field) | Pipeline import | No | Review | Read only by the Pipeline import; no screen, report or rule uses it. |
| `termStart` | Tracker drawer, Funding | reports, FCP record (funding, issue, readiness), Delivery Handoff | Yes: term dates | Keep | Part of the FCP workflow. |
| `termEnd` | Tracker drawer, Funding | reports, FCP record (funding, issue, readiness), Delivery Handoff | Yes: term dates | Keep | Part of the FCP workflow. |
| `deliveryWindowEnd` | Tracker drawer, Pipeline import | dashboards (Overview, Expiry, Queue), reports, Pipeline import, tracker screens | No | Keep | Stage rules, dashboards or reports read it. |
| `coreCount` | Tracker drawer, Pipeline import | reports | No | Review | Report column only. The FCP has its own core counts (`discovery.licensedCores`, RVTools). |
| `clientFolderUrl` | Pipeline import (no editor beyond the generic drawer field) | Pipeline import | No | Keep | Opens the customer folder through the file-source seam. |
