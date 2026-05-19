import * as dashboardQueries from "../db/queries/dashboard";

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
  const [product_count, license_count, recent_activations] = await Promise.all([
    dashboardQueries.getProductCount(db, issuerId),
    dashboardQueries.getLicenseCount(db, issuerId),
    dashboardQueries.getRecentActivations(db, issuerId, limit),
  ]);

  return { product_count, license_count, recent_activations };
}
