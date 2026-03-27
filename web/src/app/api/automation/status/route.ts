import { NextResponse } from "next/server";
import {
  countHygieneVisitsToday,
  getAutomationSettings,
} from "@/lib/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const automation = await getAutomationSettings();
  const todayCount = await countHygieneVisitsToday();
  const remainingToday = Math.max(0, automation.maxPerDay - todayCount);

  return NextResponse.json({
    automation,
    todayCount,
    remainingToday,
  });
}
