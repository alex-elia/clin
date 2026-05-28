import fs from "node:fs";
import path from "node:path";
import {
  prepareDbForFileCopy,
  recordBackup,
  resolveDataDirectory,
} from "@/lib/dataPaths";

function copyIfExists(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.copyFileSync(src, dest);
}

export function backupDatabaseNow(): { path: string; label: string } {
  const dbPath = prepareDbForFileCopy();
  const dataDir = resolveDataDirectory();
  const backupsDir = path.join(dataDir, "backups");
  fs.mkdirSync(backupsDir, { recursive: true });

  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .slice(0, 15);
  const base = `clin-${stamp}`;
  const destDb = path.join(backupsDir, `${base}.db`);
  copyIfExists(dbPath, destDb);
  copyIfExists(`${dbPath}-wal`, `${destDb}-wal`);
  copyIfExists(`${dbPath}-shm`, `${destDb}-shm`);

  return { path: destDb, label: base };
}

export async function backupAndRecord(): Promise<{
  path: string;
  label: string;
}> {
  const result = backupDatabaseNow();
  await recordBackup(result.path);
  return result;
}
