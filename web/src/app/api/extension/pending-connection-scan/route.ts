import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts, outreachCampaignMembers } from "@/db/schema";
import {
  getLastConnectionScanAt,
  getOutreachSendSettings,
} from "@/lib/outreachSend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getOutreachSendSettings();
  const db = getDb();
  const pending = await db.query.outreachCampaignMembers.findMany({
    where: eq(outreachCampaignMembers.status, "invite_sent"),
    limit: 80,
  });

  const members = [];
  for (const member of pending) {
    const contact = await db.query.contacts.findFirst({
      where: eq(contacts.id, member.contactId),
    });
    members.push({
      memberId: member.id,
      contactId: member.contactId,
      fullName: contact?.fullName ?? null,
      linkedinUrl: contact?.linkedinUrlCanonical ?? null,
    });
  }

  const lastAt = await getLastConnectionScanAt();
  const intervalMs = settings.connectionScanIntervalMinutes * 60_000;
  const elapsed = lastAt ? Date.now() - lastAt : Infinity;
  const due = members.length > 0 && elapsed >= intervalMs;

  return NextResponse.json({
    due,
    waitMs: due ? 0 : Math.max(0, intervalMs - (elapsed === Infinity ? 0 : elapsed)),
    pendingCount: members.length,
    members,
    sentInvitationsUrl:
      "https://www.linkedin.com/mynetwork/invitation-manager/sent/",
    connectionsUrl:
      "https://www.linkedin.com/mynetwork/invite-connect/connections/",
    intervalMinutes: settings.connectionScanIntervalMinutes,
  });
}
