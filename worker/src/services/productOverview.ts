import type { ProductRow } from "../db/models";
import * as productQueries from "../db/queries/products";
import * as overviewQueries from "../db/queries/productOverview";
import { ApiError } from "../utils/http";

export interface ProductOverview {
  product: ProductRow;
  license_counts: overviewQueries.ProductLicenseCounts;
  batch_count: number;
  recent_activations: overviewQueries.ProductRecentActivation[];
}

/** Issuer-scoped summary for a single product's Overview tab. */
export async function getProductOverview(
  db: D1Database,
  issuerId: string,
  productId: string,
  recentLimit = 8,
): Promise<ProductOverview> {
  const product = await productQueries.findById(db, productId, issuerId);
  if (!product) {
    throw new ApiError(404, "NOT_FOUND", "Product not found");
  }

  const [license_counts, batch_count, recent_activations] = await Promise.all([
    overviewQueries.getLicenseCountsByStatus(db, issuerId, productId),
    overviewQueries.getBatchCount(db, issuerId, productId),
    overviewQueries.getRecentActivationsByProduct(db, issuerId, productId, recentLimit),
  ]);

  return { product, license_counts, batch_count, recent_activations };
}
