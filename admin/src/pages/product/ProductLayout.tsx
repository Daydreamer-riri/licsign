import { Suspense } from "react";
import { Outlet, useRouteLoaderData } from "react-router";

import { api } from "@/lib/api";
import { load } from "@/lib/load";
import type { Product } from "@/lib/types";
import { ProductTabs } from "@/components/ProductTabs";
import { RouteError } from "@/components/RouteError";
import { CenteredSpinner } from "@/components/states";
import { StatusBadge } from "@/components/StatusBadge";
import type { Route } from "./+types/ProductLayout";

export { RouteError as ErrorBoundary };

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const product = await load(
    api.get<Product>(`/api/admin/products/${params.id}`),
  );
  return { product };
}

/** Read the enclosing product from any product-scoped route. */
export function useProduct(): { product: Product } {
  const data = useRouteLoaderData("product") as
    | { product: Product }
    | undefined;
  if (!data) {
    throw new Error("useProduct must be used within the product route");
  }
  return { product: data.product };
}

export default function ProductLayout({ loaderData }: Route.ComponentProps) {
  const { product } = loaderData;

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
      <Suspense fallback={<CenteredSpinner />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
