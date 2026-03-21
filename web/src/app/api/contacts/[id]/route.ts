import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { SCORE_RULE_VERSION, scoreContact } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const patch: Partial<{
    fullName: string;
    headline: string;
    company: string;
    location: string;
    segment: string;
  }> = {};

  if (typeof b.fullName === "string") patch.fullName = b.fullName;
  if (typeof b.headline === "string") patch.headline = b.headline;
  if (typeof b.company === "string") patch.company = b.company;
  if (typeof b.location === "string") patch.location = b.location;
  if (typeof b.segment === "string") patch.segment = b.segment;

  const db = getDb();
  const row = await db.query.contacts.findFirst({ where: eq(contacts.id, id) });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const next = { ...row, ...patch, lastUpdatedAt: new Date() };
  const scores = scoreContact(next);

  await db
    .update(contacts)
    .set({
      ...patch,
      segment: scores.segment,
      relationshipScore: scores.relationshipScore,
      businessScore: scores.businessScore,
      cleanupScore: scores.cleanupScore,
      relationshipReasons: JSON.stringify(scores.relationshipReasons),
      businessReasons: JSON.stringify(scores.businessReasons),
      cleanupReasons: JSON.stringify(scores.cleanupReasons),
      scoreRuleVersion: SCORE_RULE_VERSION,
      lastUpdatedAt: new Date(),
    })
    .where(eq(contacts.id, id));

  const updated = await db.query.contacts.findFirst({
    where: eq(contacts.id, id),
  });

  return NextResponse.json(updated);
}
