import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  route("login", "pages/Login.tsx"),
  layout("pages/ProtectedLayout.tsx", { id: "protected" }, [
    index("pages/Products.tsx"),
    route(
      "products/:id",
      "pages/product/ProductLayout.tsx",
      { id: "product" },
      [
        index("pages/product/Overview.tsx"),
        route("batches", "pages/product/Batches.tsx"),
        route("batches/:batchId", "pages/product/BatchDetail.tsx"),
        route("licenses", "pages/product/Licenses.tsx"),
        route("licenses/:licenseId", "pages/product/LicenseDetail.tsx"),
        route("settings", "pages/product/Settings.tsx"),
      ],
    ),
    route("settings", "pages/settings/SettingsLayout.tsx", [
      index("pages/settings/SettingsIndex.tsx"),
      route("admins", "pages/settings/Admins.tsx"),
      route("audit", "pages/settings/Audit.tsx"),
    ]),
    route("*", "pages/CatchAll.tsx"),
  ]),
] satisfies RouteConfig;
