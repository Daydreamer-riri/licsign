import type { ClientIntegrationConfig } from "../../../shared/src/types";
import type { Env } from "../types";
import * as productQueries from "../db/queries/products";
import { derivePublicJwk } from "../crypto/signing";
import { ApiError } from "../utils/http";

/**
 * Bundles every integration-time input a client integrator needs to activate
 * against and locally verify one product. See docs/client-integration.md §2.
 *
 * `signing_keys` carries only the current signing key — the Worker has no record
 * of retired keys. After a key rotation the operator must add the previous
 * key(s) by hand so older tokens still verify.
 */
export async function buildClientConfig(
  db: D1Database,
  env: Env,
  issuerId: string,
  productId: string,
  baseUrl: string,
): Promise<ClientIntegrationConfig> {
  const product = await productQueries.findById(db, productId, issuerId);
  if (!product) {
    throw new ApiError(404, "NOT_FOUND", "Product not found");
  }

  return {
    base_url: baseUrl,
    product_code: product.code,
    expected_issuer: env.LICENSE_ISSUER,
    trial_enabled: product.trial_enabled === 1,
    signing_keys: [
      {
        kid: env.SIGNING_KEY_ID,
        alg: "ES256",
        public_jwk: derivePublicJwk(env),
      },
    ],
  };
}
