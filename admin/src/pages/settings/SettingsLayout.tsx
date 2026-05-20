import { Outlet } from "react-router";

import { SettingsNav } from "@/components/SettingsNav";

export function SettingsLayout() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <SettingsNav />
      </div>
      <Outlet />
    </div>
  );
}
