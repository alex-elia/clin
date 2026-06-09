import { NextResponse } from "next/server";
import { getNextRemovalItem } from "@/lib/cleaningRemovalQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getNextRemovalItem();
  if (!result.item) {
    return NextResponse.json({
      item: null,
      reason: result.reason,
      waitMs: result.waitMs ?? 0,
    });
  }
  return NextResponse.json({
    item: result.item,
    waitMs: result.waitMs,
  });
}
