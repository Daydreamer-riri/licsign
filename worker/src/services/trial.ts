import { trialRequestSchema } from "../../../shared/src/schemas";
import type { ClientActivationError, SignedLicenseResponse } from "../../../shared/src/types";
import type { ProductRow, TrialActivationRow } from "../db/models";
import type { Env } from "../types";
import { first, run } from "../db/d1";
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

  const product = await first<ProductRow>(
    env.DB.prepare("SELECT * FROM products WHERE code = ?").bind(input.product_code)
  );
  if (!product || product.status !== "active") {
    throw new ApiError<ClientActivationError>(404, "PRODUCT_NOT_FOUND", "Product was not found");
  }

  const trial = ensureTrialIsActive(product);

  const issuedAtMs = Date.now();
  const issuedAt = new Date(issuedAtMs).toISOString();
  const tokenExpiresAt = new Date(issuedAtMs + trial.ttlSeconds * 1000).toISOString();

  const existing = await first<TrialActivationRow>(
    env.DB
      .prepare("SELECT * FROM trial_activations WHERE product_id = ? AND machine_hash = ?")
      .bind(product.id, input.machine_hash)
  );

  const firstSeen = !existing;
  if (existing) {
    await run(
      env.DB
        .prepare(
          `UPDATE trial_activations
           SET last_seen_at = ?,
               last_token_expires_at = ?,
               token_count = token_count + 1,
               device_label = COALESCE(?, device_label),
               client_version = COALESCE(?, client_version),
               platform = COALESCE(?, platform)
           WHERE id = ?`
        )
        .bind(
          issuedAt,
          tokenExpiresAt,
          input.device_label ?? null,
          input.client_version ?? null,
          input.platform ?? null,
          existing.id
        )
    );
  } else {
    await run(
      env.DB
        .prepare(
          `INSERT INTO trial_activations
            (id, issuer_id, product_id, machine_hash, device_label, client_version, platform,
             first_seen_at, last_seen_at, last_token_expires_at, token_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
        )
        .bind(
          createId("trl"),
          product.issuer_id,
          product.id,
          input.machine_hash,
          input.device_label ?? null,
          input.client_version ?? null,
          input.platform ?? null,
          issuedAt,
          issuedAt,
          tokenExpiresAt
        )
    );
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
