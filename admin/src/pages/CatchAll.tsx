import { redirect } from "react-router";

/** Unknown paths fall back to the product grid. */
export function clientLoader() {
  throw redirect("/");
}

export default function CatchAll() {
  return null;
}
