# FCP Report Formats: Shorter, Split by Audience

Recommendation for cutting the FCP down, based on the 15-page Acme Health sample and what Broadcom's program terms actually require.

## The short version

The 15-page FCP is trying to serve three readers at once: the customer, Broadcom, and CDW delivery. Trimming it won't fix that. Splitting it by reader will. One plan, three renders:

| Output | Reader | Length | Goes to |
|---|---|---|---|
| **Summary FCP** | Commercial customers | 3 pages (2 when there is no follow-on work) | Customer |
| **Standard FCP** | Corporate and Strategic customers, Broadcom approval | 6 to 7 pages | Customer and Broadcom |
| **Delivery Handoff** | CDW delivery team | As long as it needs | Internal only |

Nothing is lost. Everything cut from the customer documents moves to the Handoff, which gives delivery more than they get today, not less. All three render from the same document and effort data, so there's nothing new to enter.

---

## 1. What Broadcom actually requires

No partner has published a sample FCP, and the term itself doesn't appear in public Broadcom material; it lives in the partner portal. The public source that defines the obligation is Broadcom's VCF Services Entitlement program document (Nov 2024). It says:

- The entitlement starts with an initial allocation of up to **100 combined hours** of a Project Manager and an Architect for "the creation of **implementation architecture, capability roadmap and adoption plan**."
- Every further redemption is documented in a services Transaction Document that sets out **"the scope, estimated effort, and value to be deducted."**
- The entitlement is usable only in the first 12 months and "is not subject to any extension or refund upon its expiry."

Broadcom's VCF Jumpstart Workshop, its own version of the same planning exercise, produces the same set: an adoption plan and architecture, a capability roadmap, and phases and milestones.

So the box Broadcom checks has five items:

| Broadcom needs | Where it lives in the FCP |
|---|---|
| Implementation architecture | Design profile (6 lines) |
| Capability roadmap | Two-year notional (1 page) |
| Adoption plan | Timeline and key dates |
| Scope and estimated effort | Work package list with hours |
| Value to be deducted | Entitlement value and term |

That fits on two or three pages. The remaining twelve pages of the current FCP are delivery detail and internal planning mechanics.

**Open item, the real answer to "check the box":** the public program document is from Nov 2024 and doesn't define an FCP checklist. Ask the Broadcom PS counterpart or check the partner portal for the current FCP acceptance criteria or template before locking the formats. If Broadcom has a required section list, the Standard FCP should mirror its headings exactly.

---

## 2. Where the 15 pages go

| Page | Content today | Summary (Commercial) | Standard (Corp/Strat) | Handoff |
|---|---|---|---|---|
| 1 | Cover | Keep | Keep | |
| 2 | Title, KPI tiles, situation, plan on a page | Keep, tighter | Keep | |
| 3 to 4 | Burndown; work packages with role splits and descriptions | Name, month, hours only | Add one-line outcome and "accepted when" | Full, with role splits |
| 5 | Scope by bucket, scope moves, under-funded note, follow-on table | One line: what comes after | Follow-on table only | Full, including buckets and gap |
| 6 to 7 | Estimating basis (25 rows) | Drop | Drop | Full |
| 7 | Customer effort by week, customer-run work, personnel | One line: peak weekly ask | Compact table | Full |
| 8 | Who is involved, what we know about the estate | Primary contact only | Contacts | Full estate facts |
| 9 | Design profile, design elements | 3-line architecture summary | Design profile | Design elements with gates |
| 10 | Compatibility | Drop | One-line status | Full evidence |
| 11 | Timeline, milestones to date, key dates | Keep | Keep | Keep |
| 12 to 13 | Two-year notional, two sheets | Drop | One page | |
| 13 | Recommendation summary, what we heard, problems | 3 to 4 sentence synopsis | Keep | |
| 14 | Open questions, technical items, constraints, commitments, open items | Commitments and open items, 3 each max | Add constraints and decisions needed | Full, including technical items |
| 15 | Closing page, mostly blank | Drop | Fold into the last page | |

---

## 3. Summary FCP (Commercial): 3 pages

The customer reads this in two minutes and knows what's happening, when, and what they owe.

**Page 1: The plan**
- Header line: customer, platform (VCF 9.1), path (greenfield), delivery model, version and issue date.
- Fact strip: entitlement value (the one dollar figure), hours, term dates, plan start.
- **What we're doing:** 3 to 4 sentences. "CDW designs and builds a new VCF 9.1 foundation on new hardware, moves your workloads over in waves, and hands the platform to your team with a runbook. Disaster recovery design follows in year two."
- **In this plan / Not in this plan:** one line each by category, from the existing plan-on-a-page data.
- **Architecture at a glance:** 3 lines (platform and topology; storage and network; recovery approach). This covers Broadcom's architecture item.
- **Work packages:** compact table, three columns: package, month, hours. One total. No role split, no descriptions. This covers scope and effort.

**Page 2: The timeline**
- The entitlement-window Gantt (existing, unchanged).
- **Key dates:** 5 at most.
- **What we need from you:** customer commitments and open items with owners, 3 each at most.
- **After this plan:** one sentence naming the follow-on work and its hours, pointing to page 3.

**Page 3: After the entitlement**
- The second year of the two-year view as a Gantt, starting the month after the entitlement ends (or after planned completion when no entitlement is booked).
- **Follow-on work:** package, month, hours, with a total. Hours only.
- **How it's funded:** not drawn from the current entitlement; needs a renewal with a services entitlement, a services purchase, or BSAS hours. When BSAS exists, state its hours, term and forfeiture here, hours and dates only. One line on why it matters, drawn from the customer problems the follow-on work addresses; omit it if there are none.
- Page 3 prints only when there is follow-on or notional work. Otherwise the Summary is 2 pages.
- This page covers Broadcom's capability-roadmap requirement for Commercial deals.

---

## 4. Standard FCP (Corporate and Strategic): 6 to 7 pages

Same spine, with the depth a Broadcom approver and a larger customer team expect.

1. **Cover**
2. **Summary:** KPI tiles, synopsis, plan on a page, recommendation summary, document control (from the versioning work)
3. **Scope and architecture:** in and out of scope, design profile (6 rows), what we heard and where it lands
4. **Work packages:** window, lead role, hours by role, one-line outcome, accepted when
5. **Timeline:** Gantt, milestones to date, key dates
6. **Roadmap:** two-year notional on one page, follow-on table in hours
7. **Working together:** customer effort (compact), commitments, sequencing constraints, decisions needed by date, open items, who's involved

**As built** (`server/fcpStandardRenderer.ts`, 7 pages, fewer when a page has nothing to show). It reuses the Summary's parts (`summaryParts` in `server/fcpSummaryRenderer.ts`), so the tiles, the short-labelled timeline with its filtered key, the key dates and the funding wording are the same code in both formats. Differences from the mockup, all deliberate:

- **Approvals are by email, and no format carries signature lines.** Document control prints "To approve this plan, reply to the email it was sent with." on every version. The approval is recorded in the tracker with an email reference (who replied, date, subject) in the note. The Standard has no acceptance block (name, title, date, signature).
- **Document control** prints version, issue date, the issue it supersedes and the revision line. It does not print the status of this version's approvals: an issued version is a stored snapshot, so a printed "Pending" would be wrong as soon as an approval is recorded. The Supersedes line carries the recorded email approvals of the version it replaces ("Version 1, approved by Broadcom <date> and by <customer> <date>").
- **Tiles** are the Summary's (value, hours remaining, plan start, end), not days to expiry and weekly pace.
- **Decisions needed** is not a separate table: the dated decisions are a commitment line today, because the report model has no decision list with owners and dates.
- **Hours by role for delivered work** are blank: consumption is recorded as a total.
- **Default.** Corporate and Strategic (and a record with no segment) now default to Standard. "Full report" stays as an override for the long report.

---

## 5. Delivery Handoff (internal)

Everything delivery needs to pick up the engagement without a re-discovery call. Marked internal and never sent to the customer.

- Estimating basis with every assumption and its source
- Estate facts (what we know about the estate)
- Compatibility evidence: fold in or link the existing Compatibility Delivery Handoff, which already carries the full server evidence
- Design elements with gates
- Technical items to confirm early
- Scope by bucket, scope moves, reserve, and the under-funded gap
- Signed resource assignments by role and package
- Open questions with why they matter
- Full contact list and customer-run work

This is also the right home for the hours mechanics that currently confuse the customer document (see section 7).

---

## 6. Rules that keep it short

- **Format follows the tracker segment.** Commercial gets Summary; Corporate and Strategic get Standard. This lines up with the stage model, where only Corporate and Strategic go through Broadcom Approval. Allow an override per export, recorded on the issued version. Use the tracker segment, not the FCP's Commercial plan setting; that field controls plan generation, not document length.
- **Empty sections never print.** No compatibility section with no evidence, no burndown before any hours are consumed, no notional sheet that only continues bars from the previous one.
- **The customer sees funded scope.** Overage, buckets and reserve mechanics go to the Handoff.
- **Hours reconcile on the page.** Hours already delivered plus hours planned must equal the entitlement. Delivered hours print as their own "Delivered to date" row, and the plan only schedules what remains. The Acme sample planned 347 future hours while 39 of 262 were already used; the mockups show the corrected accounting (39 delivered + 223 planned = 262).
- **Hard caps in the renderer.** Key dates 5, commitments 3, open items 3 in Summary (with "see the full list in the Standard FCP" if more exist). Caps keep the format from creeping back up.
- **No new data entry.** All three formats render from the same document and effort.

---

## 7. Problems in the sample to fix regardless of format

These showed up reading the Acme Health PDF and should be fixed whichever direction you go:

1. **The internal gap prints to the customer.** Page 5 says the plan needs "106 hours more than it funds." The renderer's own rule says the customer document never shows the gap. Move it to the Handoff.
2. **The plan doesn't visibly fit its funding.** The customer sees 347 planned hours against a 262-hour entitlement on facing pages. That reads as a plan that's already over budget, and a Broadcom reviewer will ask the same question. The customer document should show the funded scope and the follow-on separately.
3. **Compatibility contradicts the estimating basis.** Page 10 says "No host evidence yet," while page 6 lists 14 hosts "from RVTools or the brief." Either the hosts came from the brief or the RVTools import didn't populate readiness. Worth checking.
4. **Near-empty pages.** Page 15 is a closing line on a blank page, and the second notional sheet (page 13) mostly repeats bars from the first.
5. **"Condensed" still shows in the page header.** Already planned for removal.

---

## 8. Build notes

- Add a report format option (`summary`, `standard`) to `renderCondensedFcpHtml`, defaulting from the tracker segment, the same pattern as the draft watermark option. A missing option renders today's output so existing goldens stay byte-identical until a change is intended.
- The Handoff is a second renderer, or an extension of the existing Compatibility Delivery Handoff renderer, which already exists and is staying.
- Golden fixtures per format: Acme Health as Commercial Summary, Meridian Health as Corporate Standard, plus one Handoff.
- The issued version stores which format the customer received.

## Sources

- [VCF Services Entitlement Specific Program Documentation (Broadcom, Nov 2024)](https://ftpdocs.broadcom.com/cadocs/0/contentimages/VCF_Services_Entitlement_SPD_Nov_2024.pdf)
- [Set Your Implementation Up for Success with VCF Jumpstart Workshops (VMware Cloud Foundation blog)](https://blogs.vmware.com/cloud-foundation/2025/09/30/set-your-implementation-up-for-success-with-vcf-jumpstart-workshops/)
- [Make the Most of Your VMware Broadcom Professional Services Entitlement (Entelligence)](https://entelligence.com/blog/vmware-broadcom-professional-services-entitlement)
- [Driving VMware Cloud Foundation Adoption with Expert Advantage (Broadcom)](https://www.broadcom.com/company/news/articles/partner-spotlight/driving-vmware-cloud-foundation-vcf-adoption-expert-advantage-ecosystem)
