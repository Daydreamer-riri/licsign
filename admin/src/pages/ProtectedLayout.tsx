import { api } from "@/lib/api";
import { load } from "@/lib/load";
import type { AdminInfo } from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import type { Route } from "./+types/ProtectedLayout";

/**
 * Auth gate for every route below it: a 401 from `/auth/me` is turned into a
 * redirect to `/login` by `load()`. Child route loaders run in parallel with
 * this one; if the session is gone they all redirect to the same place.
 */
export async function clientLoader() {
  const { admin } = await load(
    api.get<{ admin: AdminInfo }>("/api/admin/auth/me"),
  );
  return { admin };
}

export default function ProtectedLayout({ loaderData }: Route.ComponentProps) {
  return <AppShell admin={loaderData.admin} />;
}
