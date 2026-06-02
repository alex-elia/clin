import { NextResponse } from "next/server";
import { needsConsentPrompt } from "@/lib/telemetrySettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const needed = await needsConsentPrompt();
    return NextResponse.json({ needed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
