import { NextResponse } from "next/server";
import { setLastConnectionScanAt } from "@/lib/outreachSend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await setLastConnectionScanAt();
  return NextResponse.json({ ok: true });
}
