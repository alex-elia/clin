import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { outreachCampaignMembers } from "@/db/schema";
import { generateOutreachDraftForMember } from "@/lib/outreachCampaignDraft";
import {
  findMemberById,
  updateMemberDraft,
  updateMemberInviteNote,
  updateMemberOutreachStep,
} from "@/lib/outreachCampaigns";
import {
  clampInviteNote,
  isInviteNoteTooLong,
} from "@/lib/outreachInviteWorkflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const patchSchema = z.object({
  draft: z.string(),
  kind: z.enum(["invite", "followup"]).optional(),
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

  const kind =
    parsed.data.kind ??
    (member.outreachStep === "invite" ? "invite" : "followup");
  let draft = parsed.data.draft.trim();
  if (kind === "invite") {
    if (isInviteNoteTooLong(draft)) draft = clampInviteNote(draft);
    await updateMemberInviteNote(memberId, draft || null);
    await updateMemberOutreachStep(memberId, "invite");
  } else {
    await updateMemberDraft(memberId, draft || null);
  }

  const db = getDb();
  const updated = await db.query.outreachCampaignMembers.findFirst({
    where: eq(outreachCampaignMembers.id, memberId),
  });

  return NextResponse.json({
    ok: true,
    draft:
      kind === "invite"
        ? (updated?.draftInviteNote?.trim() ?? "")
        : (updated?.draftOutreach?.trim() ?? ""),
    kind,
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; memberId: string }> },
) {
  const { id: campaignId, memberId } = await ctx.params;
  const member = await findMemberById(memberId);
  if (!member || member.campaignId !== campaignId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  let kind: "invite" | "followup" | undefined;
  try {
    const json = (await req.json()) as { kind?: string };
    if (json.kind === "invite" || json.kind === "followup") kind = json.kind;
  } catch {
    /* empty body is fine */
  }

  const result = await generateOutreachDraftForMember(memberId, { kind });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const db = getDb();
  const updated = await db.query.outreachCampaignMembers.findFirst({
    where: eq(outreachCampaignMembers.id, memberId),
  });
  const resolvedKind =
    kind ?? (updated?.outreachStep === "invite" ? "invite" : "followup");

  return NextResponse.json({
    ok: true,
    draft:
      resolvedKind === "invite"
        ? (updated?.draftInviteNote?.trim() ?? "")
        : (updated?.draftOutreach?.trim() ?? ""),
    kind: resolvedKind,
  });
}
