import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "./api";
import { useApi } from "./useApi";

describe("useApi", () => {
  it("starts in a loading state and resolves with data", async () => {
    const { result } = renderHook(() =>
      useApi(() => Promise.resolve({ n: 1 }), []),
    );
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ n: 1 });
    expect(result.current.error).toBeNull();
  });

  it("exposes the error message when the fetcher rejects", async () => {
    const { result } = renderHook(() =>
      useApi(() => Promise.reject(new ApiError("boom", 500)), []),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("boom");
    expect(result.current.data).toBeNull();
  });
});
