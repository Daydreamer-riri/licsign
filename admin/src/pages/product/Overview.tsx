import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { PlusIcon } from "lucide-react";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ProductOverview } from "@/lib/types";
import { BatchFormDialog } from "@/components/BatchFormDialog";
import { StatTile } from "@/components/StatTile";
import { CenteredSpinner, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProduct } from "./ProductLayout";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export function ProductOverviewPage() {
  const { product } = useProduct();
  const navigate = useNavigate();
  const [batchOpen, setBatchOpen] = useState(false);
  const { data, loading, error, reload } = useApi(
    () =>
      api.get<ProductOverview>(`/api/admin/products/${product.id}/overview`),
    [product.id],
  );

  if (loading) return <CenteredSpinner />;
  if (error || !data) {
    return <ErrorState message={error ?? "Failed to load."} onRetry={reload} />;
  }

  const counts = data.license_counts;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">Overview</h2>
        <Button size="sm" onClick={() => setBatchOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          New Batch
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total Licenses" value={counts.total} />
        <StatTile label="Activated" value={counts.activated} />
        <StatTile label="Available" value={counts.available} />
        <StatTile label="Batches" value={data.batch_count} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activations</CardTitle>
            <CardDescription>
              Latest device activations for this product.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {data.recent_activations.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No activations yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Activation Code</TableHead>
                    <TableHead scope="col">Device</TableHead>
                    <TableHead scope="col">Activated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recent_activations.map((a) => (
                    <TableRow key={a.activation_id}>
                      <TableCell className="font-mono text-xs" translate="no">
                        <Link
                          to={`/products/${product.id}/licenses/${a.license_id}`}
                          className="text-foreground underline-offset-4 hover:underline"
                        >
                          {a.activation_code}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.device_label || a.platform || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {formatDateTime(a.activated_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              <DetailRow
                label="Device limit"
                value={
                  <span className="tabular-nums">
                    {product.default_max_devices}
                  </span>
                }
              />
              <DetailRow
                label="Trial"
                value={product.trial_enabled === 1 ? "Enabled" : "Disabled"}
              />
              <DetailRow
                label="Disabled"
                value={<span className="tabular-nums">{counts.disabled}</span>}
              />
              <DetailRow
                label="Revoked"
                value={<span className="tabular-nums">{counts.revoked}</span>}
              />
              <DetailRow
                label="Created"
                value={
                  <span className="tabular-nums">
                    {formatDate(product.created_at)}
                  </span>
                }
              />
            </dl>
          </CardContent>
        </Card>
      </div>

      <BatchFormDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        productId={product.id}
        onCreated={(batchId) =>
          navigate(`/products/${product.id}/batches/${batchId}`)
        }
      />
    </div>
  );
}
