import { and, desc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { actionQueue, contacts } from "@/db/schema";
import { shuffledCopy } from "@/lib/shuffle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * shuffle=1 applies local-only random order to the review list (Fisher–Yates).
 * This is not LinkedIn automation or anti-detection.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shuffle = searchParams.get("shuffle") === "1";

  const db = getDb();
  const pending = await db
    .select()
    .from(actionQueue)
    .innerJoin(contacts, eq(actionQueue.contactId, contacts.id))
    .where(
      and(
        eq(actionQueue.status, "pending"),
        ne(actionQueue.outreachDecision, "approved"),
      ),
    )
    .orderBy(desc(actionQueue.priority), desc(actionQueue.createdAt));

  const items = pending.map((r) => ({
    queue: r.action_queue,
    contact: r.contacts,
  }));

  const ordered = shuffle ? shuffledCopy(items) : items;

  return NextResponse.json({
    items: ordered,
    shuffle,
    note: shuffle
      ? "Order randomized locally for variety; does not interact with LinkedIn."
      : undefined,
  });
}
