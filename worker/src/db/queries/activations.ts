import { first, all, run } from "../d1";
import type { ActivationRow } from "../models";

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
