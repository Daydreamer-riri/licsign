# PRD: Restore Offline License by machine_hash

## Problem Statement

A paid Offline License lives in the client's app-private storage. When a TV owner
uninstalls and reinstalls the app, that stored token is gone. To get the app
working again they must locate their original Activation Code and type it back in
on a TV remote — and many will have discarded or lost the code, because the
contract has always told them the local signed token *is* the license and the
Activation Code is single-use.

The device itself has not changed. It is the same physical TV, with the same
device identity, that was already legitimately activated. Forcing the owner back
through Activation Code entry for a pure reinstall is avoidable friction, and in
the worst case (lost code) leaves a paying customer locked out of a product they
already own.

## Solution

Add a client endpoint that lets a previously-activated device re-obtain its
signed Offline License using only its `machine_hash` and the `product_code` —
no Activation Code required.

When a TV owner reinstalls the app, the client recomputes its `machine_hash`
(the same value it has always sent) and calls `POST /api/client/restore`. If the
service finds an existing **active** activation for that device on a serviceable
License, it re-issues a freshly signed Offline License, exactly as activation
would. If there is no active activation for that device, the client falls back to
the normal Activation Code flow.

Restore is a lookup-and-reissue of a License the device already holds. It never
grants a new device seat, never resurrects an activation the owner deliberately
released, and re-validates License state online before issuing.

## User Stories

1. As a TV owner, I want my app to work again after reinstalling it, so that I do not have to find and re-type my Activation Code.
2. As a TV owner who lost the paper/email with my Activation Code, I want to recover my License, so that I am not locked out of a product I already paid for.
3. As a TV owner, I want restore to happen automatically on first launch after reinstall, so that recovery feels seamless and requires no input from me.
4. As a client app, I want a `POST /api/client/restore` endpoint that takes only `product_code` and `machine_hash`, so that I can recover a License without holding an Activation Code.
5. As a client app, I want the restore response to have the same shape as the activate response, so that I can reuse my existing token storage and local verification path.
6. As a client app, when restore finds no active activation for this device, I want a stable, distinct error code, so that I can cleanly fall back to the Activation Code flow.
7. As a TV owner, I want a reinstalled device to receive a token with a fresh `issued_at`, so that local verification treats it as a current Offline License.
8. As a TV owner, I want restore to never consume an additional device seat, so that reinstalling does not push my License toward its device limit.
9. As a TV owner who deliberately deactivated this device to move my License to another TV, I do not want a reinstall to silently steal the License back, so that deactivation stays meaningful.
10. As a TV owner, when this device only has a deactivated activation, I want restore to fail clearly so the app sends me through Activation Code entry, so that the device-limit check is honored.
11. As an Issuer, I want restore to re-check License state online, so that a disabled License cannot be restored after I disabled it.
12. As an Issuer, I want restore to reject a revoked License, so that revocation keeps blocking future online operations.
13. As an Issuer, I want restore to reject an expired License, so that expiry is enforced consistently with activation.
14. As an Issuer, I want restore to reject a License whose Product is archived, so that archived Products stop yielding tokens.
15. As an Issuer, I want restore to require the correct `product_code`, so that a device cannot restore the wrong Product.
16. As an Issuer, I want a `client.restore` audit log entry for every successful restore, so that I can see recovery activity in audit history.
17. As an Issuer, I want a device that activated several Products to restore each Product independently, so that one device's multiple Licenses do not collide.
18. As an Issuer, when a device has more than one active activation for the same Product, I want restore to pick the most recently used one deterministically, so that the outcome is predictable.
19. As an Issuer, I want a restored activation to update its `last_seen_at`, so that audit and activation records reflect the recovery.
20. As a client app, I want restore to be idempotent, so that calling it repeatedly on the same device returns the same License without side effects on seats.
21. As an Issuer, I want restore to never create a new activation row, so that restore can only ever recover, never establish, device access.
22. As a maintainer, I want the restore logic to live in a small, isolated service module, so that its behavior can be unit-tested without spinning up the whole Worker.
23. As a maintainer, I want the License-state validation shared between activate and restore, so that the two paths cannot drift apart in what they accept.
24. As a maintainer, I want the restore request schema validated like other client schemas, so that malformed `machine_hash` or missing `product_code` is rejected before any database access.
25. As an integrator, I want `docs/api.md` and the client-integration guides to document restore, so that client teams can implement the reinstall flow correctly.
26. As an integrator, I want the guides to state that restore depends on `machine_hash` being stable across reinstall, so that I verify my device-identity recipe before relying on the feature.

## Implementation Decisions

### New client endpoint

- Add `POST /api/client/restore` to the client route module.
- Request body: `{ product_code, machine_hash }`. No Activation Code, no device metadata required.
- Success response: `200` with the existing `SignedLicenseResponse` shape (`license`, `signature`, `token`) — identical to `POST /api/client/activate`, so clients reuse storage and verification unchanged.
- Restore is **not** added to the Compatibility API; it is a primary client API surface only.

### Restore service (deep module)

- Restore business logic lives in its own service module (`restore`), separate from the activation service, with a single entry point `restoreLicense(env, body)`.
- The module encapsulates: schema parse → device/Product lookup → License-state validation → audit log → signed-License issuance. Its interface is one function in, one `SignedLicenseResponse` (or `ApiError`) out — testable in isolation.
- Restore reuses the existing signed-License issuance path; it does not introduce a second token format.

### Shared License-state validation

- The License-state checks currently inside the activation service (`PRODUCT_MISMATCH` / archived Product, `LICENSE_DISABLED`, `LICENSE_REVOKED`, `LICENSE_EXPIRED`) are extracted into a shared helper consumed by **both** activate and restore.
- This guarantees activate and restore accept exactly the same set of serviceable Licenses; restore inherits the same online re-validation guarantees as activation.

### Activation lookup query

- Add an activations query, `findActiveByMachineAndProduct`, that returns the activation for a given `machine_hash` whose License belongs to the given `product_code` and whose activation `status = 'active'`.
- It joins `activations → licenses → products` and returns enough columns for License-state validation and issuance.
- Tiebreak: if more than one row matches, the most recently used one wins — order by `last_seen_at` then `activated_at`, most recent first.
- This query backs restore only; it relies on the existing `idx_activations_machine_hash` index.

### Restore request schema

- Add `restoreSchema` to the shared schemas module: `product_code` (existing `productCodeSchema`) and `machine_hash` (existing `machineHashSchema`), both required.

### Activation state rules

- Restore matches **only** `status = 'active'` activations. A `deactivated` activation is never restored and never silently reactivated.
- Restore never calls the device-limit count, never creates an activation row, and never reactivates — it cannot change how many seats a License consumes.
- Restore updates the matched activation's `last_seen_at`. Whether to also refresh `device_label` / `client_version` / `platform` is left to implementation; the restore request is not required to carry them.
- `license_payload_version` is unchanged by restore.

### Error contract

- Add a `NO_ACTIVATION` code to the client activation error set, returned `404` when the device has no active activation for the requested Product (including the "only a deactivated activation exists" case). This is the client's signal to fall back to Activation Code entry.
- `PRODUCT_NOT_FOUND` (`404`) when the `product_code` does not resolve to a Product.
- `PRODUCT_MISMATCH` (`409`), `LICENSE_DISABLED` / `LICENSE_REVOKED` / `LICENSE_EXPIRED` (`403`) are reused from the shared License-state validation, identical to activation.
- `BAD_REQUEST` (`400`) on schema validation failure.
- Existing client error codes keep their meaning; only `NO_ACTIVATION` is added.

### Audit logging

- A successful restore writes an audit log with action `client.restore`, `actorType: "client"`, target `license`, and details including `machine_hash`, `product_code`, and the resolved `license_id`, consistent with how `client.activate` and `client.trial` are recorded.

## Testing Decisions

A good test here asserts **external behavior** — the response, the error code, the audit record, the seat count — not the internal call sequence. Tests drive the service through its public entry point with an in-memory fake D1, the same approach already used for the activation and trial services.

Modules under test:

1. **Restore service** — the primary suite. Cases: restores a signed License for a device with an active activation; is idempotent across repeated calls; returns `NO_ACTIVATION` when the device has no activation; returns `NO_ACTIVATION` when the device has only a `deactivated` activation; rejects `LICENSE_DISABLED` / `LICENSE_REVOKED` / `LICENSE_EXPIRED`; rejects `PRODUCT_MISMATCH` for an archived Product or wrong `product_code`; returns `PRODUCT_NOT_FOUND` for an unknown Product; does not create an activation row; does not change the active-seat count; updates `last_seen_at`; writes a `client.restore` audit log. Prior art: `worker/test/activation.test.ts`, `worker/test/trial.test.ts`.
2. **Activations query (`findActiveByMachineAndProduct`)** — verifies it returns only `active` activations scoped to the right Product, returns nothing for a `deactivated`-only device, and applies the most-recent tiebreak when multiple active activations match. Exercised through the fake-D1 statement layer used by the existing service tests.
3. **Restore schema** — verifies `restoreSchema` accepts a well-formed request, rejects a malformed `machine_hash`, and rejects a missing `product_code`. Prior art: existing shared-schema and `admin/src/lib` validation tests.

## Out of Scope

- **Rate limiting on the restore endpoint.** Recommended as a follow-up to blunt bulk abuse from a set of leaked `machine_hash` values, but the limiting mechanism (KV/Durable Object counters, etc.) is deferred and not implemented in this PRD.
- **Auto-restoring deactivated activations.** Restore deliberately ignores `deactivated` activations; resurrecting a released device would require a device-limit check and is the Activation Code flow's job.
- **Recovering the signed token via OS-level cloud backup.** Android Auto Backup may sometimes restore the stored token; it is unreliable and not part of this design.
- **Client-side `machine_hash` derivation changes.** This PRD assumes `machine_hash` is stable across reinstall (see Further Notes). Changing or strengthening the device-identity recipe is separate work.
- **Compatibility API.** The LicenseGate-compatible verify endpoints are unchanged.
- **Refresh / revocation-list / instant offline invalidation.** Restore is an online operation only and does not change the offline-invalidation model.
- **Trial restore.** Trials are already idempotent per `machine_hash` via the trial endpoint; no separate trial-restore is added.
- **Multi-issuer behavior.** Restore respects existing `issuer_id` boundaries through the Product lookup but adds no new multi-issuer surface.

## Further Notes

**Feasibility depends on `machine_hash` being stable across reinstall.** If the
recomputed `machine_hash` differs after reinstall, restore cannot match anything
and the feature is inert. The V1 recipe in `docs/client-integration-kotlin.md`
currently states that `ANDROID_ID` "resets on factory reset or app
uninstall+reinstall". Actual Android 8+ behavior is that `ANDROID_ID` is scoped
by `(signing key, user, device)` and survives a plain uninstall+reinstall as long
as the signing key is unchanged — it changes only on factory reset or signing-key
change. This claim must be verified on the target Android TV devices and the doc
corrected; if `machine_hash` is genuinely not reinstall-stable in the target
fleet, this feature should not ship until the device-identity recipe is fixed.

**Security posture.** `machine_hash` is a device identifier, not a secret.
Restore does not materially expand the attack surface beyond the existing
offline-verification model: it only ever returns an Offline License already bound
to the requesting `machine_hash`, and any token a third party copies still
requires spoofing that same `machine_hash` to pass local verification — which is
already true today for a copied activation token. Restore is gated to
`status = 'active'` activations and re-validates License state online, so it
cannot recover a disabled, revoked, or expired License.

**Consistency with existing constraints.** Restore re-checking License state on
every call is consistent with the project rule that disable/revoke affect future
online operations rather than acting as instant offline invalidation.
