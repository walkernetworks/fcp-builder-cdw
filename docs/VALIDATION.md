# Release Validation Evidence

## Automated release gate

The release gate is:

```bash
pnpm test && pnpm check && pnpm build
```

The suite contains **eleven Vitest assertions across two test files**. It covers browser-local inventory aggregation, entitlement fields, month generation, Plan/Design-only defaults, two-year planning, pointer-gesture transitions, legacy-document migration, synchronized export rendering, safe download filenames, authenticated access, and secure logout behavior.

| Area | Evidence |
|---|---|
| Local multi-file parsing | Two RVTools-style CSV exports are parsed together; stable host and VM identifiers deduplicate repeated rows and preserve correct core, VM, power-state, and version totals. |
| Entitlement term | Inclusive month columns are built from the entitlement start and end dates. A separate sequence always contains 24 calendar months. |
| Plan and Design defaults | Generated and user-edited labels normalize to title-style Plan or Design language, and excluded phase labels are absent from both adoption views. |
| Backward compatibility | Earlier engagement documents migrate to version three with entitlement value, entitlement dates, normalized activity labels, and rebuilt calendar-month views. |
| Synchronized rendering | Customer, entitlement, inventory, planning considerations, Adoption Timeline, and Two-Year Notional Adoption Plan render from one versioned engagement object. |
| Token sanitization | Exported HTML contains no unresolved `[[...]]` placeholders. |
| HTML download | The authenticated procedure returns a safe filename and standalone document containing both adoption views. |
| Business-data authorization | Unauthenticated engagement and export access is rejected. |
| Timeline pointer gestures | The same pure transition function used by the editor is tested for whole-activity month movement, independent start/end edge resizing, grid-bound rejection, and same-workstream overlap rejection. |
| Session handling | Logout clears the secure session cookie. |

## Inventory minimization evidence

`client/src/lib/rvtools.ts` uses the browser File API, `fflate`, and `DOMParser` to read XLSX/CSV content locally. There is no file-upload API procedure and no server-side RVTools parser. The parser stores only aggregate inventory facts and source metadata in the engagement document. Tests use RVTools-style CSV inputs to verify aggregation and stable-identifier deduplication.

## Planning-consideration boundary evidence

The assessment function produces evidence-based `good`, `attention`, or `unknown` results for inventory-observable facts. Unknown is used for information RVTools cannot prove, including complete hardware/firmware/driver compatibility and network, identity, or facilities requirements. These observations are shown separately and are not inserted as activities on either adoption plan.

## Adoption Timeline editor evidence

`AdoptionTimelineEditor.tsx` provides editable workstream and activity names, lane creation/deletion/reordering, activity creation/deletion, constrained legend colors, whole-activity dragging, independent start/end resize handles, and explicit month selectors. Pointer movement calls the shared `applyTimelineGesture` transition, whose drag, edge-resize, bounds, and same-workstream collision behavior is covered directly by Vitest. The editor is used for both the entitlement-term Adoption Timeline and the separate Two-Year Notional Adoption Plan.

## Authentication boundary evidence

All engagement, preview, HTML, and PDF procedures use the protected API contract. The unauthenticated surface is limited to the sign-in boundary, OAuth/session bootstrap, logout cookie clearing, and a non-data health probe. The self-hosted deployment additionally places the entire container behind the approved OIDC gateway and blocks direct access.

## Visual and responsive review

The authenticated workspace is reviewed at desktop and mobile widths, including the directly opened Adoption Timelines tab. The screenshots confirm contained horizontal month canvases, a sticky and readable workstream column, touch-sized drag/resize handles, explicit start/end month selectors, and access to both editable adoption views without page-width overflow. Pointer behavior is backed by the repeatable transition tests above. Preview, HTML, and PDF exports remain synchronized with the two editable adoption views.
