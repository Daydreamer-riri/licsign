import { beforeEach, describe, expect, it } from "vitest";
import { deleteAuditLogsBefore } from "../src/db/queries/audit";
import { runAuditTrim, runAuditTrimWithEnv } from "../src/services/auditTrim";

interface AuditLogRow {
  id: string;
  created_at: string;
}

class FakeStatement {
  private args: unknown[] = [];
  constructor(
    private readonly sql: string,
    private readonly db: FakeAuditDB,
  ) {}

  bind(...args: unknown[]): this {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    throw new Error("unhandled first(): " + this.sql);
  }

  async all<T>() {
    throw new Error("unhandled all(): " + this.sql);
    return { results: [] as T[] };
  }

  async run(): Promise<D1Result> {
    const sql = this.sql.trim().replace(/\s+/g, " ");
    if (sql.startsWith("DELETE FROM audit_logs WHERE id IN")) {
      const [cutoff, limit] = this.args as [string, number];
      const before = this.db.rows.length;
      const toDelete = new Set(
        this.db.rows
          .filter((r) => r.created_at < cutoff)
          .slice(0, limit)
          .map((r) => r.id),
      );
      this.db.rows = this.db.rows.filter((r) => !toDelete.has(r.id));
      const changes = before - this.db.rows.length;
      return { success: true, meta: { changes, duration: 0, last_row_id: 0, changed_db: changes > 0, size_after: 0, rows_read: before, rows_written: changes }, results: [] };
    }
    throw new Error("unhandled run(): " + sql);
  }
}

class FakeAuditDB {
  rows: AuditLogRow[] = [];

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql, this);
  }
}

describe("deleteAuditLogsBefore", () => {
  let db: FakeAuditDB;

  beforeEach(() => {
    db = new FakeAuditDB();
    db.rows = [
      { id: "old1", created_at: "2024-01-01T00:00:00.000Z" },
      { id: "old2", created_at: "2024-06-15T12:00:00.000Z" },
      { id: "recent1", created_at: "2025-01-01T00:00:00.000Z" },
      { id: "recent2", created_at: "2025-06-01T00:00:00.000Z" },
    ];
  });

  it("deletes rows strictly before the cutoff and returns count", async () => {
    const deleted = await deleteAuditLogsBefore(db as unknown as D1Database, "2025-01-01T00:00:00.000Z");
    expect(deleted).toBe(2);
    expect(db.rows.map((r) => r.id)).toEqual(["recent1", "recent2"]);
  });

  it("returns 0 when no rows are older than cutoff", async () => {
    const deleted = await deleteAuditLogsBefore(db as unknown as D1Database, "2020-01-01T00:00:00.000Z");
    expect(deleted).toBe(0);
    expect(db.rows).toHaveLength(4);
  });

  it("deletes all rows when cutoff is far in the future", async () => {
    const deleted = await deleteAuditLogsBefore(db as unknown as D1Database, "2099-01-01T00:00:00.000Z");
    expect(deleted).toBe(4);
    expect(db.rows).toHaveLength(0);
  });

  it("deletes a large backlog in multiple bounded batches", async () => {
    db.rows = Array.from({ length: 2500 }, (_, i) => ({
      id: `old-${i}`,
      created_at: "2024-01-01T00:00:00.000Z",
    }));
    db.rows.push({ id: "recent", created_at: "2025-12-31T00:00:00.000Z" });

    const deleted = await deleteAuditLogsBefore(
      db as unknown as D1Database,
      "2025-01-01T00:00:00.000Z",
      1000,
    );

    expect(deleted).toBe(2500);
    expect(db.rows.map((r) => r.id)).toEqual(["recent"]);
  });
});

describe("runAuditTrim", () => {
  let db: FakeAuditDB;

  beforeEach(() => {
    db = new FakeAuditDB();
    db.rows = [
      { id: "very-old", created_at: "2020-01-01T00:00:00.000Z" },
      { id: "edge", created_at: new Date(Date.now() - 91 * 86_400_000).toISOString() },
      { id: "within-window", created_at: new Date(Date.now() - 30 * 86_400_000).toISOString() },
    ];
  });

  it("trims rows older than retentionDays using frozen nowMs", async () => {
    const nowMs = Date.now();
    const cutoff = new Date(nowMs - 90 * 86_400_000).toISOString();

    const rowsBefore = db.rows.filter((r) => r.created_at < cutoff).length;
    const deleted = await runAuditTrim(db as unknown as D1Database, 90, nowMs);

    expect(deleted).toBe(rowsBefore);
    for (const row of db.rows) {
      expect(row.created_at >= cutoff).toBe(true);
    }
  });

  it("returns 0 when all rows are within the retention window", async () => {
    db.rows = [{ id: "fresh", created_at: new Date(Date.now() - 1 * 86_400_000).toISOString() }];
    const deleted = await runAuditTrim(db as unknown as D1Database, 90, Date.now());
    expect(deleted).toBe(0);
  });
});

describe("runAuditTrimWithEnv", () => {
  let db: FakeAuditDB;

  beforeEach(() => {
    db = new FakeAuditDB();
    db.rows = [
      { id: "old", created_at: "2020-01-01T00:00:00.000Z" },
      { id: "new", created_at: new Date().toISOString() },
    ];
  });

  it("uses the default 90-day retention when env var is undefined", async () => {
    const nowMs = Date.now();
    await runAuditTrimWithEnv(db as unknown as D1Database, undefined, nowMs);
    // The "old" row from 2020 should be deleted; the current-timestamp row survives
    expect(db.rows.map((r) => r.id)).toEqual(["new"]);
  });

  it("respects a custom retention value from env", async () => {
    const nowMs = Date.now();
    db.rows = [
      { id: "old-31-days", created_at: new Date(nowMs - 31 * 86_400_000).toISOString() },
      { id: "recent-10-days", created_at: new Date(nowMs - 10 * 86_400_000).toISOString() },
    ];
    await runAuditTrimWithEnv(db as unknown as D1Database, "30", nowMs);
    expect(db.rows.map((r) => r.id)).toEqual(["recent-10-days"]);
  });

  it("skips trim when env var is zero", async () => {
    const rowsBefore = db.rows.length;
    await runAuditTrimWithEnv(db as unknown as D1Database, "0", Date.now());
    expect(db.rows).toHaveLength(rowsBefore);
  });

  it("skips trim when env var is negative", async () => {
    const rowsBefore = db.rows.length;
    await runAuditTrimWithEnv(db as unknown as D1Database, "-5", Date.now());
    expect(db.rows).toHaveLength(rowsBefore);
  });

  it("skips trim when env var is not a number", async () => {
    const rowsBefore = db.rows.length;
    await runAuditTrimWithEnv(db as unknown as D1Database, "invalid", Date.now());
    expect(db.rows).toHaveLength(rowsBefore);
  });

  it("skips trim when env var is a decimal", async () => {
    const rowsBefore = db.rows.length;
    await runAuditTrimWithEnv(db as unknown as D1Database, "30.5", Date.now());
    expect(db.rows).toHaveLength(rowsBefore);
  });
});
