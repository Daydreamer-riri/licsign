import { useState } from "react";
import { Link, useRevalidator } from "react-router";
import { PackageIcon, PlusIcon } from "lucide-react";

import { api } from "@/lib/api";
import { load } from "@/lib/load";
import { formatDateTime } from "@/lib/format";
import type { DashboardStats, ProductWithCount } from "@/lib/types";
import { ProductFormDialog } from "@/components/ProductFormDialog";
import { RouteError } from "@/components/RouteError";
import { StatTile } from "@/components/StatTile";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Route } from "./+types/Products";

export { RouteError as ErrorBoundary };

export async function clientLoader() {
  const [products, stats] = await Promise.all([
    load(api.get<{ products: ProductWithCount[] }>("/api/admin/products")),
    load(api.get<DashboardStats>("/api/admin/dashboard/stats?limit=6")),
  ]);
  return { products: products.products, stats };
}

function ProductCard({ product }: { product: ProductWithCount }) {
  return (
    <Link
      to={`/products/${product.id}`}
      className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardHeader>
          <CardTitle className="truncate">{product.name}</CardTitle>
          <CardDescription
            className="truncate font-mono text-xs"
            translate="no"
          >
            {product.code}
          </CardDescription>
          <CardAction>
            <StatusBadge status={product.status} />
          </CardAction>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          {product.description ? (
            <p className="line-clamp-2">{product.description}</p>
          ) : (
            <p className="text-muted-foreground/70">No description</p>
          )}
        </CardContent>
        <CardFooter className="justify-between text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground tabular-nums">
              {product.license_count}
            </span>{" "}
            {product.license_count === 1 ? "license" : "licenses"}
          </span>
          {product.trial_enabled === 1 && (
            <Badge variant="secondary">Trial</Badge>
          )}
        </CardFooter>
      </Card>
    </Link>
  );
}

export default function ProductsPage({ loaderData }: Route.ComponentProps) {
  const { products, stats } = loaderData;
  const revalidator = useRevalidator();
  const [createOpen, setCreateOpen] = useState(false);

  const totalLicenses = products.reduce((sum, p) => sum + p.license_count, 0);
  const trialCount = products.filter((p) => p.trial_enabled === 1).length;
  const productIdByCode = new Map(products.map((p) => [p.code, p.id]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Products</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          New Product
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Products" value={products.length} />
        <StatTile label="Licenses" value={totalLicenses} />
        <StatTile label="Trials Enabled" value={trialCount} />
      </div>

      {products.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageIcon />
            </EmptyMedia>
            <EmptyTitle>No products yet</EmptyTitle>
            <EmptyDescription>
              Create your first product to start issuing licenses.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              New Product
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Activations</CardTitle>
          <CardDescription>
            Latest paid-license device activations.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {stats.recent_activations.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No activations yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Product</TableHead>
                  <TableHead scope="col">Activation Code</TableHead>
                  <TableHead scope="col">Device</TableHead>
                  <TableHead scope="col">Activated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recent_activations.map((a) => {
                  const productId = a.product_code
                    ? productIdByCode.get(a.product_code)
                    : undefined;
                  return (
                    <TableRow key={a.activation_id}>
                      <TableCell className="font-mono text-xs" translate="no">
                        {a.product_code ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs" translate="no">
                        {productId ? (
                          <Link
                            to={`/products/${productId}/licenses/${a.license_id}`}
                            className="text-foreground underline-offset-4 hover:underline"
                          >
                            {a.activation_code}
                          </Link>
                        ) : (
                          a.activation_code
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.device_label || a.platform || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {formatDateTime(a.activated_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProductFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => revalidator.revalidate()}
      />
    </div>
  );
}
