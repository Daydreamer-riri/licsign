import type { Context } from "hono";
import { ZodError } from "zod";
import type { ApiErrorResponse } from "../../../shared/src/types";

export class ApiError<TCode extends string = string> extends Error {
  constructor(
    public readonly status: number,
    public readonly code: TCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export function jsonError<TCode extends string>(
  c: Context,
  status: number,
  code: TCode,
  message: string,
  details?: unknown
): Response {
  return c.json({ error: code, message, details } satisfies ApiErrorResponse<TCode>, status as never);
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ApiError(400, "BAD_REQUEST", "Request validation failed", error.flatten());
  }

  console.error(error);
  return new ApiError(500, "SERVER_ERROR", "Internal server error");
}
