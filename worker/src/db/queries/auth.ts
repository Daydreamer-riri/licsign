import { first, run } from "../d1";

interface AuthRow {
  api_key_id: string;
  issuer_id: string;
  issuer_name: string;
  public_user_id: string;
}

export async function findApiKeyByHash(
  db: D1Database,
  keyHash: string,
): Promise<AuthRow | null> {
  return first<AuthRow>(
    db
      .prepare(
        `SELECT
          api_keys.id AS api_key_id,
          issuers.id AS issuer_id,
          issuers.name AS issuer_name,
          issuers.public_user_id AS public_user_id
         FROM api_keys
         JOIN issuers ON issuers.id = api_keys.issuer_id
         WHERE api_keys.key_hash = ?
           AND api_keys.status = 'active'
           AND issuers.status = 'active'`,
      )
      .bind(keyHash),
  );
}

export async function updateApiKeyLastUsed(
  db: D1Database,
  apiKeyId: string,
  now: string,
): Promise<void> {
  await run(
    db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(now, apiKeyId),
  );
}

export async function findIssuerById(
  db: D1Database,
  issuerId: string,
): Promise<{ id: string; name: string; public_user_id: string } | null> {
  return first<{ id: string; name: string; public_user_id: string }>(
    db
      .prepare("SELECT id, name, public_user_id FROM issuers WHERE id = ? AND status = 'active'")
      .bind(issuerId),
  );
}
