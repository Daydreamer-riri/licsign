import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function getArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, HOME: process.env.HOME ?? "/tmp" }
  });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const bootstrapFile = resolve(getArg("bootstrap", "worker/bootstrap.local.json"));
const wranglerConfig = getArg("config", "worker/wrangler.jsonc");
const databaseName = getArg("database", "license_service");
const wranglerBin = process.platform === "win32" ? "node_modules/.bin/wrangler.cmd" : "node_modules/.bin/wrangler";

let bootstrap;
try {
  bootstrap = JSON.parse(await readFile(bootstrapFile, "utf8"));
} catch (error) {
  console.error(`Could not read ${bootstrapFile}. Run pnpm bootstrap -- --api-key=<dev-key> first.`);
  throw error;
}

if (!Array.isArray(bootstrap.sql) || !bootstrap.signing?.key_id || !bootstrap.signing?.private_jwk) {
  console.error(`${bootstrapFile} is not a valid bootstrap file.`);
  process.exit(1);
}

run(wranglerBin, ["d1", "migrations", "apply", databaseName, "--local", "--config", wranglerConfig]);

for (const statement of bootstrap.sql) {
  run(wranglerBin, [
    "d1",
    "execute",
    databaseName,
    "--local",
    "--config",
    wranglerConfig,
    "--command",
    statement
  ]);
}

await writeFile(
  "worker/.dev.vars",
  [
    `SIGNING_KEY_ID=${bootstrap.signing.key_id}`,
    `SIGNING_PRIVATE_JWK=${JSON.stringify(bootstrap.signing.private_jwk)}`,
    "LICENSE_ISSUER=licsign-dev",
    "CORS_ORIGIN=*",
    ""
  ].join("\n"),
  { mode: 0o600 }
);

console.log("");
console.log("Local dev setup complete.");
console.log(`Admin API key: ${bootstrap.api_key.value}`);
console.log(`Public user id: ${bootstrap.issuer.public_user_id}`);
console.log("Start the Worker with: pnpm dev");
