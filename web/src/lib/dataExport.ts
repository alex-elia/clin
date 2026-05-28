import fs from "node:fs";
import path from "node:path";
import { getSqlite } from "@/db";
import { prepareDbForFileCopy } from "@/lib/dataPaths";

export const EXPORT_VERSION = 1;

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
] as const;

export type ClinExportBundle = {
  exportVersion: number;
  exportedAt: string;
  dbPath: string;
  tables: Record<string, unknown[]>;
};

function tableExists(name: string): boolean {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    )
    .get(name);
  return Boolean(row);
}

function dumpTable(name: string): unknown[] {
  if (!tableExists(name)) return [];
  const sqlite = getSqlite();
  return sqlite.prepare(`SELECT * FROM ${name}`).all() as unknown[];
}

export function buildExportBundle(): ClinExportBundle {
  prepareDbForFileCopy();
  const tables: Record<string, unknown[]> = {};
  for (const name of EXPORT_TABLES) {
    tables[name] = dumpTable(name);
  }
  const dbPath = prepareDbForFileCopy();
  return {
    exportVersion: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    dbPath,
    tables,
  };
}

export function exportJsonString(): string {
  return JSON.stringify(buildExportBundle(), null, 2);
}

export function writeExportToFile(outPath: string): string {
  const dir = path.dirname(outPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, exportJsonString(), "utf8");
  return outPath;
}
