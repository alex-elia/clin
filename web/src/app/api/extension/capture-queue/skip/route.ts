import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clearCaptureQueueSkips,
  getCaptureQueueSkipMemberIds,
  skipCaptureQueueMember,
} from "@/lib/captureQueueSkip";
import {
  enrichCampaignMembers,
  pickNextProfileCaptureTarget,
} from "@/lib/campaignMemberReadiness";
import {
  getOutreachCampaign,
  listCampaignMembers,
} from "@/lib/outreachCampaigns";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  campaignId: z.string().min(1),
  memberId: z.string().min(1).optional(),
  clearAll: z.boolean().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Expected { campaignId, memberId? }" }, { status: 400 });
  }

  const { campaignId, memberId, clearAll } = parsed.data;
  const campaign = await getOutreachCampaign(campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (clearAll) {
    await clearCaptureQueueSkips(campaignId);
    return NextResponse.json({ ok: true, cleared: true });
  }

  let targetMemberId = memberId?.trim() || "";
  if (!targetMemberId) {
    const skipIds = await getCaptureQueueSkipMemberIds(campaignId);
    const rawMembers = await listCampaignMembers(campaignId);
    const enriched = await enrichCampaignMembers(rawMembers);
    const next = pickNextProfileCaptureTarget(enriched, {
      skipMemberIds: skipIds,
    });
    if (!next) {
      return NextResponse.json({ error: "Capture queue is empty." }, { status: 404 });
    }
    targetMemberId = next.memberId;
  }

  const result = await skipCaptureQueueMember(campaignId, targetMemberId);
  const skipIds = await getCaptureQueueSkipMemberIds(campaignId);
  const rawMembers = await listCampaignMembers(campaignId);
  const enriched = await enrichCampaignMembers(rawMembers);
  const next = pickNextProfileCaptureTarget(enriched, { skipMemberIds: skipIds });

  return NextResponse.json({
    ok: true,
    skippedMemberId: targetMemberId,
    skippedCount: result.skippedCount,
    nextProfileUrl: next?.profileUrl ?? null,
    nextProfileName: next?.fullName ?? null,
    nextMemberId: next?.memberId ?? null,
  });
}
