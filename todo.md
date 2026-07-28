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

## Missing Engagement Recovery

- [x] Trace the authenticated `Engagement not found` query to its selected-engagement source and reproduce the stale-ID condition.
- [x] Gate workspace record queries on a settled owner-scoped list so cached stale IDs from reload, navigation, or deletion are not requested; safely recover the unavoidable list/get race with a null result.
- [x] Recover gracefully by selecting a valid engagement or presenting a clear empty state instead of surfacing a raw API query error.
- [x] Add workspace-selection controller regression coverage for reload refresh, stale-list fallback, empty-list recovery, and the list/get deletion race; run the full release gate before checkpointing.

## VCF 9.1 Hardware Readiness and Upgrade Services Sequencing

- [x] Research authoritative VCF 9.1 hardware compatibility requirements and establish what RVTools evidence can and cannot verify locally.
- [x] Convert parsed vendor, model, CPU, and ESXi evidence into per-platform VCF 9.1 hardware readiness findings with clear candidate, upgrade-required, review-required, and unavailable states.
- [x] Update the readiness report and FCP preview to identify each observed hardware platform and its compatibility evidence instead of only stating that an official lookup is available.
- [x] Replace the consumption-plan activity in generated adoption plans with an Upgrade Services progression while allowing initial Plan and Design work to run in parallel where appropriate.
- [x] Add regression coverage for platform-readiness results and revised sequencing, then run the full release gate before checkpointing.

## VCF 9.1 Readiness Evidence Completion

- [x] Surface observed ESXi versions alongside each compatible hardware-platform precheck where RVTools host rows provide the correlation, while retaining ESXi as a lifecycle signal rather than a certification.
- [x] Add regression coverage for review-required and unavailable platform states in addition to candidate and upgrade-required classifications.

## Detailed Adoption Planning and Weekly Scheduling

- [x] Diagnose and correct the Plan Summary numbered-circle placement and numbering semantics.
- [x] Research authoritative VCF adoption workstreams and define practical, capability-specific discovery prompts that improve plan detail without fabricating customer commitments.
- [x] Extend the adoption timeline to support week-level columns and mid-month activity start and end dates while preserving existing monthly-plan data.
- [x] Differentiate the operational Adoption Timeline from the Two-Year Notional Adoption Plan in the workspace and exported HTML/PDF report so their scopes and cadence are clear.
- [x] Add a guided detailed-intake experience for upgrade, automation, operations, security, resilience, Kubernetes, and private-AI priorities, and use confirmed choices to add granular plan activities.
- [x] Add regression coverage for marker placement, weekly timeline behavior, detailed intake sequencing, migration, and distinct report sections; run the full release gate before checkpointing.

## Plan Summary Rendering Regression

- [x] Add explicit regression coverage proving the exported Plan Summary uses stable text-led cards without numbered-circle marker elements, then rerun the full release gate.

## Industry Discovery Templates

- [x] Research and define reusable VCF discovery-question templates for priority customer industries without overstating regulatory or technical requirements.
- [x] Add a mobile-friendly industry template selector to the guided detailed-adoption intake and allow users to apply, review, and clear suggested prompts.
- [x] Preserve customer-confirmed scope by treating template questions as guidance only and keeping generated activities dependent on explicit intake selections.
- [x] Add regression coverage for template availability, application behavior, and scope preservation; run the full release gate before checkpointing.

## Industry Prompt Clearing

- [x] Add an explicit intake action that removes the currently applied industry discovery prompts from notes without changing confirmed capabilities or priorities.
- [x] Add regression coverage proving industry prompts can be applied, reviewed, and cleared independently of detailed capability selections, then rerun the full release gate.

## Industry Prompt Review and Confirmed-Scope Regression

- [x] Add component-level review-model regression coverage proving the selected industry template exposes its expected reviewable prompt set in the guided intake.
- [x] Extend apply-and-clear coverage to preserve non-empty detailed capability selections and priorities, then rerun the full release gate.

## Hosted Login Prompt Follow-up

- [x] Reproduce the hosted workspace login prompt and inspect whether the Sign in with Manus entry and intended return path are available.
- [x] Correct any hosted authentication entry or post-login return-path regression without weakening protected engagement access.
- [x] Add focused regression coverage and run the full release gate before checkpointing.

## Year-One-to-Two-Year Service Alignment

- [x] Research and define grounded follow-on VCF service patterns that logically begin after operational year-one work, without presenting them as committed scope.
- [x] Replace the independent two-year notional plan generator with a traceable follow-on outlook derived from the year-one operational service sequence and confirmed intake.
- [x] Clarify in the workspace and exported report which year-one services enable each two-year follow-on activity and distinguish strategic considerations from delivery commitments.
- [x] Add regression coverage for year-one alignment, follow-on-only sequencing, migration, and report clarity; run the full release gate before checkpointing.

## Research-Led Year 2 Service Roadmap

- [x] Research authoritative VCF lifecycle, operations, automation, security, resilience, Kubernetes, and private-AI service progression after foundational Year 1 delivery.
- [x] Replace generic Year 2 continuations with distinct, capability-specific follow-on service outcomes tied to confirmed Year 1 services.
- [x] Explain the evidence-based Year 1-to-Year 2 service handoffs in the workspace and export without presenting recommendations as committed scope.
- [x] Add regression coverage and complete release validation for the researched Year 2 roadmap.

## Year 2 Roadmap Release Evidence Follow-up

- [x] Run the production build for the researched Year 2 roadmap update and resolve any resulting issues.
- [x] Record the Year 2 roadmap test, type-check, build, and visual-verification evidence in the release validation record before checkpointing.

## Continuous Two-Year Notional Roadmap

- [x] Restore the Two-Year Notional plan to a continuous 24-month calendar view rather than a standalone Year 2 roadmap.
- [x] Mirror the generated Year 1 operational services into Months 1–12 of the Two-Year Notional plan while preserving their sequencing and service labels.
- [x] Place the researched, distinct follow-on services in Months 13–24 with their Year 1 enablers and entry conditions.
- [x] Update workspace and export explanations, migration behavior, regression tests, and release validation for the continuous two-year roadmap.

## PDF Opening-Page Design Redesign

- [x] Inspect the supplied PDF and reference image to isolate the opening-page hierarchy, spacing, and pagination defects.
- [x] Redesign the executive-cover, summary, and early-detail layout so PDF pages no longer inherit a crowded web-layout appearance.
- [x] Implement print-aware HTML/CSS renderer changes while preserving correct timeline, inventory, and export content.
- [x] Add renderer regression checks, visually inspect the regenerated PDF, and complete the release gate before checkpointing.

## Hardware Certification PDF Compaction

- [x] Inspect the regenerated hardware-certification pages to identify responsive-layout and pagination waste.
- [x] Replace multi-card hardware evidence presentation with a compact print-native landscape evidence table and concise certification context.
- [x] Remove mobile-derived print styling that makes the PDF appear stretched or awkward on landscape paper.
- [x] Add renderer assertions, regenerate the PDF, visually verify the hardware section, and complete the release gate before checkpointing.

## Two-Year Notional PDF Width Correction

- [x] Inspect the current Two-Year Notional PDF pages to confirm why Months 13–24 are clipped or absent.
- [x] Redesign the print-only two-year timeline so both Years 1 and 2 fit legibly in landscape without responsive overflow.
- [x] Add renderer coverage for visible Months 13–24, regenerate the PDF, visually verify the complete timeline, and complete the release gate before checkpointing.

## Selective Two-Year Service Recommendations

- [x] Audit current follow-on service labels, outcomes, and capability triggers to identify why recommendations are not self-explanatory or sufficiently selective.
- [x] Replace timeline-facing Year 1/Year 2 service naming with clear service names, outcome descriptions, and transparent recommendation rationale.
- [x] Gate follow-on services on the customer’s confirmed priorities, detailed capability selections, and relevant estate/readiness signals rather than generic defaults.
- [x] Update PDF/workspace explanations, add selection-regression coverage, visually validate the export, and complete the release gate before checkpointing.

## Selective Follow-On Service Recommendations

- [x] Replace generic follow-on placeholders with services that originate only from a confirmed priority, detailed capability selection, and relevant estate or hardware signal.
- [x] Remove Year 1 and Year 2 prefixes from service and workstream names, and show each recommendation’s selection rationale and readiness condition in the workspace and export.
- [x] Add regression coverage for omitted services when evidence is incomplete and included services when compound prerequisites align.

## Adoption Duration and Weekly Sequencing Fix

- [x] Reproduce why changing the entitlement end date does not proportionally extend generated adoption services.
- [x] Correct monthly duration allocation so an extended plan window distributes service timing across the available calendar span.
- [x] Correct weekly scheduling so generated services avoid same-workstream overlaps and remain within the selected execution window.
- [x] Add regression coverage, validate the repaired views, and checkpoint the fix.

## Hosted OAuth Redirect-Domain Repair

- [x] Reproduce and isolate the hosted `invalid redirect_uri` failure caused by the temporary preview domain.
- [x] Update the secure OAuth entry flow to use the active allowed application origin while preserving the nonce and return-path protections.
- [x] Add redirect regression coverage, validate hosted sign-in, and checkpoint the repaired authentication flow.

## Active Preview OAuth Handoff Verification

- [x] Verify that the active preview runtime exposes a platform-managed temporary origin rather than a separately configured published callback origin.
- [x] Preserve the confirmed published-domain sign-in path and remove the unverified temporary-preview override experiment.
- [x] Confirm the user can access the application through the published FCP domain; no unverified preview-domain workaround is released.

## Engagement Naming at Creation

- [x] Inspect the current new-engagement action and title persistence path.
- [x] Add an accessible engagement-name input to the new-engagement flow, with a sensible default and validation.
- [x] Persist and display the selected name, add regression coverage, validate the interaction, and checkpoint the change.

## ESXi Baseline Evidence Consistency

- [x] Trace why detected RVTools ESXi versions can still render an unknown baseline status with an unavailable-evidence message.
- [x] Correct readiness classification and report wording so detected versions, unsupported baselines, and truly unavailable evidence are distinguishable.
- [x] Add regression coverage, validate the readiness summary and export wording, and checkpoint the correction.

## Persisted ESXi Readiness Refresh

- [x] Trace why an existing engagement can display an old unknown software-baseline finding despite detected RVTools ESXi 8.0.3 evidence.
- [x] Recompute deterministic readiness findings for existing engagement documents when they are loaded or saved after rule updates.
- [x] Add regression coverage for persisted legacy readiness plus ESXi 8.0.3 evidence, validate the displayed summary, and checkpoint the repair.

## Observed Host Platform Planning

- [x] Trace why observed RVTools host platforms with usable identity and ESXi evidence can still receive an indeterminate VCF 9.1 message.
- [x] Define a non-certifying but actionable planning path for every observed platform, including platforms requiring official compatibility confirmation.
- [x] Surface host-specific planning actions in readiness and generated plan outputs, add regressions, validate the behavior, and checkpoint the change.

## Compatibility-First Delivery Workflow and Actionable Follow-On Guidance

- [x] Remove managed per-host timeline lanes and trace the evidence available for a consolidated compatibility-first delivery work package.
- [x] Implement a consolidated compatibility assessment outcome that helps delivery teams prioritize eligible, upgrade-required, and evidence-incomplete host cohorts without claiming certification.
- [x] Replace the generic Two-Year Notional empty state with explicit missing selections, estate signals, and recommended next actions for targeted follow-on services.
- [x] Add regression coverage, validate the revised readiness and planning views, and checkpoint the change.

## Canonical Adoption Timeline Taxonomy

- [x] Audit generated, editable, migrated, and exported Adoption Timeline categories and workstream labels.
- [x] Restrict timeline categories to Program Management & Governance, Hardware Refresh, Modernize Cloud, Operations, Modernize Infrastructure, Modernize Security & Reliance, and Modernize App Platform & AI.
- [x] Restrict workstream types to Governance, Operating Model / Platform, Infrastructure Build, Migration Waves, Consume / Handover, and Security & Resiliency, with exact capitalization.
- [x] Normalize existing engagements, add regression coverage, validate exports and workspace labels, and checkpoint the taxonomy change.

## VCF 9.1 Host Compatibility Readiness Deepening

- [x] Define RVTools-observable VCF 9.1 deployment-guide checks and their certification boundary.
- [x] Assess each host cohort for ESXi baseline, CPU-generation risk, model-generation evidence, and cluster-size signals with actionable outcomes.
- [x] Surface detailed cohort findings and evidence gaps in the readiness workspace, generated plans, and PDF export.
- [x] Add regression coverage, validate the revised readiness experience, and checkpoint the compatibility enhancement.

## Customer-Facing Language and PDF Download Repair

- [x] Remove assessment, readiness, workshop, validation, and similar diagnostic terminology from customer-facing report, timeline, workspace, HTML, and PDF content.
- [x] Replace repetitive per-platform review-status dumps with concise host inventory grouping and delivery-oriented next-step language.
- [x] Trace and repair the hosted PDF download failure without weakening protected export access.
- [x] Add regression coverage for prohibited report language, concise host reporting, and authenticated PDF download behavior.
- [x] Validate the revised workspace, HTML/PDF output, and download flow; then checkpoint the repair.
- [x] Replace the remaining customer-visible “Review” workflow-step label with neutral planning language discovered during final visual validation.

## Clifton Two-Year Notional Initialization Defect

- [x] Reproduce the newly created Clifton engagement with an empty Two-Year Notional plan.
- [x] Trace creation, default-document, and derived-plan generation paths to identify the initialization gap.
- [x] Repair automatic continuous 24-month Two-Year Notional population for new engagements without altering existing plans unexpectedly.
- [x] Add regression coverage, validate the corrected engagement flow, and checkpoint the fix.

## Exact Adoption Timeline Taxonomy and Color Mapping

- [x] Restrict every timeline category to the user's exact seven-label list, including “Modernize App Platform & AI”.
- [x] Restrict every timeline workstream type to the user's exact six capitalized labels: Governance, Operating Model / Platform, Infrastructure Build, Migration Waves, Consume / Handover, and Security & Resiliency.
- [x] Show category and workstream type as distinct visible labels, not as a combined label or an activity name.
- [x] Map all timeline activity colors consistently to workstream types and render a visible legend.
- [x] Apply taxonomy normalization and color mapping to generated, editable, migrated, previewed, HTML, and PDF timelines.
- [x] Add regression coverage and visual verification for exact taxonomy labels, colors, and the continuous Two-Year Notional plan.

## VCF Networking and NSX Delivery Domain

- [x] Research and define VCF networking and NSX delivery activities independently from security and VDefend services.
- [x] Add a confirmed networking/NSX planning selection and model fields without creating a new timeline category outside the approved taxonomy.
- [x] Generate dedicated VCF networking and NSX work under Modernize Infrastructure with appropriate Governance, Operating Model / Platform, Infrastructure Build, Migration Waves, and Consume / Handover sequencing.
- [x] Add a distinct continuous Two-Year Notional networking and NSX progression, separate from security work.
- [x] Render networking/NSX work clearly in the timeline editor, customer workspace, HTML, and PDF exports.
- [x] Add regression coverage, validate the revised networking experience, and checkpoint the release.
- [x] Verify the VCF networking and NSX timeline/export presentation through generated rendered outputs without interactive workspace sign-in.

## PDF Filename Extension Repair

- [x] Trace why an authenticated PDF export is presented with a `.txt` extension.
- [x] Correct the client and server filename/content-disposition behavior so PDF downloads use a safe `.pdf` filename.
- [x] Add regression coverage, validate the download response, and checkpoint the fix.

## Implementation-Led VCF Delivery Plan and Opening-Page PDF Refinement

- [x] Research credible VCF implementation service workstreams and sequence design only within the opening weeks.
- [x] Inspect the supplied Clifton Larsen Allen PDF and isolate the first-page and early-page formatting defects.
- [x] Replace design-heavy adoption-plan activities with time-boxed design, platform implementation, migration, operationalization, and handover workstreams.
- [x] Repair the opening-page PDF hierarchy, spacing, and pagination while preserving the customer-facing content.
- [x] Add regression coverage, validate rendered HTML/PDF outputs, and checkpoint the implementation-led update.

## Category-Grouped Timeline Presentation

- [x] Trace each workspace and export view that repeats the timeline category on every activity row.
- [x] Group consecutive workstreams under one category label in the Adoption Timeline editor, table, HTML export, and PDF export.
- [x] Preserve visible individual workstream type and activity labels within each category group.
- [x] Add regression coverage, validate the grouped timeline output, and checkpoint the presentation update.
