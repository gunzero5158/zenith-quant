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
  if (process.env.NODE_ENV !== "production" || !process.env.TURSO_DATABASE_URL) {
    if (!globalForDb.__zenithDbMigrated) {
      globalForDb.__zenithDbMigrated = migrate(db, {
        migrationsFolder: path.join(process.cwd(), "drizzle"),
      });
    }
    await globalForDb.__zenithDbMigrated;
  }
  return db;
}

export { schema };
