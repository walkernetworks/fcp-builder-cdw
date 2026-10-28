# FCP Builder Hours Model Rebuild

## Researched Recommendations for VCF and VVF Delivery Lines (VCF 9.1) with Entitlement Burn-Down Rules

The current model is roughly right for small, single-site greenfield builds and wrong almost everywhere else. It prices by host brackets where the public evidence points to topology (instances, workload domains, clusters, vCenters, sites) and per-unit work (VMs per wave, protected VMs, segmentation zones and applications). It prices “Bring Under VCF Management” as a greenfield deploy when VCF 9 does that job with converge and import. It has no line at all for the VCF 5.x to 9.x upgrade, which is the biggest effort driver in in-place engagements. And it fits a plan to an entitlement by inflating migration waves, which inverts estimating.

TL;DR. Swap the host brackets for formulas driven by topology. Fix the three structural errors in in-place and import pricing (converge plus import instead of a greenfield deploy, a dedicated VCF upgrade line, waves that scale with VMs). Scale the add-ons by their real units and make depth tiers a multiplier. Then fit the plan to the entitlement by sequencing scope into four buckets, never by compressing estimates. Broadcom publishes no service hours, so most coefficients are Medium or Low confidence and are labeled as judgment where they are.

# 1. One-page summary: the biggest changes and why

What the public evidence actually supports. Broadcom does not publish hours for its VCF services. The VCF Services Entitlement SPD (November 2024) says only that an initial allocation for baselining cloud maturity, implementation architecture, capability roadmap and adoption plan is deducted first, that any further redemption goes in a Transaction Document specifying scope, estimated effort and the value to be deducted, priced at VCF Services Entitlement Rates, and that the entitlement can only be used within the initial 12 months. The VMware Pro Cloud Services brief (August 2026) lists scope (design, deploy, vDefend SSP, Avi WAF, VKS, Private AI, converge, upgrade, cyber recovery) with no durations. The best published partner analog is Presidio’s VCF Deployment QuickStart: a remote, single-site greenfield build of up to 10 hosts with 1 Tier-0, 1 Tier-1, up to 5 segments, VCF Operations (up to 4 vCenter data sources) and VCF Automation (up to 4 cloud accounts, 1 demo blueprint), with SKU-based add-ons for 10-node expansion blocks and 4-week resident engineer blocks. Presidio’s AVS QuickStart base includes one migration cutover event of up to 50 VMs, with add-ons for 50 more VMs and extra after-hours cutover events of up to 8 hours, plus SRM per 50 protected VMs. These are the clearest public signals of how partners actually scope this work: a base plus per-unit blocks, not host brackets.

The ten changes that matter most, in order of dollar impact:

- Replace “Bring Under VCF Management” (BUVM) with converge plus import. VCF 9 converges an existing vCenter into a management domain with the VCF Installer and imports each further vCenter as a workload domain from VCF Operations, with no workload migration. Pricing this as D8 makes the 150-host BUVM stage 346 loaded hours. The recommended converge formula gives about 100 to 130 base hours at that size, a reduction of about 55 to 65%.

- Add a VCF 5.x to 9.x upgrade line (new U3). The ITQ upgrade guide, checked against Broadcom’s VCF Upgrade Planner for target 9.1.0.0400, describes a core spine of 9 phases and 10 steps: VCF Operations, SDDC Manager, Management Services and License Server, VCF Automation, NSX, vCenter, ESX, NSX finalize, then version verification. With optional components it expands to 15 phases and 17 steps. A practitioner reference puts one VxRail management plus workload domain pair at roughly 80 hours end to end. Today the model has no line for this.

- Rebuild FILL as a formula. Migration FILL = HCX setup + per-VM planning + per-wave execution, with waves = ceil(VMs / 150). In-place FILL = per-change-window effort + per-host attended time. The HCX defaults in Broadcom KB 321604 (300 concurrent migrations per Manager, 200 per Service Mesh, 1 Gbps per migration workflow, 1.6 Gbps per IX appliance) along with the serial switchover behavior of Replication Assisted vMotion justify a 150-VM wave planning size. Remove the “grow to entitlement” rule. Section 7 replaces it.

- Make D continuous. Use management domain base + per instance + per workload domain + per cluster + per host. This removes the 75-hour jump at 25 hosts (D2 135 to D4 210) and the D8 catch-all.

- Make design (A) topology-driven, not host-driven. Hosts barely change design effort. Sites, instances, workload domains, stretched clusters and storage types do.

- Cut discovery (DD) at the top end and remove the jumps. Tool-led discovery (RVTools, VCF Operations) scales sub-linearly with hosts. DD3 at 200 hours is not supportable for a single-instance estate. Also check whether Broadcom’s initial baselining allocation already covered discovery.

- Decouple vDefend from NSX overlay. The distributed firewall is instantiated on each vNIC. Broadcom’s DFW 1-2-3-4 journey (assessment, shared infrastructure services, zones, applications) says a typical Zero Trust deployment can be rolled out in a few weeks. Price segmentation by zones and applications, and do not add X5 80 to every security outcome.

- Split shared platform hours from per-unit hours in the add-ons. VCF Automation is deployed once (about 3 hours of machine time in a 9.1 lab), but X2 and X3 each carry 70 hours. The fix is one platform line plus consumption modules.

- Make depth tiers a multiplier. Tier 1 Deployed x1.0, Tier 2 Operationalized x1.25, Tier 3 Business consumption x1.6, applied to add-on lines only. This is judgment, but it matches Broadcom’s own framing that adoption is measured by operational outcomes rather than installation.

- Fix the role split. Replace the PM rate of 25% of technical hours (which makes every line about 1.44x base) with PM = 15% of technical hours, with a 24-hour floor on build engagements and 8 hours on design-only. Make the secondary technical role line-specific (10% default, 20% for VPC and vDefend).

Net effect (judgment, base hours, no outcomes, 1 site, discovery in scope): small greenfield builds (8 to 25 hosts) stay within plus or minus 15% of today. Mid-size builds (40 to 100 hosts) drop 20 to 30%. 150-host single-instance builds drop about 55%. In-place VCF engagements rise once the U3 upgrade and prerequisite remediation lines are added, then fall once BUVM becomes converge. Migration-heavy engagements above about 300 VMs rise substantially because wave hours finally scale.

# 2. Tables by section

Assumptions for all conversions: 8 hours per day, 40 hours per week, 1 lead resource unless stated. Machine time (installer runtimes) is not effort. Where it is used, it is only to bound attended time.

## 2a. Platform lines (A, D, EF)

| Line | Current base | Recommended (base hours) | Driver variables | Confidence | Key source |
|---|---|---|---|---|---|
| A1 to A4 Architecture and design | 75 / 100 / 165 / 230 by hosts and sites | A = 64 + 16 per WLD + 24 per extra instance + 32 per extra site + 24 per stretched cluster + 8 per extra principal storage type + 0.25 x max(0, hosts minus 32), capped at +40 | Instances, WLDs, sites, stretched clusters, storage types, hosts (minor) | Low (judgment) | Presidio VCF QuickStart scope; Broadcom VCF Solution Architecture and Design course scope |
| D1 to D8 Platform deploy (VCF) | 90 to 410 by brackets | D = 64 management domain + 16 handover + 40 per extra instance + 24 per WLD (+8 if dedicated NSX) + 8 per extra cluster + 24 per stretched cluster + 0.75 per host for the first 64 hosts + 0.5 per host above 64 | Instances, WLDs, clusters, hosts, stretched clusters | Medium-Low | Presidio QuickStart (10-host base, +10-host add-on blocks); VCF 9.1 bring-up runtime 2 to 6 hours across practitioner reports |
| D (VVF build) | D1/D2 | D_VVF = 40 + 16 handover + 8 per extra cluster + 0.75 per host | Clusters, hosts | Low (judgment) | VVF FAQ (VCF Installer deploys VVF components) |
| Storage adder (new) | None | vSAN ESA/OSA: +0. FC or NFS principal storage: +8 per cluster. Stretched vSAN: in the stretched-cluster term. Mixed principal storage: +8 | Storage type per cluster | Low (judgment) | Converge and import require a shared writable datastore and support vSAN, VMFS-FC and NFS; vVols deprecated in 9 |
| EF Efficiency, memory tiering | 20 | EF = 12 + 0.25 per host in tiered clusters | Hosts with NVMe tiering | Low (judgment) | VVF datasheet (memory tiering with NVMe) |

## 2b. Upgrade, import, converge and waves

| Line | Current base | Recommended (base hours) | Driver variables | Confidence | Key source |
|---|---|---|---|---|---|
| U1/U2 VVF 8 to 9 upgrade | 36 / 68 | U_VVF = 16 + 8 per vCenter + 4 per cluster + remediation adders (VUM to vLCM 4 per cluster, IWA to LDAPS 4 per vCenter, VSS to VDS 6 per cluster, Ops for Logs redeploy 8). Host time moves to FILL in-place | vCenters, clusters, remediation flags | Medium-Low | ITQ VCF upgrade guide (vLCM images only, IWA removed in vCenter 9, Ops for Logs has no in-place path) |
| U3 VCF 5.x/9.0 to 9.1 upgrade (new) | None (hidden in FILL and BUVM) | U3 = 24 planning and prechecks + 16 (VCF Ops, SDDC Manager, Management Services) + 12 per domain + 6 per cluster + conditional phases (VCF Automation 12, Log Management 12, Identity Broker 12, HCX 6, Avi 6, Live Recovery/SRM 12, Supervisor 8 per Supervisor, NSX Federation 16) | Domains, clusters, conditional components | Medium | Broadcom upgrade sequence via ITQ guide (9 phases; 15 phases/17 steps with options; about 80 h for one VxRail mgmt + WLD pair) |
| BUVM to Converge (C1, new) | Priced as D bracket (346 loaded at 150 hosts) | C1 = 40 + 4 per cluster + 0.25 per host + NSX deploy 8 + remediation adders (same as U_VVF) | Clusters, hosts, NSX present, remediation flags | Medium-Low | Broadcom converge requirements (min 3 hosts vSAN or 2 external storage simple, 4 HA; VDS 8.0+; fully automated DRS) |
| X1 Workload domain import | 70 per vCenter | X1 = 24 per vCenter + 4 per cluster + 0.1 per host + NSX 3-node deploy 8 (if absent) + ELM break-up 16 + post-import upgrade 12 + 0.25 per host (if source is 8.x) | vCenters, clusters, hosts, NSX present, ELM, source version | Medium | Broadcom import doc; VCF 9.1 FAQ (whole vCenter inventory imported); practitioner (ELM unsupported, imports land at discovered version) |
| FILL migration | 60 + 28 proving run | FILL_mig = 16 HCX per site pair + 0.1 per VM planning + 10 per wave + 0.15 per VM execution + 2 per extended VLAN + 16 pilot; waves = ceil(VMs / 150) | VMs, site pairs, extended VLANs | Medium | Broadcom HCX scalability KB 321604; practitioner (RAV switchover serial, split waves across Service Meshes); Presidio AVS QuickStart (50-VM blocks) |
| FILL in-place | 40 + 28 proving run | FILL_ip = 4 per change window + 0.25 per host + 8 first-cluster proving; windows = ceil(hosts / 16) | Hosts, hosts per window | Low-Medium | Broadcom ESX 9.1 upgrade doc (clusters in parallel by default, per-host selection in 9.1) |

## 2c. Add-on outcomes (X lines)

| Line | Current base | Recommended (base hours) | Driver variables | Confidence | Key source |
|---|---|---|---|---|---|
| X2/X3 Automation | 70 each | Split: VCFA platform 32 (once) + VM self-service module 24 + IaC/governance module 32 + 8 per tenant org + 4 per catalog item beyond 3 | Orgs, catalog items, modules | Low-Medium | Practitioner (VCFA deploy about 3 h machine time); Presidio QuickStart (4 cloud accounts, 1 blueprint in base) |
| X4 VCF Operations | 35 per outcome (shared) | 16 + 4 per vCenter data source + 4 per management pack + per-outcome modules (lifecycle/certs 8, health/logs 12, capacity/cost 12, custom dashboards 4 each, identity ops 8, event integration 16 per target) | Data sources, packs, dashboards, integrations | Low-Medium | Presidio QuickStart (4 vCenter, 6 network sources, 4 packs in base); Presidio VCF and ServiceNow QuickStart |
| X5 NSX overlay | 80 | 16 + 4 per cluster + 2 per segment beyond 5 | Clusters, segments | Low-Medium | Presidio QuickStart (1 T0, 1 T1, 5 segments inside base deploy) |
| X6 NSX Edge and routing | 100 | 40 per Edge cluster + 8 per extra uplink pair or site | Edge clusters, uplinks, sites | Low (judgment) | Presidio QuickStart; VCF 9.1 upgrade notes (Edges upgraded at end of sequence) |
| X16 VPC and transit gateway | 100 (+20%) | Distributed TGW: 16 + 4 per external VLAN + 12 VNA cluster (9.1, if stateful services). Centralized TGW: 16 + X6 | TGW model, external VLANs, VNA | Medium | Broadcom Distributed VLAN Connectivity Model and VPC Getting Started docs; VCF 9.1 networking blog |
| X7 VDS networking | 20 | 12 + 2 per cluster | Clusters | Low (judgment) | Converge requirement for VDS 8.0+ |
| X11 vDefend DFW | 36 (+X5 80) | Stage 1: 8. Stage 2: 16. Stage 3: 8 + 4 per zone. Stage 4: 6 per application. +16 SSP deploy if Intelligence used. No automatic X5 | Zones, applications, SSP | Medium-Low | VMware DFW 1-2-3-4 blog; Broadcom vDefend DFW TechDocs |
| X12 vDefend ATP | 68 (+X5 80) | SSP 24 (if not already deployed) + 12 per feature (IDS/IPS, malware, NTA/NDR, identity firewall) + 8 per 2-week tuning cycle | Features, tuning cycles | Low (judgment) | VMware Pro Cloud Services brief (SSP, virtual patching) |
| X10 Live Recovery | 70 | 24 per site pair + 2 per protection group or recovery plan + 0.1 per protected VM + 12 per recovery exercise; on-prem cyber clean room +32 | Site pairs, plans, protected VMs, exercises | Medium-Low | Presidio AVS QuickStart (SRM per 50 protected VMs); VCF 9.1 FAQ (clean room requires ACC entitlement) |
| X14 Live Cyber Recovery (cloud) | 40 | 16 + 0.05 per protected VM + 12 per IRE test | Protected VMs, tests | Low (judgment) | Broadcom KB 428834 (minimum reserved 2-node recovery SDDC) |
| X9 Supervisor and VKS | 40 | 16 per Supervisor + 8 per VKS cluster + 8 registry (regional Harbor in 9.1) | Supervisors, VKS clusters | Low-Medium | ITQ guide (9.1 lists regional Harbor as prerequisite); VVF datasheet (VKS included) |
| X8 Private AI | 95 | 24 PAIS platform + 8 NVIDIA vGPU/licensing + 2 per GPU host + 8 per model or runtime + 8 DLVM catalog; requires X9 | GPU hosts, models | Low (judgment) | No published effort found |
| X13 Data Services Manager | 40 | 16 + 8 per database engine + 4 per template or plan | Engines, templates | Low (judgment) | Broadcom VCFA services doc; DSM release notes (upgrade up to 90 min) |
| X15 Avi and WAF | 40 | 16 controller cluster + 8 per cloud connector + 4 per virtual service beyond 3 + 8 per WAF policy | Clouds, virtual services, WAF policies | Low (judgment) | ITQ guide (Avi 32.1.1+ blocks NSX/vCenter 9.1 upgrade) |

## 2d. Discovery

| Line | Current base | Recommended (base hours) | Driver variables | Confidence | Key source |
|---|---|---|---|---|---|
| DD1 to DD3 Design discovery | 34 / 85 / 200 | DD = 24 + 0.15 per host + 6 per vCenter + 12 per extra site, capped at 120; 0 if prior assessment or Broadcom baselining delivered | Hosts, vCenters, sites | Low (judgment) | Broadcom VCF Services Entitlement SPD (initial baselining allocation deducted first) |
| DX Discovery per area | 8 flat per area | Ops/Automation 8, Kubernetes 8, NSX networking 12, security 12, DR 12, HCX 12, cyber recovery 12, Private AI 16; +4 per extra site for networking, DR and HCX | Area, sites | Low (judgment) | No published effort found |

# 3. The nine known weak spots: findings and recommendations

1. FILL fixed at 60/40. Documented: Broadcom KB 321604 (HCX 4.7 to 4.9) gives defaults of 300 concurrent migrations per Manager (600 extended) and 200 per Service Mesh/IX, with 1 Gbps max per migration workflow and 1.6 Gbps per IX appliance. The VCF 9.1 HCX system requirements cite support for up to 1,000 concurrent VM migrations. Broadcom notes that end-to-end migration time is not a simple function of size and bandwidth. A practitioner shows that RAV switchovers run one at a time per Service Mesh and recommends splitting a 200-VM wave across four meshes of 50. Practitioners also recommend a pilot wave of 5 to 10 non-critical VMs. Presidio’s AVS QuickStart base covers one cutover event of up to 50 VMs, with add-on blocks of 50 more VMs and extra after-hours cutover events of up to 8 hours. Inferred: wave effort is mostly fixed per wave (runbook, change approval, cutover attendance, validation), plus a per-VM tail. Recommendation: the FILL_mig and FILL_ip formulas above. At 500 VMs, migration FILL becomes about 217 base hours versus 88 today (+147%). At 100 VMs it is about 89, roughly unchanged. Confidence: Medium for the structure, Low for the coefficients. Edition/pathway: applies to greenfield and hybrid (migration) and to in-place (host waves). Not depth-sensitive.

2. X lines flat. Documented: Presidio scales SRM by protected VMs and migration by VMs. Broadcom’s DFW journey is staged by zones and applications. Recommendation: every X line gets a shared platform term plus a per-unit term (Section 2c). Confidence: Medium for structure.

3. Depth tiers do nothing. Documented: Broadcom says adoption is measured by operational outcomes rather than software installation. No published multiplier exists. Recommendation (judgment): Tier 1 x1.0, Tier 2 x1.25 (runbooks, alerting, RBAC, knowledge transfer), Tier 3 x1.6 (catalog, chargeback, tenant onboarding), applied to X lines only. Confidence: Low.

4. Discovery jumps at 51 hosts and above 100 hosts or 3 sites. Recommendation: the continuous DD formula. At 51 hosts DD goes from 85 to about 38 (minus 55%). At 150 hosts, 4 vCenters and 3 sites it goes from 200 to about 95 (minus 53%). Why: data collection is tool-driven, and workshops scale with sites and vCenters, not hosts. Structural: if Broadcom’s entitlement already deducted an initial allocation for baselining cloud maturity and implementation architecture, DD should be zero or reduced to validation (8 to 16 hours). Confidence: Low.

5. Deploy jumps at 25 hosts. Documented: VCF 9.1 bring-up runs 2 to 8 hours of machine time across practitioner reports. Presidio’s base covers 10 hosts with +10-host add-on blocks. Recommendation: the continuous D formula. One WLD at 24 hosts is about 122, and at 25 hosts about 123, versus 135 to 210 today. Confidence: Medium-Low.

6. In-place prices BUVM like greenfield. Documented: VCF 9 converges existing vCenter/ESX 8.0 U3+ into a management domain with the VCF Installer, and imports 8.0 U1+ vCenters as workload domains from VCF Operations, without downtime or migration. Recommendation: BUVM = C1 for the first vCenter + X1 for each additional vCenter. Add U3 where the source is already VCF. At 150 hosts (1 vCenter, 6 clusters) BUVM goes from about 241 base (346 loaded) to about 110 base. Structural: this is a wrong driver, not just a wrong number. Confidence: Medium.

7. X1 flat at 70 per vCenter. Documented: import brings in all clusters of the vCenter. NSX 4.x as a 3-node cluster is required for an 8.x import. ELM is not supported. DRS must be fully automated. A VDS is required. Imports land at the discovered version and need a separate upgrade. A VCF instance holds at most 24 VI workload domains. Recommendation: the X1 formula with adders. A small clean import drops to about 40 to 50 (minus 30 to 40%). A 150-host, 6-cluster, 8.x import with new NSX rises to about 120 (+70%). Confidence: Medium.

8. DX flat 8 per area. Recommendation: tiered values by area, plus a site term for networking, DR and HCX. Confidence: Low (judgment, no public data).

9. Storage has no effect. Documented: converge and import support vSAN, VMFS on FC and NFS, need a shared writable datastore, and vVols are deprecated in 9. Recommendation (judgment): +8 per cluster for FC/NFS principal storage, +24 per stretched cluster, +8 for mixed storage. Confidence: Low.

# 4. Other structural problems

- FILL grows to use the entitlement. This inverts estimating. Hours should come from scope, and leftover entitlement should be presented as an optional Day-2 backlog. A Broadcom-funded SOW that pads wave hours will not survive scrutiny against the SPD’s scope and estimated effort language. Section 7 replaces this rule.

- X5 overlay bundled into vDefend outcomes. The DFW enforces at the vNIC, so segmentation does not require overlay segments. Only add X5 if the customer is moving to overlay.

- X4 per operations outcome. VCF Operations is mandatory in 9.x and deployed during bring-up, so X4 should be configuration modules, not a deployment.

- X2/X3 double-count the VCF Automation platform. Use one platform line plus modules.

- D8 as the catch-all for hosts above 125. This forces 4-instance pricing onto single-instance estates.

- A brackets keyed on hosts. Design effort follows topology.

- VVF and Kubernetes. The VVF datasheet lists VKS with minimal Day-0 Supervisor configuration, so X9 should be selectable for VVF. NSX lines, VPC and vDefend remain VCF-only.

- Missing lines: U3 (VCF upgrade), C1 (converge), HCX setup inside FILL, prerequisite remediation (VUM to vLCM, IWA to LDAPS, VSS to VDS), Log Management and Identity Broker migration, and the Avi upgrade gate.

- PM at 25% of technical hours on every line. This inflates small add-ons. Price PM at engagement level.

# 5. VCF 9.0 versus 9.1 differences that change effort

- Management Services cluster is mandatory in 9.1. It is deployed at bring-up or during the upgrade. It needs a free /28 minimum with 12 IPs minimum and 30 recommended, plus FQDNs for the Fleet, Instance, VCF services runtime, Identity Broker and License Server components. Add 4 hours to D and 8 hours to U3 for IP, DNS and certificate prep.

- Distributed transit gateway. It removes NSX Edges and Tier-0 from the VPC external path. In 9.0 it had no north-south services. 9.1 adds stateful services through the Virtual Network Appliance cluster. Price distributed VPC without X6, and add VNA only when NAT, load balancing, VPN or DNS forwarding is needed.

- Upgrades. 9.1 adds per-host selection in cluster upgrades and upgrades clusters in parallel by default. A practitioner cites a claimed 4x parallel improvement, which is unverified. This supports a larger hosts-per-window value (16 recommended, validate internally).

- HCX lifecycle. VCF 9.1 can deploy and lifecycle HCX from VCF Operations. This reduces HCX setup effort slightly (16 per site pair recommended, versus 20 to 24 judgment for standalone).

- Log Management. Ops for Logs has no in-place upgrade. It is a fresh Log Management deployment plus content re-import, priced at 12 in U3.

- Licensing. 9.1 connected mode downloads licenses automatically every 24 hours, and there is a central License Server. The licensing build weight (0.1) is fine.

- VKS in 9.1 lists regional Harbor as a prerequisite (8 hours in X9).

# 6. Build spec: pricing rules (Pass 1, scope)

All values are base (lead-role) hours. ceil = round up. Booleans are 0 or 1.

## Global

- Secondary technical role = 0.10 x base for all lines, except X16 and X11/X12 at 0.20, and DX at 0.

- PM = 0.15 x (sum of lead + secondary across the engagement), floor 24 if any build stage exists, else floor 8. Kickoff, approval and design-authority stages draw from this PM pool.

- Depth multiplier M_depth: Not selected or Tier 1 = 1.0, Tier 2 = 1.25, Tier 3 = 1.6. Applies to X2 to X16 and EF only.

- Design-only and undecided pathways: each X line keeps 25% of its computed value. Keep the current rule, but apply it to the formula output.

## Discovery

- DD = min(120, 24 + 0.15 x hosts + 6 x vCenters + 12 x (sites minus 1)). DD = 0 if prior_assessment = 1. DD = 12 if broadcom_baseline_delivered = 1.

- DX = sum of area values, where Ops/Automation 8 (once), Kubernetes 8, NSX networking 12, security 12, DR 12, HCX 12, cyber recovery 12, Private AI 16. Add 4 x (sites minus 1) to the NSX networking, DR and HCX areas.

## Design

- A = 64 + 16 x WLDs + 24 x (instances minus 1) + 32 x (sites minus 1) + 24 x stretched_clusters + 8 x (storage_types minus 1) + min(40, 0.25 x max(0, hosts minus 32)).

### Reference Architecture Design tier (small estates)

- Trigger: at most 16 hosts, 2 clusters, 1 vCenter, 1 VCF instance and 1 site. Every limit is a setting (`HOURS_V2.smallEstate` in `shared/hoursConfig.ts`). Sites are the sites in year-one scope: a site that exists for disaster recovery (the plan wants recovery services; one site per recovery site pair, at most all sites but the first) is covered by the Recovery and Resilience Design package, funded or follow-on, so it does not count against the one-site limit (`shared/estateSize.ts`, `recoverySites`). The full design still prices every stated site. Then A is a flat 40 hours (`design.referenceFlat`), with no per-domain, per-site or per-host terms.
- The package is named Reference Architecture Design. It is accepted when the completed VCF Planning and Preparation Workbook, the bill of materials and a short list of deviations from the reference architecture are approved by the customer. The package is 40 hours as shown (`design.referenceFlat`, project management and the second role inside it; the base is solved against the engagement's PM ratio). The kickoff (`design.kickoff`, all project management), the hardware compatibility review (`design.hardwareReview`), the role and access mapping (`design.roleAccess`) and the migration plan (`waves.migrationPlan`) are packages of their own with their own estimates, beside the 40, not carved out of it. Those estimates are placeholders for the practice to confirm.
- Counts come from RVTools when it is loaded, else from the brief (the brief has no cluster count, so clusters are the assumed ceil(hosts / 16)). No host count anywhere means the estate is not small: the full design applies and the planner sees the flag "Estate size unknown; design hours assume a full design".
- The planner input Small estate (auto, yes, no) overrides the test either way. A change is logged in the document's planner log (`fields.plannerLog`), which is internal and never printed.

### The fill order (whole packages, never shaved)

Packages fill in this order. Each is wholly in the entitlement or wholly follow-on; nothing is cut by hours, scaled, or trimmed to fit.

1. Kickoff, the hardware compatibility review and the design (discovery, then the Reference Architecture Design or the full design).
2. The foundation build (management domain, storage, the NSX design for the management domain), then the role and access mapping; on a small estate the build carries licensing, training and handover.
3. The VCF Operations design (the component design package: the design share of the X4 line).
4. The migration plan (its own package), then CDW's waves as one whole package sized for the whole estate (funded whole or all follow-on). The runbook transfer, and a split of the waves at the first `datedWaves`, exist only when the "Migration waves" setting says the customer runs the remaining waves; with "customer runs all waves" none of the waves line is CDW's.
5. The first workload domain (a small estate's line `DW`, its weighted share of the build, so it is whole or follow-on), VCF Operations at Tier 1 (health and logs), the selected outcomes in the customer's ranking (recovery among them), then the remaining waves, depth and efficiency.
6. Leftover hours: Optimization and Advisory Services.

- Steps 1 to 3 are the minimum. If the minimum does not fit, the design is first phased by deliverable (never by hours): the foundation design (management domain, platform, network and storage; `design.foundationBase` plus the host, extra instance and extra storage terms) stays in the entitlement, and workload domain design plus DR and NSX overlay design (the rest of the base, extra sites and stretched clusters) become a follow-on package of their own, "Workload Domain, DR and NSX Overlay Design", with its own outcome and acceptance (`row.detail`).
- If it still does not fit, the plan is under-funded and nothing is split further: `fit.underFunded` carries `gapHours` (the minimum less the fillable hours) and `fullScopeGapHours` (how many more hours the full scope needs). The issue gate (`fundingProblem`) states both and needs a logged decision; no customer document prints either. The squeeze that used to move packages to the follow-on for the v2 model is gone.
- Steps 4 and 5 fill in order and stop at the first unit that does not fit (no leapfrogging), so priority order holds; CDW's waves package is one unit. By default CDW runs every wave, so nothing is customer-run. Only when the customer asked to run the remaining waves (setting "Migration waves") are the waves after the dated ones the customer's, and the plan says "with the proven runbook" only when CDW's first waves and the runbook transfer are funded.
- Every CDW bar on the entitlement timeline is a funded package. A bar with no funded hours is a follow-on bar (drawn in the Two-Year Notional) or, when the plan has no hours for it at all, drawn on neither timeline (`unscopedWorkPackageIds`). Discovery goes with them: hours already delivered show in the delivered row of the hours table, not as a bar. A checkpoint goes with the package it gates (the backup checkpoint with the migration waves). The customer-run waves, and the customer effort peak they set, exist only when the customer asked to run waves and, for the remaining waves, CDW's first waves are funded.

What remains proportional, and why: a line's hours are spread over the packages that deliver it by fixed weights (`BUILD_STAGE_WEIGHTS`, package length, the focused reviews at half weight) and rounded so the columns foot, so a package's hours move by an hour or two when its neighbours on the line change. That is an allocation of a priced line, not a cut to fit. A displaced add-on whose design share is funded carries the other 75% in its build packages, and the NSX design for the management domain is taken out of the networking line's follow-on once: both avoid counting the same hours twice. The hours-fill package takes what is left in the plan's own role mix.

### No package is split by hours

- A package is wholly in the entitlement or wholly follow-on. The fit never part funds a package: the Operations build and each outcome at Tier 1 are funded whole or all of them move to the follow-on, and the waves are one package. No continuation ("Remaining Scope") rows exist, and every follow-on row has a month; a package with no bar of its own starts the month after the entitlement ends. Planner hours on a package never feed the displaced-scope calculation. The squeeze no longer trims later waves by share.

## Deploy

- D_VCF = 64 + 16 + 4 (Management Services, 9.1) + 40 x (instances minus 1) + sum per WLD (24 + 8 x dedicated_NSX) + 8 x max(0, clusters minus 1 minus WLDs) + 24 x stretched_clusters + 0.75 x min(hosts, 64) + 0.5 x max(0, hosts minus 64) + S_storage.

- Consolidated topology: WLDs = 0.

- D_VVF = 40 + 16 + 8 x (clusters minus 1) + 0.75 x hosts + S_storage.

- S_storage = 8 x clusters_on_FC_or_NFS + 8 x mixed_storage.

- Keep build-stage weights (management 1, WLD 0.8, VVF cluster 0.4, prep 0.4, handover 0.2, licensing 0.1) for spreading.

## Converge, import and upgrade

- R_remed = 4 x clusters_on_VUM + 4 x vCenters_with_IWA + 6 x clusters_on_VSS + 8 x legacy_logs.

- C1 = 40 + 4 x clusters + 0.25 x hosts + 8 x (no_existing_NSX) + R_remed. Use C1 only for the first vCenter on in-place and converge pathways.

- X1 (per imported vCenter) = 24 + 4 x clusters + 0.1 x hosts + 8 x (no_existing_NSX) + 16 x ELM + (source_8x x (12 + 0.25 x hosts)).

- U_VVF = 16 + 8 x vCenters + 4 x clusters + R_remed.

- U3 = 24 + 16 + 8 (Management Services prep) + 12 x domains + 6 x clusters + 12 x VCFA + 12 x logs + 12 x VIDM_to_IdentityBroker + 6 x HCX + 6 x Avi + 12 x SRM + 8 x Supervisors + 16 x NSX_Federation.

## Waves

- waves = ceil(VMs / 150).

- FILL_mig = 16 x site_pairs + 0.1 x VMs + 10 x waves + 0.15 x VMs + 2 x extended_VLANs + 16.

- windows = ceil(hosts / 16).

- FILL_ip = 4 x windows + 0.25 x hosts + 8.

- No entitlement growth. Section 7 governs the fit.

## Add-ons

- X_VCFA_platform = 32 (once if any automation outcome).

- X2 = 24 + 8 x orgs + 4 x max(0, catalog_items minus 3).

- X3 = 32 + 4 x max(0, templates minus 3).

- X4 = 16 + 4 x vCenter_sources + 4 x mgmt_packs + sum of modules (lifecycle 8, health/logs 12, capacity/cost 12, dashboards 4 x n, identity ops 8, event integration 16 x targets).

- X5 = 16 + 4 x clusters + 2 x max(0, segments minus 5).

- X6 = 40 x edge_clusters + 8 x extra_uplink_pairs.

- X16 = 16 + 4 x external_VLANs + 12 x VNA (distributed). For centralized, X16 = 16 and X6 is required.

- X7 = 12 + 2 x clusters.

- X11 = 8 + 16 + 8 + 4 x zones + 6 x apps + 16 x SSP_new.

- X12 = 24 x SSP_new + 12 x features + 8 x tuning_cycles. Never auto-add X5.

- X10 = 24 x site_pairs + 2 x plans + 0.1 x protected_VMs + 12 x exercises + 32 x onprem_clean_room.

- X14 = 16 + 0.05 x protected_VMs + 12 x IRE_tests.

- X9 = 16 x supervisors + 8 x VKS_clusters + 8. Allowed for VVF.

- X8 = 24 + 8 + 2 x GPU_hosts + 8 x models + 8. Requires X9.

- X13 = 16 + 8 x engines + 4 x templates. Requires X_VCFA_platform and X9.

- X15 = 16 + 8 x clouds + 4 x max(0, virtual_services minus 3) + 8 x WAF_policies.

- EF = 12 + 0.25 x tiered_hosts.

Defaults when the brief is silent (judgment): clusters = max(1, ceil(hosts / 16)); VMs = hosts x 25; zones = 4; apps = 5; protected_VMs = 0.2 x VMs; site_pairs = 1 if migration; extended_VLANs = 10.

# 7. Fitting the plan to an entitlement: burn-down rules and guardrails (Pass 2, fit)

## 7.1 The principle

The old model answered the fund question by inflating waves until the entitlement was consumed. The replacement is a two-pass model.

Pass 1, scope. Compute every line at true effort using Section 6. This is what the work costs. It does not change because of the fund.

Pass 2, fit. Convert the fund to hours, then partition the Pass 1 scope into four buckets in priority order until the hours run out. Nothing in Pass 1 is reduced. Lines are moved, split at natural unit boundaries, or deferred.

Three reasons this matters commercially. The SPD language is scope, estimated effort and the corresponding value to be deducted, so a Transaction Document with padded or compressed estimates is exposed on audit. A plan that reflects true effort gives the account team a documented, customer-facing reason to sell follow-on services. And an honest Pass 1 is the only way to know whether a fund is too small, which is the conversation the customer needs before the window closes, not after.

## 7.2 Converting the fund to hours

entitlement_hours = fund_value / blended_rate

The rate is the Broadcom VCF Services Entitlement rate card, which is not public. Until the practice confirms it, the tool should take blended_rate as an input with a default and print it on the plan. At $250/hour, a $100k entitlement is 400 loaded hours. At $300/hour it is 333. The difference is roughly one workload domain build, so the rate assumption has to be visible on every plan.

The reserve (8% of entitlement_hours) is withheld before filling: the fillable budget is entitlement_hours minus reserve. Hours left after the fill are reported as entitlement_remaining, a separate figure that can be zero.

Loaded hours, not base hours, consume the fund. Use the Section 6 role split and PM rule, so a 400-hour entitlement is about 320 technical base hours plus PM.

## 7.3 The four buckets

| Bucket | Funded by | Window | What goes here |
|---|---|---|---|
| E1 Entitlement core | Broadcom entitlement | Months 1 to 12 | Foundation work that must happen for the customer to be on a supported platform |
| E2 Entitlement depth | Broadcom entitlement | Months 1 to 12 | Outcome lines and depth tiers, in priority order, until hours run out |
| F Follow-on entitlement | Next year’s entitlement, if one exists | Year 2 | Lines that did not fit, with design already complete |
| C Customer-funded | Customer PO through CDW | Any time | Lines the customer wants faster than F allows, and anything the entitlement cannot cover (managed services, hardware-dependent work) |

A line sits in only one bucket. A line splits across buckets only at the unit boundaries in 7.5.

## 7.4 Priority order for filling E1 and E2

Fill in this order. Stop when the next whole unit would exceed entitlement_hours.

- DD and DX for the areas selected, unless Broadcom baselining was already delivered.

- A (design) in full. Design is never deferred, because every later bucket depends on it, except under 300 fillable hours, where it can be phased by deliverable (see Design first below).

- The pathway spine. D (greenfield), C1 (converge), X1 per vCenter (import), U3 (VCF upgrade), or U_VVF. For in-place, FILL_ip at the minimum windows needed to clear vSphere 8 EOGS.

- FILL_mig for the waves needed to retire hardware or licensing that is actually expiring in the window. Not all waves, just the ones with a date behind them.

- Operations Tier 1 (X4 base plus lifecycle and health modules). This is the minimum for the customer to run what was built.

- Selected outcomes at Tier 1, in the order the customer ranked them in discovery. Default order if unranked: networking spine (X5/X6/X16 as applicable), security (X11), resilience (X10), automation platform, VKS, Private AI.

- Remaining migration waves.

- Depth tiers, raising selected outcomes from Tier 1 to Tier 2, then Tier 3, in the customer’s ranking.

- EF and remaining DX areas.

Steps 1 through 5 are E1. Steps 6 through 9 are E2. If the entitlement runs out inside E1, the fund is too small for the pathway and the tool should say so rather than proceed (see 7.7).

## 7.5 Split rules

Lines split only here. Everything else moves whole.

- FILL_mig splits by wave. Each wave carries its 10-hour fixed term plus its per-VM share. The HCX setup (16 per site pair) and pilot (16) stay in E1 with the first wave.

- FILL_ip splits by change window.

- X1 splits by vCenter. The ELM break-up and NSX deploy adders stay with the first vCenter imported.

- X10 splits by site pair and by recovery exercise. Protection groups do not split.

- X11 splits by stage. Stages 1 and 2 (assessment, shared services) stay together. Stage 3 splits by zone. Stage 4 splits by application.

- X2, X3, X9, X13, X15, X4 modules split at the module or per-unit term, never inside the platform term.

- Depth tiers split by tier. A line can be Tier 1 in E2 and Tier 2 in F.

- Design share rule. Any X line that lands in F or C keeps 25% of its computed value in E2 as design, so the implementation can start in a later bucket without repeating discovery. This replaces the old “add-ons drop to design when over entitlement” rule, and it applies only to lines that were actually displaced.

## 7.6 Legitimate hour reductions versus estimate compression

These change Pass 1 because they change scope. They are the only ways to make a plan smaller.

| Lever | Effect | What it is not |
|---|---|---|
| Prior assessment or Broadcom baselining delivered | DD = 0 or 12 | Not a discount on discovery |
| Customer owns prerequisites (DNS, NTP, IP pools, ToR config) | Already zero CDW hours; confirm they are staffed | Not a reason to cut D |
| Customer self-delivers Stage 4 segmentation rules | Remove per-application term from X11 | Not a reason to cut Stages 1 to 3 |
| Fewer, larger waves where HCX capacity allows | Lower wave count in FILL_mig | Capped at 150 VMs per wave planning size |
| Tier 1 instead of Tier 2 | Removes the 1.25 multiplier | Not a change to the Tier 1 number |
| Consolidated topology where the estate supports it | WLDs = 0 in D | Not applicable above 15 hosts |
| Drop outcomes the customer has no owner for | Removes the line entirely | Record in bucket F or C with the reason |

Anything that lowers a coefficient without changing scope is compression and should not be available in the tool.

## 7.7 Guardrails the tool enforces

- Minimum viable E1. If entitlement_hours is less than the sum of steps 1 through 5, flag the plan as under-funded. Show the gap in hours and dollars. Do not build a plan that stops mid-spine.

- No bucket is empty by accident. If F and C are empty and the entitlement is fully consumed, confirm the customer had no displaced outcomes. If they did, something was compressed.

- Burn-rate target. Required monthly burn = entitlement_hours / months_remaining. Review at month 3 and month 6. If actual burn at month 6 is below 40% of entitlement, re-scope: pull work from F into E2 (if the customer can absorb it) or formally request a scope change. Do not silently extend.

- Reserve. Hold 8 to 10% of entitlement_hours unallocated until month 6 for overrun. Release it to F-bucket items at month 6 if unused. This protects the SOW against change orders that cannot land in time.

- Entitlement expiry is a hard stop. The SPD says the entitlement is used within the initial 12 months. The tool should assume no rollover unless the account team confirms it in writing.

- F is conditional. Follow-on entitlement exists only if the customer buys more VCF or renews with entitlement attached. Treat F as a forecast, not a commitment, and tell the customer which lines depend on a purchase that has not happened.

## 7.8 Worked example at $100k

Assumptions: $250/hour blended (400 loaded hours), 40 hosts, 1 site, 1 vCenter, 800 VMs, converge pathway, customer selected Operations (lifecycle and health), segmentation, and VM self-service, all requested at Tier 2. No prior assessment.

The 8% reserve (32 hours) is held out first, so the fillable budget is 368 hours. Loaded hours follow Section 6: 1.265x base on standard lines, 1.38x on X11, 1.15x on DX. Values are the implementation's, unrounded until shown.

| Step | Line | Base | Loaded hours | Running total | Bucket |
|---|---|---|---|---|---|
| 1 | DD (24 + 6 + 6) | 36 | 45.5 | 45.5 | E1 |
| 1 | DX (Operations and automation 8, security 12) | 20 | 23.0 | 68.5 | E1 |
| 2 | A (64 + 16 + 2) | 82 | 103.7 | 172.3 | E1 |
| 3 | C1 (40 + 12 + 10 + 8) | 70 | 88.6 | 260.8 | E1 |
| 5 | X4 Tier 1 (16 + 4 + 8 + 12) | 40 | 50.6 | 311.4 | E1 |
| 6 | X11 stages 1 and 2 (8 + 16) at Tier 1 | 24 | 33.1 | 344.5 | E2 |
| 6 | X11 stage 3 base | 8 | 11.0 | 355.6 | E2 |
| 6 | X11 zones 1 and 2 (4 each) | 8 | 11.0 | 366.6 | E2 |
| 6 | X11 zone 3 | 4 | 5.5 | 372.1 | Over |

E1 is 311.4 hours against the 368-hour fillable budget, so the core fits and the under-funded guardrail does not trigger. E2 stops at 366.6. Entitlement remaining after the fill is 1.4 hours; the reserve stays at 32. Displaced work, all to F:

- X11 zones 3 and 4, and stage 4 (5 applications).
- VCF Automation platform and VM self-service (82 loaded hours at Tier 1). Their 25% design shares (about 10 loaded hours each) do not fit, so they move to F with the line and are flagged.
- The Tier 2 uplift on all three outcomes.
- Migration waves: not applicable on converge.

The customer sees a plan that delivers a supported VCF 9.1 platform, Operations running, and the first segmentation zones enforced inside the window, with automation and depth as a named, costed year-two scope. If they want automation this year, it is a customer-funded line of about 82 hours through CDW, and the account team has a documented reason to quote it.

## 7.9 What the plan output should show

Add these to the plan document the tool generates.

- A bucket table (E1, E2, F, C, reserve) with hours and dollars per bucket and the rate assumption printed.

- A month-by-month burn-down with target and actual columns.

- A “not funded in this window” table listing every displaced line, its hours, which bucket it moved to, and why (ran out, no owner, customer deferred).

- The under-funded warning if 7.7 triggered.

- A one-line note that F depends on a future purchase.

## 7.10 Judgment calls in this section

The priority order in 7.4 places Operations Tier 1 in the core bucket ahead of any customer-selected outcome. That is defensible because VCF Operations is mandatory in 9.x and the customer cannot run the platform without it, but it is a practice decision and a one-line change if the practice disagrees. The worked example uses judgment-rated coefficients from Section 6, so the specific numbers will move when validated against delivery data. The structure holds regardless.

# 8. Open questions to validate with internal delivery data

## 8a. Hours model

- Actual attended hours for VCF 9.x management domain bring-up, from workbook completion to handover, split into prep, run and post-config.

- Hours per workload domain and per additional cluster on real engagements. Does 24 and 8 hold?

- Hosts per change window achieved on 9.1 with parallel cluster upgrades, and lead hours per window.

- VMs per wave and lead hours per wave on HCX engagements. Validate the 150-VM planning size and 10 hours per wave.

- Remediation frequency and effort for VUM to vLCM, IWA to LDAPS, VSS to VDS and ELM break-up.

- Converge actuals versus the old BUVM estimate on any 9.x converge done to date.

- Real U3 durations by component, compared with the practitioner table (SDDC Manager about 1 hour, management NSX about 4 hours, vCenter about 1 hour).

- vDefend: hours per zone and per application in Stage 3 and 4. How many applications do customers actually ringfence in the first engagement?

- Live Recovery: hours per recovery plan and per exercise.

- Whether Broadcom PS already delivered baselining under the entitlement’s initial allocation. If so, DD should be validation only.

- The Broadcom VCF Services Entitlement rate card and any internal Broadcom PS SKU hour assumptions available to subcontractors. These would override everything here.

- Actual PM ratio on recent engagements, versus the 25% assumed today and 15% recommended.

## 8b. Burn-down

- Whether the entitlement rate card is one blended rate or per-role.

- Whether any CDW-delivered entitlement to date has rolled over, been extended, or been converted. The SPD says no, but practice may differ.

- Whether Broadcom’s Transaction Document process allows multiple TDs against one entitlement, which would let E1 and E2 be contracted separately and reduce change-order risk.

- How Broadcom treats a displaced-to-F line if the customer renews mid-year with new entitlement. Can it be redeemed immediately or only against the new 12-month clock.

- Actual burn-rate curves from engagements delivered so far, to validate the month-6, 40% checkpoint.

# 9. Caveats

- No Broadcom-published hours exist in the public domain for VCF, NSX, vDefend, Live Recovery, VKS, DSM or Private AI services. The service briefs list scope only. Every coefficient here is either derived from partner scope structures (Presidio) and product runtimes, or is labeled judgment.

- Installer runtimes (2 to 8 hours for bring-up, about 3 hours for VCF Automation) are lab or practitioner reports of machine time. They bound attended time but are not effort.

- The practitioner upgrade duration table explicitly says it is a starting point, not a commitment. Its ESXi per-host row is ambiguous and reads like a per-domain figure. It was used only as an order-of-magnitude check.

- The 4x parallel upgrade improvement in 9.1 is a vendor claim repeated by a practitioner who says he will believe it when he measures it.

- vDefend’s “a few weeks” is vendor marketing. Converted at 3 weeks with 1 lead at 50% allocation, it is about 60 lead hours for a modest estate. That matches the X11 formula at 4 zones and 3 to 4 applications.

- Presidio’s AVS QuickStart values (50-VM base cutover, 50-VM add-on blocks up to 30 TiB, after-hours cutover add-on of up to 8 hours) are confirmed from the PDF, and the VMC QuickStart caps each cutover event at 75 VMs. The VMC resident-engineer length is unconfirmed.

- Partner catalogs from WWT, Insight, SHI, AHEAD, Rackspace and Xtravirt were searched but no stated-hour offerings were found. That is not proof they do not exist behind partner portals.

- The entitlement rate used in Section 7 is a placeholder. Every dollar figure in 7.8 scales with it.

# 10. Sources

- Broadcom, VCF Services Entitlement Specific Program Documentation (Nov 2024): https://ftpdocs.broadcom.com/cadocs/0/contentimages/VCF_Services_Entitlement_SPD_Nov_2024.pdf

- VMware Pro Cloud Services service brief: https://www.vmware.com/docs/vmware-pro-cloud-services-service-brief

- VMware Cloud Foundation 9.1 FAQ: https://www.vmware.com/docs/vmware-cloud-foundation-9-1-general-faqs

- VMware vSphere Foundation FAQ: https://www.vmware.com/docs/vmware-vsphere-foundation-faqs

- VMware vSphere Foundation datasheet: https://www.vmware.com/docs/vmw-vsphere-foundation-datasheet

- VMware Cloud Foundation datasheet: https://www.vmware.com/docs/vmw-cloud-foundation-datasheet

- Broadcom TechDocs, Supported and Not Supported Configurations to Converge to VCF (9.1): https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/deployment/converging-your-existing-vsphere-infrastructure-to-a-vcf-or-vvf-platform-/supported-and-not-supported-configurations.html

- Broadcom TechDocs, Import an Existing vCenter to Create a Workload Domain (9.1): https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/building-your-private-cloud-infrastructure/working-with-workload-domains/import-an-existing-vcenter-to-create-a-workload-domain.html

- Broadcom TechDocs, Upgrade ESX to 9.1: https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/deployment/upgrading-cloud-foundation/upgrade-the-management-domain-to-vmware-cloud-foundation-5-2/upgrade-esxi-for-vmware-cloud-foundation-5-2-1.html

- Broadcom TechDocs, VCF 9.1 release notes, VCF Operations what’s new: https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/release-notes/vmware-cloud-foundation-9-1-0-0-release-notes/what-s-new/whats-new-vcf-ops.html

- Broadcom TechDocs, Distributed VLAN Connectivity Model (9.1): https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/design/design-library/workload-connectivity-designs/distributed-vlan-connectivity-model.html

- Broadcom TechDocs, VPC Getting Started Workload Networking Model (9.0): https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-0/design/design-library/design-library-workload-networking/design-library-workload-networking-vpc-getting-started.html

- Broadcom TechDocs, vDefend Distributed Firewall 9.0: https://techdocs.broadcom.com/us/en/vmware-security-load-balancing/vdefend/vdefend-firewall/9-0/vdefend-distributed-firewall.html

- Broadcom TechDocs, Using Services with VCF Automation (DSM): https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-0/provider-management/using-solution-add-ons.html

- Broadcom TechDocs, Data Services Manager 9.0 release notes: https://techdocs.broadcom.com/us/en/vmware-cis/dsm/data-services-manager/9-0/release-notes/vmware-data-services-manager-90-release-notes.html

- Broadcom KB 321604, HCX Bulk Migration and RAV scalability guide (4.7 to 4.9): https://knowledge.broadcom.com/external/article/321604/hcx-bulk-migration-replication-assiste.html

- Broadcom KB 428834, Purchasing a Subscription for VMware Live Recovery: https://knowledge.broadcom.com/external/article/428834

- VMware Security Blog, vDefend DFW 1-2-3-4 (Nov 2025): https://blogs.vmware.com/security/2025/11/vdefend-dfw-1-2-3-4-vcf.html

- VMware Security Blog, Advancing Zero Trust Private Cloud with vDefend (Feb 2026): https://blogs.vmware.com/security/2026/02/zero-trust-journey-vdefend.html

- VMware VCF Blog, Deployment Pathways for VCF 9 (Jul 2025): https://blogs.vmware.com/cloud-foundation/2025/07/03/vcf-9-0-deployment-pathways/

- VMware VCF Blog, Converging vSphere to VCF 9.0, top 10 questions (Apr 2026): https://blogs.vmware.com/cloud-foundation/2026/04/16/converging-vmware-vsphere-to-vmware-cloud-foundation-9-0-the-top-10-questions-answered/

- VMware VCF Blog, Simplify Workload Connectivity with VCF 9.1 (May 2026): https://blogs.vmware.com/cloud-foundation/2026/05/05/simplify-workload-connectivity-and-enhance-network-scale-and-performance-with-vcf-9-1/

- VMware VCF Blog, VCF 9.1 Licensing (May 2026): https://blogs.vmware.com/cloud-foundation/2026/05/18/vcf-9-1-licensing-programmatic-centralized-and-built-to-scale/

- Broadcom Newsroom, Driving VCF Adoption with Expert Advantage: https://www.broadcom.com/company/news/articles/partner-spotlight/driving-vmware-cloud-foundation-vcf-adoption-expert-advantage-ecosystem

- Presidio, VCF Deployment QuickStart service brief: https://www.presidio.com/servicebriefs/sb-vcf-deployment-quickstart.pdf

- Presidio, Azure VMware Solution QuickStart service brief: https://www.presidio.com/servicebriefs/sb-avs-quickstart.pdf

- Presidio, VCF and ServiceNow QuickStart service brief: https://www.presidio.com/servicebriefs/sb-vcf-servicenow.pdf

- ITQ (hollebollevsan), Full VCF upgrade sequence: https://docs.hollebollevsan.nl/docs/13-vcf-upgrade-sequence/

- HPE, VCF Build, Manage and Secure 9.0 course description: https://www.hpe.com/us/en/collaterals/collateral.a50013861enw.html

- HPE, VCF Solution Architecture and Design 9.0 course description: https://www.hpe.com/us/en/collaterals/collateral.a50013865enw.html

- Xtravirt, VMware Cloud Foundation FAQs: https://xtravirt.com/ebook/vmware-cloud-foundation-faqs/

- vstellar, VCF 9.1 Home Lab Series part 5 (management domain bring-up): https://vstellar.com/2026/05/vcf-9-1-home-lab-series-part-5-management-domain-bringup/

- vstellar, VCF 9.1 Home Lab Series part 10 (VCF Automation): https://vstellar.com/2026/06/vcf-9-1-home-lab-series-part-10-deploy-and-configure-vcf-automation/

- vstellar, VCF 9.1 Home Lab Series part 14 (distributed transit gateway): https://vstellar.com/2026/07/vcf-9-1-home-lab-series-part-14-distributed-transit-gateway-for-vpcs/

- drpranayjha, How to Deploy the VCF 9.1 Management Domain: https://drpranayjha.com/how-to-deploy-vcf-9-1-management-domain/

- drpranayjha, Brownfield import requirements (VCF 9 series part 14): https://drpranayjha.com/bring-vsan-nsx-under-vcf-9-import/

- drpranayjha, What is new in VCF 9.1 and the case for upgrading: https://drpranayjha.com/whats-new-vcf-9-1-and-why-upgrade/

- gibsonvirt, VCF 9 new installer: https://gibsonvirt.com/2025/06/18/vcf-9-new-installer/

- gibsonvirt, VCF 9.1 Management Services and licensing: https://gibsonvirt.com/2026/05/08/vcf-9-1-whats-new-management-services-and-licensing/

- vExpert Consultancy, VCF 9.x bring-up series part 4: https://www.vexpertconsultancy.com/2025/12/vcf-9-x-bringup-series-part4-vcf-fleet-deployment-using-the-vcf-installer/

- cosmin.us, Importing a vCenter 8.x as a workload domain into VCF 9: https://cosmin.us/importing-a-vcenter-8x-as-a-workload-domain-into-vcf-9/

- khizeran.com, Importing a vCenter 8.x as a workload domain into VCF 9.0: https://khizeran.com/2025/10/22/importing-a-vcenter-8-x-as-a-workload-domain-into-a-vcf-9-0-instance/

- chrisdooks.com, HCX 4.8 selectable Service Mesh: https://chrisdooks.com/2023/11/21/whats-new-in-hcx-4-8-selectable-service-mesh/

- ProVirtualzone, HCX migration practical guide: https://www.provirtualzone.com/migrating-workloads-to-azure-vmware-solution-with-vmware-hcx-a-practical-guide/

- ProVirtualzone, VCF 9.1 features that matter: https://www.provirtualzone.com/vcf-9-1-the-features-that-actually-matter-if-you-run-vcf/

- Digital Thought Disruption, VCF 9.1 VPC distributed vs centralized TGW: https://digitalthoughtdisruption.com/2026/07/20/vcf-9-1-vpc-distributed-vs-centralized-transit-gateway/

- curioustechies, vDefend Security Intelligence: https://curioustechies.in/2024/09/22/unlocking-micro-segmentation-potential-with-vdefend-security-intelligence/

### Package estimates are independent

Each package's hours come from its own drivers, so adding or removing one package never changes another's (`server/packageIndependence.test.ts` removes each package in turn and compares the rest, to the hour). A pooled line is split across the packages the plan would carry, with a fixed denominator: a package that is not on the plan has its share dropped (the hours go with it) and never handed to the others. The deploy line (D) is the spec formula less the runbook transfer's share of the build, because the transfer is a package only when the customer runs the remaining waves; its share is the transfer's weight over the weights of the packages the build is split across. The Reference Architecture Design, hardware review, access mapping and migration plan have their own estimates and fall back to no other package.

