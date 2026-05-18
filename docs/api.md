# API

All JSON APIs return structured errors:

```json
{
  "error": "BAD_REQUEST",
  "message": "Request validation failed",
  "details": {}
}
```

## Admin Authentication

Admin endpoints accept either:

- `Authorization: Bearer <api-key>`
- `Authorization: <api-key>`
- `?api_key=<api-key>`

The raw API key is never stored. D1 stores its SHA-256 hex digest.

## Client API

### `POST /api/client/activate`

Request:

```json
{
  "product_code": "my_product",
  "activation_code": "PROD-ABCD-EFGH-JKLM-NPQR",
  "machine_hash": "64-character-sha256-hex",
  "device_label": "Living Room TV",
  "client_version": "1.0.0",
  "platform": "android-tv"
}
```

Response:

```json
{
  "license": {
    "version": 1,
    "license_id": "lic_xxx",
    "product_code": "my_product",
    "machine_hash": "64-character-sha256-hex",
    "features": [],
    "issued_at": "2026-05-18T00:00:00.000Z",
    "expires_at": null,
    "max_devices": 1,
    "issuer": "licsign",
    "key_id": "kid_xxx"
  },
  "signature": "base64url-signature",
  "token": "compact-jws"
}
```

Stable activation errors:

- `INVALID_CODE`
- `LICENSE_DISABLED`
- `LICENSE_REVOKED`
- `LICENSE_EXPIRED`
- `PRODUCT_MISMATCH`
- `DEVICE_LIMIT_REACHED`
- `BAD_REQUEST`
- `SERVER_ERROR`

### `POST /api/client/deactivate`

Marks a machine activation as deactivated, allowing the seat to be reused.

## Admin API

### Products

- `GET /api/admin/products`
- `POST /api/admin/products`
- `PATCH /api/admin/products/:id`

Create product body:

```json
{
  "code": "my_product",
  "name": "My Product",
  "description": "",
  "default_max_devices": 1
}
```

### Batches

- `GET /api/admin/batches`
- `GET /api/admin/batches/:id`
- `POST /api/admin/batches`

Create batch body:

```json
{
  "product_id": "prd_xxx",
  "batch_name": "Initial batch",
  "quantity": 100,
  "max_devices": 1,
  "expires_at": null,
  "code_prefix": "TV",
  "notes": "optional"
}
```

The response includes generated `activation_codes` and a raw `csv` string.

### Licenses

- `GET /api/admin/licenses`
- `GET /api/admin/licenses/:id`
- `POST /api/admin/licenses/:id/disable`
- `POST /api/admin/licenses/:id/enable`
- `POST /api/admin/licenses/:id/revoke`
- `GET /api/admin/licenses/export.csv`

Search query parameters:

- `q`
- `product_id`
- `batch_id`
- `status`
- `take`
- `skip`

## LicenseGate Compatibility

### `GET /license/:userId/:licenseKey/verify`
### `POST /license/:userId/:licenseKey/verify`

`userId` maps to `issuers.public_user_id`. `licenseKey` maps to `activation_code`.

Response:

```json
{
  "valid": true,
  "result": "VALID",
  "signedChallenge": "optional-compact-jws"
}
```

The compatibility endpoint is for online status checks and transitional callers. The
primary V1 client flow is `/api/client/activate`.
