import { useEffect } from "react";
import { Outlet, useOutletContext, useParams } from "react-router";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { Product } from "@/lib/types";
import { ProductTabs } from "@/components/ProductTabs";
import { useScope } from "@/components/ScopeContext";
import { StatusBadge } from "@/components/StatusBadge";
import { CenteredSpinner, ErrorState } from "@/components/states";

export interface ProductOutletContext {
  product: Product;
  reloadProduct: () => void;
}

/** Read the parent product context inside any product-scoped page. */
export function useProduct(): ProductOutletContext {
  return useOutletContext<ProductOutletContext>();
}

export function ProductLayout() {
  const { id } = useParams<{ id: string }>();
  const { setProduct } = useScope();
  const { data: product, loading, error, reload } = useApi(
    () => api.get<Product>(`/api/admin/products/${id}`),
    [id],
  );

  useEffect(() => {
    setProduct(product ?? null);
    return () => setProduct(null);
  }, [product, setProduct]);

  if (loading) return <CenteredSpinner />;
  if (error || !product) {
    return (
      <ErrorState message={error ?? "Product not found."} onRetry={reload} />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {product.name}
            </h1>
            <p
              className="mt-0.5 font-mono text-xs text-muted-foreground"
              translate="no"
            >
              {product.code}
            </p>
          </div>
          <StatusBadge status={product.status} />
        </div>
        <ProductTabs productId={product.id} />
      </div>
      <Outlet
        context={
          { product, reloadProduct: reload } satisfies ProductOutletContext
        }
      />
    </div>
  );
}
