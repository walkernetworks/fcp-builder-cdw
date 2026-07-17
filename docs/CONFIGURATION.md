# Configuration Reference

The application reads all deployment-specific identity, AI, database, and rendering settings from environment variables. **No endpoint, client identifier, tenant identifier, API key, or secret should be committed to the repository.** Production values should be injected from the CDW-approved secret manager at container start.

| Variable | Required | Purpose | Secret |
|---|---:|---|---:|
| `PORT` | Yes | Single inbound HTTP port assigned by the container platform. | No |
| `DATABASE_URL` | Yes | MySQL-compatible connection string for users and structured engagement JSON. | Yes |
| `JWT_SECRET` | Yes | Signs hosted OAuth session cookies. Use a long random value. | Yes |
| `VITE_APP_ID` | Hosted mode | Hosted Manus OAuth application identifier. | No |
| `OAUTH_SERVER_URL` | Hosted mode | Approved hosted OAuth service URL. | No |
| `VITE_OAUTH_PORTAL_URL` | Hosted mode | Approved hosted login portal URL. | No |
| `FCP_AUTH_MODE` | CDW SSO mode | Set to `trusted-proxy` when an approved OIDC-aware gateway handles Entra ID or Okta. | No |
| `FCP_OIDC_ISSUER` | CDW SSO mode | Expected corporate issuer identifier used to namespace local identities. | No |
| `FCP_SSO_ID_HEADER` | CDW SSO mode | Header injected by the trusted gateway for the immutable user identifier. | No |
| `FCP_SSO_EMAIL_HEADER` | CDW SSO mode | Header injected by the trusted gateway for email. | No |
| `FCP_SSO_NAME_HEADER` | CDW SSO mode | Header injected by the trusted gateway for display name. | No |
| `FCP_LLM_ENDPOINT` | Enterprise AI mode | Exact OpenAI-compatible chat-completions URL for the approved enterprise LLM. | No |
| `FCP_LLM_API_KEY` | Enterprise AI mode | Bearer credential for the approved LLM endpoint. | Yes |
| `FCP_LLM_MODEL` | Enterprise AI mode | Approved model deployment name. | No |
| `FCP_LLM_TIMEOUT_MS` | No | Request timeout; defaults to 90,000 ms. | No |
| `PUPPETEER_EXECUTABLE_PATH` | Container | Chromium executable path; the supplied image uses `/usr/bin/chromium`. | No |

## CDW Entra ID or Okta pattern

The easiest security-review path is an **OIDC-aware reverse proxy** already approved by CDW. The gateway performs OIDC, MFA, token validation, session management, and conditional-access enforcement. It must remove any inbound identity headers from untrusted clients before adding its own trusted headers. The app must not be reachable directly around that gateway.

The app maps the trusted immutable identity to a local owner record and retains only the display name, email, a one-way issuer-scoped identity digest, and engagement ownership. It never receives or stores the user's corporate password.

## Approved LLM pattern

`FCP_LLM_ENDPOINT` must point only to a CDW-approved enterprise endpoint whose data-handling terms prohibit training and cross-tenant retention. The endpoint is called server-side. The API key is never sent to the browser. If the call fails or the response violates the authoritative timeline schema, the application returns a deterministic §7-compliant draft and displays the validation warning.
