# Review: planner fix, Standard FCP, Summary page 3 (second round)

Rendered from `local-preview` (Standard f0d2e22: no signature lines, full-width follow-on table, repeating strip; Acme and Meridian are 7 pages).
Fake fixture data only (Acme Health, Meridian Health, Cedar Ridge Logistics). This branch is never merged.

Files re-rendered this round: `standard-acme`, `standard-cedar`, `standard-meridian`, `summary3-acme`.
`planner-acme-summary-before/after` and `standard-meridian-v2-approvals-example` are from the first round.

## Acme Health, funded in fill order (262-hour entitlement, 39 delivered, 18 held, 205 planned)

| Step | Package | Hours |
|---|---|---|
| a | Kickoff and Delivery Plan | 2 |
| a | Hardware Compatibility Review | 13 |
| a | Reference Architecture Design | 40 |
| b | Greenfield VCF Foundation Build (management domain, storage, NSX design) | 63 |
| c | VCF Operations Design | 10 |
| c | Role and Access Mapping | 13 |
| c | Training and Knowledge Transfer | 6 |
| c | VCF Operations Licensing | 7 |
| c | Handover and Service Acceptance | 11 |
| d | Migration and Cutover Plan | 24 |
| e | Recovery and Resilience Design (design share) | 10 |
| f | Optimization and Advisory Services | 6 |

Follow-on, whole: First Workload Domain (about 42), Workload Migration and Cutover (about 215), Runbook Knowledge Transfer, Health, Logs and Diagnostics, Recovery Services Build.
The proving wave (126) does not fit after step d; the First Workload Domain (42) does not fit in the 15 hours left after step d. Nothing later in the order was funded while an earlier package that fitted was left out (`never funds a package while an earlier one in the order is left out though it would have fit`).

## Delivery model round (PR #64, `fcp-wave-delivery`)

`delivery-model-acme-summary.pdf` (3 pages) and `delivery-model-acme-standard.pdf` (7 pages), from `acmeHealthReconciled`, with the default Migration waves setting (CDW runs all waves). Fake data only. Acme's planned hours are unchanged at 205 (39 delivered + 205 planned + 18 held = 262). The waves are now one whole package of 215 hours in the follow-on (before: wave 1 was cut out and the rest handed to the customer); there is no runbook transfer, no "Remaining migration waves" row and no customer-run phase.
