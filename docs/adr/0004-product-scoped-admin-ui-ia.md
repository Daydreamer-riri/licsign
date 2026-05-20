# Product-scoped Admin UI information architecture

The Admin UI is organised around a single primary scope — the Product. Batches,
Licenses, and product settings are nested under `/products/:id/*`; the top level
is a product grid plus a settings area. There are no flat, cross-product list
pages. Cross-product lookup is handled by a global ⌘K command palette.

## Context

`docs/prd-admin-ui.md` specified a flat page set — Dashboard, Products, Batches,
Licenses, License detail, Audit log — each a sibling route listing every row for
that entity across all products. As the catalog grows, those flat lists force the
operator to scan the full set and filter, rather than working inside the product
they care about.

Vercel's dashboard was taken as the interaction reference: the operator is always
inside a scope (team → project → deployment), tabs switch facets of that scope,
and a command palette handles cross-cutting navigation.

## Decision

- Product is the primary scope. `/products/:id` has Overview / Batches / Licenses
  / Settings tabs; batch and license detail pages are nested beneath it.
- The home route is a product grid. Global settings (Admins, Audit Log) live
  under `/settings`.
- There is no flat global Licenses or Batches list. A ⌘K command palette searches
  licenses (by activation code or recipient, server-side) and products, and jumps
  straight to the matching detail page.
- A small read-only endpoint, `GET /api/admin/products/:id/overview`, backs the
  product Overview tab; `GET /api/admin/products` gained a per-product
  `license_count`.

## Consequences

- This supersedes the flat page list in `docs/prd-admin-ui.md`. That PRD remains
  accurate for authentication, data model, and endpoint behavior.
- Finding a license requires either knowing its product or using ⌘K. The command
  palette is therefore load-bearing, not a convenience.
- Deep links carry product context (`/products/:id/licenses/:licenseId`), so
  breadcrumbs and the contextual tab bar render without extra lookups.
- New entity types should pick a scope: product-scoped (a new product tab) or
  global (a new settings section).
