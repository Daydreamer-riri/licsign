# React Router framework mode (SPA) for the Admin UI

The Admin UI runs on React Router **framework mode** in **SPA mode**
(`ssr: false`). Routes are declared in `admin/src/routes.ts`, every data page
loads through a `clientLoader`, and the build emits static assets served by the
Worker. There is no server-side rendering.

## Context

The Admin UI started as a plain Vite SPA: `main.tsx` mounted `BrowserRouter`,
`App.tsx` declared routes with JSX `<Routes>/<Route>`, and every page fetched
data through a hand-written `useApi(fetcher, deps)` hook with its own
`loading`/`error` branches. The production build was a single ~516 kB JS bundle
(Vite emitted a chunk-size warning).

Framework mode offers route-based code splitting, declarative data loading
(`clientLoader`), generated route types, and a loader-based auth gate. The
question was which rendering strategy to adopt.

## Decision

- **Framework mode, SPA mode (`ssr: false`).** The Admin UI is entirely behind
  authentication and every page renders D1-backed data fetched at runtime. At
  build time there is no session and no data, so SSR and content-level SSG
  cannot produce a meaningful first paint — they would only emit an empty
  shell. SPA mode keeps the output as static assets, which the Worker already
  serves via Static Assets.
- **Reads use `clientLoader`; writes stay imperative.** Each data route exports
  a `clientLoader` wrapped by `admin/src/lib/load.ts`. Mutations
  (login, logout, create, edit, disable/enable/revoke, archive) remain
  imperative `api.post/patch` calls followed by `useRevalidator().revalidate()`.
  Converting the existing `ConfirmDialog` / `*FormDialog` components — which
  already encapsulate submit, pending, and error handling — to
  `clientAction` / `<Form>` would be churn without functional gain.
- **Auth gate is a layout route `clientLoader`.** `pages/ProtectedLayout.tsx`
  fetches `/api/admin/auth/me`; a 401 becomes `throw redirect("/login")`. This
  replaces the previous `AuthProvider` context + `useEffect`.
- **`load()` for 401s in loaders; `setUnauthorizedHandler` for imperative
  calls.** A 401 inside a `clientLoader` is converted to a clean redirect by
  `load()`. A 401 from an imperative mutation is caught by `api.ts` and routed
  to `/login` by a handler registered in `root.tsx`.

## Consequences

- The build is split per route; the 516 kB single-bundle warning is gone.
  Output moved from `admin/dist/` to `admin/build/client/`, and
  `worker/wrangler.jsonc` `assets.directory` was updated accordingly.
- Deep-link refresh (e.g. `/products/:id/licenses/:id`) does **not** 404: SPA
  mode emits an `index.html` fallback and the Worker serves it for unmatched
  paths via `assets.not_found_handling: "single-page-application"`. That config
  is load-bearing and must stay.
- `@react-router/node` and `isbot` are runtime dependencies even though the app
  is SPA-only — the framework build pipeline resolves a server runtime to
  pre-render the SPA shell. They are not shipped to the browser.
- `useApi`, `auth.tsx`, `ScopeContext`, `main.tsx`, `App.tsx`, and `index.html`
  were removed. `react-router typegen` generates `.react-router/types/`
  (gitignored); `tsconfig.json` references it via `rootDirs`.
- Vitest keeps a standalone `vitest.config.ts` using `@vitejs/plugin-react`,
  because the React Router Vite plugin cannot run under Vitest.
- This supersedes the build/stack details in
  `docs/adr/0004-product-scoped-admin-ui-ia.md`; the product-scoped
  information architecture from ADR-0004 is unchanged.
