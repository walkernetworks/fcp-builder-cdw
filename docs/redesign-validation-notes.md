# FCP Builder Redesign Validation Notes

## Desktop workspace validation

Validated the redesigned five-stage workspace on the live application using the Customer A engagement. The stage flow now reads as **Engagement → Service Plan → Adoption Timeline → Technical Handoff → Delivery Package**. The command bar consistently presents entitlement term, design start, implementation start, and target platform. The Service Plan stage now exposes a high-level SOW-oriented summary and work-package register, the Adoption Timeline stage surfaces delivery roles and staffing windows, the Technical Handoff stage keeps the maintained-catalog compatibility evidence in a dedicated engineering view, and the Delivery Package stage unifies export controls and preview into one package-oriented destination.

## Mobile workspace validation

Validated the redesigned workspace on a 390×844 viewport. The previous long vertical engagement list was condensed into a horizontal selector, which allows the command bar and workflow stages to appear within the first screen. The entitlement facts were compressed into a swipeable strip so the stage navigation is reachable without excessive scrolling. The active stage remains clear on mobile for both the Adoption Timeline and Delivery Package views.

## Real-customer FCP HTML and PDF validation

Rendered the migrated **Customer B FCP** through the production HTML and PDF renderer. The cover page, executive summary, plan-on-a-page, VCF 9.1 readiness summary, and entitlement notional render correctly in the redesigned structure. The PDF produced **8 pages** on letter landscape, which is materially more concise than the earlier long-form report format while still carrying staffing and readiness content. The migrated document confirmed that legacy authoritative plans can be modernized in copy: the old baseline label now renders as **"Weeks 1–2: Mobilize and Establish Delivery Baseline"** without changing schedule coordinates.

## Final PDF pagination result

Pages 6 through 8 were also visually inspected. Page 6 presents the delivery-role summary without clipping. Page 7 presents the monthly staffing horizon and begins the High-Level SOW Work Package Register; page 8 continues and completes the register with intact category bands, readable role ownership, outcomes, dependencies, and assumptions. The generated document remains **8 pages**, and no content was visibly cut off at a page boundary.

## Playbook mapping correction validation

The supplied VCF 9.1 Design and Drawdown Playbook was extracted and used to define the in-place upgrade sequence: requirements and constraints, target-state and decision design, management-domain/platform design, upgrade runbook and validation/change-window design, controlled upgrade waves, and operational handover. The generated plan now emits these work packages before the approved in-place execution activity, including explicit outcomes and dependency context.

The primary planning view is now labeled **Entitlement Adoption Timeline**. The secondary planning view is now labeled **Two-Year Notional**. The hosted Adoption Timeline stage visually shows the corrected labels, delivery-role summary, work-package count, and concurrency metric. Rendered real-customer HTML contains the corrected terms and no longer contains “Staffing Timeline.”

## Visible playbook-application correction

The reported visibility issue was reproduced on the Customer A engagement. Its saved schedule is an **Authoritative Manual Plan**, so the generated VCF 9.1 playbook sequence correctly did not replace the manually edited bars. The application now makes that state explicit in both the global action and the Service Plan stage, shows the exact pathway design and implementation packages before replacement, and provides a confirmed **Apply Playbook Template** action as the only operation that overwrites manual coordinates.

The Service Plan now previews the selected pathway, design deliverables, implementation packages, dependencies, acceptance direction, domain topology, principal storage, and component adoption depth. In-place upgrade plans generate requirements and constraints, target-state decisions, platform and component designs, the implementation runbook with validation and rollback direction, controlled upgrade waves, selected component adoption, and handover.

The two planning horizons are now materially different. The **Entitlement Adoption Timeline** is bounded to the executable services-entitlement drawdown period. The **Two-Year Notional** always spans 24 calendar months from the planned project start and is explicitly described as directional rather than a commitment that all work is funded by the current entitlement.

Mobile full-page review at 390×844 confirms the selected-pathway preview, generated design and implementation package tables, component design depth controls, authoritative-manual-plan warning, and Apply Playbook Template action remain visible. The timeline stage presents **Entitlement Adoption Timeline** as the primary view and **Two-Year Notional** as the separate secondary tab; no customer-facing Staffing Timeline label remains.

## Customer A generated-playbook PDF validation

The non-destructive Customer A validation render was generated by applying the playbook template to a copy of the saved engagement, leaving the authoritative manual record untouched. The rendered PDF produced **9 pages**. The generated plan correctly preserved the saved engagement as manual while producing a separate generated copy for validation.

Pages 6 through 9 confirm that the visible redesign is carried into the issued document. Page 6 presents the **Entitlement Adoption Timeline** heading, the pathway-specific design deliverables table, and an **Implementation and Adoption Package** table for the in-place path. Page 7 shows the first-year entitlement drawdown schedule with visible design packages from September 2026 through April 2027, followed by **Prepare Supported Estate for In-Place Upgrade**, **Execute Approved In-Place Upgrade and Validation Waves**, and post-upgrade adoption tasks. Pages 8 and 9 continue the second-year horizon and the **High-Level SOW Work Package Register**, where design packages, execution packages, dependencies, and acceptance direction remain legible without clipping.

This validation also confirms the intended horizon split: the generated Customer A copy shows **15 entitlement-timeline columns** for the executable drawdown period and **24 two-year columns** for the directional roadmap. The customer-facing document therefore now shows a materially different Entitlement Adoption Timeline and Two-Year Notional rather than two near-duplicate views.

## VCF playbook category ownership correction

The reported Operations-category concentration was reproduced and traced to one generator collection that placed every pathway and component design package into the Operations lane. Category ownership is now explicit in the shared playbook model and reused by timeline generation, Service Plan preview, role summaries, the pathway register, and the exported SOW work-package register.

The corrected Customer A generated plan distributes playbook packages as follows: **Program Management & Governance** owns requirements and delivery decisions; **Modernize Infrastructure / Infrastructure Build** owns VCF target-state, management-domain/platform, networking/fabric, hardware, prerequisite, and efficiency design; **Modernize Infrastructure / Migration Waves** owns runbooks, rollback/change-window design, upgrade/import/migration execution, and validation waves; **Operations** owns operations adoption, lifecycle, observability, and VCF management; **Modernize Cloud** owns automation, Kubernetes, and Private AI design/adoption; **Modernize Security & Resilience** owns security and recovery design/adoption when selected.

Desktop workspace review confirms the Customer A Entitlement Adoption Timeline now shows pathway packages across Program Management & Governance, Modernize Infrastructure, Operations, and Modernize Cloud rather than placing them all in Operations. The Service Plan includes a new **Timeline category placement** preview before the template is applied. The production-path Customer A PDF remains nine pages and visibly groups the pathway register, timeline, and SOW register by the corrected categories without clipping.
