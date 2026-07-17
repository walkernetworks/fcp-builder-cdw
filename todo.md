# Project TODO

- [x] Protect every business-data route and API procedure behind authenticated sessions, with only documented non-data sign-in, OAuth/session, logout, and health exceptions.
- [x] Preserve Manus OAuth for the hosted workspace and add documented config-driven OIDC/SSO hooks for CDW Entra ID or Okta without local passwords.
- [x] Define the authoritative §5 engagement fields and §6 timeline object as shared validated types.
- [x] Add owner-scoped engagement persistence with create, list, open, update, duplicate, and delete operations.
- [x] Build a CDW-branded authenticated workspace with engagement navigation and clear loading, empty, and error states.
- [x] Build grouped Tracks A–E guided intake accordions with completion indicators, free-text notes, and overall progress.
- [x] Implement notes-inclusive server-side Draft Timeline generation through an environment-configured approved LLM endpoint.
- [x] Return and display a concise sequencing rationale with every AI timeline draft.
- [x] Implement deterministic fallback sequencing that follows §7 and never fabricates protected customer values.
- [x] Build a CSS-grid swimlane Gantt editor with lane add, rename, reorder, and delete actions.
- [x] Add bar create, edit, move, drag-resize, delete, milestone, deferred, and constrained §8.2 color controls.
- [x] Prevent same-lane overlaps while allowing concurrency across different lanes.
- [x] Derive the Adoption Sequence table, Private Cloud Gantt, Two-Year Gantt, Executive Roadmap, and Forward Delivery Plan from one timeline JSON object.
- [x] Build a live CDW-branded FCP preview that updates from engagement state without unresolved template tokens.
- [x] Add direct standalone HTML download with self-contained styles and interaction.
- [x] Add direct PDF download through a server-side Chromium renderer suitable for the self-hosted container.
- [x] Provide autosave status, explicit save controls, and safe destructive-action confirmation.
- [x] Add environment-variable examples for IdP, LLM, database, storage, and export configuration without hardcoded endpoints or secrets.
- [x] Package the app as one OCI container with a health endpoint and one inbound application port.
- [x] Produce architecture, data-flow, data-classification, retention, authentication, secrets, ports, dependency/SBOM, and outbound-endpoint documentation.
- [x] Explicitly document that customer data does not leave the deployment boundary except to the configured corporate IdP and approved enterprise LLM endpoint.
- [x] Add and run Vitest coverage for domain sequencing, validation, protected API access, synchronized rendering, token sanitization, and authenticated HTML export behavior; smoke-test Chromium PDF generation.
- [x] Verify the Meridian Health golden scenario against the expected three-wave, hardware-gated, DR/VDefend, no-Kubernetes behavior.
- [x] Verify desktop and mobile-responsive rendering and refine the visual system from screenshots.

## Offline-First Simplification Redesign

- [x] Research authoritative VCF 9.1 architecture/readiness guidance, practical FCP usage, and RVTools export structure.
- [x] Define a minimal user-entered field set limited to customer, entitlement, scope exceptions, and timeline decisions.
- [x] Remove public or external AI dependencies and make deterministic local rules the only plan-generation mechanism.
- [x] Add secure in-browser upload and parsing for multiple RVTools XLSX/CSV exports without sending file contents to external services.
- [x] Aggregate uploaded estate data across files with source-level traceability and duplicate-aware totals.
- [x] Calculate a transparent VCF 9.1 readiness summary from RVTools-observable signals, with explicit unknown/not-assessable items.
- [x] Replace Tracks A–E discovery intake with a short guided workflow: Upload, Confirm, Timeline, Review & Export.
- [x] Simplify engagement JSON and persistence while preserving backward-compatible opening of existing engagements where practical.
- [x] Derive the FCP narrative, tables, Gantt views, and exports from uploaded inventory plus the minimal confirmed inputs.
- [x] Update security documentation to state that RVTools parsing and plan generation are local/deterministic and require no internet or public AI egress.
- [x] Add tests for multi-file parsing, aggregation, readiness rules, minimal-field validation, migration, synchronized rendering, and exports.
- [x] Verify the revised desktop and mobile workflow with screenshots and create a new reviewable checkpoint.

## Calendar-Month Adoption Timeline Refinement

- [x] Remove user-facing statements and badges about AI or the absence of AI while preserving the existing no-model architecture.
- [x] Rename all Gantt-facing product language to Adoption Timeline and standardize title-style capitalization across phases and activities.
- [x] Add entitlement dollar amount, entitlement start date, and entitlement end date to the minimal customer inputs and versioned engagement data.
- [x] Replace relative Wave/Year columns with actual calendar-month columns derived from the entitlement term.
- [x] Remove workshop, readiness, assessment, and validation phases from generated recommendations and default plans.
- [x] Restrict generated recommendations to customer-relevant Plan and Design activities, with optional custom user-created activities.
- [x] Redesign the primary Adoption Timeline for intuitive drag-to-move and edge-resize editing across calendar months.
- [x] Add a separate editable Two-Year Notional Adoption Plan covering 24 calendar months.
- [x] Keep the primary Adoption Timeline, two-year notional plan, summaries, preview, HTML, and PDF synchronized from the engagement data.
- [x] Update migration behavior so existing engagements receive entitlement terms, normalized capitalization, and workshop/readiness activity cleanup.
- [x] Update tests for entitlement fields, calendar month generation, Plan/Design-only recommendations, normalization, two-year rendering, and overlap controls.
- [x] Verify desktop and mobile usability, especially horizontal month navigation and touch-friendly timeline controls.

## Interaction Evidence Follow-up

- [x] Add repeatable automated coverage for month-grid whole-activity drag and independent edge-resize behavior, including bounds and same-workstream overlap rejection.
- [x] Document the desktop/mobile horizontal-navigation evidence and the automated pointer-gesture coverage in the release validation record.

## Banner Removal and CDW Rollout

- [x] Remove the inventory-storage banner and its explanatory copy from the Plan Setup workspace.
- [x] Revalidate the revised workspace, automated tests, type checking, and production build.
- [x] Save a reviewable checkpoint and provide a concise CDW pilot and production rollout path covering access, hosting, identity, network, scanning, and approval evidence.

## HTML and PDF Download Failure

- [x] Reproduce the authenticated HTML and PDF download failures and capture the exact browser, network, and server errors.
- [x] Fix the underlying export response or browser download handling without weakening authentication.
- [x] Add regression tests for both downloadable formats, including filenames, MIME types, non-empty content, and error handling.
- [x] Validate direct HTML and PDF downloads end to end with authenticated export responses and headless Chromium.
- [x] Run the complete release gate and save a corrected reviewable checkpoint.

## Hosted Preview Sign-In and PDF Transfer

- [x] Reproduce the hosted-preview PDF failure and the missing Manus sign-in entry when opening the app directly.
- [x] Ensure every unauthenticated preview route renders an explicit Sign in with Manus action and preserves the intended return URL.
- [x] Add an authenticated binary download endpoint for HTML and PDF so hosted-preview downloads do not depend on large base64 tRPC payloads or Blob URLs.
- [x] Preserve protected export authorization and safe filenames on the direct download endpoint.
- [x] Add regression tests for sign-in redirects, authenticated binary responses, MIME types, content disposition, and unauthorized access.
- [x] Validate the explicit sign-in entry and both signed export responses in the hosted preview, then run the full release gate and save a corrected checkpoint.
