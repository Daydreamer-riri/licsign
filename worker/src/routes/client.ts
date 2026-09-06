import { Hono } from "hono";
import type { Env } from "../types";
import { activate, deactivate } from "../services/activation";
import { issueTrial } from "../services/trial";
import { restoreLicense } from "../services/restore";
import { issueEvaluation } from "../services/evaluation";
import { deactivateManagedDevice, listActiveDevices } from "../services/deviceManagement";
import { ApiError, parseJsonBody } from "../utils/http";

export const clientRoutes = new Hono<{ Bindings: Env }>();

clientRoutes.post("/activate", async (c) => {
  const result = await activate(c.env, await parseJsonBody(c.req));
  return c.json(result);
});

clientRoutes.post("/deactivate", async (c) => {
  const result = await deactivate(c.env, await parseJsonBody(c.req));
  return c.json(result);
});

clientRoutes.post("/devices", async (c) => {
  c.header("Cache-Control", "no-store");
  await enforceDeviceRateLimit(c.env, c.req.header("CF-Connecting-IP"));
  const body = await parseJsonBody(c.req);
  const result = await listActiveDevices(c.env, body);
  return c.json(result);
});

clientRoutes.post("/devices/:activationId/deactivate", async (c) => {
  c.header("Cache-Control", "no-store");
  await enforceDeviceRateLimit(c.env, c.req.header("CF-Connecting-IP"));
  const body = await parseJsonBody(c.req);
  const result = await deactivateManagedDevice(
    c.env,
    c.req.param("activationId"),
    body,
  );
  return c.json(result);
});

clientRoutes.post("/trial", async (c) => {
  const result = await issueTrial(c.env, await parseJsonBody(c.req));
  return c.json(result);
});

clientRoutes.post("/restore", async (c) => {
  const result = await restoreLicense(c.env, await parseJsonBody(c.req));
  return c.json(result);
});

clientRoutes.post("/evaluate", async (c) => {
  const result = await issueEvaluation(c.env, await parseJsonBody(c.req));
  return c.json(result);
});

async function enforceDeviceRateLimit(env: Env, clientIp?: string) {
  if (!env.DEVICE_MANAGER_RATE_LIMITER) return;
  const outcome = await env.DEVICE_MANAGER_RATE_LIMITER.limit({
    key: `devices:${clientIp ?? "unknown"}`,
  });
  if (!outcome.success) {
    throw new ApiError(429, "RATE_LIMIT_EXCEEDED", "Too many device management requests");
  }
}
