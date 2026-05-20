import { describe, expect, it } from "vitest";
import { getProductOverview } from "../src/services/productOverview";
import { listProducts } from "../src/services/products";
import type { ProductRow } from "../src/db/models";

interface FakeLicense {
  id: string;
  issuer_id: string;
  product_id: string;
  status: string;
  activation_code: string;
}
interface FakeBatch {
  id: string;
  issuer_id: string;
  product_id: string;
}
interface FakeActivation {
  id: string;
  license_id: string;
  status: string;
  activated_at: string;
  machine_hash: string;
  device_label: string | null;
  platform: string | null;
}

class FakeStatement {
  private args: unknown[] = [];

  constructor(private readonly sql: string, private readonly db: FakeDB) {}

  bind(...args: unknown[]): this {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const sql = this.sql;

    if (sql.includes("FROM products") && sql.includes("WHERE id = ? AND issuer_id = ?")) {
      const [id, issuerId] = this.args as [string, string];
      return (
        (this.db.products.find((p) => p.id === id && p.issuer_id === issuerId) as
          | T
          | undefined) ?? null
      );
    }

    if (sql.includes("COUNT(*) AS count FROM license_batches")) {
      const [issuerId, productId] = this.args as [string, string];
      const count = this.db.batches.filter(
        (b) => b.issuer_id === issuerId && b.product_id === productId,
      ).length;
      return { count } as T;
    }

    throw new Error(`unhandled first(): ${sql}`);
  }

  async all<T>(): Promise<{ results: T[] }> {
    const sql = this.sql;

    if (sql.includes("GROUP BY status")) {
      const [issuerId, productId] = this.args as [string, string];
      const groups = new Map<string, number>();
      for (const l of this.db.licenses) {
        if (l.issuer_id === issuerId && l.product_id === productId) {
          groups.set(l.status, (groups.get(l.status) ?? 0) + 1);
        }
      }
      return {
        results: [...groups].map(([status, count]) => ({ status, count })) as T[],
      };
    }

    if (sql.includes("FROM activations")) {
      const [issuerId, productId, limit] = this.args as [string, string, number];
      const byId = new Map(
        this.db.licenses
          .filter((l) => l.issuer_id === issuerId && l.product_id === productId)
          .map((l) => [l.id, l]),
      );
      const rows = this.db.activations
        .filter((a) => a.status === "active" && byId.has(a.license_id))
        .sort((a, b) => (a.activated_at < b.activated_at ? 1 : -1))
        .slice(0, limit)
        .map((a) => ({
          activation_id: a.id,
          license_id: a.license_id,
          activation_code: byId.get(a.license_id)!.activation_code,
          machine_hash: a.machine_hash,
          device_label: a.device_label,
          platform: a.platform,
          activated_at: a.activated_at,
        }));
      return { results: rows as T[] };
    }

    if (sql.includes("FROM products") && sql.includes("LEFT JOIN")) {
      const [issuerId] = this.args as [string, string];
      const rows = this.db.products
        .filter((p) => p.issuer_id === issuerId)
        .map((p) => ({
          ...p,
          license_count: this.db.licenses.filter(
            (l) => l.issuer_id === issuerId && l.product_id === p.id,
          ).length,
        }));
      return { results: rows as T[] };
    }

    throw new Error(`unhandled all(): ${sql}`);
  }
}

class FakeDB {
  products: ProductRow[] = [];
  licenses: FakeLicense[] = [];
  batches: FakeBatch[] = [];
  activations: FakeActivation[] = [];

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql.replace(/\s+/g, " ").trim(), this);
  }
}

function asD1(db: FakeDB): D1Database {
  return db as unknown as D1Database;
}

function makeProduct(over: Partial<ProductRow> = {}): ProductRow {
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
    updated_at: now,
    ...over,
  };
}

describe("Product overview", () => {
  it("returns status counts, batch count, and recent activations scoped to the product", async () => {
    const db = new FakeDB();
    db.products.push(makeProduct({ id: "prd_a", issuer_id: "iss_1" }));
    db.products.push(makeProduct({ id: "prd_b", issuer_id: "iss_1" }));
    db.licenses.push(
      { id: "lic_1", issuer_id: "iss_1", product_id: "prd_a", status: "available", activation_code: "AAA" },
      { id: "lic_2", issuer_id: "iss_1", product_id: "prd_a", status: "activated", activation_code: "BBB" },
      { id: "lic_3", issuer_id: "iss_1", product_id: "prd_a", status: "activated", activation_code: "CCC" },
      { id: "lic_4", issuer_id: "iss_1", product_id: "prd_a", status: "revoked", activation_code: "DDD" },
      { id: "lic_5", issuer_id: "iss_1", product_id: "prd_b", status: "available", activation_code: "EEE" },
    );
    db.batches.push(
      { id: "bat_1", issuer_id: "iss_1", product_id: "prd_a" },
      { id: "bat_2", issuer_id: "iss_1", product_id: "prd_a" },
      { id: "bat_3", issuer_id: "iss_1", product_id: "prd_b" },
    );
    db.activations.push(
      { id: "act_1", license_id: "lic_2", status: "active", activated_at: "2026-01-01T00:00:00Z", machine_hash: "h1", device_label: "TV", platform: "android" },
      { id: "act_2", license_id: "lic_5", status: "active", activated_at: "2026-02-01T00:00:00Z", machine_hash: "h2", device_label: null, platform: null },
    );

    const overview = await getProductOverview(asD1(db), "iss_1", "prd_a");

    expect(overview.product.id).toBe("prd_a");
    expect(overview.license_counts).toEqual({
      available: 1,
      activated: 2,
      disabled: 0,
      revoked: 1,
      total: 4,
    });
    expect(overview.batch_count).toBe(2);
    expect(overview.recent_activations).toHaveLength(1);
    expect(overview.recent_activations[0]!.activation_id).toBe("act_1");
  });

  it("rejects a product that belongs to another issuer", async () => {
    const db = new FakeDB();
    db.products.push(makeProduct({ id: "prd_a", issuer_id: "iss_1" }));
    await expect(getProductOverview(asD1(db), "iss_2", "prd_a")).rejects.toThrow();
  });
});

describe("Products list", () => {
  it("includes per-product license_count scoped to the issuer", async () => {
    const db = new FakeDB();
    db.products.push(makeProduct({ id: "prd_a", issuer_id: "iss_1" }));
    db.products.push(makeProduct({ id: "prd_b", issuer_id: "iss_1" }));
    db.licenses.push(
      { id: "l1", issuer_id: "iss_1", product_id: "prd_a", status: "available", activation_code: "x" },
      { id: "l2", issuer_id: "iss_1", product_id: "prd_a", status: "available", activation_code: "y" },
      { id: "l3", issuer_id: "iss_2", product_id: "prd_a", status: "available", activation_code: "z" },
    );

    const products = await listProducts(asD1(db), "iss_1");
    const a = products.find((p) => p.id === "prd_a")!;
    const b = products.find((p) => p.id === "prd_b")!;

    expect(a.license_count).toBe(2);
    expect(b.license_count).toBe(0);
  });
});
