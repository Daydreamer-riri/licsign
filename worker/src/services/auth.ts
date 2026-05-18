import type { Context, Next } from "hono";
import type { AdminContext, Env } from "../types";
import { first, nowIso, run } from "../db/d1";
import { ApiError } from "../utils/http";
import { sha256Hex } from "../utils/hash";

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

export async function authenticateAdmin(env: Env, c: Context): Promise<AdminContext> {
  const apiKey = getApiKeyFromRequest(c);
  if (!apiKey) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing API key");
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
    apiKeyId: row.api_key_id
  };
}

export async function adminMiddleware(c: Context<{ Bindings: Env; Variables: { admin: AdminContext } }>, next: Next) {
  const admin = await authenticateAdmin(c.env, c);
  c.set("admin", admin);
  await next();
}
