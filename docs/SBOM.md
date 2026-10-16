# Software Bill of Materials and Dependency Review

The repository supplies three complementary dependency records: `package.json` lists direct runtime and development requirements, `pnpm-lock.yaml` pins the full JavaScript dependency graph and integrity hashes, and `docs/production-dependencies.json` provides a machine-readable direct production inventory generated from the installed lock state.

| Component layer | Source of truth | Review action |
|---|---|---|
| Node base image | `node:22-slim` in `Dockerfile` | Pin to the approved internal digest during release promotion and scan that digest. |
| Operating-system packages | `chromium`, `fonts-liberation`, and `ca-certificates` in `Dockerfile` | Capture the image scanner's OS package SBOM and vulnerability report in the release evidence. |
| Direct JavaScript packages | `package.json` and `docs/production-dependencies.json` | Review purpose, license, and known vulnerabilities. |
| Transitive JavaScript packages | `pnpm-lock.yaml` | Generate the platform-standard CycloneDX or SPDX inventory from the immutable release image. |
| Application source | Repository commit and checkpoint | Run SAST, secret scanning, and dependency scanning in the approved CI pipeline. |

The app UI bundles the Plus Jakarta Sans typeface from `@fontsource-variable/plus-jakarta-sans` (SIL Open Font License 1.1). Vite copies the font files into the client build, so browsers load them from the app's own origin and never from a font CDN.

The checked-in direct production manifest can be regenerated with:

```bash
pnpm list --prod --json --depth 0 > docs/production-dependencies.json
```

For the release artifact, the authoritative SBOM should be generated **from the built image**, not only from the source tree, so it includes Debian packages and the exact resolved image digest. For example, use the organization's approved Syft, Trivy, Prisma, or equivalent pipeline step and archive the result alongside the image signature and vulnerability-policy decision.

No dependency is loaded from a public CDN at runtime. Browser assets are compiled into the application, and the container's Chromium binary is invoked locally for PDF generation.
