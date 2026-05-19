import { getCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import type { AdminContext, Env } from "../types";
import { first, nowIso, run } from "../db/d1";
import { ApiError } from "../utils/http";
import { sha256Hex } from "../utils/hash";
import { validateSession } from "./adminAuth";

const SESSION_COOKIE_NAME = "admin_session";

interface AuthRow {
  api_key_id: string;
  issuer_id: string;
  issuer_name: string;
  public_user_id: string;
}

function getApiKeyFromRequest(c: Context): string | null {
  const authorization = c.req.header("authorization");
  if (authorization) {
    if (authorization.toLowerCase().startsWith("bearer ")) {
      return authorization.slice(7).trim();
    }
    return authorization.trim();
  }

  return c.req.query("api_key") ?? null;
}

function getSessionTokenFromRequest(c: Context): string | null {
  return getCookie(c, SESSION_COOKIE_NAME) ?? null;
}

export async function authenticateAdmin(env: Env, c: Context): Promise<AdminContext> {
  // Try session cookie first
  const sessionToken = getSessionTokenFromRequest(c);
  if (sessionToken) {
    const session = await validateSession(env.DB, sessionToken);
    if (session) {
      const issuer = await first<{ id: string; name: string; public_user_id: string }>(
        env.DB.prepare(
          "SELECT id, name, public_user_id FROM issuers WHERE id = ? AND status = 'active'"
        ).bind(session.issuerId)
      );
      if (!issuer) {
        throw new ApiError(401, "UNAUTHORIZED", "Issuer not found or disabled");
      }
      return {
        issuerId: issuer.id,
        issuerName: issuer.name,
        publicUserId: issuer.public_user_id,
        apiKeyId: "",
        actor: { type: "admin", adminId: session.adminId, email: session.email }
      };
    }
  }

  // Fall back to API key
  const apiKey = getApiKeyFromRequest(c);
  if (!apiKey) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing credentials");
  }

  const keyHash = await sha256Hex(apiKey);
  const row = await first<AuthRow>(
    env.DB.prepare(
      `SELECT
        api_keys.id AS api_key_id,
        issuers.id AS issuer_id,
        issuers.name AS issuer_name,
        issuers.public_user_id AS public_user_id
       FROM api_keys
       JOIN issuers ON issuers.id = api_keys.issuer_id
       WHERE api_keys.key_hash = ?
         AND api_keys.status = 'active'
         AND issuers.status = 'active'`
    ).bind(keyHash)
  );

  if (!row) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid API key");
  }

  await run(env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(nowIso(), row.api_key_id));

  return {
    issuerId: row.issuer_id,
    issuerName: row.issuer_name,
    publicUserId: row.public_user_id,
    apiKeyId: row.api_key_id,
    actor: { type: "api_key", apiKeyId: row.api_key_id }
  };
}

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export async function adminMiddleware(c: Context<{ Bindings: Env; Variables: { admin: AdminContext } }>, next: Next) {
  const admin = await authenticateAdmin(c.env, c);

  // CSRF: validate Origin for session-cookie authenticated mutating requests
  if (admin.actor.type === "admin" && MUTATING_METHODS.has(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin) {
      const requestUrl = new URL(c.req.url);
      const originUrl = new URL(origin);
      if (originUrl.origin !== requestUrl.origin) {
        throw new ApiError(403, "CSRF_REJECTED", "Cross-origin request rejected");
      }
    } else {
      // No Origin header on a mutating session request — reject for safety
      throw new ApiError(403, "CSRF_REJECTED", "Origin header required for session-authenticated mutations");
    }
  }

  c.set("admin", admin);
  await next();
}

export { SESSION_COOKIE_NAME };
