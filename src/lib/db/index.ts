import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createClient } from "@libsql/client";
import path from "path";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

// Singleton across dev hot-reloads and route bundles.
const globalForDb = globalThis as unknown as {
  __zenithDb?: Database;
  __zenithDbMigrated?: Promise<void>;
};

function createDb(): Database {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) {
    return drizzle(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }), { schema });
  }
  if (process.env.NODE_ENV === "production") {
    // Refusing to start beats silently writing balances and Stripe credits
    // to an ephemeral per-instance file.
    throw new Error("TURSO_DATABASE_URL must be set in production");
  }
  // Local development / tests fall back to a SQLite file with the same driver.
  const file = process.env.DEV_DATABASE_FILE || path.join(process.cwd(), "dev.db");
  return drizzle(createClient({ url: `file:${file}` }), { schema });
}

export function getDb(): Database {
  if (!globalForDb.__zenithDb) {
    globalForDb.__zenithDb = createDb();
  }
  return globalForDb.__zenithDb;
}

// In development the schema is applied automatically on first use; in
// production run `npm run db:migrate` once against Turso instead.
export async function ensureDbReady(): Promise<Database> {
  const db = getDb();
  if (process.env.NODE_ENV !== "production") {
    if (!globalForDb.__zenithDbMigrated) {
      globalForDb.__zenithDbMigrated = migrate(db, {
        migrationsFolder: path.join(process.cwd(), "drizzle"),
      }).catch((err) => {
        // Never cache a rejected migration: a transient failure at cold start
        // must not poison every later request in this process.
        globalForDb.__zenithDbMigrated = undefined;
        throw err;
      });
    }
    await globalForDb.__zenithDbMigrated;
  }
  return db;
}

export { schema };
