import { describe, expect, it } from "vitest";
import {
  createBatchSchema,
  VALIDITY_DURATION_MAX_SECONDS,
  VALIDITY_DURATION_MIN_SECONDS,
} from "../../shared/src/schemas";

const base = {
  product_id: "prd_x",
  batch_name: "Initial",
  quantity: 10,
};

describe("createBatchSchema", () => {
  it("accepts batches with neither expiry model", () => {
    expect(() => createBatchSchema.parse(base)).not.toThrow();
  });

  it("accepts batches with only expires_at", () => {
    expect(() =>
      createBatchSchema.parse({ ...base, expires_at: new Date().toISOString() })
    ).not.toThrow();
  });

  it("accepts batches with only validity_duration_seconds", () => {
    expect(() =>
      createBatchSchema.parse({ ...base, validity_duration_seconds: 86400 })
    ).not.toThrow();
  });

  it("rejects batches with both expiry models", () => {
    expect(() =>
      createBatchSchema.parse({
        ...base,
        expires_at: new Date().toISOString(),
        validity_duration_seconds: 86400,
      })
    ).toThrow(/mutually exclusive/);
  });

  it("rejects validity_duration_seconds below 1 day", () => {
    expect(() =>
      createBatchSchema.parse({
        ...base,
        validity_duration_seconds: VALIDITY_DURATION_MIN_SECONDS - 1,
      })
    ).toThrow();
  });

  it("rejects validity_duration_seconds above 100 years", () => {
    expect(() =>
      createBatchSchema.parse({
        ...base,
        validity_duration_seconds: VALIDITY_DURATION_MAX_SECONDS + 1,
      })
    ).toThrow();
  });
});
