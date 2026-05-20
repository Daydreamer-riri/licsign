# PRD: Admin UI with session auth

## Problem Statement

Licsign has a capable Admin API, but routine operations still require API keys and raw HTTP tooling. Maintainers need a browser Admin UI for managing Products, Batches, Licenses, Admins, and audit history without weakening the existing offline-license model or breaking API Key automation.

Admin browser authentication also needs to be distinct from API Key automation: an Admin is a person managing one Issuer, while an API Key is an automation credential for the same Admin API surface.

## Solution

Build a same-origin Admin UI using React, Vite, TypeScript, shadcn/ui, and Tailwind CSS, served from the same Cloudflare Worker deployment through Workers Static Assets.

Add email/password Admin authentication with PBKDF2-SHA256 password hashes and D1-backed opaque sessions. Preserve API Key authentication for automation. Add the minimal endpoints needed by the UI: login, logout, current identity, Admin listing/creation, Dashboard stats, and paginated audit logs.

## User Stories

1. As an Admin, I want to log in with email and password, so that I can manage my Issuer without manually handling an API Key.
2. As an Admin, I want my browser session stored in an HttpOnly SameSite=Strict cookie, so that JavaScript cannot read the credential.
3. As an Admin, I want sessions to expire after 7 days, so that abandoned sessions do not remain valid indefinitely.
4. As an Admin, I want active sessions to slide their expiration when less than half the lifetime remains, so that normal usage does not force unnecessary re-login.
5. As an Admin, I want to log out, so that my session is invalidated server-side.
6. As an Admin, I want to see my current identity and Issuer, so that I know which Issuer I am managing.
7. As an automation maintainer, I want existing API Key authentication to keep working, so that CI/CD and scripts do not break.
8. As an Admin, I want browser sessions to be same-origin only, so that session cookies are not supported from arbitrary cross-origin UI hosts.
9. As an Admin, I want CSRF protection on session-authenticated mutating requests, so that malicious sites cannot perform actions through my browser.
10. As an automation maintainer, I want API Key mutating requests to work without an Origin header, so that non-browser automation remains compatible.
11. As the first maintainer, I want setup/bootstrap to create the first Admin, so that the UI is usable after deployment.
12. As an Admin, I want to create another Admin with an initial password, so that more people can manage the same Issuer without shared credentials.
13. As an Admin, I want to list Admins for my Issuer, so that I can see who has access.
14. As an Admin, I want all V1 Admins to have the same permissions, so that the initial model stays simple before RBAC exists.
15. As an Admin, I want every Admin scoped to exactly one Issuer, so that Admin access cannot cross Issuer boundaries.
16. As an Admin, I want a simple Dashboard, so that I can quickly see Product and License volume.
17. As an Admin, I want recent Dashboard activations to include paid License activations only, so that trial activity does not distort paid-license operations.
18. As an Admin, I want to view Products, so that I can inspect my Issuer catalog.
19. As an Admin, I want to create Products, so that new licenseable offerings can be added.
20. As an Admin, I want to edit Products, so that names, descriptions, status, device defaults, and trial settings can be maintained.
21. As an Admin, I want to view Batches, so that I can inspect generated Activation Code batches.
22. As an Admin, I want to create Batches, so that I can generate Activation Codes for a Product.
23. As an Admin, I want to open a Batch detail page, so that I can inspect Licenses produced by that Batch.
24. As an Admin, I want to search Licenses, so that I can find an Activation Code or recipient quickly.
25. As an Admin, I want License search pagination and filters, so that large License sets remain manageable.
26. As an Admin, I want to open a License detail page, so that I can inspect License fields and activations.
27. As an Admin, I want to disable a License, so that future online activation or compatibility verification can be blocked without deleting history.
28. As an Admin, I want to re-enable a disabled License, so that accidental disables can be corrected when the License is not revoked.
29. As an Admin, I want to revoke a License with a reason, so that irreversible abuse or refund decisions are recorded.
30. As an Admin, I want the UI to explain that disable/revoke does not instantly invalidate already-issued Offline Licenses, so that I understand the offline model.
31. As an Admin, I want to browse paginated audit logs, so that I can review administrative and system activity.
32. As an Admin, I want browser Admin actions audited with the Admin actor identity, so that human actions are distinguishable from API Key automation.
33. As an automation maintainer, I want API Key actions to keep auditing the API Key actor, so that existing accountability remains intact.
34. As a deployer, I want the frontend built before Worker deploy, so that Static Assets match the deployed API.
35. As a deployer, I want non-API browser routes to return the SPA shell, so that refreshes and deep links work.
36. As a developer, I want shared request/response schemas where practical, so that frontend and Worker contracts drift less.
37. As a developer, I want security-sensitive Admin auth behavior isolated in deep modules, so that it can be tested without UI rendering.
38. As a developer, I want Dashboard and audit-log queries isolated from route handlers, so that query semantics are easy to test.
39. As a developer, I want the Worker to remain Cloudflare-native, so that no Node-only runtime assumptions enter the backend.
40. As a developer, I want documentation updated, so that future agents do not rely on stale API-only assumptions.

## Implementation Decisions

- Build or modify these deep modules:
  - Admin authentication service: PBKDF2 hashing, verification, login, logout, session validation, and sliding expiration.
  - Admin session store: opaque token creation, D1 persistence, expiration, lookup, and deletion.
  - Admin account service: first Admin bootstrap support, same-Issuer Admin listing, and same-Issuer Admin creation with an initial password.
  - Admin auth middleware: accept either API Key or session cookie and produce a unified Admin API context with Issuer identity and actor identity.
  - CSRF/Origin guard: validate Origin only for mutating requests authenticated by session cookie.
  - Dashboard read model: Product count, License count, and recent paid License activations scoped to the current Issuer.
  - Audit-log query service: paginated audit entries scoped to the current Issuer.
  - Frontend API client: same-origin fetch wrapper, typed contracts, and consistent unauthorized handling.
  - Frontend route shell/pages: Login, Dashboard, Products, Batches, Batch detail, Licenses, License detail, Admins, and Audit log.
  - Deployment integration: frontend build before Worker deploy, Static Assets configuration, and SPA fallback routing for non-API paths.
- Admin and API Key are distinct domain credentials. Admin is a person using the Admin UI; API Key is an automation credential.
- Batch creator provenance uses separate nullable foreign keys: API Key-created batches set `created_by_api_key_id`, and Admin-created batches set `created_by_admin_id`.
- Preserve existing API Key authentication behavior, including Bearer tokens, raw Authorization values, and query-string API keys where currently supported.
- Use PBKDF2-SHA256 for Admin passwords because Workers provide Web Crypto PBKDF2 and the project avoids Node-only crypto libraries.
- Use D1-backed Admin sessions instead of JWTs, matching the existing ADR for server-side invalidation and avoiding session use of License signing keys.
- Prefer storing a hash of the session token rather than the raw token if feasible, aligning with the project's "never store raw API keys" posture.
- Session cookies are HttpOnly and SameSite=Strict.
- Browser session auth is same-origin only; cross-origin Admin UI deployments using session cookies are not supported.
- API Key automation remains usable without Origin headers.
- The first Admin is created by setup/bootstrap with email and password arguments.
- Additional Admins are created by an existing Admin with an initial password.
- Email invitation delivery and forced first-login password changes are deferred.
- V1 Admins have the same permissions within one Issuer; RBAC is deferred.
- Reuse the existing current-identity endpoint for both API Key and session-cookie auth.
- Login/logout live under Admin auth routes.
- Dashboard stats exclude trial activations from recent paid License activations.
- Audit logs must record the actual actor kind: Admin browser actions use `actor_type = "admin"` and API Key automation uses `actor_type = "api_key"`.
- The UI must not imply that disabled or revoked Licenses instantly invalidate already-issued Offline Licenses.
- Update architecture, API, schema, and Admin UI docs as behavior moves from deferred to implemented.
- Keep response error codes stable for existing integrations.

## Testing Decisions

- Good tests verify external behavior and durable outcomes: response status/body, cookies, persisted rows, audit-log side effects, Issuer scoping, and security boundaries. Do not test private helper call order.
- Test Admin authentication: correct password succeeds, wrong password fails, unknown/disabled Admins are rejected, login creates a session, logout invalidates it, expired sessions fail, and sliding expiration renews only below the threshold.
- Test Admin session storage: session creation, lookup, expiration, deletion, and non-exposure of raw session tokens if token hashing is implemented.
- Test middleware: API Key auth still works, session cookie auth works, missing/invalid credentials fail, Issuer context is correct, and actor identity distinguishes Admin from API Key.
- Test CSRF/Origin: session mutating requests require valid same-origin Origin, session safe requests do not, API Key mutating requests do not require Origin, and cross-origin session mutations fail.
- Test Admin accounts: bootstrap can create first Admin, active Admin can create another Admin for the same Issuer, email uniqueness is enforced, listing is Issuer-scoped, and disabled Admins cannot log in.
- Test Dashboard read model: counts are Issuer-scoped, paid License activations appear, trial activations are excluded, ordering is newest-first, and limits are enforced.
- Test audit-log query: Issuer scoping, stable pagination, Admin actor recording, and API Key actor preservation.
- Test new route contracts: login sets cookie, logout invalidates session, current identity works for both auth modes, Admin list/create require auth, dashboard/audit endpoints validate pagination and auth.
- Test SPA/static integration if practical: API paths keep JSON API behavior, non-API paths return the UI shell, and API 404s remain JSON errors.
- Frontend tests should focus on observable behavior: login redirect, unauthorized redirect, Dashboard rendering, list/detail loading/empty/error/populated states, and License action calls/state updates.
- Follow prior service-test style already used for activation state transitions, code generation, signing/verification, LicenseGate compatibility, and trial issuance.
- Run existing test, typecheck, and Worker dry-run deploy validation after implementation.

## Out of Scope

- Public registration.
- Google OAuth or external identity providers.
- Email invitation delivery.
- Forced first-login password changes.
- Password reset by email.
- Owner/Admin roles.
- Full RBAC.
- Multi-Issuer Admin management UI.
- Complex Dashboard charts.
- Billing.
- Floating seats.
- Per-launch online authorization.
- Instant offline invalidation of already-issued Offline Licenses.
- Replacing API Key automation auth.
- Cross-origin browser Admin UI deployments using session cookies.
- Admin UI theming beyond a usable shadcn/ui + Tailwind baseline.

## Further Notes

- The glossary distinguishes Admin from API Key; implementation, UI copy, docs, and tests should keep that language.
- ADRs 0001–0003 cover PBKDF2 hashing, D1 sessions, and audit placement. ADR-0004 records the product-scoped UI information architecture, which supersedes the flat page list in this PRD's "Implementation Decisions".
- Current docs still contain API-only/deferred language in places; update those docs as the feature lands.
- The UI must remain honest about the offline-license model: Activation Codes are exchanged for signed Offline Licenses, and existing Offline Licenses remain locally verifiable until their own validity window ends.
