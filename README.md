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

Click the button below to deploy this Worker to Cloudflare:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/your-org/licsign)

Note: replace `https://github.com/your-org/licsign` in the button link with your
actual Git repository URL. Edit `README.md`, update the link, push the repository,
then click the button to let Cloudflare clone and deploy the project.

### Manual deploy

Use Node 22 or newer. This repository includes `.node-version` for `fnm`, `nvm`,
or similar tools.

```sh
fnm use
pnpm install
```

Create a D1 database:

```sh
wrangler d1 create license_service
```

Copy the returned `database_id` into `worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "license_service"
database_id = "your-real-d1-database-id"
```

Apply D1 migrations:

```sh
pnpm db:migrate:remote
```

Bootstrap the first issuer, admin API key hash, and signing key pair. This writes
`worker/bootstrap.local.json`, which is ignored by git because it contains secrets:

```sh
pnpm bootstrap -- --api-key=replace-with-a-long-random-admin-key
```

Apply the SQL from `worker/bootstrap.local.json` to the remote D1 database:

```sh
wrangler d1 execute license_service --remote --config worker/wrangler.toml --command "<paste printed INSERT SQL here>"
```

Set the Worker secrets from `worker/bootstrap.local.json`:

```sh
wrangler secret put SIGNING_KEY_ID --config worker/wrangler.toml
wrangler secret put SIGNING_PRIVATE_JWK --config worker/wrangler.toml
```

Deploy:

```sh
pnpm deploy
```

### Set variables in Cloudflare dashboard

After deployment, in the Cloudflare dashboard:

1. Open your Workers project.
2. Go to `Settings` > `Variables`.
3. Confirm these environment variables:
   - `LICENSE_ISSUER`: public issuer name in signed licenses, default `licsign`.
   - `CORS_ORIGIN`: allowed browser origin, default `*`.
4. Confirm these secrets exist:
   - `SIGNING_KEY_ID`
   - `SIGNING_PRIVATE_JWK`
5. Save and redeploy if the dashboard asks you to.

Do not put the admin API key itself in variables. The raw key is only shown to the
operator; D1 stores its SHA-256 hash from the bootstrap SQL.

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
`--public-user-id=<value>` to `pnpm bootstrap`, use that value instead.

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
