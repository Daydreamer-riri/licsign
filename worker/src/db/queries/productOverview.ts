import { first, all } from "../d1";

export interface ProductLicenseCounts {
  available: number;
  activated: number;
  disabled: number;
  revoked: number;
  total: number;
}

export async function getLicenseCountsByStatus(
  db: D1Database,
  issuerId: string,
  productId: string,
): Promise<ProductLicenseCounts> {
  const rows = await all<{ status: string; count: number }>(
    db
      .prepare(
        `SELECT status, COUNT(*) AS count
         FROM licenses
         WHERE issuer_id = ? AND product_id = ?
         GROUP BY status`,
      )
      .bind(issuerId, productId),
  );

  const counts: ProductLicenseCounts = {
    available: 0,
    activated: 0,
    disabled: 0,
    revoked: 0,
    total: 0,
  };
  for (const row of rows) {
    if (
      row.status === "available" ||
      row.status === "activated" ||
      row.status === "disabled" ||
      row.status === "revoked"
    ) {
      counts[row.status] = row.count;
    }
    counts.total += row.count;
  }
  return counts;
}

export async function getBatchCount(
  db: D1Database,
  issuerId: string,
  productId: string,
): Promise<number> {
  const row = await first<{ count: number }>(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM license_batches WHERE issuer_id = ? AND product_id = ?",
      )
      .bind(issuerId, productId),
  );
  return row?.count ?? 0;
}

export interface ProductRecentActivation {
  activation_id: string;
  license_id: string;
  activation_code: string;
  machine_hash: string;
  device_label: string | null;
  platform: string | null;
  activated_at: string;
}

export async function getRecentActivationsByProduct(
  db: D1Database,
  issuerId: string,
  productId: string,
  limit: number,
): Promise<ProductRecentActivation[]> {
  return all<ProductRecentActivation>(
    db
      .prepare(
        `SELECT
          activations.id AS activation_id,
          licenses.id AS license_id,
          licenses.activation_code,
          activations.machine_hash,
          activations.device_label,
          activations.platform,
          activations.activated_at
         FROM activations
         JOIN licenses ON licenses.id = activations.license_id
         WHERE licenses.issuer_id = ?
           AND licenses.product_id = ?
           AND activations.status = 'active'
         ORDER BY activations.activated_at DESC
         LIMIT ?`,
      )
      .bind(issuerId, productId, limit),
  );
}
