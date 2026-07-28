# VCF Implementation-Led Delivery Research

## Purpose

This note grounds the FCP timeline refresh in documented VCF 9 implementation workflows. It is used to replace prolonged generic design activities with conditional, delivery-oriented work. The plan must remain an indicative services plan; it must not represent unconfirmed customer scope as a commitment.

## Source-grounded delivery observations

| Source | Documented implementation implication | Timeline design consequence |
|---|---|---|
| Broadcom VCF 9.1 documentation map | VCF documentation is organized around design, planning, deployment/convergence/upgrade, infrastructure build, NSX, lifecycle, fleet management, and operations. | A credible plan needs an execution path beyond design: build, configure, onboard, operate, and hand over. |
| Broadcom VCF 9 deployment pathways | The VCF Installer deploys a new VCF instance or supports convergence; VCF 9 deploys the integrated compute, storage, networking, operations, and automation stack. VCF Operations is used to manage and lifecycle the stack. | Management-domain/fleet implementation and lifecycle enablement are primary delivery workstreams, not late-stage design tasks. |
| Broadcom VCF 9.1 workload-domain import guidance | Import work includes supported-configuration validation, FQDN/SSH prerequisites, certificate confirmation, NSX choice, prechecks, remediation, and a final controlled import. A new NSX Manager cluster can be deployed and eligible clusters prepared when no NSX registration exists. | Existing-estate onboarding should appear as executable prechecks, import/build, remediation, and workload-domain acceptance—not as generic discovery. |
| Broadcom VCF 9 deployment planning guidance | The management domain hosts core components and additional workload domains separate workloads. VCF supports new deployment, fleet expansion, convergence, and import pathways. | The plan must select one implementation path and model workload-domain build/import separately from management-domain deployment. |
| VMware Cloud Foundation Operations | Operations include fleet-level identity, certificate, password, tag, configuration, lifecycle, health, capacity, and troubleshooting management. | Operational enablement, lifecycle policy, monitoring/logging, runbooks, and service transition belong after platform build and before handover. |

## Recommended year-one delivery structure

| Window | Delivery workstream | Concrete service work | Gate / output |
|---|---|---|---|
| Weeks 1–2 | Mobilize and freeze the executable build plan | Kickoff; select deployment pathway; validate entitlement, hardware, DNS/NTP/IP, routing, VLAN/MTU, certificates, repositories, change windows, and rollback approach; approve the build specification. | Approved implementation plan and change schedule. No open-ended design activity continues beyond this point. |
| Weeks 3–4 | Implement the VCF management domain or convergence path | Prepare hosts and installer/depot; deploy or converge the management domain; deploy/reuse vCenter, NSX, VCF Operations, and VCF Automation; complete installer and component health validation. | Functional management domain/fleet foundation. |
| Weeks 4–6 | Implement VCF networking and NSX platform services | Configure physical-fabric dependencies; prepare transport; deploy/configure NSX Manager/transport nodes; deploy Edge capacity where required; establish T0/T1, segments, routing, DNS/NTP reachability, and connectivity tests. This is explicitly networking/NSX work, not VDefend scope. | Tested platform connectivity and approved network-service handover. |
| Weeks 5–8 | Build or import workload domains | Create a new VI workload domain or execute the selected import pathway; run platform prechecks; remediate blockers; configure compute/storage policies; prepare NSX where applicable; establish image/lifecycle baseline. | Workload domain ready for controlled onboarding. |
| Weeks 7–10 | Onboard workload services and execute migration waves | Create landing-zone resources; migrate/rehost selected workload cohorts or onboard imported clusters; complete cutover, validation, rollback readiness, and exception tracking. This work stays conditional on confirmed migration scope. | Accepted workload wave(s) and documented residual backlog. |
| Weeks 8–11 | Operationalize the platform | Configure identity/roles, certificate and password ownership, tagging/configuration standards, lifecycle/repository practices, monitoring/logging integrations, capacity/cost views, and service catalog/automation where selected. | Operational service model and day-two control set. |
| Weeks 11–12 | Service transition and hypercare | Complete operational runbooks, knowledge transfer, support escalation model, lifecycle cadence, hypercare issue management, and exit review. | Accepted handover and prioritized continuous-improvement backlog. |

## Modeling rules for the FCP

1. Limit Plan and Design activities to a two-week duration at the beginning of the operational timeline.
2. Use explicit build verbs after Week 2: deploy, converge, configure, create, import, prepare, migrate, validate, operationalize, transition, and hand over.
3. Keep workload migration conditional. A new VCF deployment may build a workload domain but not migrate customer workloads unless a migration objective is confirmed.
4. Keep NSX and VCF networking separate from security services; only add security/resiliency work when selected independently.
5. Represent workload-domain implementation as a choice between **create/build** and **import/converge**, rather than scheduling both as committed work.
6. Put operating-model definition, runbooks, lifecycle ownership, and service-transition work after usable platform services exist; do not leave them as ongoing design placeholders.

## References

1. [VMware Cloud Foundation 9.1 Documentation](https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1.html)
2. [Planning a Successful VMware Cloud Foundation 9.0 Deployment](https://blogs.vmware.com/cloud-foundation/2025/07/28/planning-a-successful-vmware-cloud-foundation-9-0-deployment/)
3. [Deployment Pathways for VMware Cloud Foundation 9](https://blogs.vmware.com/cloud-foundation/2025/07/03/vcf-9-0-deployment-pathways/)
4. [Import an Existing vCenter to Create a Workload Domain](https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/building-your-private-cloud-infrastructure/working-with-workload-domains/import-an-existing-vcenter-to-create-a-workload-domain.html)
5. [VMware Cloud Foundation Operations](https://www.vmware.com/products/cloud-infrastructure/vcf-operations)
