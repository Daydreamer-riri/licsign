import { restoreSchema } from "../../../shared/src/schemas";
import type { ClientActivationError, SignedLicenseResponse } from "../../../shared/src/types";
import type { Env } from "../types";
import { nowIso } from "../utils/time";
import { ApiError } from "../utils/http";
import { issueSignedLicense } from "./issuance";
import { ensureLicenseServiceable } from "./license-state";
import { writeAuditLog } from "./audit";
import * as productQueries from "../db/queries/products";
import * as activationQueries from "../db/queries/activations";

/**
 * Re-issues a signed Offline License for a device that already holds an active
 * activation, identified by `machine_hash` + `product_code` alone. Restore is a
 * lookup-and-reissue: it never creates an activation row, never counts seats,
 * and never reactivates a deactivated activation.
 */
export async function restoreLicense(env: Env, body: unknown): Promise<SignedLicenseResponse> {
  const input = restoreSchema.parse(body);

  // Resolve the Product first so an unknown code is distinguishable from a
  // device that has no active activation. An archived Product is intentionally
  // not rejected here — it surfaces as PRODUCT_MISMATCH from the shared
  // License-state validator, consistent with activation.
  const product = await productQueries.findByCode(env.DB, input.product_code);
  if (!product) {
    throw new ApiError<ClientActivationError>(404, "PRODUCT_NOT_FOUND", "Product was not found");
  }

  const match = await activationQueries.findActiveByMachineAndProduct(
    env.DB,
    input.machine_hash,
    input.product_code,
  );
  if (!match) {
    await writeAuditLog(env.DB, {
      issuerId: product.issuer_id,
      actorType: "client",
      action: "client.restore_failed",
      targetType: "product",
      targetId: product.id,
      details: {
        product_code: input.product_code,
        machine_hash: input.machine_hash,
        reason: "NO_ACTIVATION",
      },
    });
    throw new ApiError<ClientActivationError>(404, "NO_ACTIVATION", "No active activation for this device and product");
  }

  ensureLicenseServiceable(match, input.product_code);

  const now = nowIso();
  await activationQueries.updateLastSeen(env.DB, match.activation_id, {
    now,
    deviceLabel: null,
    clientVersion: null,
    platform: null,
  });

  await writeAuditLog(env.DB, {
    issuerId: match.issuer_id,
    actorType: "client",
    action: "client.restore",
    targetType: "license",
    targetId: match.id,
    details: {
      product_code: input.product_code,
      machine_hash: input.machine_hash,
      license_id: match.id,
    },
  });

  return issueSignedLicense(env, {
    license_id: match.id,
    product_code: input.product_code,
    machine_hash: input.machine_hash,
    expires_at: match.expires_at,
    max_devices: match.max_devices,
    issued_at: now,
  });
}
