# FCP Builder Product Redesign Brief

## Product Purpose

FCP Builder should operate as an **end-to-end services-entitlement consumption planning workspace**. A CDW solution architect starts with the customer’s Broadcom VCF services entitlement, defines the customer outcomes and delivery work packages, establishes technical prerequisites and compatibility actions, converts those decisions into a staffing-ready adoption schedule, and hands a coherent delivery package to engineering.

The official VCF Services Entitlement program documentation states that the entitlement is consumed through professional services within the applicable initial period and that the parties mutually agree a **Work Plan** containing resource types. It also describes an Entitlement Project that includes maturity and optimization work, architecture, capability roadmap and adoption planning, configuration, deployment, design, optimization, adoption, integration, and operation of VMware Cloud Foundation.[1] This makes the Work Plan—not RVTools or the export button—the organizing object for the application.

VMware’s current VCF deployment-planning guidance also frames successful deployment as broader than technical prerequisites. It calls for organizational objectives, people, skills, processes, architecture, deployment pathway, sizing, preparation, compatibility, connectivity, and readiness-to-deploy decisions.[2] The product must therefore connect **customer outcomes, service scope, technical gates, staffing, and calendar sequencing** rather than presenting them as separate tools.

## Current Workflow Problems

| Current behavior | Why it fails the intended job | Redesign decision |
| --- | --- | --- |
| Top-level tabs split the experience into Plan Setup, Adoption Timelines, and Export. | A single engagement is fragmented into three modes, and the user must remember where adoption inputs versus the final timeline live. | Replace with one persistent stage navigation for the complete engagement lifecycle. |
| Plan Setup contains another four-tab workflow. | Nested tabs make the path feel like navigating an application inside an application. | Promote the real stages to the main engagement navigation and remove duplicated navigation layers. |
| Adoption setup and Adoption Timeline are separated. | Planning decisions and their staffing consequences cannot be reviewed together. | Make the Delivery Plan stage a combined scope-and-schedule workspace with direct movement into staffing. |
| Export is treated as a destination separate from plan review. | The deliverable appears after the planning work rather than as the final representation of that same source of truth. | Create a Delivery Package stage with readiness checks, document options, preview, and downloads in one place. |
| Timeline bars show categories and dates but no explicit delivery roles. | Delivery engineers cannot readily staff architects, implementation engineers, networking, migration, operations, security, or project management resources. | Add deterministic role guidance and staffing windows derived from each work package. |
| Compatibility evidence dominates some views. | Technical evidence is essential, but it is one input and gate within the service plan—not the product’s primary purpose. | Keep maintained-catalog compatibility as a dedicated Technical Handoff stage and gate summary. |

## Target Information Architecture

| Stage | Primary question | Required output |
| --- | --- | --- |
| **1. Engagement** | What entitlement, customer context, timing, and estate evidence define the engagement? | Entitlement period, value, project dates, RVTools footprint, and target release. |
| **2. Service Plan** | What outcomes and work packages will draw down the entitlement? | High-level SOW scope, assumptions, dependencies, intended outcomes, and excluded or deferred work. |
| **3. Staffing Timeline** | When will delivery work occur and which roles must be staffed? | Editable operational timeline, entitlement-aligned view, role demand by window, gates, and concurrent workstreams. |
| **4. Technical Handoff** | What compatibility or evidence actions must delivery resolve? | Reconciled cohort posture, blockers, evidence gaps, owners, and prerequisite actions. |
| **5. Delivery Package** | Is the plan ready to hand to delivery, and what documents should be issued? | Plan completeness checks, FCP preview, staffing summary, compatibility handoff, and downloads. |

## Experience Principles

The redesigned shell should keep the customer, entitlement remaining period, project timing, current stage, plan status, and save state visible. The main content should use a spacious editorial operations layout: a dark navy command rail, white planning surfaces, CDW red only for decisive actions and risk, amber for unresolved gates, teal for delivery-ready work, and restrained borders instead of stacked rounded cards.

The system should distinguish **generated planning guidance** from **authoritative manual edits**. Rebuilding may replace generated content only when the user explicitly requests it. Changing customer, entitlement, or scope options must never silently discard a manually shaped staffing plan.

## References

[1]: https://ftpdocs.broadcom.com/cadocs/0/contentimages/VCF_Services_Entitlement_SPD_June_8_2025.pdf "Broadcom — VCF Services Entitlement Specific Program Documentation"
[2]: https://blogs.vmware.com/cloud-foundation/2025/07/28/planning-a-successful-vmware-cloud-foundation-9-0-deployment/ "VMware Cloud Foundation Blog — Planning a Successful VMware Cloud Foundation 9.0 Deployment"
