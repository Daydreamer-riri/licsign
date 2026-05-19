import { beforeEach, describe, expect, it } from "vitest";
import { verifyLicenseGateCompat } from "../src/services/licenseGateCompat";
import type { IssuerRow } from "../src/db/models";
import type { Env } from "../src/types";
import { decodeBase64UrlToString } from "../src/utils/base64url";
import type { ProductStatus, LicenseStatus } from "../../shared/src/types";

interface CompatLicenseRow {
  id: string;
  issuer_id: string;
  activation_code: string;
  status: LicenseStatus;
  expires_at: string | null;
  product_status: ProductStatus;
  product_id: string;
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
    if (
      sql.includes("FROM licenses") &&
      sql.includes("JOIN products") &&
      sql.includes("JOIN issuers")
    ) {
      const [activationCode, publicUserId] = this.args as [string, string];
      const license = this.db.licenses.find((l) => {
        if (l.activation_code !== activationCode) return false;
        const issuer = this.db.issuers.find((i) => i.id === l.issuer_id);
        return issuer?.public_user_id === publicUserId;
      });
      return (license as T | undefined) ?? null;
    }
    throw new Error("unhandled first(): " + sql);
  }

  async all<T>() {
    throw new Error("unhandled all(): " + this.sql);
    return { results: [] as T[] };
  }

  async run() {
    throw new Error("unhandled run(): " + this.sql);
    return { success: true } as never;
  }
}

class FakeDB {
  issuers: IssuerRow[] = [];
  licenses: CompatLicenseRow[] = [];

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

function makeIssuer(overrides: Partial<IssuerRow> = {}): IssuerRow {
  const now = new Date().toISOString();
  return {
    id: "iss_test",
    public_user_id: "user_abc",
    name: "Test Issuer",
    status: "active",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeLicense(overrides: Partial<CompatLicenseRow> = {}): CompatLicenseRow {
  return {
    id: "lic_test",
    issuer_id: "iss_test",
    activation_code: "CODE-1234",
    status: "activated",
    expires_at: null,
    product_status: "active",
    product_id: "prd_test",
    ...overrides,
  };
}

describe("verifyLicenseGateCompat", () => {
  let db: FakeDB;

  beforeEach(() => {
    db = new FakeDB();
  });

  it("returns VALID for an active license with an active product", async () => {
    db.issuers.push(makeIssuer());
    db.licenses.push(makeLicense());
    const env = await makeEnv(db);

    const res = await verifyLicenseGateCompat(env, {
      userId: "user_abc",
      licenseKey: "CODE-1234",
      options: {},
    });

    expect(res.valid).toBe(true);
    expect(res.result).toBe("VALID");
  });

  it("returns NOT_FOUND when activation_code does not exist", async () => {
    db.issuers.push(makeIssuer());
    db.licenses.push(makeLicense());
    const env = await makeEnv(db);

    const res = await verifyLicenseGateCompat(env, {
      userId: "user_abc",
      licenseKey: "WRONG-CODE",
      options: {},
    });

    expect(res.valid).toBe(false);
    expect(res.result).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND when public_user_id does not match", async () => {
    db.issuers.push(makeIssuer());
    db.licenses.push(makeLicense());
    const env = await makeEnv(db);

    const res = await verifyLicenseGateCompat(env, {
      userId: "wrong_user",
      licenseKey: "CODE-1234",
      options: {},
    });

    expect(res.valid).toBe(false);
    expect(res.result).toBe("NOT_FOUND");
  });

  it("returns NOT_ACTIVE when license status is disabled", async () => {
    db.issuers.push(makeIssuer());
    db.licenses.push(makeLicense({ status: "disabled" }));
    const env = await makeEnv(db);

    const res = await verifyLicenseGateCompat(env, {
      userId: "user_abc",
      licenseKey: "CODE-1234",
      options: {},
    });

    expect(res.valid).toBe(false);
    expect(res.result).toBe("NOT_ACTIVE");
  });

  it("returns NOT_ACTIVE when license status is revoked", async () => {
    db.issuers.push(makeIssuer());
    db.licenses.push(makeLicense({ status: "revoked" }));
    const env = await makeEnv(db);

    const res = await verifyLicenseGateCompat(env, {
      userId: "user_abc",
      licenseKey: "CODE-1234",
      options: {},
    });

    expect(res.valid).toBe(false);
    expect(res.result).toBe("NOT_ACTIVE");
  });

  it("returns NOT_ACTIVE when product status is archived", async () => {
    db.issuers.push(makeIssuer());
    db.licenses.push(makeLicense({ product_status: "archived" }));
    const env = await makeEnv(db);

    const res = await verifyLicenseGateCompat(env, {
      userId: "user_abc",
      licenseKey: "CODE-1234",
      options: {},
    });

    expect(res.valid).toBe(false);
    expect(res.result).toBe("NOT_ACTIVE");
  });

  it("returns EXPIRED when expires_at is in the past", async () => {
    db.issuers.push(makeIssuer());
    db.licenses.push(
      makeLicense({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    );
    const env = await makeEnv(db);

    const res = await verifyLicenseGateCompat(env, {
      userId: "user_abc",
      licenseKey: "CODE-1234",
      options: {},
    });

    expect(res.valid).toBe(false);
    expect(res.result).toBe("EXPIRED");
  });

  it("does not include signedChallenge when no challenge is provided", async () => {
    db.issuers.push(makeIssuer());
    db.licenses.push(makeLicense());
    const env = await makeEnv(db);

    const res = await verifyLicenseGateCompat(env, {
      userId: "user_abc",
      licenseKey: "CODE-1234",
      options: {},
    });

    expect(res.valid).toBe(true);
    expect(res.signedChallenge).toBeUndefined();
  });

  it("returns a signed challenge JWS with correct payload when challenge is provided", async () => {
    db.issuers.push(makeIssuer());
    db.licenses.push(makeLicense());
    const env = await makeEnv(db);

    const res = await verifyLicenseGateCompat(env, {
      userId: "user_abc",
      licenseKey: "CODE-1234",
      options: { challenge: "test-nonce" },
    });

    expect(res.valid).toBe(true);
    expect(res.signedChallenge).toBeDefined();

    const segments = res.signedChallenge!.split(".");
    expect(segments).toHaveLength(3);

    const payload = JSON.parse(decodeBase64UrlToString(segments[1]!));
    expect(payload.kind).toBe("licensegate-challenge");
    expect(payload.challenge).toBe("test-nonce");
    expect(payload.license_id).toBe("lic_test");
    expect(payload.key_id).toBe("kid_test");
  });
});