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

## Single Category Row with Color-Coded Workstream Bars

- [x] Trace the grouped timeline rendering and editing code that currently emits one row for each workstream type.
- [x] Render exactly one left-hand row per category, with multiple independently color-coded workstream bars in that shared row.
- [x] Remove the left-hand workstream-type column while retaining the workstream color legend and accessible activity labels.
- [x] Update workspace, HTML, and PDF activity-sequence presentation to show workstream types through bar colors rather than repeated timeline rows.
- [x] Add regression coverage, visually validate the corrected category-row output, and checkpoint the update.
- [x] Match the supplied structural reference: one category swimlane, a shared time grid, and multiple independently positioned colored bars without using the reference image’s sample data.

## Input-Responsive Planning and Weekly Mobilisation Timing

- [x] Trace how intended upgrade path, customer objectives, constraints, timeline notes, and industry discovery lens affect generated activities, timing, rationale, and exports.
- [x] Make confirmed planning inputs visibly and deterministically change the relevant generated delivery workstreams or narrative.
- [x] Correct the two-week mobilisation and delivery-baseline activity with cadence-aligned labelling: Weeks 1–2 for weekly execution and Month 1 for calendar-month execution.
- [x] Add regression coverage, validate the input-sensitive outputs and weekly timing, and checkpoint the update.

## VCF HCL vHost Compatibility Integration

- [x] Inspect the supplied VCF HCL package and identify the authoritative server, vendor, model, CPU, firmware, and version fields available for deterministic matching.
- [x] Normalize and package the supplied HCL data for safe server-side use without relying on client-side execution of uploaded files.
- [x] Implement deterministic matching from parsed vHost inventory to HCL records, with exact-match, partial-evidence, unsupported, and unknown states.
- [x] Surface matched HCL evidence and confidence in the vHost readiness workspace and customer-safe plan/export language without representing the result as an official certification.
- [x] Add automated tests using representative HCL records and vHost rows, visually validate the experience, and checkpoint the published integration.

## Entitlement-Aligned Two-Year Notional Horizon

- [x] Trace all fixed 24-month Two-Year Notional date calculations, headings, and export wording that conflict with the service-start-to-entitlement-end planning window.
- [x] Generate the Notional timeline from the actual service start date through the entitlement end date, preserving a 12-month entitlement term when that is the confirmed customer term.
- [x] Synchronize workspace, plan rationale, HTML/PDF exports, and migration behavior with the entitlement-aligned horizon.
- [x] Add regression coverage for service starts that differ from entitlement starts, validate the visible timeline, and checkpoint the published correction.

## Fixed Five-Category HCL-Driven Gantt

- [x] Inspect the supplied VCF HCL 2.0 package and reconcile its evaluation statuses, evidence fields, and safeguards with the current offline HCL integration.
- [x] Preserve exactly five immutable Gantt category rows: Program Management & Governance, Modernize Infrastructure, Operations, Modernize Cloud, and Modernize Security & Resilience.
- [x] Populate category tasks dynamically from HCL path and confirmed module selections, including Green baseline alignment, Yellow remediation, and Red procurement/greenfield provisioning paths.
- [x] Enforce deterministic procurement/remediation buffers, cross-category gates, parallel soft-prerequisite work, and final migration ordering after enabled Cloud and Security work.
- [x] Synchronize fixed-category behavior, dependency context, workspace controls, and HTML/PDF exports without presenting HCL results as official certification.
- [x] Add regression coverage across Green, Yellow, and Red HCL paths and relevant module combinations; visually validate, checkpoint, and publish the update.

## Complete HCL 2.0 Assessment Coverage

- [x] Compare every HCL 2.0 assessment check, evidence input, verdict, and recommendation in the supplied package against the current FCP implementation.
- [x] Identify and classify all omitted non-host compatibility or readiness checks that can be supported from imported RVTools evidence, while marking genuinely unavailable inputs as unknown.
- [x] Extend the shared evaluation model and fixed-category scheduling logic to include the full supported HCL 2.0 assessment scope without claiming official certification.
- [x] Surface complete HCL assessment findings, evidence gaps, and scheduling implications in the workspace and HTML/PDF exports.
- [x] Add regression coverage for the newly surfaced check families, validate the rendered assessment, and checkpoint the published correction.

## Planned Project Start Date and Entitlement-Date Hang

- [x] Reproduce and diagnose the workspace hang triggered by changing the entitlement start date.
- [x] Add a separately persisted planned project start date with safe defaults and backward-compatible migration.
- [x] Decouple planned project timing from entitlement timing in generated timelines, narrative, workspace inputs, and HTML/PDF exports.
- [x] Add regression coverage for date changes, migration, and bounded timeline regeneration; validate the repaired interaction and checkpoint the release.

## Supplied RVTools Workbook Upload Failure

- [x] Inspect Franklin_Park.xlsx and Ashburn.xlsx safely to identify the upload or parser failure mode.
- [x] Update workbook discovery and RVTools parsing to support the observed export format without weakening browser-only processing.
- [x] Add regression coverage for the observed workbook structure and concurrent multi-workbook import.
- [x] Validate the repaired upload workflow with the supplied workbooks, run the release gate, and checkpoint the fix.

## RVTools Host Under-Count

- [x] Compare all supplied RVTools vHost rows against the current host parser and duplicate-reconciliation keys to identify why the displayed total is one.
- [x] Repair host-row recognition and aggregation so valid unique hosts across supplied workbooks are retained without double counting.
- [x] Add regression coverage for the observed vHost worksheet structure and per-source/combined host totals.
- [x] Re-import the supplied workbooks, verify the actual host total in the workspace, run the release gate, and checkpoint the correction.

## Unselected VCF Networking Scope

- [x] Trace why VCF networking was included in a generated plan without an explicit guided-intake selection.
- [x] Restrict VCF networking activities to deliberately confirmed scope and remove any implicit inventory or default trigger.
- [x] Add regression coverage proving unselected networking scope does not generate plan activities or exported statements.
- [x] Validate the corrected generated plan, complete the release gate, and checkpoint the repair.

## Same-Category Workstream Overlap

- [x] Trace the timeline validation and editor paths that currently reject overlap between infrastructure-build and migration-wave activities in the same fixed category.
- [x] Permit intentional overlapping infrastructure and migration activities within a shared category while retaining valid bounds and activity data.
- [x] Preserve explicit VCF networking scope so networking appears only after a customer selection and never from a default or migration rule.
- [x] Add regression coverage for unselected networking and same-category overlapping activities; validate the editor and checkpoint the repair.

## Multiple Workstream Types per Category

- [x] Trace the category-to-single-workstream constraint across timeline schemas, normalization, editor controls, rendering, and exports.
- [x] Refactor the model so a fixed category can contain multiple independently typed workstreams and overlapping activities.
- [x] Add editable workstream-type controls for new and existing activities while preserving valid grouped timeline presentation.
- [x] Add regression coverage for concurrent Infrastructure Build and Migration Wave work within one category, validate the editor and exports, and checkpoint the repair.

## Entitlement-First and Two-Year Operational Timeline

- [x] Trace current Entitlement Notional and Operational Adoption Timeline construction, ordering, start-date sources, and export labels.
- [x] Make Entitlement Notional the first planning view without changing entitlement-date semantics.
- [x] Make the Operational Adoption Timeline a two-year timeline beginning at the planned project start date, with safe migration of existing plans.
- [x] Combine the timeline-view revision with multiple editable workstreams per category, add regression coverage, validate editor/export behavior, and checkpoint the release.

## Accurate Footprint and Customer-Centered Report Cleanup

- [x] Audit why the imported Franklin Park and Ashburn RVTools evidence reports only one VM and an unknown ESXi version despite available source rows.
- [x] Correct VM and ESXi-version extraction, aggregation, readiness wording, and report labels using verified supplied-workbook evidence.
- [x] Remove entitled cores from intake, plan summaries, workspace, and exports; replace the misleading completion percentage and generic delivery-posture copy.
- [x] Add a customer-background, selected-scope, observed-footprint, and plan-synopsis report structure that distinguishes entitlement and operational timelines clearly.
- [x] Complete multi-workstream workstream-type editing and the two-year planned-start operational timeline, then add regression coverage, validate reports, and checkpoint the release.

## Customer Narrative, Inventory Evidence, and Timeline Refinement

- [x] Start the Entitlement Notional at the independently selected planned project start while bounding it by the entitlement end date.
- [x] Preserve separately typed concurrent workstreams within shared report categories and make the two planning views unambiguous.
- [x] Remove entitlement-core language from readiness and report presentation because cores are not a meaningful decision metric at this stage.
- [x] Diagnose and correct VM-footprint aggregation so report totals reflect all imported RVTools VM evidence rather than a misleading partial count.
- [x] Replace ambiguous inventory fallbacks such as "Hosts Unknown" with RVTools-backed values or explicit evidence-gap language.
- [x] Improve the executive synopsis and delivery posture so they describe the customer context and confirmed plan selections in clear, customer-ready language.
- [x] Update regression coverage, run the full validation suite, and visually verify the revised workspace and exported report.

## Optional VCF 9.1 Readiness Export

- [x] Add a persisted, accessible export preference that lets users include or exclude the VCF 9.1 readiness section.
- [x] Conditionally omit the readiness navigation, content, and print output from HTML and PDF exports when disabled while retaining planning data.
- [x] Add migration-safe defaults, regression coverage, and full export validation for both readiness-on and readiness-off modes.

## Lyondell Entitlement Notional and Delivery-Focused Opening Report

- [x] Review the supplied Lyondell PDF and current engagement timeline data to identify the precise entitlement-notional construction or rendering defects.
- [x] Correct the entitlement-notional dates, month columns, activities, and export presentation so it is a coherent entitlement-bounded delivery view.
- [x] Reframe the cover, executive summary, customer background, and plan synopsis around service delivery, selected outcomes, and customer value; retain RVTools only as supporting estate evidence.
- [x] Add regression coverage, validate the corrected HTML/PDF output, and publish the repair.

## Lyondell Operational Timeline Print Cutoff

- [x] Review the supplied Lyondell PDF and current operational-timeline HTML/print structure to identify the precise cutoff mechanism.
- [x] Implement a print-safe operational timeline layout that shows every month, lane, and activity without cropping or hiding delivery work.
- [x] Add regression coverage, visually validate the complete HTML/PDF timeline, and publish the repair.

## Concise RVTools-Backed Executive Export

- [x] Audit the Lyondell export to quantify page growth and identify RVTools-derived details that do not belong in the default executive delivery report.
- [x] Redesign the default export as a concise delivery report with a single observed-footprint summary and only decision-relevant readiness evidence.
- [x] Keep detailed inventory, readiness, and sequence material out of the default output while preserving the user's explicit VCF 9.1 readiness inclusion choice.
- [x] Add regression coverage, validate a concise Lyondell HTML/PDF export, and publish the change.

## Authoritative Manual Plans, Timeline Synchronization, and Optional Operational Export

- [x] Audit all plan rebuild and option-change paths to identify where manually edited timelines or activities can be regenerated or overwritten.
- [x] Preserve manually changed plan activities, dates, lanes, and sequences when other plan options are edited; require an explicit rebuild action for regeneration.
- [x] Synchronize entitlement adoption activities and timing from operational adoption timeline changes without overwriting unrelated manual entitlement edits.
- [x] Add a persisted, accessible option to include or omit the operational adoption timeline from HTML and PDF exports.
- [x] Add regression coverage, validate manual editing and export behavior, and publish the improvements.

## Ascensus RVTools Snapshot-Match Investigation

- [x] Inspect the uploaded Ascensus RVTools host identifiers, platform data, and parser output behind the reported no-snapshot-match result.
- [x] Compare parsed host evidence with the HCL snapshot identity rules and distinguish absent snapshot records from naming or identifier normalization defects.
- [x] Repair matching behavior and add regression coverage if valid source servers are incorrectly classified as unmatched.
- [x] Report the server-level findings and publish any verified correction.

## Condensed Compatibility Evidence and Separate Plan-Output Document

- [x] Audit the workspace evidence/findings panels and existing HTML/PDF export pathways to identify the source of excessive scrolling and the correct document boundaries.
- [x] Design a cohort-level compatibility summary that surfaces compatible, action-required, and unresolved host groups with concise reasons and affected-host counts.
- [x] Build a separate plan-output document containing delivery scope, adoption sequence, and VCF 9.1 host-cohort eligibility detail without duplicating the full FCP export.
- [x] Add accessible export actions for the plan-output document from both the Plan Output workspace step and the Export tab.
- [x] Add regression coverage, validate HTML/PDF document behavior and condensed workspace evidence, then publish the improvement.

## Concise HCL 2.0 Evidence and Findings

- [x] Audit whether HCL 2.0 findings are emitted per host, per cohort, or per evidence item and identify the correct deduplication key.
- [x] Replace the always-expanded findings list with a severity- and subject-grouped summary that includes affected-host or affected-subject counts and one shared remediation statement.
- [x] Preserve individual evidence only in a collapsed drill-down so delivery teams can inspect it without forcing long scrolling in the default Plan Output view.
- [x] Add regression coverage, validate the compact Plan Output behavior, and publish the improvement.

## HCL and Compatibility-Focused Plan Output

- [x] Audit the existing standalone Plan Output composition and remove all adoption-timeline and service-sequencing content from its scope.
- [x] Expand Plan Output with detailed HCL 2.0 findings, compatibility cohort evidence, coverage gaps, affected subjects, decision rationale, and remediation actions.
- [x] Preserve concise cohort summaries while providing enough detailed evidence for delivery and platform stakeholders to assess VCF 9.1 readiness.
- [x] Add regression coverage, validate standalone HTML/PDF content, and publish the refocused Plan Output document.

## M5 Release-Boundary Supportability and Future-Release Risk

- [x] Research authoritative support and lifecycle boundaries for the observed Cisco M5 platforms across VCF 9.1 and later product releases.
- [x] Define explicit evidence-based release-boundary metadata for supported-through and unsupported-after conditions without inferring unsupported status where the source is incomplete.
- [x] Add lifecycle-aware HCL findings, workspace summaries, and Plan Output detail that warn customers when a currently supported platform has a verified future-release support boundary.
- [x] Add regression coverage, validate the affected customer evidence, and publish the supportability enhancement.

## Platform-Wide Latest-Snapshot and Future-Release Risk

- [x] Apply the latest-verified-release boundary to every supported host cohort, rather than only Cisco M5 systems.
- [x] Keep vendor end-of-support dates model-specific and evidence-based; do not invent lifecycle dates for platforms without authoritative source material.
- [x] Add a clear workspace and Plan Output flag that distinguishes current-snapshot support from future-release supportability requiring revalidation.
- [x] Add regression coverage, validate the customer-facing cohort evidence, and publish the expanded lifecycle-risk assessment.

## Cisco M5 VMware Post-9.1 Compatibility Boundary Correction

- [x] Verify authoritative VMware, Broadcom, or Cisco-published evidence that identifies Cisco M5 as unsupported for ESXi or VCF 9.2 and later.
- [x] Separate release-specific VMware compatibility exclusions from the generic current-snapshot revalidation notice and OEM hardware lifecycle dates.
- [x] Add an explicit supported-through ESXi 9.1 / unsupported-from ESXi or VCF 9.2 finding, cohort flag, and technical Plan Output evidence for affected Cisco M5 platforms only when verified.
- [x] Add regression coverage, revalidate the Ascensus evidence, and publish the corrected supportability assessment.

## Comprehensive Multi-Vendor Compatibility and Delivery Handoff Redesign

- [x] Audit the current server normalization, HCL snapshot, release-boundary, confidence, workspace, FCP export, and compatibility deliverable flows to identify incomplete or misleading outcomes.
- [x] Research authoritative Broadcom/VMware and major OEM compatibility sources, their release semantics, available query mechanisms, update cadence, and limitations.
- [x] Define a release-aware evidence model that distinguishes exact verified support, explicit exclusion, absence from a current matrix, partial identity, conflicting sources, stale evidence, and missing data without collapsing them into a generic disclaimer.
- [x] Normalize arbitrary RVTools vendor/model/CPU identities into stable cohorts and support deterministic matching for Cisco, Dell, HPE, Lenovo, Supermicro, and other observed manufacturers with an actionable unresolved path for unknown platforms.
- [x] Add selectable current and target ESXi/VCF releases, source provenance, evidence timestamps, confidence, support-through boundaries, and delivery dispositions for every cohort.
- [x] Redesign the workspace into concise estate posture, release-support, blockers, evidence gaps, and delivery-action summaries with drill-down to host-level evidence only when needed.
- [x] Rebuild the main FCP and standalone compatibility deliverables as a complete presales-to-delivery handoff covering estate scope, supported cohorts, blocked cohorts, future-release constraints, evidence gaps, remediation, ownership, and next validation actions.
- [x] Add broad multi-vendor and unknown-platform regression fixtures, validate representative customer workbooks and rendered HTML/PDF documents, and publish the redesign.

## Maintained Verified Catalog Architecture

- [x] Make the versioned Broadcom server catalog the deterministic compatibility source used during every RVTools import, without requiring live vendor availability.
- [x] Persist catalog identity, capture time, release scope, target release, product-record links, match method, and confidence with each assessed cohort.
- [x] Give every imported host cohort an explicit evidence state and delivery disposition, including exact support, target-release not listed, CPU evidence required, identity confirmation required, catalog record required, source refresh required, and explicit exclusion.
- [x] Reconcile assessed cohort host counts to the imported estate total and expose any unaccounted hosts as a blocking evidence-quality gap.
- [x] Document a controlled catalog refresh and validation workflow so newer release data can replace the production snapshot without changing customer results silently.

## Design-First, Delayed-Implementation Entitlement Notional

- [x] Audit the current Entitlement Notional and Plan-Adoption generation path, including the Month 1 mobilization wording and date sources.
- [x] Add a clear design-first versus implementation-start planning model so planned project start can precede upgrade and migration services by several months.
- [x] Make the Plan-Adoption intake straightforward for selecting an implementation target window or deferral, while preserving authoritative manual plans and maintained-catalog compatibility behavior.
- [x] Update Entitlement Notional, Operational Adoption Timeline, workspace copy, and HTML/PDF exports to explain the gap and avoid implying upgrades begin immediately.
- [x] Add Ascensus-style regression coverage for design starting now with upgrade/migration beginning in March, run the full release gate, and checkpoint the release.

## End-to-End Entitlement Consumption Plan Redesign

- [x] Audit the current engagement navigation, setup tabs, timeline workspace, compatibility handoff, and export flow against the intended presales-to-delivery lifecycle.
- [x] Define one coherent engagement workflow from customer context and entitlement through service scope, delivery plan, staffing timeline, technical handoff, and final deliverables.
- [x] Replace the clunky top-level Plan Setup, Adoption Timelines, and Export split with a persistent stage-based engagement workspace and clear completion status.
- [x] Reframe the product around Broadcom services-entitlement drawdown, with visible entitlement period, plan horizon, scope posture, and delivery readiness throughout the workflow.
- [x] Build a guided high-level SOW plan that captures service outcomes, work packages, assumptions, dependencies, acceptance outcomes, and implementation timing without pretending to be a signed legal SOW.
- [x] Elevate the Adoption Timeline into the primary staffing workspace, showing delivery phases, resource roles, staffing windows, concurrency, gates, and handoff requirements.
- [x] Add deterministic staffing guidance derived from selected work packages and compatibility dispositions while preserving editable authoritative manual plans.
- [x] Unify plan review and document generation so the final FCP, staffing timeline, and Compatibility Delivery Handoff are accessible from one delivery package stage rather than a disconnected Export area.
- [x] Preserve maintained-catalog compatibility, design-first delayed implementation, RVTools reconciliation, manual-plan authority, signed downloads, and current engagement data migrations.
- [x] Add responsive workflow, navigation, staffing, export, and migration regressions; visually validate desktop and mobile; run the full release gate and publish the redesign.

## Entitlement Adoption Timeline and VCF Design Mapping Correction

 - [x] Read and extract the supplied VCF 9.1 Design and Drawdown Playbook’s upgrade-design work packages, outcomes, dependencies, and sequencing.
 - [x] Audit current outcome labels, work-package names, in-place-upgrade mapping, and generated timeline activities for mismatches.
 - [x] Restore customer-facing terminology to Entitlement Adoption Timeline and Two-Year Notional across the workspace, renderer, exports, and tests; do not call the primary view a Staffing Timeline.
 - [x] Define canonical in-place-upgrade design work packages covering discovery/baseline, architecture and target-state design, management-domain and networking design, workload-domain and migration design, validation/change planning, and delivery handoff.
 - [x] Rebuild outcome-to-work-package mapping so each selected service path produces the correct design and implementation activities with clear outcomes, dependencies, and acceptance direction.
 - [x] Add regression coverage for in-place upgrade, related upgrade paths, delayed implementation, correct work-package labels, and both timeline views; validate UI and exports.

## Visible VCF 9.1 Playbook Redesign Correction

- [x] Reproduce the current selected engagement and confirm why the previous playbook work packages are not visible after upgrade-path selection or ordinary plan loading.
- [x] Extract the complete VCF 9.1 design artifact, pathway, component-depth, quarterly drawdown, and discovery-input model from the supplied playbook.
- [x] Redesign the Service Plan pathway selection so in-place upgrade and other paths expose the design deliverables they will generate before rebuilding.
- [x] Build a canonical pathway-to-work-package model with distinct design, implementation, validation, adoption, and handoff packages rather than generic outcome labels.
- [x] Rebuild Entitlement Adoption Timeline and Two-Year Notional generation from that canonical model, including correct sequencing, dependencies, outcomes, and delayed implementation behavior.
- [x] Make plan rebuild behavior explicit for existing authoritative manual plans so users can preview and intentionally apply the new playbook template without silently overwriting manual edits.
- [x] Add a visible design deliverables and outcome-mapping review in the Service Plan stage and carry the same content into the FCP export.
- [x] Add regression coverage for existing/manual engagement rebuild, in-place upgrade design packages, pathway variants, terminology, timeline synchronization, and export content.
- [x] Validate the corrected experience using Ascensus and a fresh engagement, visually inspect both timeline views and the rendered PDF, then publish.

## VCF Playbook Category Ownership Redesign

- [x] Audit every generated pathway, design, component, execution, adoption, and handoff package for its current timeline category and workstream assignment.
- [x] Define canonical ownership rules across Program Management & Governance, Modernize Infrastructure, Operations, Modernize Cloud, and Modernize Security & Resilience.
- [x] Move platform architecture, management-domain design, networking/fabric design, hardware prerequisites, upgrade preparation, and execution into Modernize Infrastructure.
- [x] Keep Operations limited to operating model, observability, lifecycle, automation governance, and operational handoff work.
- [x] Map cloud consumption, Kubernetes/application platform, security, resilience, and Private AI packages into their appropriate categories instead of Operations.
- [x] Apply category ownership consistently to Entitlement Adoption Timeline, Two-Year Notional, Service Plan preview, SOW register, staffing/resource summaries, and exports.
- [x] Add regressions across in-place, converge, import, greenfield, hybrid, and design-only pathways; validate Ascensus visually and publish the correction.

## Print-First FCP and Compatibility PDF Redesign

- [x] Audit the current FCP and Compatibility Handoff page order, density, typography, repeated content, table widths, page breaks, and timeline clipping using real customer renders.
- [x] Define one shared print design system for cover pages, section openers, summaries, notices, metrics, tables, timelines, footers, page numbering, and continuation pages.
- [x] Reorder the FCP so the Entitlement Adoption Timeline appears before the Two-Year Notional in both HTML and PDF output.
- [x] Redesign the Entitlement Adoption Timeline as a readable executable drawdown section with category ownership, delivery windows, gates, and concise package detail.
- [x] Redesign the Two-Year Notional as two deliberate 12-month landscape sheets with repeated category labels and legends, no clipping, and clear directional-funding language.
- [x] Simplify the FCP’s executive, scope, pathway, compatibility, timeline, SOW-register, assumptions, and handoff sections into a clean delivery narrative without duplicate explanations.
- [x] Redesign the Compatibility Delivery Handoff around estate posture, cohort decisions, blockers, evidence gaps, owned actions, support boundaries, and concise engineering detail.
- [x] Add print-layout regressions covering section order, 24-month visibility, split-sheet continuation, table headers, page-break classes, compatibility sections, and prohibited overflow patterns.
- [x] Render real Ascensus FCP and Compatibility Handoff PDFs, inspect every page for clipping and readability, run the full release gate, and publish the redesign.

## One-Sheet Entitlement Adoption Timeline PDF

- [x] Audit the current entitlement timeline print layout and row density.
- [x] Fit the complete Entitlement Adoption Timeline onto one readable landscape PDF sheet without clipping, while keeping the Two-Year Notional as separate Month 1–12 and Month 13–24 sheets.
- [x] Add pagination regressions and validate the real-customer PDF output.
- [x] Publish the corrected PDF layout.
