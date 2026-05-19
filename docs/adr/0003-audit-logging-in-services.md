# Audit logging stays inside service functions

Audit writes (`writeAuditLog`) are called inside the same service function that
performs the business operation (activation, batch creation, license revocation,
etc.). They are **not** extracted to route handlers, middleware, or after-hooks.

## Context

Every mutating service already calls `writeAuditLog(db, ...)` as its last step.
An architecture review suggested extracting audit to the route layer so services
become pure functions, improving testability (no need to mock audit) and allowing
callers to batch, defer, or skip audit writes.

## Decision

Keep audit writes inside service functions. The audit record is part of the
business transaction: if activation succeeds but the audit log is not written,
the operation is incomplete. Splitting the two introduces a failure mode where
business state changes without an audit trail.

## Consequences

- Services are not pure functions — they produce an audit side effect.
- Tests for services that mutate state must account for the `writeAuditLog` call
  (either by providing a real or faked `D1Database`, or by mocking the audit
  module via `vi.mock`).
- Future changes to audit (e.g., async writes via `waitUntil`) should be
  implemented inside `writeAuditLog` itself, not by moving the call site.