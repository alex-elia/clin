import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { actionQueue, contacts } from "@/db/schema";
import {
  getActiveOutreachCampaignId,
  getOutreachCampaign,
  listCampaignMembersForExtension,
} from "@/lib/outreachCampaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Extension handoff: (1) approved queue rows from /decisions, (2) active outreach campaign
 * members marked **ready** with a non-empty draft. You paste on LinkedIn yourself.
 */
export async function GET() {
  const db = getDb();
  const rows = await db
    .select()
    .from(actionQueue)
    .innerJoin(contacts, eq(actionQueue.contactId, contacts.id))
    .where(
      and(
        eq(actionQueue.status, "pending"),
        eq(actionQueue.outreachDecision, "approved"),
      ),
    )
    .orderBy(desc(actionQueue.priority), desc(actionQueue.createdAt))
    .limit(50);

  const queueItems = rows.map((r) => ({
    source: "decision_queue" as const,
    queueId: r.action_queue.id,
    contactId: r.contacts.id,
    fullName: r.contacts.fullName,
    linkedinUrl: r.contacts.linkedinUrlCanonical,
    draftOutreach: r.action_queue.draftOutreach,
    suggestedAction: r.action_queue.suggestedAction,
  }));

  const activeId = await getActiveOutreachCampaignId();
  const campaignMeta = activeId ? await getOutreachCampaign(activeId) : null;
  const campaignRows =
    activeId && campaignMeta
      ? await listCampaignMembersForExtension(activeId, 50, { onlyReady: true })
      : [];

  const campaignItems = campaignRows.map((r) => ({
    source: "campaign" as const,
    memberId: r.memberId,
    contactId: r.contactId,
    fullName: r.fullName,
    linkedinUrl: r.linkedinUrl,
    draftOutreach: r.draftOutreach,
    campaignName: campaignMeta?.name,
  }));

  const items = [...campaignItems, ...queueItems];

  return NextResponse.json({
    count: items.length,
    items,
    activeCampaignId: activeId,
    activeCampaignName: campaignMeta?.name ?? null,
    hint: "Campaign: set **Active for extension** on /campaigns/[id], approve each draft as **ready**, then refresh here. Queue: approve in /decisions. Paste into LinkedIn yourself; Clin does not auto-send.",
  });
}
