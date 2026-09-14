# Compatibility Handoff Redesign

## Objective

The compatibility subsystem must account for every imported host and give delivery teams an explicit disposition. It must not imply that every host can be automatically certified from RVTools, but it must never end with an unexplained generic disclaimer. Each cohort receives a release-specific support result, evidence quality, source provenance, unresolved data, and a required delivery action.

## Authoritative Source Hierarchy

| Priority | Source | Role | Automation posture |
| --- | --- | --- | --- |
| 1 | Broadcom VMware Compatibility Guide | Authoritative ESXi system and component certification by release | Use a maintained versioned snapshot for deterministic import-time assessment; link every matched product record to the live guide for final delivery validation |
| 2 | OEM compatibility matrix | Firmware, driver, image, and OEM support detail | Query a documented public API when available, such as Cisco UCS HCL; otherwise provide a source-specific validation link and action |
| 3 | RVTools | Observed server, CPU, ESXi, cluster, NIC, storage, and VM evidence | Parse locally and deterministically; treat missing fields as evidence gaps rather than passing results |
| 4 | Delivery confirmation | NIC/HBA/controller, firmware, driver, image, vSAN/ReadyNode, topology, and exception approval | Track as explicit handoff actions because RVTools and server-level matrices cannot establish complete configuration certification |

The bundled Broadcom server snapshot currently contains 3,423 rows across 74 manufacturers and covers ESXi 9.0 and 9.1. The largest represented vendors include Lenovo, Supermicro, Dell, HPE, Cisco, Fujitsu, and Fsas. A model absent for a target release is **not officially supported for that release**, but the tool should state whether the cause is a confirmed model match with no target-release row, an unresolved identity, incomplete CPU evidence, or stale source coverage.

## Cohort Evidence States

| State | Meaning | Delivery disposition |
| --- | --- | --- |
| `verified-supported` | Exact or deterministic model and CPU pairing is listed for the selected target release | Proceed to component, firmware, image, storage, and topology validation |
| `verified-not-listed` | Model and CPU identity are established, but the target release is absent from the authoritative matrix | Hold the cohort; retain the last verified release or refresh/repurpose hardware |
| `explicit-exclusion` | A release-specific authoritative matrix or policy identifies a supported-through and unsupported-from boundary | Do not adopt the excluded release on the cohort; plan refresh or alternate placement |
| `cpu-evidence-required` | Server model is listed, but the imported CPU cannot be resolved to a certified series | Collect CPU identity and compare it with the linked product record |
| `identity-confirmation-required` | A likely model candidate exists, but vendor/model normalization is ambiguous | Confirm OEM model identity before the platform gate |
| `catalog-record-required` | No reliable model candidate exists in the maintained catalog | Obtain OEM/Broadcom evidence; do not treat absence as a pass |
| `source-refresh-required` | The target release is newer than the catalog’s captured release scope | Refresh the compatibility source before making a release decision |
| `conflicting-evidence` | Broadcom and OEM sources disagree or describe different support scopes | Escalate the conflict and record the approved interpretation |

## Evidence Model

Every compatibility cohort must carry:

- Observed vendor, model, CPU, ESXi releases, host count, clusters, and representative host names.
- Canonical vendor/model identity, match method, confidence, candidate models, and product IDs.
- Selected target ESXi/VCF release plus an evaluated release-support matrix for every release in the maintained catalog.
- Primary Broadcom source, optional OEM source, captured/checked timestamps, and evidence age.
- Current-estate posture, target-release disposition, future-release boundary, confidence, and certification boundary.
- Missing evidence, required action, recommended owner, gate condition, and consequence if unresolved.

## Presales-to-Delivery Handoff

The workspace and both deliverables must lead with counts, not long host lists:

| Section | Required content |
| --- | --- |
| Estate posture | Total hosts accounted for, current ESXi versions, target release, supported hosts, blocked hosts, and unresolved hosts |
| Release support | Cohorts verified for the target, cohorts not listed, explicit later-release exclusions, and source freshness |
| Gaps | Missing identity, CPU, NIC/HBA/controller, firmware/driver, OEM image, storage/vSAN, and topology evidence |
| Delivery actions | Owner, action, affected hosts, release gate, and completion evidence required |
| Evidence register | Cohort-level source links and timestamps with host-level detail behind disclosure or appendix |

The main FCP should summarize the estate disposition and actions that affect service scope or sequencing. The standalone compatibility deliverable should contain the complete cohort evidence register, release matrix, gaps, and delivery action register. Both documents must reconcile to the same host count and assessment data.

## Selected Architecture: Maintained Verified Catalog

Customer imports never depend on live vendor availability. Every assessment uses the committed Broadcom server catalog identified by its capture date, source, record count, release scope, and manufacturer count. A matched cohort preserves the product record links, model/CPU match method, confidence, per-release listing result, and additional configuration evidence delivery must still collect. An unresolved identity remains an evidence gap; it is never presented as either supported or unsupported.

## Controlled Catalog Refresh Workflow

1. Acquire the new server-system dataset from the authoritative Broadcom Compatibility Guide process and retain its source URL and capture timestamp.
2. Transform it into the existing immutable catalog tuple contract without changing historical customer documents.
3. Update `HCL_SNAPSHOT.capturedAt` and `HCL_SNAPSHOT.reportedCount`, then run `pnpm catalog:validate`.
4. Review the manufacturer count, release-mask counts, duplicate identities, invalid product records, and any records removed from the prior catalog.
5. Run the full regression suite and the representative Dell, HPE, Lenovo, Cisco, Supermicro, unknown-identity, CPU-mismatch, and explicit-exclusion fixtures.
6. Render the compatibility handoff for representative customer estates and confirm total-host reconciliation, source links, release matrices, evidence gaps, and action ownership.
7. Publish the catalog and application changes in one checkpoint. Roll back that checkpoint if any post-release validation fails.

The catalog is never replaced silently. Existing saved engagements retain their assessed catalog metadata until their compatibility assessment is explicitly refreshed from the current inventory, making evidence provenance auditable across presales and delivery.

## References

[1]: https://compatibilityguide.broadcom.com/ "Broadcom VMware Compatibility Guide"
[2]: https://knowledge.broadcom.com/external/article/378798/esxi-support-for-hardware-not-listed-in.html "Broadcom KB 378798 — ESXi Support for Hardware Not Listed in VMware Compatibility Guide"
[3]: https://ucshcltool.cloudapps.cisco.com/public/ "Cisco UCS Hardware and Software Compatibility"
[4]: https://www.dell.com/support/manuals/en-us/vmware-esxi-8.x/vmware_8.x_compmatrix_pub/overview "Dell PowerEdge VMware ESXi Compatibility Matrix"
[5]: https://lenovopress.lenovo.com/osig "Lenovo OS Interoperability Guide"
[6]: https://serverproven.lenovo.com/ "Lenovo ServerProven"
[7]: https://www.supermicro.com/en/support/os-compatibility-certification "Supermicro OS Compatibility and Certification Matrix"
