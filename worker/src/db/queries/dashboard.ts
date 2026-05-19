import { first, all } from "../d1";

export async function getProductCount(
  db: D1Database,
  issuerId: string,
): Promise<number> {
  const row = await first<{ count: number }>(
    db.prepare("SELECT COUNT(*) AS count FROM products WHERE issuer_id = ?").bind(issuerId),
  );
  return row?.count ?? 0;
}

export async function getLicenseCount(
  db: D1Database,
  issuerId: string,
): Promise<number> {
  const row = await first<{ count: number }>(
    db.prepare("SELECT COUNT(*) AS count FROM licenses WHERE issuer_id = ?").bind(issuerId),
  );
  return row?.count ?? 0;
}

interface RecentActivation {
  activation_id: string;
  license_id: string;
  activation_code: string;
  product_code: string;
  machine_hash: string;
  device_label: string | null;
  platform: string | null;
  activated_at: string;
}

export async function getRecentActivations(
  db: D1Database,
  issuerId: string,
  limit: number,
): Promise<RecentActivation[]> {
  return all<RecentActivation>(
    db
      .prepare(
        `SELECT
          activations.id AS activation_id,
          licenses.id AS license_id,
          licenses.activation_code,
          products.code AS product_code,
          activations.machine_hash,
          activations.device_label,
          activations.platform,
          activations.activated_at
         FROM activations
         JOIN licenses ON licenses.id = activations.license_id
         JOIN products ON products.id = licenses.product_id
         WHERE licenses.issuer_id = ?
           AND activations.status = 'active'
         ORDER BY activations.activated_at DESC
         LIMIT ?`,
      )
      .bind(issuerId, limit),
  );
}
