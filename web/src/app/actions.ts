"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { updatePaceSettings } from "@/lib/pace";
import { SCORE_RULE_VERSION, scoreContact } from "@/lib/scoring";

export async function recomputeAllScores() {
  const db = getDb();
  const all = await db.select().from(contacts);
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
  }
  revalidatePath("/");
  revalidatePath("/contacts");
  revalidatePath("/queue");
}

export async function savePaceForm(formData: FormData) {
  const readInt = (key: string) => {
    const raw = formData.get(key);
    if (typeof raw !== "string" || raw.trim() === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  await updatePaceSettings({
    queueBatchSize: readInt("queueBatchSize"),
    minSecondsBetweenProfileOpens: readInt("minSecondsBetweenProfileOpens"),
    minSecondsBetweenCaptures: readInt("minSecondsBetweenCaptures"),
    captureMaxPerHour: readInt("captureMaxPerHour"),
  });
  revalidatePath("/settings");
  revalidatePath("/queue");
}
