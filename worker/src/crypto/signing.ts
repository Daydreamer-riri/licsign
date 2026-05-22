import type { OfflineLicensePayload, PublicJwk } from "../../../shared/src/types";
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

/**
 * Derives the ES256 public JWK from the configured private signing key by
 * dropping the private scalar `d`. The public point (`x`, `y`) already lives in
 * the private JWK, so no separate public-key secret is needed.
 */
export function derivePublicJwk(env: Env): PublicJwk {
  let jwk: JsonWebKey;
  try {
    jwk = JSON.parse(env.SIGNING_PRIVATE_JWK) as JsonWebKey;
  } catch {
    throw new Error("SIGNING_PRIVATE_JWK must be a JSON Web Key");
  }

  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) {
    throw new Error("SIGNING_PRIVATE_JWK must be a P-256 EC key");
  }

  return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
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
