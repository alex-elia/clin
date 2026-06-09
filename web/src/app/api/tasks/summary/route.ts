import { NextResponse } from "next/server";
import {
  getDailyReminderSummary,
  shouldShowDailyReminder,
} from "@/lib/dailyReminder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [summary, show] = await Promise.all([
      getDailyReminderSummary(),
      shouldShowDailyReminder(),
    ]);
    return NextResponse.json({ show, ...summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
