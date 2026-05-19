import { first, all, run } from "../d1";

export async function findByEmail(
  db: D1Database,
  email: string,
): Promise<{ id: string } | null> {
  return first<{ id: string }>(
    db.prepare("SELECT id FROM admins WHERE email = ?").bind(email),
  );
}

export async function insert(
  db: D1Database,
  params: {
    id: string;
    issuerId: string;
    email: string;
    passwordHash: string;
    passwordSalt: string;
    now: string;
  },
): Promise<void> {
  await run(
    db
      .prepare(
        "INSERT INTO admins (id, issuer_id, email, password_hash, password_salt, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
      )
      .bind(
        params.id,
        params.issuerId,
        params.email,
        params.passwordHash,
        params.passwordSalt,
        params.now,
        params.now,
      ),
  );
}

export async function list(
  db: D1Database,
  issuerId: string,
): Promise<Array<{ id: string; email: string; status: string; created_at: string }>> {
  return all<{ id: string; email: string; status: string; created_at: string }>(
    db
      .prepare("SELECT id, email, status, created_at FROM admins WHERE issuer_id = ? ORDER BY created_at ASC")
      .bind(issuerId),
  );
}

interface LoginAdminRow {
  id: string;
  issuer_id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  status: string;
}

export async function findByEmailFull(
  db: D1Database,
  email: string,
): Promise<LoginAdminRow | null> {
  return first<LoginAdminRow>(
    db
      .prepare("SELECT id, issuer_id, email, password_hash, password_salt, status FROM admins WHERE email = ?")
      .bind(email),
  );
}

export async function findByIdActive(
  db: D1Database,
  adminId: string,
): Promise<{ id: string; issuer_id: string; email: string; status: string } | null> {
  return first<{ id: string; issuer_id: string; email: string; status: string }>(
    db
      .prepare("SELECT id, issuer_id, email, status FROM admins WHERE id = ? AND status = 'active'")
      .bind(adminId),
  );
}
