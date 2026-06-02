import { NextResponse } from "next/server";
import { buildTelemetrySummary } from "@/lib/telemetry/telemetrySummary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const daysRaw = url.searchParams.get("days");
  const days =
    daysRaw != null && Number.isFinite(Number(daysRaw))
      ? Number(daysRaw)
      : 30;

  try {
    const summary = await buildTelemetrySummary({ days });
    return NextResponse.json(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
