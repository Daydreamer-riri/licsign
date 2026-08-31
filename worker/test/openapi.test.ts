import { describe, expect, it } from "vitest";
import { openApiDocument } from "../src/openapi";

describe("OpenAPI document", () => {
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
