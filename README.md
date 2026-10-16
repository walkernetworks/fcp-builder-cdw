# FCP Builder

FCP Builder is a secure, CDW-branded internal workspace for creating inventory-informed Functional Consumption Plans. An authenticated solution architect selects one or more RVTools XLSX or CSV exports, confirms a small set of customer and entitlement fields, customizes two calendar-month adoption views, and downloads standalone HTML or PDF output.

RVTools files are parsed in browser memory. Raw workbooks and per-object inventory rows are not uploaded; only aggregate estate facts and source metadata are stored with the engagement.

## Product capabilities

| Capability | Implementation |
|---|---|
| Protected workspace | Config-driven trusted OIDC gateway for CDW Entra ID or Okta; the app has no login flow or third-party platform dependency of its own. |
| Engagement management | Workspace-scoped create, list, open, update, and duplicate operations; delete by the owner or an admin. |
| VSA tracker (in progress) | Stage model, gate dates, source checklist, and assignments for each engagement, and a daily import of the SharePoint VSA Pipeline List CSV with a reconciliation report (`/import`). See `docs/VSA-TRACKER-DATA-MODEL.md`. |
| Local RVTools intake | Multi-file XLSX/CSV parsing and duplicate-aware aggregation in the browser, with no raw-inventory upload API. |
| Minimal confirmed inputs | Customer identity, entitled physical cores, entitlement dollar value, entitlement start/end dates, desired outcomes, and timeline notes. |
| Planning considerations | Evidence-based VCF 9.1 observations with explicit unknowns for items RVTools cannot prove. |
| Calendar-month Adoption Timeline | Editable workstreams and activities aligned to the entitlement term, with drag-to-move, edge-resize, month selectors, constrained colors, and overlap prevention. |
| Two-Year Notional Adoption Plan | A separate editable 24-month view for longer-range planning and design activities. |
| Synchronized document | Customer, entitlement, inventory, planning considerations, both adoption views, preview, HTML, and PDF derive from one versioned engagement object. |
| Direct export | Standalone HTML and container-local Chromium PDF downloads from the authenticated UI. |
| Approval evidence | Configuration, architecture, data flow, classification, endpoints, secrets, ports, retention, deployment, dependency, and validation documentation. |

## Four-step workflow

| Step | User action | Application action |
|---|---|---|
| 1. Upload | Select one or more RVTools files. | Parse locally, deduplicate stable identifiers, and calculate aggregate facts. |
| 2. Customer | Confirm customer details, entitlement cores and value, and entitlement start/end dates. | Align both adoption views to actual calendar months. |
| 3. Timeline | Drag, resize, rename, add, or remove Plan and Design activities. | Preserve valid ranges and prevent same-workstream overlap. |
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

The test suite covers multi-file RVTools aggregation, stable-identifier deduplication, entitlement fields, calendar-month generation, two-year planning, legacy engagement migration, Plan/Design-only defaults, overlap detection, protected engagement and export procedures, synchronized rendering, safe filenames, and unresolved-token removal.

## Security and deployment

Start with the [VCF 9.1 and RVTools Design Rationale](./docs/VCF-RVTOOLS-DESIGN.md) and [Security Review Package](./docs/SECURITY-REVIEW.md), then use the [Configuration Reference](./docs/CONFIGURATION.md), [CDW Deployment and Approval Guide](./docs/DEPLOYMENT.md), [SBOM and Dependency Review](./docs/SBOM.md), and [Release Validation Evidence](./docs/VALIDATION.md). The production container definition is in `Dockerfile`, and the dependency lock is `pnpm-lock.yaml`.
