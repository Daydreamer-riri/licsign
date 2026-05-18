# Future Multi-Issuer Support

The V1 database already separates data by `issuer_id`.

To move beyond the default single issuer:

1. Add issuer creation and management APIs.
2. Add per-issuer admin keys or admin accounts.
3. Decide whether client activation includes an issuer hint or keeps relying on global
   activation code uniqueness.
4. Decide whether signing keys are global or per issuer.
5. Add issuer-aware dashboards and exports.

The current compatibility endpoint already uses `issuers.public_user_id` as its
`:userId` value.
