# licsign

Cloudflare-native license service for activation-code based offline licenses.

The V1 service is API-only:

- Cloudflare Worker runtime
- D1 as the system of record
- Admin APIs protected by D1-backed API keys
- Product and batch activation-code management
- One-time client activation
- Signed offline license tokens for Android TV clients
- LicenseGate-style online verify compatibility endpoint

## Quick Start

Use Node 22 or newer. This repository includes `.node-version` for `fnm`, `nvm`,
or similar tools.

```sh
fnm use
pnpm install
pnpm db:migrate:local
pnpm bootstrap -- --api-key=replace-with-a-long-random-admin-key
```

Apply the SQL printed by `bootstrap` with `wrangler d1 execute`, then set the printed
`SIGNING_KEY_ID` and `SIGNING_PRIVATE_JWK` as Worker secrets before deployment.

```sh
wrangler secret put SIGNING_KEY_ID --config worker/wrangler.toml
wrangler secret put SIGNING_PRIVATE_JWK --config worker/wrangler.toml
pnpm dev
```

See `docs/` for the architecture, API, Android TV verification notes, and key rotation.
