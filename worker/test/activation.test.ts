import { beforeEach, describe, expect, it, vi } from "vitest";
import { activate, deactivate } from "../src/services/activation";
import { deactivateManagedDevice, listActiveDevices } from "../src/services/deviceManagement";
import type { ActivationRow, LicenseRow, ProductRow } from "../src/db/models";
import type { LicenseStatus, ProductStatus } from "../../shared/src/types";
import type { Env } from "../src/types";
import worker from "../src/index";

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

    if (sql.startsWith("SELECT") && sql.includes("FROM licenses") && sql.includes("JOIN products")) {
      const code = this.args[0] as string;
      const lic = this.db.licenses.find((l) => l.activation_code === code);
      if (!lic) return null;
      const prod = this.db.products.find((p) => p.id === lic.product_id);
      if (!prod) return null;
      return {
        ...lic,
        product_code: prod.code,
        product_name: prod.name,
        product_status: prod.status,
        product_issuer_id: prod.issuer_id,
      } as unknown as T;
    }

    if (sql.startsWith("SELECT id, status FROM activations")) {
      const [licenseId, machineHash] = this.args as [string, string];
      const act = this.db.activations.find(
        (a) => a.license_id === licenseId && a.machine_hash === machineHash
      );
      if (!act) return null;
      return { id: act.id, status: act.status } as unknown as T;
    }

    if (sql.startsWith("SELECT COUNT(*)")) {
      const licenseId = this.args[0] as string;
      const count = this.db.activations.filter(
        (a) => a.license_id === licenseId && a.status === "active"
      ).length;
      return { count } as unknown as T;
    }

    throw new Error("unhandled first(): " + sql);
  }

  async all<T>() {
    const sql = this.sql.trim();

    if (sql.includes("FROM activations") && sql.includes("status = 'active'")) {
      const licenseId = this.args[0] as string;
      const results = this.db.activations
        .filter((activation) => activation.license_id === licenseId && activation.status === "active")
        .sort((left, right) => right.activated_at.localeCompare(left.activated_at));
      return { results: results as unknown as T[] };
    }

    throw new Error("unhandled all(): " + this.sql);
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

    if (
      sql.startsWith("UPDATE activations") &&
      sql.includes("status = 'deactivated'") &&
      sql.includes("AND id = ?")
    ) {
      const [deactivatedAt, lastSeen, licenseId, activationId] = this.args as [
        string, string, string, string
      ];
      const row = this.db.activations.find(
        (a) => a.license_id === licenseId && a.id === activationId && a.status === "active"
      );
      if (row) {
        row.status = "deactivated";
        row.deactivated_at = deactivatedAt;
        row.last_seen_at = lastSeen;
      }
      return { success: true, meta: { changes: row ? 1 : 0 } } as never;
    }

    if (sql.startsWith("UPDATE activations") && sql.includes("status = 'deactivated'")) {
      const [deactivatedAt, lastSeen, licenseId, machineHash] = this.args as [
        string, string, string, string
      ];
      const row = this.db.activations.find(
        (a) => a.license_id === licenseId && a.machine_hash === machineHash && a.status === "active"
      );
      if (row) {
        row.status = "deactivated";
        row.deactivated_at = deactivatedAt;
        row.last_seen_at = lastSeen;
      }
      return { success: true } as never;
    }

    if (sql.startsWith("UPDATE activations") && sql.includes("status = 'active'")) {
      const [activatedAt, lastSeen, deviceLabel, clientVersion, platform, id] = this.args as [
        string, string, string | null, string | null, string | null, string
      ];
      const row = this.db.activations.find((a) => a.id === id);
      if (row) {
        row.status = "active";
        row.activated_at = activatedAt;
        row.deactivated_at = null;
        row.last_seen_at = lastSeen;
        row.device_label = deviceLabel;
        row.client_version = clientVersion;
        row.platform = platform;
        row.license_payload_version = 1;
      }
      return { success: true } as never;
    }

    if (sql.startsWith("INSERT INTO activations")) {
      const [id, licenseId, machineHash, deviceLabel, clientVersion, platform, activatedAt, lastSeen] =
        this.args as [string, string, string, string | null, string | null, string | null, string, string];
      this.db.activations.push({
        id,
        license_id: licenseId,
        machine_hash: machineHash,
        device_label: deviceLabel,
        client_version: clientVersion,
        platform: platform,
        status: "active",
        activated_at: activatedAt,
        deactivated_at: null,
        last_seen_at: lastSeen,
        license_payload_version: 1,
      });
      return { success: true } as never;
    }

    if (sql.startsWith("UPDATE licenses") && sql.includes("SET status = 'activated'")) {
      const [now, computedExpiresAt, updatedAt, id] = this.args as [
        string, string | null, string, string
      ];
      const lic = this.db.licenses.find((l) => l.id === id);
      if (lic) {
        lic.status = "activated";
        if (!lic.activated_at) lic.activated_at = now;
        if (!lic.expires_at) lic.expires_at = computedExpiresAt;
        lic.updated_at = updatedAt;
      }
      return { success: true } as never;
    }

    if (sql.startsWith("INSERT INTO audit_logs")) {
      const [, , , , action, , targetId, detailsJson] = this.args as [
        string, string | null, string, string | null, string, string, string | null, string | null, string
      ];
      this.db.auditLogs.push({ action, target_id: targetId, details_json: detailsJson });
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
    evaluation_enabled: 0,
    evaluation_token_ttl_days: null,
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
    status: "available",
    max_devices: 1,
    issued_to: null,
    metadata_json: null,
    expires_at: null,
    validity_duration_seconds: null,
    activated_at: null,
    revoked_at: null,
    revoked_reason: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

const MACHINE_A = "a".repeat(64);
const MACHINE_B = "b".repeat(64);
const MACHINE_C = "c".repeat(64);
const MACHINE_D = "d".repeat(64);

const BASE_INPUT = {
  product_code: "tv-app",
  activation_code: "CODE-1234",
  machine_hash: MACHINE_A,
};

describe("activate", () => {
  let db: FakeDB;

  beforeEach(() => {
    db = new FakeDB();
  });

  it("creates a new activation for an available license", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense());
    const env = await makeEnv(db);

    const result = await activate(env, BASE_INPUT);

    expect(result.license.license_id).toBe("lic_test");
    expect(result.license.product_code).toBe("tv-app");
    expect(result.license.machine_hash).toBe(MACHINE_A);
    expect(result.token.split(".")).toHaveLength(3);
    expect(result.signature).toBeTruthy();

    expect(db.activations).toHaveLength(1);
    expect(db.activations[0]!.status).toBe("active");
    expect(db.activations[0]!.machine_hash).toBe(MACHINE_A);

    expect(db.licenses[0]!.status).toBe("activated");
  });

  it("re-activating same device updates last_seen_at without creating a new row", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "activated" }));
    const now = new Date(Date.now() - 5_000).toISOString();
    db.activations.push({
      id: "act_existing",
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
    });
    const env = await makeEnv(db);

    const result = await activate(env, BASE_INPUT);

    expect(result.token.split(".")).toHaveLength(3);
    expect(db.activations).toHaveLength(1);
    expect(db.activations[0]!.last_seen_at).not.toBe(now);
  });

  it("reactivates a previously deactivated device", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "activated" }));
    const past = new Date(Date.now() - 60_000).toISOString();
    db.activations.push({
      id: "act_deact",
      license_id: "lic_test",
      machine_hash: MACHINE_A,
      device_label: null,
      client_version: null,
      platform: null,
      status: "deactivated",
      activated_at: past,
      deactivated_at: past,
      last_seen_at: past,
      license_payload_version: 1,
    });
    const env = await makeEnv(db);

    const result = await activate(env, BASE_INPUT);

    expect(result.token.split(".")).toHaveLength(3);
    expect(db.activations).toHaveLength(1);
    expect(db.activations[0]!.status).toBe("active");
    expect(db.activations[0]!.deactivated_at).toBeNull();
  });

  it("rejects with INVALID_CODE when activation_code not found", async () => {
    const env = await makeEnv(db);
    await expect(activate(env, BASE_INPUT)).rejects.toMatchObject({
      status: 404,
      code: "INVALID_CODE",
    });
  });

  it("rejects with LICENSE_DISABLED when license is disabled", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "disabled" }));
    const env = await makeEnv(db);
    await expect(activate(env, BASE_INPUT)).rejects.toMatchObject({
      status: 403,
      code: "LICENSE_DISABLED",
    });
  });

  it("rejects with LICENSE_REVOKED when license is revoked", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "revoked" }));
    const env = await makeEnv(db);
    await expect(activate(env, BASE_INPUT)).rejects.toMatchObject({
      status: 403,
      code: "LICENSE_REVOKED",
    });
  });

  it("rejects with LICENSE_EXPIRED when license is expired", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ expires_at: new Date(Date.now() - 60_000).toISOString() }));
    const env = await makeEnv(db);
    await expect(activate(env, BASE_INPUT)).rejects.toMatchObject({
      status: 403,
      code: "LICENSE_EXPIRED",
    });
  });

  it("rejects with PRODUCT_MISMATCH when product_code does not match", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense());
    const env = await makeEnv(db);
    await expect(
      activate(env, { ...BASE_INPUT, product_code: "wrong-product" })
    ).rejects.toMatchObject({ status: 409, code: "PRODUCT_MISMATCH" });
  });

  it("rejects with PRODUCT_MISMATCH when product is archived", async () => {
    db.products.push(makeProduct({ status: "archived" }));
    db.licenses.push(makeLicense());
    const env = await makeEnv(db);
    await expect(activate(env, BASE_INPUT)).rejects.toMatchObject({
      status: 409,
      code: "PRODUCT_MISMATCH",
    });
  });

  it("rejects second device when max_devices=1", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "activated" }));
    const now = new Date().toISOString();
    db.activations.push({
      id: "act_a",
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
    });
    const env = await makeEnv(db);
    await expect(
      activate(env, { ...BASE_INPUT, machine_hash: MACHINE_B })
    ).rejects.toMatchObject({ status: 409, code: "DEVICE_LIMIT_REACHED" });
  });

  it("same device does not consume extra slot", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "activated" }));
    const now = new Date().toISOString();
    db.activations.push({
      id: "act_a",
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
    });
    const env = await makeEnv(db);
    const result = await activate(env, BASE_INPUT);
    expect(result.token.split(".")).toHaveLength(3);
    expect(db.activations).toHaveLength(1);
  });

  it("deactivating a device frees the slot for a new one", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "activated" }));
    const now = new Date().toISOString();
    db.activations.push({
      id: "act_a",
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
    });
    const env = await makeEnv(db);

    await deactivate(env, {
      product_code: "tv-app",
      activation_code: "CODE-1234",
      machine_hash: MACHINE_A,
    });
    expect(db.activations[0]!.status).toBe("deactivated");

    const result = await activate(env, { ...BASE_INPUT, machine_hash: MACHINE_B });
    expect(result.token.split(".")).toHaveLength(3);
    expect(db.activations).toHaveLength(2);
    expect(db.activations[1]!.machine_hash).toBe(MACHINE_B);
  });

  it("allows max_devices=3 then rejects the fourth", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ max_devices: 3 }));
    const env = await makeEnv(db);

    await activate(env, { ...BASE_INPUT, machine_hash: MACHINE_A });
    await activate(env, { ...BASE_INPUT, machine_hash: MACHINE_B });
    await activate(env, { ...BASE_INPUT, machine_hash: MACHINE_C });

    expect(db.activations).toHaveLength(3);

    await expect(
      activate(env, { ...BASE_INPUT, machine_hash: MACHINE_D })
    ).rejects.toMatchObject({ status: 409, code: "DEVICE_LIMIT_REACHED" });
  });

  it("writes client.activate audit log", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense());
    const env = await makeEnv(db);

    await activate(env, BASE_INPUT);

    const entry = db.auditLogs.find((a) => a.action === "client.activate");
    expect(entry).toBeDefined();
    expect(entry!.target_id).toBe("lic_test");
    const details = JSON.parse(entry!.details_json!);
    expect(details.product_code).toBe("tv-app");
    expect(details.machine_hash).toBe(MACHINE_A);
  });

  it("materializes expires_at on first activation when validity_duration_seconds is set", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ validity_duration_seconds: 86400 }));
    const env = await makeEnv(db);

    const before = Date.now();
    const result = await activate(env, BASE_INPUT);
    const after = Date.now();

    const lic = db.licenses[0]!;
    expect(lic.status).toBe("activated");
    expect(lic.activated_at).not.toBeNull();
    expect(lic.expires_at).not.toBeNull();

    const expiresMs = Date.parse(lic.expires_at!);
    expect(expiresMs - before).toBeGreaterThanOrEqual(86400 * 1000);
    expect(expiresMs - after).toBeLessThanOrEqual(86400 * 1000);

    expect(result.license.expires_at).toBe(lic.expires_at);

    const audit = db.auditLogs.find((a) => a.action === "client.activate");
    const details = JSON.parse(audit!.details_json!);
    expect(details.validity_duration_seconds).toBe(86400);
    expect(details.computed_expires_at).toBe(lic.expires_at);
  });

  it("does not re-anchor expires_at on subsequent activations under max_devices>1", async () => {
    db.products.push(makeProduct());
    const initialExpiry = new Date(Date.now() + 86400 * 1000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    db.licenses.push(
      makeLicense({
        status: "activated",
        max_devices: 3,
        validity_duration_seconds: 86400,
        activated_at: past,
        expires_at: initialExpiry,
      })
    );
    const env = await makeEnv(db);

    const result = await activate(env, { ...BASE_INPUT, machine_hash: MACHINE_B });

    expect(db.licenses[0]!.expires_at).toBe(initialExpiry);
    expect(db.licenses[0]!.activated_at).toBe(past);
    expect(result.license.expires_at).toBe(initialExpiry);

    const audit = db.auditLogs.find(
      (a) => a.action === "client.activate" && a.details_json?.includes(MACHINE_B)
    );
    const details = JSON.parse(audit!.details_json!);
    expect(details.validity_duration_seconds).toBeUndefined();
    expect(details.computed_expires_at).toBeUndefined();
  });

  it("does not re-anchor expires_at when status was reset to 'available' by an enable cycle", async () => {
    // services/licenses.ts::setLicenseDisabled resets status back to 'available'
    // when all devices have been deactivated. For an ARV license that already
    // materialized expires_at, the next activate still hits the
    // isFirstActivation branch (status === 'available'), but must NOT re-anchor.
    db.products.push(makeProduct());
    const originalExpiry = new Date(Date.now() + 86400 * 1000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    db.licenses.push(
      makeLicense({
        status: "available",
        validity_duration_seconds: 86400,
        activated_at: past,
        expires_at: originalExpiry,
      })
    );
    const env = await makeEnv(db);

    const result = await activate(env, BASE_INPUT);

    expect(db.licenses[0]!.expires_at).toBe(originalExpiry);
    expect(db.licenses[0]!.activated_at).toBe(past);
    expect(db.licenses[0]!.status).toBe("activated");
    expect(result.license.expires_at).toBe(originalExpiry);

    const audit = db.auditLogs.find((a) => a.action === "client.activate");
    const details = JSON.parse(audit!.details_json!);
    expect(details.computed_expires_at).toBeUndefined();
    expect(details.validity_duration_seconds).toBeUndefined();
  });

  it("does not materialize expires_at when neither expiry model is set", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense());
    const env = await makeEnv(db);

    const result = await activate(env, BASE_INPUT);

    expect(db.licenses[0]!.expires_at).toBeNull();
    expect(result.license.expires_at).toBeNull();

    const audit = db.auditLogs.find((a) => a.action === "client.activate");
    const details = JSON.parse(audit!.details_json!);
    expect(details.validity_duration_seconds).toBeUndefined();
  });
});

describe("deactivate", () => {
  let db: FakeDB;

  beforeEach(() => {
    db = new FakeDB();
  });

  it("returns { ok: true } on normal deactivation", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "activated" }));
    const now = new Date().toISOString();
    db.activations.push({
      id: "act_a",
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
    });
    const env = await makeEnv(db);

    const result = await deactivate(env, {
      product_code: "tv-app",
      activation_code: "CODE-1234",
      machine_hash: MACHINE_A,
    });

    expect(result).toEqual({ ok: true });
    expect(db.activations[0]!.status).toBe("deactivated");
  });

  it("rejects with INVALID_CODE when activation_code not found", async () => {
    const env = await makeEnv(db);
    await expect(
      deactivate(env, {
        product_code: "tv-app",
        activation_code: "NOPE",
        machine_hash: MACHINE_A,
      })
    ).rejects.toMatchObject({ status: 404, code: "INVALID_CODE" });
  });

  it("rejects with PRODUCT_MISMATCH when product_code is wrong", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "activated" }));
    const env = await makeEnv(db);
    await expect(
      deactivate(env, {
        product_code: "wrong-product",
        activation_code: "CODE-1234",
        machine_hash: MACHINE_A,
      })
    ).rejects.toMatchObject({ status: 409, code: "PRODUCT_MISMATCH" });
  });

  it("writes client.deactivate audit log", async () => {
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "activated" }));
    const now = new Date().toISOString();
    db.activations.push({
      id: "act_a",
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
    });
    const env = await makeEnv(db);

    await deactivate(env, {
      product_code: "tv-app",
      activation_code: "CODE-1234",
      machine_hash: MACHINE_A,
    });

    const entry = db.auditLogs.find((a) => a.action === "client.deactivate");
    expect(entry).toBeDefined();
    expect(entry!.target_id).toBe("lic_test");
    const details = JSON.parse(entry!.details_json!);
    expect(details.machine_hash).toBe(MACHINE_A);
  });
});

describe("device management", () => {
  it("lists only active devices without exposing machine hashes", async () => {
    const db = new FakeDB();
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "activated", max_devices: 3 }));
    const now = new Date().toISOString();
    db.activations.push(
      {
        id: "act_active",
        license_id: "lic_test",
        machine_hash: MACHINE_A,
        device_label: "Living Room TV",
        client_version: "1.0.0",
        platform: "android-tv",
        status: "active",
        activated_at: now,
        deactivated_at: null,
        last_seen_at: now,
        license_payload_version: 1,
      },
      {
        id: "act_old",
        license_id: "lic_test",
        machine_hash: MACHINE_B,
        device_label: "Old TV",
        client_version: null,
        platform: "android-tv",
        status: "deactivated",
        activated_at: now,
        deactivated_at: now,
        last_seen_at: now,
        license_payload_version: 1,
      },
    );

    const result = await listActiveDevices(await makeEnv(db), {
      activation_code: "CODE-1234",
    });

    expect(result).toEqual({
      product: { code: "tv-app", name: "TV App" },
      license: {
        status: "activated",
        max_devices: 3,
        active_devices: 1,
        can_reactivate: true,
      },
      devices: [
        {
          id: "act_active",
          device_label: "Living Room TV",
          platform: "android-tv",
          activated_at: now,
          last_seen_at: now,
          machine_hash_suffix: MACHINE_A.slice(-6),
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(MACHINE_A);
  });

  it("serves no-store responses and enforces the configured rate limit", async () => {
    const db = new FakeDB();
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "activated" }));
    const limiter = { limit: vi.fn().mockResolvedValue({ success: true }) };
    const env = {
      ...(await makeEnv(db)),
      DEVICE_MANAGER_RATE_LIMITER: limiter as RateLimit,
    };
    const request = () => new Request("https://example.com/api/client/devices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.5",
      },
      body: JSON.stringify({ activation_code: "CODE-1234" }),
    });

    const response = await worker.fetch(request(), env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(limiter.limit).toHaveBeenCalledWith({ key: "devices:203.0.113.5" });

    limiter.limit.mockResolvedValueOnce({ success: false });
    const blocked = await worker.fetch(request(), env, {} as ExecutionContext);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Cache-Control")).toBe("no-store");
    await expect(blocked.json()).resolves.toMatchObject({ error: "RATE_LIMIT_EXCEEDED" });
  });

  it("rate limits malformed JSON before parsing it", async () => {
    const db = new FakeDB();
    const limiter = { limit: vi.fn().mockResolvedValue({ success: false }) };
    const env = {
      ...(await makeEnv(db)),
      DEVICE_MANAGER_RATE_LIMITER: limiter as RateLimit,
    };
    const response = await worker.fetch(
      new Request("https://example.com/api/client/devices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "203.0.113.5",
        },
        body: "{malformed",
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(429);
    expect(limiter.limit).toHaveBeenCalledWith({ key: "devices:203.0.113.5" });
    await expect(response.json()).resolves.toMatchObject({ error: "RATE_LIMIT_EXCEEDED" });
  });

  it("deactivates only an active device belonging to the activation code", async () => {
    const db = new FakeDB();
    db.products.push(makeProduct());
    db.licenses.push(makeLicense({ status: "activated" }));
    const now = new Date().toISOString();
    db.activations.push({
      id: "act_a",
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
    });
    const env = await makeEnv(db);

    await expect(
      deactivateManagedDevice(env, "act_other", { activation_code: "CODE-1234" }),
    ).rejects.toMatchObject({ status: 404, code: "DEVICE_NOT_FOUND" });
    expect(db.activations[0]!.status).toBe("active");

    await expect(
      deactivateManagedDevice(env, "act_a", { activation_code: "CODE-1234" }),
    ).resolves.toEqual({ ok: true });
    expect(db.activations[0]!.status).toBe("deactivated");
    expect(db.auditLogs.at(-1)?.action).toBe("client.deactivate");
    expect(JSON.parse(db.auditLogs.at(-1)!.details_json!)).toEqual({ activation_id: "act_a" });
  });
});
