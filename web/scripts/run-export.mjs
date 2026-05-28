import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { resolveClinDbPath } from "./lib/resolve-db-path.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

const EXPORT_TABLES = [
  "contacts",
  "capture_sessions",
  "contact_snapshots",
  "tags",
  "contact_tags",
  "notes",
  "action_queue",
  "outreach_campaigns",
  "outreach_campaign_members",
  "user_context",
  "app_settings",
  "inbox_thread_state",
  "extension_snapshots",
  "automation_log",
  "outreach_send_log",
];

const dbPath = resolveClinDbPath(webRoot);
const sqlite = new Database(dbPath);
sqlite.pragma("wal_checkpoint(FULL)");

const tables = {};
for (const name of EXPORT_TABLES) {
  const exists = sqlite
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
    )
    .get(name);
  tables[name] = exists ? sqlite.prepare(`SELECT * FROM ${name}`).all() : [];
}

const bundle = {
  exportVersion: 1,
  exportedAt: new Date().toISOString(),
  dbPath,
  tables,
};

const outDir = path.dirname(dbPath);
const stamp = new Date().toISOString().slice(0, 10);
const outFile = path.join(outDir, `clin-export-${stamp}.json`);
fs.writeFileSync(outFile, JSON.stringify(bundle, null, 2));
console.info(`[clin] Exported to ${outFile}`);
sqlite.close();
