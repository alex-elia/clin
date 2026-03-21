import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export * from "./schema";

let sqlite: Database.Database | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function dbFilePath() {
  return path.join(process.cwd(), "data", "clin.db");
}

export function getSqlite(): Database.Database {
  if (sqlite) return sqlite;
  const dir = path.dirname(dbFilePath());
  fs.mkdirSync(dir, { recursive: true });
  sqlite = new Database(dbFilePath());
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

export function getDb() {
  if (db) return db;
  db = drizzle(getSqlite(), { schema });
  return db;
}

/** Run SQL migrations from ./drizzle (call once at startup or from script). */
export function runMigrations() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (!fs.existsSync(migrationsFolder)) return;
  migrate(drizzle(getSqlite(), { schema }), { migrationsFolder });
}
