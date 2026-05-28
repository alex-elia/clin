import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { outreachCampaigns } from "@/db/schema";
import { getCaptureTargetCampaignId } from "@/lib/outreachCampaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const campaigns = await db
    .select({
      id: outreachCampaigns.id,
      name: outreachCampaigns.name,
    })
    .from(outreachCampaigns)
    .orderBy(outreachCampaigns.name);

  const captureTargetCampaignId = await getCaptureTargetCampaignId();

  return NextResponse.json({
    campaigns,
    captureTargetCampaignId,
  });
}
