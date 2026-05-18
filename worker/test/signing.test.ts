import { describe, expect, it } from "vitest";
import type { Env } from "../src/types";
import { decodeBase64UrlToBytes, decodeBase64UrlToString } from "../src/utils/base64url";
import { signJws } from "../src/crypto/signing";

describe("signJws", () => {
  it("creates an ES256 JWS that verifies with the public key", async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    const env = {
      SIGNING_PRIVATE_JWK: JSON.stringify(privateJwk),
      SIGNING_KEY_ID: "kid_test"
    } as Env;

    const token = await signJws({ sub: "license" }, env);
    const [headerSegment, payloadSegment, signatureSegment] = token.split(".");

    expect(JSON.parse(decodeBase64UrlToString(headerSegment!))).toMatchObject({
      alg: "ES256",
      kid: "kid_test"
    });
    expect(JSON.parse(decodeBase64UrlToString(payloadSegment!))).toEqual({ sub: "license" });

    const signatureBytes = decodeBase64UrlToBytes(signatureSegment!);
    const signatureBuffer = new ArrayBuffer(signatureBytes.byteLength);
    new Uint8Array(signatureBuffer).set(signatureBytes);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.publicKey,
      signatureBuffer,
      new TextEncoder().encode(`${headerSegment}.${payloadSegment}`)
    );
    expect(valid).toBe(true);
  });
});
