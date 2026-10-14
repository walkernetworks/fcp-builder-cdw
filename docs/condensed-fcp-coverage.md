# Condensed FCP coverage

The Condensed FCP (`server/condensedFcpRenderer.ts`, with `shared/reportView.ts`) is planned to replace the full FCP (`server/fcpRenderer.ts`). Every field the app collects should reach it, or be removed. This is the audit of what it shows today, from the code (October 2026).

## Status

The Condensed FCP is treated as the only FCP. Every field below now reaches it, except where noted.

| Item | Where it appears |
|---|---|
| Compatibility posture: hosts by decision, ESXi versions, top actions, planning considerations (`readiness.items`) | ESXi target-release Compatibility section, shown when "Compatibility summary in the FCP" is on |
| Entitlement adoption timeline | Shown when "Delivery adoption timeline" is on; when it is off, the Two-Year Notional covers the whole plan from the project start |
| Discovery answers (`shared/deliveryBriefing.ts`), including new hosts purchased | What We Know About the Estate |
| Calendar constraints, planning notes, hardware lead time, implementation start | Sequencing Constraints |
| Implementation start, target completion | Key Dates |
| Location, industry | Header pills |
| Primary contact, contacts from the brief (customer, CDW, Broadcom) | Who Is Involved |
| Playbook decisions for the pathway | Design Profile introduction |
| RVTools estate: cores, vCPU, VM memory, storage used, powered-off VMs, snapshots, hosts in maintenance or disconnected, high CPU and memory hosts, overcommitted datastores, guest operating systems | Situation (estate size and estate health) |
| Estate drivers and v2 estimating defaults, in hours | Estimating Basis |
| Domains from the brief (`adoptionDetails.domains`) | One work package per domain: on greenfield and hybrid plans each management domain in turn, then each instance's workload domains in turn, with instances running alongside each other; on converge plans the converged management domain is named and workload domains follow it; on import plans one import per vCenter. Also the Availability line of the design profile and the workload-domain and instance counts in the Estimating Basis. In-place upgrades keep their upgrade packages. |

Not shown, on purpose:

- **Customer segment.** It is a Broadcom pricing tier; the content checks block segment names. It still decides VVF eligibility and the Building Blocks workbook.
- **Rates and dollars**, other than the entitlement value.
- **Source file names** (RVTools exports and source documents). The document is customer facing; the files stay on the planner screens.
- **The detailed compatibility evidence** (server-model cards, release matrices, all findings and coverage gaps). It stays in the Compatibility Delivery Handoff, marked Presales-to-Delivery.

Still open:

- **The full FCP** (`server/fcpRenderer.ts`) is still generated. The Condensed FCP imports `selectedScopeSummary` from it; move that to `shared/` before the full FCP is removed. The uncalled renderers in it have been deleted.

## Audit at the start of this work

The audit below is from October 2026, before these changes.

## Compatibility Delivery Handoff

The Condensed FCP does not use the handoff. It never calls `summarizeCompatibilityHandoff` and never reads `document.readiness`. HCL work reaches it only indirectly:

- the hardware compatibility gate on the timeline ("Hardware compatibility confirmed")
- the customer-owned evidence and remediation stages
- core counts for licensing and the VM hardware-version rows (from `inventory.hclEvidence`)

The server-model decisions, the action register, findings, coverage gaps and the discovery briefing appear only in the handoff document (`server/compatibilityHandoffRenderer.ts`). The full FCP's readiness tab (`renderReadinessExecutiveSnapshot`) is also not in the Condensed FCP.

## Collected but not in the Condensed FCP

| Field | Collected in | Shown today |
|---|---|---|
| Location (`fields.location`) | Engagement step, brief | Full FCP cover |
| Calendar constraints (`fields.timelineNotes`) | Engagement step, brief | Full FCP, through stage dependencies |
| Planning notes (`adoptionDetails.notes`) | Service Plan, brief | Full FCP, through stage dependencies |
| Implementation start (`plannedImplementationStart`) | Engagement step, brief | Drives the timeline only |
| Target completion (`targetComplete`) | Engagement step, brief | Drives the timeline only |
| Compatibility posture: supported, blocked and unresolved hosts, top actions | RVTools and HCL snapshot | Full FCP readiness tab, handoff |
| HCL findings, coverage gaps, action register | RVTools and HCL snapshot | Handoff only |
| Discovery answers: current platform, networking, storage, hyperscalers, VCF licensed, prior assessment | Brief, report content | Handoff briefing only |
| Playbook decisions per pathway (`plan.decisions`) | Generated | Full FCP |
| All ESXi versions (the Condensed FCP shows the top 3) | RVTools | Full FCP |
| Estimating assumptions (v2 defaults) and sizing basis (hosts, vCenters, instances) | Generated, estimate inputs | Planner screen only |
| Customer segment | Engagement step, brief | Drives VVF and Building Blocks only |

## Collected and used nowhere (dead)

| Field | Collected in |
|---|---|
| Primary customer contact (`fields.primaryContact`) | Engagement step, brief |
| Hardware lead time (`fields.hardwareLeadWeeks`) | Engagement step, brief; no calculation reads it |
| New hosts purchased (management and workload counts) | Brief; only flips hardware availability to "new" |
| Contacts: customer, CDW, Broadcom (`report.contacts`) | Brief only; no editor |
| Readiness items (`readiness.items`, from `assessReadiness`) | Generated; never rendered |
| RVTools aggregates: powered-off VMs, vCPU, VM memory, snapshots, hosts in maintenance or disconnected, guest operating systems, physical cores, high CPU and memory hosts, overcommitted datastores | RVTools import |
| Industry template (`adoptionDetails.industryTemplate`) | Service Plan; discovery prompts in the app only |
| Uncalled renderers in `server/fcpRenderer.ts`: `renderObservedInventory`, `renderHclEstateEvidence`, `renderPlanOutputHtml`, `renderLegacyHclCompatibilityPlanOutputHtml` | Code |

## Proposed order (done)

1. **Compatibility posture section** in the Condensed FCP: host counts by decision, reconciliation, catalog snapshot date and the top actions (port `renderReadinessExecutiveSnapshot`). Decide whether the full action register, findings and coverage gaps join it as an appendix or stay in the handoff, which is marked Presales-to-Delivery.
2. **Discovery answers** (`shared/deliveryBriefing.ts`) as a short table, at least the answers shown nowhere else.
3. **Planner notes and calendar constraints** under Sequencing Constraints.
4. **Customer identity and contacts**: location and the contacts table on the cover or beside personnel.
5. **Schedule dates**: implementation start and target completion with the key dates.
6. **Sizing basis and estimating assumptions** in hours, never rates.
7. **Remove or surface the dead fields.** An "Estate health" line in Situation could use the RVTools aggregates; otherwise stop collecting them. Drop the primary contact and hardware lead time, or use them.
