# VCF 9.1 and RVTools Product Design Rationale

## What VCF is

VMware Cloud Foundation is a private-cloud platform that combines compute, storage, networking, security, lifecycle management, operations, automation, and application-facing consumption services. VCF 9.1 architecture guidance spans fleet deployment and sizing, workload domains, vSphere Supervisor, network consumption, load balancing, recovery, identity, storage, NSX, physical networking, private AI, and vDefend.[1]

That breadth matters for this application: **an RVTools export can describe parts of the current VMware estate, but it cannot prove that the full environment is ready for VCF 9.1**. The app must distinguish observed inventory from architectural decisions and human validations.

## What “Functional Consumption Plan” means here

Public Broadcom and VMware materials describe VCF consumption in terms of application teams consuming governed infrastructure and services—such as virtual machines, networking, Kubernetes, data protection, and extensible platform services—through a unified private-cloud experience.[5] Public sources do not define “Functional Consumption Plan” as a standardized Broadcom product artifact.

> **Working product definition:** A Functional Consumption Plan is a phased, customer-specific plan for turning owned VCF entitlement and the current VMware estate into usable platform capabilities and operating outcomes.

The FCP should answer a short set of practical questions: **What is owned? What is running now? What must be validated or remediated? Which capabilities should be consumed? In what sequence? By what dates?** It is not a low-level design, formal HCL certification, licensing determination, or automated deployment plan.

## What RVTools can provide

Microsoft documents RVTools worksheets that expose stable inventory families. `vInfo` contains VM identity, power state, vCPU, memory, storage, and configured operating-system fields. `vHost` contains host, cluster, datacenter, CPU, memory, NIC, ESXi version, vendor, model, and UUID information. `vDatastore` contains datastore type, host count, capacity, provisioned, and used-capacity information. Other sheets can surface snapshots, partitions, devices, VM networks, and distributed-port settings.[2]

| App output | RVTools-observable basis | Treatment |
|---|---|---|
| Estate scale | VM, host, cluster, datacenter and datastore rows | Aggregate and deduplicate across files. |
| Entitlement planning signal | Observed physical host cores | Compare with the user-confirmed entitled-core amount; do not label it a licensing verdict. |
| Software lifecycle signal | ESXi version distribution | Flag 9.1, 8.x, 7.x-or-older, and unknown groups; require formal path validation. |
| Capacity pressure | Datastore capacity and used values | Surface aggregate utilization and high-utilization attention. |
| Operational hygiene | Snapshot and host-state observations where present | Present as attention items, not deployment blockers. |
| Hardware lookup list | Host vendor, model, CPU and version | Prepare a verification list; never self-certify compatibility. |
| Source traceability | Filename, size, parsed worksheet names and warnings | Store metadata without retaining raw workbook content. |

RVTools does **not** replace the VCF 9.1 Planning and Preparation Workbook, Configuration Maximums, Ports and Protocols, or formal design activities. Broadcom’s planning guidance covers workload domains, identity broker, vSphere Supervisor, VCF Automation, fleet sizing, prerequisites, and the dynamic environment specification.[3]

## VCF 9.1 readiness boundary

Broadcom’s VCF 9.1 bill of materials identifies the platform component set, including ESX 9.1, vCenter 9.1, NSX 9.1, and VCF Installer/SDDC Manager 9.1, and requires controlled component sequencing.[4] A version string from RVTools is therefore a **lifecycle signal**, not proof of a supported upgrade path.

Broadcom maintains the VMware Compatibility Guide as the authority for supported server and component configurations.[4] RVTools can populate a useful model/version lookup list, but it cannot certify firmware, drivers, storage controllers, NICs, vSAN ReadyNode status, or the full server configuration.

| Readiness area | App may assess | App must label unknown or externally validated |
|---|---|---|
| Inventory completeness | Required worksheet presence and parser warnings | Whether the export covered every vCenter or disconnected asset. |
| Estate scale | Aggregate VMs, hosts, clusters, storage and cores | Workload dependencies and migration-wave business constraints. |
| ESXi lifecycle | Observed major/minor version groups | Supported upgrade/import path for the full VCF BOM. |
| Capacity | Aggregate observed datastore use | Final sizing, growth, resilience and failure-domain design. |
| Hardware | Vendor/model/CPU lookup list | HCL, firmware, driver, controller, NIC and ReadyNode certification. |
| Platform prerequisites | User-confirmed hardware status and target dates | DNS, NTP, VLAN/IP capacity, BGP, identity, certificates, rack, power and cabling. |
| Capability sequence | Deterministic recommendation based on chosen outcomes | Detailed design, implementation procedure and change approvals. |

## Resulting product workflow

The research supports a four-step experience. First, the SA selects one or more RVTools exports and the browser locally calculates duplicate-aware aggregates. Second, the SA confirms only customer identity, entitlement, desired outcomes, hardware availability, exceptions, and dates. Third, transparent local rules build an editable sequence. Fourth, the SA reviews and exports a synchronized FCP.

Raw workbooks remain in browser memory and are not uploaded. The application stores only the aggregate facts required to reproduce the plan. No AI or external compatibility lookup is required.

## References

[1]: https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/design/vmware-cloud-foundation-concepts.html "Broadcom TechDocs — VMware Cloud Foundation Concepts and Architectural Options"

[2]: https://learn.microsoft.com/en-us/azure/migrate/tutorial-import-vmware-using-rvtools-xlsx?view=migrate "Microsoft Learn — Import VMware Servers Using RVTools XLSX"

[3]: https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/planning-and-preparation.html "Broadcom TechDocs — VCF 9.1 Planning and Preparation"

[4]: https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/release-notes/vmware-cloud-foundation-9-1-0-0-release-notes/vmware-cloud-foundation-bill-of-materials.html "Broadcom TechDocs — VMware Cloud Foundation 9.1 Bill of Materials"

[5]: https://blogs.vmware.com/cloud-foundation/2025/06/17/unified-cloud-consumption-experience-with-vcf-9-0/ "VMware Cloud Foundation Blog — Unified Cloud Consumption Experience with VCF 9.0"

[6]: https://compatibilityguide.broadcom.com/ "Broadcom — VMware Compatibility Guide"
