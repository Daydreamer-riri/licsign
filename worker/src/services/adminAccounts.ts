import { createId } from "../utils/id";
import { nowIso } from "../utils/time";
import * as adminQueries from "../db/queries/admins";
import { hashPassword } from "./adminAuth";
import { ApiError } from "../utils/http";

export async function createAdmin(
  db: D1Database,
  issuerId: string,
  email: string,
  password: string
): Promise<{ id: string; email: string }> {
  const normalizedEmail = email.toLowerCase();
  const existing = await adminQueries.findByEmail(db, normalizedEmail);
  if (existing) {
    throw new ApiError(409, "EMAIL_EXISTS", "An admin with this email already exists");
  }

  const { hash, salt } = await hashPassword(password);
  const id = createId("adm");
  const now = nowIso();

  await adminQueries.insert(db, {
    id,
    issuerId,
    email: normalizedEmail,
    passwordHash: hash,
    passwordSalt: salt,
    now,
  });

  return { id, email: normalizedEmail };
}

export async function listAdmins(
  db: D1Database,
  issuerId: string
): Promise<Array<{ id: string; email: string; status: string; created_at: string }>> {
  return adminQueries.list(db, issuerId);
}
