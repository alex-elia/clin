import { NextResponse } from "next/server";
import {
  getPaceUsage,
  resetAllPaceState,
  resetPaceGapTimers,
  resetPaceHourlyCounters,
} from "@/lib/pace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let scope = "all";
  try {
    const body = await req.json();
    if (body?.scope === "gaps" || body?.scope === "hourly" || body?.scope === "all") {
      scope = body.scope;
    }
  } catch {
    /* default all */
  }

  if (scope === "gaps") {
    await resetPaceGapTimers();
  } else if (scope === "hourly") {
    await resetPaceHourlyCounters();
  } else {
    await resetAllPaceState();
  }

  const usage = await getPaceUsage();
  return NextResponse.json({
    ok: true,
    scope,
    usage,
    note:
      "Server pace state reset. Also reset extension counters from the extension Settings gear if captures still block.",
  });
}
