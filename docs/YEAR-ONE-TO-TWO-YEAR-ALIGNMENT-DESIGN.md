# Year-One-to-Two-Year Follow-On Service Alignment Design

## Decision

The editable operational Adoption Timeline remains the **year-one delivery plan**. The separate 24-month view becomes the **Two-Year Follow-On Service Outlook (Years 2–3)**. It starts at the first month after the operational year-one horizon rather than at the same date as the primary timeline.

This resolves the duplicated schedule problem: the operational plan expresses near-term delivery, while the outlook expresses only services that may logically follow the completed foundation. It remains a strategic planning aid and does not add contractual commitments.

## Relationship between plans

| Plan | Horizon | Purpose | Source of activities |
|---|---:|---|---|
| Operational Adoption Timeline | Target delivery window, normally year one | Editable delivery sequencing and detailed execution windows | Upgrade path, Plan, Design, confirmed priorities, and confirmed detailed capability selections |
| Two-Year Follow-On Service Outlook | Twenty-four months after the operational horizon | Strategic service maturation, optimization, and expansion | Completed or in-flight year-one service prerequisites and confirmed detailed intake |

## Follow-on construction rules

A shared follow-on service catalog will map confirmed year-one focus areas to cautious post-year-one activities. Each generated follow-on activity will include an explicit **Enabled by Year 1** prerequisite label. For example, an Automation catalog expansion may be enabled by the year-one VM Self-Service Catalog Plan, while a capacity optimization service may be enabled by the year-one Capacity and Cost Visibility Plan.

If a priority has no confirmed detailed focus, the outlook will show a limited **roadmap decision** rather than presume that a service rollout is approved. If no priorities are selected, the outlook will contain only foundation follow-through such as operational handoff, lifecycle cadence, and a future-service portfolio review.

| Confirmed year-one focus | Potential Years 2–3 follow-on | Example prerequisite wording |
|---|---|---|
| Lifecycle, observability, capacity, or custom dashboards | Operations optimization, dashboard expansion, lifecycle cadence | Enabled by Year 1: Capacity and Cost Visibility Plan |
| Self-service, IaC, day-2 automation, governance, or application provisioning | Catalog expansion, blueprint factory, policy rollout, application service expansion | Enabled by Year 1: Infrastructure-as-Code Patterns Plan |
| Segmentation, RBAC, or hardening | Segmented rollout, compliance evidence automation, access governance operationalization | Enabled by Year 1: Segmentation and Security Policy Plan |
| Recovery architecture, recovery exercises, or cyber recovery | Recovery service rollout, exercise cadence, cyber-recovery pilot | Enabled by Year 1: Recovery Architecture Plan |
| Workload domains, platform operations, or developer experience | Workload-domain onboarding, Kubernetes fleet expansion, developer platform adoption | Enabled by Year 1: Kubernetes Platform Operations Plan |
| GPU capacity, AI guardrails, or pilot onboarding | GPU-enabled workload enablement, private-AI controls, pilot expansion decision | Enabled by Year 1: AI Capacity and GPU Readiness Plan |

## Data and migration approach

The timeline bar contract will add an optional `dependsOn` field. Existing bars remain valid without it. The generator will derive the operational horizon from the primary timeline’s actual column count and start the follow-on outlook in the next calendar month. Existing saved documents will be regenerated on load through the existing derived-document refresh path, preserving editable user changes only where the system already treats plans as generated artifacts.

## Presentation approach

The workspace and export will label the two-year view as a **follow-on** outlook and explain that it begins after year-one delivery. Each follow-on bar will show the prerequisite in its label or companion details. The report will include a concise relationship statement so readers do not mistake the outlook for a duplicated delivery schedule.

## Evidence boundary

The follow-on catalog is based on documented VCF Operations and Automation capability themes—such as lifecycle management, capacity optimization, policy-driven automation, Kubernetes operations, and private-AI services—but selection remains customer-confirmed and non-binding.[1] [2]

## References

[1]: https://www.vmware.com/products/cloud-infrastructure/vcf-operations "VMware Cloud Foundation Operations"
[2]: https://www.vmware.com/products/cloud-infrastructure/vcf-automation "VMware Cloud Foundation Automation"
