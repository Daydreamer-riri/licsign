# Licsign

Licsign issues activation-code based offline licenses and provides administrative control over products, batches, licenses, and audit history.

## Language

**Issuer**:
A license-issuing tenant that owns products, activation codes, licenses, admins, and audit logs.
_Avoid_: Account, organization

**Admin**:
A person authorized to manage one Issuer through the Admin UI.
_Avoid_: API key, operator

**API Key**:
A credential used by automation to access Admin API endpoints for one Issuer; it remains distinct from any Admin even when an Admin created or owns it.
_Avoid_: Admin password, session token

**Actor**:
A person, automation credential, client, or system that performs an auditable action.
_Avoid_: User, caller

**Activation Code**:
A user-facing code that can be exchanged online for a signed offline license.
_Avoid_: License key, token

**Offline License**:
A signed artifact the client stores and verifies locally; it is either a paid
license redeemed from an Activation Code, or a trial issued directly by the trial
endpoint without one.
_Avoid_: Activation code

**Absolute Expiry**:
A license expiration model where the cutoff is a fixed wall-clock timestamp
chosen when the batch is created (e.g. "expires 2026-12-31"). The cutoff is
independent of when the **Activation Code** is redeemed.
_Avoid_: Hard expiry, deadline

**Activation-Relative Validity**:
A license expiration model where the license is valid for a fixed Duration that
begins at first activation (e.g. "valid for 365 days from activation"). The
absolute cutoff only exists after the **Activation Code** is redeemed.
A license uses either **Absolute Expiry** or **Activation-Relative Validity**,
never both.
Distinct from trial token TTL: trial TTL is per-token and per-device under a
Product, and is re-issued on every trial call; **Activation-Relative Validity**
is per-License, anchored to the License's first activation, and never re-anchors.
_Avoid_: TTL (reserved for trial tokens), subscription

## Relationships

- An **Issuer** has one or more **Admins**.
- An **Issuer** has zero or more **API Keys**.
- An **Admin** belongs to exactly one **Issuer**.
- An **API Key** belongs to exactly one **Issuer**.
- An **API Key** may be created or owned by an **Admin**, but it is still a distinct **Actor**.
- An **Activation Code** can produce a paid **Offline License** during client
  activation; the trial endpoint produces a trial **Offline License** without an
  **Activation Code**.

## Example dialogue

> **Dev:** "Should an **Admin** be able to rotate an **API Key** for their **Issuer**?"
> **Domain expert:** "Yes, but the **API Key** is still an automation credential, not the **Admin**'s login credential."

## Flagged ambiguities

- "Admin authentication" can mean **Admin** email/password sessions or **API Key** automation credentials — resolved: these are distinct credentials for the same Admin API surface.
- "API Key belongs to an Admin" can mean ownership metadata or actor identity — resolved: ownership metadata is optional; audit identity records the actual **Actor**.
