import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { resolveClinDbPath } from "./lib/resolve-db-path.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

function copyIfExists(src, dest) {
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
}

const dbPath = resolveClinDbPath(webRoot);
const sqlite = new Database(dbPath);
sqlite.pragma("wal_checkpoint(FULL)");
sqlite.close();

const dataDir = path.dirname(dbPath);
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
console.info(`[clin] Backup written to ${destDb}`);
