import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { actionQueue, captureSessions, contacts } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();

  const [contactTotal] = await db.select({ n: count() }).from(contacts);
  const [captureTotal] = await db.select({ n: count() }).from(captureSessions);
  const [pendingQueue] = await db
    .select({ n: count() })
    .from(actionQueue)
    .where(eq(actionQueue.status, "pending"));

  const bySegment = await db
    .select({
      segment: contacts.segment,
      n: count(),
    })
    .from(contacts)
    .groupBy(contacts.segment);

  return NextResponse.json({
    contacts: contactTotal?.n ?? 0,
    captures: captureTotal?.n ?? 0,
    queuePending: pendingQueue?.n ?? 0,
    bySegment,
  });
}
