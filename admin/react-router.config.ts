import type { Config } from "@react-router/dev/config";

// SPA mode: the admin console is fully behind authentication with all data
// coming from D1 at runtime, so there is nothing meaningful to server-render
// or pre-render. The build emits static assets served by the Worker.
export default {
  ssr: false,
  appDirectory: "src",
} satisfies Config;
