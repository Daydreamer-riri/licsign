# Design

## Direction

This service uses the offline activation model from the prior Cloudflare plan:
an activation code is exchanged online once for a signed offline license token.
The activation code is not the final license.

It also keeps a narrow LicenseGate compatibility surface from `../license-gate`:
`/license/:userId/:licenseKey/verify` maps `licenseKey` to `activation_code` and
returns `valid/result/signedChallenge?`.

## V1 Scope

Implemented in V1:

- Cloudflare Worker API.
- D1 migrations and data model.
- Products, batches, licenses, activations, audit logs.
- Admin API key authentication.
- Batch activation-code generation.
- One-time online activation and signed offline license token.
- Device limit enforcement using client-provided `machine_hash`.
- License disable, enable, revoke, search, detail, and CSV export.

Deferred:

- Admin UI.
- Email/password admin sessions.
- Billing.
- Floating seats.
- Per-launch online authorization.
- Multi-issuer UI packaging.

## Cloudflare Fit

The reference LicenseGate project is an Express, Prisma, MySQL, tRPC, Svelte app.
That stack is useful as a behavior reference but is not a clean Worker deployment.
This project uses Worker-native request handling and D1 prepared statements.

## Signing

V1 signs compact JWS tokens using `ES256` over a P-256 key.

Reasoning:

- Android TV Kotlin is the first client.
- Android devices vary widely by API level.
- `SHA256withECDSA` is broadly available in Android's Java security APIs.
- Ed25519 can be considered later if the supported Android TV fleet is known to be
  API 33+ or ships a bundled crypto provider.

The private JWK is stored as `SIGNING_PRIVATE_JWK` in Cloudflare secrets. The public
key is embedded in the Android TV app.

## Trial Mode

Each product carries a per-product trial switch (`trial_enabled`) plus a time
window (`trial_start_at` / `trial_end_at`) and a per-token TTL
(`trial_token_ttl_seconds`). While the window is active, clients can call
`POST /api/client/trial` with only `product_code + machine_hash` — no activation
code required — and receive a signed offline license whose payload sets
`kind: "trial"` and `license_id: null`.

Trial tokens carry an **independent TTL**, not tied to the trial window itself.
This gives three useful properties:

1. When the trial window ends, in-flight tokens stay valid offline until their TTL
   expires, so existing users do not see an instant blackout.
2. The window can be extended or shortened without affecting any already-issued
   token; the change only takes effect on the next renewal.
3. Renewal is automatic from the client's perspective — the same endpoint either
   succeeds (still in window) or returns `TRIAL_INACTIVE` (window closed), at
   which point the client falls back to the paid `POST /api/client/activate`.

Trial activations live in a separate `trial_activations` table keyed by
`(product_id, machine_hash)`. They never share rows with paid `licenses` /
`activations`, which keeps accounting, statistics, and audit log streams clean.
The trial endpoint is fully idempotent for the same `machine_hash`; it never
consumes paid-license quota.

V1 does not throttle the trial endpoint. If trial-token harvesting becomes a real
problem, add per-`machine_hash` rate limiting (KV or in-memory) and/or a
`products.trial_recovery_enabled` flag without breaking the existing API.

## Revocation Tradeoff

Revocation affects future online operations: activation, refresh, and the compatibility
verify endpoint. It cannot instantly invalidate already issued offline licenses unless
the client later implements periodic online refresh or a revocation list.

## Migrations and Deploy Coupling

`pnpm deploy` runs `wrangler d1 migrations apply --remote` before `wrangler deploy`.
This is convenient because the `d1_migrations` table makes additive migrations idempotent,
but it also means **any migration merged to `main` is applied to production on the next
deploy** — there is no separate "promote schema" step.

Rules:

- Migrations must be **additive and backward-compatible** with the currently deployed
  Worker. Add columns as nullable or with defaults; do not drop or rename columns that
  the live Worker still reads.
- Destructive migrations (drop column, rename column, drop table, narrow a type) must
  ship as a two-step rollout: first deploy a Worker version that no longer depends on
  the old shape, then merge the destructive migration in a follow-up PR.
- Never push a migration to `main` without verifying it applies cleanly against a copy
  of the remote schema (export via `wrangler d1 export --remote --no-data`, replay
  locally with `--local`).
