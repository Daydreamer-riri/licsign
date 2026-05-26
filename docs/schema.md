# Schema

The canonical source of truth is `worker/migrations/0001_initial.sql` (plus later
numbered migration files: `0002_product_trial.sql`, `0003_admin_auth.sql`,
`0004_license_validity_duration.sql`). This document provides a readable
reference with column details, constraints, relationships, and index rationale.

## ER Diagram

```
issuers ──1:N── api_keys
         ──1:N── admins
         ──1:N── products
         ──1:N── license_batches
         ──1:N── licenses
         ──1:N── audit_logs
         ──1:N── trial_activations

products ──1:N── license_batches
         ──1:N── licenses
         ──1:N── trial_activations

license_batches ──1:N── licenses

licenses ──1:N── activations

api_keys ──1:N── license_batches (created_by)
admins ──1:N── admin_sessions
       ──1:N── license_batches (created_by)
```

## issuers

Top-level entity. V1 is single-issuer; the schema keeps `issuer_id` boundaries for
future multi-issuer support.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Internal identifier (ULID) |
| public_user_id | TEXT | NOT NULL, UNIQUE | Exposed in LicenseGate compat: maps to `userId` path param |
| name | TEXT | NOT NULL | Display name |
| status | TEXT | NOT NULL, CHECK IN ('active', 'disabled') | Issuer availability |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |
| updated_at | TEXT | NOT NULL | ISO 8601 timestamp |

Cascade: deleting an issuer removes all its api_keys, admins, products,
license_batches, and licenses. audit_logs and license_batches creator fields use
SET NULL to preserve history.

## admins

People authorized to manage one issuer through the Admin UI.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Internal identifier |
| issuer_id | TEXT | NOT NULL, FK → issuers(id) ON DELETE CASCADE | Owning issuer |
| email | TEXT | NOT NULL, UNIQUE | Login email |
| password_hash | TEXT | NOT NULL | PBKDF2-SHA256 password hash |
| password_salt | TEXT | NOT NULL | Salt used for PBKDF2 |
| status | TEXT | NOT NULL, CHECK IN ('active', 'disabled') | Admin availability |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |
| updated_at | TEXT | NOT NULL | ISO 8601 timestamp |

Indexes:

- `idx_admins_issuer_id` — list admins by issuer
- `idx_admins_email` — login lookup

## admin_sessions

Opaque browser sessions for Admin UI authentication.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Internal identifier |
| token_hash | TEXT | NOT NULL, UNIQUE | SHA-256 hex of the session token |
| admin_id | TEXT | NOT NULL, FK → admins(id) ON DELETE CASCADE | Authenticated admin |
| expires_at | TEXT | NOT NULL | Session expiry |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |

Indexes:

- `idx_admin_sessions_admin_id` — delete/list sessions by admin
- `idx_admin_sessions_token_hash` — session lookup
- `idx_admin_sessions_expires_at` — cleanup expired sessions

## api_keys

Automation authentication. Raw keys are never stored; only SHA-256 hex digests.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Internal identifier |
| issuer_id | TEXT | NOT NULL, FK → issuers(id) ON DELETE CASCADE | Owning issuer |
| name | TEXT | NOT NULL | Human-readable label (e.g. "CI deploy key") |
| key_hash | TEXT | NOT NULL, UNIQUE | SHA-256 hex of the raw API key |
| status | TEXT | NOT NULL, CHECK IN ('active', 'disabled') | Key availability |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |
| last_used_at | TEXT | nullable | Updated on each successful auth |

Indexes:

- `idx_api_keys_issuer_id` — list keys by issuer

## products

Licensed products that activation codes belong to.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Internal identifier |
| issuer_id | TEXT | NOT NULL, FK → issuers(id) ON DELETE CASCADE | Owning issuer |
| code | TEXT | NOT NULL | Short code used in activation requests and license tokens (e.g. "my_product") |
| name | TEXT | NOT NULL | Display name |
| description | TEXT | NOT NULL, DEFAULT '' | Optional description |
| status | TEXT | NOT NULL, CHECK IN ('active', 'archived') | Product lifecycle |
| default_max_devices | INTEGER | NOT NULL, DEFAULT 1 | Default device limit for batches/licenses created under this product |
| trial_enabled | INTEGER | NOT NULL, DEFAULT 0 | 0/1 toggle for the per-product trial window |
| trial_start_at | TEXT | nullable | ISO 8601; required when `trial_enabled = 1` |
| trial_end_at | TEXT | nullable | ISO 8601; required when `trial_enabled = 1`, must be strictly after `trial_start_at` |
| trial_token_ttl_seconds | INTEGER | nullable | Per-token TTL for trial JWS; required when `trial_enabled = 1`; bounded 60s – 90d at the API layer |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |
| updated_at | TEXT | NOT NULL | ISO 8601 timestamp |

Constraints:

- UNIQUE (issuer_id, code) — product codes are unique per issuer

Indexes:

- `idx_products_issuer_id` — list products by issuer
- `idx_products_code` — lookup by code (activation request path)

## license_batches

Groups of activation codes generated in bulk.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Internal identifier |
| issuer_id | TEXT | NOT NULL, FK → issuers(id) ON DELETE CASCADE | Owning issuer |
| product_id | TEXT | NOT NULL, FK → products(id) ON DELETE CASCADE | Target product |
| batch_name | TEXT | NOT NULL | Human-readable label |
| code_prefix | TEXT | nullable | Prefix for generated activation codes (e.g. "TV") |
| quantity | INTEGER | NOT NULL | Number of codes generated |
| max_devices | INTEGER | NOT NULL | Device limit per license in this batch |
| expires_at | TEXT | nullable | Absolute Expiry; null = use Activation-Relative Validity or no expiration |
| validity_duration_seconds | INTEGER | nullable, CHECK [86400, 3153600000], CHECK mutually exclusive with `expires_at` | Activation-Relative Validity duration in seconds; copied into each License at batch creation |
| notes | TEXT | nullable | Free-form notes |
| created_by_api_key_id | TEXT | FK → api_keys(id) ON DELETE SET NULL | API Key that created the batch; null when a browser Admin created it |
| created_by_admin_id | TEXT | FK → admins(id) ON DELETE SET NULL | Admin that created the batch; null when an API Key created it |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |

Indexes:

- `idx_license_batches_issuer_id` — list batches by issuer
- `idx_license_batches_product_id` — list batches by product
- `idx_license_batches_created_by_admin_id` — list batches by creator admin

## licenses

Individual activation codes and their lifecycle state.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Internal identifier; becomes `license_id` in signed JWS payload |
| issuer_id | TEXT | NOT NULL, FK → issuers(id) ON DELETE CASCADE | Owning issuer |
| product_id | TEXT | NOT NULL, FK → products(id) ON DELETE CASCADE | Product this license belongs to |
| batch_id | TEXT | FK → license_batches(id) ON DELETE SET NULL | Origin batch; SET NULL if batch is deleted |
| activation_code | TEXT | NOT NULL, UNIQUE | The code exchanged for a signed license token |
| status | TEXT | NOT NULL, CHECK IN ('available', 'activated', 'disabled', 'revoked') | Lifecycle state |
| max_devices | INTEGER | NOT NULL | Concurrent device limit |
| issued_to | TEXT | nullable | Optional recipient identifier |
| metadata_json | TEXT | nullable | Arbitrary JSON metadata |
| expires_at | TEXT | nullable | Effective expiration. For Absolute Expiry codes: Admin input. For Activation-Relative Validity codes: NULL until first activation, then materialized to `activated_at + validity_duration_seconds`. See ADR-0006. |
| validity_duration_seconds | INTEGER | nullable, CHECK [86400, 3153600000], CHECK with `expires_at` (see below) | Activation-Relative Validity duration in seconds; copied from `license_batches` at batch creation |
| activated_at | TEXT | nullable | First activation timestamp; once set, never cleared. Anchors Activation-Relative Validity |
| revoked_at | TEXT | nullable | Revocation timestamp |
| revoked_reason | TEXT | nullable | Free-form reason for revocation |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |
| updated_at | TEXT | NOT NULL | ISO 8601 timestamp |

Indexes:

- `idx_licenses_issuer_id` — list by issuer
- `idx_licenses_product_id` — list by product
- `idx_licenses_batch_id` — list by batch
- `idx_licenses_status` — filter by lifecycle state
- `idx_licenses_activation_code` — lookup during client activation

Validity model invariant (CHECK):

- Before first activation (`activated_at IS NULL`): `expires_at` and
  `validity_duration_seconds` are mutually exclusive. A License chooses Absolute
  Expiry, Activation-Relative Validity, or neither (perpetual).
- After first activation: both columns may be non-null because `expires_at` has
  been materialized from `activated_at + validity_duration_seconds`.

`license_batches` enforces strict mutual exclusion of the two fields (no
`activated_at` exception). See `worker/migrations/0004_license_validity_duration.sql`
and ADR-0006.

## activations

Tracks which devices have activated a license. Clients send `machine_hash` (SHA-256 of
hardware identifiers), never raw device IDs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Internal identifier |
| license_id | TEXT | NOT NULL, FK → licenses(id) ON DELETE CASCADE | Parent license |
| machine_hash | TEXT | NOT NULL | SHA-256 hex digest of client hardware identifiers |
| device_label | TEXT | nullable | User-provided name (e.g. "Living Room TV") |
| client_version | TEXT | nullable | App version at activation time |
| platform | TEXT | nullable | Client platform (e.g. "android-tv") |
| status | TEXT | NOT NULL, CHECK IN ('active', 'deactivated') | Activation state; deactivation frees a device seat |
| activated_at | TEXT | NOT NULL | ISO 8601 timestamp |
| deactivated_at | TEXT | nullable | Deactivation timestamp |
| last_seen_at | TEXT | nullable | Last refresh or re-verification timestamp |
| license_payload_version | INTEGER | NOT NULL | Version counter in the signed JWS payload; incremented on re-activation or refresh |

Constraints:

- UNIQUE (license_id, machine_hash) — one activation per device per license

Indexes:

- `idx_activations_license_id` — list activations by license
- `idx_activations_machine_hash` — lookup device across licenses
- `idx_activations_status` — filter active vs deactivated

## trial_activations

Tracks devices that have requested a trial license under a product. Independent
from `activations` because trial tokens are not backed by a `licenses` row.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Internal identifier |
| issuer_id | TEXT | NOT NULL, FK → issuers(id) ON DELETE CASCADE | Owning issuer (denormalized from product for fast filtering) |
| product_id | TEXT | NOT NULL, FK → products(id) ON DELETE CASCADE | Product the trial was issued for |
| machine_hash | TEXT | NOT NULL | SHA-256 hex digest of client hardware identifiers |
| device_label | TEXT | nullable | User-provided name |
| client_version | TEXT | nullable | App version at first trial |
| platform | TEXT | nullable | Client platform (e.g. "android-tv") |
| first_seen_at | TEXT | NOT NULL | First trial issuance for this device under this product |
| last_seen_at | TEXT | NOT NULL | Most recent trial issuance |
| last_token_expires_at | TEXT | NOT NULL | `issued_at + product.trial_token_ttl_seconds` of the most recent token |
| token_count | INTEGER | NOT NULL, DEFAULT 1 | Total trial tokens issued to this device (incremented on every renewal) |

Constraints:

- UNIQUE (product_id, machine_hash) — one trial activation row per device per product

Indexes:

- `idx_trial_activations_issuer_id` — list trials by issuer
- `idx_trial_activations_product_id` — list trials by product (count trial users, etc.)
- `idx_trial_activations_machine_hash` — lookup a device across products

## audit_logs

Immutable record of significant operations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Internal identifier |
| issuer_id | TEXT | FK → issuers(id) ON DELETE SET NULL | Issuer context; SET NULL if issuer is deleted |
| actor_type | TEXT | NOT NULL, CHECK IN ('admin', 'api_key', 'system', 'client') | Kind of actor that performed the action |
| actor_id | TEXT | nullable | Admin id, API Key id, machine_hash, or null for system |
| action | TEXT | NOT NULL | Operation name (e.g. "activate", "revoke", "batch_create") |
| target_type | TEXT | NOT NULL | Entity type (e.g. "license", "batch") |
| target_id | TEXT | nullable | Entity id |
| details_json | TEXT | nullable | Arbitrary JSON context |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |

Indexes:

- `idx_audit_logs_issuer_id` — list by issuer
- `idx_audit_logs_action` — filter by operation type
- `idx_audit_logs_created_at` — chronological ordering

## API Field Mapping

| API field | Table | Column |
|-----------|-------|--------|
| product_code | products | code |
| activation_code | licenses | activation_code |
| machine_hash | activations | machine_hash |
| device_label | activations | device_label |
| client_version | activations | client_version |
| platform | activations | platform |
| max_devices | licenses / license_batches | max_devices |
| expires_at | licenses / license_batches | expires_at |
| validity_duration_seconds | licenses / license_batches | validity_duration_seconds |
| userId (LicenseGate) | issuers | public_user_id |
| licenseKey (LicenseGate) | licenses | activation_code |
