# Copilot prompt for the customer brief

Paste this into Microsoft Copilot together with the customer's meeting notes, transcripts and questionnaire answers (or ask Copilot to find them). Save the JSON it returns as a `.json` file and import it on the **Upload** step under **Customer brief**. The same text is available from the app's **Copy Copilot prompt** button; the source is `shared/briefPrompt.ts`.

```text
You are preparing a customer brief for a CDW VMware Cloud Foundation (VCF) engagement. Read the meeting notes, transcripts, emails and questionnaire answers I give you (or that you can find for this customer) and return ONE JSON object in exactly the shape below. Return only the JSON, with no commentary before or after it.

Rules
- Use only facts that are stated in the sources. Never estimate or invent numbers, dates, hours, core counts or names.
- If something is not stated, use null for a single value or [] for a list. Do not write "TBD" or "unknown".
- Dates are YYYY-MM-DD. Months alone (customerOwnedWork) are YYYY-MM.
- Quote the customer's own words where you record their position or goals.
- Do NOT include rates, PO values, work authorization or project numbers, or any Broadcom segment (Corporate, Strategic, Commercial pricing tier).
- Do NOT use the words "readiness", "workshop" or "TRW". Call discovery work "design discovery" and describe it in design terms.
- Write to the customer, not about them ("Keep the existing array", not "the customer refuses to change storage").

What each section is for
- customer, contacts: who the customer is and who is involved (customer, CDW, Broadcom), with roles.
- entitlement: the services entitlement. value is the entitlement dollar value (the only dollar figure the report may show). hours is the entitled hours from the signed resource assignments. hoursConsumed and consumedAsOf come from the latest consumption record. extension only when an extension is APPROVED: give both the new date and who approved it, otherwise leave both null.
- discovery: answers to the discovery questionnaire (RVTools export, licensing and core counts, current versions, Enhanced Linked Mode, networking, vCenters, data centers, edge sites, ESX hosts, storage, hardware vendor, container platform, network details, jumbo frames, security tooling, DR, backup, hyperscalers, new hardware purchased, planned path, consolidated domain, add-ons considered or not wanted).
  - plannedPath: one of greenfield, in-place, converge, import-workload-domain, hybrid, design-only, undecided.
  - platformEdition: vcf or vvf (VMware vSphere Foundation) when the customer is licensed for VVF only.
  - storage: vsan, nfs-v3, vmfs-fc, other-existing, or undecided.
  - consolidatedDomain: true for one consolidated management and workload domain (usually 10 hosts or fewer).
  - assessmentCompleted: true when a VCF assessment or compatibility assessment has already been delivered.
  - addOnsConsidered and notInterested use these names: vcf-operations, chargeback, vcf-automation, vcf-networks, nsx, vpc, vdefend, atp, acc, vks, private-ai, live-recovery, cloud-cyber-recovery, dsm, avi, hcx, memory-tiering.
- situation: short factual bullets about the estate and context that RVTools cannot show (new sites being built, hardware refreshes, deadlines).
- designProfile: one sentence each on the decided or proposed design for consumption, physical site configuration, availability, isolation (networking), recoverability, and expansion.
- designElements: per component (inventory, management domain, principal storage, networking, licensing, workloads, DR...): the requirement, the recommendation for this customer, and a gate when something must happen first.
- whatWeHeard: what the customer said about each component (goal, build path, storage, networking, DR, add-ons) and where it lands in the plan.
- problems: the operational problems the customer named, each with the capability that addresses it.
- openQuestions: scope decisions still open, with why we need the answer now.
- technicalItems: version minimums and platform constraints to confirm early, with the VCF documentation reference (part and heading).
- constraints: calendar or business constraints on the order of work (site dates, freezes, deadlines), who imposes them, and the effect on the sequence.
- customerAsks: what we need from the customer's team (decisions by a date, access, remediation they own).
- customerOwnedWork: work the customer's team will run themselves (for example the remaining migration waves), with start and end months.
- openItems: every item still outstanding, what it gates, and the owner.
- personnel: for each work stream, the named CDW, Broadcom and customer people.
- milestonesToDate: what has already happened, with dates (entitlement start, discovery sessions, assessment delivered, kickoff).
- resourceAssignments: ONLY if signed resource assignments exist, hours by work stream for Architect, Sr. Consultant and Project Manager; otherwise null.
- sources: the documents you used, with their dates.
- headline: one cover line that starts "Amazing happens when" and states the customer's outcome in their terms.
- revision: one or two sentences saying what this brief was built from and the date of the newest source.

JSON shape (fill every key; keep the structure exactly)
{
  "schemaVersion": 1,
  "asOf": "YYYY-MM-DD",
  "customer": { "name": null, "location": null, "segment": "commercial | public-sector | null" },
  "contacts": { "customer": [{ "name": "", "role": "" }], "cdw": [], "broadcom": [] },
  "entitlement": { "value": null, "hours": null, "termStart": null, "termEnd": null, "hoursConsumed": null, "consumedAsOf": null, "extension": { "to": null, "approvedBy": null } },
  "deliveryModel": "CDW + Broadcom",
  "headline": null,
  "discovery": {
    "assessmentCompleted": null, "coreCount": null, "licensedCores": null, "vcfLicensed": null, "renewalDate": null, "addOnsPurchased": [],
    "currentPlatform": null, "enhancedLinkedMode": null, "networking": null, "vcenters": null, "datacenters": null, "edgeSites": null,
    "esxHosts": null, "vcfInstances": null, "storage": null, "serverVendor": null, "containerPlatform": null, "jumboFrames": null,
    "securityTooling": null, "drSolution": null, "backup": null, "hyperscalers": [],
    "newHostsPurchased": { "management": null, "workload": null },
    "plannedPath": null, "platformEdition": null, "consolidatedDomain": null,
    "addOnsConsidered": [], "notInterested": []
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
  "openItems": [{ "item": "", "gates": "", "owner": "" }],
  "personnel": [{ "workstream": "", "cdw": [], "broadcom": [], "customer": [] }],
  "milestonesToDate": [{ "date": "YYYY-MM-DD", "event": "", "detail": "" }],
  "resourceAssignments": null,
  "sources": [{ "title": "", "date": "YYYY-MM-DD" }],
  "revision": null
}

Remove any example row you could not fill (an empty list is better than an empty row).
```
