import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness for the Chrome extension and local tooling.
 * @see docs/DESIGN.md — Local API (minimal)
 *
 * Dynamic-import `@/db` so a broken/missing `better-sqlite3` native build does not
 * crash route module load (MODULE_NOT_FOUND on first line of the bundle). We still
 * return 200 with `db: false` when SQLite cannot load.
 */
export async function GET() {
  let dbOk = false;
  let dbPath: string | null = null;
  let lastBackupAt: string | null = null;
  try {
    const { getDb } = await import("@/db");
    getDb();
    dbOk = true;
    const { resolveClinDbPath } = await import("@/lib/dbPathResolve");
    const { getLastBackupMeta } = await import("@/lib/dataPaths");
    dbPath = resolveClinDbPath();
    const backup = await getLastBackupMeta();
    lastBackupAt = backup.at;
  } catch {
    dbOk = false;
  }

  return NextResponse.json({
    ok: true,
    service: "clin",
    db: dbOk,
    dbPath,
    lastBackupAt,
    time: new Date().toISOString(),
  });
}
