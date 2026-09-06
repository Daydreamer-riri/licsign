import { describe, expect, it } from "vitest";
import { getDashboardStats } from "../src/services/dashboard";
import type { EvaluationActivationRow } from "../src/db/models";

class FakeStatement {
  private args: unknown[] = [];
  constructor(private readonly sql: string, private readonly db: FakeDB) {}

  bind(...args: unknown[]): this {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const sql = this.sql.trim();
    if (sql.startsWith("SELECT COUNT(*) AS count FROM products")) {
      const [issuerId] = this.args as [string];
      return { count: this.db.products.filter((p) => p.issuer_id === issuerId).length } as T;
    }
    if (sql.startsWith("SELECT COUNT(*) AS count FROM licenses")) {
      const [issuerId] = this.args as [string];
      return { count: this.db.licenses.filter((l) => l.issuer_id === issuerId).length } as T;
    }
    if (sql.startsWith("SELECT COUNT(*) AS count FROM evaluation_activations")) {
      const [issuerId] = this.args as [string];
      return { count: this.db.evaluationActivations.filter((e) => e.issuer_id === issuerId).length } as T;
    }
    throw new Error(`unhandled first(): ${sql}`);
  }

  async all<T>(): Promise<{ results: T[] }> {
    const sql = this.sql.trim();
    if (sql.includes("FROM activations")) {
      return { results: [] as T[] };
    }
    throw new Error(`unhandled all(): ${sql}`);
  }

  async run() {
    throw new Error(`unhandled run(): ${this.sql}`);
    return { success: true } as never;
  }
}

class FakeDB {
  products: { issuer_id: string }[] = [];
  licenses: { issuer_id: string }[] = [];
  evaluationActivations: Pick<EvaluationActivationRow, "issuer_id">[] = [];

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql.replace(/\s+/g, " ").trim(), this);
  }
}

describe("getDashboardStats", () => {
  it("includes evaluation_count in stats", async () => {
    const db = new FakeDB();
    db.evaluationActivations.push({ issuer_id: "iss_1" });
    db.evaluationActivations.push({ issuer_id: "iss_1" });
    db.evaluationActivations.push({ issuer_id: "iss_2" });

    const stats = await getDashboardStats(db as unknown as D1Database, "iss_1");

    expect(stats).toHaveProperty("evaluation_count");
    expect(stats.evaluation_count).toBe(2);
  });

  it("evaluation_count is 0 when no evaluations exist for issuer", async () => {
    const db = new FakeDB();

    const stats = await getDashboardStats(db as unknown as D1Database, "iss_1");

    expect(stats.evaluation_count).toBe(0);
  });
});
