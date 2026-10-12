import type { Session } from "@shopify/shopify-api";
import type { PrismaClient } from "@prisma/client";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { currentClient } from "./db.server";

/**
 * Shopify's PrismaSessionStorage, one instance per request.
 *
 * Its constructor starts a "does the table exist" query in the
 * background. Created once at startup, that query outlives the first
 * request, which Cloudflare Workers don't allow. Created per request,
 * it runs and finishes inside the request that uses it.
 */
export class RequestScopedSessionStorage {
  private readonly byClient = new WeakMap<
    PrismaClient,
    PrismaSessionStorage<PrismaClient>
  >();

  private storage(): PrismaSessionStorage<PrismaClient> {
    const client = currentClient();
    let storage = this.byClient.get(client);
    if (!storage) {
      storage = new PrismaSessionStorage(client);
      this.byClient.set(client, storage);
    }
    return storage;
  }

  storeSession(session: Session) {
    return this.storage().storeSession(session);
  }

  loadSession(id: string) {
    return this.storage().loadSession(id);
  }

  deleteSession(id: string) {
    return this.storage().deleteSession(id);
  }

  deleteSessions(ids: string[]) {
    return this.storage().deleteSessions(ids);
  }

  findSessionsByShop(shop: string) {
    return this.storage().findSessionsByShop(shop);
  }
}
