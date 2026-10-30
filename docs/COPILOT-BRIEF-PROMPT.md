# Copilot prompt for the customer brief

Use **Copy Copilot prompt** on the Engagement step rather than this page: it copies this prompt with a header for the open engagement (the customer name, where Copilot should search, and what the app already holds) and the customer name filled into the JSON. Copilot returns the brief as a downloadable `<customer>-brief.json` file, or as a json code block. Import it with **Choose brief JSON**, or paste the reply with **Paste brief JSON**; either way you review the changes before anything is applied. `pnpm brief:check <file>` checks a saved brief locally and prints only its shape, with values masked.

The generic prompt, without the engagement header:

```text
You are preparing a customer brief for a CDW VMware Cloud Foundation (VCF) engagement. Read the meeting notes, transcripts, emails and questionnaire answers I give you (or that you can find for this customer) and return ONE JSON object in exactly the shape below. Deliver it as a downloadable file named customer-brief.json that contains only the JSON. If you cannot create a file, reply with only one ```json code block and no commentary before or after it.

Rules
- Use only facts that are stated in the sources. Never estimate or invent numbers, dates, hours, core counts or names.
- If something is not stated, use null for a single value or [] for a list. Do not write "TBD" or "unknown".
- Dates are YYYY-MM-DD. Months alone (customerOwnedWork) are YYYY-MM.
- Quote the customer's own words where you record their position or goals.
- Do NOT include rates, PO values, work authorization or project numbers, or the Broadcom pricing tier. The customer segment (commercial or corporate) is fine to fill in.
- Do NOT use the words "readiness", "workshop" or "TRW". Call discovery work "design discovery" and describe it in design terms.
- Write to the customer, not about them ("Keep the existing array", not "the customer refuses to change storage").

What each section is for
- customer, contacts: who the customer is and who is involved (customer, CDW, Broadcom), with roles. primaryContact is the customer's main contact as "Name, role"; accountId is the CDW account number when it appears in the sources.
- schedule: dates the customer named. projectStart is when they want the engagement to start, implementationStart when build work can begin, targetComplete their target finish. hardwareLeadWeeks is the lead time for new hardware in weeks. calendarConstraints is one or two sentences on freezes, site dates, fiscal deadlines or other limits on timing.
- entitlement: the services entitlement. value is the entitlement dollar value (the only dollar figure the report may show). hours is the entitled hours on Broadcom's entitlement record. hoursConsumed and consumedAsOf come from the latest consumption record.
- bsas: Broadcom Software Adoption Services, a second prepaid pool used after the entitlement, on its own PO. Leave hours null when the deal has no BSAS. hours is the BSAS hours; termStart and termEnd are the BSAS term. Never include the BSAS dollar amount, its rates or its rate tier.
- discovery: answers to the discovery questionnaire (RVTools export, licensing and core counts, current versions, Enhanced Linked Mode, networking, vCenters, data centers, edge sites, ESX hosts, storage, hardware vendor, container platform, network details, jumbo frames, security tooling, DR, backup, hyperscalers, new hardware purchased, planned path, consolidated domain, add-ons considered or not wanted).
  - plannedPath: one of greenfield, in-place, converge, import-workload-domain, hybrid, design-only, undecided.
  - platformEdition: vcf or vvf (VMware vSphere Foundation) when the customer is licensed for VVF only.
  - storage: the principal storage type: vsan, nfs-v3, vmfs-fc, other-existing, or undecided.
  - storageSecondary: any other storage types in use beside the principal one, using the same names (for example ["nfs-v3", "vsan"]). Leave [] when there is only one.
  - vsphere8Strategy: when hosts stay on vSphere 8 past its end of general support (11 October 2027), how they stay supported: bring-waves-forward, import-before-eogs (import the existing vCenters into VCF first; import works on vSphere 8) or extended-support. null until it is decided.
  - consolidatedDomain: true for one consolidated management and workload domain (usually 10 hosts or fewer).
  - jumboFrames: true when jumbo frames run end to end, false when they do not, "mixed" when some switches or clusters run them and others do not.
  - assessmentCompleted: true when a VCF assessment or compatibility assessment has already been delivered.
  - sitePrerequisitesOpen: site work the customer still has to finish before the build, using these names: dns-ntp, ip-pools, tor-switch-design. Leave [] when they are ready or nobody said.
  - componentDepth: how far the customer wants each component taken, for operations, automation, networkingSecurity, kubernetesAi and efficiency: tier-1 (deployed), tier-2 (operationalized: run day to day with processes and ownership), tier-3 (business consumption: offered to the business as a service). null when not discussed.
  - industry: one of general-enterprise, healthcare-life-sciences, financial-services-insurance, manufacturing-retail-distributed, public-sector-education, digital-products-technology.
  - targetRelease: the ESXi release the platform should land on, "ESXi 9.0" or "ESXi 9.1", when stated.
  - planningNotes: anything else that shapes the plan and has no other field, in one to three sentences.
  - newHostsPurchased: hosts the customer is buying, for the management and the workload domains. Give 0 and 0 when they are reusing their existing hardware, and leave null when nobody said.
  - excludedHosts: host names the customer is leaving out of scope (retired or not moving), so they are left out of the compatibility check. Leave [] when every host is in scope.
  - domains: every VCF domain the plan delivers, one row each. kind is management or workload. pathway is greenfield (built new), import (an existing vCenter imported as a workload domain) or converge (an existing vCenter converged into a management domain). instance names the VCF instance or site the domain belongs to, so each workload domain follows its own management domain. hosts is the host count when known. notes holds what must happen first or what is special (for example "move the CORE 600 workloads first"). deferred is true only when the customer wants that domain after this entitlement; otherwise false. Leave [] when the domains are not yet decided.
  - outcomesWanted: what the customer wants from each area once the platform is in, which builds the adoption plan. List only outcomes the customer asked for or agreed to, using these names:
    - operations: lifecycle (lifecycle, certificates, passwords), observability (health, logs, diagnostics), capacity-cost (capacity and cost visibility, chargeback), custom-dashboards, identity-certificates (identity and privileged-access runbooks), event-integration (alerts into incident or ticketing tools)
    - automation: vm-self-service (VM catalog), infrastructure-as-code, day-2-automation (remediation and maintenance), governance (projects, quotas, policy), application-provisioning, data-services (database self-service)
    - networking: physical-fabric (VLANs, MTU, routing handoffs), edge-cluster-routing (NSX Edges, north-south routing), overlay-transport (NSX overlay segments), vpc, load-balancing (Avi), network-operations (network ownership and handover)
    - security: segmentation (microsegmentation), identity-rbac (roles and access), hardening-compliance, ids-ips, malware-prevention, identity-firewall, security-intelligence, waf
    - resilience: recovery-architecture (disaster recovery design), recovery-exercises (DR tests and runbooks), cyber-recovery (on-premises clean room), cloud-cyber-recovery
    - kubernetes: workload-domains (Supervisor and VKS), platform-operations (cluster lifecycle), developer-experience (developer access and guardrails)
    - privateAi: gpu-capacity, ai-guardrails (data and model governance), pilot-onboarding (a first AI pilot)
  - addOnsConsidered and notInterested use these names: vcf-operations, chargeback, vcf-automation, vcf-networks, nsx, vpc, vdefend, atp, acc, vks, private-ai, live-recovery, cloud-cyber-recovery, dsm, avi, hcx, memory-tiering. An add-on in addOnsConsidered is planned as follow-on scope, never built in this plan; list what the customer wants built now in outcomesWanted.
  - outOfScope: add-ons or outcomes the customer has ruled out entirely (same names as above, or an outcome such as observability). They are left out of the plan and the follow-on. Use notInterested for things the customer simply did not ask for.
- situation: short factual bullets about the estate and context that RVTools cannot show (new sites being built, hardware refreshes, deadlines).
- designProfile: one sentence each on the decided or proposed design for consumption, physical site configuration, availability, isolation (networking), recoverability, and expansion.
- designElements: per component (inventory, management domain, principal storage, networking, licensing, workloads, DR...): the requirement, the recommendation for this customer, and a gate when something must happen first.
- whatWeHeard: what the customer said about each component (goal, build path, storage, networking, DR, add-ons) and where it lands in the plan.
- problems: the operational problems the customer named, each with the capability that addresses it.
- openQuestions: scope decisions still open, with why we need the answer now.
- technicalItems: version minimums and platform constraints to confirm early, with the VCF documentation reference (part and heading).
- constraints: calendar or business constraints on the order of work (site dates, freezes, deadlines), who imposes them, and the effect on the sequence.
- customerAsks: what we need from the customer's team (decisions by a date, access, remediation they own).
- customerEffort: only when the customer gave its own estimate of its team's time: hours per week by role (platformLead, operations, network) for a phase (design, build, migration, customer-waves, capability, recovery, handover). Leave [] otherwise; CDW's planning estimate is used.
- customerOwnedWork: work the customer's team will run themselves (for example the remaining migration waves), with start and end months.
- openItems: every item still outstanding, what it gates, and the owner.
- personnel: for each work stream, the named CDW, Broadcom and customer people.
- milestonesToDate: what has already happened, with dates (entitlement start, discovery sessions, assessment delivered, kickoff).
- sources: the documents you used, with their dates.
- headline: one cover line that starts "Amazing happens when" and states the customer's outcome in their terms.
- revision: one or two sentences saying what this brief was built from and the date of the newest source.

JSON shape (fill every key; keep the structure exactly)
{
  "schemaVersion": 1,
  "asOf": "YYYY-MM-DD",
  "customer": { "name": null, "location": null, "segment": "commercial | corporate | null", "accountId": null, "primaryContact": null },
  "contacts": { "customer": [{ "name": "", "role": "" }], "cdw": [], "broadcom": [] },
  "entitlement": { "value": null, "hours": null, "termStart": null, "termEnd": null, "hoursConsumed": null, "consumedAsOf": null },
  "bsas": { "hours": null, "termStart": null, "termEnd": null },
  "schedule": { "projectStart": null, "implementationStart": null, "targetComplete": null, "hardwareLeadWeeks": null, "calendarConstraints": null },
  "deliveryModel": "CDW + Broadcom",
  "headline": null,
  "discovery": {
    "assessmentCompleted": null, "coreCount": null, "licensedCores": null, "vcfLicensed": null, "renewalDate": null, "addOnsPurchased": [],
    "currentPlatform": null, "enhancedLinkedMode": null, "networking": null, "vcenters": null, "datacenters": null, "edgeSites": null,
    "esxHosts": null, "vcfInstances": null, "storage": null, "storageSecondary": [], "serverVendor": null, "containerPlatform": null, "jumboFrames": null,
    "securityTooling": null, "drSolution": null, "backup": null, "hyperscalers": [],
    "newHostsPurchased": { "management": null, "workload": null },
    "plannedPath": null, "platformEdition": null, "consolidatedDomain": null, "vsphere8Strategy": null,
    "addOnsConsidered": [], "notInterested": [], "outOfScope": [],
    "sitePrerequisitesOpen": [], "componentDepth": { "operations": null, "automation": null, "networkingSecurity": null, "kubernetesAi": null, "efficiency": null },
    "industry": null, "targetRelease": null, "planningNotes": null, "excludedHosts": [],
    "domains": [{ "name": "", "kind": "management | workload", "pathway": "greenfield | import | converge", "instance": "", "hosts": null, "notes": "", "deferred": false }],
    "outcomesWanted": { "operations": [], "automation": [], "networking": [], "security": [], "resilience": [], "kubernetes": [], "privateAi": [] }
  },
  "situation": [],
  "designProfile": { "consumption": null, "physicalSite": null, "availability": null, "isolation": null, "recoverability": null, "expansion": null },
  "designElements": [{ "component": "", "requirement": "", "recommendation": "", "gate": null }],
  "whatWeHeard": [{ "component": "", "customerPosition": "", "whereItLands": "" }],
  "problems": [{ "problem": "", "addressedBy": "" }],
  "openQuestions": [{ "question": "", "whyNow": "" }],
  "technicalItems": [{ "item": "", "reference": "" }],
  "constraints": [{ "constraint": "", "imposedBy": "", "effect": "" }],
  "customerAsks": [],
  "customerOwnedWork": [{ "label": "", "start": "YYYY-MM", "end": "YYYY-MM" }],
  "customerEffort": [],
  "openItems": [{ "item": "", "gates": "", "owner": "" }],
  "personnel": [{ "workstream": "", "cdw": [], "broadcom": [], "customer": [] }],
  "milestonesToDate": [{ "date": "YYYY-MM-DD", "event": "", "detail": "" }],
  "sources": [{ "title": "", "date": "YYYY-MM-DD" }],
  "revision": null
}

Remove any example row you could not fill (an empty list is better than an empty row).
```
