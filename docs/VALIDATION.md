# Release Validation Evidence

## Automated release gate

The final release gate is:

```bash
pnpm test && pnpm check && pnpm build
```

The current build passes **7 Vitest assertions across two test files**, TypeScript compilation, the Vite production client build, and the bundled Node server build.

| Area | Evidence |
|---|---|
| Authentication | Unauthenticated engagement access is rejected. The logout procedure clears the secure session cookie. |
| Meridian golden scenario | The deterministic draft asserts a four-month Dell hardware gate, three HCX waves, SRM/DR, VDefend inclusion, deferred acceleration, no Kubernetes/app-platform lane, and no same-lane overlap. |
| Timeline integrity | Same-lane overlap is detected; concurrency is represented across distinct lanes. |
| Synchronized rendering | Adoption Sequence, Private Cloud Gantt, Two-Year Gantt, Executive Roadmap, and Forward Delivery Plan are all present in one rendered document. |
| Token sanitization | Exported HTML contains no unresolved `[[...]]` placeholders. |
| HTML download | The authenticated procedure returns a safe filename, correct MIME type, customer content, and token-free standalone HTML. |
| PDF download | A local smoke test rendered the same standalone HTML through `/usr/bin/chromium`, producing a 285,194-byte PDF from 18,648 bytes of HTML. |

## Visual editor evidence

`GanttEditor.tsx` implements editable lane names, lane creation and deletion, explicit up/down lane reordering, activity creation and deletion, direct bar-label and stage-boundary edits, constrained legend colors, milestone/deferred controls, whole-bar dragging, and independent start/end resize handles. The `changeBar` guard rejects any edit that would overlap another bar in the same lane.

## Authentication boundary evidence

All engagement, AI drafting, preview, HTML, and PDF procedures use the protected API contract. The unauthenticated surface is limited to the sign-in boundary, OAuth/session bootstrap, logout cookie clearing, and a non-data health probe. The self-hosted deployment additionally places the entire container behind the approved OIDC gateway and blocks direct container access.

## Visual and responsive review

The authenticated first-run workspace was reviewed at 1280×720 and 390×844. The desktop layout uses a compact engagement rail, an operational header, a three-step consulting workflow, and a timeline planning motif. The mobile layout stacks the same content without horizontal clipping or the previous empty-list spacer. The unauthenticated route was separately verified to expose only the protected CDW sign-in boundary.

## Known release note

The production client currently emits a non-failing Vite warning because the primary JavaScript chunk is larger than 500 kB after minification. This does not affect correctness; code splitting can be considered in a later performance-hardening pass.
