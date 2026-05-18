# CLAUDE.md

This repository contains a Cloudflare-native license service for activation-code
based offline licenses. The first implementation is API-only and targets Android
TV native clients.

## Project Shape

- `worker/`: Cloudflare Worker backend.
- `worker/migrations/`: D1 SQL migrations.
- `worker/scripts/bootstrap.mjs`: initial issuer, API key, and signing key helper.
- `worker/src/routes/`: Hono route modules.
- `worker/src/services/`: business logic for auth, products, batches, licenses,
  activation, audit logs, and LicenseGate compatibility.
- `worker/src/crypto/`: signing helpers.
- `shared/src/`: shared request schemas and response/types.
- `docs/`: architecture, API, Android TV verification, future UI, multi-issuer,
  and key rotation notes.

## Commands

Use Node 22 or newer. The repo includes `.node-version`.

```sh
fnm use
pnpm install
pnpm test
pnpm typecheck
HOME=/tmp fnm exec --using=22.18.0 node_modules/.bin/wrangler deploy --dry-run --config worker/wrangler.jsonc
```

D1 local migration verification may require permissions to bind localhost:

```sh
HOME=/tmp fnm exec --using=22.18.0 node_modules/.bin/wrangler d1 migrations apply license_service --local --config worker/wrangler.jsonc
```

## Deployment Setup

Before production deployment:

1. Replace `database_id` in `worker/wrangler.jsonc` with the real D1 database id.
2. Run migrations against the remote D1 database.
3. Run `pnpm bootstrap -- --api-key=<long-random-admin-key>`.
4. Read `worker/bootstrap.local.json`, then apply its `sql` statements to D1.
5. Store `signing.key_id` and `signing.private_jwk` as Worker secrets.
6. Embed `signing.public_jwk` in the Android TV verifier.

Never commit real API keys, private JWKs, bootstrap JSON files, Wrangler state, or
local D1 databases.

## Core Design

The primary model is offline activation:

1. A user receives an activation code.
2. The Android TV client calls `POST /api/client/activate` once.
3. The Worker validates product, code status, expiration, and device limit.
4. The Worker issues a signed ES256 compact JWS license.
5. The client stores the JWS and verifies it locally on future launches.

Activation codes are not the final license. The local signed token is the license.

V1 uses ES256/P-256 instead of Ed25519 because Android TV API levels vary, and
`SHA256withECDSA` is the safer native verification target.

## API Surfaces

Primary client API:

- `POST /api/client/activate`
- `POST /api/client/deactivate`

Admin API, protected by D1-backed API keys:

- `GET/POST/PATCH /api/admin/products`
- `GET/POST /api/admin/batches`
- `GET /api/admin/batches/:id`
- `GET /api/admin/licenses`
- `GET /api/admin/licenses/:id`
- `POST /api/admin/licenses/:id/disable`
- `POST /api/admin/licenses/:id/enable`
- `POST /api/admin/licenses/:id/revoke`
- `GET /api/admin/licenses/export.csv`

Compatibility API:

- `GET /license/:userId/:licenseKey/verify`
- `POST /license/:userId/:licenseKey/verify`

In the compatibility API, `userId` maps to `issuers.public_user_id`, and
`licenseKey` maps to `licenses.activation_code`.

## Data Model Notes

D1 is the system of record. Tables are intentionally explicit:

- `issuers`
- `api_keys`
- `products`
- `license_batches`
- `licenses`
- `activations`
- `audit_logs`

V1 starts as a single-issuer service, but the schema and service layer keep
`issuer_id` boundaries so multi-issuer support can be added later.

API keys are stored as SHA-256 hashes, never raw values.

## Important Constraints

- Keep the service fully compatible with Cloudflare Workers. Do not introduce
  Express, Prisma, Node-only crypto libraries, filesystem persistence, or long-lived
  Node server assumptions.
- Do not add admin UI in V1 unless explicitly requested. UI planning belongs in
  `docs/future-admin-ui.md`.
- Do not treat revocation as instant offline invalidation. Disable/revoke only affects
  future online activation, refresh, or compatibility verification until a future
  refresh/revocation-list design exists.
- Do not send or store raw Android hardware identifiers. Clients send only
  `machine_hash`, a SHA-256 hex digest.
- Keep response error codes stable; client integrations depend on them.

## Testing Expectations

When changing code, run:

```sh
fnm exec --using=22.18.0 node_modules/.bin/vitest run
fnm exec --using=22.18.0 node_modules/.bin/tsc -p tsconfig.json --noEmit
HOME=/tmp fnm exec --using=22.18.0 node_modules/.bin/wrangler deploy --dry-run --config worker/wrangler.jsonc
```

Add focused tests for:

- activation-code generation
- signing and verification helpers
- activation state transitions
- device-limit enforcement
- LicenseGate compatibility mappings

## Documentation

Update docs whenever behavior changes:

- `docs/design.md` for architecture and tradeoffs.
- `docs/api.md` for request/response contracts.
- `docs/android-tv-verification.md` for client verification implications.
- `docs/key-rotation.md` for signing key changes.
- `docs/future-*.md` for intentionally deferred work.
