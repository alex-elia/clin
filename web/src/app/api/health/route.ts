import { readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bump when ingest/API behavior changes — extension can ping /api/health to verify. */
const API_REVISION = "2026-05-29-ingest-merge";

function readWebPackageVersion(): string {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

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

  const port = Number(process.env.PORT || 3000);

  let llmProvider: string | null = null;
  try {
    const { getLlmConfigPublic } = await import("@/lib/llm/completeChat");
    const llm = await getLlmConfigPublic();
    llmProvider = llm.provider;
  } catch {
    llmProvider = null;
  }

  return NextResponse.json({
    ok: true,
    service: "clin",
    version: readWebPackageVersion(),
    apiRevision: API_REVISION,
    db: dbOk,
    dbPath,
    lastBackupAt,
    port,
    llmProvider,
    nodeVersion: process.version,
    nodeModules: process.versions.modules,
    time: new Date().toISOString(),
  });
}
