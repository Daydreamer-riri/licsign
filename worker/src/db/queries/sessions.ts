import { first, run } from "../d1";
import type { AdminSessionRow } from "../models";

export async function insertSession(
  db: D1Database,
  params: {
    id: string;
    tokenHash: string;
    adminId: string;
    expiresAt: string;
    now: string;
  },
): Promise<void> {
  await run(
    db
      .prepare(
        "INSERT INTO admin_sessions (id, token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(params.id, params.tokenHash, params.adminId, params.expiresAt, params.now),
  );
}

export async function findByTokenHash(
  db: D1Database,
  tokenHash: string,
): Promise<AdminSessionRow | null> {
  return first<AdminSessionRow>(
    db.prepare("SELECT * FROM admin_sessions WHERE token_hash = ?").bind(tokenHash),
  );
}

export async function deleteById(
  db: D1Database,
  sessionId: string,
): Promise<void> {
  await run(
    db.prepare("DELETE FROM admin_sessions WHERE id = ?").bind(sessionId),
  );
}

export async function updateExpiry(
  db: D1Database,
  sessionId: string,
  expiresAt: string,
): Promise<void> {
  await run(
    db.prepare("UPDATE admin_sessions SET expires_at = ? WHERE id = ?").bind(expiresAt, sessionId),
  );
}

export async function deleteByTokenHash(
  db: D1Database,
  tokenHash: string,
): Promise<void> {
  await run(
    db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(tokenHash),
  );
}

export async function deleteByAdminId(
  db: D1Database,
  adminId: string,
): Promise<void> {
  await run(
    db.prepare("DELETE FROM admin_sessions WHERE admin_id = ?").bind(adminId),
  );
}
