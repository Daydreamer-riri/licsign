import { Hono } from "hono";
import { z } from "zod";
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
import { createAdmin, listAdmins } from "../services/adminAccounts";
import { getDashboardStats } from "../services/dashboard";
import { queryAuditLogs } from "../services/auditQuery";

export const adminRoutes = new Hono<{ Bindings: Env; Variables: { admin: AdminContext } }>();

adminRoutes.use("*", adminMiddleware);

adminRoutes.get("/me", (c) => c.json({ admin: c.get("admin") }));

adminRoutes.get("/products", async (c) => {
  const admin = c.get("admin");
  return c.json({ products: await listProducts(c.env.DB, admin.issuerId) });
});

adminRoutes.post("/products", async (c) => {
  const admin = c.get("admin");
  return c.json(await createProduct(c.env.DB, admin.issuerId, admin.actor, await c.req.json()));
});

adminRoutes.patch("/products/:id", async (c) => {
  const admin = c.get("admin");
  return c.json(
    await updateProduct(c.env.DB, admin.issuerId, admin.actor, c.req.param("id"), await c.req.json())
  );
});

adminRoutes.get("/batches", async (c) => {
  const admin = c.get("admin");
  return c.json({ batches: await listBatches(c.env.DB, admin.issuerId) });
});

adminRoutes.post("/batches", async (c) => {
  const admin = c.get("admin");
  return c.json(await createBatch(c.env.DB, admin.issuerId, admin.actor, await c.req.json()));
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
  return c.json(await setLicenseDisabled(c.env.DB, admin.issuerId, admin.actor, c.req.param("id"), true));
});

adminRoutes.post("/licenses/:id/enable", async (c) => {
  const admin = c.get("admin");
  return c.json(await setLicenseDisabled(c.env.DB, admin.issuerId, admin.actor, c.req.param("id"), false));
});

adminRoutes.post("/licenses/:id/revoke", async (c) => {
  const admin = c.get("admin");
  return c.json(await revokeLicense(c.env.DB, admin.issuerId, admin.actor, c.req.param("id"), await c.req.json()));
});

// --- Admin management ---

const createAdminSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(256)
});

adminRoutes.get("/admins", async (c) => {
  const admin = c.get("admin");
  return c.json({ admins: await listAdmins(c.env.DB, admin.issuerId) });
});

adminRoutes.post("/admins", async (c) => {
  const admin = c.get("admin");
  const body = createAdminSchema.parse(await c.req.json());
  const result = await createAdmin(c.env.DB, admin.issuerId, body.email, body.password);
  return c.json(result, 201);
});

// --- Dashboard ---

adminRoutes.get("/dashboard/stats", async (c) => {
  const admin = c.get("admin");
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 10), 1), 50);
  return c.json(await getDashboardStats(c.env.DB, admin.issuerId, limit));
});

// --- Audit logs ---

adminRoutes.get("/audit-logs", async (c) => {
  const admin = c.get("admin");
  return c.json(
    await queryAuditLogs(c.env.DB, admin.issuerId, {
      action: c.req.query("action"),
      take: c.req.query("take") ? Number(c.req.query("take")) : undefined,
      skip: c.req.query("skip") ? Number(c.req.query("skip")) : undefined
    })
  );
});

