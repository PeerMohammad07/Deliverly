import { createRequire } from "node:module";
import path from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { cloudflare } from "@cloudflare/vite-plugin";

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
// The CLI will eventually stop passing in HOST,
// so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
}

// @prisma/client loads its generated code from ".prisma/client/default",
// which Vite reads as a relative path and leaves unbundled. Point it at
// the generated client's Workers build (wasm.js), found next to
// @prisma/client so it works with pnpm's nested node_modules.
const prismaWorkerClient = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@prisma/client")),
  "../../.prisma/client/wasm.js",
);

// The Worker runs in workerd (also in dev), which can't see this
// process's environment. In dev, pass it the values `shopify app dev`
// sets (or .env provides). Never in builds: vars end up in the deployed
// config, and production uses Cloudflare secrets instead. The database
// needs nothing here: the DB binding uses a local D1 copy in dev.
const DEV_WORKER_VARS = [
  "SHOPIFY_API_KEY",
  "SHOPIFY_API_SECRET",
  "SHOPIFY_APP_URL",
  "SCOPES",
  "SHOP_CUSTOM_DOMAIN",
  "SHOPIFY_APP_HANDLE",
];

function devWorkerVars(mode: string): Record<string, string> {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const vars: Record<string, string> = {};
  for (const name of DEV_WORKER_VARS) {
    const value = process.env[name] ?? fileEnv[name];
    if (value) vars[name] = value;
  }
  return vars;
}

export default defineConfig(
  ({ command, mode }) =>
    ({
      server: {
        allowedHosts: [host],
        cors: {
          preflightContinue: true,
        },
        port: Number(process.env.PORT || 3000),
        hmr: hmrConfig,
        fs: {
          // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
          allow: ["app", "worker", "node_modules"],
        },
      },
      plugins: [
        cloudflare({
          viteEnvironment: { name: "ssr" },
          ...(command === "serve"
            ? {
                config: (config) => ({
                  vars: { ...config.vars, ...devWorkerVars(mode) },
                }),
              }
            : {}),
        }),
        reactRouter(),
        tsconfigPaths(),
      ],
      resolve: {
        alias: { ".prisma/client/default": prismaWorkerClient },
      },
      build: {
        assetsInlineLimit: 0,
      },
      optimizeDeps: {
        include: ["@shopify/app-bridge-react"],
      },
    }) satisfies UserConfig,
);
