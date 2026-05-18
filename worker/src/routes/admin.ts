import { Hono } from "hono";
import type { AdminContext, Env } from "../types";
import { adminMiddleware } from "../services/auth";
import { createProduct, listProducts, updateProduct } from "../services/products";
import { createBatch, listBatches, readBatch } from "../services/batches";
import {
  exportLicensesCsv,
  readLicense,
  revokeLicense,
  searchLicenses,
  setLicenseDisabled
} from "../services/licenses";

export const adminRoutes = new Hono<{ Bindings: Env; Variables: { admin: AdminContext } }>();

adminRoutes.use("*", adminMiddleware);

adminRoutes.get("/me", (c) => c.json({ admin: c.get("admin") }));

adminRoutes.get("/products", async (c) => {
  const admin = c.get("admin");
  return c.json({ products: await listProducts(c.env.DB, admin.issuerId) });
});

adminRoutes.post("/products", async (c) => {
  const admin = c.get("admin");
  return c.json(await createProduct(c.env.DB, admin.issuerId, admin.apiKeyId, await c.req.json()));
});

adminRoutes.patch("/products/:id", async (c) => {
  const admin = c.get("admin");
  return c.json(
    await updateProduct(c.env.DB, admin.issuerId, admin.apiKeyId, c.req.param("id"), await c.req.json())
  );
});

adminRoutes.get("/batches", async (c) => {
  const admin = c.get("admin");
  return c.json({ batches: await listBatches(c.env.DB, admin.issuerId) });
});

adminRoutes.post("/batches", async (c) => {
  const admin = c.get("admin");
  return c.json(await createBatch(c.env.DB, admin.issuerId, admin.apiKeyId, await c.req.json()));
});

adminRoutes.get("/batches/:id", async (c) => {
  const admin = c.get("admin");
  return c.json(await readBatch(c.env.DB, admin.issuerId, c.req.param("id")));
});

adminRoutes.get("/licenses/export.csv", async (c) => {
  const admin = c.get("admin");
  const csv = await exportLicensesCsv(c.env.DB, admin.issuerId, c.req.query());
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="licenses.csv"'
    }
  });
});

adminRoutes.get("/licenses", async (c) => {
  const admin = c.get("admin");
  return c.json(await searchLicenses(c.env.DB, admin.issuerId, c.req.query()));
});

adminRoutes.get("/licenses/:id", async (c) => {
  const admin = c.get("admin");
  return c.json(await readLicense(c.env.DB, admin.issuerId, c.req.param("id")));
});

adminRoutes.post("/licenses/:id/disable", async (c) => {
  const admin = c.get("admin");
  return c.json(await setLicenseDisabled(c.env.DB, admin.issuerId, admin.apiKeyId, c.req.param("id"), true));
});

adminRoutes.post("/licenses/:id/enable", async (c) => {
  const admin = c.get("admin");
  return c.json(await setLicenseDisabled(c.env.DB, admin.issuerId, admin.apiKeyId, c.req.param("id"), false));
});

adminRoutes.post("/licenses/:id/revoke", async (c) => {
  const admin = c.get("admin");
  return c.json(await revokeLicense(c.env.DB, admin.issuerId, admin.apiKeyId, c.req.param("id"), await c.req.json()));
});
