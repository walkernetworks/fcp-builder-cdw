# Research Basis: Year 2 Service Roadmap

**Purpose.** This note records the product evidence used to replace generic second-year extensions with distinct post-foundation VCF service outcomes. It treats each item as a **planning recommendation**, not a committed scope, product entitlement, or delivery promise.

## Verified Findings

| Capability area | Verified VCF capability | Implication for a post-Year 1 service map |
|---|---|---|
| Fleet and lifecycle operations | VCF Operations provides fleet-level identity, certificates, tags, passwords, configuration-drift detection, capacity/cost insight, and lifecycle updates/upgrades. | Once Year 1 establishes the platform, operational model, lifecycle baseline, and dashboard, Year 2 can define **fleet operations onboarding**, **capacity-and-cost optimization**, and **lifecycle operating cadence** rather than repeating dashboard or certificate setup. [1] |
| Cloud automation | VCF Automation provides a catalog, policy and governance controls, infrastructure-as-code blueprints, tenant/content management, self-service network/security, and orchestration. | After Year 1 self-service catalog and Day-2 automation planning, Year 2 can progress to a **governed catalog launch**, **policy-as-code / blueprint factory**, and **tenant or project onboarding**, where confirmed customer priorities support those activities. [2] |
| Security operations | VCF Security Operations provides a centralized view of security posture across VMs, ESX hosts, and vSAN, while VCF security guidance calls out compliance checks, drift detection, lateral-security controls, recovery, and policy enforcement. | After Year 1 segmentation and security-policy design, Year 2 can progress to **security posture operationalization**, **micro-segmentation rollout waves**, and **compliance/drift remediation governance** instead of extending the original policy-design task. [3] [4] |
| Business and cyber resilience | VMware’s validated VCF solution documents management-component site protection and DR using VMware Live Recovery, including VCF Automation, VCF Operations, and fleet management. VCF security/resilience guidance also identifies non-disruptive tests and automated recovery workflows as relevant outcomes. | After Year 1 resilience design, Year 2 can plan a **recovery architecture decision**, **protection-policy and runbook implementation**, and **recovery exercise / operational handoff** only when a second site, recovery targets, and recovery tooling are confirmed. [4] [5] |
| Kubernetes and application platform | VCF Automation documents VKS cluster fleet management, policy management, data protection, reusable application-stack blueprints, and Kubernetes APIs. | A **Kubernetes platform pilot** and later **VKS fleet operationalization** are valid Year 2 candidates only when the detailed intake confirms Kubernetes. They follow Year 1 platform, network/security, catalog, and governance work; they should not appear for every customer. [2] |
| Private AI | VCF Automation documents private-AI services for GPU-enabled ML/RAG infrastructure, including data indexing, AI agent builder, and secure deployment capabilities. | A **private-AI platform discovery / pilot** is a gated Year 2 candidate only when private-AI is confirmed and GPU, data, governance, and security prerequisites are explicitly available. It should not be inferred solely from VCF deployment. [2] |

## Design Principles for the App

The second-year plan must start after the Year 1 operational adoption timeline. Each activity must name a Year 1 enabling service, carry a capability-specific rationale, and be suppressed unless the required detailed intake or environmental prerequisite exists. The sequence should therefore evolve from **operationalize**, to **scale/adopt**, to **optimize or validate**, rather than extend initial design or deployment work.

## Sources

[1]: https://www.vmware.com/products/cloud-infrastructure/vcf-operations "VMware Cloud Foundation Operations"
[2]: https://www.vmware.com/products/cloud-infrastructure/vcf-automation "VMware Cloud Foundation Automation"
[3]: https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/security-and-compliance/viewing-and-configuring-security-compliance/what-is-security-compliance.html "What is Security Operations in VCF?"
[4]: https://www.vmware.com/solutions/security "Security and Resiliency"
[5]: https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vvs/9-X/site-protection-and-disaster-recovery-for-vmware-cloud-foundation.html "Site Protection and Disaster Recovery for VMware Cloud Foundation"

## Additional Official Sources Identified

The official VCF 9 Kubernetes overview describes a unified platform for Kubernetes, while Broadcom’s VCF Private AI Services documentation and release material identifies the relationship between Private AI Services, vSphere Kubernetes, VCF Automation, and GPU-enabled workloads. These sources reinforce that Kubernetes and private-AI work are **conditional platform-service candidates**, not default follow-on work for every foundational VCF engagement. [6] [7]

[6]: https://blogs.vmware.com/cloud-foundation/2025/06/17/kubernetes-on-vmware-cloud-foundation-9-0-a-single-platform-for-all-workloads/ "Kubernetes on VMware Cloud Foundation 9.0"
[7]: https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vvs/1-0/private-ai-ready-infrastructure-for-vmware-cloud-foundation.html "Private AI Ready Infrastructure for VMware Cloud Foundation"

## Sequencing Evidence for Conditional Platform Services

| Candidate follow-on service | Why it follows the foundation rather than repeating it |
|---|---|
| VKS workload-zone and namespace pilot | VCF’s Kubernetes model uses vSphere Supervisor, governed self-service, workload zones, namespaces, policy/quota controls, and cluster management. A Year 2 pilot therefore follows completion of the platform, access, network, governance, and workload-domain decisions rather than repeating them. [6] |
| VKS fleet operations | The platform supports multi-cluster control, policy enforcement, lifecycle management, backup, recovery, and Day 2 governance. A service can move from an initial pilot to fleet operating practices only after an agreed Kubernetes operating model and initial supported workload. [2] [6] |
| Private-AI ready workload-domain pilot | The validated solution covers GPU-enabled workload domains, Kubernetes, capacity/scalability, backup/restore, and DR considerations. A Year 2 AI pilot must consequently be gated by confirmed GPU capacity, use case, data boundary, ownership, and governance—not attached automatically to every VCF plan. [7] |

[6]: https://blogs.vmware.com/cloud-foundation/2025/06/17/kubernetes-on-vmware-cloud-foundation-9-0-a-single-platform-for-all-workloads/ "Kubernetes on VMware Cloud Foundation 9.0"
[7]: https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vvs/1-0/private-ai-ready-infrastructure-for-vmware-cloud-foundation.html "Private AI Ready Infrastructure for VMware Cloud Foundation"

## Recommended Year 2 Service Map

The recommended map treats **Year 2 as Months 13–24**, immediately after the Year 1 operational adoption window. It is intentionally not another foundational delivery timeline. Each service is a recommended operating, scale, optimization, or pilot outcome, subject to the stated prerequisite and customer confirmation.

| Year 1 selected focus | Research-led Year 2 service | Distinct Year 2 outcome | Entry condition |
|---|---|---|---|
| Lifecycle and certificate ownership | **Lifecycle Operating Service** | Establish a repeatable lifecycle calendar, change governance, certificate ownership, and exception review. | An owner, change window, and supported upgrade path are confirmed. [1] |
| Observability | **Operations Intelligence Service** | Turn telemetry into service objectives, diagnostic patterns, and quarterly operational reviews. | Operational telemetry and an accountable operations team are available. [1] |
| Capacity and cost visibility | **Capacity and Cost Optimization Service** | Run rightsizing, forecast, and cost-governance cycles against established capacity data. | Capacity data, cost owners, and review cadence are confirmed. [1] |
| Custom operations dashboards | **Operations Dashboard Product Service** | Publish governed dashboards with support-team ownership, service measures, and review cadence. | Dashboards, data sources, and an ownership model are accepted. [1] |
| Identity/certificates/passwords | **Platform Identity Operations Service** | Operate identity, credential, and certificate hygiene with ownership, evidence, and exception procedures. | Privileged-access owners and approved operating procedures are confirmed. [1] |
| Event and incident integration | **Event-to-Incident Operations Service** | Integrate prioritized events into incident workflows with routing, escalation, and service-level reporting. | The ITSM/event target, severity model, and resolver groups are agreed. [1] |
| VM self-service catalog | **Governed Catalog Launch Service** | Launch a measured catalog for selected tenants with quotas, approval, and support ownership. | Catalog blueprints, tenancy rules, and support handoff are accepted. [2] |
| Infrastructure as code | **Blueprint Factory and Policy-as-Code Service** | Establish reusable blueprints, source control, policy controls, and release practices. | A source-control workflow, security review, and content owners are available. [2] |
| Day-2 automation | **Day-2 Automation Operations Service** | Operationalize priority remediation/maintenance automations with runbook and rollback controls. | Priority workflows, approval paths, and rollback owners are confirmed. [2] |
| Organization and policy governance | **Automation Governance Operating Service** | Run tenant, quota, policy, and exception governance as an ongoing service. | Tenant model, quota policy, and exception authority are confirmed. [2] |
| Application platform provisioning | **Application Platform Onboarding Service** | Onboard a first application team using governed blueprints and a supported delivery path. | A sponsored workload, app team, and service support model are confirmed. [2] |
| Segmentation and security policy | **Segmentation Rollout Wave Service** | Apply and tune segmentation in prioritized workload waves with outcome review. | Wave scope, application dependencies, and change authority are confirmed. [3] [4] |
| Identity and RBAC design | **Access Governance Operations Service** | Operate access reviews, role recertification, and privilege exceptions. | Role owners, review cadence, and evidence requirements are confirmed. [3] |
| Hardening and compliance controls | **Continuous Compliance Evidence Service** | Establish drift/remediation workflow and usable compliance evidence for control owners. | Control baseline, evidence consumer, and remediation authority are confirmed. [3] [4] |
| Recovery architecture | **Recovery Service Readiness and Onboarding** | Implement the service operating model for a selected protected workload set. | Recovery targets, secondary-site/tooling decision, and RTO/RPO are confirmed. [4] [5] |
| Recovery exercises and runbook | **Recovery Exercise Program** | Execute recurring, non-disruptive recovery exercises and improve runbooks. | A tested runbook, owners, and agreed exercise scope exist. [4] [5] |
| Cyber-recovery design | **Cyber-Recovery Minimum Viable Service** | Pilot an isolated recovery capability with operational entry/exit criteria. | Business sponsors, recovery data policy, and an isolated-recovery design are confirmed. [4] [5] |
| Workload domain/Supervisor design | **VKS Workload-Zone and Namespace Pilot** | Onboard a governed Kubernetes pilot with namespaces, quota, policy, and an initial workload. | Supervisor/workload-zone design, network/security, and a sponsored workload are confirmed. [6] |
| Kubernetes platform operations | **VKS Fleet Operations Service** | Establish cluster lifecycle, fleet visibility, policy, data-protection, and support ownership. | A supported cluster estate and Kubernetes operating model are accepted. [2] [6] |
| Developer experience and guardrails | **Developer Platform Golden-Path Pilot** | Provide a governed self-service path for a first development team, including deployment controls. | An application team, GitOps/deployment workflow, and platform support model are confirmed. [2] [6] |
| GPU capacity readiness | **GPU Workload-Domain Readiness Service** | Validate the capacity, performance, backup/restore, and DR posture for an approved GPU workload domain. | GPU hardware, workload profile, sizing evidence, and capacity owner are confirmed. [7] |
| Private-AI guardrails | **Private AI Governance and Data-Boundary Service** | Define data access, model, security, audit, and operating guardrails for a candidate use case. | A business use case, data classification, security owner, and governance authority are confirmed. [7] |
| Private-AI pilot onboarding | **Private AI Pilot Onboarding Service** | Onboard one approved pilot with success metrics, support ownership, and exit criteria. | The use case, data boundary, GPU/platform readiness, and support model are approved. [7] |
