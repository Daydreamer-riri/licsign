import { first, all, run } from "../d1";
import type { LicenseWithProductRow, LicenseRow } from "../models";

export async function findByActivationCode(
  db: D1Database,
  activationCode: string,
): Promise<LicenseWithProductRow | null> {
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
         WHERE licenses.activation_code = ?`,
      )
      .bind(activationCode),
  );
}

export async function markActivated(
  db: D1Database,
  licenseId: string,
  now: string,
): Promise<void> {
  await run(
    db
      .prepare(
        "UPDATE licenses SET status = 'activated', activated_at = COALESCE(activated_at, ?), updated_at = ? WHERE id = ?",
      )
      .bind(now, now, licenseId),
  );
}

export async function findById(
  db: D1Database,
  licenseId: string,
  issuerId: string,
): Promise<Record<string, unknown> | null> {
  return first(
    db
      .prepare(
        `SELECT licenses.*, products.code AS product_code, products.name AS product_name
         FROM licenses
         JOIN products ON products.id = licenses.product_id
         WHERE licenses.id = ? AND licenses.issuer_id = ?`,
      )
      .bind(licenseId, issuerId),
  );
}

export async function search(
  db: D1Database,
  whereSql: string,
  bindings: unknown[],
  take: number,
  skip: number,
): Promise<Record<string, unknown>[]> {
  return all(
    db
      .prepare(
        `SELECT
          licenses.*,
          products.code AS product_code,
          products.name AS product_name,
          COUNT(activations.id) AS active_device_count
         FROM licenses
         JOIN products ON products.id = licenses.product_id
         LEFT JOIN activations ON activations.license_id = licenses.id AND activations.status = 'active'
         WHERE ${whereSql}
         GROUP BY licenses.id
         ORDER BY licenses.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, take, skip),
  );
}

export async function countForSearch(
  db: D1Database,
  whereSql: string,
  bindings: unknown[],
): Promise<number> {
  const row = await first<{ count: number }>(
    db.prepare(`SELECT COUNT(*) AS count FROM licenses WHERE ${whereSql}`).bind(...bindings),
  );
  return row?.count ?? 0;
}

export async function updateStatus(
  db: D1Database,
  licenseId: string,
  issuerId: string,
  status: string,
  now: string,
): Promise<void> {
  await run(
    db
      .prepare("UPDATE licenses SET status = ?, updated_at = ? WHERE id = ? AND issuer_id = ?")
      .bind(status, now, licenseId, issuerId),
  );
}

export async function updateRevoked(
  db: D1Database,
  licenseId: string,
  issuerId: string,
  reason: string | null,
  now: string,
): Promise<void> {
  await run(
    db
      .prepare(
        `UPDATE licenses
         SET status = 'revoked', revoked_at = ?, revoked_reason = ?, updated_at = ?
         WHERE id = ? AND issuer_id = ?`,
      )
      .bind(now, reason, now, licenseId, issuerId),
  );
}

export async function findByIdSimple(
  db: D1Database,
  licenseId: string,
): Promise<LicenseRow | null> {
  return first<LicenseRow>(
    db.prepare("SELECT * FROM licenses WHERE id = ?").bind(licenseId),
  );
}

export async function findByIdAndIssuer(
  db: D1Database,
  licenseId: string,
  issuerId: string,
): Promise<LicenseRow | null> {
  return first<LicenseRow>(
    db.prepare("SELECT * FROM licenses WHERE id = ? AND issuer_id = ?").bind(licenseId, issuerId),
  );
}

interface CompatLicenseRow {
  id: string;
  issuer_id: string;
  activation_code: string;
  status: "available" | "activated" | "disabled" | "revoked";
  expires_at: string | null;
  product_status: "active" | "archived";
}

export async function findForCompat(
  db: D1Database,
  activationCode: string,
  publicUserId: string,
): Promise<CompatLicenseRow | null> {
  return first<CompatLicenseRow>(
    db
      .prepare(
        `SELECT licenses.*, products.status AS product_status
         FROM licenses
         JOIN products ON products.id = licenses.product_id
         JOIN issuers ON issuers.id = licenses.issuer_id
         WHERE licenses.activation_code = ?
           AND issuers.public_user_id = ?`,
      )
      .bind(activationCode, publicUserId),
  );
}
