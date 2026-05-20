import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Covers license, activation, and product statuses in one map.
const DOT: Record<string, string> = {
  available: "bg-sky-500",
  activated: "bg-emerald-500",
  active: "bg-emerald-500",
  disabled: "bg-amber-500",
  deactivated: "bg-muted-foreground",
  revoked: "bg-destructive",
  archived: "bg-muted-foreground",
};

const LABEL: Record<string, string> = {
  available: "Available",
  activated: "Activated",
  active: "Active",
  disabled: "Disabled",
  deactivated: "Deactivated",
  revoked: "Revoked",
  archived: "Archived",
};

/** Single source of truth for status pills across the admin UI. */
export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", className)}>
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", DOT[status] ?? "bg-muted-foreground")}
      />
      {LABEL[status] ?? status}
    </Badge>
  );
}
