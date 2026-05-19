import { activateSchema, deactivateSchema } from "../../../shared/src/schemas";
import type { ClientActivationError, SignedLicenseResponse } from "../../../shared/src/types";
import type { LicenseWithProductRow } from "../db/models";
import type { Env } from "../types";
import { nowIso } from "../utils/time";
import { issueSignedLicense } from "./issuance";
import { ApiError } from "../utils/http";
import { createId } from "../utils/id";
import { writeAuditLog } from "./audit";
import * as licenseQueries from "../db/queries/licenses";
import * as activationQueries from "../db/queries/activations";

export async function activate(env: Env, body: unknown): Promise<SignedLicenseResponse> {
  const input = activateSchema.parse(body);
  const license = await licenseQueries.findByActivationCode(env.DB, input.activation_code);
  if (!license) {
    throw new ApiError<ClientActivationError>(404, "INVALID_CODE", "Activation code was not found");
  }

  ensureLicenseCanActivate(license, input.product_code);

  const now = nowIso();
  const existing = await activationQueries.findByLicenseAndMachine(env.DB, license.id, input.machine_hash);

  if (existing?.status === "active") {
    await activationQueries.updateLastSeen(env.DB, existing.id, {
      now,
      deviceLabel: input.device_label ?? null,
      clientVersion: input.client_version ?? null,
      platform: input.platform ?? null,
    });
    return issueSignedLicense(env, {
      license_id: license.id,
      product_code: license.product_code,
      machine_hash: input.machine_hash,
      expires_at: license.expires_at,
      max_devices: license.max_devices,
      issued_at: now,
    });
  }

  const activeCount = await activationQueries.countActiveByLicense(env.DB, license.id);

  if (activeCount >= license.max_devices) {
    throw new ApiError<ClientActivationError>(409, "DEVICE_LIMIT_REACHED", "Device limit reached");
  }

  if (existing?.status === "deactivated") {
    await activationQueries.reactivate(env.DB, existing.id, {
      deviceLabel: input.device_label ?? null,
      clientVersion: input.client_version ?? null,
      platform: input.platform ?? null,
      now,
    });
  } else {
    await activationQueries.create(env.DB, {
      id: createId("act"),
      licenseId: license.id,
      machineHash: input.machine_hash,
      deviceLabel: input.device_label ?? null,
      clientVersion: input.client_version ?? null,
      platform: input.platform ?? null,
      now,
    });
  }

  if (license.status === "available") {
    await licenseQueries.markActivated(env.DB, license.id, now);
  }

  await writeAuditLog(env.DB, {
    issuerId: license.issuer_id,
    actorType: "client",
    action: "client.activate",
    targetType: "license",
    targetId: license.id,
    details: {
      product_code: license.product_code,
      machine_hash: input.machine_hash,
      platform: input.platform ?? null
    }
  });

  return issueSignedLicense(env, {
    license_id: license.id,
    product_code: license.product_code,
    machine_hash: input.machine_hash,
    expires_at: license.expires_at,
    max_devices: license.max_devices,
    issued_at: now,
  });
}

export async function deactivate(env: Env, body: unknown) {
  const input = deactivateSchema.parse(body);
  const license = await licenseQueries.findByActivationCode(env.DB, input.activation_code);
  if (!license) {
    throw new ApiError<ClientActivationError>(404, "INVALID_CODE", "Activation code was not found");
  }
  if (license.product_code !== input.product_code) {
    throw new ApiError<ClientActivationError>(409, "PRODUCT_MISMATCH", "Activation code does not belong to this product");
  }

  const now = nowIso();
  await activationQueries.deactivateByLicenseAndMachine(env.DB, license.id, input.machine_hash, now);
  await writeAuditLog(env.DB, {
    issuerId: license.issuer_id,
    actorType: "client",
    action: "client.deactivate",
    targetType: "license",
    targetId: license.id,
    details: { machine_hash: input.machine_hash }
  });

  return { ok: true };
}

function ensureLicenseCanActivate(license: LicenseWithProductRow, productCode: string): void {
  if (license.product_code !== productCode || license.product_status !== "active") {
    throw new ApiError<ClientActivationError>(409, "PRODUCT_MISMATCH", "Activation code does not belong to this active product");
  }
  if (license.status === "disabled") {
    throw new ApiError<ClientActivationError>(403, "LICENSE_DISABLED", "License is disabled");
  }
  if (license.status === "revoked") {
    throw new ApiError<ClientActivationError>(403, "LICENSE_REVOKED", "License is revoked");
  }
  if (license.expires_at && new Date(license.expires_at).getTime() <= Date.now()) {
    throw new ApiError<ClientActivationError>(403, "LICENSE_EXPIRED", "License is expired");
  }
}