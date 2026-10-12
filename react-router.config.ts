import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // Required by @cloudflare/vite-plugin: the server build runs in the
  // Worker's Vite environment.
  future: {
    v8_viteEnvironmentApi: true,
  },
} satisfies Config;
