import { Hono } from "hono";
import type { Env } from "../types";
import { activate, deactivate } from "../services/activation";
import { issueTrial } from "../services/trial";
import { restoreLicense } from "../services/restore";

export const clientRoutes = new Hono<{ Bindings: Env }>();

clientRoutes.post("/activate", async (c) => {
  const result = await activate(c.env, await c.req.json());
  return c.json(result);
});

clientRoutes.post("/deactivate", async (c) => {
  const result = await deactivate(c.env, await c.req.json());
  return c.json(result);
});

clientRoutes.post("/trial", async (c) => {
  const result = await issueTrial(c.env, await c.req.json());
  return c.json(result);
});

clientRoutes.post("/restore", async (c) => {
  const result = await restoreLicense(c.env, await c.req.json());
  return c.json(result);
});
