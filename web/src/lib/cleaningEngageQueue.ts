import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cleaningExecQueue, contacts } from "@/db/schema";
import {
  actionRequiredGapMs,
  countCleaningExecToday,
  getCleaningExecSettings,
} from "@/lib/cleaningExecSettings";
import { getSqlite } from "@/db";

export type EngageQueueItem = {
  execId: string;
  contactId: string;
  fullName: string | null;
  linkedinUrl: string | null;
  commentAngle: string | null;
  engagementHook: string | null;
  playbook: string | null;
};

export async function getNextEngageItem(): Promise<
  | { item: EngageQueueItem; waitMs: number }
  | { item: null; reason: string; waitMs?: number }
> {
  const settings = await getCleaningExecSettings();
  if (!settings.engageEnabled) {
    return { item: null, reason: "engage_disabled" };
  }

  const doneToday = await countCleaningExecToday("engage", "commented");
  if (doneToday >= settings.maxPerDay) {
    return { item: null, reason: "daily_cap" };
  }

  const waitMs = await actionRequiredGapMs(settings);
  const sqlite = getSqlite();
  const last = sqlite
    .prepare(
      `SELECT completed_at FROM cleaning_exec_queue
       WHERE kind = 'engage' AND completed_at IS NOT NULL
       ORDER BY completed_at DESC LIMIT 1`,
    )
    .get() as { completed_at: number } | undefined;
  if (last?.completed_at) {
    const elapsed = Date.now() - last.completed_at;
    if (elapsed < waitMs) {
      return {
        item: null,
        reason: "pace_wait",
        waitMs: waitMs - elapsed,
      };
    }
  }

  const db = getDb();
  const row = await db.query.cleaningExecQueue.findFirst({
    where: and(
      eq(cleaningExecQueue.kind, "engage"),
      eq(cleaningExecQueue.status, "pending"),
    ),
    orderBy: asc(cleaningExecQueue.createdAt),
  });
  if (!row) return { item: null, reason: "queue_empty" };

  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, row.contactId),
  });
  if (!contact) {
    return { item: null, reason: "contact_missing" };
  }

  const payload = (row.payloadJson ?? {}) as Record<string, unknown>;
  return {
    item: {
      execId: row.id,
      contactId: row.contactId,
      fullName: contact.fullName,
      linkedinUrl: contact.linkedinUrlCanonical,
      commentAngle:
        typeof payload.commentAngle === "string" ? payload.commentAngle : null,
      engagementHook:
        typeof payload.engagementHook === "string"
          ? payload.engagementHook
          : null,
      playbook: typeof payload.playbook === "string" ? payload.playbook : null,
    },
    waitMs: 0,
  };
}
