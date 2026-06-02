import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { outreachCampaignMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runAndPersistMemberIcpCheck } from "@/lib/campaignMemberIcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id: campaignId, memberId } = await ctx.params;
  const db = getDb();
  const member = await db.query.outreachCampaignMembers.findFirst({
    where: eq(outreachCampaignMembers.id, memberId),
  });
  if (!member || member.campaignId !== campaignId) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }
  try {
    const check = await runAndPersistMemberIcpCheck({
      campaignId,
      memberId,
      contactId: member.contactId,
    });
    return NextResponse.json({
      icpMatch: check.icp_match,
      rationale: check.rationale,
      recommendedAction: check.recommended_action,
      checkedAt: check.checkedAt,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ICP check failed." },
      { status: 502 },
    );
  }
}
