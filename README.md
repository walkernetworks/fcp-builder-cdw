# FCP Builder

FCP Builder is a secure, CDW-branded internal workspace for creating Functional Consumption Plans. Authenticated solution architects can manage engagements, complete a guided VSA/VCF Tracks A–E intake, paste discovery notes, draft a governed timeline, refine overlapping workstreams in a visual Gantt editor, watch the FCP document update live, and download standalone HTML or PDF output.

## Product capabilities

| Capability | Implementation |
|---|---|
| Protected workspace | Hosted Manus OAuth plus a config-driven trusted OIDC gateway hook for CDW Entra ID or Okta. |
| Engagement management | Owner-scoped create, list, open, update, duplicate, and delete operations. |
| Structured source of truth | The §5 fields and §6 timeline are validated and stored as one versioned JSON document. |
| Guided intake | Tracks A–E accordions, field completion signals, notes, milestones, and overall progress. |
| Timeline drafting | Server-side approved LLM call with strict JSON output and deterministic §7 fallback. |
| Visual editing | CSS-grid swimlanes, drag/move/resize, lane and bar CRUD, fixed §8.2 colors, milestone/deferred flags, and overlap prevention. |
| Synchronized document | Adoption Sequence, Private Cloud Gantt, Two-Year Gantt, Executive Roadmap, and Forward Delivery Plan derive from one timeline object. |
| Direct export | Standalone HTML and Chromium-rendered PDF downloads from the authenticated UI. |
| Approval evidence | Configuration, architecture, data flow, classification, endpoints, secrets, ports, retention, deployment, and dependency documentation. |

## Local development

```bash
pnpm install
pnpm run dev
```

The application requires the platform-provided authentication and database environment variables. Runtime-specific values must be supplied through the approved secrets mechanism rather than committed files.

## Validation

```bash
pnpm check
pnpm test
pnpm build
```

The test suite covers the Meridian Health golden scenario, §7 lane sequencing, overlap detection, protected engagement APIs, synchronized rendering, and unresolved-token removal.

## Security and deployment

Start with the [Security Review Package](./docs/SECURITY-REVIEW.md), then use the [Configuration Reference](./docs/CONFIGURATION.md), [CDW Deployment and Approval Guide](./docs/DEPLOYMENT.md), [SBOM and Dependency Review](./docs/SBOM.md), and [Release Validation Evidence](./docs/VALIDATION.md). The production container definition is in `Dockerfile`, and the dependency lock is `pnpm-lock.yaml`.
