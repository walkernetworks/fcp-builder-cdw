# Hours model map

Where the hours model lives, for the v2 rebuild described in `docs/FCP_Hours_Model_Rebuild.md`. Line numbers are for `main` at the start of the rebuild and will drift.

## v1 (bracket model)

All of v1 is in `shared/effort.ts`, apart from the rate card and the budget squeeze, which are server-only.

| What | Where |
|---|---|
| Catalog lines (A1 to A4, DD1 to DD3, DX, D1 to D8, U1, U2, X1 to X16, EF) with base hours, lead role and any support or PM override | `CATALOG`, `shared/effort.ts:24` |
| Wave line defaults (FILL migration 60, in-place 40), proving run 28, add-on design share 25% | `shared/effort.ts:49` to `52` |
| Role split: support 15% of base to the other technical role, PM 25% of technical, per line | `splitRoles` and `rolesOf`, `shared/effort.ts:132` and `140` |
| Bracket selection from hosts, sites, instances and workload domains | `designBracket`, `discoveryBracket`, `deployBracket`, `shared/effort.ts:159` to `191` |
| Which lines the plan gets (pathway, estate, outcomes, design-only cut to 25%) | `scopedEffortLines`, `shared/effort.ts:193` |
| Entitlement envelope: waves grow to fill it; over it, add-ons drop to design, waves to a proving run, extra imports to one | `fitToEnvelope`, `shared/effort.ts:313` |
| Which stages each line lands on | `GOVERNANCE_BARS`, `DISCOVERY_BARS`, `CORE_DESIGN_BARS`, `COMPONENT_DESIGN_BARS`, `BUILD_BARS`, `BUILD_WEIGHTS`, `ADD_ON_BARS`, `barsForLine`, `shared/effort.ts:366` to `422` |
| Spreading lines across stages (length weights, build weights, design PM pooled onto governance stages, add-on design share onto component design stages, deferred stages as follow-on) | `workPackageEffort`, `shared/effort.ts:446` |
| Moving stages out of the entitlement and the timelines that result | `deferWorkPackages`, `timelinesWithDeferrals`, `shared/effort.ts:604` and `620` |
| Assembling rows, work packages, totals and the internal fit | `buildScopedEffort`, `shared/effort.ts:672` |
| Burn-down (planner screens) | `buildBurndown`, `shared/effort.ts:808` |
| Rate card, entitlement value to hours, cost, and the squeeze that moves unprotected work packages to the Two-Year Notional in priority order until the plan fits | `server/rateCard.ts` (`fundedHoursFromValue`, `withinBudget`, `scopedEffortForDocument`) |
| tRPC route the planner screens call | `effort.scoped`, `server/routers.ts` |

## Consumers

| Consumer | Uses |
|---|---|
| `client/src/components/WorkPackageHours.tsx` | Hours per stage, the internal fit and cost (planner screens) |
| `client/src/components/CondensedReportPanel.tsx` | Scoped effort for the Condensed FCP preview |
| `server/condensedFcpRenderer.ts`, `shared/reportView.ts` | Hours table in the Condensed FCP (hours only, no rates) |
| `server/exportDownloadRoutes.ts` | Exports |

## Inputs the model reads today

| Input | Source |
|---|---|
| Hosts | `inventory.hosts`, else `report.discovery.esxHosts` |
| Sites | `inventory.datacenters`, else `report.discovery.datacenters` |
| Clusters | `inventory.clusters` (not used by v1) |
| VMs | `inventory.vmCount` (not used by v1) |
| ESXi versions | `inventory.esxiVersions` (not used by v1) |
| VCF instances | `report.discovery.vcfInstances` |
| vCenters | `report.discovery.vcenters` |
| Enhanced Linked Mode | `report.discovery.enhancedLinkedMode` (not used by v1) |
| Prior assessment | `report.discovery.assessmentCompleted` |
| Pathway, edition, topology, storage, outcomes, depth tiers | `fields.adoptionDetails` |
| Entitlement value | `fields.entitlementAmount` |
| Entitled hours | `report.entitlement.hours` (signed resource assignments) |

## Regression harness

The sweep behind `FCP Hours Research Reference.html` was a one-off script run from a scratch directory, not part of the repo. The rebuild adds it as `scripts/hours-sweep.mts` so v1 and v2 can be compared on the same grid.

## v2 (two-pass model)

| What | Where |
|---|---|
| Every coefficient, with confidence and source | `shared/hoursConfig.ts` |
| Inputs and their defaults | `estimateInputs` on the document fields; resolved in `shared/hoursV2.ts` |
| Pass 1, scope: lines, units, role split, PM pool | `shared/hoursV2.ts` |
| Pass 2, fit: buckets, reserve, split rules, design share, guardrails | `shared/hoursFit.ts` |
| Model flag | `fields.hoursModel` (`"v1"` or `"v2"`). The default is v2; v1 stays selectable on the hours screen for one release. Saved engagements without the field load as v2. |
| Planner screen | `client/src/components/EntitlementFitPanel.tsx` on the hours screen |
| Customer document | Scope by Bucket table (hours only) in `server/condensedFcpRenderer.ts` |
