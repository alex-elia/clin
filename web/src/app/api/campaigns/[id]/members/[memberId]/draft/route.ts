import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { outreachCampaignMembers } from "@/db/schema";
import { generateOutreachDraftForMember } from "@/lib/outreachCampaignDraft";
import { findMemberById, updateMemberDraft } from "@/lib/outreachCampaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  draft: z.string(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id: campaignId, memberId } = await ctx.params;
  const member = await findMemberById(memberId);
  if (!member || member.campaignId !== campaignId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Expected { draft }" }, { status: 400 });
  }

  const draft = parsed.data.draft.trim();
  await updateMemberDraft(memberId, draft || null);

  const db = getDb();
  const updated = await db.query.outreachCampaignMembers.findFirst({
    where: eq(outreachCampaignMembers.id, memberId),
  });

  return NextResponse.json({
    ok: true,
    draft: updated?.draftOutreach?.trim() ?? "",
  });
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id: campaignId, memberId } = await ctx.params;
  const member = await findMemberById(memberId);
  if (!member || member.campaignId !== campaignId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const result = await generateOutreachDraftForMember(memberId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const db = getDb();
  const updated = await db.query.outreachCampaignMembers.findFirst({
    where: eq(outreachCampaignMembers.id, memberId),
  });

  return NextResponse.json({
    ok: true,
    draft: updated?.draftOutreach?.trim() ?? "",
  });
}
