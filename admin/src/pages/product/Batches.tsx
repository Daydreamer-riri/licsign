import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { LayersIcon, PlusIcon } from "lucide-react";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatDate } from "@/lib/format";
import type { Batch } from "@/lib/types";
import { BatchFormDialog } from "@/components/BatchFormDialog";
import { CenteredSpinner, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
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
import { useProduct } from "./ProductLayout";

export function ProductBatchesPage() {
  const { product } = useProduct();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const { data, loading, error, reload } = useApi(
    () => api.get<{ batches: Batch[] }>("/api/admin/batches"),
    [],
  );

  const batches =
    data?.batches.filter((b) => b.product_id === product.id) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">Batches</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          New Batch
        </Button>
      </div>

      {loading && <CenteredSpinner />}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data &&
        (batches.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayersIcon />
              </EmptyMedia>
              <EmptyTitle>No batches yet</EmptyTitle>
              <EmptyDescription>
                Generate a batch of activation codes for this product.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setCreateOpen(true)}>
                <PlusIcon data-icon="inline-start" />
                New Batch
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Batch</TableHead>
                  <TableHead scope="col">Quantity</TableHead>
                  <TableHead scope="col">Device Limit</TableHead>
                  <TableHead scope="col">Expires</TableHead>
                  <TableHead scope="col">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link
                        to={`/products/${product.id}/batches/${b.id}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {b.batch_name}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{b.quantity}</TableCell>
                    <TableCell className="tabular-nums">
                      {b.max_devices}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(b.expires_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(b.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}

      <BatchFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        productId={product.id}
        onCreated={(batchId) =>
          navigate(`/products/${product.id}/batches/${batchId}`)
        }
      />
    </div>
  );
}
