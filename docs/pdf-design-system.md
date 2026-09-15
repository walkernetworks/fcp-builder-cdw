# FCP Builder Print-First Document Design System

The FCP and Compatibility Delivery Handoff are **delivery documents**, not screenshots of the web workspace. Each PDF must establish a logical reading sequence, distinguish decisions from evidence, and use page space deliberately. The HTML source remains available for digital use, while the PDF output is optimized for a landscape Letter handoff artifact.

## Design Principles

The document hierarchy follows a simple rule: **decision first, executable plan second, evidence third**. A reader should understand the customer objective, entitlement boundary, selected pathway, immediate decisions, and next delivery action before reaching detailed registers. Long tables must preserve clear header-to-cell relationships and logical reading order, consistent with W3C PDF table guidance.[1] The reports also retain their HTML representation because federal accessibility guidance notes that PDFs are often less accessible and less mobile-friendly than HTML; when PDF is necessary, structure and verification must be intentional.[2]

| Principle | Implementation Standard |
| --- | --- |
| One purpose per page | Each sheet has one primary reader question and one dominant visual structure. |
| Decision before evidence | Summary, disposition, owner, and next action precede supporting detail. |
| Clear section sequence | FCP order is cover, executive plan, readiness, Entitlement Adoption Timeline, SOW register, Two-Year Notional, assumptions/handoff. |
| Deliberate timeline sheets | Entitlement Adoption Timeline is shown first. Two-Year Notional is always split into Month 1–12 and Month 13–24 sheets, with repeated category labels and legends. |
| Stable reading order | Headings, paragraphs, tables, and continuation sheets follow source order; no visually rearranged content that creates an ambiguous reading sequence. |
| Repeated table context | Multi-page registers repeat column headers and include a section or continuation label. |
| Minimum readable density | Primary body text targets 9–11 pt equivalent; timeline bar labels target 7–8 pt equivalent and never depend on horizontal overflow. |
| Controlled color | Navy establishes hierarchy, CDW red signals section identity or priority, and status colors supplement—but never replace—text labels. |
| Page economy | Blank trailing pages, half-empty continuation pages, and forced panel breaks without content are prohibited. |
| Explicit boundaries | Entitlement funding, 24-month directional planning, compatibility evidence limitations, and acceptance ownership remain clearly separated. |

## Shared Page Anatomy

Every substantive page uses a compact running header, a clear section number, a one-sentence purpose statement, and a page footer with document title, customer/account identifier, confidentiality label, and page number. Section-opening pages may use a dark navy band, while continuation pages use a lighter header to preserve reading space.

| Element | Standard |
| --- | --- |
| Cover | Customer, document name, purpose, target release, entitlement dates where relevant, evidence/catalog date where relevant, and document status. |
| Section header | Eyebrow, numbered title, concise reader question, and optional status badge. |
| Fact strip | Three or four metrics maximum, each with a short label and one supporting line. |
| Callout | One decision, boundary, or escalation statement; avoid stacking multiple notices. |
| Table | Short primary cells, consistent headers, visible row grouping, no paragraph-length evidence in the main register. |
| Continuation | Repeated section title and column headers, plus “continued” or the covered month/window. |
| Footer | Document, customer/account, confidentiality, and page number. |

## FCP Document Sequence

| Order | Section | Reader Question |
| ---: | --- | --- |
| 1 | Cover | What is this plan and for whom? |
| 2 | Executive Plan on a Page | What is funded, selected, and ready to move? |
| 3 | Scope and VCF Pathway | What design and implementation outcomes are included? |
| 4 | Compatibility and Delivery Gates | What technical conditions affect sequence? |
| 5 | Entitlement Adoption Timeline | What work draws down the entitlement, when, and under which owner? |
| 6 | High-Level SOW Register | What are the work packages, outcomes, dependencies, and acceptance directions? |
| 7 | Two-Year Notional — Months 1–12 | What is the first-year directional adoption view? |
| 8 | Two-Year Notional — Months 13–24 | What continues or expands after the first year? |
| 9 | Assumptions and Handoff | What must delivery validate before mobilisation? |

## Compatibility Handoff Sequence

| Order | Section | Reader Question |
| ---: | --- | --- |
| 1 | Cover | What release, catalog, and estate does this evidence pack address? |
| 2 | Decision Summary | How many hosts can progress, are blocked, or need evidence? |
| 3 | Action Register | Who owns each blocking or validation action, and what releases the gate? |
| 4 | Cohort Decision Register | Which server/CPU cohorts have which release disposition? |
| 5 | Detailed Cohort Evidence | What catalog identity, release matrix, sources, and future boundary support each decision? |
| 6 | Blockers and Warnings | Which consolidated findings affect delivery sequence? |
| 7 | Advisories and Information | Which non-blocking findings shape implementation planning? |
| 8 | Evidence Coverage and Handoff Checklist | What remains unverified, who owns it, and what must be confirmed? |

## References

[1]: https://www.w3.org/WAI/WCAG22/Techniques/pdf/PDF20 "W3C WAI — PDF20: Table structure and logical relationships"
[2]: https://www.section508.gov/create/pdfs/ "Section508.gov — Create Accessible PDFs"
