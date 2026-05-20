import { redirect } from "react-router";

/** `/settings` has no page of its own — send it to the first section. */
export function clientLoader() {
  throw redirect("/settings/admins");
}

export default function SettingsIndex() {
  return null;
}
