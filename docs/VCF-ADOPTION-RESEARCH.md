# VCF Adoption Planning Research

## Purpose

This note records the authoritative product guidance used to shape the detailed, customer-confirmed adoption intake. It deliberately informs discovery prompts and plan sequencing without claiming that a customer has selected, purchased, or implemented any capability.

## Research findings

| Planning area | Authoritative guidance | Design implication for FCP Builder |
|---|---|---|
| Environment specification | Broadcom’s VCF 9.1 planning guidance directs administrators to size the environment and create a specification covering required software, tools, and external services. Its VCF Planning and Preparation Workbook gathers inputs for workload domains, identity broker, vSphere Supervisor, and VCF Automation. | Intake should capture the intended deployment path, target workload domains, identity integration, and application-platform ambitions before creating detailed work. |
| Automation | Broadcom describes VCF Automation as a policy-governed self-service private cloud for AI, Kubernetes, and VM-based applications. Its documented capabilities include cloud services, provider management, organization management, and vSphere Supervisor. | Automation discovery should distinguish VM catalog/self-service, infrastructure-as-code and day-2 automation, organization/project governance, and application-platform provisioning instead of using a single generic “automation” choice. |
| Fleet and lifecycle operations | VMware’s VCF Operations guidance describes fleet management, centralized identity, certificate and password management, and lifecycle management as core operational areas. | Upgrade and operations intake should differentiate target upgrade/converge approach, lifecycle cadence, identity/certificate priorities, and ownership model. |
| Observability and dashboards | The VCF Operations guidance describes health and diagnostics, storage operations, network operations, integrated logs, and Management Pack Builder dashboards, alerts, and metrics. | Operations discovery should clarify whether the customer prioritizes health monitoring, log investigation, capacity/cost, storage/network visibility, or custom dashboards and third-party management packs. |
| Migration and resilience | VCF Operations guidance describes migration planning as scope/dependency discovery, phased migration waves, and resource-aware execution. | Upgrade discovery should establish whether the engagement includes in-place upgrade, converge, migration waves, or a limited design-only path. Resilience work should ask separately about recovery exercises and cyber-recovery priorities. |

## Sources

1. Broadcom TechDocs, [VMware Cloud Foundation 9.1: Planning and Preparation](https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/planning-and-preparation.html), accessed July 17, 2026.
2. Broadcom TechDocs, [VCF Automation Overview](https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-0/overview-of-vmware-cloud-foundation-9/what-is-vmware-cloud-foundation-and-vmware-vsphere-foundation/vcf-automation-overview.html), accessed July 17, 2026.
3. VMware Cloud Foundation Blog, [Operations in VMware Cloud Foundation 9.0: The Modern Way to Build and Manage Your Private Cloud](https://blogs.vmware.com/cloud-foundation/2025/06/17/modern-infrastructure-operations-vcf-9-0/), accessed July 17, 2026.
