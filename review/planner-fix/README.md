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

## Round 4 (PR #64 after review fixes, commit 79a9db3)
`waves-acme-{summary,standard}-{draft,issued}.pdf/.html`, default Migration waves setting. Summary 3 pages, Standard 7 pages (draft and issued).
Draft: header band / document control say "Draft" (plus the watermark); issued says "Issued 30 Sep 2026".
Acme hours are independent of the runbook transfer: foundation 63, training 6, handover 11. Fill order shifted (about 5.7 h freed from the build line): Health, Logs and Diagnostics (operations configuration) is now funded, Recovery and Resilience Design moves to follow-on, and Operations design / Health-Logs are partly split into "Remaining Scope" continuation rows.

## Round 5 (PR #65, `fcp-no-split`, commit in branch fcp-no-split): no part-funded packages
`whole-acme-{summary,standard}-issued.pdf/.html`. Summary 3 pages, Standard 7. No "Remaining Scope" row, no follow-on window starting "After".
Acme: a) kickoff 2, hardware review 13, design 40; b) build 63; c) Ops design 10, role and access 13, training 7, licensing 7, handover 11; d) migration plan 24; e) Recovery and Resilience Design 10; f) Optimization and Advisory 5. Total 205.
Health, Logs, and Diagnostics (30) moves whole to the follow-on. Differs from the figures requested by one hour in two places (Ops design 10 vs 11, training 7 vs 6, optimization 5 vs 6); same funded set.
