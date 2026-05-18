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

## Deploy to Cloudflare

### One-click deploy

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Daydreamer-riri/licsign)

The button above deploys this exact repository. If you have forked `licsign` and
want the button to deploy your fork, edit this README and replace
`Daydreamer-riri/licsign` in the link with your `<owner>/<repo>` path, commit and
push, then click the button on your fork.

When a user clicks the button, Cloudflare forks the repository to their account,
provisions a new D1 database, rewrites the `database_id` in `worker/wrangler.jsonc`
to the new database, commits that change to the fork, and runs `pnpm deploy`
(which applies migrations before deploying the Worker).

After the button finishes, clone the fork (so you pick up the rewritten
`database_id`) and complete the one-time bootstrap from that local checkout:

```sh
git clone https://github.com/<your-user>/licsign.git
cd licsign
pnpm install
pnpm setup:remote -- --api-key=replace-with-a-long-random-admin-key
```

If you already cloned the fork before clicking the button, run `git pull` first
so the new `database_id` is in your working tree before `pnpm setup:remote`.

`setup:remote` applies D1 migrations, then checks whether the issuer already
exists on the remote database. On first run it inserts the initial `issuers` and
`api_keys` rows; on every run it generates a fresh signing key pair and uploads
`SIGNING_KEY_ID` and `SIGNING_PRIVATE_JWK` as Worker secrets. It prints the
admin API key (first run only), the public user id, and the public JWK to embed
in the Android TV verifier.

Re-running `pnpm setup:remote` rotates the signing keys without touching the
existing issuer or admin API key. After a rotation, redistribute the new public
JWK to clients before previously signed licenses need to be re-verified — old
signatures will no longer verify against the new key.

### Manual deploy

Use Node 22 or newer. This repository includes `.node-version` for `fnm`, `nvm`,
or similar tools.

```sh
fnm use
pnpm install
```

Create a D1 database in your Cloudflare account and paste the returned id into
`worker/wrangler.jsonc`:

```sh
wrangler d1 create license_service
```

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "license_service",
    "database_id": "your-real-d1-database-id",
    "migrations_dir": "./migrations"
  }
]
```

Run the one-time setup (bootstrap + remote D1 seed + secret upload):

```sh
pnpm setup:remote -- --api-key=replace-with-a-long-random-admin-key
```

Deploy (`pnpm deploy` applies migrations then runs `wrangler deploy`):

```sh
pnpm deploy
```

### Verify configuration in Cloudflare dashboard

After `pnpm setup:remote` and `pnpm deploy`, open your Workers project in the
Cloudflare dashboard and confirm:

1. `Settings` > `Variables`:
   - `LICENSE_ISSUER`: public issuer name in signed licenses, default `licsign`.
   - `CORS_ORIGIN`: allowed browser origin, default `*`.
2. `Settings` > `Variables and Secrets`:
   - `SIGNING_KEY_ID`
   - `SIGNING_PRIVATE_JWK`

The admin API key is never stored as a variable. The raw key is only shown to the
operator at setup time; D1 stores its SHA-256 hash.

### Example requests

Create a product:

```sh
curl -X POST "https://your-worker.your-subdomain.workers.dev/api/admin/products" \
  -H "Authorization: Bearer replace-with-a-long-random-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"code":"android_tv","name":"Android TV App","default_max_devices":1}'
```

Generate activation codes:

```sh
curl -X POST "https://your-worker.your-subdomain.workers.dev/api/admin/batches" \
  -H "Authorization: Bearer replace-with-a-long-random-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"product_id":"prd_xxx","batch_name":"Initial batch","quantity":10,"code_prefix":"TV"}'
```

Activate from the client:

```sh
curl -X POST "https://your-worker.your-subdomain.workers.dev/api/client/activate" \
  -H "Content-Type: application/json" \
  -d '{"product_code":"android_tv","activation_code":"TV-XXXX-XXXX-XXXX-XXXX","machine_hash":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","platform":"android-tv"}'
```

LicenseGate-compatible verify:

```sh
curl "https://your-worker.your-subdomain.workers.dev/license/default/TV-XXXX-XXXX-XXXX-XXXX/verify"
```

The `default` path segment is the bootstrap `public_user_id`. If you pass
`--public-user-id=<value>` to `pnpm bootstrap` or `pnpm setup:remote`, use that
value instead.

## Local Quick Start

Use Node 22 or newer. This repository includes `.node-version` for `fnm`, `nvm`,
or similar tools.

```sh
fnm use
pnpm install
pnpm bootstrap -- --api-key=dev-admin-key
pnpm dev:setup
```

`pnpm dev:setup` reads `worker/bootstrap.local.json`, applies local D1 migrations,
seeds the local issuer/API key rows, and writes `worker/.dev.vars` for local signing
secrets.

```sh
pnpm dev
```

See `docs/` for the architecture, API, Android TV verification notes, and key rotation.
