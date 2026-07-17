# Release Validation Evidence

## Automated release gate

The release gate is:

```bash
pnpm test && pnpm check && pnpm build
```

The redesigned suite contains **eight Vitest assertions across two test files**. It covers browser-local inventory aggregation, deterministic readiness and sequencing, legacy-document migration, synchronized export rendering, safe download filenames, authenticated access, and secure logout behavior.

| Area | Evidence |
|---|---|
| Local multi-file parsing | Two RVTools-style CSV exports are parsed together; stable host and VM identifiers deduplicate repeated rows and preserve correct core, VM, power-state and version totals. |
| Assessment transparency | Older ESXi versions and entitlement-to-observed-core gaps are flagged; hardware certification remains explicitly unknown rather than inferred. |
| Deterministic sequencing | Hardware procurement, operations, automation, security and resilience lanes are produced from explicit inputs with no same-lane overlap. |
| Backward compatibility | A version-one manual-intake document migrates to the minimal version-two model while retaining customer, inventory, hardware lead-time, security priority and timeline context. |
| Synchronized rendering | Customer, inventory, readiness and timeline content are rendered from one versioned engagement object. |
| Token sanitization | Exported HTML contains no unresolved `[[...]]` placeholders. |
| HTML download | The authenticated procedure returns a safe filename and standalone document with the explicit “Generated without AI” provenance statement. |
| Business-data authorization | Unauthenticated engagement and export access is rejected. |
| Session handling | Logout clears the secure session cookie. |

## Inventory minimization evidence

`client/src/lib/rvtools.ts` uses the browser File API, `fflate`, and `DOMParser` to read XLSX/CSV content locally. There is no file-upload API procedure and no server-side RVTools parser. The parser stores only aggregate inventory facts and source metadata in the engagement document. Tests use RVTools-style CSV inputs to verify aggregation and stable-ID deduplication.

## Readiness boundary evidence

`assessReadiness()` produces evidence-based `good`, `attention`, or `unknown` results. Unknown is used for information RVTools cannot prove, including complete hardware/firmware/driver compatibility and network/identity/rack readiness. The UI and exported document both state that the result is a pre-assessment, not HCL certification or a final VCF deployment decision.

## Timeline editor evidence

`GanttEditor.tsx` retains editable lane names, lane creation/deletion/reordering, activity creation/deletion, constrained legend colors, milestone/deferred controls, whole-bar dragging, and independent start/end resize handles. The change guard rejects any edit that would overlap another activity in the same lane. “Rebuild plan” restores the transparent deterministic recommendation from the confirmed minimal inputs and aggregate inventory.

## Authentication boundary evidence

All engagement, preview, HTML and PDF procedures use the protected API contract. The unauthenticated surface is limited to the sign-in boundary, OAuth/session bootstrap, logout cookie clearing, and a non-data health probe. The self-hosted deployment additionally places the entire container behind the approved OIDC gateway and blocks direct access.

There is no AI drafting procedure, LLM client module, model configuration, model credential, or inventory-upload API.

## Visual and responsive review

The authenticated upload-first workspace was reviewed at desktop width. It presents the security boundary first, followed by the four-step flow: Upload, Customer, Timeline, and Review. A mobile breakpoint review is included in the final release gate. The interface retains the compact engagement rail, live Gantt editor, synchronized preview, and direct HTML/PDF downloads while removing the previous multi-track discovery burden.
