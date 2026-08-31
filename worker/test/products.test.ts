import { beforeEach, describe, expect, it } from "vitest";
import { createProduct, getProduct, listProducts, updateProduct } from "../src/services/products";
import type { ProductRow } from "../src/db/models";
import type { AdminActor } from "../src/types";

const ACTOR: AdminActor = { type: "api_key", apiKeyId: "key_1" };

class FakeStatement {
  private args: unknown[] = [];
  constructor(private readonly sql: string, private readonly db: FakeDB) {}

  bind(...args: unknown[]): this {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const sql = this.sql.trim();
    if (sql.startsWith("SELECT * FROM products WHERE id = ? AND issuer_id = ?")) {
      const [id, issuerId] = this.args as [string, string];
      return (this.db.products.find((p) => p.id === id && p.issuer_id === issuerId) as T | undefined) ?? null;
    }
    if (sql.startsWith("SELECT * FROM products WHERE id = ?")) {
      const [id] = this.args as [string];
      return (this.db.products.find((p) => p.id === id) as T | undefined) ?? null;
    }
    throw new Error(`unhandled first(): ${sql}`);
  }

  async run() {
    const sql = this.sql.trim();
    if (sql.startsWith("INSERT INTO products")) {
      const [
        id, issuer_id, code, name, description, default_max_devices,
        trial_enabled, trial_start_at, trial_end_at, trial_token_ttl_seconds,
        evaluation_enabled, evaluation_token_ttl_days,
        created_at, updated_at,
      ] = this.args as [
        string, string, string, string, string, number,
        number, string | null, string | null, number | null,
        number, number | null,
        string, string,
      ];
      const now = created_at;
      this.db.products.push({
        id, issuer_id, code, name, description,
        status: "active", default_max_devices,
        trial_enabled, trial_start_at, trial_end_at, trial_token_ttl_seconds,
        evaluation_enabled, evaluation_token_ttl_days,
        created_at: now, updated_at: now,
      });
      return { success: true } as never;
    }
    if (sql.startsWith("UPDATE products")) {
      const [
        code, name, description, status, default_max_devices,
        trial_enabled, trial_start_at, trial_end_at, trial_token_ttl_seconds,
        evaluation_enabled, evaluation_token_ttl_days,
        updated_at, id, issuer_id,
      ] = this.args as [
        string, string, string, string, number,
        number, string | null, string | null, number | null,
        number, number | null,
        string, string, string,
      ];
      const row = this.db.products.find((p) => p.id === id && p.issuer_id === issuer_id);
      if (row) {
        Object.assign(row, {
          code, name, description, status, default_max_devices,
          trial_enabled, trial_start_at, trial_end_at, trial_token_ttl_seconds,
          evaluation_enabled, evaluation_token_ttl_days,
          updated_at,
        });
      }
      return { success: true } as never;
    }
    if (sql.startsWith("INSERT INTO audit_logs")) {
      return { success: true } as never;
    }
    throw new Error(`unhandled run(): ${sql}`);
  }

  async all<T>() {
    const sql = this.sql.trim();
    if (sql.includes("FROM products") && sql.includes("LEFT JOIN")) {
      const issuerId = this.args[1];
      return {
        results: this.db.products
          .filter((product) => product.issuer_id === issuerId)
          .map((product) => ({ ...product, license_count: 0 })) as T[],
      };
    }
    throw new Error(`unhandled all(): ${sql}`);
  }
}

class FakeDB {
  products: ProductRow[] = [];
  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql, this);
  }
}

describe("products service — evaluation fields", () => {
  let db: FakeDB;

  beforeEach(() => {
    db = new FakeDB();
  });

  it("createProduct stores evaluation_enabled and evaluation_token_ttl_days", async () => {
    const product = await createProduct(db as unknown as D1Database, "iss_test", ACTOR, {
      code: "tv-app",
      name: "TV App",
      evaluation_enabled: true,
      evaluation_token_ttl_days: 7,
    });

    expect(product.evaluation_enabled).toBe(1);
    expect(product.evaluation_token_ttl_days).toBe(7);
  });

  it("createProduct without evaluation fields defaults to disabled and null", async () => {
    const product = await createProduct(db as unknown as D1Database, "iss_test", ACTOR, {
      code: "tv-app",
      name: "TV App",
    });

    expect(product.evaluation_enabled).toBe(0);
    expect(product.evaluation_token_ttl_days).toBeNull();
  });

  it("updateProduct can update evaluation_enabled independently", async () => {
    db.products.push({
      id: "prd_1", issuer_id: "iss_test", code: "tv-app", name: "TV App", description: "",
      status: "active", default_max_devices: 1,
      trial_enabled: 0, trial_start_at: null, trial_end_at: null, trial_token_ttl_seconds: null,
      evaluation_enabled: 0, evaluation_token_ttl_days: null,
      created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    });

    const product = await updateProduct(db as unknown as D1Database, "iss_test", ACTOR, "prd_1", {
      evaluation_enabled: true,
      evaluation_token_ttl_days: 7,
    });

    expect(product.evaluation_enabled).toBe(1);
    expect(product.evaluation_token_ttl_days).toBe(7);
  });

  it("updateProduct can update evaluation_token_ttl_days independently", async () => {
    db.products.push({
      id: "prd_1", issuer_id: "iss_test", code: "tv-app", name: "TV App", description: "",
      status: "active", default_max_devices: 1,
      trial_enabled: 0, trial_start_at: null, trial_end_at: null, trial_token_ttl_seconds: null,
      evaluation_enabled: 1, evaluation_token_ttl_days: 7,
      created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    });

    const product = await updateProduct(db as unknown as D1Database, "iss_test", ACTOR, "prd_1", {
      evaluation_token_ttl_days: 14,
    });

    expect(product.evaluation_token_ttl_days).toBe(14);
    expect(product.evaluation_enabled).toBe(1);
  });

  it("list and detail queries expose evaluation fields", async () => {
    db.products.push({
      id: "prd_1", issuer_id: "iss_test", code: "tv-app", name: "TV App", description: "",
      status: "active", default_max_devices: 1,
      trial_enabled: 0, trial_start_at: null, trial_end_at: null, trial_token_ttl_seconds: null,
      evaluation_enabled: 1, evaluation_token_ttl_days: 7,
      created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    });

    const [listed] = await listProducts(db as unknown as D1Database, "iss_test");
    const detail = await getProduct(db as unknown as D1Database, "iss_test", "prd_1");

    expect(listed).toMatchObject({ evaluation_enabled: 1, evaluation_token_ttl_days: 7 });
    expect(detail).toMatchObject({ evaluation_enabled: 1, evaluation_token_ttl_days: 7 });
  });

  it("rejects an evaluation duration outside the supported date range", async () => {
    await expect(
      createProduct(db as unknown as D1Database, "iss_test", ACTOR, {
        code: "tv-app",
        name: "TV App",
        evaluation_enabled: true,
        evaluation_token_ttl_days: Number.MAX_SAFE_INTEGER,
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "EVALUATION_CONFIG_INVALID",
    });
  });

  it("evaluation fields are independent from trial fields", async () => {
    const product = await createProduct(db as unknown as D1Database, "iss_test", ACTOR, {
      code: "tv-app",
      name: "TV App",
      evaluation_enabled: true,
      evaluation_token_ttl_days: 3,
    });

    expect(product.trial_enabled).toBe(0);
    expect(product.evaluation_enabled).toBe(1);
    expect(product.evaluation_token_ttl_days).toBe(3);
  });
});
