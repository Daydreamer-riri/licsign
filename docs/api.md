# API

All JSON APIs return structured errors:

```json
{
  "error": "BAD_REQUEST",
  "message": "Request validation failed",
  "details": {}
}
```

## Admin Authentication

Admin endpoints accept either:

- `Authorization: Bearer <api-key>`
- `Authorization: <api-key>`
- `?api_key=<api-key>`
- `admin_session` HttpOnly cookie from `POST /api/admin/auth/login`

The raw API key and raw browser session token are never stored. D1 stores their
SHA-256 hex digests. Mutating requests authenticated by session cookie require a
same-origin `Origin` header; API Key automation does not.

## Client API

### `POST /api/client/activate`

Request:

```json
{
  "product_code": "my_product",
  "activation_code": "PROD-ABCD-EFGH-JKLM-NPQR",
  "machine_hash": "64-character-sha256-hex",
  "device_label": "Living Room TV",
  "client_version": "1.0.0",
  "platform": "android-tv"
}
```

Response:

```json
{
  "license": {
    "version": 1,
    "license_id": "lic_xxx",
    "product_code": "my_product",
    "machine_hash": "64-character-sha256-hex",
    "features": [],
    "issued_at": "2026-05-18T00:00:00.000Z",
    "expires_at": null,
    "max_devices": 1,
    "issuer": "licsign",
    "key_id": "kid_xxx"
  },
  "signature": "base64url-signature",
  "token": "compact-jws"
}
```

Stable `POST /api/client/activate` errors:

- `INVALID_CODE`
- `LICENSE_DISABLED`
- `LICENSE_REVOKED`
- `LICENSE_EXPIRED`
- `PRODUCT_MISMATCH`
- `DEVICE_LIMIT_REACHED`
- `BAD_REQUEST`
- `SERVER_ERROR`

### `POST /api/client/deactivate`

Marks a machine activation as deactivated, allowing the seat to be reused.

### `POST /api/client/trial`

Issues a signed trial license for the requesting machine when the product's trial
window is active. **No activation code required.**

Request:

```json
{
  "product_code": "my_product",
  "machine_hash": "64-character-sha256-hex",
  "device_label": "Living Room TV",
  "client_version": "1.0.0",
  "platform": "android-tv"
}
```

Response shape matches `POST /api/client/activate`, with two differences in the
`license` payload:

- `kind` is `"trial"` (activation tokens omit this field or set it to `"license"`)
- `license_id` is `null` (trial tokens are not backed by a `licenses` row)
- `expires_at` is `now + product.trial_token_ttl_seconds`

The trial endpoint is idempotent for the same `machine_hash`: repeated calls update
`last_seen_at` and re-issue a fresh token without consuming any quota. Different
`machine_hash` values each get their own trial activation row.

Errors:

- `PRODUCT_NOT_FOUND` — no active product with that `product_code`
- `TRIAL_INACTIVE` — trial disabled or current time outside the trial window
- `BAD_REQUEST` — request shape invalid

When the trial window closes, previously issued tokens remain valid offline until
their TTL expires, but the endpoint stops issuing new ones. Clients that want to
continue beyond the window must fall back to `POST /api/client/activate` with a
purchased activation code.

### `POST /api/client/restore`

Re-issues a signed Offline License to a device that **already has an active
activation**, identified by `machine_hash` + `product_code` alone. **No activation
code required.** Use this on first launch after an uninstall+reinstall, when the
locally stored token is gone but the device itself is unchanged.

Request:

```json
{
  "product_code": "my_product",
  "machine_hash": "64-character-sha256-hex"
}
```

Response shape is identical to `POST /api/client/activate` — clients reuse the same
token storage and local verification path. The returned token has a fresh
`issued_at`.

Restore is a lookup-and-reissue: it **never** creates an activation row, consumes a
device seat, or reactivates a `deactivated` activation. It re-validates License
state online on every call, so a disabled, revoked, expired, or archived-Product
License cannot be restored. It is idempotent — repeated calls return the same
License and only refresh `last_seen_at`.

Errors:

- `NO_ACTIVATION` (`404`) — the device has no active activation for this product
  (including the case where it only has a `deactivated` activation). This is the
  client's signal to fall back to `POST /api/client/activate` with an activation
  code.
- `PRODUCT_NOT_FOUND` (`404`) — no product with that `product_code`
- `PRODUCT_MISMATCH` (`409`) — the product is archived
- `LICENSE_DISABLED` / `LICENSE_REVOKED` / `LICENSE_EXPIRED` (`403`) — License is
  no longer serviceable
- `BAD_REQUEST` (`400`) — request shape invalid

Restore depends on `machine_hash` being **identical after an uninstall+reinstall**.
If a device's recomputed hash differs, restore returns `NO_ACTIVATION` and the
client must use the activation-code flow.

## Admin API

### Auth

- `POST /api/admin/auth/login`
- `POST /api/admin/auth/logout`
- `GET /api/admin/me`

### Admins

- `GET /api/admin/admins`
- `POST /api/admin/admins`

### Products

- `GET /api/admin/products`
- `GET /api/admin/products/:id`
- `GET /api/admin/products/:id/overview`
- `GET /api/admin/products/:id/client-config`
- `POST /api/admin/products`
- `PATCH /api/admin/products/:id`

`GET /api/admin/products` returns each product with a `license_count`.
`GET /api/admin/products/:id/overview` returns an issuer-scoped summary —
license counts by status, batch count, and recent paid activations for the
product. Both are read-only and back the Admin UI product cards and Overview tab.

`GET /api/admin/products/:id/client-config` returns every integration-time input
a client integrator needs for the product (see `docs/client-integration.md` §2),
ready to hand off as JSON:

```json
{
  "base_url": "https://licsign.example.com",
  "product_code": "flow",
  "expected_issuer": "licsign",
  "trial_enabled": true,
  "signing_keys": [
    {
      "kid": "kid_xxx",
      "alg": "ES256",
      "public_jwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." }
    }
  ]
}
```

`base_url` is the request origin. `public_jwk` is derived from the signing key —
it is the public key only and never carries the private scalar `d`. `signing_keys`
contains **only the current signing key**; after a key rotation, retired keys must
be added by hand. It backs the Admin UI "Client Config" button on the Overview tab.

Create product body:

```json
{
  "code": "my_product",
  "name": "My Product",
  "description": "",
  "default_max_devices": 1,
  "trial_enabled": false,
  "trial_start_at": null,
  "trial_end_at": null,
  "trial_token_ttl_seconds": null
}
```

The four `trial_*` fields are optional. When `trial_enabled` is `true`, all three
of `trial_start_at`, `trial_end_at`, and `trial_token_ttl_seconds` are required;
`trial_start_at` must be strictly before `trial_end_at`. TTL accepts 60 seconds to
90 days. `PATCH /api/admin/products/:id` accepts the same fields; toggling
`trial_enabled` to `false` stops new trial issuance immediately while existing
trial tokens remain valid offline until their TTL expires.

### Batches

- `GET /api/admin/batches`
- `GET /api/admin/batches/:id`
- `POST /api/admin/batches`

Create batch body:

```json
{
  "product_id": "prd_xxx",
  "batch_name": "Initial batch",
  "quantity": 100,
  "max_devices": 1,
  "expires_at": null,
  "validity_duration_seconds": null,
  "code_prefix": "TV",
  "notes": "optional"
}
```

`expires_at` and `validity_duration_seconds` are mutually exclusive — at most one
may be non-null. `expires_at` is Absolute Expiry (cutoff fixed at batch creation).
`validity_duration_seconds` is Activation-Relative Validity (the License is valid
for that many seconds, counted from first activation); accepted range is one day
(86400) to 100 years (3,153,600,000). Both null = perpetual License. Sending both
non-null returns `400 VALIDITY_CONFLICT`.

The response includes generated `activation_codes`, a raw `csv` string, and the
echoed `expires_at` / `validity_duration_seconds`. API Key-created batches set
`created_by_api_key_id`; browser Admin-created batches set `created_by_admin_id`.

### Licenses

- `GET /api/admin/licenses`
- `GET /api/admin/licenses/:id`
- `POST /api/admin/licenses/:id/disable`
- `POST /api/admin/licenses/:id/enable`
- `POST /api/admin/licenses/:id/revoke`
- `GET /api/admin/licenses/export.csv`

License JSON responses (`GET /api/admin/licenses`, `GET /api/admin/licenses/:id`)
include `validity_duration_seconds` alongside `expires_at`. For codes that use
Activation-Relative Validity, `expires_at` is `null` until first activation and
then the materialized cutoff (`activated_at + validity_duration_seconds`) — see
ADR-0006. The CSV export includes a `validity_duration_seconds` column between
`expires_at` and `created_at`.

Search query parameters:

- `q`
- `product_id`
- `batch_id`
- `status`
- `take`
- `skip`

### Dashboard

- `GET /api/admin/dashboard/stats`

Recent activations include paid license activations only; trial activations are
not mixed into this feed.

### Audit logs

- `GET /api/admin/audit-logs`

Audit entries record the actual actor kind. Browser Admin actions use
`actor_type = "admin"` with an Admin id; API Key automation uses
`actor_type = "api_key"` with an API Key id.

## LicenseGate Compatibility

### `GET /license/:userId/:licenseKey/verify`
### `POST /license/:userId/:licenseKey/verify`

`userId` maps to `issuers.public_user_id`. `licenseKey` maps to `activation_code`.

Response:

```json
{
  "valid": true,
  "result": "VALID",
  "signedChallenge": "optional-compact-jws"
}
```

The compatibility endpoint is for online status checks and transitional callers. The
primary V1 client flow is `/api/client/activate`.
