import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { generateOutreachDraftForMember } from "@/lib/outreachCampaignDraft";
import {
  addContactsToCampaign,
  findMemberByCampaignAndContact,
  getOutreachCampaign,
} from "@/lib/outreachCampaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  campaignId: z.string().min(1),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: contactId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Expected { campaignId }" },
      { status: 400 },
    );
  }

  const db = getDb();
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
  });
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const campaign = await getOutreachCampaign(parsed.data.campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  let member = await findMemberByCampaignAndContact(
    campaign.id,
    contactId,
  );
  if (!member) {
    await addContactsToCampaign(campaign.id, [contactId]);
    member = await findMemberByCampaignAndContact(campaign.id, contactId);
  }
  if (!member) {
    return NextResponse.json(
      { error: "Could not add contact to campaign." },
      { status: 400 },
    );
  }

  const gen = await generateOutreachDraftForMember(member.id);
  if (!gen.ok) {
    return NextResponse.json(
      { error: gen.error, stage: gen.stage },
      { status: 502 },
    );
  }

  const updated = await findMemberByCampaignAndContact(campaign.id, contactId);
  const draft = updated?.draftOutreach?.trim() ?? "";

  return NextResponse.json({
    ok: true,
    memberId: member.id,
    campaignId: campaign.id,
    campaignName: campaign.name,
    draft,
  });
}
