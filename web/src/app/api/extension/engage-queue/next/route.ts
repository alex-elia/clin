import { NextResponse } from "next/server";
import { getNextEngageItem } from "@/lib/cleaningEngageQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getNextEngageItem();
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
