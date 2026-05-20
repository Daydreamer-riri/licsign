import { useState } from "react";
import { Link, useRevalidator } from "react-router";
import { ArrowLeftIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { load } from "@/lib/load";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Activation, License } from "@/lib/types";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { RouteError } from "@/components/RouteError";
import { StatusBadge } from "@/components/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Route } from "./+types/LicenseDetail";
import { useProduct } from "./ProductLayout";

export { RouteError as ErrorBoundary };

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  return load(
    api.get<{ license: License; activations: Activation[] }>(
      `/api/admin/licenses/${params.licenseId}`,
    ),
  );
}

type PendingAction = "disable" | "enable" | "revoke" | null;

const ACTION_COPY: Record<
  Exclude<PendingAction, null>,
  { title: string; description: string; confirmLabel: string; destructive: boolean }
> = {
  disable: {
    title: "Disable this license?",
    description:
      "Future online activation and compatibility checks will be blocked. Already-issued offline licenses keep working until they expire.",
    confirmLabel: "Disable License",
    destructive: false,
  },
  enable: {
    title: "Re-enable this license?",
    description:
      "Online activation and compatibility checks will be allowed again.",
    confirmLabel: "Enable License",
    destructive: false,
  },
  revoke: {
    title: "Revoke this license?",
    description:
      "Revocation is permanent. Future online activation is blocked; already-issued offline licenses keep working until they expire.",
    confirmLabel: "Revoke License",
    destructive: true,
  },
};

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

export default function LicenseDetailPage({ loaderData }: Route.ComponentProps) {
  const { license, activations } = loaderData;
  const { product } = useProduct();
  const revalidator = useRevalidator();
  const [pending, setPending] = useState<PendingAction>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const activeCount = activations.filter((a) => a.status === "active").length;

  const runAction = async () => {
    if (!pending) return;
    try {
      if (pending === "revoke") {
        await api.post(
          `/api/admin/licenses/${license.id}/revoke`,
          revokeReason.trim() ? { reason: revokeReason.trim() } : {},
        );
      } else {
        await api.post(`/api/admin/licenses/${license.id}/${pending}`, {});
      }
      toast.success(`License ${pending}d`);
      setPending(null);
      setRevokeReason("");
      revalidator.revalidate();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Action failed. Try again.",
      );
      throw err;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={`/products/${product.id}/licenses`}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Licenses
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          className="font-mono text-lg font-semibold tracking-tight"
          translate="no"
        >
          {license.activation_code}
        </h2>
        <div className="flex items-center gap-2">
          <StatusBadge status={license.status} />
          {(license.status === "available" ||
            license.status === "activated") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPending("disable")}
            >
              Disable
            </Button>
          )}
          {license.status === "disabled" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPending("enable")}
            >
              Enable
            </Button>
          )}
          {license.status !== "revoked" && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setPending("revoke")}
            >
              Revoke
            </Button>
          )}
        </div>
      </div>

      <Alert>
        <TriangleAlertIcon />
        <AlertTitle>Offline licenses are not instantly revoked</AlertTitle>
        <AlertDescription>
          Disable and revoke only block future online activation, refresh, and
          compatibility checks. Already-issued offline licenses stay valid on
          devices until their own expiry.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <DetailRow
            label="Product"
            value={
              <span className="font-mono text-xs" translate="no">
                {license.product_code}
              </span>
            }
          />
          <DetailRow
            label="Devices"
            value={
              <span className="tabular-nums">
                {activeCount}/{license.max_devices}
              </span>
            }
          />
          <DetailRow label="Issued to" value={license.issued_to || "—"} />
          <DetailRow label="Expires" value={formatDate(license.expires_at)} />
          <DetailRow
            label="First activated"
            value={formatDate(license.activated_at)}
          />
          <DetailRow label="Created" value={formatDate(license.created_at)} />
          {license.batch_id && (
            <DetailRow
              label="Batch"
              value={
                <Link
                  to={`/products/${product.id}/batches/${license.batch_id}`}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  View batch
                </Link>
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Activations{" "}
            <span className="text-muted-foreground tabular-nums">
              ({activations.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {activations.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              This license has never been activated.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Machine Hash</TableHead>
                  <TableHead scope="col">Device</TableHead>
                  <TableHead scope="col">Platform</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Activated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activations.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell
                      className="max-w-40 truncate font-mono text-xs"
                      translate="no"
                    >
                      {a.machine_hash}
                    </TableCell>
                    <TableCell>{a.device_label || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.platform || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
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

      {pending && (
        <ConfirmDialog
          open={pending !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPending(null);
              setRevokeReason("");
            }
          }}
          title={ACTION_COPY[pending].title}
          description={ACTION_COPY[pending].description}
          confirmLabel={ACTION_COPY[pending].confirmLabel}
          destructive={ACTION_COPY[pending].destructive}
          onConfirm={runAction}
          body={
            pending === "revoke" ? (
              <Field>
                <FieldLabel htmlFor="revoke-reason">
                  Reason (optional)
                </FieldLabel>
                <Input
                  id="revoke-reason"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="e.g. Refund issued…"
                />
              </Field>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
