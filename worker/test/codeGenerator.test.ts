import { describe, expect, it } from "vitest";
import { generateActivationCode } from "../src/services/codeGenerator";

describe("generateActivationCode", () => {
  it("generates friendly grouped codes", () => {
    const code = generateActivationCode("TV");
    expect(code).toMatch(/^TV-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(code).not.toMatch(/[OI10]/);
  });

  it("generates unprefixed codes", () => {
    expect(generateActivationCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
});
