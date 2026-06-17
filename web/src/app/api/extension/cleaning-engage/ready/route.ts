import { NextResponse } from "next/server";
import { listPendingCleaningExecItems } from "@/lib/cleaningExecQueueList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Extension handoff: pending engage items with AI comment and post preview. */
export async function GET() {
  const items = await listPendingCleaningExecItems({
    kind: "engage",
    limit: 30,
  });
  return NextResponse.json({
    count: items.length,
    items,
    hint: "Open activity, paste the comment on the post shown (or any recent post), then mark commented. Use Start engage run for paced auto mode.",
  });
}
