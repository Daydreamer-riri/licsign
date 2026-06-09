import { evaluateRequestSchema } from "../../../shared/src/schemas";
import type { ClientActivationError, SignedLicenseResponse } from "../../../shared/src/types";
import type { Env } from "../types";
import * as productQueries from "../db/queries/products";
import * as evaluationQueries from "../db/queries/evaluations";
import { issueSignedLicense } from "./issuance";
import { ApiError } from "../utils/http";
import { createId } from "../utils/id";
import { writeAuditLog } from "./audit";

export async function issueEvaluation(env: Env, body: unknown): Promise<SignedLicenseResponse> {
  const input = evaluateRequestSchema.parse(body);

  const product = await productQueries.findByCode(env.DB, input.product_code);
  if (!product) {
    throw new ApiError<ClientActivationError>(404, "PRODUCT_NOT_FOUND", "Product was not found");
  }

  if (product.evaluation_enabled !== 1 || product.evaluation_token_ttl_days === null) {
    throw new ApiError<ClientActivationError>(403, "EVALUATION_INACTIVE", "Evaluation is not enabled for this product");
  }

  const existing = await evaluationQueries.findByProductAndMachine(env.DB, product.id, input.machine_hash);

  const now = Date.now();
  let expiresAt: string;
  let firstIssued: boolean;

  if (existing) {
    const expiresAtMs = Date.parse(existing.expires_at);
    if (isNaN(expiresAtMs)) {
      throw new ApiError<ClientActivationError>(500, "SERVER_ERROR", "Evaluation record has invalid expiry");
    }
    if (now >= expiresAtMs) {
      await writeAuditLog(env.DB, {
        issuerId: product.issuer_id,
        actorType: "client",
        action: "client.evaluate_expired",
        targetType: "product",
        targetId: product.id,
        details: {
          machine_hash: input.machine_hash,
          expired_at: existing.expires_at,
          platform: input.platform ?? null,
        },
      });
      throw new ApiError<ClientActivationError>(403, "EVALUATION_EXPIRED", "Evaluation period has expired for this device");
    }
    expiresAt = existing.expires_at;
    firstIssued = false;
  } else {
    expiresAt = new Date(now + product.evaluation_token_ttl_days * 86400_000).toISOString();
    firstIssued = true;
    try {
      await evaluationQueries.create(env.DB, {
        id: createId("eva"),
        issuerId: product.issuer_id,
        productId: product.id,
        machineHash: input.machine_hash,
        firstIssuedAt: new Date(now).toISOString(),
        expiresAt,
      });
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        const race = await evaluationQueries.findByProductAndMachine(env.DB, product.id, input.machine_hash);
        if (!race) {
          throw error;
        }
        const racedExpiresAtMs = Date.parse(race.expires_at);
        if (isNaN(racedExpiresAtMs) || now >= racedExpiresAtMs) {
          throw new ApiError<ClientActivationError>(403, "EVALUATION_EXPIRED", "Evaluation period has expired for this device");
        }
        expiresAt = race.expires_at;
        firstIssued = false;
      } else {
        throw error;
      }
    }
  }

  const issuedAt = new Date(now).toISOString();
  const token = await issueSignedLicense(env, {
    kind: "evaluation",
    license_id: null,
    product_code: product.code,
    machine_hash: input.machine_hash,
    expires_at: expiresAt,
    max_devices: 1,
    issued_at: issuedAt,
  });

  await writeAuditLog(env.DB, {
    issuerId: product.issuer_id,
    actorType: "client",
    action: "client.evaluate",
    targetType: "product",
    targetId: product.id,
    details: {
      machine_hash: input.machine_hash,
      first_issued: firstIssued,
      expires_at: expiresAt,
      platform: input.platform ?? null,
    },
  });

  return token;
}
