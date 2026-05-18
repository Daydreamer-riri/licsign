# Schema

The canonical source of truth is `worker/migrations/0001_initial.sql`. This document
provides a readable reference with column details, constraints, relationships, and
index rationale.

## ER Diagram

```
issuers ──1:N── api_keys
         ──1:N── products
         ──1:N── license_batches
         ──1:N── licenses
         ──1:N── audit_logs

products ──1:N── license_batches
         ──1:N── licenses

license_batches ──1:N── licenses

licenses ──1:N── activations

api_keys ──1:N── license_batches (created_by)
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

Cascade: deleting an issuer removes all its api_keys, products, license_batches, and
licenses. audit_logs and license_batches.created_by_api_key_id use SET NULL to preserve
history.

## api_keys

Admin authentication. Raw keys are never stored; only SHA-256 hex digests.

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
| expires_at | TEXT | nullable | License expiration; null = no expiration |
| notes | TEXT | nullable | Free-form notes |
| created_by_api_key_id | TEXT | FK → api_keys(id) ON DELETE SET NULL | API key that created the batch; SET NULL preserves audit trail if key is deleted |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |

Indexes:

- `idx_license_batches_issuer_id` — list batches by issuer
- `idx_license_batches_product_id` — list batches by product

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
| expires_at | TEXT | nullable | Hard expiration; null = no expiration |
| activated_at | TEXT | nullable | First activation timestamp |
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

## audit_logs

Immutable record of significant operations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | Internal identifier |
| issuer_id | TEXT | FK → issuers(id) ON DELETE SET NULL | Issuer context; SET NULL if issuer is deleted |
| actor_type | TEXT | NOT NULL, CHECK IN ('admin', 'system', 'client') | Who performed the action |
| actor_id | TEXT | nullable | api_key id (admin) or machine_hash (client) |
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
| userId (LicenseGate) | issuers | public_user_id |
| licenseKey (LicenseGate) | licenses | activation_code |

## Planned Future Tables

From `docs/future-admin-ui.md`:

- `admins` — email/password accounts for admin UI login
- `admin_sessions` — cookie-based session tokens for admin UI auth

These will be added as new migration files when the admin UI is implemented.