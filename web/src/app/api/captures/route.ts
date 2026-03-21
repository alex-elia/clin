import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { captureSessions, contacts } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 40) || 40, 100);

  const db = getDb();
  const rows = await db
    .select()
    .from(captureSessions)
    .leftJoin(contacts, eq(captureSessions.contactId, contacts.id))
    .orderBy(desc(captureSessions.capturedAt))
    .limit(limit);

  const items = rows.map((r) => ({
    capture: r.capture_sessions,
    contact: r.contacts,
  }));

  return NextResponse.json({ items });
}
