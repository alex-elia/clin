import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { actionQueue, contacts } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Payload for a future extension side-panel: items you already approved in the dashboard.
 * You still send manually; this is just structured handoff.
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

  const items = rows.map((r) => ({
    queueId: r.action_queue.id,
    contactId: r.contacts.id,
    fullName: r.contacts.fullName,
    linkedinUrl: r.contacts.linkedinUrlCanonical,
    draftOutreach: r.action_queue.draftOutreach,
    suggestedAction: r.action_queue.suggestedAction,
  }));

  return NextResponse.json({
    count: items.length,
    items,
    hint: "Approve drafts in /decisions first. Paste into LinkedIn yourself; Clin does not auto-send.",
  });
}
