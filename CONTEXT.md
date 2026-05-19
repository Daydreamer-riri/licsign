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
A credential used by automation to access Admin API endpoints for one Issuer.
_Avoid_: Admin password, session token

**Activation Code**:
A user-facing code that can be exchanged online for a signed offline license.
_Avoid_: License key, token

**Offline License**:
A signed artifact stored by the client and verified locally after activation.
_Avoid_: Activation code

## Relationships

- An **Issuer** has one or more **Admins**.
- An **Issuer** has zero or more **API Keys**.
- An **Admin** belongs to exactly one **Issuer**.
- An **API Key** belongs to exactly one **Issuer**.
- An **Activation Code** can produce an **Offline License** during client activation.

## Example dialogue

> **Dev:** "Should an **Admin** be able to rotate an **API Key** for their **Issuer**?"
> **Domain expert:** "Yes, but the **API Key** is still an automation credential, not the **Admin**'s login credential."

## Flagged ambiguities

- "Admin authentication" can mean **Admin** email/password sessions or **API Key** automation credentials — resolved: these are distinct credentials for the same Admin API surface.
