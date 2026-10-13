# Compatibility rules from the VCF 9.1 corpus

The checker's server list (`shared/hclCatalog.ts`, captured 28 Jul 2026) only says whether a server model and CPU series pairing is listed for ESXi 9.0 or 9.1. The rules below come from the VCF 9.1 TechDocs corpus that the vcf-corpus-refresh skill maintains, imported into `shared/vcfCorpus.ts` with `pnpm corpus:import "<folder>"`. Broadcom statements govern; partner statements are advisories.

| Rule | Source in the corpus | Effect |
|---|---|---|
| A CPU series not listed for the target release, or Discontinued for VCF 9.x, blocks the host whatever the server model | Compatibility Guide CPU list (13 Aug 2026), KB 318697 | Status not supported; counted as blocked |
| A server model from a known vendor that is missing from the 9.x server list is not listed, not unknown | Server list | Status not supported |
| A Deprecated CPU (Skylake-SP, Cascade Lake, EPYC 7001/7002 and others) runs 9.x and must be replaced before the next major release; Skylake-SP needs the OVERRIDE procedure | KB 318697, KB 428874 | Supported, with an end of support and a warning |
| A host build released after the target's first release (8.0 U3j, U3k and later) needs a later target to upgrade or converge; import works on either | releases.json, KB 450972, KB 454369 | Warning; the FCP target becomes 9.1.1 |
| ESXi 7.x hosts are past end of general support and must reach 8.0 first | KB 415405 | Warning |
| NICs on the qfle3 driver (QLogic BCM57810) | KB 442745 | Blocker; confirm the card model |
| Adapters on the brcmfcoe driver | KB 391170 | Warning; the end-of-life list is a KB attachment not in the corpus |
| QL45xxx FCoE adapters on the qedf driver | KB 444031 | Advisory: build the image with the vendor async driver |
| HPE ProLiant custom images; Cisco images and firmware | KB 452689, KB 442436 | Advisory |
| Partner lists that stop short of Broadcom's (for example Dell 14G at ESXi 8.0) | vendor-compat.json | Advisory |
| Boot device of at least 128 GB; USB or SD boot needs a persistent OSDATA device | KB 317631 | Coverage gap: RVTools does not report the boot device |

Not added, because the corpus does not support it:

- **vDS 8.0 before a converge.** The corpus describes the vDS upgrade as optional after the ESX and vCenter upgrades. The existing check (vDS 7.0 or later) stays.
- **The KB 391170 device lists.** They are attachments the corpus does not hold, so only brcmfcoe is named, as a warning to check.

The server list itself is still the 28 Jul 2026 capture; the corpus has no server rows. A newer server capture replaces `shared/hclCatalog.ts` as before.
