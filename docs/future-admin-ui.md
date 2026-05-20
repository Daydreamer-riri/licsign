# Admin UI

**Status: implemented.** The admin UI is a React + Vite + TypeScript SPA built
with shadcn/ui + Tailwind CSS, served by Cloudflare Workers Static Assets from the
same Worker deployment.

The information architecture is product-scoped — see
`docs/adr/0004-product-scoped-admin-ui-ia.md`.

## Pages

- Login
- Products grid (home) — product cards, global stats, recent activations
- Product `/products/:id` — Overview / Batches / Licenses / Settings tabs
- Batch detail and License detail, nested under the product
- Settings — Admins, Audit Log
- ⌘K command palette for cross-product product/license search

## Authentication

Admin accounts use email + password. Passwords are hashed with PBKDF2-SHA256
(see `docs/adr/0001-pbkdf2-password-hashing.md`).

Sessions use a D1 `admin_sessions` table with a random opaque token in an
HttpOnly SameSite=Strict cookie (see `docs/adr/0002-d1-session-table.md`).
Session lifetime is 7 days with a sliding window: if less than 3.5 days remain,
the expiration is extended on the next request.

CSRF protection relies on SameSite=Strict plus server-side Origin header
validation on mutating requests authenticated by session cookie. API key
automation remains usable without an Origin header. Browser session
authentication is same-origin only: the Admin UI is served from the same Worker
deployment as the API, and session cookies are not supported for arbitrary
cross-origin Admin UI hosts.

## Admin account creation

The first admin is created during bootstrap (`pnpm setup:remote` with
`--admin-email` and `--admin-password`). Additional admins are created by an
existing admin with an initial password. Email invitation delivery and forced
first-login password changes are deferred.

## Data model additions

- `admins` table: id, issuer_id (FK), email (unique), password_hash,
  password_salt, status, created_at, updated_at
- `admin_sessions` table: id, token_hash (unique), admin_id (FK), expires_at,
  created_at
- `license_batches.created_by_admin_id`: nullable FK to `admins(id)` for
  batches created from browser Admin sessions. `created_by_api_key_id` remains
  the FK for API Key-created batches.
- `audit_logs.actor_type`: records the actual actor kind (`admin`, `api_key`,
  `system`, or `client`).

Each admin is bound to a single issuer via `admins.issuer_id`. V1 admins have
the same permissions within that issuer; role-based access control is deferred.

## New backend endpoints

- `POST /api/admin/auth/login`
- `POST /api/admin/auth/logout`
- `GET /api/admin/me`
- `GET /api/admin/admins`
- `POST /api/admin/admins`
- `GET /api/admin/products/:id`
- `GET /api/admin/products/:id/overview`
- `GET /api/admin/dashboard/stats`
- `GET /api/admin/audit-logs`

## Frontend project

- Location: `admin/` (top-level, alongside `worker/` and `shared/`)
- Stack: React 19 + Vite + TypeScript + shadcn/ui + Tailwind CSS
- Shares types/schemas from `shared/`
- Build output: `admin/dist/`
- wrangler.jsonc assets config: `{ "directory": "../admin/dist" }`

## Build and deploy

`pnpm deploy` builds the frontend first (`pnpm -F admin build`), then
applies D1 migrations, then runs `wrangler deploy`.

## Existing API key authentication

API key authentication is preserved for automation and CI/CD. The admin
middleware accepts either a session cookie or an API key Bearer token.
Cross-origin automation should continue to use API keys, not browser sessions.
