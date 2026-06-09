# PRD: Evaluation — Per-Device One-Shot Free Assessment

## Problem Statement

A potential customer wants to try a product before purchasing. The existing Promotional Trial mechanism is an operator-controlled, time-windowed "free for all" event — useful for marketing campaigns, but not as a standing offer. There is no way for a new device to get a free, time-limited assessment of a product on its own, at any time, without an Activation Code and without requiring the Issuer to open a trial window.

Without this, the only path to using a product is to purchase an Activation Code first. That is a hard ask for a product the customer has never seen.

## Solution

Add an **Evaluation** — a per-device, one-shot free assessment period that is always-on (no window), configured per-product by the Issuer. A device calls `POST /api/client/evaluate` and receives a signed Offline License with a fixed TTL. The expiry is anchored to the first issuance and never moves — the device cannot renew or extend it. Once the evaluation token expires, that device has permanently used its one evaluation opportunity for that product. The device is then expected to purchase an Activation Code if it wants to continue using the product.

Evaluation is fully independent from the existing Promotional Trial and from paid activation. A device may hold an evaluation token and a promotional trial token simultaneously. A device that has completed (or never used) its evaluation may still activate with an Activation Code.

## User Stories

1. As a potential customer, I want to try a product for a few days before purchasing, so that I can decide whether it is worth buying.
2. As a TV owner, I want my evaluation to start the moment I first open the app, so that I do not have to do anything special to begin the trial.
3. As a TV owner, I want my evaluation token to last for a fixed number of days, so that I know exactly how long I have to evaluate the product.
4. As a TV owner, I want my evaluation to not renew or extend, so that the countdown is honest and predictable.
5. As a TV owner, I want the evaluation to work without an Activation Code, so that I can try the product before committing to a purchase.
6. As a TV owner who already used and expired my evaluation, I want to still be able to purchase an Activation Code and activate normally, so that evaluation is a stepping stone, not a dead end.
7. As a TV owner, I want the evaluation to not affect my ability to use a promotional trial on the same product, so that the two offers do not interfere with each other.
8. As a client app, I want a `POST /api/client/evaluate` endpoint that takes `product_code` and `machine_hash`, so that I can request an evaluation with minimal information.
9. As a client app, I want the evaluation response to have the same shape as the activate and trial responses, so that I can reuse my existing token storage and local verification path.
10. As a client app, I want the signed token to carry `kind: "evaluation"`, so that I can distinguish it from paid licenses and promotional trial tokens in local verification.
11. As a client app, I want a stable, distinct error code when evaluation is not available for a product, so that I can show a clear message to the user.
12. As a client app, I want a stable, distinct error code when a device has already used its evaluation and the token has expired, so that I can prompt the user to purchase.
13. As a client app, when I call `/evaluate` for a device that already has a non-expired evaluation token, I want to receive a fresh signed token with the same anchored expiry, so that I can recover from lost local storage without extending the evaluation window.
14. As a client app, I want the anchored expiry to be `first_issued_at + ttl_days`, so that the evaluation window is fixed regardless of how many times I call the endpoint.
15. As a client app, I want `evaluation_token_ttl_days` to be communicated in the integration config, so that I know how long the evaluation will last before making the request.
16. As an Issuer, I want to enable or disable evaluation per product, so that I control which products offer a free assessment.
17. As an Issuer, I want to set the evaluation duration in whole days per product, so that I can offer different trial lengths for different products (e.g. 3 days for a simple app, 7 days for a complex one).
18. As an Issuer, I want the evaluation to always be available when enabled — no time window to configure — so that I do not have to manage promotional campaigns for a standing offer.
19. As an Issuer, I want disabling evaluation to not invalidate tokens already issued, so that the offline-invalidation model stays consistent with paid licenses and promotional trials.
20. As an Issuer, I want evaluation to not check product `status`, only `evaluation_enabled`, so that I control the two independently (e.g. I can archive a product while its existing evaluations naturally expire).
21. As an Issuer, I want a `client.evaluate` audit log entry for every successful evaluation issuance, so that I can see evaluation activity in audit history.
22. As an Issuer, I want a `client.evaluate_expired` audit log entry when a device tries to evaluate after its window has closed, so that I can track how many devices hit the paywall.
23. As an Issuer, I want the dashboard to include an `evaluation_count` per product, so that I can see how many devices have evaluated each product.
24. As an Issuer, I want evaluation to never create or modify a paid activation, so that evaluation and paid licensing remain fully independent data paths.
25. As an Issuer, I want a device with an active paid license to still be able to call `/evaluate` without being rejected, so that the server does not cross-check independent mechanisms.
26. As an Issuer, I want evaluation to not participate in restore, so that restore remains scoped to paid license recovery.
27. As a maintainer, I want the evaluation business logic to live in its own service module, so that its behavior can be unit-tested in isolation from trial and activation.
28. As a maintainer, I want the evaluation request schema to be validated like other client schemas, so that malformed input is rejected before any database access.
29. As an integrator, I want `docs/api.md` and the client-integration guides to document the evaluation endpoint, so that client teams can implement the evaluation flow correctly.
30. As an integrator, I want the docs to clearly distinguish Evaluation from Promotional Trial, so that I do not confuse the two mechanisms.

## Implementation Decisions

### New client endpoint

- Add `POST /api/client/evaluate` to the client route module.
- Request body: `{ product_code, machine_hash, client_version?, platform? }` — same optional device metadata as `/trial`, no Activation Code required.
- Success response: `200` with the existing `SignedLicenseResponse` shape (`license`, `signature`, `token`) — identical to activate and trial responses, so clients reuse storage and verification unchanged.
- Token payload carries `kind: "evaluation"` (new variant of `OfflineLicenseKind`), `license_id: null`, `max_devices: 1`.

### Evaluation service (deep module)

- Evaluation business logic lives in its own service module (`evaluation`), separate from the trial and activation services, with a single entry point `issueEvaluation(env, body)`.
- The module encapsulates: schema parse → product lookup → evaluation-config validation → expiry check (existing record or new) → audit log → signed-license issuance. Its interface is one function in, one `SignedLicenseResponse` (or `ApiError`) out — testable in isolation.
- Evaluation reuses the existing signed-license issuance path; it does not introduce a second token format.

### Anchored expiry (Activation-Relative Validity pattern)

- Expiry is calculated as `first_issued_at + evaluation_token_ttl_days * 86400 * 1000` (convert days to milliseconds).
- On first call for a `(product_id, machine_hash)` pair: create a new `evaluation_activations` row with `first_issued_at = now` and `expires_at = first_issued_at + ttl_days`.
- On subsequent calls while the evaluation is still valid (now < expires_at): sign a new token with `expires_at` anchored to the stored value. `issued_at` is fresh (current time), `expires_at` is unchanged.
- On calls after expiry (now >= expires_at): reject with `EVALUATION_EXPIRED`.
- This mirrors how Activation-Relative Validity anchors `expires_at` to `activated_at + validity_duration_seconds` — same pattern, different anchor field.

### Schema and table changes

- New D1 migration:
  - Add `evaluation_enabled INTEGER NOT NULL DEFAULT 0` to `products`.
  - Add `evaluation_token_ttl_days INTEGER` to `products`.
  - Create `evaluation_activations` table:
    - `id TEXT PRIMARY KEY`
    - `issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE`
    - `product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE`
    - `machine_hash TEXT NOT NULL`
    - `first_issued_at TEXT NOT NULL`
    - `expires_at TEXT NOT NULL`
    - `UNIQUE (product_id, machine_hash)`
  - Indexes: `idx_evaluation_activations_issuer_id`, `idx_evaluation_activations_product_id`.
- Add `EvaluationActivationRow` to the models module.
- Add evaluation query functions (findByProductAndMachine, create) to a new evaluation queries module.

### Product configuration schema

- Add `evaluation_enabled` (boolean, optional) and `evaluation_token_ttl_days` (positive integer, optional, nullable) to both `createProductSchema` and `updateProductSchema` in the shared schemas module.
- `evaluation_token_ttl_days` is a positive integer with no upper or lower bounds beyond `z.number().int().min(1)`.
- No mutual-exclusivity constraint with the existing trial fields — a product can have both Promotional Trial and Evaluation configured simultaneously.

### Evaluation configuration validation

- A helper function (analogous to `ensureTrialIsActive` in the trial service) checks:
  1. `evaluation_enabled === 1` → else `EVALUATION_INACTIVE`
  2. `evaluation_token_ttl_days !== null` → else `EVALUATION_INACTIVE`
- Product `status` is **not** checked — evaluation only cares about its own enabled flag.

### Error contract

- Add two new codes to `ClientActivationError`:
  - `EVALUATION_INACTIVE` (`403`) — evaluation is not enabled or not configured for this product.
  - `EVALUATION_EXPIRED` (`403`) — this device has already used its evaluation and the token has expired.
- `PRODUCT_NOT_FOUND` (`404`) when the `product_code` does not resolve to a product.
- `BAD_REQUEST` (`400`) on schema validation failure.
- Existing client error codes keep their meaning.

### OfflineLicenseKind extension

- Extend `OfflineLicenseKind` from `"license" | "trial"` to `"license" | "trial" | "evaluation"`.
- The `kind` field in the token payload tells the client whether a token is paid, promotional, or evaluation.

### Audit logging

- Successful issuance (new or re-sign): action `client.evaluate`, `actorType: "client"`, target type `product`, details including `machine_hash`, `first_issued: true/false`, `expires_at`, `platform`.
- Rejected after expiry: action `client.evaluate_expired`, `actorType: "client"`, target type `product`, details including `machine_hash`, `expired_at` (the stored `expires_at`), `platform`.

### Dashboard

- Add `evaluation_count` to the dashboard stats response — total count of `evaluation_activations` rows for the Issuer, or per-product if the dashboard is extended to per-product stats.
- Add a `getEvaluationCount` query to the dashboard queries module.

### Integration config

- Add `evaluation_enabled: boolean` to `ClientIntegrationConfig` so that client integrators know at integration time whether a product offers evaluation.

### Independence from other mechanisms

- Evaluation does not check `activations` — a device with a paid license is not rejected from evaluation.
- Evaluation does not check `trial_activations` — a device with a promotional trial token is not rejected from evaluation.
- Restore does not check `evaluation_activations` — evaluation tokens are not restorable.
- Evaluation is not added to the Compatibility API.

## Testing Decisions

A good test asserts **external behavior** — the response, the error code, the audit record, the anchored expiry value — not the internal call sequence. Tests drive the service through its public entry point with an in-memory fake D1, the same approach already used for the activation and trial services.

Modules under test:

1. **Evaluation service** — the primary suite. Cases: issues a signed token for a first-time device; token carries `kind: "evaluation"` and `license_id: null`; anchored expiry — second call within window returns a token with the same `expires_at` but a fresh `issued_at`; rejects `EVALUATION_EXPIRED` when now >= stored `expires_at`; rejects `EVALUATION_INACTIVE` when `evaluation_enabled` is off; rejects `EVALUATION_INACTIVE` when `evaluation_token_ttl_days` is null; rejects `PRODUCT_NOT_FOUND` for an unknown product code; does not check product `status`; creates an `evaluation_activations` row on first call; does not create a second row on subsequent calls; writes `client.evaluate` audit log on issuance; writes `client.evaluate_expired` audit log on expiry rejection. Prior art: `worker/test/trial.test.ts`, `worker/test/activation.test.ts`.
2. **Evaluation queries** — `findByProductAndMachine` returns a row for an existing evaluation, returns null for a new device; `create` inserts a row with the correct fields. Exercised through the fake-D1 statement layer.
3. **Product schema** — verifies `evaluation_enabled` and `evaluation_token_ttl_days` are accepted in create and update schemas; verifies `evaluation_token_ttl_days` rejects 0, negative numbers, and non-integers.
4. **Dashboard** — verifies `evaluation_count` is included in the stats response and reflects the correct count.

## Out of Scope

- **Evaluation management Admin API** (list, reset, export evaluation records). V1 only adds product-level configuration and dashboard count. Management endpoints can be added later if customer-support needs arise.
- **Rate limiting on the evaluate endpoint.** Same rationale as the existing trial endpoint — if token harvesting becomes a problem, add per-machine_hash rate limiting later.
- **Evaluation restore.** Evaluation tokens are not restorable. A device that loses its evaluation token after app data is cleared loses the remainder of the evaluation window. This is acceptable for a free, one-shot assessment.
- **Trial-to-paid or evaluation-to-paid conversion path.** Evaluation and paid activation are fully independent; there is no linkage or discount mechanism.
- **Instant offline invalidation of evaluation tokens.** Disabling evaluation on a product only stops new issuance; existing tokens remain valid until their anchored expiry, consistent with the offline-invalidation model.
- **Multi-issuer evaluation behavior.** Evaluation respects existing `issuer_id` boundaries through the product lookup but adds no new multi-issuer surface.
- **Promotional Trial changes.** The existing trial mechanism, table, endpoint, and behavior are untouched.

## Further Notes

**Why days, not seconds.** Evaluation durations are human-facing ("try for 7 days"). Using days as the unit avoids Admin errors from typing `604800` instead of `7`, and matches the granularity of the use case. Seconds remain the internal representation for expiry calculation.

**No JWS storage required.** Because each call signs a new token (with fresh `issued_at`) but an anchored `expires_at`, the server does not need to store or replay the original JWS. The `evaluation_activations` row stores only `first_issued_at` and `expires_at` — the token is re-derived on every call. This keeps the storage model consistent with how paid activation and trial issuance work.

**Product status is not checked.** This is a deliberate departure from how paid activation and restore behave. The rationale: evaluation is controlled solely by `evaluation_enabled`. If an Admin archives a product, they may still want existing evaluations to run their course. If they want to stop evaluation, they disable it explicitly. The two controls are independent.

**Terminology.** The existing term "Trial" in this codebase now refers specifically to **Promotional Trial** — a time-windowed, all-devices offer. **Evaluation** is the new term for the per-device, one-shot assessment. The CONTEXT.md glossary has been updated to reflect this distinction. Client-facing error codes use the `EVALUATION_` prefix to avoid ambiguity with `TRIAL_INACTIVE`.
