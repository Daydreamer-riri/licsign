import { beforeEach, describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  deleteSession,
  deleteAllSessionsForAdmin,
  login,
} from "../src/services/adminAuth";
import { createAdmin, listAdmins } from "../src/services/adminAccounts";
import { getDashboardStats } from "../src/services/dashboard";
import { queryAuditLogs } from "../src/services/auditQuery";
import { sha256Hex } from "../src/utils/hash";

// -- In-memory row types --

interface AdminRow {
  id: string;
  issuer_id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface SessionRow {
  id: string;
  token_hash: string;
  admin_id: string;
  expires_at: string;
  created_at: string;
}

interface ProductRow {
  id: string;
  issuer_id: string;
}

interface LicenseRow {
  id: string;
  issuer_id: string;
  product_id: string;
  activation_code: string;
}

interface ActivationRow {
  id: string;
  license_id: string;
  machine_hash: string;
  device_label: string | null;
  platform: string | null;
  status: string;
  activated_at: string;
}

interface AuditLogRow {
  id: string;
  issuer_id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details_json: string | null;
  created_at: string;
}

// -- FakeDB --

class FakeStatement {
  private args: unknown[] = [];
  constructor(private readonly sql: string, private readonly db: FakeDB) {}

  bind(...args: unknown[]): this {
    this.args = args;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const sql = this.sql.trim();

    // admin_sessions lookup by token_hash
    if (sql.startsWith("SELECT") && sql.includes("admin_sessions") && sql.includes("token_hash")) {
      const hash = this.args[0] as string;
      return (this.db.adminSessions.find((s) => s.token_hash === hash) as T | undefined) ?? null;
    }

    // admins lookup by id + active status
    if (sql.startsWith("SELECT") && sql.includes("FROM admins") && sql.includes("status = 'active'")) {
      const id = this.args[0] as string;
      const row = this.db.admins.find((a) => a.id === id && a.status === "active");
      if (!row) return null;
      return { id: row.id, issuer_id: row.issuer_id, email: row.email, status: row.status } as T;
    }

    // admins lookup by email (login / duplicate check)
    if (sql.startsWith("SELECT") && sql.includes("FROM admins") && sql.includes("email = ?")) {
      const email = this.args[0] as string;
      const row = this.db.admins.find((a) => a.email === email);
      if (!row) return null;
      return row as unknown as T;
    }

    // product count
    if (sql.includes("COUNT(*)") && sql.includes("products")) {
      const issuerId = this.args[0] as string;
      return { count: this.db.products.filter((p) => p.issuer_id === issuerId).length } as T;
    }

    // license count
    if (sql.includes("COUNT(*)") && sql.includes("licenses") && !sql.includes("audit_logs")) {
      const issuerId = this.args[0] as string;
      return { count: this.db.licenses.filter((l) => l.issuer_id === issuerId).length } as T;
    }

    // audit_logs count
    if (sql.includes("COUNT(*)") && sql.includes("audit_logs")) {
      const issuerId = this.args[0] as string;
      let logs = this.db.auditLogs.filter((l) => l.issuer_id === issuerId);
      if (sql.includes("action = ?")) {
        const action = this.args[1] as string;
        logs = logs.filter((l) => l.action === action);
      }
      return { count: logs.length } as T;
    }

    throw new Error("unhandled first(): " + sql);
  }

  async all<T>() {
    const sql = this.sql.trim();

    // list admins
    if (sql.startsWith("SELECT") && sql.includes("FROM admins") && sql.includes("issuer_id = ?")) {
      const issuerId = this.args[0] as string;
      const rows = this.db.admins
        .filter((a) => a.issuer_id === issuerId)
        .map((a) => ({ id: a.id, email: a.email, status: a.status, created_at: a.created_at }));
      return { results: rows as T[] };
    }

    // recent activations (JOIN query)
    if (sql.includes("activations") && sql.includes("JOIN")) {
      const issuerId = this.args[0] as string;
      const limit = (this.args[1] as number) ?? 10;
      const results: unknown[] = [];
      for (const act of this.db.activations) {
        if (act.status !== "active") continue;
        const lic = this.db.licenses.find((l) => l.id === act.license_id);
        if (!lic || lic.issuer_id !== issuerId) continue;
        const prod = this.db.products.find((p) => p.id === lic.product_id);
        results.push({
          activation_id: act.id,
          license_id: lic.id,
          activation_code: lic.activation_code,
          product_code: (prod as Record<string, unknown> | undefined)?.code ?? "",
          machine_hash: act.machine_hash,
          device_label: act.device_label,
          platform: act.platform,
          activated_at: act.activated_at,
        });
        if (results.length >= limit) break;
      }
      return { results: results as T[] };
    }

    // audit_logs paginated
    if (sql.includes("audit_logs") && sql.includes("LIMIT")) {
      const issuerId = this.args[0] as string;
      let logs = this.db.auditLogs.filter((l) => l.issuer_id === issuerId);
      let paramIdx = 1;
      if (sql.includes("action = ?")) {
        const action = this.args[paramIdx] as string;
        logs = logs.filter((l) => l.action === action);
        paramIdx++;
      }
      const take = this.args[paramIdx] as number;
      const skip = this.args[paramIdx + 1] as number;
      logs = [...logs].sort((a, b) => b.created_at.localeCompare(a.created_at));
      const sliced = logs.slice(skip, skip + take);
      const mapped = sliced.map((l) => ({
        id: l.id,
        actor_type: l.actor_type,
        actor_id: l.actor_id,
        action: l.action,
        target_type: l.target_type,
        target_id: l.target_id,
        details_json: l.details_json,
        created_at: l.created_at,
      }));
      return { results: mapped as T[] };
    }

    throw new Error("unhandled all(): " + sql);
  }

  async run() {
    const sql = this.sql.trim();

    // insert admin_sessions
    if (sql.startsWith("INSERT INTO admin_sessions")) {
      const [id, token_hash, admin_id, expires_at, created_at] = this.args as [string, string, string, string, string];
      this.db.adminSessions.push({ id, token_hash, admin_id, expires_at, created_at });
      return { success: true } as never;
    }

    // delete admin_sessions by id
    if (sql.startsWith("DELETE FROM admin_sessions WHERE id")) {
      const id = this.args[0] as string;
      this.db.adminSessions = this.db.adminSessions.filter((s) => s.id !== id);
      return { success: true } as never;
    }

    // delete admin_sessions by token_hash
    if (sql.startsWith("DELETE FROM admin_sessions WHERE token_hash")) {
      const hash = this.args[0] as string;
      this.db.adminSessions = this.db.adminSessions.filter((s) => s.token_hash !== hash);
      return { success: true } as never;
    }

    // delete admin_sessions by admin_id
    if (sql.startsWith("DELETE FROM admin_sessions WHERE admin_id")) {
      const adminId = this.args[0] as string;
      this.db.adminSessions = this.db.adminSessions.filter((s) => s.admin_id !== adminId);
      return { success: true } as never;
    }

    // update admin_sessions expires_at
    if (sql.startsWith("UPDATE admin_sessions")) {
      const [expires_at, id] = this.args as [string, string];
      const row = this.db.adminSessions.find((s) => s.id === id);
      if (row) row.expires_at = expires_at;
      return { success: true } as never;
    }

    // insert admins
    if (sql.startsWith("INSERT INTO admins")) {
      const [id, issuer_id, email, password_hash, password_salt, created_at, updated_at] = this.args as [
        string, string, string, string, string, string, string
      ];
      if (this.db.admins.some((a) => a.email === email)) {
        throw new Error("UNIQUE constraint failed: admins.email");
      }
      this.db.admins.push({ id, issuer_id, email, password_hash, password_salt, status: "active", created_at, updated_at });
      return { success: true } as never;
    }

    throw new Error("unhandled run(): " + sql);
  }
}

class FakeDB {
  admins: AdminRow[] = [];
  adminSessions: SessionRow[] = [];
  products: (ProductRow & Record<string, unknown>)[] = [];
  licenses: LicenseRow[] = [];
  activations: ActivationRow[] = [];
  auditLogs: AuditLogRow[] = [];

  prepare(sql: string): FakeStatement {
    return new FakeStatement(sql, this);
  }
}

function asD1(db: FakeDB): D1Database {
  return db as unknown as D1Database;
}

// -- Tests --

describe("Password Hashing", () => {
  it("hashPassword produces different salt each call", async () => {
    const a = await hashPassword("secret");
    const b = await hashPassword("secret");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("verifyPassword returns true for correct password", async () => {
    const { hash, salt } = await hashPassword("correct-password");
    const ok = await verifyPassword("correct-password", hash, salt);
    expect(ok).toBe(true);
  });

  it("verifyPassword returns false for wrong password", async () => {
    const { hash, salt } = await hashPassword("correct-password");
    const ok = await verifyPassword("wrong-password", hash, salt);
    expect(ok).toBe(false);
  });
});

describe("Session Management", () => {
  let db: FakeDB;
  const ADMIN_ID = "adm_test1";
  const ISSUER_ID = "iss_test1";

  beforeEach(() => {
    db = new FakeDB();
    db.admins.push({
      id: ADMIN_ID,
      issuer_id: ISSUER_ID,
      email: "admin@example.com",
      password_hash: "",
      password_salt: "",
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  it("createSession returns a token and stores hash (not raw token)", async () => {
    const { token, expiresAt } = await createSession(asD1(db), ADMIN_ID);
    expect(token).toBeTruthy();
    expect(expiresAt).toBeTruthy();
    expect(db.adminSessions).toHaveLength(1);

    const stored = db.adminSessions[0]!;
    expect(stored.token_hash).not.toBe(token);
    const expectedHash = await sha256Hex(token);
    expect(stored.token_hash).toBe(expectedHash);
  });

  it("validateSession succeeds with valid token", async () => {
    const { token } = await createSession(asD1(db), ADMIN_ID);
    const result = await validateSession(asD1(db), token);
    expect(result).not.toBeNull();
    expect(result!.adminId).toBe(ADMIN_ID);
    expect(result!.issuerId).toBe(ISSUER_ID);
    expect(result!.email).toBe("admin@example.com");
  });

  it("validateSession returns null for invalid token", async () => {
    const result = await validateSession(asD1(db), "nonexistent-token");
    expect(result).toBeNull();
  });

  it("validateSession returns null for expired session and deletes it", async () => {
    const { token } = await createSession(asD1(db), ADMIN_ID);
    db.adminSessions[0]!.expires_at = new Date(Date.now() - 1000).toISOString();

    const result = await validateSession(asD1(db), token);
    expect(result).toBeNull();
    expect(db.adminSessions).toHaveLength(0);
  });

  it("validateSession extends session when < 3.5 days remain (sliding window)", async () => {
    const { token } = await createSession(asD1(db), ADMIN_ID);
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    db.adminSessions[0]!.expires_at = twoDaysFromNow;

    const result = await validateSession(asD1(db), token);
    expect(result).not.toBeNull();

    const newExpiry = new Date(db.adminSessions[0]!.expires_at).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const drift = Math.abs(newExpiry - Date.now() - sevenDaysMs);
    expect(drift).toBeLessThan(5_000);
  });

  it("deleteSession removes the session", async () => {
    const { token } = await createSession(asD1(db), ADMIN_ID);
    expect(db.adminSessions).toHaveLength(1);

    await deleteSession(asD1(db), token);
    expect(db.adminSessions).toHaveLength(0);
  });
});

describe("Login", () => {
  let db: FakeDB;
  const ADMIN_ID = "adm_login";
  const ISSUER_ID = "iss_login";
  const EMAIL = "login@example.com";
  const PASSWORD = "super-secret";

  beforeEach(async () => {
    db = new FakeDB();
    const { hash, salt } = await hashPassword(PASSWORD);
    db.admins.push({
      id: ADMIN_ID,
      issuer_id: ISSUER_ID,
      email: EMAIL,
      password_hash: hash,
      password_salt: salt,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  it("login succeeds with correct credentials and returns session", async () => {
    const result = await login(asD1(db), EMAIL, PASSWORD);
    expect(result.adminId).toBe(ADMIN_ID);
    expect(result.issuerId).toBe(ISSUER_ID);
    expect(result.token).toBeTruthy();
    expect(result.expiresAt).toBeTruthy();
    expect(db.adminSessions).toHaveLength(1);
  });

  it("login throws UNAUTHORIZED for wrong password", async () => {
    await expect(login(asD1(db), EMAIL, "wrong")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
  });

  it("login throws UNAUTHORIZED for non-existent email", async () => {
    await expect(login(asD1(db), "nobody@example.com", PASSWORD)).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
  });
});

describe("Admin Accounts", () => {
  let db: FakeDB;
  const ISSUER_ID = "iss_acct";

  beforeEach(() => {
    db = new FakeDB();
  });

  it("createAdmin creates an admin with hashed password", async () => {
    const result = await createAdmin(asD1(db), ISSUER_ID, "New@Example.com", "pass123");
    expect(result.id).toMatch(/^adm_/);
    expect(result.email).toBe("new@example.com");
    expect(db.admins).toHaveLength(1);
    expect(db.admins[0]!.password_hash).toBeTruthy();
    expect(db.admins[0]!.password_salt).toBeTruthy();
    expect(db.admins[0]!.password_hash).not.toBe("pass123");
  });

  it("createAdmin throws error for duplicate email", async () => {
    await createAdmin(asD1(db), ISSUER_ID, "dup@example.com", "pass1");
    await expect(createAdmin(asD1(db), ISSUER_ID, "dup@example.com", "pass2")).rejects.toMatchObject({
      status: 409,
      code: "EMAIL_EXISTS",
    });
  });

  it("listAdmins returns admins for the issuer", async () => {
    await createAdmin(asD1(db), ISSUER_ID, "a@example.com", "pass");
    await createAdmin(asD1(db), ISSUER_ID, "b@example.com", "pass");
    await createAdmin(asD1(db), "other_issuer", "c@example.com", "pass");

    const admins = await listAdmins(asD1(db), ISSUER_ID);
    expect(admins).toHaveLength(2);
    expect(admins.map((a) => a.email).sort()).toEqual(["a@example.com", "b@example.com"]);
  });
});

describe("Dashboard Stats", () => {
  let db: FakeDB;
  const ISSUER_ID = "iss_dash";

  beforeEach(() => {
    db = new FakeDB();
  });

  it("getDashboardStats returns correct counts", async () => {
    db.products.push(
      { id: "prd_1", issuer_id: ISSUER_ID, code: "app1" },
      { id: "prd_2", issuer_id: ISSUER_ID, code: "app2" },
      { id: "prd_other", issuer_id: "other", code: "other" },
    );
    db.licenses.push(
      { id: "lic_1", issuer_id: ISSUER_ID, product_id: "prd_1", activation_code: "CODE1" },
      { id: "lic_2", issuer_id: ISSUER_ID, product_id: "prd_2", activation_code: "CODE2" },
      { id: "lic_3", issuer_id: ISSUER_ID, product_id: "prd_1", activation_code: "CODE3" },
    );

    const stats = await getDashboardStats(asD1(db), ISSUER_ID);
    expect(stats.product_count).toBe(2);
    expect(stats.license_count).toBe(3);
    expect(stats.recent_activations).toEqual([]);
  });

  it("getDashboardStats returns recent activations with limit", async () => {
    db.products.push({ id: "prd_1", issuer_id: ISSUER_ID, code: "tv-app" });
    db.licenses.push({ id: "lic_1", issuer_id: ISSUER_ID, product_id: "prd_1", activation_code: "ACT1" });
    db.activations.push(
      { id: "act_1", license_id: "lic_1", machine_hash: "a".repeat(64), device_label: "Device A", platform: "android-tv", status: "active", activated_at: "2024-01-02T00:00:00Z" },
      { id: "act_2", license_id: "lic_1", machine_hash: "b".repeat(64), device_label: null, platform: null, status: "active", activated_at: "2024-01-01T00:00:00Z" },
      { id: "act_3", license_id: "lic_1", machine_hash: "c".repeat(64), device_label: null, platform: null, status: "revoked", activated_at: "2024-01-03T00:00:00Z" },
    );

    const stats = await getDashboardStats(asD1(db), ISSUER_ID, 1);
    expect(stats.recent_activations).toHaveLength(1);
    expect(stats.recent_activations[0]!.activation_id).toBe("act_1");
    expect(stats.recent_activations[0]!.product_code).toBe("tv-app");
  });
});

describe("Audit Log Query", () => {
  let db: FakeDB;
  const ISSUER_ID = "iss_audit";

  beforeEach(() => {
    db = new FakeDB();
    for (let i = 0; i < 5; i++) {
      db.auditLogs.push({
        id: "log_" + i,
        issuer_id: ISSUER_ID,
        actor_type: "admin",
        actor_id: "adm_1",
        action: i < 3 ? "license.create" : "product.update",
        target_type: i < 3 ? "license" : "product",
        target_id: "target_" + i,
        details_json: null,
        created_at: new Date(Date.now() - i * 60_000).toISOString(),
      });
    }
    // log from different issuer
    db.auditLogs.push({
      id: "log_other",
      issuer_id: "other",
      actor_type: "admin",
      actor_id: "adm_x",
      action: "license.create",
      target_type: "license",
      target_id: "t_x",
      details_json: null,
      created_at: new Date().toISOString(),
    });
  });

  it("queryAuditLogs returns paginated logs", async () => {
    const result = await queryAuditLogs(asD1(db), ISSUER_ID, {});
    expect(result.total).toBe(5);
    expect(result.audit_logs).toHaveLength(5);
    expect(result.audit_logs.every((l) => l.id.startsWith("log_"))).toBe(true);
  });

  it("queryAuditLogs filters by action", async () => {
    const result = await queryAuditLogs(asD1(db), ISSUER_ID, { action: "product.update" });
    expect(result.total).toBe(2);
    expect(result.audit_logs).toHaveLength(2);
    expect(result.audit_logs.every((l) => l.action === "product.update")).toBe(true);
  });

  it("queryAuditLogs respects take/skip", async () => {
    const result = await queryAuditLogs(asD1(db), ISSUER_ID, { take: 2, skip: 1 });
    expect(result.total).toBe(5);
    expect(result.audit_logs).toHaveLength(2);
    expect(result.audit_logs[0]!.id).toBe("log_1");
    expect(result.audit_logs[1]!.id).toBe("log_2");
  });
});
