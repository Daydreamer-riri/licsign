import { Link } from "react-router";
import { ArrowLeftIcon, DownloadIcon } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { load } from "@/lib/load";
import { formatDate } from "@/lib/format";
import type { Batch, BatchLicense } from "@/lib/types";
import { RouteError } from "@/components/RouteError";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import type { Route } from "./+types/BatchDetail";
import { useProduct } from "./ProductLayout";

export { RouteError as ErrorBoundary };

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return load(
    api.get<{ batch: Batch; licenses: BatchLicense[] }>(
      `/api/admin/batches/${params.batchId}`,
    ),
  );
}

function downloadCodes(batch: Batch, licenses: BatchLicense[]) {
  const rows = [
    "product_code,activation_code",
    ...licenses.map((l) => `${batch.product_code},${l.activation_code}`),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${batch.batch_name.replace(/\s+/g, "-")}-codes.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
  toast.success("Activation codes downloaded");
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export default function BatchDetailPage({ loaderData }: Route.ComponentProps) {
  const { batch, licenses } = loaderData;
  const { product } = useProduct();

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={`/products/${product.id}/batches`}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Batches
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {batch.batch_name}
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCodes(batch, licenses)}
          disabled={licenses.length === 0}
        >
          <DownloadIcon data-icon="inline-start" />
          Download Codes
        </Button>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <DetailRow
            label="Product"
            value={
              <span className="font-mono text-xs" translate="no">
                {batch.product_code}
              </span>
            }
          />
          <DetailRow
            label="Quantity"
            value={<span className="tabular-nums">{batch.quantity}</span>}
          />
          <DetailRow
            label="Device limit"
            value={<span className="tabular-nums">{batch.max_devices}</span>}
          />
          <DetailRow
            label="Code prefix"
            value={
              batch.code_prefix ? (
                <span className="font-mono text-xs" translate="no">
                  {batch.code_prefix}
                </span>
              ) : (
                "—"
              )
            }
          />
          <DetailRow label="Expires" value={formatDate(batch.expires_at)} />
          <DetailRow label="Created" value={formatDate(batch.created_at)} />
          {batch.notes && (
            <div className="col-span-full">
              <DetailRow label="Notes" value={batch.notes} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Licenses{" "}
            <span className="text-muted-foreground tabular-nums">
              ({licenses.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Activation Code</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Device Limit</TableHead>
                <TableHead scope="col">Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {licenses.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs" translate="no">
                    <Link
                      to={`/products/${product.id}/licenses/${l.id}`}
                      className="text-foreground underline-offset-4 hover:underline"
                    >
                      {l.activation_code}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={l.status} />
                  </TableCell>
                  <TableCell className="tabular-nums">{l.max_devices}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatDate(l.expires_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
