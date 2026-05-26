# Activation-Relative Validity materializes `licenses.expires_at` on first activation

## Status

Accepted

## Context

V1 expressed license expiration only as `licenses.expires_at` — an absolute ISO 8601
cutoff chosen by the Admin at batch creation. The new **Activation-Relative
Validity** model lets a batch declare a Duration (in seconds) that starts counting
at the License's first activation (e.g. "valid for 365 days from activation").

The Worker must pick an absolute moment at activation time. Three places could
hold that moment:

- (a) write it back into `licenses.expires_at`
- (b) leave `licenses.expires_at` NULL forever and recompute on every signing call
  from `activated_at + validity_duration_seconds`
- (c) introduce a new column `licenses.effective_expires_at` so `expires_at` always
  means "Admin input" and `effective_expires_at` always means "computed cutoff"

## Decision

Option (a). On the first activation that transitions a License from `available`
to `activated`, the Worker computes `activated_at + validity_duration_seconds` and
writes it into `licenses.expires_at` in the same atomic UPDATE that sets
`activated_at` and `status`. From that point on, every read path — JWS signing,
CSV export, Admin API, LicenseGate compatibility — uses `licenses.expires_at`
unchanged.

`license_batches` enforces strict mutual exclusion between `expires_at` and
`validity_duration_seconds` via CHECK. `licenses` allows both columns to be
non-null *after* `activated_at` is set, because at that point `expires_at` is
a derived value rather than independent Admin input.

## Consequences

- Issuance, restore, and compatibility code paths take **zero new branches** —
  they keep reading `licenses.expires_at`.
- Audit visibility: the materialization happens inside the same service call that
  writes the `client.activate` audit row, so the computed cutoff is recorded in
  `audit_logs.details_json` (`computed_expires_at` + `validity_duration_seconds`).
- `licenses.expires_at` no longer means "the value an Admin originally typed" —
  for relative-validity codes it is a system-computed derived column. Future
  readers of the schema need to know this, hence the asymmetric CHECK between
  `license_batches` (strict) and `licenses` (post-activation-aware).
- Re-activations, second devices under `max_devices > 1`, restores,
  disable→enable, and full-deactivate→reactivate cycles all leave `expires_at`
  unchanged, because `markActivated` uses `COALESCE(expires_at, ?)` and never
  re-fires after the License leaves `available`.

## Alternatives considered

- **(b) Compute on every signing call.** Rejected: every issuance site
  (`activation`, `restore`, the LicenseGate compatibility verifier, the future
  refresh endpoint, the CSV export, the Admin detail view) would need to remember
  to join `activated_at + duration`. One missed call site silently issues a
  perpetual License.
- **(c) Separate `effective_expires_at` column.** Rejected: doubles the schema
  surface, forces Admin UI and CSV to explain two near-identical columns, and
  the "always know whether it's Admin-input or computed" property is already
  recoverable from `validity_duration_seconds IS NOT NULL`.
