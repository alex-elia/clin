import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import type Database from "better-sqlite3";
import { getDb, getSqlite } from "@/db";
import { appSettings } from "@/db/schema";
import {
  defaultDataDirectory,
  resolveClinDbPath,
  resolveDataDirectory,
  writeBootstrapDbDirectory,
} from "@/lib/dbPathResolve";

export {
  defaultDataDirectory,
  migrationsFolderFromCwd,
  resolveClinDbPath,
  resolveDataDirectory,
  writeBootstrapDbDirectory,
} from "@/lib/dbPathResolve";

export const DATA_SETTINGS_KEYS = {
  dbDirectory: "data.db_directory",
  lastBackupAt: "data.last_backup_at",
  lastBackupPath: "data.last_backup_path",
} as const;

export async function getStoredDbDirectory(): Promise<string | null> {
  try {
    const db = getDb();
    const row = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, DATA_SETTINGS_KEYS.dbDirectory),
    });
    const v = row?.value?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export async function setStoredDbDirectory(
  directory: string | null,
): Promise<void> {
  writeBootstrapDbDirectory(directory ?? defaultDataDirectory());
  const db = getDb();
  const now = new Date();
  if (!directory) {
    await db
      .delete(appSettings)
      .where(eq(appSettings.key, DATA_SETTINGS_KEYS.dbDirectory));
    return;
  }
  const key = DATA_SETTINGS_KEYS.dbDirectory;
  const value = path.resolve(directory);
  const existing = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, key),
  });
  if (existing) {
    await db
      .update(appSettings)
      .set({ value, updatedAt: now })
      .where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, updatedAt: now });
  }
}

export function checkpointWal(sqlite: Database.Database): void {
  sqlite.pragma("wal_checkpoint(FULL)");
}

export type DataPathInfo = {
  dbPath: string;
  dataDirectory: string;
  bootstrapDirectory: string | null;
  storedDirectory: string | null;
  envOverride: string | null;
  restartRequiredNote: string;
};

export async function getDataPathInfo(): Promise<DataPathInfo> {
  const cwd = process.cwd();
  const dbPath = resolveClinDbPath(cwd);
  const envOverride = process.env.CLIN_DB_PATH?.trim() || null;
  const { readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const bootstrapFile = join(defaultDataDirectory(cwd), "config.json");
  let bootstrapDirectory: string | null = null;
  if (existsSync(bootstrapFile)) {
    try {
      const raw = JSON.parse(readFileSync(bootstrapFile, "utf8")) as {
        dbDirectory?: string;
      };
      bootstrapDirectory = raw.dbDirectory?.trim() || null;
    } catch {
      bootstrapDirectory = null;
    }
  }
  const storedDirectory = await getStoredDbDirectory();
  return {
    dbPath,
    dataDirectory: resolveDataDirectory(cwd),
    bootstrapDirectory,
    storedDirectory,
    envOverride,
    restartRequiredNote:
      "Changing the database folder takes effect after you restart the Clin dev server (npm run dev).",
  };
}

export async function recordBackup(pathOnDisk: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  for (const [key, value] of [
    [DATA_SETTINGS_KEYS.lastBackupAt, now.toISOString()],
    [DATA_SETTINGS_KEYS.lastBackupPath, pathOnDisk],
  ] as const) {
    const existing = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, key),
    });
    if (existing) {
      await db
        .update(appSettings)
        .set({ value, updatedAt: now })
        .where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({ key, value, updatedAt: now });
    }
  }
}

export async function getLastBackupMeta(): Promise<{
  at: string | null;
  path: string | null;
}> {
  const db = getDb();
  const keys = [
    DATA_SETTINGS_KEYS.lastBackupAt,
    DATA_SETTINGS_KEYS.lastBackupPath,
  ];
  const rows = await db.query.appSettings.findMany({
    where: inArray(appSettings.key, keys),
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    at: map.get(DATA_SETTINGS_KEYS.lastBackupAt) ?? null,
    path: map.get(DATA_SETTINGS_KEYS.lastBackupPath) ?? null,
  };
}

export function prepareDbForFileCopy(): string {
  const sqlite = getSqlite();
  checkpointWal(sqlite);
  return resolveClinDbPath();
}
