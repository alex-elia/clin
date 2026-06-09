import { NextResponse } from "next/server";
import {
  countProfileDepths,
  enrichCampaignMembers,
  pickNextProfileCaptureTarget,
} from "@/lib/campaignMemberReadiness";
import {
  getActiveOutreachCampaignId,
  getOutreachCampaign,
  listCampaignMembers,
} from "@/lib/outreachCampaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Extension polls this (no server push). Used to attach `outreachCampaignId` to captures
 * and to show the user which campaign list they are filling.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedCampaignId = url.searchParams.get("campaignId")?.trim() || null;
  const activeExtensionId = await getActiveOutreachCampaignId();
  const effectiveCampaignId = requestedCampaignId;

  const [captureCamp, activeCamp] = await Promise.all([
    effectiveCampaignId ? getOutreachCampaign(effectiveCampaignId) : null,
    activeExtensionId ? getOutreachCampaign(activeExtensionId) : null,
  ]);

  const preview = (t: string) =>
    t.length > 360 ? `${t.slice(0, 360)}…` : t;

  let captureTargetQueue: {
    memberCount: number;
    profileMissing: number;
    profileThin: number;
    profileOk: number;
    nextProfileUrl: string | null;
    nextProfileName: string | null;
  } | null = null;

  if (effectiveCampaignId) {
    const rawMembers = await listCampaignMembers(effectiveCampaignId);
    const enriched = await enrichCampaignMembers(rawMembers);
    const counts = countProfileDepths(enriched);
    const next = pickNextProfileCaptureTarget(enriched);
    captureTargetQueue = {
      memberCount: enriched.length,
      profileMissing: counts.missing,
      profileThin: counts.thin,
      profileOk: counts.ok,
      nextProfileUrl: next?.profileUrl ?? null,
      nextProfileName: next?.fullName ?? null,
    };
  }

  return NextResponse.json({
    captureTargetCampaignId: effectiveCampaignId,
    captureTargetCampaignName: captureCamp?.name ?? null,
    captureContextPreview: captureCamp?.contextText
      ? preview(captureCamp.contextText)
      : null,
    activeExtensionCampaignId: activeExtensionId,
    activeExtensionCampaignName: activeCamp?.name ?? null,
    captureTargetQueue,
  });
}
