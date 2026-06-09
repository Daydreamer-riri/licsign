import { beforeEach, describe, expect, it } from "vitest";
import type { EvaluationActivationRow } from "../src/db/models";
import * as evaluationQueries from "../src/db/queries/evaluations";

class FakeStatement {
  private args: unknown[] = [];
  constructor(private readonly sql: string, private readonly db: FakeDB) {}

  bind(...args: unknown[]): this {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const sql = this.sql.trim();
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
      const [id, issuer_id, product_id, machine_hash, first_issued_at, expires_at] =
        this.args as [string, string, string, string, string, string];
      this.db.evaluationActivations.push({ id, issuer_id, product_id, machine_hash, first_issued_at, expires_at });
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
  evaluationActivations: EvaluationActivationRow[] = [];
  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql, this);
  }
}

const MACHINE_HASH = "a".repeat(64);

describe("evaluation queries", () => {
  let db: FakeDB;

  beforeEach(() => {
    db = new FakeDB();
  });

  it("findByProductAndMachine returns null for new device", async () => {
    const result = await evaluationQueries.findByProductAndMachine(
      db as unknown as D1Database,
      "prd_test",
      MACHINE_HASH
    );
    expect(result).toBeNull();
  });

  it("findByProductAndMachine returns existing row", async () => {
    const row: EvaluationActivationRow = {
      id: "eva_1",
      issuer_id: "iss_test",
      product_id: "prd_test",
      machine_hash: MACHINE_HASH,
      first_issued_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2026-01-08T00:00:00.000Z"
    };
    db.evaluationActivations.push(row);

    const result = await evaluationQueries.findByProductAndMachine(
      db as unknown as D1Database,
      "prd_test",
      MACHINE_HASH
    );
    expect(result).toEqual(row);
  });

  it("create inserts a row with correct fields", async () => {
    await evaluationQueries.create(db as unknown as D1Database, {
      id: "eva_1",
      issuerId: "iss_test",
      productId: "prd_test",
      machineHash: MACHINE_HASH,
      firstIssuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-08T00:00:00.000Z"
    });

    expect(db.evaluationActivations).toHaveLength(1);
    const row = db.evaluationActivations[0]!;
    expect(row.id).toBe("eva_1");
    expect(row.issuer_id).toBe("iss_test");
    expect(row.product_id).toBe("prd_test");
    expect(row.machine_hash).toBe(MACHINE_HASH);
    expect(row.first_issued_at).toBe("2026-01-01T00:00:00.000Z");
    expect(row.expires_at).toBe("2026-01-08T00:00:00.000Z");
  });
});
