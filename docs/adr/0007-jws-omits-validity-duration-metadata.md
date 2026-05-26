# Offline License JWS omits Activation-Relative Validity metadata

## Status

Accepted

## Context

When the Worker signs an Offline License, the JWS payload (`OfflineLicensePayload`,
`shared/src/types.ts`) carries an absolute `expires_at` plus product, machine,
issuer, key id, and a `version: 1` tag. Clients verify the token locally on every
launch.

After [ADR-0006](0006-activation-relative-validity-materializes-expires-at.md),
`licenses.expires_at` is always populated by the time signing runs, regardless of
whether the License uses Absolute Expiry or Activation-Relative Validity. The
question is whether the JWS payload should *additionally* carry
`validity_duration_seconds` and `activated_at` so clients can render UI like
"1-year membership · 287 days remaining".

## Decision

Do not add those fields. `OfflineLicensePayload` stays at `version: 1` and
continues to carry only the computed `expires_at`. The "this is a 1-year
membership" semantic is surfaced only through the Admin API and CSV export, not
through the signed payload.

## Consequences

- Client verifiers do not need a new version bump, a new field whitelist, or
  any schema migration. The Android TV verifier shipped today keeps working.
- The signed payload remains minimal — important because it is signed, shipped
  to every device, and refreshed on every activation/restore.
- Clients cannot natively distinguish "valid for 365 days from activation" from
  "expires 2027-05-26", because by signing time those are the same value. UI
  needing that distinction must query the Admin API.

## Alternatives considered

- **Add `validity_duration_seconds` + `activated_at` to the payload** and bump
  to `version: 2`. Rejected: requires a coordinated client-side verifier update,
  inflates every signed token forever for a UI nicety that no current client
  has requested, and is irreversible once issued (in-the-wild tokens stay on
  the new shape).
- **Add only `validity_duration_seconds`.** Rejected for the same reasons; the
  field is signed and permanent, so partial information is the worst of both
  worlds.

If a client ever needs this metadata, the right path is a separate online
endpoint (e.g. an Admin-facing License detail) rather than a payload bump.
