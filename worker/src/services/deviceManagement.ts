import { activationCodeSchema, activationIdSchema } from "../../../shared/src/schemas";
import type { ClientActivationError } from "../../../shared/src/types";
import type { Env } from "../types";
import * as activationQueries from "../db/queries/activations";
import * as licenseQueries from "../db/queries/licenses";
import { writeAuditLog } from "./audit";
import { nowIso } from "../utils/time";
import { ApiError } from "../utils/http";
import { ensureLicenseServiceable } from "./license-state";

export async function listActiveDevices(env: Env, body: unknown) {
  const input = activationCodeSchema.parse(body);
  const license = await requireLicense(env.DB, input.activation_code);
  const devices = await activationQueries.listActiveByLicense(env.DB, license.id);
  let canReactivate = true;
  try {
    ensureLicenseServiceable(license, license.product_code);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    canReactivate = false;
  }

  return {
    product: { code: license.product_code, name: license.product_name },
    license: {
      status: license.status,
      max_devices: license.max_devices,
      active_devices: devices.length,
      can_reactivate: canReactivate,
    },
    devices: devices.map((device) => ({
      id: device.id,
      device_label: device.device_label,
      platform: device.platform,
      activated_at: device.activated_at,
      last_seen_at: device.last_seen_at,
      machine_hash_suffix: device.machine_hash.slice(-6),
    })),
  };
}

export async function deactivateManagedDevice(env: Env, activationId: string, body: unknown) {
  const input = activationCodeSchema.parse(body);
  const parsedActivationId = activationIdSchema.parse(activationId);
  const license = await requireLicense(env.DB, input.activation_code);
  const result = await activationQueries.deactivateByLicenseAndId(
    env.DB,
    license.id,
    parsedActivationId,
    nowIso(),
  );
  if (result.meta.changes === 0) {
    throw new ApiError<ClientActivationError>(404, "DEVICE_NOT_FOUND", "Active device was not found");
  }

  await writeAuditLog(env.DB, {
    issuerId: license.issuer_id,
    actorType: "client",
    action: "client.deactivate",
    targetType: "license",
    targetId: license.id,
    details: { activation_id: parsedActivationId },
  });

  return { ok: true };
}

async function requireLicense(db: D1Database, activationCode: string) {
  const license = await licenseQueries.findByActivationCode(db, activationCode);
  if (!license) {
    throw new ApiError<ClientActivationError>(404, "INVALID_CODE", "Activation code was not found");
  }
  return license;
}
