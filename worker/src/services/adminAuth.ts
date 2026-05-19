import { sha256Hex } from "../utils/hash";
import { createId } from "../utils/id";
import * as adminQueries from "../db/queries/admins";
import * as sessionQueries from "../db/queries/sessions";
import { nowIso } from "../utils/time";
import { ApiError } from "../utils/http";

const PBKDF2_ITERATIONS = 600_000;
const SALT_LENGTH = 16;
const HASH_LENGTH = 32;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_SLIDE_THRESHOLD_MS = SESSION_TTL_MS / 2;

// --- Password hashing ---

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(saltBytes);
  const salt = bytesToHex(saltBytes);
  const hash = await deriveKey(password, saltBytes);
  return { hash, salt };
}

export async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const saltBytes = hexToBytes(storedSalt);
  const derived = await deriveKey(password, saltBytes);
  return timingSafeEqual(derived, storedHash);
}

async function deriveKey(password: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    HASH_LENGTH * 8
  );
  return bytesToHex(new Uint8Array(bits));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) {
    diff |= bufA[i]! ^ bufB[i]!;
  }
  return diff === 0;
}

// --- Session management ---

export async function createSession(db: D1Database, adminId: string): Promise<{ token: string; expiresAt: string }> {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await sha256Hex(token);
  const sessionId = createId("ses");
  const now = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await sessionQueries.insertSession(db, {
    id: sessionId,
    tokenHash,
    adminId,
    expiresAt,
    now,
  });

  return { token, expiresAt };
}

export interface SessionValidationResult {
  adminId: string;
  issuerId: string;
  email: string;
  sessionId: string;
}

export async function validateSession(db: D1Database, token: string): Promise<SessionValidationResult | null> {
  const tokenHash = await sha256Hex(token);
  const session = await sessionQueries.findByTokenHash(db, tokenHash);

  if (!session) return null;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await sessionQueries.deleteById(db, session.id);
    return null;
  }

  const admin = await adminQueries.findByIdActive(db, session.admin_id);

  if (!admin) return null;

  // Sliding window: renew if less than half lifetime remains
  const remaining = new Date(session.expires_at).getTime() - Date.now();
  if (remaining < SESSION_SLIDE_THRESHOLD_MS) {
    const newExpiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await sessionQueries.updateExpiry(db, session.id, newExpiresAt);
  }

  return {
    adminId: admin.id,
    issuerId: admin.issuer_id,
    email: admin.email,
    sessionId: session.id
  };
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await sessionQueries.deleteByTokenHash(db, tokenHash);
}

export async function deleteAllSessionsForAdmin(db: D1Database, adminId: string): Promise<void> {
  await sessionQueries.deleteByAdminId(db, adminId);
}

// --- Login ---

export async function login(db: D1Database, email: string, password: string): Promise<{ adminId: string; issuerId: string; token: string; expiresAt: string }> {
  const admin = await adminQueries.findByEmailFull(db, email.toLowerCase());

  if (!admin || admin.status !== "active") {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid email or password");
  }

  const valid = await verifyPassword(password, admin.password_hash, admin.password_salt);
  if (!valid) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid email or password");
  }

  const session = await createSession(db, admin.id);
  return { adminId: admin.id, issuerId: admin.issuer_id, token: session.token, expiresAt: session.expiresAt };
}

// --- Helpers ---

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
