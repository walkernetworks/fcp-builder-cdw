# CDW Deployment and Approval Guide

## Recommended pilot topology

Deploy the supplied OCI image to an approved internal container platform behind an existing OIDC-aware reverse proxy or application gateway. Use the platform’s standard MySQL-compatible database service and secret manager. This keeps the review boundary to **one application container, one database connection, and one approved identity gateway**.

The container listens on the platform-provided `PORT`; the supplied image exposes port 3000 for conventional local operation. Do not expose the container directly to staff. Publish only the gateway hostname over HTTPS. In CDW trusted-proxy mode, deny general internet egress from the application container and allow only the database destination required by `DATABASE_URL`.

## Build

```bash
docker build -t internal-registry.example/fcp-builder:VERSION .
docker push internal-registry.example/fcp-builder:VERSION
```

The image builds the React client and Node server, installs Debian Chromium for PDF generation, and starts one Node process with `node dist/index.js`. No sidecar, model runtime, object store, worker, message queue, or public API integration is required.

## Runtime configuration

Create deployment secrets and configuration from [CONFIGURATION.md](./CONFIGURATION.md). Do not create or commit an environment file. In CDW mode, set `FCP_AUTH_MODE=trusted-proxy` and configure the approved gateway to inject the immutable identity, email, and display-name headers after stripping any client-supplied versions.

## Database preparation

Provision a MySQL-compatible database and least-privilege application account. Require TLS. Apply the SQL migrations in `drizzle/` in order. The application stores the versioned FCP document in the `engagements.data` JSON column and keeps customer name, status, and the VSA tracker fields (stage, gate dates, identifiers, commercials) as columns for workspace-scoped listing and filtering. Migration `0002_vsa_tracker_core.sql` creates workspace 1, moves every existing engagement into it, and places existing FCPs in the FCP Draft stage.

Raw RVTools workbook files are not uploaded or stored. The saved JSON contains only aggregate counts and capacities, version and model distributions, source filename/size/worksheet metadata, parser warnings, readiness indicators, the minimal confirmed fields, and the timeline.

## OIDC gateway contract

The gateway must authenticate every application path, perform Entra ID or Okta OIDC, enforce MFA and conditional access, and be the only permitted network source for the container. It must inject an immutable identifier header plus email and display name. The app hashes the issuer/identifier pair before using it as its local external identity key.

A common header contract is:

```text
x-auth-request-user: immutable-corporate-subject
x-auth-request-email: user@cdw.com
x-auth-request-name: Display Name
```

Actual header names are configurable. The proxy must always overwrite, never append, these headers.

## RVTools workflow

Users select one or more RVTools XLSX or CSV exports in the browser. Parsing, row-level deduplication, and aggregate calculation occur in browser memory. There is no multipart upload endpoint and no application file-storage requirement. Browser controls enforce a maximum of 20 files and 30 MB per file.

The VCF 9.1 pre-assessment is intentionally limited to signals observable from the exports. Hardware certification, firmware/driver support, network design, DNS/NTP, VLAN/IP capacity, identity, rack/power, and workload dependencies remain explicit validation steps; the app does not call an external compatibility service.

## Health and readiness

The scaffold exposes the lightweight public `system.health` procedure used by platform monitoring. It returns no customer data. For a stricter gateway posture, monitor container TCP readiness and keep the procedure behind the internal load balancer.

## Backup, retention, and recovery

Back up the database using the selected platform’s standard encrypted backup policy. Engagement deletion removes the live database row; backup expiration and legal holds follow the database platform policy. The container holds no durable customer files and can be replaced without file migration.

## Upgrade and rollback

Use immutable image tags. Before an upgrade, back up the database and review any new SQL migration. Deploy the new image as a canary, verify authentication, local RVTools parsing, engagement access, deterministic timeline generation, and HTML/PDF export, then shift traffic. Roll back by restoring the prior image tag. Database migration rollback must be handled separately and should avoid destructive changes.

## Security-review checklist

| Review item | Evidence |
|---|---|
| Architecture and data flows | `docs/SECURITY-REVIEW.md` |
| Complete endpoint inventory | `docs/SECURITY-REVIEW.md` and runtime configuration |
| Environment variable contract | `docs/CONFIGURATION.md` |
| Dependency and SBOM evidence | `docs/SBOM.md`, `package.json`, and `pnpm-lock.yaml` |
| Container recipe | `Dockerfile` |
| Database schema and migrations | `drizzle/schema.ts` and `drizzle/*.sql` |
| Automated controls | `server/*.test.ts` |
| Build validation | `pnpm check`, `pnpm test`, and `pnpm build` |
