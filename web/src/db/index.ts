import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { repairClinSqliteSchema } from "./repairSqlite";

export * from "./schema";
export { repairClinSqliteSchema } from "./repairSqlite";

type DrizzleInstance = ReturnType<typeof drizzle<typeof schema>>;

type ClinDbGlobal = typeof globalThis & {
  __CLIN_SQLITE__?: Database.Database;
  __CLIN_DRIZZLE__?: DrizzleInstance;
  __CLIN_MIGRATED__?: boolean;
  __CLIN_LOGGED_DB_PATH__?: boolean;
};

const g = globalThis as ClinDbGlobal;

/** Support `npm run dev` from `clin/web` or repo root where `web/` exists. */
function migrationsFolder(): string {
  const a = path.join(process.cwd(), "drizzle");
  const b = path.join(process.cwd(), "web", "drizzle");
  if (fs.existsSync(path.join(a, "meta", "_journal.json"))) return a;
  if (fs.existsSync(path.join(b, "meta", "_journal.json"))) return b;
  throw new Error(
    `[clin] Drizzle migrations not found (looked under ${a} and ${b}). cwd=${process.cwd()}`,
  );
}

/**
 * Single canonical DB path next to the `drizzle/` folder (same app that runs migrations).
 */
function dbFilePath(): string {
  const env = process.env.CLIN_DB_PATH?.trim();
  if (env) {
    return path.isAbsolute(env) ? env : path.join(process.cwd(), env);
  }
  const mig = migrationsFolder();
  return path.join(path.dirname(mig), "data", "clin.db");
}

/**
 * Next.js dev may load multiple server chunks (e.g. `/` vs `/contacts`), each with its own
 * copy of this module — separate `let sqlite` would mean some chunks open the DB without
 * running migrations/repair. One process-wide handle fixes "no such column" on route loads.
 */
export function getSqlite(): Database.Database {
  if (g.__CLIN_SQLITE__) {
    repairClinSqliteSchema(g.__CLIN_SQLITE__);
    return g.__CLIN_SQLITE__;
  }

  const file = dbFilePath();
  if (!g.__CLIN_LOGGED_DB_PATH__ && process.env.NODE_ENV !== "production") {
    console.info(`[clin] SQLite file: ${file}`);
    g.__CLIN_LOGGED_DB_PATH__ = true;
  }

  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const instance = new Database(file);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  repairClinSqliteSchema(instance);
  g.__CLIN_SQLITE__ = instance;
  return instance;
}

export function getDb(): DrizzleInstance {
  const client = getSqlite();
  repairClinSqliteSchema(client);

  if (!g.__CLIN_DRIZZLE__) {
    const instance = drizzle(client, { schema });
    if (!g.__CLIN_MIGRATED__) {
      migrate(instance, { migrationsFolder: migrationsFolder() });
      g.__CLIN_MIGRATED__ = true;
    }
    g.__CLIN_DRIZZLE__ = instance;
  }

  return g.__CLIN_DRIZZLE__;
}

export function runMigrations() {
  const client = getSqlite();
  migrate(drizzle(client, { schema }), {
    migrationsFolder: migrationsFolder(),
  });
  repairClinSqliteSchema(client);
}
