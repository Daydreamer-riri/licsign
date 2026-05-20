import { Fragment, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router";
import { ChevronRightIcon } from "lucide-react";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AuditLog } from "@/lib/types";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;

function formatDetails(json: string | null): string | null {
  if (!json) return null;
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const action = params.get("action") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const [actionInput, setActionInput] = useState(action);
  useEffect(() => {
    setActionInput(action);
  }, [action]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, loading, error, reload } = useApi(() => {
    const sp = new URLSearchParams();
    if (action) sp.set("action", action);
    sp.set("take", String(PAGE_SIZE));
    sp.set("skip", String(skip));
    return api.get<{ audit_logs: AuditLog[]; total: number }>(
      `/api/admin/audit-logs?${sp.toString()}`,
    );
  }, [action, page]);

  const update = (next: Record<string, string | undefined>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged, { replace: true });
  };

  const submitFilter = (e: FormEvent) => {
    e.preventDefault();
    update({ action: actionInput.trim() || undefined, page: undefined });
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-muted-foreground">Audit Log</h2>
        <form onSubmit={submitFilter} className="flex gap-2" role="search">
          <Input
            type="search"
            value={actionInput}
            onChange={(e) => setActionInput(e.target.value)}
            placeholder="Filter by action…"
            spellCheck={false}
            aria-label="Filter by action"
            className="w-52"
          />
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </form>
      </div>

      {loading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-11 rounded-lg" />
          ))}
        </div>
      )}

      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="w-8" />
                  <TableHead scope="col">Time</TableHead>
                  <TableHead scope="col">Actor</TableHead>
                  <TableHead scope="col">Action</TableHead>
                  <TableHead scope="col">Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.audit_logs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No audit entries found.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.audit_logs.map((log) => {
                    const expanded = expandedId === log.id;
                    const details = formatDetails(log.details_json);
                    return (
                      <Fragment key={log.id}>
                        <TableRow>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={
                                expanded ? "Hide details" : "Show details"
                              }
                              aria-expanded={expanded}
                              disabled={!details}
                              onClick={() =>
                                setExpandedId(expanded ? null : log.id)
                              }
                            >
                              <ChevronRightIcon
                                className={cn(
                                  "transition-transform",
                                  expanded && "rotate-90",
                                )}
                              />
                            </Button>
                          </TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">
                            {formatDateTime(log.created_at)}
                          </TableCell>
                          <TableCell className="text-xs" translate="no">
                            {log.actor_type}
                            {log.actor_id ? `:${log.actor_id}` : ""}
                          </TableCell>
                          <TableCell className="font-mono text-xs" translate="no">
                            {log.action}
                          </TableCell>
                          <TableCell className="text-xs" translate="no">
                            {log.target_type}
                            {log.target_id ? `:${log.target_id}` : ""}
                          </TableCell>
                        </TableRow>
                        {expanded && details && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={5} className="bg-muted/40">
                              <pre className="overflow-x-auto text-xs whitespace-pre-wrap text-muted-foreground">
                                {details}
                              </pre>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {total} {total === 1 ? "entry" : "entries"}
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
