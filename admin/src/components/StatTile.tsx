import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

/** Compact metric card used in stat strips and product overviews. */
export function StatTile({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </span>
      </CardContent>
    </Card>
  );
}
