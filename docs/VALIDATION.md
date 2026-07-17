# Release Validation Evidence

## Automated release gate

The release gate is:

```bash
pnpm test && pnpm check && pnpm build
```

The suite contains **thirty Vitest assertions across six test files**. It covers browser-local inventory aggregation, direct per-platform ESXi correlation, entitlement fields, monthly and weekly window generation, VCF 9.1 platform prechecks across all status states, Upgrade Services sequencing with parallel Plan and Design work, detailed customer-confirmed capability activities, V3-to-V6 and legacy-document migration, synchronized export rendering, safe download filenames, browser Blob-download lifecycle, PDF decoding and signatures, authenticated access, hosted-preview OAuth URL construction, return-path preservation, open-redirect rejection, stale engagement selection recovery, and secure logout behavior.

| Area | Evidence |
|---|---|
| Local multi-file parsing | Two RVTools-style CSV exports are parsed together; stable host and VM identifiers deduplicate repeated rows and preserve correct core, VM, power-state, global-version totals, and per-platform ESXi distributions. |
| Execution scheduling | The operational plan supports inclusive calendar-month or exact weekly windows beginning on the selected target-start date. The separate strategic outlook always contains 24 calendar months. |
| Upgrade Services sequence | Generated adoption views begin VCF 9.1 Upgrade Services at the entitlement start while initial Platform Plan and Platform Design work overlaps where appropriate; removed consumption-plan timeline labels are absent. |
| VCF 9.1 platform precheck | RVTools vendor, model, CPU, host-count, core, and correlated ESXi evidence classifies candidates, upgrade-required, review-required, and unavailable platforms while preserving the formal Compatibility Guide boundary. |
| Backward compatibility | Earlier engagement documents migrate to version six with refreshed VCF 9.1 platform prechecks, clearly marked estate-wide ESXi evidence where direct historic correlation is unavailable, Upgrade Services sequencing, detailed adoption inputs, entitlement value, entitlement dates, normalized activity labels, and rebuilt cadence-aware execution views. |
| Synchronized rendering | Customer, entitlement, inventory, per-platform VCF 9.1 prechecks, planning considerations, the Operational Adoption Timeline, and the Two-Year Notional Adoption Outlook render from one versioned engagement object. |
| Token sanitization | Exported HTML contains no unresolved `[[...]]` placeholders. |
| HTML and PDF downloads | Protected export-ticket issuance and signed binary routes return safe filenames and valid attachment responses; tests verify ownership, MIME types, content-disposition headers, no-store behavior, non-empty bytes, PDF signatures, and malformed or tampered payload rejection. |
| Business-data authorization | Unauthenticated engagement and export access is rejected. |
| Timeline pointer gestures | The same pure transition function used by the editor is tested for whole-activity movement, independent start/end edge resizing, grid-bound rejection, and same-workstream overlap rejection; the editor applies the behavior to both month and week columns. |
| Hosted-preview sign-in | The protected entry exposes the explicit **Sign in with Manus** action. Tests verify the hosted callback URL, preserved local return path, and rejection of absolute or protocol-relative post-login destinations. |
| Engagement recovery | The workspace prevents a stale selected ID from reaching the engagement query until the owner-scoped list confirms it is current. Tests prove stale IDs fall back to a valid record or empty state, while a record removed between list and get returns `null` rather than a visible API error. |
| Session handling | Logout clears the secure session cookie. |

## Inventory minimization evidence

`client/src/lib/rvtools.ts` uses the browser File API, `fflate`, and `DOMParser` to read XLSX/CSV content locally. There is no file-upload API procedure and no server-side RVTools parser. The parser stores only aggregate inventory facts and source metadata in the engagement document. Tests use RVTools-style CSV inputs to verify aggregation and stable-identifier deduplication.

## Planning-consideration boundary evidence

The assessment function produces evidence-based `good`, `attention`, `info`, or `unknown` results for inventory-observable facts. It also derives per-platform VCF 9.1 precheck categories—`candidate`, `upgrade-required`, `review-required`, and `unavailable`—from RVTools vendor, model, CPU, host-count, core, and observed ESXi evidence. New imports correlate ESXi distributions to the same RVTools host rows; migrated reports label inherited ESXi evidence as estate-wide rather than claim a unique platform correlation. Those categories and lifecycle observations are deliberately not certifications: the exact server, CPU, adapters, storage controllers, firmware, drivers, and vSAN/ReadyNode configuration remains subject to the [Broadcom Compatibility Guide](https://compatibilityguide.broadcom.com/). These observations are shown separately and are not inserted as activities on either adoption plan.

## Adoption Timeline editor evidence

`AdoptionTimelineEditor.tsx` provides editable workstream and activity names, lane creation/deletion/reordering, activity creation/deletion, constrained legend colors, whole-activity dragging, independent start/end resize handles, and explicit cadence-aware week or month selectors. Pointer movement calls the shared `applyTimelineGesture` transition, whose drag, edge-resize, bounds, and same-workstream collision behavior is covered directly by Vitest. The editor is used for the operational adoption timeline and the separate two-year strategic outlook.

## Authentication boundary evidence

All engagement and preview procedures use the protected API contract. HTML/PDF download tickets are issued only by a protected procedure, and the binary attachment route accepts only short-lived signed tickets bound to the authenticated owner and engagement. The unauthenticated surface is limited to the sign-in boundary, OAuth/session bootstrap, logout cookie clearing, and a non-data health probe. The protected entry calls a pure OAuth URL builder only after the user selects **Sign in with Manus**. Its signed state preserves the current local path through the callback, while `sanitizeOAuthReturnPath` rejects absolute and protocol-relative destinations before the server redirects. The self-hosted deployment additionally places the entire container behind the approved OIDC gateway and blocks direct access.

## Visual and responsive review

The authenticated workspace is reviewed at desktop and mobile widths, including the directly opened Adoption Timelines tab and the live report preview. The screenshots confirm contained horizontal timeline canvases, a sticky and readable workstream column, touch-sized drag/resize handles, operational-versus-strategic labels, a compact **2-Year Outlook** mobile control, and access to both planning views without page-width overflow. The report no longer renders the misaligned Plan Summary number circles; it uses stable, text-led summary cards instead. Pointer behavior is backed by the repeatable transition tests above. Preview, HTML, and PDF exports remain synchronized with the two distinct planning views.

## Export Download Regression — July 17, 2026

The authenticated HTML and PDF export procedures were completing successfully, but the browser download helper revoked each generated Blob URL immediately after invoking the download anchor. Chromium can begin reading the Blob after the click handler returns, so immediate revocation can surface as a browser-level download failure despite a valid server response.

The shared download helper now attaches the anchor to the document, keeps the Blob URL alive for 30 seconds, decodes PDF base64 in bounded chunks, and reports client-side conversion failures separately from server export errors. Automated regression tests verify filenames, MIME types, non-empty payloads, delayed cleanup, valid PDF signatures, and malformed-payload behavior.

A headless Chromium smoke test exercised the same delayed Blob-download lifecycle with authenticated export responses. It downloaded `Export-Smoke-FCP.html` at 18,466 bytes and `Export-Smoke-FCP.pdf` at 334,462 bytes. The HTML contained the Adoption Timeline, and the PDF began with the required `%PDF-` signature.

### Captured failure evidence

| Layer | Captured evidence before the fix |
|---|---|
| Browser | The user-visible result for both actions was the exact message **“Download failed.”** |
| Network | The browser log recorded an authenticated `POST /api/trpc/document.pdf?batch=1` with the engagement payload; the request reached the protected export procedure rather than being rejected at authentication or routing. |
| Server | The contemporaneous server log contained no Chromium, Puppeteer, renderer, or export exception. Existing procedure tests also returned non-empty HTML and PDF payloads. |
| Isolation | Because generation completed while the browser alone reported a failed file, the failure was isolated to the post-response Blob download lifecycle. The previous helper called `URL.revokeObjectURL` immediately after `anchor.click()`. |

The repaired helper delays revocation for 30 seconds. The positive headless-Chromium control now downloads and validates both files; the unit suite independently confirms that revocation does not occur before the delayed cleanup callback.

## Hosted Preview Authentication and Binary Export Verification

The unauthenticated hosted preview was opened directly after restart. It remained on the protected entry screen and displayed an explicit **Sign in with Manus** action rather than being preempted by a global unauthorized-error redirect. Activating the action produced the expected Manus OAuth URL with the hosted preview callback and return state. The callback now restores that validated local path after the session cookie is established, rather than always returning to the workspace root. Absolute and protocol-relative values fall back to `/`, preventing an OAuth open redirect.

The export UI now saves the current engagement, requests a short-lived owner-scoped signed ticket through the protected API, and opens a direct binary attachment URL. This avoids large base64 tRPC payloads, browser Blob URLs, iframe third-party-cookie dependence during file transfer, and premature object-URL revocation.

A non-destructive smoke test issued short-lived tickets for an existing saved engagement and requested both files from the active hosted preview URL. The HTML response returned HTTP 200, `text/html; charset=utf-8`, an attachment filename, 20,861 bytes, and a `<!doctype html>` signature. The PDF response returned HTTP 200, `application/pdf`, an attachment filename, 391,701 bytes, and a `%PDF-` signature. Invalid or tampered tickets return HTTP 401. Automated route tests additionally verify ownership-scoped lookup, no-store headers, safe filenames, MIME types, content-disposition headers, and non-empty content.

The final release gate passed on July 17, 2026: **6 test files and 26 tests passed**, TypeScript completed with no errors, and the production client/server build completed successfully. Vite reported only its advisory large-chunk warning; no build failure or runtime-blocking diagnostic was produced.

## VCF 9.1 Platform Precheck and Upgrade Services Sequence — July 17, 2026

The readiness report now converts observed RVTools host models into a per-platform VCF 9.1 precheck rather than a generic “hardware lookup” placeholder. For the reported estate, the renderer identifies **Dell PowerEdge R760** hosts as **candidate** platforms that require exact Broadcom Compatibility Guide validation, and marks **Dell PowerEdge R730** and **R530** hosts as **upgrade-required** replacement or exception decisions for VCF 9.1 planning. The report now shows the observed ESXi version alongside each platform. New RVTools imports correlate that evidence to the underlying host rows; V3 and V4 saved reports migrate to V5 and label inherited version data as **estate-wide** when the historic document cannot prove a unique model-to-version mapping. Neither candidate, upgrade-required, review-required, nor unavailable labels are certifications.

The adoption view begins **VCF 9.1 Upgrade Services** at the entitlement start; **Platform Plan** starts in the same month and **Platform Design** overlaps the Upgrade Services window. The two-year view carries forward Year 1 Upgrade Services and a Year 2 Expansion Upgrade Services progression rather than placing a Consumption Plan activity in the timeline.

The full release gate passed after this change: **6 test files and 29 tests passed**, TypeScript completed with no errors, and the production build completed successfully. Regression coverage verifies direct ESXi correlation, estate-wide migration provenance, current Dell candidate classification, legacy Dell upgrade-required classification, review-required and unavailable paths, export content, and Upgrade Services sequencing.

## Detailed Adoption Planning and Weekly Scheduling — July 17, 2026

The saved-document contract is now **V6**. It adds a persisted execution cadence and customer-confirmed adoption detail selections. The operational Adoption Timeline can use exact weekly windows beginning on the target-start date, allowing a plan to begin mid-month without approximating the first week as a full calendar month. The two-year view remains monthly by design and is labeled as a **strategic outlook**, not a second service-delivery schedule.

The guided intake covers the upgrade approach, operations, automation and self-service, security, resilience, Kubernetes, and private AI. It records only selections confirmed by the engagement team. Those selections create granular, editable workstream activities—for example, VM self-service catalog, infrastructure-as-code, or custom operations dashboards—rather than inventing commitments. The generated rationale describes the operational cadence, confirmed focus count, parallel Upgrade Services / Platform Plan / Platform Design work, and the different role of the strategic outlook.

Export rendering now uses text-led Plan Summary cards rather than the former numbered circles, which eliminates the layout defect. A renderer-level regression extracts the Plan Summary region and verifies its semantic Inventory, Operational Window, and Upgrade Services headings, stable card styling, and absence of numeric marker spans or step attributes. The standalone HTML/PDF report explicitly labels the **Operational Adoption Timeline** as the editable execution sequence and the **Two-Year Notional Adoption Outlook** as a deliberately spread strategic planning view. The final release gate passed on July 17, 2026: **6 test files and 30 tests passed**, TypeScript completed with no errors, and the production build completed successfully.

## Missing Engagement Recovery — July 17, 2026

A hosted-preview session could retain a selected engagement ID after the owner-scoped engagement list became empty or changed. The stale ID was then submitted to `engagement.get`, which correctly returned `NOT_FOUND` but surfaced a disruptive **Engagement not found** API query error in the workspace.

The workspace now gates the selected-record query on a current owner-scoped list membership check. Once that list resolves, a stale selection moves to the first available engagement or intentionally clears to the empty state. If an engagement is removed between the list and record requests, the owner-scoped `engagement.get` contract returns `null`; the client clears the stale selection and refreshes the list. No missing or no-longer-owned engagement is rendered, exported, updated, duplicated, or deleted through the stale selection.

The regression suite includes five focused assertions for preserved selections, stale-ID fallback, empty-list recovery, the reload-time cached-list query gate, and the recoverable `null` lookup. Desktop visual verification confirmed the authenticated workspace rendered normally after the change.
