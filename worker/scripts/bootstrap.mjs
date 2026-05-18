import { createHash, webcrypto } from "node:crypto";

function getArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function createId(prefix) {
  return `${prefix}_${webcrypto.randomUUID().replace(/-/g, "")}`;
}

function sql(value) {
  if (value === null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

const issuerName = getArg("issuer-name", "Default Issuer");
const publicUserId = getArg("public-user-id", "default");
const apiKey = getArg("api-key");
const apiKeyName = getArg("api-key-name", "bootstrap-admin");

if (!apiKey) {
  console.error("Usage: npm run bootstrap -- --api-key=<admin-api-key> [--issuer-name=...] [--public-user-id=...]");
  process.exit(1);
}

const issuerId = createId("iss");
const apiKeyId = createId("key");
const now = new Date().toISOString();
const keyHash = createHash("sha256").update(apiKey).digest("hex");
const keyPair = await webcrypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"]
);
const privateJwk = await webcrypto.subtle.exportKey("jwk", keyPair.privateKey);
const publicJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
const keyId = `kid_${webcrypto.randomUUID().replace(/-/g, "")}`;

console.log("-- Run this SQL with wrangler d1 execute after applying migrations.");
console.log(
  `INSERT INTO issuers (id, public_user_id, name, status, created_at, updated_at) VALUES (${sql(issuerId)}, ${sql(publicUserId)}, ${sql(issuerName)}, 'active', ${sql(now)}, ${sql(now)});`
);
console.log(
  `INSERT INTO api_keys (id, issuer_id, name, key_hash, status, created_at) VALUES (${sql(apiKeyId)}, ${sql(issuerId)}, ${sql(apiKeyName)}, ${sql(keyHash)}, 'active', ${sql(now)});`
);
console.log("");
console.log("-- Set these Worker secrets:");
console.log(`SIGNING_KEY_ID=${keyId}`);
console.log(`SIGNING_PRIVATE_JWK=${JSON.stringify(privateJwk)}`);
console.log("");
console.log("-- Embed this public JWK in Android TV verifier configuration:");
console.log(JSON.stringify(publicJwk, null, 2));
