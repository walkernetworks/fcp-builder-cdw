# Hours model v2: open questions

Questions the spec (`docs/FCP_Hours_Model_Rebuild.md`) leaves open, and the reading the code uses until each is answered. Where the spec was ambiguous, the code takes the conservative reading: the one that produces fewer hours. Each item names where to change it.

## Standing rule

Where a worked example in the spec cannot be reproduced from the Section 6 and 7 rules, the rules govern. Log the discrepancy here and proceed. Do not adjust coefficients to make an example land.

## Decided

| Question | Decision |
|---|---|
| Where buckets, dollars and the rate appear | Planner screens only (the entitlement fit panel on the hours screen). Customer documents show hours and buckets, never a rate or dollars. The Condensed FCP adds a Scope by Bucket table in hours. |
| Default blended rate | The existing rate card's Work Plan blended rate (`server/rateCard.ts`), with a per-engagement override (`estimateInputs.blendedRate`). |
| DFW and the NSX overlay | Spec wins. Under v2, segmentation and the SSP no longer pull the NSX overlay build onto the timeline, and no X5 is priced for a security outcome. The Building Blocks workbook still lists NSX Overlay Networking and NSX Edge Connectivity as required by DFW (Broadcom's dependency model). v1 plans are unchanged. `shared/fcp.ts` (`V2_NO_OVERLAY_PREREQUISITE`). |
| Sites | RVTools datacenter objects are vCenter inventory folders, not physical sites, so v2 never uses them as sites. Sites come from the planner (`estimateInputs.sites`) or the brief; the default is 1, listed as an assumption that names the RVTools count. Found when a 72-host estate with 24 datacenter objects priced design at 826 base hours. |
| Clusters | Greenfield, hybrid and design pathways size the new platform's clusters (`estimateInputs.targetClusters`, default one per 16 hosts), not the existing RVTools clusters, which are consolidated by the build. Converge, import and in-place keep the existing clusters. Found when 36 small existing clusters priced the storage adder at 288 and the overlay at 160. |
| The 7.8 worked example | The rules govern. The example used a flat ~1.28x loading, left DX unloaded, and called the leftover 26 hours the reserve. Under the rules: secondary 10% (20% on X11, X12, X16), PM 15% at engagement level, DX loaded at 1.15x, 8% reserve held out before filling. The spec's 7.8 table now shows the values the code produces. |

## Discrepancies logged under the standing rule

| Spec says | Rules give | Note |
|---|---|---|
| 7.8: E1 312, E2 374, reserve about 26 | E1 311.4, E2 55.2 (366.6 with E1), reserve 32, entitlement remaining 1.4 | Per-line values: DD 45.5, DX 23, A 103.7, C1 88.6, X4 50.6; X11 stages 1 and 2 33.1, stage 3 base 11.0, zones 1 and 2 5.5 each. |
| Section 1: greenfield 25 hosts within plus or minus 15% of v1 | -25% (base hours without waves) | v1 jumps from D2 to D4 exactly at 25 hosts; v2 is continuous. See `docs/hours-reference/hours-model-comparison.md`. |
| Section 1: greenfield 40 to 100 hosts 20 to 30% below v1 | -23%, -18% at 50 hosts, -22%, -23% | 50 hosts is just outside the range. |
| Section 1: greenfield 150 hosts about 55% below v1 | -49% | |
| Section 3 item 6: in-place 150 hosts, BUVM about 110 base | 125.5 with the default 10 clusters; 109.5 with 6 clusters | The spec assumed 6 clusters. The default is ceil(hosts / 16). |
| Section 3 item 7: small clean import 40 to 50 | 43.2 with NSX to deploy; 35.2 with NSX present | Depends on whether the NSX deploy adder applies. |
| Section 3 item 1: FILL_mig at 100 VMs about 89 | 87 | Within rounding of the spec's own arithmetic. |
| Section 1: greenfield totals | Migration-heavy plans rise | With 20 VMs per host, wave hours (FILL_mig) dominate above about 40 hosts, so whole-plan totals rise even where build lines fall, as the spec predicts for estates above about 300 VMs. |

## Open: conservative readings in use

### Pass 1 (scope)

1. **Security hardening and identity have no line in the spec.** `security:identity-rbac`, `security:hardening-compliance`, and security selected with no focus, without segmentation, are priced as vDefend stages 1 and 2 (24 base). v1 priced them at 36. `shared/hoursV2.ts`, X11 branch.
2. **Security Services Platform deployed once.** When malware prevention needs it, X12 carries the 24-hour deploy and X11 carries none; Security Intelligence alone puts the 16-hour deploy on X11. Security Intelligence counts as an X11 term, not an X12 feature (the spec lists X12 features as IDS/IPS, malware, NTA/NDR and identity firewall).
3. **Depth multiplier scope.** It applies to X2 to X16 and EF. The VCF Automation platform line (X_VCFA_platform) is not multiplied. Recovery lines (X10, X14) have no depth tier in the app, so they stay at 1.0.
4. **Design-only share** (25%) also applies to EF and the VCF Automation platform on design-only and undecided pathways, as v1 did.
5. **Discovery by area.** DX is dropped when Broadcom baselining was delivered, as well as with a prior assessment. The HCX area is added only when HCX is a purchased add-on (the v1 rule), not for every migration pathway.
6. **Multi-vCenter estates.** Hosts and clusters are split evenly across vCenters for C1 and each X1. The ELM break-up and NSX deploy adders on X1 are counted once, on the first vCenter (spec 7.5), although the section 6 formula reads per vCenter.
7. **The VCF upgrade (U3)** is added only when `estimateInputs.sourceIsVcf` is set (default no). Domains = 1 + workload domains.
8. **VVF converge** uses C1 without the NSX adder; extra vCenters on VVF are not imported (import is VCF only).
9. **Hybrid** is priced like greenfield (D plus migration waves), as in v1. Cohort-specific converge or import is not priced.
10. **Storage adder** (S_storage) applies only with a platform build (D or D_VVF).
11. **VPC with a distributed transit gateway** does not add the NSX overlay line. **VDS networking** (X7) is added only when no NSX line covers networking, as in v1.
12. **Private AI pilot onboarding** no longer adds the VM self-service line (v1 did). Only Private AI, Supervisor and VKS are priced. When the plan has no Kubernetes stages, the Supervisor and VKS hours sit on the Private AI stages.
13. **Defaults the spec does not give** (each listed on the plan as an assumption): 1 tenant org, 3 catalog items, 3 templates, 0 management packs, 1 dashboard and 1 event target when selected, 5 segments, 1 Edge cluster, 1 external VLAN, 1 tuning cycle, 1 recovery site pair, 1 recovery plan, 1 exercise and 1 IRE test when selected, 1 Supervisor, 1 VKS cluster, 0 GPU hosts, 1 model, 1 database engine, 0 database templates, 1 Avi cloud, 3 virtual services, 1 WAF policy, 0 tiered hosts, no existing NSX (from the 7.8 example), distributed transit gateway. `shared/hoursConfig.ts` (`defaults`).
14. **Source on 8.x** is read from the RVTools ESXi versions when present.

### Pass 2 (fit)

15. **Step 1 and step 9.** All DX areas fill in step 1, so step 9's "remaining DX areas" is empty. EF fills in step 9.
16. **In-place spine.** Every host change window fills in step 3 ("the minimum windows needed to clear vSphere 8 EOGS" is read as all hosts).
17. **Dated waves.** Only the first migration wave is assumed to have a date behind it (`estimateInputs.datedWaves`, default 1). The first wave carries the HCX setup and pilot and always fills in step 4.
18. **Operations Tier 1** (step 5) is the X4 base with the lifecycle and health modules, only when operations is selected and only the modules selected. Other Operations modules fill in step 6, after the other outcomes in the default order.
19. **Step 6 default order** when unranked: networking (X5, X6, X16, X7, X15), security (X11, X12), resilience (X10, X14), automation (VCF Automation platform, X2, X3, X13), Kubernetes (X9), Private AI (X8), then Operations modules. Each line follows the lines it requires.
20. **Stop rule.** The fill stops at the first whole unit that does not fit; smaller later units are not tried.
21. **Under-funded.** When the fillable hours are less than steps 1 to 5, the plan keeps the whole core in E1 (over the fund by the gap), puts nothing in E2, and shows the warning, rather than stopping mid-spine.
22. **Design share.** Applies only to an add-on with none of its Tier 1 units funded, at 25% of its Tier 1 value (uplifts excluded). Not applied to lines already priced as design only. Tried in fill order after the fill stops.
23. **Bucket C** is used only for outcomes the customer marked as wanted this year (`estimateInputs.wantThisYear`). No line in the catalog is a managed service or hardware-dependent, so "cannot cover" does not occur yet. "No owner" and "customer deferred" need an input that does not exist yet.
24. **Months remaining** is from today (or the entitlement start, if later) to the end of the term, unless the planner sets it.
25. **Entitled hours** from signed resource assignments, when recorded, replace the value divided by the rate (existing behavior).

### Output

26. **Customer documents.** Only the Condensed FCP shows hours, so it gets the Scope by Bucket table. The full FCP has no hours section and is unchanged.
27. **Stage hours rounding.** Stage tables round each role column separately, so the in-window total can differ from E1 plus E2 by a couple of hours.
28. **Planner placements.** Pinning a stage to the entitlement or the Two-Year Notional still applies, on top of the fit.
29. **"The three combinations in spec 7.8"** (the task's outcome sweeps). Read as the 7.8 outcome set (Operations lifecycle and health, segmentation, VM self-service) at Tier 1, Tier 2 and Tier 3.

## To validate with delivery data

See section 8 of the spec. The sweep (`pnpm exec tsx scripts/hours-sweep.mts`) regenerates the comparison after any coefficient change.
