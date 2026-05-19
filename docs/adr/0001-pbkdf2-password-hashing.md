# PBKDF2 for admin password hashing

Workers have no native bindings for Argon2 or bcrypt. The project constraint
("do not introduce Node-only crypto libraries") rules out npm packages that
rely on native add-ons or WASM blobs large enough to matter in a Worker bundle.

`crypto.subtle.deriveBits` with PBKDF2-SHA256 is available in every Workers
runtime at zero dependency cost. We use 600,000 iterations (OWASP 2023
recommendation) with a 16-byte random salt. This is weaker than Argon2id in
absolute terms, but adequate for an admin-only surface with no public
registration, and it keeps the Worker dependency-free.

If Cloudflare later ships Argon2 in `crypto.subtle`, migrate by
re-hashing on next successful login.
