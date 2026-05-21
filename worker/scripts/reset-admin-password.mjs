import { webcrypto } from "node:crypto";

// Regenerates an admin's PBKDF2 password hash and prints an UPDATE statement.
//
// Use this to repair an admin row whose hash was created with a different
// iteration count, or to reset a forgotten password. The iteration count below
// MUST match PBKDF2_ITERATIONS in worker/src/services/adminAuth.ts, and stay at
// or below Cloudflare Workers' 100k Web Crypto cap.

const PBKDF2_ITERATIONS = 100_000;

function getArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sql(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const adminEmail = getArg("admin-email");
const adminPassword = getArg("admin-password");

if (!adminEmail || !adminPassword) {
  console.error(
    "Usage: node worker/scripts/reset-admin-password.mjs --admin-email=<email> --admin-password=<new-password>"
  );
  process.exit(1);
}

const salt = webcrypto.getRandomValues(new Uint8Array(16));
const keyMaterial = await webcrypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(adminPassword),
  "PBKDF2",
  false,
  ["deriveBits"]
);
const bits = await webcrypto.subtle.deriveBits(
  { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
  keyMaterial,
  32 * 8
);

const statement =
  `UPDATE admins SET password_hash = ${sql(hex(bits))}, ` +
  `password_salt = ${sql(hex(salt))}, ` +
  `updated_at = ${sql(new Date().toISOString())} ` +
  `WHERE email = ${sql(adminEmail.toLowerCase())};`;

console.log("Apply this against the D1 database:");
console.log("");
console.log(statement);
