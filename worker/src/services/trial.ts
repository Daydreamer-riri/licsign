import { trialRequestSchema } from "../../../shared/src/schemas";
import type { ClientActivationError, SignedLicenseResponse } from "../../../shared/src/types";
import type { ProductRow, TrialActivationRow } from "../db/models";
import type { Env } from "../types";
import * as productQueries from "../db/queries/products";
import * as trialQueries from "../db/queries/trials";
import { issueSignedLicense } from "./issuance";
import { ApiError } from "../utils/http";
import { createId } from "../utils/id";
import { writeAuditLog } from "./audit";

interface ActiveTrialConfig {
  ttlSeconds: number;
  startAt: string;
  endAt: string;
}

export async function issueTrial(env: Env, body: unknown): Promise<SignedLicenseResponse> {
  const input = trialRequestSchema.parse(body);

  const product = await productQueries.findByCode(env.DB, input.product_code);
  if (!product || product.status !== "active") {
    throw new ApiError<ClientActivationError>(404, "PRODUCT_NOT_FOUND", "Product was not found");
  }

  const trial = ensureTrialIsActive(product);

  const issuedAtMs = Date.now();
  const issuedAt = new Date(issuedAtMs).toISOString();
  const tokenExpiresAt = new Date(issuedAtMs + trial.ttlSeconds * 1000).toISOString();

  const existing = await trialQueries.findByProductAndMachine(env.DB, product.id, input.machine_hash);

  const firstSeen = !existing;
  if (existing) {
    await trialQueries.update(env.DB, existing.id, {
      issuedAt: issuedAt,
      tokenExpiresAt,
      deviceLabel: input.device_label ?? null,
      clientVersion: input.client_version ?? null,
      platform: input.platform ?? null,
    });
  } else {
    await trialQueries.create(env.DB, {
      id: createId("trl"),
      issuerId: product.issuer_id,
      productId: product.id,
      machineHash: input.machine_hash,
      deviceLabel: input.device_label ?? null,
      clientVersion: input.client_version ?? null,
      platform: input.platform ?? null,
      issuedAt,
      tokenExpiresAt,
    });
  }

  await writeAuditLog(env.DB, {
    issuerId: product.issuer_id,
    actorType: "client",
    action: "client.trial",
    targetType: "product",
    targetId: product.id,
    details: {
      machine_hash: input.machine_hash,
      first_seen: firstSeen,
      token_expires_at: tokenExpiresAt,
      platform: input.platform ?? null
    }
  });

  return issueSignedLicense(env, {
    kind: "trial",
    license_id: null,
    product_code: product.code,
    machine_hash: input.machine_hash,
    expires_at: tokenExpiresAt,
    max_devices: 1,
    issued_at: issuedAt,
  });
}

function ensureTrialIsActive(product: ProductRow): ActiveTrialConfig {
  if (product.trial_enabled !== 1) {
    throw new ApiError<ClientActivationError>(403, "TRIAL_INACTIVE", "Trial is not enabled for this product");
  }
  const { trial_start_at, trial_end_at, trial_token_ttl_seconds } = product;
  if (!trial_start_at || !trial_end_at || trial_token_ttl_seconds === null) {
    throw new ApiError<ClientActivationError>(403, "TRIAL_INACTIVE", "Trial configuration is incomplete");
  }
  const now = Date.now();
  if (now < Date.parse(trial_start_at) || now >= Date.parse(trial_end_at)) {
    throw new ApiError<ClientActivationError>(403, "TRIAL_INACTIVE", "Trial window is not active");
  }
  return { ttlSeconds: trial_token_ttl_seconds, startAt: trial_start_at, endAt: trial_end_at };
}
