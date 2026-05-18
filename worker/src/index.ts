import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { clientRoutes } from "./routes/client";
import { adminRoutes } from "./routes/admin";
import { compatRoutes } from "./routes/compat";
import { openApiDocument } from "./openapi";
import { jsonError, toApiError } from "./utils/http";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.CORS_ORIGIN ?? "*",
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400
  });
  return corsMiddleware(c, next);
});

app.get("/", (c) =>
  c.json({
    name: "Cloudflare License Service",
    version: "0.1.0",
    endpoints: ["/openapi.json", "/api/client/activate", "/api/admin/products", "/license/:userId/:licenseKey/verify"]
  })
);

app.get("/openapi.json", (c) => c.json(openApiDocument));

app.route("/api/client", clientRoutes);
app.route("/api/admin", adminRoutes);
app.route("/license", compatRoutes);

app.notFound((c) => jsonError(c, 404, "NOT_FOUND", "Route not found"));

app.onError((error, c) => {
  const apiError = toApiError(error);
  return jsonError(c, apiError.status, apiError.code, apiError.message, apiError.details);
});

export default app;
