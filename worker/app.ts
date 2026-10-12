import { createRequestHandler } from "react-router";
import { createPrismaClient, runWithPrisma } from "../app/db.server";

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  // Virtual module provided by the React Router Vite plugin at build time.
  // eslint-disable-next-line import/no-unresolved
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    // One database client per request: Workers can't share connections
    // between requests. Hyperdrive pools connections when it's bound.
    const prisma = createPrismaClient(
      env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL ?? "",
    );
    return runWithPrisma(prisma, async () => {
      try {
        return await requestHandler(request, { cloudflare: { env, ctx } });
      } finally {
        ctx.waitUntil(prisma.$disconnect());
      }
    });
  },
} satisfies ExportedHandler<Env>;
