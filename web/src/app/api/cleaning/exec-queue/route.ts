import { NextResponse } from "next/server";
import { listPendingCleaningExecItems } from "@/lib/cleaningExecQueueList";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = await listPendingCleaningExecItems({ limit: 100 });
  const engage = items.filter((i) => i.kind === "engage");
  const removal = items.filter((i) => i.kind === "removal");
  return NextResponse.json({
    engage,
    removal,
    counts: { engage: engage.length, removal: removal.length },
  });
}
