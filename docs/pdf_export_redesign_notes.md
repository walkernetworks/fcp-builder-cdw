# PDF Export Redesign Notes

## Opening-page issues observed in user-supplied export

| Page | Observed issue | Why it feels unprofessional |
|---|---|---|
| 1 | The cover and the first content sections share the same page, causing the hero, KPI cards, and the start of the summary to compete for attention. | The document lacks a clean cover-to-content transition and reads like a web screen captured into PDF rather than an executive report. |
| 1 | The "Plan on a Page" heading appears at the bottom of page 1 with no content beneath it. | This creates an orphaned section heading and signals weak pagination control. |
| 2 | The two-column summary cards begin abruptly and look text-heavy, with inconsistent balance between the left and right columns. | The page lacks hierarchy and breathing room, making the opening summary feel dense instead of curated. |
| 2-3 | Summary cards and narrative blocks use web-style rounded panels with tight spacing, producing a crowded dashboard aesthetic. | A print document needs clearer section rhythm, stronger typography, and fewer competing containers. |
| 3-4 | Large section headings are followed by sparse whitespace or broken continuation across pages. | The content flow does not appear intentionally composed for page boundaries. |
| 1-4 | The early pages rely heavily on bordered cards and colored accents without a clear executive-document grid. | The pages feel like exported UI components rather than a designed report. |

## Initial redesign direction

The PDF should open with a dedicated cover page, followed by a deliberately structured executive summary page that groups estate facts, engagement scope, and plan summary into a calm print-oriented hierarchy. Early sections should use controlled page breaks, fewer card outlines, stronger typography, and explicit print spacing rules so headings never appear without at least a small body block beneath them.

## Approved print-first layout system

The redesigned export will use a deliberate four-part opening sequence. The first page will be a dedicated cover with customer name, concise purpose statement, engagement metadata, and controlled visual branding only. The second page will be an executive snapshot with a restrained estate/entitlement fact strip, a concise engagement narrative, and a clear planning posture. The detailed plan summary will start on a new page rather than competing with the cover. Planning considerations and inventory evidence will begin on their own controlled pages.

The print visual language will reduce rounded-card density, replace most shadows with fine rules and white space, use restrained CDW red rules as section markers, and establish stable type scale. Print-only CSS will disable interactive chrome, create explicit page breaks, prevent orphaned headings, reduce page margins consistently, and repeat the confidential document context through a lightweight footer. The browser preview will remain functional and visually coherent, while the PDF path will favor page composition over dashboard behavior.

## Visual review of redesigned preview

| Page | Result | Remaining issue |
|---|---|---|
| 1 | The new cover page has clear hierarchy, restrained branding, and professional spacing. | No major defect observed. |
| 2 | The executive snapshot page reads cleanly and no longer looks like a crowded web dashboard. | Minor copy density on the right column can be tuned later, but it is acceptable. |
| 3 | A blank page appears between the executive snapshot and the "Plan on a Page" content. | This is the primary remaining defect and likely comes from the print page-break behavior around the summary wrapper and its full-page sections. |
| 4 | The "Plan on a Page" layout is much stronger than before, with better spacing and card rhythm. | It should move forward one page once the blank intermediary page is removed. |

The next fix should remove the unintended blank page while preserving the dedicated cover page and the separate executive summary / plan summary sequencing.

## Final opening-page verification

The redesigned preview now resolves the primary professionalism issue from the user-supplied export.

| Page | Outcome |
|---|---|
| 1 | Cover page has a clean executive-document appearance with clear hierarchy, restrained metadata, and controlled branding. |
| 2 | Executive snapshot page reads as a deliberate briefing page rather than a compressed web dashboard. |
| 3 | The prior blank intermediary page has been removed. The "Plan on a Page" content now appears immediately after the executive snapshot. |
| 4 | Subsequent planning content begins cleanly after the redesigned opening sequence. |

A remaining polish note is that the executive snapshot narrative column is still text-heavy, but it now fits correctly and no longer forces a blank overflow page.
