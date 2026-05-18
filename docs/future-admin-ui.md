# Future Admin UI

V1 is API-only. A later UI can be built as React + Vite + TypeScript and served by
Cloudflare Workers Static Assets from the same Worker deployment.

Recommended pages:

- Login
- Dashboard
- Products
- Batch generation
- Batches
- Licenses
- License detail
- Audit log

When adding UI, introduce:

- `admins`
- `admin_sessions`
- password hashing compatible with Workers
- HttpOnly secure cookies
- CSRF protection for cookie-authenticated writes

Until then, admin automation should use API keys.
