import { describe, expect, it } from "vitest";
import { createProductSchema, evaluateRequestSchema, updateProductSchema } from "../../shared/src/schemas";

describe("product schema evaluation fields", () => {
  const base = { code: "tv-app", name: "TV App" };

  it("accepts evaluation_enabled in createProductSchema", () => {
    expect(() =>
      createProductSchema.parse({ ...base, evaluation_enabled: true })
    ).not.toThrow();
  });

  it("accepts evaluation_token_ttl_days in createProductSchema", () => {
    expect(() =>
      createProductSchema.parse({ ...base, evaluation_token_ttl_days: 7 })
    ).not.toThrow();
  });

  it("accepts evaluation_token_ttl_days as null in createProductSchema", () => {
    expect(() =>
      createProductSchema.parse({ ...base, evaluation_token_ttl_days: null })
    ).not.toThrow();
  });

  it("rejects evaluation_token_ttl_days of 0", () => {
    expect(() =>
      createProductSchema.parse({ ...base, evaluation_token_ttl_days: 0 })
    ).toThrow();
  });

  it("rejects negative evaluation_token_ttl_days", () => {
    expect(() =>
      createProductSchema.parse({ ...base, evaluation_token_ttl_days: -1 })
    ).toThrow();
  });

  it("rejects non-integer evaluation_token_ttl_days", () => {
    expect(() =>
      createProductSchema.parse({ ...base, evaluation_token_ttl_days: 1.5 })
    ).toThrow();
  });

  it("accepts evaluation fields in updateProductSchema", () => {
    expect(() =>
      updateProductSchema.parse({ evaluation_enabled: false, evaluation_token_ttl_days: 3 })
    ).not.toThrow();
  });
});

const MACHINE_HASH = "a".repeat(64);

describe("evaluateRequestSchema", () => {
  it("accepts valid product_code and machine_hash", () => {
    expect(() =>
      evaluateRequestSchema.parse({ product_code: "tv-app", machine_hash: MACHINE_HASH })
    ).not.toThrow();
  });

  it("rejects missing machine_hash", () => {
    expect(() =>
      evaluateRequestSchema.parse({ product_code: "tv-app" })
    ).toThrow();
  });

  it("accepts optional client_version and platform", () => {
    expect(() =>
      evaluateRequestSchema.parse({
        product_code: "tv-app",
        machine_hash: MACHINE_HASH,
        client_version: "1.0.0",
        platform: "android-tv"
      })
    ).not.toThrow();
  });
});
