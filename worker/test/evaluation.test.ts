import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index";
import { issueEvaluation } from "../src/services/evaluation";
import type { SignedLicenseResponse } from "../../shared/src/types";
import type { EvaluationActivationRow, ProductRow } from "../src/db/models";
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
    if (sql.startsWith("SELECT * FROM evaluation_activations WHERE product_id = ? AND machine_hash = ?")) {
      return (
        (this.db.evaluationActivations.find(
          (r) => r.product_id === this.args[0] && r.machine_hash === this.args[1]
        ) as T | undefined) ?? null
      );
    }
    throw new Error(`unhandled first(): ${sql}`);
  }

  async run() {
    const sql = this.sql.trim();
    if (sql.startsWith("INSERT INTO evaluation_activations")) {
      if (this.db.insertConflictRow) {
        this.db.evaluationActivations.push(this.db.insertConflictRow);
        this.db.insertConflictRow = null;
        throw new Error("UNIQUE constraint failed: evaluation_activations.product_id, evaluation_activations.machine_hash");
      }
      const [id, issuer_id, product_id, machine_hash, first_issued_at, expires_at] =
        this.args as [string, string, string, string, string, string];
      this.db.evaluationActivations.push({ id, issuer_id, product_id, machine_hash, first_issued_at, expires_at });
      return { success: true } as never;
    }
    if (sql.startsWith("INSERT INTO audit_logs")) {
      const [, , , , action, , target_id, details_json] = this.args as [
        string, string | null, string, string | null, string, string, string | null, string | null, string
      ];
      this.db.auditLogs.push({ action, target_id, details_json });
      return { success: true } as never;
    }
    throw new Error(`unhandled run(): ${sql}`);
  }

  async all<T>() {
    throw new Error(`unhandled all(): ${this.sql}`);
    return { results: [] as T[] };
  }
}

class FakeDB {
  products: ProductRow[] = [];
  evaluationActivations: EvaluationActivationRow[] = [];
  auditLogs: AuditLogRow[] = [];
  paidActivations: string[] = [];
  trialActivations: string[] = [];
  insertConflictRow: EvaluationActivationRow | null = null;

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
    trial_enabled: 0,
    trial_start_at: null,
    trial_end_at: null,
    trial_token_ttl_seconds: null,
    evaluation_enabled: 1,
    evaluation_token_ttl_days: 7,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

const MACHINE_HASH = "a".repeat(64);

describe("POST /api/client/evaluate", () => {
  let db: FakeDB;

  beforeEach(() => {
    db = new FakeDB();
  });

  it("returns an Evaluation token without touching paid or Promotional Trial activations", async () => {
    db.products.push(makeProduct());
    db.paidActivations.push("act_existing");
    db.trialActivations.push("tra_existing");
    const env = await makeEnv(db);

    const response = await worker.fetch(
      new Request("https://licsign.test/api/client/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product_code: "tv-app", machine_hash: MACHINE_HASH }),
      }),
      env,
      {} as ExecutionContext,
    );
    const result = await response.json() as SignedLicenseResponse;

    expect(response.status).toBe(200);
    expect(result.license.kind).toBe("evaluation");
    expect(db.paidActivations).toEqual(["act_existing"]);
    expect(db.trialActivations).toEqual(["tra_existing"]);
  });

  it("serializes Evaluation errors with their HTTP status", async () => {
    db.products.push(makeProduct({ evaluation_enabled: 0 }));
    const env = await makeEnv(db);

    const response = await worker.fetch(
      new Request("https://licsign.test/api/client/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product_code: "tv-app", machine_hash: MACHINE_HASH }),
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "EVALUATION_INACTIVE" });
  });
});

describe("issueEvaluation", () => {
  let db: FakeDB;

  beforeEach(() => {
    db = new FakeDB();
  });

  it("issues a signed token with kind=evaluation and license_id=null for first-time device", async () => {
    db.products.push(makeProduct());
    const env = await makeEnv(db);

    const result = await issueEvaluation(env, {
      product_code: "tv-app",
      machine_hash: MACHINE_HASH,
    });

    expect(result.license.kind).toBe("evaluation");
    expect(result.license.license_id).toBeNull();
    expect(result.license.product_code).toBe("tv-app");
    expect(result.license.machine_hash).toBe(MACHINE_HASH);
    expect(result.token.split(".")).toHaveLength(3);
  });

  it("JWS payload carries kind=evaluation and license_id=null", async () => {
    db.products.push(makeProduct());
    const env = await makeEnv(db);

    const result = await issueEvaluation(env, {
      product_code: "tv-app",
      machine_hash: MACHINE_HASH,
    });

    const [, payloadSegment] = result.token.split(".");
    const decoded = JSON.parse(decodeBase64UrlToString(payloadSegment!));
    expect(decoded.kind).toBe("evaluation");
    expect(decoded.license_id).toBeNull();
  });

  it("creates one evaluation_activations row on first call", async () => {
    db.products.push(makeProduct());
    const env = await makeEnv(db);

    await issueEvaluation(env, { product_code: "tv-app", machine_hash: MACHINE_HASH });

    expect(db.evaluationActivations).toHaveLength(1);
    const row = db.evaluationActivations[0]!;
    expect(row.product_id).toBe("prd_test");
    expect(row.machine_hash).toBe(MACHINE_HASH);
  });

  it("anchored expiry: second call within window returns same expires_at, fresh issued_at", async () => {
    db.products.push(makeProduct());
    const env = await makeEnv(db);

    const first = await issueEvaluation(env, { product_code: "tv-app", machine_hash: MACHINE_HASH });
    const second = await issueEvaluation(env, { product_code: "tv-app", machine_hash: MACHINE_HASH });

    expect(second.license.expires_at).toBe(first.license.expires_at);
    expect(new Date(second.license.issued_at).getTime()).toBeGreaterThanOrEqual(
      new Date(first.license.issued_at).getTime()
    );
    expect(db.evaluationActivations).toHaveLength(1);
  });

  it("uses the anchored row when a concurrent first issuance wins", async () => {
    db.products.push(makeProduct());
    const firstIssuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
    db.insertConflictRow = {
      id: "eva_race",
      issuer_id: "iss_test",
      product_id: "prd_test",
      machine_hash: MACHINE_HASH,
      first_issued_at: firstIssuedAt,
      expires_at: expiresAt,
    };
    const env = await makeEnv(db);

    const result = await issueEvaluation(env, {
      product_code: "tv-app",
      machine_hash: MACHINE_HASH,
    });

    expect(result.license.expires_at).toBe(expiresAt);
    expect(db.evaluationActivations).toHaveLength(1);
    const details = JSON.parse(db.auditLogs.at(-1)!.details_json!);
    expect(details.first_issued).toBe(false);
  });

  it("audits EVALUATION_EXPIRED when a concurrent first issuance is already expired", async () => {
    db.products.push(makeProduct());
    const expiresAt = new Date(Date.now() - 1000).toISOString();
    db.insertConflictRow = {
      id: "eva_race",
      issuer_id: "iss_test",
      product_id: "prd_test",
      machine_hash: MACHINE_HASH,
      first_issued_at: new Date(Date.now() - 8 * 86400_000).toISOString(),
      expires_at: expiresAt,
    };
    const env = await makeEnv(db);

    await expect(
      issueEvaluation(env, { product_code: "tv-app", machine_hash: MACHINE_HASH })
    ).rejects.toMatchObject({ status: 403, code: "EVALUATION_EXPIRED" });

    const log = db.auditLogs.find((entry) => entry.action === "client.evaluate_expired");
    expect(log).toBeDefined();
    expect(JSON.parse(log!.details_json!).expired_at).toBe(expiresAt);
  });

  it("rejects EVALUATION_EXPIRED when now >= stored expires_at", async () => {
    db.products.push(makeProduct());
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    db.evaluationActivations.push({
      id: "eva_1",
      issuer_id: "iss_test",
      product_id: "prd_test",
      machine_hash: MACHINE_HASH,
      first_issued_at: new Date(Date.now() - 8 * 86400_000).toISOString(),
      expires_at: pastExpiry,
    });
    const env = await makeEnv(db);

    await expect(
      issueEvaluation(env, { product_code: "tv-app", machine_hash: MACHINE_HASH })
    ).rejects.toMatchObject({ status: 403, code: "EVALUATION_EXPIRED" });
  });

  it("writes client.evaluate_expired audit log on expiry rejection", async () => {
    db.products.push(makeProduct());
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    db.evaluationActivations.push({
      id: "eva_1",
      issuer_id: "iss_test",
      product_id: "prd_test",
      machine_hash: MACHINE_HASH,
      first_issued_at: new Date(Date.now() - 8 * 86400_000).toISOString(),
      expires_at: pastExpiry,
    });
    const env = await makeEnv(db);

    await expect(
      issueEvaluation(env, { product_code: "tv-app", machine_hash: MACHINE_HASH })
    ).rejects.toBeDefined();

    expect(db.auditLogs.find((a) => a.action === "client.evaluate_expired")).toBeDefined();
    const details = JSON.parse(db.auditLogs.at(-1)!.details_json!);
    expect(details.machine_hash).toBe(MACHINE_HASH);
    expect(details.expired_at).toBe(pastExpiry);
  });

  it("rejects EVALUATION_INACTIVE when evaluation_enabled is 0", async () => {
    db.products.push(makeProduct({ evaluation_enabled: 0 }));
    const env = await makeEnv(db);

    await expect(
      issueEvaluation(env, { product_code: "tv-app", machine_hash: MACHINE_HASH })
    ).rejects.toMatchObject({ status: 403, code: "EVALUATION_INACTIVE" });
  });

  it("rejects EVALUATION_INACTIVE when evaluation_token_ttl_days is null", async () => {
    db.products.push(makeProduct({ evaluation_token_ttl_days: null }));
    const env = await makeEnv(db);

    await expect(
      issueEvaluation(env, { product_code: "tv-app", machine_hash: MACHINE_HASH })
    ).rejects.toMatchObject({ status: 403, code: "EVALUATION_INACTIVE" });
  });

  it("returns EVALUATION_INACTIVE instead of crashing for an unrepresentable TTL", async () => {
    db.products.push(makeProduct({ evaluation_token_ttl_days: Number.MAX_SAFE_INTEGER }));
    const env = await makeEnv(db);

    await expect(
      issueEvaluation(env, { product_code: "tv-app", machine_hash: MACHINE_HASH })
    ).rejects.toMatchObject({ status: 403, code: "EVALUATION_INACTIVE" });
    expect(db.evaluationActivations).toHaveLength(0);
  });

  it("returns PRODUCT_NOT_FOUND for unknown product_code", async () => {
    const env = await makeEnv(db);

    await expect(
      issueEvaluation(env, { product_code: "nope", machine_hash: MACHINE_HASH })
    ).rejects.toMatchObject({ status: 404, code: "PRODUCT_NOT_FOUND" });
  });

  it("does not check product status — archived product can be evaluated", async () => {
    db.products.push(makeProduct({ status: "archived" }));
    const env = await makeEnv(db);

    await expect(
      issueEvaluation(env, { product_code: "tv-app", machine_hash: MACHINE_HASH })
    ).resolves.toBeDefined();
  });

  it("writes client.evaluate audit log with first_issued=true on first call", async () => {
    db.products.push(makeProduct());
    const env = await makeEnv(db);

    await issueEvaluation(env, { product_code: "tv-app", machine_hash: MACHINE_HASH });

    const log = db.auditLogs.find((a) => a.action === "client.evaluate");
    expect(log).toBeDefined();
    const details = JSON.parse(log!.details_json!);
    expect(details.first_issued).toBe(true);
    expect(details.machine_hash).toBe(MACHINE_HASH);
  });

  it("writes client.evaluate audit log with first_issued=false on subsequent call", async () => {
    db.products.push(makeProduct());
    const env = await makeEnv(db);

    await issueEvaluation(env, { product_code: "tv-app", machine_hash: MACHINE_HASH });
    db.auditLogs.length = 0;
    await issueEvaluation(env, { product_code: "tv-app", machine_hash: MACHINE_HASH });

    const log = db.auditLogs.find((a) => a.action === "client.evaluate");
    expect(log).toBeDefined();
    const details = JSON.parse(log!.details_json!);
    expect(details.first_issued).toBe(false);
  });
});
