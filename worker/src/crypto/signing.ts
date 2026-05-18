import type { OfflineLicensePayload } from "../../../shared/src/types";
import type { Env } from "../types";
import { encodeBase64Url } from "../utils/base64url";

const textEncoder = new TextEncoder();

interface JwsHeader {
  alg: "ES256";
  typ: "JWT";
  kid: string;
}

async function importPrivateKey(env: Env): Promise<CryptoKey> {
  let jwk: JsonWebKey;
  try {
    jwk = JSON.parse(env.SIGNING_PRIVATE_JWK) as JsonWebKey;
  } catch {
    throw new Error("SIGNING_PRIVATE_JWK must be a JSON Web Key");
  }

  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

export async function signJws(payload: unknown, env: Env): Promise<string> {
  const key = await importPrivateKey(env);
  const header: JwsHeader = {
    alg: "ES256",
    typ: "JWT",
    kid: env.SIGNING_KEY_ID
  };
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    textEncoder.encode(signingInput)
  );

  return `${signingInput}.${encodeBase64Url(signature)}`;
}

export async function signOfflineLicense(
  payload: OfflineLicensePayload,
  env: Env
): Promise<{ token: string; signature: string }> {
  const token = await signJws(payload, env);
  const signature = token.split(".")[2] ?? "";
  return { token, signature };
}
