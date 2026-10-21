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
| `FCP_BACKUP_ALLOW_REMOTE` | Development only, optional | Set to `1` to let `scripts/db-backup.sh` dump a database that is not on `localhost`. It is unset by default, so a shared or production database is never copied to a laptop by accident. The app itself does not read it. | No |

## Operational settings (database)

Some operational thresholds are set in the app, not in the environment. An admin changes them on **Admin › Settings** (`/admin?tab=settings`). They are stored in the `app_settings` table, one row per key, and hold no customer data.

| Column | Type | Purpose |
|---|---|---|
| `key` | `varchar(64)`, primary key | Setting name, from `SETTING_DEFINITIONS` in `shared/appSettings.ts`. |
| `value` | `json` | The value. Every setting today is a whole number of days. |
| `updatedByUserId` | `int`, nullable, FK `users.id` (set null) | The admin who last saved it; null for the seeded defaults. |
| `updatedAt` | `timestamp` | When it was last saved. |

| Key | Default | Allowed | Meaning |
|---|---|---|---|
| `stale_after_days.<stage>` | intake 7, broadcom_request 14, discovery 21, fcp_draft 21, broadcom_approval 14, customer_approval 21, ra_staffing 14, kickoff 14, paused 60 | 1 to 365 | Days a record may sit in the stage before it counts as stale. In Delivery has no threshold. |
| `work_plan_stale_days` | 14 | 1 to 180 | Days after a work plan is sent, without acceptance, before the record shows a warning. |
| `expiry_band_days.d30`, `.d60`, `.d90`, `.d180` | 30, 60, 90, 180 | 1 to 730, each larger than the one before | Upper bound, in days left, of each dated expiry band. |

- **Defaults:** the code constants (`STALE_AFTER_DAYS` and `EXPIRY_BAND_DAYS` in `shared/vsaDashboard.ts`, `WORK_PLAN_STALE_DAYS` in `shared/vsaStage.ts`). Migration `0006_seed_app_settings` seeds the table with them; `server/appSettings.test.ts` checks that the two match.
- **Fallback:** a missing or invalid value uses its default. If the stored expiry bands are out of order, all four use their defaults. If the table can't be read (for example before `pnpm db:migrate`), every setting uses its default, so nothing breaks.
- **Validation:** the server checks every save (whole numbers, the bounds above, bands in order) with the same rules the screen shows.

## Admin access

The admin area (`/admin`) is open only to users whose `users.role` is `admin`. Every procedure behind it is an `adminProcedure` (`server/_core/trpc.ts`), so the server refuses everyone else; the hidden navigation entry is a courtesy. Admin changes to a user's role, role view, or workspace are recorded in `users.updatedByUserId` and `users.updatedAt` (a sign-in updates only `lastSignedIn`). The app refuses to demote the last admin.

There is no environment variable for admins. A user is created as `user` at first sign-in, so the first admin is set by a person in the database, for example `UPDATE users SET role = 'admin' WHERE email = '<their CDW email>';`. After that, admins manage roles in the app.

The admin area shows `PIPELINE_SOURCE`, `FILE_SOURCE`, and the feature flags (none exist yet) read-only. It can't change them: a connector goes live only through an environment change plus an IT approval record.

## Local inventory-processing contract

RVTools XLSX and CSV files are selected through the browser file picker and parsed in browser memory. Raw workbook bytes, host names, VM names, datastore names, and per-object inventory rows are not sent to the application API. The browser retains only the summary required for the plan: counts, capacity totals, version distributions, hardware-model totals, planning considerations, source filenames, worksheet names, file sizes, and parser warnings.

Default Plan and Design activities are created from confirmed customer inputs, aggregate inventory facts, selected outcomes, entitlement value, and entitlement dates. Users can rename, move, resize, add, or remove activities in both calendar-month adoption views.

## Trusted OIDC gateway pattern

In CDW self-hosted mode, Entra ID or Okta authentication is terminated by an approved reverse proxy or application gateway. The gateway must remove inbound copies of the configured identity headers, authenticate the user, inject validated identity values, and forward traffic over a protected network path. Direct access to the application container must be blocked.

The app maps the trusted immutable identity to a local owner record and retains only the display name, email, issuer-scoped identity digest, workspace membership, and engagement ownership (kept for attribution). Every signed-in user joins workspace 1 and sees its engagements, so assignment to the app at the gateway decides who can see engagement data. The VSA tracker adds no environment variables. It never receives or stores the corporate password, MFA secret, or identity-provider access token.

## Secret handling

Secrets must be supplied at runtime through the platform secret manager. They must not appear in source control, image layers, tickets, browser-visible `VITE_*` values, or exported FCP documents. Rotate the database credential and hosted-session secret through the platform’s standard process.
