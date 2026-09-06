import { createRoutesStub } from "react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import DevicesPage from "./Devices";

const MACHINE_HASH = "a".repeat(58) + "123456";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

afterEach(() => vi.unstubAllGlobals());

test("warns before deactivating when the activation code cannot reactivate devices", async () => {
  const response = {
    product: { code: "tv-app", name: "电视应用" },
    license: { status: "revoked", max_devices: 1, active_devices: 1, can_reactivate: false },
    devices: [{
      id: "act_one",
      device_label: null,
      platform: null,
      activated_at: "2026-05-18T00:00:00.000Z",
      last_seen_at: null,
      machine_hash_suffix: "123456",
    }],
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(response)));
  const user = userEvent.setup();
  const Stub = createRoutesStub([{ path: "/devices", Component: DevicesPage }]);

  render(<Stub initialEntries={["/devices"]} />);
  await user.type(screen.getByLabelText("激活码"), "TV-ABCD-EFGH-JKLM-NPQR");
  await user.click(screen.getByRole("button", { name: "查看设备" }));
  await user.click(await screen.findByRole("button", { name: "停用设备" }));

  expect(screen.getByText(/当前无法重新激活设备，停用后可能无法恢复/)).toBeInTheDocument();
});

test("activation code holder can view and deactivate one device", async () => {
  const active = {
    product: { code: "tv-app", name: "电视应用" },
    license: { status: "activated", max_devices: 2, active_devices: 1, can_reactivate: true },
    devices: [{
      id: "act_one",
      device_label: "客厅电视",
      platform: "android-tv",
      activated_at: "2026-05-18T00:00:00.000Z",
      last_seen_at: "2026-05-19T00:00:00.000Z",
      machine_hash_suffix: MACHINE_HASH.slice(-6),
    }],
  };
  const empty = {
    ...active,
    license: { ...active.license, active_devices: 0 },
    devices: [],
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(active))
    .mockResolvedValueOnce(jsonResponse({ ok: true }))
    .mockResolvedValueOnce(jsonResponse(empty));
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  const Stub = createRoutesStub([{ path: "/devices", Component: DevicesPage }]);

  render(<Stub initialEntries={["/devices"]} />);
  await user.type(screen.getByLabelText("激活码"), "TV-ABCD-EFGH-JKLM-NPQR");
  await user.click(screen.getByRole("button", { name: "查看设备" }));

  expect(await screen.findByText("客厅电视")).toBeInTheDocument();
  expect(screen.getByText(/设备尾号 123456/)).toBeInTheDocument();
  expect(screen.queryByText(MACHINE_HASH)).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "停用设备" }));
  expect(screen.getByText(/不会立即让该设备上的离线许可证失效/)).toBeInTheDocument();
  await user.click(screen.getAllByRole("button", { name: "停用设备" }).at(-1)!);

  await waitFor(() => expect(screen.getByText("没有占用名额的设备")).toBeInTheDocument());
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "/api/client/devices/act_one/deactivate",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ activation_code: "TV-ABCD-EFGH-JKLM-NPQR" }),
    }),
  );
});
