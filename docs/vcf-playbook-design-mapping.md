# VCF 9.1 Design-to-Drawdown Mapping

This note records the source-backed planning model extracted from `VCF_9.1_Design_and_Drawdown_Playbook.docx` for the FCP Builder redesign.

## Design artifacts that must be visible in the plan

A VCF design is a linked set of deliverables, not a single diagram. The plan should be able to name a requirements and constraints register, decision register, logical design, physical design, bill of materials or configuration baseline, migration and cutover plan, operational handover, and validation and acceptance criteria. The decision register is a distinct deliverable because it records options, choices, and justification.

## In-place upgrade mapping

When the selected path is `in-place`, the primary timeline should not jump directly from a generic baseline to “Execute VCF 9.1 In-Place Upgrade Waves.” It should show the work required to make that execution safe and staffable:

| Work package | Outcome | Depends on |
|---|---|---|
| Upgrade requirements and constraints | Confirm exact vSphere/vCenter/ESXi estate, HCL evidence, support boundary, change freezes, rollback limits, and customer acceptance constraints. | RVTools import and customer confirmation |
| VCF 9.1 target-state and decision design | Record pathway, domain topology, component placement, storage/network choices, and decisions with rationale. | Requirements and constraints |
| Management-domain and platform design | Produce logical and physical management-domain design, IP/DNS/NTP plan, host/cluster placement, and platform prerequisites. | Target-state decisions and HCL gate |
| Upgrade runbook and validation design | Define prechecks, sequencing, change windows, rollback, post-upgrade health checks, and acceptance criteria. | Platform design and customer change calendar |
| Controlled in-place upgrade waves | Execute approved upgrade waves and post-wave validation. | Runbook approval, prerequisites, and change-window approval |
| Operational handover and adoption | Transfer runbooks, monitoring, lifecycle ownership, RACI, evidence, and ongoing operating cadence. | Accepted upgrade waves |

## Drawdown sequencing

The playbook’s services-only model supports design and enablement in parallel during the opening period, core platform and first waves next, depth services in parallel where selected, and completion/handover without allowing the final quarter to taper. The customer plan must show concurrency explicitly and treat customer receiving capacity and change windows as constraints.

## Scope boundary

The entitlement funds services, not hardware, licensing, or customer labor. Greenfield work is conditional on separately funded hardware. The planner should express these as planning conditions rather than silently converting them into committed scope.
