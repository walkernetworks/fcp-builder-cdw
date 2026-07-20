# Industry Discovery Template Design

## Objective

The detailed adoption intake will offer reusable industry lenses that make discovery conversations more effective without turning template guidance into assumed scope. A template provides focused questions and a reusable discussion-note block. It never selects a capability, changes the upgrade path, updates priorities, or generates an activity on its own.

## Template Taxonomy

| Template | Discovery emphasis | Questions are intended to clarify |
|---|---|---|
| General enterprise | Operating model, lifecycle, automation, resilience, and application-platform priorities | The measurable outcome, decision owner, and first proof point for each workstream |
| Healthcare and life sciences | Multi-site consistency, care-service dependencies, centralized operations, recovery, and integrations | Availability priorities, care-system dependencies, handover model, and recovery objectives |
| Financial services and insurance | Change governance, evidence, identity, recovery, risk-supporting workloads, and developer delivery | Control/evidence needs, continuity expectations, secure delivery patterns, and reporting needs |
| Manufacturing, retail, and distributed operations | Location topology, edge consistency, local autonomy, maintenance, and central governance | Site patterns, outage tolerance, deployment consistency, and integration constraints |
| Public sector and education | Service continuity, shared platforms, access governance, data boundaries, and delivery capacity | Service priorities, access model, agency/campus boundaries, and procurement or change constraints |
| Digital products and technology | Self-service, APIs, infrastructure as code, Kubernetes, platform operations, and private-AI exploration | Developer personas, product-platform goals, pipeline integrations, service levels, and bounded pilots |

## Customer-Confirmation Boundary

A selected industry template is persisted as **conversation context**. Its questions become visible immediately and may be added to the customer-specific notes through an explicit action. This action labels them as discovery prompts to confirm. It does not modify the `operations`, `automation`, `security`, `resilience`, `kubernetes`, or `privateAi` selections; it also does not modify priorities or the upgrade path. Granular plan activities continue to depend exclusively on those existing explicit selections.

## Data and Migration Contract

The `AdoptionDetails` contract gains a controlled `industryTemplate` identifier and the engagement document advances from V6 to V7. V3–V6 documents migrate to the `general-enterprise` template. The template catalog itself remains static application guidance rather than customer data, enabling future catalog updates without changing saved scope.

## User Experience

The Detailed Discovery area begins with a mobile-friendly industry selector, a concise assurance about the confirmation boundary, and a set of question cards. A single **Add prompts to notes** action appends a clearly separated discussion block only when it has not already been added. **Use general template** returns the selector to the general lens without clearing any confirmed selections or notes.

## Testable Outcomes

| Behavior | Expected result |
|---|---|
| Default or migrated engagement | Uses the general-enterprise template |
| Template selection | Changes the displayed prompt set and persists context only |
| Add prompts to notes | Adds a labelled, de-duplicated question block |
| Template selection or application | Leaves upgrade path, priority list, and selected outcome arrays unchanged |
| Generated plan | Includes granular activities only after the existing confirmed selections are made |
