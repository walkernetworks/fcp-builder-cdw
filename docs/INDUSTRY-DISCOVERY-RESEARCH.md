# Industry Discovery Template Research

## Purpose

This research informs reusable discovery prompts for the FCP Builder. The prompts are **guidance only**: they help an engagement team ask better questions, but they do not declare customer regulatory obligations, technical commitments, or selected VCF capabilities.

## Reusable Cross-Industry Workstreams

Broadcom/VMware guidance consistently frames VCF planning around modern private-cloud infrastructure, automated IaaS and service delivery, application-platform enablement, and secure, resilient operations. These themes support a common template baseline covering upgrade approach, lifecycle operations, observability, automation, self-service, security, disaster/cyber recovery, Kubernetes, and private AI.[1]

| Discovery theme | Suitable question focus | Planning boundary |
|---|---|---|
| Infrastructure modernization | What operational pain, hardware lifecycle, topology, or upgrade dependency must be resolved first? | Does not select an upgrade path without confirmation. |
| Automation and service delivery | Which catalog, API, infrastructure-as-code, or day-2 workflow has measurable value? | Does not assume a self-service program is desired. |
| Operations | Which teams need health, capacity, cost, security, or application views and which tools must integrate? | Does not assume a monitoring product or dashboard scope. |
| Security and resilience | What recovery, segmentation, access, evidence, or response objective is material to the customer? | Does not label a customer compliant or prescribe a control. |
| Application platforms | Which workload, developer, Kubernetes, or private-AI outcome merits discovery after foundation work? | Does not commit applications or pilots. |

## Healthcare and Life Sciences Template

A VMware hospital-as-a-service implementation example emphasizes consistent multi-site architecture, centralized operations, automated infrastructure workflows, integration with enterprise services, specialized application support, and knowledge transfer. The reusable template should therefore prompt for clinical/operational availability priorities, site consistency, operational handover, care-system integrations, imaging or specialized workload dependencies, and documented recovery objectives. It must not assert HIPAA, patient-data, or medical-device compliance without customer confirmation.[2]

## Financial Services and Insurance Template

VMware’s financial-services guidance highlights infrastructure-as-code, operational streamlining, security, resiliency, regulatory reporting needs, fraud/risk use cases, and modernization. The reusable template should prompt for change-control evidence, recovery and continuity objectives, audit/reporting needs, secure developer delivery, identity governance, fraud/risk supporting workloads, and operational telemetry. It must not label any plan compliant with a regulation or assume financial workload scope.[3]

## Distributed, Manufacturing, Retail, and Public-Sector Template

The general VCF use-case guidance identifies private cloud on-premises or at the edge, automated IaaS, lifecycle and fleet management, multi-tenancy, and security/resilience as common needs. A reusable template can therefore ask about location topology, remote/edge operations, standardized deployment patterns, local autonomy versus central governance, maintenance windows, service continuity, and integration boundaries. It must not assume store, plant, citizen-service, or sovereign requirements.[1]

## Digital-Native, Software, and Technology Template

The same guidance highlights self-service infrastructure, reusable blueprints, API and CLI consumption, Kubernetes, namespace and application-platform patterns, and private AI readiness. A reusable template can ask about developer personas, desired service catalog, pipeline/toolchain integrations, workload onboarding, platform SLOs, data boundaries, GPU/capacity posture, and bounded pilot hypotheses. It must not assume Kubernetes, AI, or developer platform delivery.[1]

## General Enterprise Template

The baseline template retains the cross-industry workstreams for engagements that do not require a vertical-specific lens. It asks teams to identify measurable operational outcomes, confirmed integration dependencies, recovery expectations, and decision owners before selecting detailed intake choices.

## References

[1]: https://blogs.vmware.com/cloud-foundation/2025/06/17/vcf-9-0-use-cases/ "VMware Cloud Foundation 9.0: Modernize Infrastructure, Accelerate App Delivery, and Strengthen Security and Resiliency"
[2]: https://blogs.vmware.com/cloud-foundation/2024/07/11/leveraging-vmware-cloud-foundation-for-hospital-as-a-service-success/ "Leveraging VMware Cloud Foundation for Hospital as a Service Success"
[3]: https://www.vmware.com/solutions/industry/financial-it-services "Transform Financial Services with VMware Cloud Foundation"
