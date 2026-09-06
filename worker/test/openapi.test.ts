import { describe, expect, it } from "vitest";
import { openApiDocument } from "../src/openapi";

describe("OpenAPI document", () => {
  it("documents device self-service endpoints", () => {
    expect(openApiDocument.paths["/api/client/devices"]?.post.responses).toMatchObject({
      "200": { description: "Active devices and seat usage" },
      "404": { description: "INVALID_CODE" },
      "429": { description: "RATE_LIMIT_EXCEEDED" },
    });
    expect(
      openApiDocument.paths["/api/client/devices/{activationId}/deactivate"]?.post.responses,
    ).toMatchObject({
      "200": { description: "Deactivation result" },
      "404": { description: "INVALID_CODE or DEVICE_NOT_FOUND" },
      "429": { description: "RATE_LIMIT_EXCEEDED" },
    });
  });

  it("documents the evaluation endpoint and stable errors", () => {
    const endpoint = openApiDocument.paths["/api/client/evaluate"];

    expect(endpoint?.post.responses).toMatchObject({
      "200": { description: "Signed evaluation license" },
      "400": { description: "BAD_REQUEST" },
      "403": { description: "EVALUATION_INACTIVE or EVALUATION_EXPIRED" },
      "404": { description: "PRODUCT_NOT_FOUND" },
    });
  });
});
