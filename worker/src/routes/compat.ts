import { Hono } from "hono";
import type { Env } from "../types";
import { verifyLicenseGateCompat } from "../services/licenseGateCompat";

export const compatRoutes = new Hono<{ Bindings: Env }>();

compatRoutes.get("/:userId/:licenseKey/verify", async (c) => {
  const options = {
    scope: c.req.query("scope"),
    challenge: c.req.query("challenge"),
    metadata: c.req.query("metadata")
  };
  return c.json(
    await verifyLicenseGateCompat(c.env, {
      userId: c.req.param("userId"),
      licenseKey: c.req.param("licenseKey"),
      options
    })
  );
});

compatRoutes.post("/:userId/:licenseKey/verify", async (c) => {
  return c.json(
    await verifyLicenseGateCompat(c.env, {
      userId: c.req.param("userId"),
      licenseKey: c.req.param("licenseKey"),
      options: await c.req.json()
    })
  );
});
