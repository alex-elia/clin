import { NextResponse } from "next/server";
import { countContactsNeedingProfileCapture } from "@/lib/enrichment";
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

  const needsProfileCount = await countContactsNeedingProfileCapture();

  return NextResponse.json({
    automation,
    todayCount,
    remainingToday,
    needsProfileCount,
  });
}
