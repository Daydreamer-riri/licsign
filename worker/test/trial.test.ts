import { beforeEach, describe, expect, it } from "vitest";
import { issueTrial } from "../src/services/trial";
import type { ProductRow, TrialActivationRow } from "../src/db/models";
import type { Env } from "../src/types";
import { decodeBase64UrlToString } from "../src/utils/base64url";

interface AuditLogRow {
  action: string;
  target_id: string | null;
  details_json: string | null;
}

class FakeStatement {
  private args: unknown[] = [];
  constructor(private readonly sql: string, private readonly db: FakeDB) {}

  bind(...args: unknown[]): this {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const sql = this.sql.trim();
    if (sql.startsWith("SELECT * FROM products WHERE code = ?")) {
      return (this.db.products.find((p) => p.code === this.args[0]) as T | undefined) ?? null;
    }
    if (sql.startsWith("SELECT * FROM trial_activations WHERE product_id = ? AND machine_hash = ?")) {
      return (
        (this.db.trialActivations.find(
          (t) => t.product_id === this.args[0] && t.machine_hash === this.args[1]
        ) as T | undefined) ?? null
      );
    }
    throw new Error(`unhandled first(): ${sql}`);
  }

  async all<T>() {
    throw new Error(`unhandled all(): ${this.sql}`);
    return { results: [] as T[] };
  }

  async run() {
    const sql = this.sql.trim();
    if (sql.startsWith("INSERT INTO trial_activations")) {
      const [
        id,
        issuer_id,
        product_id,
        machine_hash,
        device_label,
        client_version,
        platform,
        first_seen_at,
        last_seen_at,
        last_token_expires_at
      ] = this.args as [string, string, string, string, string | null, string | null, string | null, string, string, string];
      this.db.trialActivations.push({
        id,
        issuer_id,
        product_id,
        machine_hash,
        device_label,
        client_version,
        platform,
        first_seen_at,
        last_seen_at,
        last_token_expires_at,
        token_count: 1
      });
      return { success: true } as never;
    }
    if (sql.startsWith("UPDATE trial_activations")) {
      const [last_seen_at, last_token_expires_at, device_label, client_version, platform, id] = this.args as [
        string,
        string,
        string | null,
        string | null,
        string | null,
        string
      ];
      const row = this.db.trialActivations.find((t) => t.id === id);
      if (row) {
        row.last_seen_at = last_seen_at;
        row.last_token_expires_at = last_token_expires_at;
        row.token_count += 1;
        if (device_label !== null) row.device_label = device_label;
        if (client_version !== null) row.client_version = client_version;
        if (platform !== null) row.platform = platform;
      }
      return { success: true } as never;
    }
    if (sql.startsWith("INSERT INTO audit_logs")) {
      const [, , , , action, , target_id, details_json] = this.args as [
        string,
        string | null,
        string,
        string | null,
        string,
        string,
        string | null,
        string | null,
        string
      ];
      this.db.auditLogs.push({ action, target_id, details_json });
      return { success: true } as never;
    }
    throw new Error(`unhandled run(): ${sql}`);
  }
}

class FakeDB {
  products: ProductRow[] = [];
  trialActivations: TrialActivationRow[] = [];
  auditLogs: AuditLogRow[] = [];

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql, this);
  }
}

async function makeEnv(db: FakeDB): Promise<Env> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  return {
    DB: db as unknown as D1Database,
    LICENSE_ISSUER: "Acme",
    SIGNING_PRIVATE_JWK: JSON.stringify(privateJwk),
    SIGNING_KEY_ID: "kid_test"
  };
}

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  const now = new Date().toISOString();
  return {
    id: "prd_test",
    issuer_id: "iss_test",
    code: "tv-app",
    name: "TV App",
    description: "",
    status: "active",
    default_max_devices: 1,
    trial_enabled: 1,
    trial_start_at: new Date(Date.now() - 60_000).toISOString(),
    trial_end_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    trial_token_ttl_seconds: 7 * 24 * 60 * 60,
    created_at: now,
    updated_at: now,
    ...overrides
  };
}

const MACHINE_HASH_A = "a".repeat(64);
const MACHINE_HASH_B = "b".repeat(64);

describe("issueTrial", () => {
  let db: FakeDB;

  beforeEach(() => {
    db = new FakeDB();
  });

  it("issues a signed trial token in window and records first_seen activation", async () => {
    db.products.push(makeProduct());
    const env = await makeEnv(db);

    const result = await issueTrial(env, {
      product_code: "tv-app",
      machine_hash: MACHINE_HASH_A,
      platform: "android-tv"
    });

    expect(result.license.kind).toBe("trial");
    expect(result.license.license_id).toBeNull();
    expect(result.license.product_code).toBe("tv-app");
    expect(result.license.machine_hash).toBe(MACHINE_HASH_A);
    expect(result.token.split(".")).toHaveLength(3);

    const ttlMs = (7 * 24 * 60 * 60) * 1000;
    const drift = Math.abs(
      new Date(result.license.expires_at!).getTime() -
        new Date(result.license.issued_at).getTime() -
        ttlMs
    );
    expect(drift).toBeLessThan(2_000);

    expect(db.trialActivations).toHaveLength(1);
    expect(db.trialActivations[0]!.token_count).toBe(1);

    expect(db.auditLogs.find((a) => a.action === "client.trial")).toBeDefined();
    const details = JSON.parse(db.auditLogs.at(-1)!.details_json!);
    expect(details.first_seen).toBe(true);
  });

  it("is idempotent for same machine_hash, incrementing token_count", async () => {
    db.products.push(makeProduct());
    const env = await makeEnv(db);

    await issueTrial(env, { product_code: "tv-app", machine_hash: MACHINE_HASH_A });
    await issueTrial(env, { product_code: "tv-app", machine_hash: MACHINE_HASH_A });
    await issueTrial(env, { product_code: "tv-app", machine_hash: MACHINE_HASH_A });

    expect(db.trialActivations).toHaveLength(1);
    expect(db.trialActivations[0]!.token_count).toBe(3);

    const trialAudits = db.auditLogs.filter((a) => a.action === "client.trial");
    expect(trialAudits).toHaveLength(3);
    const lastDetails = JSON.parse(trialAudits.at(-1)!.details_json!);
    expect(lastDetails.first_seen).toBe(false);
  });

  it("creates separate rows for different machine_hash", async () => {
    db.products.push(makeProduct());
    const env = await makeEnv(db);

    await issueTrial(env, { product_code: "tv-app", machine_hash: MACHINE_HASH_A });
    await issueTrial(env, { product_code: "tv-app", machine_hash: MACHINE_HASH_B });

    expect(db.trialActivations).toHaveLength(2);
    expect(db.trialActivations.map((r) => r.machine_hash).sort()).toEqual([
      MACHINE_HASH_A,
      MACHINE_HASH_B
    ]);
  });

  it("rejects when trial is disabled on the product", async () => {
    db.products.push(makeProduct({ trial_enabled: 0 }));
    const env = await makeEnv(db);

    await expect(
      issueTrial(env, { product_code: "tv-app", machine_hash: MACHINE_HASH_A })
    ).rejects.toMatchObject({ status: 403, code: "TRIAL_INACTIVE" });
  });

  it("rejects when current time is before trial_start_at", async () => {
    db.products.push(
      makeProduct({
        trial_start_at: new Date(Date.now() + 60_000).toISOString(),
        trial_end_at: new Date(Date.now() + 120_000).toISOString()
      })
    );
    const env = await makeEnv(db);

    await expect(
      issueTrial(env, { product_code: "tv-app", machine_hash: MACHINE_HASH_A })
    ).rejects.toMatchObject({ status: 403, code: "TRIAL_INACTIVE" });
  });

  it("rejects when current time is after trial_end_at", async () => {
    db.products.push(
      makeProduct({
        trial_start_at: new Date(Date.now() - 120_000).toISOString(),
        trial_end_at: new Date(Date.now() - 60_000).toISOString()
      })
    );
    const env = await makeEnv(db);

    await expect(
      issueTrial(env, { product_code: "tv-app", machine_hash: MACHINE_HASH_A })
    ).rejects.toMatchObject({ status: 403, code: "TRIAL_INACTIVE" });
  });

  it("returns PRODUCT_NOT_FOUND when product does not exist", async () => {
    const env = await makeEnv(db);

    await expect(
      issueTrial(env, { product_code: "nope", machine_hash: MACHINE_HASH_A })
    ).rejects.toMatchObject({ status: 404, code: "PRODUCT_NOT_FOUND" });
  });

  it("returns PRODUCT_NOT_FOUND when product is archived", async () => {
    db.products.push(makeProduct({ status: "archived" }));
    const env = await makeEnv(db);

    await expect(
      issueTrial(env, { product_code: "tv-app", machine_hash: MACHINE_HASH_A })
    ).rejects.toMatchObject({ status: 404, code: "PRODUCT_NOT_FOUND" });
  });

  it("rejects malformed machine_hash via zod", async () => {
    db.products.push(makeProduct());
    const env = await makeEnv(db);

    await expect(
      issueTrial(env, { product_code: "tv-app", machine_hash: "not-a-hash" })
    ).rejects.toBeDefined();
  });

  it("emits a payload whose kind=trial is visible in the JWS payload segment", async () => {
    db.products.push(makeProduct());
    const env = await makeEnv(db);

    const result = await issueTrial(env, {
      product_code: "tv-app",
      machine_hash: MACHINE_HASH_A
    });
    const [, payloadSegment] = result.token.split(".");
    const decoded = JSON.parse(decodeBase64UrlToString(payloadSegment!));
    expect(decoded.kind).toBe("trial");
    expect(decoded.license_id).toBeNull();
  });
});
