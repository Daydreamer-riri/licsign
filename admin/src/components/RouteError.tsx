import {
  isRouteErrorResponse,
  useRevalidator,
  useRouteError,
} from "react-router";

import { ErrorState } from "@/components/states";

/**
 * Shared route-level error boundary. Re-export it as `ErrorBoundary` from a
 * route module so a failed `clientLoader` renders inside the surrounding
 * chrome with a retry that revalidates the route.
 */
export function RouteError() {
  const error = useRouteError();
  const revalidator = useRevalidator();

  let message = "An unexpected error occurred.";
  if (isRouteErrorResponse(error)) {
    message =
      typeof error.data === "string" && error.data
        ? error.data
        : `${error.status} ${error.statusText}`;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="py-6">
      <ErrorState
        message={message}
        onRetry={() => revalidator.revalidate()}
      />
    </div>
  );
}
