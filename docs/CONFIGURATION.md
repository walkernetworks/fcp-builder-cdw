# Configuration Reference

The application reads deployment-specific identity, database, and PDF-rendering settings from environment variables. Production values should be injected from the CDW-approved secret manager when the container starts.

| Variable | Required when | Purpose | Secret |
|---|---|---|---|
| `PORT` | Always | Single inbound application port. The container defaults to `3000`. | No |
| `DATABASE_URL` | Always | TLS connection string for the approved MySQL-compatible database. | Yes |
| `FCP_AUTH_MODE` | Always | Must be `trusted-proxy`. An approved OIDC gateway authenticates users before traffic reaches the app; when unset, no request is authenticated. | No |
| `FCP_OIDC_ISSUER` | Always | Corporate issuer name used to namespace local identities. | No |
| `FCP_SSO_ID_HEADER` | Optional | Header containing the immutable corporate user identifier. | No |
| `FCP_SSO_EMAIL_HEADER` | Optional | Header containing the authenticated email address. | No |
| `FCP_SSO_NAME_HEADER` | Optional | Header containing the authenticated display name. | No |
| `JWT_SECRET` | Always | Signs short-lived HTML/PDF export download tickets. | Yes |
| `PUPPETEER_EXECUTABLE_PATH` | PDF export | Chromium executable path; the supplied container uses `/usr/bin/chromium`. | No |
| `FILE_SOURCE` | Optional | Where a record's file list comes from (`server/fileSource.ts`). Default and only built value: `references`, built from the record's client folder link and its source checklist references. No network calls. `sharepoint` (read-only Microsoft Graph listing) is reserved for a future approved connector and is refused at startup. | No |
| `PIPELINE_SOURCE` | Optional | Where import rows come from (`server/pipelineSource.ts`). Default and only built value: `csv`, the uploaded SharePoint Pipeline List export. `salesforce` and `sharepoint` are reserved for future approved connectors and are refused at startup. | No |

## Local inventory-processing contract

RVTools XLSX and CSV files are selected through the browser file picker and parsed in browser memory. Raw workbook bytes, host names, VM names, datastore names, and per-object inventory rows are not sent to the application API. The browser retains only the summary required for the plan: counts, capacity totals, version distributions, hardware-model totals, planning considerations, source filenames, worksheet names, file sizes, and parser warnings.

Default Plan and Design activities are created from confirmed customer inputs, aggregate inventory facts, selected outcomes, entitlement value, and entitlement dates. Users can rename, move, resize, add, or remove activities in both calendar-month adoption views.

## Trusted OIDC gateway pattern

In CDW self-hosted mode, Entra ID or Okta authentication is terminated by an approved reverse proxy or application gateway. The gateway must remove inbound copies of the configured identity headers, authenticate the user, inject validated identity values, and forward traffic over a protected network path. Direct access to the application container must be blocked.

The app maps the trusted immutable identity to a local owner record and retains only the display name, email, issuer-scoped identity digest, workspace membership, and engagement ownership (kept for attribution). Every signed-in user joins workspace 1 and sees its engagements, so assignment to the app at the gateway decides who can see engagement data. The VSA tracker adds no environment variables. It never receives or stores the corporate password, MFA secret, or identity-provider access token.

## Secret handling

Secrets must be supplied at runtime through the platform secret manager. They must not appear in source control, image layers, tickets, browser-visible `VITE_*` values, or exported FCP documents. Rotate the database credential and hosted-session secret through the platform’s standard process.
