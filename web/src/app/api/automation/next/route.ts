import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { countContactsNeedingProfileCapture } from "@/lib/enrichment";
import {
  countHygieneVisitsToday,
  getAutomationSettings,
  hygieneBetweenProfileMs,
  pickNextHygieneContact,
} from "@/lib/automation";
import {
  loadLatestProfileCapturesByContactId,
  profileDepthFromLatestJson,
} from "@/lib/campaignMemberReadiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const automation = await getAutomationSettings();
  if (!automation.enabled) {
    return NextResponse.json(
      { error: "Background enrich is off. Turn it on in Clin → Settings." },
      { status: 403 },
    );
  }

  const todayCount = await countHygieneVisitsToday();
  if (todayCount >= automation.maxPerDay) {
    return NextResponse.json({
      done: true,
      reason: "daily_limit",
      automation,
      todayCount,
      maxPerDay: automation.maxPerDay,
      contact: null,
      waitBeforeMs: 0,
    });
  }

  const row = await pickNextHygieneContact();
  const needsProfileCount = await countContactsNeedingProfileCapture();
  if (!row) {
    return NextResponse.json({
      done: true,
      reason: "no_contacts",
      automation,
      todayCount,
      maxPerDay: automation.maxPerDay,
      contact: null,
      waitBeforeMs: 0,
    });
  }

  const url = new URL(req.url);
  const first = url.searchParams.get("first") === "1";
  const waitBeforeMs = first
    ? randomInt(0, 5001)
    : hygieneBetweenProfileMs(automation);

  const caps = await loadLatestProfileCapturesByContactId([row.id]);
  const cap = caps.get(row.id);
  let profileDepth: "missing" | "thin" | "ok" = cap
    ? profileDepthFromLatestJson(cap.extractedJson)
    : "missing";
  if (cap && profileDepth === "missing") profileDepth = "thin";

  return NextResponse.json({
    done: false,
    automation,
    todayCount,
    maxPerDay: automation.maxPerDay,
    remainingToday: Math.max(0, automation.maxPerDay - todayCount),
    needsProfileCount,
    waitBeforeMs,
    purpose: profileDepth === "ok" ? "refresh" : "enrich",
    contact: {
      id: row.id,
      fullName: row.fullName,
      linkedinUrl: row.linkedinUrlCanonical,
      segment: row.segment,
      profileDepth,
    },
  });
}
