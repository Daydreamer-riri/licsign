import { describe, expect, it } from "vitest";
import { buildClientConfig } from "../src/services/clientConfig";
import type { Env } from "../src/types";
import type { ProductRow } from "../src/db/models";

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

/** Minimal D1 stub serving only `products.findById`. */
function fakeDb(products: ProductRow[]): D1Database {
  return {
    prepare(sql: string) {
      const norm = sql.replace(/\s+/g, " ").trim();
      let args: unknown[] = [];
      return {
        bind(...a: unknown[]) {
          args = a;
          return this;
        },
        async first<T>(): Promise<T | null> {
          if (
            norm.includes("FROM products") &&
            norm.includes("WHERE id = ? AND issuer_id = ?")
          ) {
            const [id, issuerId] = args as [string, string];
            return (
              (products.find(
                (p) => p.id === id && p.issuer_id === issuerId,
              ) as T) ?? null
            );
          }
          throw new Error(`unhandled first(): ${norm}`);
        },
      };
    },
  } as unknown as D1Database;
}

async function makeEnv(over: Partial<Env> = {}): Promise<Env> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  return {
    SIGNING_PRIVATE_JWK: JSON.stringify(privateJwk),
    SIGNING_KEY_ID: "kid_test",
    LICENSE_ISSUER: "licsign",
    ...over,
  } as Env;
}

describe("buildClientConfig", () => {
  it("bundles every integration input with a public-only signing key", async () => {
    const env = await makeEnv();
    const db = fakeDb([
      makeProduct({ id: "prd_a", issuer_id: "iss_1", code: "flow", trial_enabled: 1 }),
    ]);

    const config = await buildClientConfig(
      db,
      env,
      "iss_1",
      "prd_a",
      "https://licsign.example.com",
    );

    expect(config.base_url).toBe("https://licsign.example.com");
    expect(config.product_code).toBe("flow");
    expect(config.expected_issuer).toBe("licsign");
    expect(config.trial_enabled).toBe(true);
    expect(config.signing_keys).toHaveLength(1);

    const [key] = config.signing_keys;
    expect(key!.kid).toBe("kid_test");
    expect(key!.alg).toBe("ES256");
    expect(key!.public_jwk).toMatchObject({ kty: "EC", crv: "P-256" });
    expect(key!.public_jwk).not.toHaveProperty("d");
  });

  it("rejects a product that belongs to another issuer", async () => {
    const env = await makeEnv();
    const db = fakeDb([makeProduct({ id: "prd_a", issuer_id: "iss_1" })]);
    await expect(
      buildClientConfig(db, env, "iss_2", "prd_a", "https://x"),
    ).rejects.toThrow();
  });
});
