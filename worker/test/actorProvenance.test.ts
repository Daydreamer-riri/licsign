import { describe, expect, it } from "vitest";
import { createBatch } from "../src/services/batches";
import type { ProductRow } from "../src/db/models";
import type { AdminActor } from "../src/types";

interface BatchRow {
  id: string;
  issuer_id: string;
  product_id: string;
  created_by_api_key_id: string | null;
  created_by_admin_id: string | null;
}

interface LicenseRow {
  id: string;
  issuer_id: string;
  product_id: string;
  batch_id: string;
  activation_code: string;
}

interface AuditLogRow {
  actor_type: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
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

    if (sql.startsWith("SELECT") && sql.includes("FROM products")) {
      const [productId, issuerId] = this.args as [string, string];
      return (this.db.products.find((product) => product.id === productId && product.issuer_id === issuerId) as
        | T
        | undefined) ?? null;
    }

    throw new Error(`unhandled first(): ${sql}`);
  }

  async run() {
    const sql = this.sql.trim();

    if (sql.startsWith("INSERT INTO license_batches")) {
      const [
        id,
        issuerId,
        productId,
        ,
        ,
        ,
        ,
        ,
        ,
        createdByApiKeyId,
        createdByAdminId
      ] = this.args as [
        string,
        string,
        string,
        string,
        string | null,
        number,
        number,
        string | null,
        string | null,
        string | null,
        string | null,
        string
      ];

      this.db.batches.push({
        id,
        issuer_id: issuerId,
        product_id: productId,
        created_by_api_key_id: createdByApiKeyId,
        created_by_admin_id: createdByAdminId
      });
      return { success: true } as never;
    }

    if (sql.startsWith("INSERT INTO licenses")) {
      const [id, issuerId, productId, batchId, activationCode] = this.args as [string, string, string, string, string];
      this.db.licenses.push({
        id,
        issuer_id: issuerId,
        product_id: productId,
        batch_id: batchId,
        activation_code: activationCode
      });
      return { success: true } as never;
    }

    if (sql.startsWith("INSERT INTO audit_logs")) {
      const [, , actorType, actorId, action, targetType, targetId] = this.args as [
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
      this.db.auditLogs.push({
        actor_type: actorType,
        actor_id: actorId,
        action,
        target_type: targetType,
        target_id: targetId
      });
      return { success: true } as never;
    }

    throw new Error(`unhandled run(): ${sql}`);
  }
}

class FakeDB {
  products: ProductRow[] = [];
  batches: BatchRow[] = [];
  licenses: LicenseRow[] = [];
  auditLogs: AuditLogRow[] = [];

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql, this);
  }

  async batch(statements: D1PreparedStatement[]) {
    for (const statement of statements as unknown as FakeStatement[]) {
      await statement.run();
    }
    return [];
  }
}

function asD1(db: FakeDB): D1Database {
  return db as unknown as D1Database;
}

function makeProduct(): ProductRow {
  const now = new Date().toISOString();
  return {
    id: "prd_test",
    issuer_id: "iss_test",
    code: "tv",
    name: "TV",
    description: "",
    status: "active",
    default_max_devices: 1,
    trial_enabled: 0,
    trial_start_at: null,
    trial_end_at: null,
    trial_token_ttl_seconds: null,
    created_at: now,
    updated_at: now
  };
}

async function createTestBatch(db: FakeDB, actor: AdminActor) {
  db.products.push(makeProduct());
  return createBatch(asD1(db), "iss_test", actor, {
    product_id: "prd_test",
    batch_name: "Batch",
    quantity: 1
  });
}

describe("Actor provenance", () => {
  it("records API Key-created batches with API Key foreign key and api_key audit actor", async () => {
    const db = new FakeDB();
    await createTestBatch(db, { type: "api_key", apiKeyId: "key_ci" });

    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]!.created_by_api_key_id).toBe("key_ci");
    expect(db.batches[0]!.created_by_admin_id).toBeNull();
    expect(db.auditLogs[0]).toMatchObject({
      actor_type: "api_key",
      actor_id: "key_ci",
      action: "batch.create",
      target_type: "batch"
    });
  });

  it("records Admin-created batches with Admin foreign key and admin audit actor", async () => {
    const db = new FakeDB();
    await createTestBatch(db, { type: "admin", adminId: "adm_alice", email: "alice@example.com" });

    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]!.created_by_api_key_id).toBeNull();
    expect(db.batches[0]!.created_by_admin_id).toBe("adm_alice");
    expect(db.auditLogs[0]).toMatchObject({
      actor_type: "admin",
      actor_id: "adm_alice",
      action: "batch.create",
      target_type: "batch"
    });
  });
});
