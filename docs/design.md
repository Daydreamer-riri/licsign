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
- Email/password Admin sessions and a same-origin browser Admin UI.

Deferred:

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

## Restore by machine_hash

A paid Offline License lives only in the client's app-private storage, which an
uninstall+reinstall wipes. `POST /api/client/restore` lets a device that already
holds an **active** activation re-obtain its signed License using only
`product_code + machine_hash` — no activation code. It is a lookup-and-reissue:
the activation lookup joins `activations → licenses → products`, the matched
License goes through the **same** online state validation as `activate` (a shared
`ensureLicenseServiceable` helper), and the existing issuance path signs a fresh
token. Restore never creates an `activations` row, never counts seats, and never
reactivates a `deactivated` activation — it can only recover access a device
already had, never establish it. It is idempotent and only refreshes
`last_seen_at`.

Security-wise restore adds no material attack surface: the token it returns is
bound to the requesting `machine_hash`, exactly as an `activate` token is, and is
useless on any device that cannot reproduce that hash. Its real guard is
`machine_hash` entropy, and it re-checks License state online so a
disabled/revoked/expired License — or an archived Product — cannot be restored.
Restore is feasible **only** if `machine_hash` is stable across an
uninstall+reinstall (Android `ANDROID_ID` is, for an unchanged signing key).

Like the trial endpoint, V1 does not throttle restore; per-`machine_hash` rate
limiting (a Cloudflare WAF rule, or KV counters) is the recommended follow-up if
bulk probing with leaked `machine_hash` values becomes a problem. Successful
restores write a `client.restore` audit log; `NO_ACTIVATION` failures write a
`client.restore_failed` entry so harvesting probes are visible in audit history.

## Admin UI

The Admin UI is a same-origin React SPA (shadcn/ui + Tailwind) served from the
Worker via Static Assets. It runs on React Router **framework mode** in SPA mode
(`ssr: false`): routes are declared in `admin/src/routes.ts` and data pages load
through `clientLoader`. Its information architecture is **product-scoped**: the
home route is a product grid, and Batches, Licenses, and product Settings are
nested under `/products/:id/*`. Cross-product lookup is a ⌘K command palette, not
flat global lists. See `docs/adr/0004-product-scoped-admin-ui-ia.md` for the
information architecture and `docs/adr/0005-react-router-framework-mode-spa.md`
for the rendering and data-loading model.

## Activation-Relative Validity

In addition to **Absolute Expiry** (`expires_at` fixed at batch creation),
batches can declare a **Duration** via `validity_duration_seconds` (1 day to
100 years). Each License in such a batch is valid for that many seconds counted
from its first activation. The two models are mutually exclusive per batch.

On the first activation that transitions a License from `available` to
`activated`, the Worker computes `activated_at + validity_duration_seconds` and
writes it into `licenses.expires_at` atomically with `activated_at` and `status`.
From then on every signing path treats the License like any Absolute Expiry
License — there is no extra branch in `issuance`, `restore`, or the
compatibility verifier. The timer never re-anchors: re-activation under
`max_devices > 1`, disable→enable, deactivate-all→reactivate, and restore all
read the materialized `expires_at` unchanged. See ADR-0006 for the storage
decision and ADR-0007 for why the JWS payload is not extended with Duration
metadata.

Distinct from trial token TTL: trial TTL is a per-token, per-device window
re-issued on every trial call. Activation-Relative Validity is a per-License,
one-shot Duration anchored to that License's first activation.

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
