import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function getArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const wranglerBin = process.platform === "win32" ? "node_modules/.bin/wrangler.cmd" : "node_modules/.bin/wrangler";
// HOME=/tmp is a workaround for wrangler insisting on writing config under $HOME on
// machines where the real HOME directory is not writable in this shell. Harmless when
// $HOME is already set.
const env = { ...process.env, HOME: process.env.HOME ?? "/tmp" };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
    ...options
  });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env,
    encoding: "utf8"
  });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    if (result.stderr) console.error(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? "";
}

function runWithStdin(command, args, input) {
  const result = spawnSync(command, args, {
    stdio: ["pipe", "inherit", "inherit"],
    env,
    input
  });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

function parseWranglerJson(stdout) {
  // wrangler d1 execute --json prints a JSON array of result objects. Older versions
  // may emit log lines before the JSON; locate the first '[' and parse from there.
  const start = stdout.indexOf("[");
  if (start === -1) return [];
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return [];
  }
}

function issuerExists(databaseName, wranglerConfig, publicUserId) {
  const stdout = runCapture(wranglerBin, [
    "d1",
    "execute",
    databaseName,
    "--remote",
    "--config",
    wranglerConfig,
    "--json",
    "--command",
    `SELECT id FROM issuers WHERE public_user_id = '${sqlEscape(publicUserId)}' LIMIT 1;`
  ]);
  const payload = parseWranglerJson(stdout);
  const rows = payload?.[0]?.results ?? [];
  return rows.length > 0;
}

const apiKey = getArg("api-key");
const issuerName = getArg("issuer-name");
const publicUserId = getArg("public-user-id", "default");
const adminEmail = getArg("admin-email");
const adminPassword = getArg("admin-password");
const bootstrapFile = resolve(getArg("bootstrap", "worker/bootstrap.remote.json"));
const wranglerConfig = "worker/wrangler.jsonc";
const databaseName = "license_service";

console.log("> Applying D1 migrations to remote");
run(wranglerBin, ["d1", "migrations", "apply", databaseName, "--remote", "--config", wranglerConfig]);

console.log(`\n> Checking whether issuer '${publicUserId}' already exists on remote D1`);
const alreadySeeded = issuerExists(databaseName, wranglerConfig, publicUserId);

if (alreadySeeded) {
  console.log(`Issuer '${publicUserId}' already exists. Switching to signing-only mode (rotate signing keys, keep existing issuer + api_key).`);
} else {
  // First-time setup must provision the admin login too, otherwise bootstrap.mjs would
  // silently fall back to its 'admin'/'password' defaults and ship a weak account to prod.
  const missing = [];
  if (!apiKey) missing.push("--api-key=<admin-api-key>");
  if (!adminEmail) missing.push("--admin-email=<admin-login-email>");
  if (!adminPassword) missing.push("--admin-password=<admin-login-password>");
  if (missing.length) {
    console.error(
      `First-time setup requires ${missing.join(", ")}.\n` +
      "Usage: pnpm setup:remote -- --api-key=<admin-api-key> --admin-email=<email> --admin-password=<password> [--issuer-name=...] [--public-user-id=...] [--bootstrap=worker/bootstrap.remote.json]"
    );
    process.exit(1);
  }
}

const bootstrapArgs = ["worker/scripts/bootstrap.mjs", `--out=${bootstrapFile}`, `--public-user-id=${publicUserId}`];
if (alreadySeeded) {
  bootstrapArgs.push("--signing-only=true");
} else {
  bootstrapArgs.push(`--api-key=${apiKey}`);
  if (issuerName) bootstrapArgs.push(`--issuer-name=${issuerName}`);
  bootstrapArgs.push(`--admin-email=${adminEmail}`);
  bootstrapArgs.push(`--admin-password=${adminPassword}`);
}

console.log("\n> Generating bootstrap material");
run(process.execPath, bootstrapArgs);

let bootstrap;
try {
  bootstrap = JSON.parse(await readFile(bootstrapFile, "utf8"));
} catch (error) {
  console.error(`Could not read ${bootstrapFile} after bootstrap.`);
  throw error;
}

if (!bootstrap.signing?.key_id || !bootstrap.signing?.private_jwk) {
  console.error(`${bootstrapFile} is not a valid bootstrap file.`);
  process.exit(1);
}

if (!alreadySeeded) {
  if (!Array.isArray(bootstrap.sql) || bootstrap.sql.length === 0) {
    console.error("Expected SQL statements for first-time setup but bootstrap produced none.");
    process.exit(1);
  }
  console.log("\n> Inserting issuer and api_key rows on remote D1");
  // wrangler d1 execute --command runs every semicolon-separated statement in a single
  // batch, so we send all bootstrap inserts at once instead of paying the wrangler
  // cold-start cost per row.
  run(wranglerBin, [
    "d1",
    "execute",
    databaseName,
    "--remote",
    "--config",
    wranglerConfig,
    "--command",
    bootstrap.sql.join("\n")
  ]);
}

console.log("\n> Uploading SIGNING_KEY_ID");
runWithStdin(
  wranglerBin,
  ["secret", "put", "SIGNING_KEY_ID", "--config", wranglerConfig],
  bootstrap.signing.key_id
);

console.log("\n> Uploading SIGNING_PRIVATE_JWK");
runWithStdin(
  wranglerBin,
  ["secret", "put", "SIGNING_PRIVATE_JWK", "--config", wranglerConfig],
  JSON.stringify(bootstrap.signing.private_jwk)
);

console.log("\nRemote setup complete.");
console.log("");
if (alreadySeeded) {
  console.log(`Issuer '${publicUserId}' was already present; existing admin API key remains valid.`);
  console.log("Signing keys have been rotated. Re-deploy clients with the new public JWK before previously signed");
  console.log("licenses expire, since older signatures will no longer verify against the new key.");
} else {
  console.log(`Admin API key:    ${bootstrap.api_key.value}`);
  console.log(`Public user id:   ${bootstrap.issuer.public_user_id}`);
  if (bootstrap.admin) {
    console.log(`Admin login:      ${bootstrap.admin.email}`);
  }
}
console.log(`Signing key id:   ${bootstrap.signing.key_id}`);
console.log("");
console.log("Public JWK for the Android TV verifier:");
console.log(JSON.stringify(bootstrap.signing.public_jwk, null, 2));
console.log("");
console.log("Next: pnpm deploy");
