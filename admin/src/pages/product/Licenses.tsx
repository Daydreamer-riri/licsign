import { Form, Link, useSearchParams } from "react-router";
import { KeyRoundIcon, SearchIcon } from "lucide-react";

import { api } from "@/lib/api";
import { load } from "@/lib/load";
import { formatDate } from "@/lib/format";
import type { License } from "@/lib/types";
import { RouteError } from "@/components/RouteError";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Route } from "./+types/Licenses";
import { useProduct } from "./ProductLayout";

export { RouteError as ErrorBoundary };

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "available", label: "Available" },
  { value: "activated", label: "Activated" },
  { value: "disabled", label: "Disabled" },
  { value: "revoked", label: "Revoked" },
];

export async function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);

  const sp = new URLSearchParams();
  sp.set("product_id", params.id);
  if (q) sp.set("q", q);
  if (status) sp.set("status", status);
  sp.set("take", String(PAGE_SIZE));
  sp.set("skip", String((page - 1) * PAGE_SIZE));

  const data = await load(
    api.get<{ licenses: License[]; count: number }>(
      `/api/admin/licenses?${sp.toString()}`,
    ),
  );
  return { ...data, q, status, page };
}

export default function ProductLicensesPage({
  loaderData,
}: Route.ComponentProps) {
  const { licenses, count, q, status, page } = loaderData;
  const { product } = useProduct();
  const [params, setParams] = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  // Dropdown filter and pagination merge into the existing query string.
  const update = (next: Record<string, string | undefined>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Form
          method="get"
          replace
          role="search"
          className="flex flex-1 gap-2"
        >
          <Input
            key={q}
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search activation code or recipient…"
            spellCheck={false}
            aria-label="Search licenses"
            className="max-w-xs"
          />
          {status && <input type="hidden" name="status" value={status} />}
          <Button type="submit" variant="outline">
            <SearchIcon data-icon="inline-start" />
            Search
          </Button>
        </Form>
        <Select
          value={status || "all"}
          onValueChange={(value) =>
            update({
              status: value === "all" ? undefined : value,
              page: undefined,
            })
          }
        >
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {licenses.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <KeyRoundIcon />
            </EmptyMedia>
            <EmptyTitle>No licenses found</EmptyTitle>
            <EmptyDescription>
              {q || status
                ? "No licenses match the current filters."
                : "Create a batch to generate licenses for this product."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Activation Code</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Devices</TableHead>
                  <TableHead scope="col">Expires</TableHead>
                  <TableHead scope="col">Created</TableHead>
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
                    <TableCell className="tabular-nums">
                      {l.active_device_count}/{l.max_devices}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(l.expires_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(l.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {count} {count === 1 ? "license" : "licenses"}
            </span>
            <div className="flex items-center gap-2">
              <span className="tabular-nums">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => update({ page: String(page - 1) })}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => update({ page: String(page + 1) })}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
