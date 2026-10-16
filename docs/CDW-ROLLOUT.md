# CDW Rollout Path

## Recommended position

Treat the application as a small internal line-of-business service rather than a public website. The preferred production path is to run the supplied OCI container on a **CDW-approved internal application platform**, place it behind the standard **Microsoft Entra ID or Okta access gateway**, connect it to an approved managed database over private networking, and restrict access to a named CDW security group.

The repository already includes the container definition, health endpoint, configuration reference, security-review package, SBOM evidence, data-flow description, and deployment instructions needed to start an internal review. CDW platform and security owners should select the specific hosting service; the application does not require a particular cloud vendor.

## Two-stage rollout

| Stage | Intended users and data | Hosting and access | Approval target |
|---|---|---|---|
| Controlled pilot | Five to ten named SAs using synthetic or sanitized RVTools exports | Non-production CDW subscription or approved sandbox; private ingress; Entra ID/Okta group access | Validate workflow, export quality, support ownership, and security controls |
| Production | Internal CDW staff using approved customer engagement data | CDW-approved container platform and managed database; private endpoint; corporate SSO; centralized logs and backups | Complete application, identity, data, vulnerability, and operational review |

The app has no external hosting or third-party platform dependency. The recommended production deployment remains inside CDW’s approved tenant and network.

## Minimum production architecture

| Component | Required control |
|---|---|
| Application | One OCI container, one Node process, one inbound application port, and `/api/health` for health checks |
| Identity | Entra ID or Okta authentication enforced at the approved gateway; direct container access blocked |
| Authorization | Named CDW group for pilot and production access; engagement records are shared within the workspace; delete is limited to the record's owner or an admin |
| Database | Approved managed MySQL-compatible database over private networking with encryption, backups, and restricted credentials |
| Network | Private ingress where available; deny unrestricted internet egress; allow only database, identity-gateway, logging, and required platform services |
| Secrets | Platform secret store or managed identity; no `.env` files or credentials in the image |
| File handling | RVTools XLSX/CSV files are parsed by the browser; the server receives the structured engagement summary rather than the raw files |
| Logging | Platform access and application logs sent to the approved central logging service without RVTools file contents |
| Exports | HTML and PDF downloads are generated only for authenticated users; Chromium runs inside the application container |

## Approval package

Submit the following repository files with the internal intake request:

| Evidence | File |
|---|---|
| Architecture, data flow, data classification, ports, endpoints, secrets, and retention | `docs/SECURITY-REVIEW.md` |
| Runtime variables and trusted-proxy identity settings | `docs/CONFIGURATION.md` |
| Container deployment, health checks, rollback, and network controls | `docs/DEPLOYMENT.md` |
| Direct production dependency inventory and reproduction command | `docs/SBOM.md` and `docs/production-dependencies.txt` |
| Automated, export, interaction, and responsive validation evidence | `docs/VALIDATION.md` |
| Product rationale and RVTools assessment boundaries | `docs/VCF-RVTOOLS-DESIGN.md` |

## Suggested approval sequence

1. Identify a CDW application owner, platform owner, data owner, and support owner.
2. Ask the platform team which approved container target should host the pilot; avoid selecting a new platform solely for this application.
3. Create a non-production environment with a private hostname and a pilot Entra ID/Okta group.
4. Build the image in the approved CI pipeline, generate the organization’s required SBOM, run SAST and dependency checks, and scan the final image.
5. Deploy with a non-production database, secrets from the approved vault, and synthetic or sanitized RVTools files.
6. Validate sign-in, workspace-scoped engagement access, HTML/PDF exports, logs, backup/restore, and rollback.
7. Submit the same image and evidence for production approval; promote by immutable image digest rather than rebuilding manually.

## Questions for CDW platform and security teams

| Decision | Question |
|---|---|
| Hosting | Which existing internal container platform is the default for a small Node/Chromium line-of-business service? |
| Identity | Should the application trust Entra Application Proxy, an ingress gateway, or another standard OIDC-aware proxy? |
| Data | Is derived RVTools inventory classified as customer confidential, and what retention period is required? |
| Database | Which managed MySQL-compatible service and private-connectivity pattern are approved? |
| Scanning | Which CI, SAST, dependency, container, and SBOM tools must produce evidence? |
| Operations | Which team owns logging, alerting, backups, patching, vulnerability remediation, and user support? |

## Fastest safe next action

Start with a **non-production internal pilot using sanitized RVTools exports**. Give the platform/security reviewer the existing evidence package, ask them to select the approved container target and SSO gateway, and avoid requesting public internet exposure. This keeps the approval request small: one container, one database, one private hostname, and one access group.
