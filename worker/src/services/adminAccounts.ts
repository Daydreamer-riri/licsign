import { createId } from "../utils/id";
import { all, first, nowIso, run } from "../db/d1";
import { hashPassword } from "./adminAuth";
import { ApiError } from "../utils/http";

interface AdminRow {
  id: string;
  issuer_id: string;
  email: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function createAdmin(
  db: D1Database,
  issuerId: string,
  email: string,
  password: string
): Promise<{ id: string; email: string }> {
  const normalizedEmail = email.toLowerCase();
  const existing = await first<{ id: string }>(
    db.prepare("SELECT id FROM admins WHERE email = ?").bind(normalizedEmail)
  );
  if (existing) {
    throw new ApiError(409, "EMAIL_EXISTS", "An admin with this email already exists");
  }

  const { hash, salt } = await hashPassword(password);
  const id = createId("adm");
  const now = nowIso();

  await run(
    db.prepare(
      "INSERT INTO admins (id, issuer_id, email, password_hash, password_salt, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)"
    ).bind(id, issuerId, normalizedEmail, hash, salt, now, now)
  );

  return { id, email: normalizedEmail };
}

export async function listAdmins(
  db: D1Database,
  issuerId: string
): Promise<Array<{ id: string; email: string; status: string; created_at: string }>> {
  return all<{ id: string; email: string; status: string; created_at: string }>(
    db.prepare("SELECT id, email, status, created_at FROM admins WHERE issuer_id = ? ORDER BY created_at ASC").bind(issuerId)
  );
}
