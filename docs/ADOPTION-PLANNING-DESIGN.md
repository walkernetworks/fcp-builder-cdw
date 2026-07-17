# Detailed Adoption Planning and Scheduling Design

## Purpose

This design evolves the Functional Consumption Plan from a high-level outcome selector into a **customer-confirmed adoption planning tool**. It preserves the planner’s editable calendar while asking bounded discovery questions that reveal which operational capabilities the customer actually wants to pursue. No selection is inferred from RVTools data or generated as a customer commitment.

## Discovery model

The adoption intake uses an explicit upgrade-path choice and optional, capability-specific focus areas. The questions are intentionally grouped around VCF planning, operations, automation, resilience, and application-platform dimensions documented by Broadcom and VMware. [1] [2] [3]

| Intake area | Confirmed customer choice | Generated planning effect |
|---|---|---|
| Upgrade path | In-place upgrade, new-build/converge, migration waves, design-only, or undecided | Adds a specific Upgrade Services activity only when confirmed; otherwise keeps a single scope-and-runbook activity. |
| Operations | Lifecycle, observability, capacity/cost, dashboards, identity/certificates, or event integration | Adds focused operations design activities instead of one generic Operations Design bar. |
| Automation | VM self-service, infrastructure as code, day-2 automation, governance, or application provisioning | Builds a staged self-service and automation plan only for selected outcomes. |
| Security and resilience | Segmentation, identity/RBAC, hardening, recovery architecture, recovery exercises, or cyber recovery | Separates security and resilience design activities from general platform work. |
| Kubernetes and private AI | Workload domains, platform operations, developer experience, GPU/capacity, guardrails, or pilot onboarding | Adds application-platform exploration work after core platform planning, rather than assuming it is in scope. |

## Timeline contract

The operational **Adoption Timeline** supports two cadences: monthly and weekly. Weekly columns begin on the user-entered target start date and use seven-day windows, so an activity can begin in the middle of a calendar month. Existing monthly plans migrate without losing positions, labels, or editable activities. The separate **Two-Year Notional Adoption Outlook** remains monthly by design; it conveys strategic sequencing and annual expansion horizons, not a detailed execution schedule.

| View | Cadence | Intended use | Editing behavior |
|---|---|---|---|
| Adoption Timeline | Monthly or weekly | Execution-oriented plan for the entitlement or target window | Activities can be moved, resized, added, removed, and switched between cadence views. |
| Two-Year Notional Adoption Outlook | Monthly | Directional capability phasing beyond the immediate execution window | Remains independently editable but is explicitly labeled as a strategic outlook. |

## Report semantics

The previous numbered circles in Plan Summary imply a sequence that the summary does not represent. They are replaced by **textual category labels**. The report makes the operational calendar and the two-year outlook distinct through headings, purpose statements, cadence badges, and separate detailed sequence tables.

## Migration and validation

Saved V5 engagements migrate to V6 with monthly cadence, default detailed-intake values, and preserved timeline data. The shared plan builder remains deterministic. Regression coverage will validate weekly column construction, cadence conversion, legacy migration, detail-driven activities, report separation, and the absence of numeric Plan Summary circles.

## References

[1]: https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/planning-and-preparation.html "VMware Cloud Foundation 9.1: Planning and Preparation"
[2]: https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-0/overview-of-vmware-cloud-foundation-9/what-is-vmware-cloud-foundation-and-vmware-vsphere-foundation/vcf-automation-overview.html "VCF Automation Overview"
[3]: https://blogs.vmware.com/cloud-foundation/2025/06/17/modern-infrastructure-operations-vcf-9-0/ "Operations in VMware Cloud Foundation 9.0"
