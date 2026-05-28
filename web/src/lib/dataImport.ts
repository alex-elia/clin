import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { getSqlite } from "@/db";
import { EXPORT_VERSION, type ClinExportBundle } from "@/lib/dataExport";
import { prepareDbForFileCopy } from "@/lib/dataPaths";

function tableExists(name: string): boolean {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    )
    .get(name);
  return Boolean(row);
}

export function parseImportBundle(raw: string): ClinExportBundle {
  const data = JSON.parse(raw) as ClinExportBundle;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid export file");
  }
  if (data.exportVersion !== EXPORT_VERSION) {
    throw new Error(
      `Unsupported export version ${String(data.exportVersion)} (expected ${EXPORT_VERSION})`,
    );
  }
  if (!data.tables || typeof data.tables !== "object") {
    throw new Error("Export missing tables");
  }
  return data;
}

/**
 * Replace all exportable table contents. Requires explicit confirm in API layer.
 */
export function restoreFromBundle(bundle: ClinExportBundle): void {
  prepareDbForFileCopy();
  const sqlite = getSqlite();
  sqlite.exec("PRAGMA foreign_keys = OFF");
  try {
    for (const name of Object.keys(bundle.tables)) {
      if (!tableExists(name)) continue;
      sqlite.prepare(`DELETE FROM ${name}`).run();
    }
    for (const [name, rows] of Object.entries(bundle.tables)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      if (!tableExists(name)) continue;
      const sample = rows[0] as Record<string, unknown>;
      const cols = Object.keys(sample);
      if (cols.length === 0) continue;
      const placeholders = cols.map(() => "?").join(", ");
      const stmt = sqlite.prepare(
        `INSERT INTO ${name} (${cols.join(", ")}) VALUES (${placeholders})`,
      );
      for (const row of rows) {
        const r = row as Record<string, unknown>;
        stmt.run(...cols.map((c) => r[c] ?? null));
      }
    }
  } finally {
    sqlite.exec("PRAGMA foreign_keys = ON");
  }
}

export function writeImportStagingFile(contents: string): string {
  const dbPath = prepareDbForFileCopy();
  const staging = `${dbPath}.import-${randomUUID().slice(0, 8)}.json`;
  fs.writeFileSync(staging, contents, "utf8");
  return staging;
}
