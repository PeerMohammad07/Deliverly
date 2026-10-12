import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Cloudflare Workers can't reuse a database connection across requests
 * (a shared client hangs the second request), so worker/app.ts creates
 * one client per request and runs the request inside runWithPrisma.
 * The default export resolves to that request's client, so the rest of
 * the app keeps importing `prisma` as before.
 */
const requestClient = new AsyncLocalStorage<PrismaClient>();

export function createPrismaClient(connectionString: string): PrismaClient {
  if (!connectionString) {
    throw new Error(
      "No database connection string. Set the DATABASE_URL secret or a HYPERDRIVE binding.",
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export function runWithPrisma<T>(client: PrismaClient, fn: () => T): T {
  return requestClient.run(client, fn);
}

export function currentClient(): PrismaClient {
  const client = requestClient.getStore();
  if (!client) {
    throw new Error(
      "Database used outside a request. Queries must run inside a request handled by worker/app.ts.",
    );
  }
  return client;
}

const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = currentClient();
    const value: unknown = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export default prisma;
