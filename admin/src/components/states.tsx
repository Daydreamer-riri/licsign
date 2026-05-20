import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

/** Centered spinner for a whole page or panel that is still loading. */
export function CenteredSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex min-h-60 items-center justify-center text-muted-foreground"
      role="status"
    >
      <Spinner />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Inline error panel with an optional retry action. */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>Something went wrong</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      {onRetry && (
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try Again
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
