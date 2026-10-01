# Condensed FCP (FCP 2.0) — design

Status: **built** (phases 1–3). The PowerPoint deck and retiring the current FCP are still to do.

This adds a second export, the **Condensed FCP**, in the FCP 2.0 "Make Amazing Happen" format (the reference example the team supplied). It sits alongside the current FCP and replaces it once accepted. The report is filled from two places:

- a **customer brief** (JSON) that Copilot produces from call notes and the discovery questionnaire, imported into an engagement;
- what the app **already calculates**: RVTools and HCL facts, the generated plan, and new hours, burndown and effort calculations.

## Decisions recorded

| Topic | Decision |
|---|---|
| Output | Condensed FCP alongside the current FCP, then replace it |
| Formats | PDF (and HTML) now; PowerPoint later |
| Rate card | Stored in the app for the internal fit check only; never exported |
| Hours | Calculated from the plan with the services catalog; signed Resource Assignments override when entered |
| Customer effort | Sensible defaults per phase, editable |
| Vocabulary | "Readiness", "workshop" and "TRW" never appear in the report. Workshop-era sizing feeds **design discovery** and is described in design terms |

## Sources used

| Source | What it gave this design |
|---|---|
| `FCP 2.0/fcp-builder/SKILL.md`, `fcp-builder/PROCEDURE.md` | Section list, five fixed categories, scrub rules, "one dollar figure", hours rules, burndown rules |
| `FCP 2.0/fcp-builder/scripts/fcp_hours.py` | Services catalog, role-split rule, 1.4375 loading, fill line, internal fit check |
| `FCP 2.0/fcp-builder/scripts/burndown.py` | Consumption method, expiry vs catch-up pace, extension rule, internal-only figures |
| `FCP 2.0/fcp-builder/scripts/check_fcp.py` | Content gates to enforce on export |
| `Pre-TRW Engagement-Customer Questions.xlsx` | The discovery questions that shape the customer brief |
| `VCF-TRW Customer Output Presentation.pdf`, `CDW_TRW_Workshop_Flow.pdf` | Discovery findings structure (domain, details, versions, status; findings and impact), reused as design discovery |
| `vcf-9.1-planning-and-preparation-workbook.xlsx` | Management domain sizing (2 hosts NFS/FC or 3 vSAN for a simple deployment, 4 for high availability) |
| `Design/cdw-branding`, `Design/cdw-report-design` | Logo, CDW Red `#CC0000`, legend, report elements |

## Where each report section comes from

| Section | Source |
|---|---|
| Cover (headline, prepared for, date, prepared by) | Brief (`headline`); dates and customer from the engagement |
| Title band and pills (customer, location, platform, entitlement window, path, delivery model) | Engagement fields; delivery model from the brief |
| KPI tiles: entitlement value, hours remaining, days to expiry, required weekly pace | **Calculated** from the brief's entitlement block (see Burndown) |
| Executive Summary: Situation | **Calculated** from RVTools and HCL (hosts, VMs, storage, old guest OSes, VM hardware, vSphere 8 end of support), plus brief `situation` bullets |
| Plan on a Page (five categories) | **Generated** from the plan |
| Entitlement Burndown and time-sensitive note | **Calculated** |
| Scoped Effort (workstream × role, hours) | **Calculated** by the hours model, or Resource Assignments when entered |
| Customer Effort by Week & Work Stream | **Calculated** from defaults per phase |
| Target Personnel by Work Stream | Brief `personnel` |
| VCF Design Profile (six categories) | Brief `designProfile`, with **generated defaults** from pathway, edition, storage, topology and outcomes |
| Design Elements (component, requirement, recommendation, gate) | Brief `designElements` plus **generated** items (storage, networking MTU, licensing cores, workloads, management domain) |
| Adoption Sequence & Dependencies | **Generated** from the timeline and prerequisites |
| Private Cloud Adoption Timeline (swimlane) | **Generated** timeline; customer-owned lanes from the brief are drawn grey |
| Engagement Milestones to Date | Brief `milestonesToDate` |
| Forward Delivery Plan | **Generated** from the timeline |
| Adoption Plan & Recommendation (mandatory) | Mixed (below) |
| — The short version | **Calculated** (hours remaining, expiry, pace) |
| — What we heard, and what we have built to | Brief `whatWeHeard` (component, customer position, where it lands) |
| — The problems worth solving first | Brief `problems` |
| — The open questions | Brief `openQuestions` |
| — The technical items to confirm early | Brief `technicalItems` plus **generated** items from prerequisites and research notes |
| — Why the order is not negotiable | **Generated** from prerequisites (platform-imposed) plus brief `constraints` (calendar-imposed) |
| — What this asks of the customer's team | **Calculated** customer effort peak, plus brief `customerAsks` |
| Open Items (item, what it gates, owner) | Brief `openItems`, plus every unfilled required field |
| Revision note, sources footer | Brief `revision`, `sources` |

## The customer brief (JSON, version 1)

One file per customer, produced by Copilot. Every field is optional except `schemaVersion` and `customer.name`. Unknown values stay blank and become Open Items; the importer never guesses.

```jsonc
{
  "schemaVersion": 1,
  "asOf": "2026-09-30",                       // date the notes are current to
  "customer": { "name": "Acme Health", "location": "Reno, NV", "segment": "commercial" },
  "contacts": {
    "customer": [{ "name": "Pat Rivera", "role": "Platform lead" }],
    "cdw": [{ "name": "Jordan Blake", "role": "Architect" }],
    "broadcom": [{ "name": "Alex Kim", "role": "PM" }]
  },
  "entitlement": {
    "value": 79403,                           // the one dollar figure allowed on the page
    "hours": 262,                             // entitled hours (Resource Assignments total)
    "termStart": "2026-04-29", "termEnd": "2027-04-28",
    "hoursConsumed": 39, "consumedAsOf": "2026-09-03",
    "extension": { "to": null, "approvedBy": null }   // both or neither
  },
  "deliveryModel": "CDW + Broadcom",
  "headline": "Amazing happens when two people run a platform that runs itself and recovers on cue.",
  "discovery": {                              // the questionnaire, answered
    "assessmentCompleted": true,              // a prior assessment exists; skips the discovery line in the hours
    "coreCount": 992, "vcfLicensed": true, "renewalDate": null, "addOnsPurchased": [],
    "currentPlatform": "vSphere 8.0.3", "enhancedLinkedMode": false,
    "networking": "vds", "vcenters": 1, "datacenters": 2, "edgeSites": 0, "esxHosts": 14,
    "storage": "vmfs-fc", "serverVendor": "Vendor", "containerPlatform": null,
    "jumboFrames": null, "securityTooling": null, "drSolution": "SnapMirror", "backup": null,
    "hyperscalers": [], "newHostsPurchased": { "management": 0, "workload": 8 },
    "plannedPath": "greenfield", "consolidatedDomain": true,
    "addOnsConsidered": ["vcf-operations", "live-recovery"],   // maps to plan outcomes
    "notInterested": ["kubernetes", "private-ai", "hcx"]
  },
  "situation": ["DR site being built: 8 new hosts and a storage array fed by replication"],
  "designProfile": {
    "consumption": "...", "physicalSite": "...", "availability": "...",
    "isolation": "...", "recoverability": "...", "expansion": "..."
  },
  "designElements": [{ "component": "Principal storage", "requirement": "...", "recommendation": "...", "gate": null }],
  "whatWeHeard": [{ "component": "Storage", "customerPosition": "Keep the existing array", "whereItLands": "Fibre Channel stays principal storage" }],
  "problems": [{ "problem": "Manual recovery of 330 powered-on VMs", "addressedBy": "recovery design picks orchestration" }],
  "openQuestions": [{ "question": "...", "whyNow": "..." }],
  "technicalItems": [{ "item": "...", "reference": "Deployment > Start a New VCF Fleet" }],
  "constraints": [{ "constraint": "DR site online before DR build", "imposedBy": "calendar", "effect": "Recovery design now; DR build follows the site" }],
  "customerAsks": ["Decisions by November: hosts for the build, DR policy direction, wave ownership"],
  "customerOwnedWork": [{ "label": "Customer migration waves and legacy cluster retirement", "start": "2027-02", "end": "2027-04" }],
  "openItems": [{ "item": "Current RVTools export", "gates": "Design sign-off and sizing", "owner": "Pat Rivera" }],
  "personnel": [{ "workstream": "Design discovery, architecture and design", "cdw": ["..."], "broadcom": [], "customer": ["..."] }],
  "milestonesToDate": [{ "date": "2026-07-21", "event": "Discovery session", "detail": "..." }],
  "resourceAssignments": [                    // optional; signed hours override the calculated table
    { "workstream": "Converged management domain build", "architect": 10, "srConsultant": 50, "projectManager": 8 }
  ],
  "sources": [{ "title": "Acme Health VCF 9.1 Compatibility Assessment", "date": "2026-09-30" }],
  "revision": "Rebuilt from the VCF 9.1 assessment and the scoping questionnaire of 30 Sep 2026."
}
```

### Import behaviour

- **New or existing engagement.** Import creates an engagement or updates the selected one.
- **Field mapping.** `discovery` answers map to existing fields: `plannedPath` → pathway, `consolidatedDomain` → topology, `storage` → principal storage, `addOnsConsidered` → priorities and outcomes, `notInterested` → recorded as declined (drives "No work in scope — declined" in empty categories). The injector's coercion (`scripts/inject-fields.mts`) moves into a shared module so "vSAN", "IaC", "Tier 2" and similar phrasing map to allowed values.
- **Narrative fields** are stored in a new `report` block on the engagement document, versioned, with defaults so older engagements still load.
- **Preview before applying.** The import screen lists what will change, what was coerced, what was dropped, and which required items are missing (they become Open Items).
- **Never overwrites** RVTools inventory or a hand-edited timeline (see the `plan-generator-changes` skill).

### Copilot prompt (draft)

> You are preparing a customer brief for a CDW VMware Cloud Foundation engagement. Use only facts stated in the meeting notes, transcripts and questionnaire answers provided. Output a single JSON object that matches the schema below exactly. Leave any field you cannot support with a stated fact as `null` or an empty list; never estimate numbers, dates, hours or names. Quote the customer's words where you record their position. Dates use `YYYY-MM-DD`. Do not include rates, PO values, work authorization or project numbers, or Broadcom segment. Do not use the words "readiness", "workshop" or "TRW"; describe discovery as design discovery. *(schema follows)*

## Hours model

Calculated hours are the ROM/LOE until signed Resource Assignments exist; then the signed hours replace them on the page. Following `fcp_hours.py`:

1. **Pick catalog lines from the plan** — the smallest bracket that fits. Never break a bracket into per-host constants (tested 7–12% off).
2. **Split roles per line:** the lead role gets the base hours, the supporting role 15% of base, the project manager 25% of the two together (1.4375 loading).
3. **Fill line:** migration waves, in-place upgrade waves and the proving wave have no bracket. Their base hours are solved so the plan uses the entitlement exactly, when the entitlement value is known; otherwise they take a stated default and are flagged.
4. **Internal fit check:** funded hours (value ÷ blended rate) against the plan's hours → fits, headroom or shortfall. Shown in the app only; never exported. A shortfall prompts the skill's options: teach-to-fish, stage the scope, or redirect.

### Bracket selection

Inputs: servers = ESXi hosts in scope (RVTools, or `discovery.esxHosts`); sites = datacenters (RVTools, or `discovery.datacenters`); workload domains, instances and edges from the plan.

| Workstream (report row) | Catalog lines | Selection |
|---|---|---|
| Design discovery, architecture and design | A1–A4 (architect-led) | Smallest of: A1 1 site ≤25 servers · A2 1 site ≤65 · A3 1–3 sites ≤100 · A4 1–6 sites ≤200 |
| — plus design discovery, when no prior assessment exists | Former T1–T3 sizing (34 / 85 / 200 base, consultant-led) | Same site and server bands. Labelled design discovery; the old names never appear |
| Management domain build (greenfield, converge, hybrid) | D1–D8 (consultant-led) | Consolidated topology (or ≤10 hosts when undecided) → D1. Otherwise the smallest bracket covering instances, management domains, workload domains, nodes and edges |
| VVF foundation | D1 or D2 | VVF has no workload domains; D1 for one consolidated cluster, D2 otherwise |
| Additional / imported workload domain, DR workload domain | X1 per domain | One per domain (≤8 servers each) |
| NSX overlay, Edge routing, VPC | X5, X6 | X6 when Edge routing or VPC is planned, X5 otherwise |
| VDS-only networking (VVF) | X7 | — |
| Automation self-service / integrations | X2 / X3 | X3 when IaC, governance or application provisioning is planned |
| Operations dashboards and logs | X4 | Observability, dashboards or capacity outcomes |
| VKS, Private AI, DSM | X9, X8, X13 | One each when planned |
| vDefend, vDefend ATP | X11, X12 | X12 when any ATP outcome is planned (it includes the firewall work) |
| Live Recovery (site recovery), cloud cyber recovery, Avi | X10, X14, X15 | One each when planned |
| Migration / proving wave / in-place upgrade waves | Fill line (consultant-led) | Solved to the envelope |
| Program management and governance | Shown as the PM column of every row | The 25% loading rule; no separate catalog line |

Role columns in the report: **Architect**, **Sr. Consultant**, **Sr. Project Manager**. Every column foots to its total, verified in code.

### Customer effort defaults

Phases come from the generated timeline windows. Hours per week, editable per engagement:

| Phase type | Platform lead | Operations | Network | Total | FTE |
|---|---|---|---|---|---|
| Design sessions and sign-off | 3 | 2 | 2 | 7 | 0.18 |
| Platform build | 4 | 2 | 2 | 8 | 0.20 |
| Migration (customer-run waves) | 8 | 6 | 1 | 15 | 0.38 |
| Capability enablement (operations, cloud, security) | 3 | 3 | 1 | 7 | 0.18 |
| Recovery / DR design | 3 | 3 | 2 | 8 | 0.20 |
| Knowledge transfer and handover | 2 | 3 | 1 | 6 | 0.15 |

FTE = total hours ÷ 40. The report states the peak FTE and its window, and flags it when demanding.

## Burndown and KPI tiles

Ported from `burndown.py`:

| Figure | Definition | On the page? |
|---|---|---|
| Hours consumed, remaining | from the brief's entitlement block | Yes |
| % consumed, % term elapsed | consumed ÷ entitled; elapsed ÷ term | Yes (bar fill and tick) |
| Required weekly pace (expiry pace) | remaining ÷ weeks to expiry; FTE = pace ÷ 40 | Yes |
| Days to expiry | expiry − as-of date | Yes |
| Gap, risk band, catch-up pace | PMBOK sign (negative = behind); bands 24 / 11 / 0 points | **No — app only** |

An expiry moves only with both an extension date and an approver. With no entitlement hours the report says no consumption data exists instead of showing zeros.

## Report output

- New export **"Condensed FCP"** as HTML and PDF, file name `<title> - Condensed - FCP.pdf`; the current FCP keeps `<title> - FCP.pdf` until it is retired.
- Rendered by the existing server renderer and Chrome PDF pipeline, so the FCP 2.0 regex contract for reportlab does not apply. The layout, colours and section order follow the FCP 2.0 template and `cdw-report-design`.
- Campaign voice per the template: one "Amazing happens when …" on the cover, one "Make … happen." closer per major section, "Make Amazing Happen." as the cover signature and last line.
- "Gate:" call-outs appear only in Design Elements and the Open Items "What it gates" column; the plan and timeline keep the plain wording.

## Export gates (tests that block the download)

From `check_fcp.py`, run on the rendered HTML:

- No rates, PO value, work authorization or project numbers, segment, `DRAFT`, internal tracker terms, gap, risk band or catch-up pace.
- None of `readiness`, `workshop`, `TRW` (any case).
- Exactly one dollar figure.
- All five categories present, each once.
- Adoption Plan & Recommendation present with its mandatory cards.
- Every Scoped Effort and Customer Effort column foots to its total.
- Milestones and forward plan agree with the chart.
- Stamp `For customer review · <date>`.

## Vocabulary changes in the app

The plan currently uses "readiness" in a few places (site-readiness prerequisite text, "Prepare Operating Model … for Implementation" id, build-readiness wording in the compatibility documents). In the Condensed FCP these become design terms ("site prerequisites", "operating model preparation", "build decision"). The rename follows the `plan-generator-changes` skill so saved plans update without a rebuild.

## Build phases

1. **Brief import:** zod schema for the brief, shared coercion, import screen with preview, `report` block on the document, tests.
2. **Calculations:** hours model (catalog, brackets, split, fill, fit check), Resource Assignments override, customer effort defaults, burndown and KPIs, tests including footing.
3. **Condensed FCP renderer:** HTML and PDF in the FCP 2.0 layout with brand assets, export gates as blocking tests, a review and edit screen for imported content.
4. **Later:** PowerPoint deck; retire the current FCP.

## Open points

- **Fitting scope to funding (decision needed).** A check against the reference example: the full catalog scope (A1, D1, X1 DR workload domain, X4 operations, X10 recovery) prices at about 561 hours against about 277 funded, 2.03× short. The signed Resource Assignments delivered 230 hours in a teach-to-fish shape: design 46, management domain build 68, proving wave 40, DR design 28, operations and logs 26, knowledge transfer 12, program management 10. The catalog alone therefore overstates what goes in the plan. Proposed rule when scope exceeds funding: keep the one-time work at catalog size in priority order (design, platform build, mandatory platform services), reduce repeatable work to a proving run (one migration wave, one domain), reduce add-on lines to their design portion, and report the remaining shortfall as unfunded hours (internal). The planner can then adjust any line before the hours are committed.
- `PROCEDURE.md` is the authoritative content source and lives on SharePoint; the local copy in `VSA Skills/fcp-builder/` is assumed current.
- The swimlane axis: months (PROCEDURE.md) vs calendar quarters (FCP-Builder-Prompt.md). Months, as the app already does, unless told otherwise.
- `addOnsConsidered` vocabulary for the brief: proposed values mirror the questionnaire rows (VCF Operations, Automation, Networks, NSX/VPC, vDefend, ATP, ACC, VKS, Private AI, Live Recovery, DSM, HCX).
