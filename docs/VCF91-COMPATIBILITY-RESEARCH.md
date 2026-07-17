# VCF 9.1 Hardware Compatibility Research

**Research date:** July 17, 2026

## Authoritative sources

| Source | Relevant finding | Implementation implication |
|---|---|---|
| [VMware Cloud Foundation 9.1 Documentation](https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1.html) | The VCF 9.1 documentation exposes the Broadcom Compatibility Guide as an additional resource for product planning. | The FCP report should direct final certification decisions to the Broadcom Compatibility Guide (BCG), not claim an unsupported local model-only verdict. |
| [Verifying Compatibility for VCF Environments Powered by vSAN](https://blogs.vmware.com/cloud-foundation/2024/11/20/verifying-compatibility-for-vmware-cloud-foundation-environments-powered-by-vsan/) | The BCG is the single location to verify hardware compatibility. vSAN verification is narrower than general vSphere compatibility and depends heavily on storage devices and network communication. The BCG has discrete guides for servers, I/O, disks, controllers, and VCF/vSAN ReadyNodes. | An RVTools export can identify platforms and produce an evidence-based precheck, but cannot certify VCF or vSAN from vendor/model/CPU alone. The report must show what is observed and what remains to be verified. |
| [VCF 9.0 Server Certification](https://blogs.vmware.com/cloud-foundation/2026/02/25/vcf-9-0-server-certification-preserving-your-hardware-investment-and-giving-the-best-roi/) | Broadcom describes component-level factors such as CPU family, NIC/DPU/HBA, GPUs, storage controllers/devices, and firmware/driver combinations, as well as model-level certification. It defines BCG states including **VCF Supported**, **VCF Supported. Confirm w/ Vendor**, and an absent listing where core components may be end-of-service. | The local readiness model should use clear **verified candidate**, **review required**, and **unavailable evidence** states. It must distinguish a platform name from final model/configuration certification and identify missing evidence. |
| [Broadcom Compatibility Guide result for Dell PowerEdge R760](https://compatibilityguide.broadcom.com/detail?program=server&productId=55720&persona=live) | Public BCG search results identify a Dell PowerEdge R760 listing with the feature **VCF Supported**. A separate public BCG result identifies a Dell PowerEdge R760 vSAN OSA listing with **9.1 (vSAN 9.1)**. | R760 can be presented as a **VCF-supported platform candidate**, conditional on the exact installed CPU, I/O, storage, firmware, and driver configuration being matched in BCG and confirmed with Dell where required. |

## Limits of RVTools-only evidence

The parser currently observes server vendor, model, CPU model, host counts, and ESXi version. This is sufficient to identify the hardware platforms that need an official BCG check. It cannot establish a final VCF 9.1 support status without complete data for the installed CPU family/stepping, BIOS/firmware, NICs/DPUs/HBAs, storage controllers/devices, driver versions, and intended vSAN architecture. The report must therefore avoid calling any unverified platform fully compatible or incompatible.

For the detected R730 and R530 platforms, public static results did not yield release-specific BCG entries that can support a final automated verdict. They should be shown as distinct **review-required** platforms, with an explicit BCG/OEM validation action rather than an unsupported assertion.

## Product decision

The revised readiness report will state **VCF 9.1 Hardware Compatibility Precheck**. It will list every observed vendor/model/CPU platform and assign one of these local evidence states:

| State | Meaning |
|---|---|
| `candidate` | The observed platform has a documented public VCF/VCF 9.1 candidate signal. It still requires exact installed-configuration validation in BCG. |
| `review` | RVTools identified the platform, but the local evidence is insufficient for a release-specific certification result. BCG and OEM validation are required. |
| `unavailable` | RVTools did not provide the fields needed to identify a platform. The host record must be completed before compatibility can be assessed. |

The report will separately flag whether current ESXi version evidence is present; ESXi version alone is not treated as a VCF 9.1 hardware certification result.

## Planned sequencing correction

The generated FCP plan should not contain a generic “Consumption Plan” execution activity. It should begin delivery with **Upgrade Services**, with early **Plan** and **Design** work running in parallel where their dependencies permit. This leaves the FCP as the planning artifact rather than representing it as a delivery workstream.
