import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import type { AdminContext, Env } from "../types";
import { login, deleteSession } from "../services/adminAuth";
import { SESSION_COOKIE_NAME, authenticateAdmin } from "../services/auth";
import { ApiError } from "../utils/http";

export const adminAuthRoutes = new Hono<{ Bindings: Env }>();

const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256)
});

adminAuthRoutes.post("/login", async (c) => {
  const body = loginSchema.parse(await c.req.json());
  const result = await login(c.env.DB, body.email, body.password);

  setCookie(c, SESSION_COOKIE_NAME, result.token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    expires: new Date(result.expiresAt)
  });

  return c.json({ ok: true });
});

adminAuthRoutes.post("/logout", async (c) => {
  const { getCookie } = await import("hono/cookie");
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (token) {
    await deleteSession(c.env.DB, token);
  }

  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
  return c.json({ ok: true });
});

adminAuthRoutes.get("/me", async (c) => {
  const admin = await authenticateAdmin(c.env, c);
  return c.json({
    admin: {
      issuerId: admin.issuerId,
      issuerName: admin.issuerName,
      publicUserId: admin.publicUserId,
      actor: admin.actor
    }
  });
});
