import { NextResponse } from "next/server";
import { listLlmCallLogs } from "@/lib/llm/llmCallLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") ?? "40")),
  );
  const feature = url.searchParams.get("feature")?.trim();
  let logs = await listLlmCallLogs(limit);
  if (feature) {
    logs = logs.filter((l) => l.feature === feature);
  }
  return NextResponse.json({
    count: logs.length,
    logFile: "llm-call-log.jsonl",
    items: logs,
  });
}
