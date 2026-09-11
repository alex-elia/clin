import { NextResponse } from "next/server";
import {
  getAutopilotSettings,
  runLlmAnalysisBatch,
} from "@/lib/autopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs Ollama contact analysis sequentially for contacts that have a profile capture
 * and stored name/headline but no LLM JSON yet. Local-only autopilot (no LinkedIn).
 */
export async function POST(req: Request) {
  let body: { limit?: unknown; excludeContactIds?: unknown } = {};
  try {
    body = (await req.json()) as {
      limit?: unknown;
      excludeContactIds?: unknown;
    };
  } catch {
    /* empty body ok */
  }
  const defaults = await getAutopilotSettings();
  const raw =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? body.limit
      : defaults.batchDefaultLimit;
  const limit = Math.min(30, Math.max(1, Math.round(raw)));
  const excludeContactIds = Array.isArray(body.excludeContactIds)
    ? body.excludeContactIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];

  try {
    const { results } = await runLlmAnalysisBatch({ limit, excludeContactIds });
    const ok = results.filter((r) => r.ok).length;
    const fail = results.length - ok;
    return NextResponse.json({
      ok: true,
      limit,
      processed: results.length,
      succeeded: ok,
      failed: fail,
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
