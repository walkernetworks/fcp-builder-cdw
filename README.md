# FCP Builder

FCP Builder is a secure, CDW-branded internal workspace for creating inventory-informed Functional Consumption Plans. An authenticated solution architect selects one or more RVTools XLSX or CSV exports, confirms a small set of customer, entitlement, outcome, hardware, and date fields, reviews a transparent VCF 9.1 pre-assessment, adjusts the deterministic timeline, and downloads standalone HTML or PDF output.

**The application does not use AI.** RVTools files are parsed in browser memory, raw workbooks and per-object inventory rows are not uploaded, and the self-hosted CDW mode requires no public-internet application egress.

## Product capabilities

| Capability | Implementation |
|---|---|
| Protected workspace | Hosted Manus OAuth for review plus a config-driven trusted OIDC gateway hook for CDW Entra ID or Okta. |
| Engagement management | Owner-scoped create, list, open, update, duplicate, and delete operations. |
| Local RVTools intake | Multi-file XLSX/CSV parsing and duplicate-aware aggregation in the browser; no raw inventory upload API. |
| Minimal confirmed inputs | Customer identity, entitled physical cores, desired outcomes, hardware availability, exceptions, and target dates. |
| Transparent readiness | Evidence-based VCF 9.1 pre-assessment with explicit unknowns for HCL, firmware, network, identity and facilities items that RVTools cannot prove. |
| Deterministic planning | Local rules generate a readable sequence and rationale from confirmed inputs and aggregate inventory; no model call or AI fallback. |
| Visual editing | CSS-grid swimlanes, drag/move/resize, lane and activity controls, constrained colors, milestone/deferred flags, and same-lane overlap prevention. |
| Synchronized document | Inventory, readiness, adoption sequence, Gantt views, roadmap and forward plan derive from one versioned engagement object. |
| Direct export | Standalone HTML and container-local Chromium PDF downloads from the authenticated UI. |
| Approval evidence | Configuration, architecture, data flow, classification, endpoints, secrets, ports, retention, deployment, dependency and validation documentation. |

## Four-step workflow

| Step | User action | Application action |
|---|---|---|
| 1. Upload | Select up to 20 RVTools files. | Parse locally, deduplicate stable IDs, and calculate aggregate facts. |
| 2. Customer | Confirm the small set of commercial and planning inputs. | Calculate transparent readiness indicators and unresolved validation items. |
| 3. Timeline | Review or adjust the recommended workstreams. | Enforce valid ranges and prevent same-lane overlap. |
| 4. Review | Inspect the synchronized document and export. | Produce self-contained HTML or PDF without unresolved tokens or external resources. |

## Local development

```bash
pnpm install
pnpm run dev
```

The application requires the platform-provided authentication and database environment variables. Runtime-specific values must be supplied through the approved secrets mechanism rather than committed files.

## Validation

```bash
pnpm test
pnpm check
pnpm build
```

The test suite covers multi-file RVTools-style aggregation, stable-ID deduplication, readiness boundaries, legacy engagement migration, deterministic sequencing, overlap detection, protected engagement and export procedures, synchronized rendering, safe filenames, and unresolved-token removal.

## Security and deployment

Start with the [VCF 9.1 and RVTools Design Rationale](./docs/VCF-RVTOOLS-DESIGN.md) and [Security Review Package](./docs/SECURITY-REVIEW.md), then use the [Configuration Reference](./docs/CONFIGURATION.md), [CDW Deployment and Approval Guide](./docs/DEPLOYMENT.md), [SBOM and Dependency Review](./docs/SBOM.md), and [Release Validation Evidence](./docs/VALIDATION.md). The production container definition is in `Dockerfile`, and the dependency lock is `pnpm-lock.yaml`.
