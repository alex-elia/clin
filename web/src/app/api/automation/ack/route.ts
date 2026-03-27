import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { ackHygieneVisitSync } from "@/lib/automation";
import { automationAckSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = automationAckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const db = getDb();
  const exists = await db.query.contacts.findFirst({
    where: eq(contacts.id, parsed.data.contactId),
    columns: { id: true },
  });
  if (!exists) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  ackHygieneVisitSync(parsed.data);
  return NextResponse.json({ ok: true });
}
