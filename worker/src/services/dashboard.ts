import { all, first } from "../db/d1";

interface DashboardStats {
  product_count: number;
  license_count: number;
  recent_activations: Array<{
    activation_id: string;
    license_id: string;
    activation_code: string;
    product_code: string;
    machine_hash: string;
    device_label: string | null;
    platform: string | null;
    activated_at: string;
  }>;
}

export async function getDashboardStats(
  db: D1Database,
  issuerId: string,
  limit = 10
): Promise<DashboardStats> {
  const [productCount, licenseCount, recentActivations] = await Promise.all([
    first<{ count: number }>(
      db.prepare("SELECT COUNT(*) AS count FROM products WHERE issuer_id = ?").bind(issuerId)
    ),
    first<{ count: number }>(
      db.prepare("SELECT COUNT(*) AS count FROM licenses WHERE issuer_id = ?").bind(issuerId)
    ),
    all<{
      activation_id: string;
      license_id: string;
      activation_code: string;
      product_code: string;
      machine_hash: string;
      device_label: string | null;
      platform: string | null;
      activated_at: string;
    }>(
      db.prepare(
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
         LIMIT ?`
      ).bind(issuerId, limit)
    )
  ]);

  return {
    product_count: productCount?.count ?? 0,
    license_count: licenseCount?.count ?? 0,
    recent_activations: recentActivations
  };
}
