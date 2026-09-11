import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts, outreachCampaignMembers } from "@/db/schema";
import { generateFollowupDmDraft } from "@/lib/outreachCampaignDraft";
import { updateMemberOutreachStep, updateMemberStatus } from "@/lib/outreachCampaigns";

export async function markCampaignMemberConnected(
  memberId: string,
  opts?: { generateFollowup?: boolean },
): Promise<{ ok: true; drafted: boolean } | { ok: false; error: string }> {
  const db = getDb();
  const member = await db.query.outreachCampaignMembers.findFirst({
    where: eq(outreachCampaignMembers.id, memberId),
  });
  if (!member) return { ok: false, error: "Member not found" };

  const now = new Date();
  await db
    .update(outreachCampaignMembers)
    .set({
      connectionAcceptedAt: now,
      outreachStep: "followup",
      status:
        member.status === "invite_sent" || member.status === "ready"
          ? "draft"
          : member.status,
      updatedAt: now,
    })
    .where(eq(outreachCampaignMembers.id, memberId));

  await db
    .update(contacts)
    .set({ connectionDegree: "1st", lastUpdatedAt: now })
    .where(eq(contacts.id, member.contactId));

  await updateMemberOutreachStep(memberId, "followup");

  let drafted = false;
  if (opts?.generateFollowup !== false) {
    const gen = await generateFollowupDmDraft(memberId);
    drafted = gen.ok;
    if (member.status === "followup_ready") {
      await updateMemberStatus(memberId, "followup_ready");
    }
  }
  return { ok: true, drafted };
}

export async function markCampaignMemberInviteSent(
  memberId: string,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(outreachCampaignMembers)
    .set({
      status: "invite_sent",
      outreachStep: "invite",
      inviteSentAt: now,
      updatedAt: now,
    })
    .where(eq(outreachCampaignMembers.id, memberId));
}
