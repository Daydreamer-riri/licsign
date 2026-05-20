const JSON_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

/** A failed API response. `status` is 0 for network failures. */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

let onUnauthorized: (() => void) | null = null;

/** Registered by the auth provider so an expired session redirects to login. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? { Accept: "application/json" } : JSON_HEADERS,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Network error — check your connection and try again.", 0);
  }

  const data = (await res.json().catch(() => null)) as
    | (Record<string, unknown> & { message?: string; code?: string })
    | null;

  if (res.status === 401) {
    // Auth probes (/auth/me, login) handle their own 401s; only an expired
    // mid-session request should trigger the global redirect.
    if (!path.includes("/auth/")) onUnauthorized?.();
    throw new ApiError(
      data?.message ?? "Your session has expired. Sign in again.",
      401,
      data?.code,
    );
  }
  if (!res.ok) {
    throw new ApiError(
      data?.message ?? "Something went wrong. Try again.",
      res.status,
      data?.code,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
};
