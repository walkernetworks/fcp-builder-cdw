# VSA Tracker: IT and InfoSec Integration Brief

## What it is
An internal web application that tracks VMware VSA engagements end to end. It replaces the SharePoint VSA Pipeline List as the working system of record, and builds each engagement's Functional Consumption Plan (FCP).

- **Front end:** React and TypeScript, built with Vite.
- **Back end:** Node.js 22 running Express with a tRPC API.
- **Database:** MySQL through Drizzle ORM.
- **PDF export:** headless Chromium driven by puppeteer-core.

It is a server-plus-database application, not a static page. Details: `docs/SECURITY-REVIEW.md`, `docs/CONFIGURATION.md`, `docs/DEPLOYMENT.md`.

## Data it holds
- **Tracker fields:** stage and append-only stage history, segment, gate dates, status, notes, and the source checklist.
- **Commercials (CDW confidential):** VSA (entitlement) value, estimated deal value, Broadcom PO number, opportunity number, Salesforce Customer ID, and SER number.
- **Internal personal data:**
  - assignment names, with CDW and Broadcom email addresses;
  - signed-in users' names and emails, supplied by the identity provider.
- **Client SharePoint folder links:** stored as text, `https://` only. The app never fetches them.
- **Customer confidential, some under customer NDA:**
  - FCP documents and their version history, generated in the app;
  - customer discovery context: brief content, personnel names, and what was heard.
- **SharePoint import data:** the values from the last daily SharePoint import, kept per record so the next import can tell app edits from SharePoint edits.
- **RVTools:** raw RVTools exports are parsed in the browser and never sent to or stored on the server. Only aggregate facts are saved.

## Security posture today
- **Network:** the app makes no outbound calls except to its own database. Pipeline data arrives as a CSV that a person uploads once a day.
- **Sign-in:** identity comes from a trusted OIDC gateway in front of the app. The app has no login, passwords, or session cookies of its own.
- **Access:** every signed-in user joins one shared workspace and sees the records in it. So whoever the SSO gateway lets in is who can see the data. Delete is limited to the record's owner or an admin.
- **Accountability:** every tracker and FCP write is attributed to a user. Concurrent edits are checked so one person can't silently overwrite another's change.
- **Exports:** exported documents are self-contained, with no external fonts, scripts, or images. Download links are signed and expire after 2 minutes.
- **Internal vs customer-facing fields:**
  - Every tracker column is tagged internal or customer-facing, and a test fails if a column is untagged.
  - Customer documents are built from the FCP document, not from the tracker's internal fields.
  - The condensed FCP runs content checks before every download that block rates, PO value, and internal tracker data.

## What it needs to run
- **Host:** a container host for the supplied image. It is Node 22 with Chromium included and exposes a single inbound port (3000 by default).
- **Database:** a MySQL-compatible database reached over TLS.
- **Secrets:** two secrets from a secret manager, the database connection string (`DATABASE_URL`) and the download-link signing key (`JWT_SECRET`).
- **SSO gateway:** in front of the app, supplying identity headers. The app already expects this, so adopting CDW SSO is a configuration change, not a code change.
- **Database location:** a decision on where the database lives, given the NDA discovery data it holds.

## Integration asks (only if approved; the app runs fully standalone without them)
- **SSO:** confirm the OIDC gateway model is how CDW wants this application authenticated.
- **SharePoint (optional):** an Azure app registration with Microsoft Graph read access scoped to the VSA site, for read-only display of a client folder's contents.
  - `Sites.Selected` is preferred over tenant-wide `Sites.Read.All`.
  - The app already has the connection point for this (`FILE_SOURCE=sharepoint`). The connector itself is not built, and the server refuses that setting until it is.
- **Salesforce (optional):** a connected app with read-only API access to the Account and Opportunity objects and the fields the VSA intake uses, to replace the daily CSV import with a live pull.
  - The connection point is reserved the same way (`PIPELINE_SOURCE=salesforce`) and is not built.
- **Network:** if connectors are approved, an outbound allowlist limited to the Microsoft Graph and Salesforce API endpoints only.

## Open questions for IT
- What is the approved hosting pattern for an internal Node.js and MySQL application?
- Where should the database live, and what backup and retention policy applies to NDA data?
- Can the connector app registrations above be granted, and at what scope?
- Is a data-handling review required before customer discovery data is stored?
