import { createHash, webcrypto } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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
const outFile = getArg("out", "worker/bootstrap.local.json");
const printSecrets = getArg("print-secrets", "false") === "true";
const signingOnly = getArg("signing-only", "false") === "true";

if (!signingOnly && !apiKey) {
  console.error(
    "Usage: pnpm bootstrap -- --api-key=<admin-api-key> [--issuer-name=...] [--public-user-id=...] [--out=worker/bootstrap.local.json]\n" +
      "       (use --signing-only=true to generate only a fresh signing key pair without an issuer/api_key row)"
  );
  process.exit(1);
}

const now = new Date().toISOString();
const keyPair = await webcrypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"]
);
const privateJwk = await webcrypto.subtle.exportKey("jwk", keyPair.privateKey);
const publicJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
const keyId = `kid_${webcrypto.randomUUID().replace(/-/g, "")}`;

let issuerBlock = null;
let apiKeyBlock = null;
let sqlStatements = [];
let keyHash = null;

if (!signingOnly) {
  const issuerId = createId("iss");
  const apiKeyId = createId("key");
  keyHash = createHash("sha256").update(apiKey).digest("hex");
  sqlStatements = [
    `INSERT OR IGNORE INTO issuers (id, public_user_id, name, status, created_at, updated_at) VALUES (${sql(issuerId)}, ${sql(publicUserId)}, ${sql(issuerName)}, 'active', ${sql(now)}, ${sql(now)});`,
    `INSERT OR IGNORE INTO api_keys (id, issuer_id, name, key_hash, status, created_at) VALUES (${sql(apiKeyId)}, ${sql(issuerId)}, ${sql(apiKeyName)}, ${sql(keyHash)}, 'active', ${sql(now)});`
  ];
  issuerBlock = { id: issuerId, name: issuerName, public_user_id: publicUserId };
  apiKeyBlock = { id: apiKeyId, name: apiKeyName, value: apiKey, sha256: keyHash };
}

const bootstrap = {
  version: 1,
  created_at: now,
  mode: signingOnly ? "signing-only" : "full",
  issuer: issuerBlock,
  api_key: apiKeyBlock,
  signing: {
    key_id: keyId,
    private_jwk: privateJwk,
    public_jwk: publicJwk
  },
  sql: sqlStatements
};

const absoluteOutFile = resolve(outFile);
await mkdir(dirname(absoluteOutFile), { recursive: true });
await writeFile(absoluteOutFile, `${JSON.stringify(bootstrap, null, 2)}\n`, { mode: 0o600 });

console.log(`Bootstrap file written: ${outFile}`);
console.log("");
if (signingOnly) {
  console.log("Signing-only bootstrap: no issuer/api_key rows generated.");
} else {
  console.log("Admin API key:");
  console.log(apiKey);
  console.log("");
  console.log(`Issuer public user id: ${publicUserId}`);
}
console.log(`Signing key id: ${keyId}`);
console.log("");
if (!signingOnly) {
  console.log("Next local step:");
  console.log("pnpm dev:setup");
  console.log("");
  console.log("For remote deploy, read the SQL and secrets from the bootstrap file.");
}
if (printSecrets) {
  console.log("");
  if (sqlStatements.length) {
    console.log("Remote D1 SQL:");
    console.log(sqlStatements.join("\n"));
    console.log("");
  }
  console.log("Worker secrets:");
  console.log(`SIGNING_KEY_ID=${keyId}`);
  console.log(`SIGNING_PRIVATE_JWK=${JSON.stringify(privateJwk)}`);
  console.log("");
  console.log("Android TV public JWK:");
  console.log(JSON.stringify(publicJwk, null, 2));
}
