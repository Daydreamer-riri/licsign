# Client Integration Guide

This document specifies how a client integrates with Licsign to obtain and verify
offline licenses. It is the **platform-agnostic contract**: HTTP request/response
shapes, the signed-token format, the local verification algorithm, and the client
lifecycle. It is written to be implemented directly by an engineer or a coding
agent on any platform.

For a concrete, copy-pasteable implementation, see the
[Kotlin / Android reference](./client-integration-kotlin.md). Other platform
references will be added beside it.

---

## 1. Mental model

Licsign is an **offline-license** service. Read these four points before writing
any code — they explain why the flow looks the way it does.

1. The user receives an **Activation Code** (e.g. `TV-PSWD-VE8V-MXWY-Q7V9`).
2. The client calls `POST /api/client/activate` **once** to exchange that code.
3. The server returns a **signed Offline License** — an ES256 compact JWS.
4. From then on the client **verifies that token locally on every launch**. No
   network call is required to run.

> The Activation Code is *not* the license. It is a one-time bearer credential
> that is exchanged for a license. The signed token is the license. Do not build
> the client around re-sending the code each launch — build it around verifying
> the stored token.

There is also a **trial** path (`POST /api/client/trial`) that issues a
short-lived Offline License **without** an Activation Code, when the product has
an open trial window.

### Terminology

This guide uses the project's canonical vocabulary from
[`CONTEXT.md`](../CONTEXT.md):

- **Activation Code** — a user-facing code exchanged online for an Offline License.
- **Offline License** — the signed artifact the client stores and verifies locally.
  It carries a `kind`: a paid license, or a `trial`.
- **Product** — what the license grants access to, identified by a `product_code`.
- **Issuer** — the license-issuing tenant; its identifier appears in every token
  as the `issuer` field.

---

## 2. Prerequisites

Before writing the client, obtain the following from the Licsign operator. None
of these can be discovered at runtime — they are integration-time inputs.

| Input | Description |
|---|---|
| **Base URL** | The deployment host, e.g. `https://licsign.example.com`. All paths below are relative to it. |
| **`product_code`** | The product this client activates against, e.g. `flow`. A short slug matching `^[A-Za-z0-9][A-Za-z0-9_-]*$`. |
| **Verification public key(s)** | One ES256 (P-256) public key **per signing key id (`kid`)**. You need the current key and every older key whose tokens must still verify. See §3.3. |
| **Expected `issuer`** | The exact string the client must find in every token's `issuer` field. |
| **Trial availability** | Whether the product has a trial window, so you know whether to implement the trial path. |

The client endpoints (`/api/client/*`) are **unauthenticated** — the Activation
Code itself is the credential. Do not send an `Authorization` header.

---

## 3. The Offline License token

### 3.1 Format

The token is a **compact JWS** — three base64url segments joined by dots:

```
base64url(header) . base64url(payload) . base64url(signature)
```

- **Algorithm**: `ES256` — ECDSA on curve P-256 with SHA-256.
- **Signature encoding**: the third segment is the **raw `r || s` signature**,
  64 bytes, base64url-encoded (no padding). It is *not* DER-encoded. Some
  platform crypto APIs require DER; convert before verifying (see §6).

base64url throughout means: standard base64 with `+`→`-`, `/`→`_`, and **no `=`
padding**. Decoders must tolerate missing padding.

### 3.2 Header

```json
{ "alg": "ES256", "typ": "JWT", "kid": "kid_xxx" }
```

`kid` identifies which signing key produced the token. The client uses it to pick
the correct public key (§3.3). `typ` is `"JWT"`, but **the payload is not a
standard JWT claims set** — there are no `exp`/`iat`/`nbf` numeric claims. Do not
feed this token to a generic JWT library that expects RFC 7519 claims; it will
mishandle the timestamps. Parse the fields below explicitly.

### 3.3 Payload

```json
{
  "version": 1,
  "kind": "trial",
  "license_id": "lic_xxx",
  "product_code": "flow",
  "machine_hash": "e3b0c442...b7852b855",
  "features": [],
  "issued_at": "2026-05-20T00:00:00.000Z",
  "expires_at": "2026-06-20T00:00:00.000Z",
  "max_devices": 1,
  "issuer": "licsign",
  "key_id": "kid_xxx"
}
```

| Field | Type | Notes |
|---|---|---|
| `version` | `1` | Token schema version. Reject anything you do not understand. |
| `kind` | `"trial"` or **absent** | Absent (or `"license"`) means a paid license. `"trial"` means a trial token. |
| `license_id` | `string` \| `null` | The backing license id for paid tokens. **`null` for trial tokens.** |
| `product_code` | `string` | Must equal the client's expected `product_code`. |
| `machine_hash` | `string` | The device this token is bound to. Must equal the client's own `machine_hash`. |
| `features` | `string[]` | Reserved for future feature flags. Currently always `[]`. |
| `issued_at` | ISO 8601 UTC | When the token was signed. |
| `expires_at` | ISO 8601 UTC \| `null` | Expiry. **`null` means the token never expires offline.** Paid tokens inherit the license's expiry, which is often `null`. Trial tokens always have a concrete expiry. |
| `max_devices` | `number` | Seat count of the underlying license/batch. Informational for the client. |
| `issuer` | `string` | Must equal the expected `issuer` from §2. |
| `key_id` | `string` | The signing key id. Mirrors the header `kid`. |

### 3.4 Key id and rotation

The signing key can rotate. When it does, a new `kid` is introduced; previously
issued tokens keep their old `kid` and must still verify. Therefore:

- Ship the client with a **map of `kid` → public key**, not a single key.
- At verification time, select the public key by the token header's `kid`.
- Reject a token whose `kid` is not in the map.
- Keep an old key in the client until every token signed with it has expired or
  is no longer supported.

> **Known gap.** Licsign currently has **no JWKS / `.well-known` endpoint**. The
> public key(s) are handed off out-of-band by the operator and embedded in the
> client at build time. If a remote-key-fetch endpoint is added later, this
> section will be revised to describe polling it. Until then, treat the embedded
> `kid` map as the source of truth and plan a client update for any key rotation.

---

## 4. `machine_hash`

Every client request and every token is bound to a `machine_hash`.

**Contract:** `machine_hash` is a **lowercase SHA-256 hex digest** — exactly 64
characters matching `^[a-f0-9]{64}$`. The server lowercases it on input.

**Rules:**

- Derive it on the client from a stable, app-scoped device identifier.
- **Never send raw hardware identifiers.** Send only the hash.
- It must be **stable** — the same device must produce the same hash across app
  updates, restarts, and (where possible) account changes. An unstable hash
  burns a device seat on every launch and quickly hits `DEVICE_LIMIT_REACHED`.

The exact identifier to hash is platform-specific; the platform reference docs
give a concrete recipe. The service only sees and cares about the 64-hex digest.

---

## 5. HTTP API

All endpoints accept and return `application/json`. All paths are relative to the
base URL.

### 5.1 Error envelope

Any non-2xx response has this body:

```json
{ "error": "INVALID_CODE", "message": "Activation code was not found", "details": {} }
```

Branch on the stable `error` **string**, never on `message` (human-facing, may
change) and not solely on the HTTP status. `details` is present for
`BAD_REQUEST` and carries field-level validation output.

### 5.2 `POST /api/client/activate`

Exchanges an Activation Code for a paid Offline License. Call this **once** per
device, then again only to renew an expired token or re-validate (§8).

**Request:**

```json
{
  "product_code": "flow",
  "activation_code": "TV-PSWD-VE8V-MXWY-Q7V9",
  "machine_hash": "e3b0c442...b7852b855",
  "device_label": "Living Room TV",
  "client_version": "1.0.0",
  "platform": "android-tv"
}
```

`product_code`, `activation_code`, `machine_hash` are required. `device_label`,
`client_version`, `platform` are optional metadata (max 160/80/80 chars) shown to
admins — send them if you can; they do not affect issuance.

**Response `200`:**

```json
{
  "license": { "...": "the decoded payload from §3.3" },
  "signature": "base64url-raw-signature",
  "token": "compact-jws-string"
}
```

Store **`token`**. `license` and `signature` are conveniences: `license` is the
decoded payload, `signature` is the token's third segment. **Never trust
`license` without verifying `token`** — only the signed token is authoritative.

**Idempotency / seats:** each distinct `machine_hash` consumes one seat against
the license's `max_devices`.

- Re-calling `activate` for a `machine_hash` that is **already active** on this
  license does **not** consume another seat — it refreshes `last_seen` and
  re-issues a fresh equivalent token.
- A `machine_hash` previously deactivated (§5.4) is re-activated, consuming a
  seat again if one is free.
- A brand-new `machine_hash` consumes a seat; if none are free you get
  `DEVICE_LIMIT_REACHED`.

**Errors:**

| `error` | HTTP | Meaning | Client action |
|---|---|---|---|
| `INVALID_CODE` | 404 | Activation code not found. | Ask the user to re-check the code. |
| `PRODUCT_MISMATCH` | 409 | Code belongs to a different product, or the product is not active. | Configuration/code error — surface it; do not retry. |
| `LICENSE_DISABLED` | 403 | License is administratively disabled. | Treat as unlicensed; tell the user to contact support. |
| `LICENSE_REVOKED` | 403 | License is revoked. | Treat as unlicensed; do not retry. |
| `LICENSE_EXPIRED` | 403 | The underlying license has passed its expiry. | Treat as unlicensed; prompt for a new code. |
| `DEVICE_LIMIT_REACHED` | 409 | All seats are in use by other devices. | Prompt the user to deactivate another device. |
| `BAD_REQUEST` | 400 | Request shape invalid. See `details`. | Fix the request; this is an integration bug. |
| `SERVER_ERROR` | 500 | Server fault. | Transient — retry with backoff; keep any cached token. |

### 5.3 `POST /api/client/trial`

Issues a trial Offline License **without an Activation Code**, when the product
has an open trial window.

**Request:**

```json
{
  "product_code": "flow",
  "machine_hash": "e3b0c442...b7852b855",
  "device_label": "Living Room TV",
  "client_version": "1.0.0",
  "platform": "android-tv"
}
```

`product_code` and `machine_hash` are required; the rest is optional metadata.

**Response `200`:** identical shape to `activate`. The token's payload differs:
`kind` is `"trial"`, `license_id` is `null`, and `expires_at` is
`now + product trial token TTL` (a short, server-configured window).

**Idempotency:** the trial endpoint is idempotent per `machine_hash`. Repeated
calls re-issue a fresh token and update `last_seen` without consuming any quota.
Different `machine_hash` values each get their own independent trial. This means
the correct way to "renew" a trial is simply to call this endpoint again before
the current token expires.

**Errors:**

| `error` | HTTP | Meaning | Client action |
|---|---|---|---|
| `PRODUCT_NOT_FOUND` | 404 | No active product with that `product_code`. | Configuration error — surface it. |
| `TRIAL_INACTIVE` | 403 | Trial disabled, misconfigured, or the current time is outside the trial window. | The trial path is unavailable; fall back to entering an Activation Code. |
| `BAD_REQUEST` | 400 | Request shape invalid. | Fix the request. |
| `SERVER_ERROR` | 500 | Server fault. | Transient — retry with backoff. |

When the trial window closes, tokens already issued **stay valid offline until
their own `expires_at`**, but the endpoint stops issuing new ones — a renewal
attempt then returns `TRIAL_INACTIVE`.

### 5.4 `POST /api/client/deactivate`

Releases this device's seat so it can be reused by another device.

**Request:**

```json
{
  "product_code": "flow",
  "activation_code": "TV-PSWD-VE8V-MXWY-Q7V9",
  "machine_hash": "e3b0c442...b7852b855"
}
```

**Response `200`:** `{ "ok": true }`. The call is idempotent — it succeeds even
if the device was not currently active.

**Errors:** `INVALID_CODE` (404), `PRODUCT_MISMATCH` (409), `BAD_REQUEST` (400),
`SERVER_ERROR` (500).

> Deactivation is an **online** action and only affects future online
> activations. It does **not** invalidate a token already stored on the device —
> see §8. Deactivate is for "I am moving my license to a different TV", not for
> "revoke this immediately".

---

## 6. Local verification algorithm

Run this on **every launch**, against the stored `token`. It is purely offline.
Storage is user-editable — a token that does not pass every step must be
discarded.

1. **Split** the token on `.` into exactly three segments:
   `headerSeg`, `payloadSeg`, `signatureSeg`. Any other count → invalid.
2. **Decode and parse** `headerSeg`. Require `alg == "ES256"`. Require `kid` to
   be present in your embedded `kid` → public-key map; pick that key.
3. **Decode and parse** `payloadSeg`. Require `version == 1`.
4. **Reconstruct the signing input** as the exact ASCII bytes
   `headerSeg + "." + payloadSeg`. Use the **original segments from the token**,
   never a re-serialized header/payload — JSON key order and whitespace would
   differ and break the signature.
5. **Decode the signature**: base64url-decode `signatureSeg` to 64 raw bytes
   = `r (32) || s (32)`. If your crypto API needs DER (most native ones do),
   convert raw `r || s` to a DER `SEQUENCE { INTEGER r, INTEGER s }` first.
6. **Verify** the signature over the signing input with the selected public key,
   `ECDSA / SHA-256`. Failure → invalid.
7. **Check the claims:**
   - `product_code` equals the client's expected product.
   - `machine_hash` equals the client's own `machine_hash` for this device.
   - `issuer` equals the expected `issuer` from §2.
   - `key_id` equals the header `kid` (consistency check).
   - If `expires_at` is non-null, it is **in the future**. If `null`, the token
     does not expire.
8. If and only if all steps pass, the token is a valid license. Use `kind` to
   distinguish a paid license from a `trial`.

Allow a small clock-skew tolerance (e.g. a few minutes) on the `expires_at`
check if the device clock is untrusted.

---

## 7. Client lifecycle

The recommended client is a small state machine. The **primary path is fully
offline** — §8 covers optional online re-validation.

```
                         ┌─────────────────────┐
            launch ─────▶ │  load stored token  │
                         └──────────┬──────────┘
                          token?    │
                  ┌── no ───────────┴──────── yes ──┐
                  ▼                                 ▼
            ┌───────────┐                  ┌──────────────────┐
            │  ACQUIRE  │                  │ verify offline   │
            └─────┬─────┘                  │ (§6)             │
                  │                        └────────┬─────────┘
                  │              invalid sig / kid / │
                  │              machine / product   │ valid
                  │◀───────────  / version ──────────┤
                  │              (discard token)     │
                  │                                  │
                  │              expires_at passed   │
                  │◀──── paid ───────────────────────┤
                  │                                  │ trial
                  │                          ┌───────▼────────┐
                  │                          │  TRIAL-RENEW   │
                  │                          │  call /trial   │
                  │                          └───────┬────────┘
                  │                       success │   │ TRIAL_INACTIVE
                  │◀──────────────────────────────┼───┘
                  │                                ▼
                  │                          ┌──────────┐
                  └─────────────────────────▶│ LICENSED │
                                             │ run app  │
                                             └──────────┘
```

**On launch:**

1. **No stored token** → go to *ACQUIRE*.
2. **Token present** → run offline verification (§6).
   - **Fails structural/identity checks** (bad signature, untrusted `kid`,
     `machine_hash` mismatch, wrong `product_code`, unknown `version`) → the
     token is foreign or tampered. Discard it and go to *ACQUIRE*.
   - **`expires_at` has passed:**
     - `kind == "trial"` → go to *TRIAL-RENEW*.
     - paid → go to *ACQUIRE* (renewal). If you persisted the Activation Code
       (recommended, see below), retry `activate` directly instead of
       re-prompting.
   - **All checks pass** → *LICENSED*, run the app.

**ACQUIRE** (no valid token):

- If the product has a trial and the user has not consumed it, you may call
  `/api/client/trial` first for a no-code trial. On `TRIAL_INACTIVE` or
  `PRODUCT_NOT_FOUND`, fall through to code entry.
- Prompt the user for an Activation Code → call `/api/client/activate`.
- On `200`: store the `token`, go to *LICENSED*.
- On error: show a message driven by the §5.2 error table.

**TRIAL-RENEW** (expired trial token):

- Call `/api/client/trial` again with the same `product_code` + `machine_hash`.
- `200` → store the fresh token, go to *LICENSED*.
- `TRIAL_INACTIVE` → the trial window has closed; route the user to *ACQUIRE*
  to enter a paid Activation Code.

**Persist the Activation Code.** After a successful paid activation, store the
`product_code` + `activation_code` alongside the token. The code is a bearer
credential, not the license, so storing it is fine — and it lets the client
renew an expired token, re-activate after a reinstall on the same device, or
run the optional re-validation in §8 without re-prompting the user.

**Offline at launch.** If verification fails *only* because the token expired and
the device has no network, the client cannot renew. Show a "license expired,
connect to the internet" state rather than silently locking the user out.

---

## 8. Revocation and optional re-validation

**Default: pure offline.** Once issued, a token verifies entirely offline for as
long as its `expires_at` allows (and paid tokens often have `expires_at: null`,
i.e. forever). A consequence: **`disable` / `revoke` performed by an admin do not
reach a device that has already activated.** They only block *future* online
`activate` calls. This is the intended V1 behavior — do not design the client
assuming instant remote kill.

**Optional: periodic online re-validation.** If your product needs revocation to
eventually take effect, the client may re-validate on a schedule **it chooses**
(e.g. every N days). There is no dedicated refresh endpoint — re-validation
reuses `activate`, which re-checks license status before re-issuing:

1. Track a "last re-validated" timestamp. When the chosen interval has elapsed,
   the device is online, and you have the stored Activation Code:
2. Call `POST /api/client/activate` again with the same
   `product_code` + `activation_code` + `machine_hash`.
3. Handle the result:
   - **`200`** → replace the stored token with the fresh one; update the
     timestamp. (No extra seat is consumed for an already-active device.)
   - **`LICENSE_REVOKED` / `LICENSE_DISABLED` / `LICENSE_EXPIRED`** → the license
     is no longer valid. Discard the token and enter the unlicensed state.
   - **Network error, timeout, or `SERVER_ERROR` (5xx)** → inconclusive. **Keep
     the cached token**, do not change state, retry at the next interval.
   - **`DEVICE_LIMIT_REACHED`** → should not occur for an already-active device;
     treat as inconclusive and keep the cached token.

Re-validation is best-effort: a definitive rejection downgrades the device; an
inconclusive result never does. For trial tokens, "re-validation" is simply the
normal renewal call to `/api/client/trial`.

---

## 9. Trial-to-paid transition

A trial token and a paid license are independent. When a trial user buys a code:

1. Call `POST /api/client/activate` with the new Activation Code.
2. On `200`, **replace** the stored trial token with the paid token and persist
   the Activation Code.
3. The next launch verifies the paid token; `kind` is now absent, so trial UI
   (e.g. an "expires in N days" badge or purchase prompt) is dropped.

You do not need to deactivate the trial — trial activations carry no seat quota.

---

## 10. Integration checklist

- [ ] Base URL, `product_code`, and expected `issuer` are configured.
- [ ] Embedded `kid` → public-key map contains every currently-valid signing key.
- [ ] `machine_hash` derivation is stable across updates and restarts.
- [ ] `activate` / `trial` / `deactivate` requests match §5; `Content-Type` is
      `application/json`; no `Authorization` header is sent.
- [ ] Errors are branched on the `error` string, not `message`.
- [ ] Offline verification implements every step in §6, verifying over the raw
      token segments and converting the signature encoding if needed.
- [ ] The launch state machine (§7) is implemented, including the
      tampered-token-discard and offline-at-launch paths.
- [ ] The Activation Code is persisted for renewal/re-validation.
- [ ] The private signing key is **never** shipped in the client.

---

## Appendix A — LicenseGate compatibility endpoint

For callers **migrating from a LicenseGate-style integration**, an online
status-check endpoint exists:

```
GET  /license/:userId/:licenseKey/verify
POST /license/:userId/:licenseKey/verify
```

`:userId` maps to the issuer's `public_user_id`; `:licenseKey` maps to an
`activation_code`. It returns `{ "valid": boolean, "result": "...", "signedChallenge"? }`
where `result` is one of `VALID`, `NOT_FOUND`, `NOT_ACTIVE`, `EXPIRED`, etc.

This is a **transitional, online-only** surface. **New clients should not use it**
— it does not produce an offline-verifiable token and requires a network call on
every check. Build new integrations on `/api/client/activate` and local
verification as described above.

## Appendix B — Error code index

| `error` | Endpoints |
|---|---|
| `INVALID_CODE` | `activate`, `deactivate` |
| `PRODUCT_MISMATCH` | `activate`, `deactivate` |
| `PRODUCT_NOT_FOUND` | `trial` |
| `LICENSE_DISABLED` | `activate` |
| `LICENSE_REVOKED` | `activate` |
| `LICENSE_EXPIRED` | `activate` |
| `DEVICE_LIMIT_REACHED` | `activate` |
| `TRIAL_INACTIVE` | `trial` |
| `BAD_REQUEST` | all |
| `SERVER_ERROR` | all |
