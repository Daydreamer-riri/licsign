import { beforeEach, describe, expect, it } from "vitest";
import { restoreLicense } from "../src/services/restore";
import type { ActivationRow, LicenseRow, ProductRow } from "../src/db/models";
import type { Env } from "../src/types";

interface AuditLogRow {
  action: string;
  target_type: string;
  target_id: string | null;
  details_json: string | null;
}

function cmpDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
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

    // findActiveByMachineAndProduct: activations -> licenses -> products
    if (
      sql.startsWith("SELECT") &&
      sql.includes("FROM activations") &&
      sql.includes("JOIN licenses") &&
      sql.includes("JOIN products")
    ) {
      const [machineHash, productCode] = this.args as [string, string];
      const candidates = this.db.activations
        .filter((a) => a.machine_hash === machineHash && a.status === "active")
        .map((a) => {
          const lic = this.db.licenses.find((l) => l.id === a.license_id);
          const prod = lic ? this.db.products.find((p) => p.id === lic.product_id) : undefined;
          return { activation: a, license: lic, product: prod };
        })
        .filter((row) => row.license && row.product && row.product.code === productCode);

      if (candidates.length === 0) return null;
      candidates.sort((x, y) => {
        const ls = cmpDesc(x.activation.last_seen_at ?? "", y.activation.last_seen_at ?? "");
        return ls !== 0 ? ls : cmpDesc(x.activation.activated_at, y.activation.activated_at);
      });
      const top = candidates[0]!;
      return {
        ...top.license!,
        product_code: top.product!.code,
        product_status: top.product!.status,
        product_issuer_id: top.product!.issuer_id,
        activation_id: top.activation.id,
      } as unknown as T;
    }

    throw new Error("unhandled first(): " + sql);
  }

  async all<T>() {
    throw new Error("unhandled all(): " + this.sql);
    return { results: [] as T[] };
  }

  async run() {
    const sql = this.sql.trim();

    if (sql.startsWith("UPDATE activations") && sql.includes("last_seen_at = ?") && sql.includes("COALESCE")) {
      const [lastSeen, deviceLabel, clientVersion, platform, id] = this.args as [
        string, string | null, string | null, string | null, string
      ];
      const row = this.db.activations.find((a) => a.id === id);
      if (row) {
        row.last_seen_at = lastSeen;
        if (deviceLabel !== null) row.device_label = deviceLabel;
        if (clientVersion !== null) row.client_version = clientVersion;
        if (platform !== null) row.platform = platform;
      }
      return { success: true } as never;
    }

    if (sql.startsWith("INSERT INTO audit_logs")) {
      const [, , , , action, targetType, targetId, detailsJson] = this.args as [
        string, string | null, string, string | null, string, string, string | null, string | null, string
      ];
      this.db.auditLogs.push({ action, target_type: targetType, target_id: targetId, details_json: detailsJson });
      return { success: true } as never;
    }

    throw new Error("unhandled run(): " + sql);
  }
}

class FakeDB {
  products: ProductRow[] = [];
  licenses: LicenseRow[] = [];
  activations: ActivationRow[] = [];
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
    SIGNING_KEY_ID: "kid_test",
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
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeLicense(overrides: Partial<LicenseRow> = {}): LicenseRow {
  const now = new Date().toISOString();
  return {
    id: "lic_test",
    issuer_id: "iss_test",
    product_id: "prd_test",
    batch_id: null,
    activation_code: "CODE-1234",
    status: "activated",
    max_devices: 1,
    issued_to: null,
    metadata_json: null,
    expires_at: null,
    activated_at: now,
    revoked_at: null,
    revoked_reason: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeActivation(overrides: Partial<ActivationRow> = {}): ActivationRow {
  const now = new Date().toISOString();
  return {
    id: "act_test",
    license_id: "lic_test",
    machine_hash: MACHINE_A,
    device_label: null,
    client_version: null,
    platform: null,
    status: "active",
    activated_at: now,
    deactivated_at: null,
    last_seen_at: now,
    license_payload_version: 1,
    ...overrides,
  };
}

const MACHINE_A = "a".repeat(64);

const BASE_INPUT = {
  product_code: "tv-app",
  machine_hash: MACHINE_A,
};

describe("restoreLicense", () => {
  let db: FakeDB;

  beforeEach(() => {
    db = new FakeDB();
  });

  it("restores a signed License for a device with an active activation", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense());
    db.activations.push(makeActivation());
    const env = await makeEnv(db);

    const result = await restoreLicense(env, BASE_INPUT);

    expect(result.license.license_id).toBe("lic_test");
    expect(result.license.product_code).toBe("tv-app");
    expect(result.license.machine_hash).toBe(MACHINE_A);
    expect(result.license.kind).toBeUndefined();
    expect(result.token.split(".")).toHaveLength(3);
    expect(result.signature).toBeTruthy();
  });

  it("issues a token with a fresh issued_at", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense());
    db.activations.push(makeActivation());
    const env = await makeEnv(db);

    const before = Date.now();
    const result = await restoreLicense(env, BASE_INPUT);

    expect(new Date(result.license.issued_at).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("is idempotent and creates no new activation row", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense());
    db.activations.push(makeActivation());
    const env = await makeEnv(db);

    const first = await restoreLicense(env, BASE_INPUT);
    const second = await restoreLicense(env, BASE_INPUT);

    expect(first.license.license_id).toBe(second.license.license_id);
    expect(db.activations).toHaveLength(1);
    expect(db.activations.filter((a) => a.status === "active")).toHaveLength(1);
  });

  it("updates last_seen_at on the matched activation", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    db.products.push(makeProduct());
    db.licenses.push(makeLicense());
    db.activations.push(makeActivation({ last_seen_at: past }));
    const env = await makeEnv(db);

    await restoreLicense(env, BASE_INPUT);

    expect(db.activations[0]!.last_seen_at).not.toBe(past);
  });

  it("rejects with NO_ACTIVATION when the device has no activation", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense());
    const env = await makeEnv(db);

    await expect(restoreLicense(env, BASE_INPUT)).rejects.toMatchObject({
      status: 404,
      code: "NO_ACTIVATION",
    });
  });

  it("rejects with NO_ACTIVATION when the device only has a deactivated activation", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense());
    db.activations.push(makeActivation({ status: "deactivated", deactivated_at: new Date().toISOString() }));
    const env = await makeEnv(db);

    await expect(restoreLicense(env, BASE_INPUT)).rejects.toMatchObject({
      status: 404,
      code: "NO_ACTIVATION",
    });
  });

  it("rejects with PRODUCT_NOT_FOUND for an unknown product", async () => {
    const env = await makeEnv(db);

    await expect(restoreLicense(env, BASE_INPUT)).rejects.toMatchObject({
      status: 404,
      code: "PRODUCT_NOT_FOUND",
    });
  });

  it("rejects with PRODUCT_MISMATCH when the product is archived", async () => {
    db.products.push(makeProduct({ status: "archived" }));
    db.licenses.push(makeLicense());
    db.activations.push(makeActivation());
    const env = await makeEnv(db);

    await expect(restoreLicense(env, BASE_INPUT)).rejects.toMatchObject({
      status: 409,
      code: "PRODUCT_MISMATCH",
    });
  });

  it("rejects with LICENSE_DISABLED when the license is disabled", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "disabled" }));
    db.activations.push(makeActivation());
    const env = await makeEnv(db);

    await expect(restoreLicense(env, BASE_INPUT)).rejects.toMatchObject({
      status: 403,
      code: "LICENSE_DISABLED",
    });
  });

  it("rejects with LICENSE_REVOKED when the license is revoked", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "revoked" }));
    db.activations.push(makeActivation());
    const env = await makeEnv(db);

    await expect(restoreLicense(env, BASE_INPUT)).rejects.toMatchObject({
      status: 403,
      code: "LICENSE_REVOKED",
    });
  });

  it("rejects with LICENSE_EXPIRED when the license is expired", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ expires_at: new Date(Date.now() - 60_000).toISOString() }));
    db.activations.push(makeActivation());
    const env = await makeEnv(db);

    await expect(restoreLicense(env, BASE_INPUT)).rejects.toMatchObject({
      status: 403,
      code: "LICENSE_EXPIRED",
    });
  });

  it("picks the most recently used activation when several match", async () => {
    const older = new Date(Date.now() - 60_000).toISOString();
    const newer = new Date(Date.now() - 1_000).toISOString();
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ id: "lic_old" }));
    db.licenses.push(makeLicense({ id: "lic_new", activation_code: "CODE-5678" }));
    db.activations.push(
      makeActivation({ id: "act_old", license_id: "lic_old", last_seen_at: older }),
    );
    db.activations.push(
      makeActivation({ id: "act_new", license_id: "lic_new", last_seen_at: newer }),
    );
    const env = await makeEnv(db);

    const result = await restoreLicense(env, BASE_INPUT);

    expect(result.license.license_id).toBe("lic_new");
  });

  it("writes a client.restore audit log on success", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense());
    db.activations.push(makeActivation());
    const env = await makeEnv(db);

    await restoreLicense(env, BASE_INPUT);

    const entry = db.auditLogs.find((a) => a.action === "client.restore");
    expect(entry).toBeDefined();
    expect(entry!.target_type).toBe("license");
    expect(entry!.target_id).toBe("lic_test");
    const details = JSON.parse(entry!.details_json!);
    expect(details.product_code).toBe("tv-app");
    expect(details.machine_hash).toBe(MACHINE_A);
    expect(details.license_id).toBe("lic_test");
  });

  it("writes a client.restore_failed audit log on NO_ACTIVATION", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense());
    const env = await makeEnv(db);

    await expect(restoreLicense(env, BASE_INPUT)).rejects.toMatchObject({ code: "NO_ACTIVATION" });

    const entry = db.auditLogs.find((a) => a.action === "client.restore_failed");
    expect(entry).toBeDefined();
    expect(entry!.target_type).toBe("product");
    expect(entry!.target_id).toBe("prd_test");
    const details = JSON.parse(entry!.details_json!);
    expect(details.reason).toBe("NO_ACTIVATION");
    expect(details.machine_hash).toBe(MACHINE_A);
  });

  it("does not write a success audit log when restore fails", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "disabled" }));
    db.activations.push(makeActivation());
    const env = await makeEnv(db);

    await expect(restoreLicense(env, BASE_INPUT)).rejects.toMatchObject({ code: "LICENSE_DISABLED" });
    expect(db.auditLogs.find((a) => a.action === "client.restore")).toBeUndefined();
  });

  it("rejects a malformed machine_hash via zod", async () => {
    db.products.push(makeProduct());
    const env = await makeEnv(db);

    await expect(
      restoreLicense(env, { product_code: "tv-app", machine_hash: "not-a-hash" }),
    ).rejects.toBeDefined();
  });

  it("rejects a missing product_code via zod", async () => {
    const env = await makeEnv(db);

    await expect(restoreLicense(env, { machine_hash: MACHINE_A })).rejects.toBeDefined();
  });

  it("does not match a device's activation that belongs to a different product", async () => {
    // The device (MACHINE_A) is active on "other-app", but restore asks for "tv-app".
    db.products.push(makeProduct());
    db.products.push(makeProduct({ id: "prd_other", code: "other-app" }));
    db.licenses.push(makeLicense({ id: "lic_other", product_id: "prd_other" }));
    db.activations.push(makeActivation({ license_id: "lic_other" }));
    const env = await makeEnv(db);

    await expect(restoreLicense(env, BASE_INPUT)).rejects.toMatchObject({
      code: "NO_ACTIVATION",
    });
  });
});
