# D1 session table over JWT for admin sessions

The reference project (LicenseGate) uses short-lived JWT access tokens with a
longer-lived JWT refresh token, storing a `refreshSession` string in the user
row to allow server-side invalidation. This is a hybrid: it avoids a session
table but still requires a DB lookup on refresh.

We chose a plain D1 `admin_sessions` table with a random opaque token in an
HttpOnly cookie instead. The token is the primary key; the row stores
`admin_id`, `expires_at`, and `created_at`.

Reasons:

- Simpler: no signing, no refresh rotation, no secret management for JWT.
  Generate a random token, INSERT, done.
- Full server-side control: password change or explicit logout deletes rows
  immediately; no window where an already-issued JWT remains valid.
- D1 latency is negligible for admin UI traffic volumes.
- The project already manages a signing key for license JWS tokens. Reusing
  it for session JWT would be a category error; a separate secret adds
  operational burden for no benefit over a session table.

Trade-off: every authenticated request hits D1. For an admin panel with single-
digit concurrent users this is irrelevant. If it ever matters, add an in-memory
LRU cache with a short TTL in front of the lookup.
