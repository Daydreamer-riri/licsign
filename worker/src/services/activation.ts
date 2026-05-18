import { activateSchema, deactivateSchema } from "../../../shared/src/schemas";
import type { ClientActivationError, OfflineLicensePayload, SignedLicenseResponse } from "../../../shared/src/types";
import type { LicenseWithProductRow } from "../db/models";
import type { Env } from "../types";
import { first, nowIso, run } from "../db/d1";
import { signOfflineLicense } from "../crypto/signing";
import { ApiError } from "../utils/http";
import { createId } from "../utils/id";
import { writeAuditLog } from "./audit";

export async function activate(env: Env, body: unknown): Promise<SignedLicenseResponse> {
  const input = activateSchema.parse(body);
  const license = await findLicenseByCode(env.DB, input.activation_code);
  if (!license) {
    throw new ApiError<ClientActivationError>(404, "INVALID_CODE", "Activation code was not found");
  }

  ensureLicenseCanActivate(license, input.product_code);

  const now = nowIso();
  const existing = await first<{ id: string; status: "active" | "deactivated" }>(
    env.DB
      .prepare("SELECT id, status FROM activations WHERE license_id = ? AND machine_hash = ?")
      .bind(license.id, input.machine_hash)
  );

  if (existing?.status === "active") {
    await run(
      env.DB
        .prepare(
          `UPDATE activations
           SET last_seen_at = ?, device_label = COALESCE(?, device_label), client_version = COALESCE(?, client_version), platform = COALESCE(?, platform)
           WHERE id = ?`
        )
        .bind(now, input.device_label ?? null, input.client_version ?? null, input.platform ?? null, existing.id)
    );
    return issueSignedLicense(env, license, input.machine_hash, now);
  }

  const activeCount = await first<{ count: number }>(
    env.DB
      .prepare("SELECT COUNT(*) AS count FROM activations WHERE license_id = ? AND status = 'active'")
      .bind(license.id)
  );

  if ((activeCount?.count ?? 0) >= license.max_devices) {
    throw new ApiError<ClientActivationError>(409, "DEVICE_LIMIT_REACHED", "Device limit reached");
  }

  if (existing?.status === "deactivated") {
    await run(
      env.DB
        .prepare(
          `UPDATE activations
           SET status = 'active', activated_at = ?, deactivated_at = NULL, last_seen_at = ?,
               device_label = ?, client_version = ?, platform = ?, license_payload_version = 1
           WHERE id = ?`
        )
        .bind(
          now,
          now,
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
          `INSERT INTO activations
            (id, license_id, machine_hash, device_label, client_version, platform, status, activated_at, last_seen_at, license_payload_version)
           VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, 1)`
        )
        .bind(
          createId("act"),
          license.id,
          input.machine_hash,
          input.device_label ?? null,
          input.client_version ?? null,
          input.platform ?? null,
          now,
          now
        )
    );
  }

  if (license.status === "available") {
    await run(
      env.DB
        .prepare("UPDATE licenses SET status = 'activated', activated_at = COALESCE(activated_at, ?), updated_at = ? WHERE id = ?")
        .bind(now, now, license.id)
    );
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

  return issueSignedLicense(env, license, input.machine_hash, now);
}

export async function deactivate(env: Env, body: unknown) {
  const input = deactivateSchema.parse(body);
  const license = await findLicenseByCode(env.DB, input.activation_code);
  if (!license) {
    throw new ApiError<ClientActivationError>(404, "INVALID_CODE", "Activation code was not found");
  }
  if (license.product_code !== input.product_code) {
    throw new ApiError<ClientActivationError>(409, "PRODUCT_MISMATCH", "Activation code does not belong to this product");
  }

  const now = nowIso();
  await run(
    env.DB
      .prepare(
        `UPDATE activations
         SET status = 'deactivated', deactivated_at = ?, last_seen_at = ?
         WHERE license_id = ? AND machine_hash = ? AND status = 'active'`
      )
      .bind(now, now, license.id, input.machine_hash)
  );
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

async function findLicenseByCode(db: D1Database, activationCode: string): Promise<LicenseWithProductRow | null> {
  return first<LicenseWithProductRow>(
    db
      .prepare(
        `SELECT
          licenses.*,
          products.code AS product_code,
          products.status AS product_status,
          products.issuer_id AS product_issuer_id
         FROM licenses
         JOIN products ON products.id = licenses.product_id
         WHERE licenses.activation_code = ?`
      )
      .bind(activationCode)
  );
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

async function issueSignedLicense(
  env: Env,
  license: LicenseWithProductRow,
  machineHash: string,
  issuedAt: string
): Promise<SignedLicenseResponse> {
  const payload: OfflineLicensePayload = {
    version: 1,
    license_id: license.id,
    product_code: license.product_code,
    machine_hash: machineHash,
    features: [],
    issued_at: issuedAt,
    expires_at: license.expires_at,
    max_devices: license.max_devices,
    issuer: env.LICENSE_ISSUER,
    key_id: env.SIGNING_KEY_ID
  };
  const signed = await signOfflineLicense(payload, env);
  return {
    license: payload,
    signature: signed.signature,
    token: signed.token
  };
}

