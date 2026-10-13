import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";

/**
 * The database is Cloudflare D1, reached through the request's `env.DB`
 * binding. worker/app.ts creates one client per request and runs the
 * request inside runWithPrisma, so nothing database-related is shared
 * between requests. The default export resolves to that request's
 * client, so the rest of the app keeps importing `prisma` as before.
 */
const requestClient = new AsyncLocalStorage<PrismaClient>();

export function createPrismaClient(database: D1Database): PrismaClient {
  if (!database) {
    throw new Error("No D1 database. Check the DB binding in wrangler.jsonc.");
  }
  return new PrismaClient({ adapter: new PrismaD1(database) });
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
