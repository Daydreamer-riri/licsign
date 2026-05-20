import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, setUnauthorizedHandler } from "./api";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response);
}

afterEach(() => {
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { value: 42 }));
    const data = await api.get<{ value: number }>("/api/x");
    expect(data.value).toBe(42);
  });

  it("throws an ApiError carrying the server message on failure", async () => {
    vi.stubGlobal("fetch", mockFetch(409, { message: "Conflict happened" }));
    await expect(api.post("/api/x", {})).rejects.toMatchObject({
      status: 409,
      message: "Conflict happened",
    });
  });

  it("invokes the unauthorized handler on a 401 outside auth routes", async () => {
    vi.stubGlobal("fetch", mockFetch(401, { message: "expired" }));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    await expect(api.get("/api/admin/products")).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not invoke the handler for auth probe 401s", async () => {
    vi.stubGlobal("fetch", mockFetch(401, {}));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    await expect(api.get("/api/admin/auth/me")).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
