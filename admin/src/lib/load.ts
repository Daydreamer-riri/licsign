import { redirect } from "react-router";
import { ApiError } from "./api";

/**
 * Wraps an API call made inside a `clientLoader`. A 401 becomes a clean
 * redirect to `/login`; any other failure rethrows so the route's
 * `ErrorBoundary` renders it.
 */
export async function load<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      throw redirect("/login");
    }
    throw err;
  }
}
