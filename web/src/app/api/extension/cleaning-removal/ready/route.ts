import { NextResponse } from "next/server";
import { listPendingCleaningExecItems } from "@/lib/cleaningExecQueueList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Extension handoff: pending removal items approved from cleaning. */
export async function GET() {
  const items = await listPendingCleaningExecItems({
    kind: "removal",
    limit: 30,
  });
  return NextResponse.json({
    count: items.length,
    items,
    hint: "Open each profile, disconnect on LinkedIn, then mark disconnected. Use Start removal run for paced auto mode.",
  });
}
