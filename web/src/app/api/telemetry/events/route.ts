import { NextResponse } from "next/server";
import { listAppEvents } from "@/lib/telemetry/appEventLog";
import { resolveDataDirectory } from "@/lib/dataPaths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tech-facing event log (local JSONL). Filter by action, e.g. capture_ingest.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action")?.trim() || undefined;
  const errorsOnly = url.searchParams.get("errorsOnly") === "1";
  const limit = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50),
  );

  const items = await listAppEvents({ action, errorsOnly, limit });
  const dataDir = resolveDataDirectory();

  return NextResponse.json({
    items,
    logFile: `${dataDir}/app-events.jsonl`,
    hint:
      "Extension capture failures log here as capture_ingest with ok=false and an error field. Raw file: app-events.jsonl in your Clin data folder.",
  });
}
