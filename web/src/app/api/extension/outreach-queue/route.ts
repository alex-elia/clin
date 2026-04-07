import { NextResponse } from "next/server";
import {
  getActiveOutreachCampaignId,
  getOutreachCampaign,
  listCampaignMembersForExtension,
} from "@/lib/outreachCampaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Optional dedicated poll for the active (or specified) campaign — includes drafts
 * still in **draft** status when onlyReady=0 (useful while iterating in the extension).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const campaignIdParam = searchParams.get("campaignId")?.trim();
  const onlyReady = searchParams.get("onlyReady") === "1";
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 30;

  const campaignId =
    campaignIdParam && campaignIdParam.length > 0
      ? campaignIdParam
      : await getActiveOutreachCampaignId();

  if (!campaignId) {
    return NextResponse.json({
      campaign: null,
      items: [],
      hint: "No campaign id and no active campaign. Pick one in Clin → Campaigns → Set active for extension.",
    });
  }

  const campaign = await getOutreachCampaign(campaignId);
  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 },
    );
  }

  const items = await listCampaignMembersForExtension(campaignId, limit, {
    onlyReady,
  });

  return NextResponse.json({
    campaign: { id: campaign.id, name: campaign.name },
    onlyReady,
    count: items.length,
    items,
  });
}
