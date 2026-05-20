import { first, all, run } from "../d1";
import type { ActivationRow, LicenseWithProductRow } from "../models";

export interface ActivationLicenseRow extends LicenseWithProductRow {
  activation_id: string;
}

/**
 * Finds the active activation for a device on a License that belongs to the
 * given Product code. Backs the restore flow. Matches `status = 'active'` only;
 * if a device has more than one active activation for the Product, the most
 * recently used one wins.
 */
export async function findActiveByMachineAndProduct(
  db: D1Database,
  machineHash: string,
  productCode: string,
): Promise<ActivationLicenseRow | null> {
  return first<ActivationLicenseRow>(
    db
      .prepare(
        `SELECT
          licenses.*,
          products.code AS product_code,
          products.status AS product_status,
          products.issuer_id AS product_issuer_id,
          activations.id AS activation_id
         FROM activations
         JOIN licenses ON licenses.id = activations.license_id
         JOIN products ON products.id = licenses.product_id
         WHERE activations.machine_hash = ?
           AND products.code = ?
           AND activations.status = 'active'
         ORDER BY activations.last_seen_at DESC, activations.activated_at DESC
         LIMIT 1`,
      )
      .bind(machineHash, productCode),
  );
}

export async function findByLicenseAndMachine(
  db: D1Database,
  licenseId: string,
  machineHash: string,
): Promise<{ id: string; status: "active" | "deactivated" } | null> {
  return first<{ id: string; status: "active" | "deactivated" }>(
    db
      .prepare("SELECT id, status FROM activations WHERE license_id = ? AND machine_hash = ?")
      .bind(licenseId, machineHash),
  );
}

export async function countActiveByLicense(
  db: D1Database,
  licenseId: string,
): Promise<number> {
  const row = await first<{ count: number }>(
    db
      .prepare("SELECT COUNT(*) AS count FROM activations WHERE license_id = ? AND status = 'active'")
      .bind(licenseId),
  );
  return row?.count ?? 0;
}

export async function create(
  db: D1Database,
  params: {
    id: string;
    licenseId: string;
    machineHash: string;
    deviceLabel: string | null;
    clientVersion: string | null;
    platform: string | null;
    now: string;
  },
): Promise<void> {
  await run(
    db
      .prepare(
        `INSERT INTO activations
          (id, license_id, machine_hash, device_label, client_version, platform, status, activated_at, last_seen_at, license_payload_version)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, 1)`,
      )
      .bind(
        params.id,
        params.licenseId,
        params.machineHash,
        params.deviceLabel,
        params.clientVersion,
        params.platform,
        params.now,
        params.now,
      ),
  );
}

export async function reactivate(
  db: D1Database,
  activationId: string,
  params: {
    deviceLabel: string | null;
    clientVersion: string | null;
    platform: string | null;
    now: string;
  },
): Promise<void> {
  await run(
    db
      .prepare(
        `UPDATE activations
         SET status = 'active', activated_at = ?, deactivated_at = NULL, last_seen_at = ?,
             device_label = ?, client_version = ?, platform = ?, license_payload_version = 1
         WHERE id = ?`,
      )
      .bind(
        params.now,
        params.now,
        params.deviceLabel,
        params.clientVersion,
        params.platform,
        activationId,
      ),
  );
}

export async function updateLastSeen(
  db: D1Database,
  activationId: string,
  params: {
    now: string;
    deviceLabel: string | null;
    clientVersion: string | null;
    platform: string | null;
  },
): Promise<void> {
  await run(
    db
      .prepare(
        `UPDATE activations
         SET last_seen_at = ?, device_label = COALESCE(?, device_label), client_version = COALESCE(?, client_version), platform = COALESCE(?, platform)
         WHERE id = ?`,
      )
      .bind(params.now, params.deviceLabel, params.clientVersion, params.platform, activationId),
  );
}

export async function deactivateByLicenseAndMachine(
  db: D1Database,
  licenseId: string,
  machineHash: string,
  now: string,
): Promise<void> {
  await run(
    db
      .prepare(
        `UPDATE activations
         SET status = 'deactivated', deactivated_at = ?, last_seen_at = ?
         WHERE license_id = ? AND machine_hash = ? AND status = 'active'`,
      )
      .bind(now, now, licenseId, machineHash),
  );
}

export async function listByLicense(
  db: D1Database,
  licenseId: string,
): Promise<ActivationRow[]> {
  return all<ActivationRow>(
    db
      .prepare("SELECT * FROM activations WHERE license_id = ? ORDER BY activated_at DESC")
      .bind(licenseId),
  );
}
