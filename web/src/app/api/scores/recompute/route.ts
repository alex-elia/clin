import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { SCORE_RULE_VERSION, scoreContact } from "@/lib/scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const db = getDb();
  const all = await db.select().from(contacts);
  let updated = 0;

  for (const row of all) {
    const scores = scoreContact(row);
    await db
      .update(contacts)
      .set({
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
      .where(eq(contacts.id, row.id));
    updated += 1;
  }

  return NextResponse.json({ updated, ruleVersion: SCORE_RULE_VERSION });
}
